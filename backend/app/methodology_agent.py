"""
methodology_agent.py — AI-powered methodology review for P Trade.

Uses Claude tool_use to analyse study analytics and propose specific,
schema-enforced changes to the scoring methodology.

Falls back gracefully if the Anthropic API key is absent or the call fails.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from .config import settings
from .database import db_insert_methodology_review, db_load_study_snapshots
from .study_service import compute_study_analytics
from .version import METHODOLOGY_VERSION


# ---------------------------------------------------------------------------
# Tool schema — forces Claude to return structured proposed changes
# ---------------------------------------------------------------------------

_REVIEW_TOOL: Dict[str, Any] = {
    'name': 'submit_methodology_review',
    'description': (
        'Submit a structured review of the PTS scoring methodology with '
        'specific proposed changes based on the provided analytics data.'
    ),
    'input_schema': {
        'type': 'object',
        'properties': {
            'overall_assessment': {
                'type': 'string',
                'description': (
                    '2-3 sentence summary of the methodology\'s current performance '
                    'and the most important finding from the analytics.'
                ),
            },
            'proposed_changes': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'id':          {'type': 'string', 'description': 'Unique short slug e.g. hvs-threshold-raise'},
                        'component':   {'type': 'string', 'description': 'Which part of the system to change (e.g. HVS threshold, OPT weight, liquidity gate)'},
                        'current':     {'type': 'string', 'description': 'Current value or rule'},
                        'proposed':    {'type': 'string', 'description': 'Proposed new value or rule'},
                        'rationale':   {'type': 'string', 'description': '1-2 sentence evidence-based rationale'},
                        'confidence':  {'type': 'string', 'enum': ['high', 'medium', 'low']},
                        'impact':      {'type': 'string', 'enum': ['major', 'minor', 'experimental']},
                        'status':      {'type': 'string', 'enum': ['proposed', 'accepted', 'rejected'], 'description': 'Always proposed on creation'},
                    },
                    'required': ['id', 'component', 'current', 'proposed', 'rationale', 'confidence', 'impact', 'status'],
                },
            },
        },
        'required': ['overall_assessment', 'proposed_changes'],
    },
}


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_SYSTEM_PROMPT = """\
You are a quantitative trading methodology reviewer for P Trade, an NSE positional trading system.

The PTS methodology works as follows:
- Hard Gates (binary pass/fail): min price ₹20, daily traded value ≥ ₹5 Cr, price > 200 EMA
- HVS (High Value Score, 0-34): trend (0-14) + momentum (0-12) + rs_vs_nifty (0-8)
  Verdict: HVS < 18 → AVOID | 18-25 → WAIT | 26-33 → BUY WATCH | ≥ 34 → STRONG BUY
- OPT (Optional Score, 0-14): participation (0-8) + weekly (0-6) — never changes verdict
- Study outcome labels: winner (60d return ≥ 10%) | flat (-5% to +10%) | loser (≤ -5%)

You are given analytics computed from a batch of historical study snapshots with resolved outcomes.

Your job:
1. Analyse whether the current thresholds and weights are producing good outcomes.
2. Look for specific mismatches: e.g. STRONG BUY signals with low winner%, low-correlation components.
3. Propose 2-5 concrete, evidence-based changes. Each change must reference specific numbers from the data.
4. Be conservative: only propose changes supported by the data. Mark speculative ideas as low confidence.
5. Never propose removing all gates or making the system more permissive without evidence.

Format: call submit_methodology_review with your structured analysis.
"""


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def review_methodology(min_outcomes: int = 30) -> Dict[str, Any]:
    """
    Run a methodology review using Claude.

    Steps:
    1. Compute study analytics
    2. If not enough outcomes, return early with a message
    3. Call Claude with analytics as context
    4. Persist and return the review

    Falls back gracefully if Anthropic is unavailable.
    """
    analytics = compute_study_analytics()
    total_outcomes = analytics.get('total_outcomes', 0)

    if total_outcomes < min_outcomes:
        return {
            'ok': False,
            'reason': f'Not enough outcomes yet ({total_outcomes} < {min_outcomes} required). '
                      f'Run more study sessions and fetch outcomes first.',
            'total_outcomes': total_outcomes,
        }

    # ── Build the analytics context for Claude ──
    context_lines = [
        f'Total outcomes: {total_outcomes}',
        '',
        '## Accuracy by verdict',
    ]
    for verdict, stats in analytics.get('accuracy_by_verdict', {}).items():
        context_lines.append(
            f'  {verdict}: {stats["total"]} trades, '
            f'{stats["winner_pct"]}% winner, {stats["flat_pct"]}% flat, {stats["loser_pct"]}% loser'
        )

    context_lines.append('')
    context_lines.append('## Average 60-day return by verdict')
    for verdict, ret in analytics.get('avg_return_by_verdict', {}).items():
        context_lines.append(f'  {verdict}: {ret}%')

    context_lines.append('')
    context_lines.append('## Component correlations with 60-day return')
    for comp, corr in analytics.get('component_correlation', {}).items():
        context_lines.append(f'  {comp}: {corr}')

    analytics_text = '\n'.join(context_lines)
    user_message = (
        'Here is the analytics data from the study session history:\n\n'
        + analytics_text
        + '\n\nAnalyse this data and call submit_methodology_review with your findings and proposed changes.'
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    review_id = str(uuid.uuid4())

    # ── Attempt AI review ──
    if not settings.anthropic_api_key:
        return _fallback_review(review_id, now_iso, total_outcomes, analytics, 'API key not configured')

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=2048,
            system=_SYSTEM_PROMPT,
            tools=[_REVIEW_TOOL],
            tool_choice={'type': 'tool', 'name': 'submit_methodology_review'},
            messages=[{'role': 'user', 'content': user_message}],
        )

        tool_block = next(
            (block for block in response.content if block.type == 'tool_use'),
            None,
        )
        if not tool_block:
            return _fallback_review(review_id, now_iso, total_outcomes, analytics, 'No tool_use block returned')

        result = tool_block.input
        proposed_changes: List[Dict] = result.get('proposed_changes', [])
        overall_assessment: str = result.get('overall_assessment', '')

        # Ensure every change has status = proposed
        for change in proposed_changes:
            change.setdefault('status', 'proposed')

        review_row: Dict[str, Any] = {
            'id':                  review_id,
            'reviewed_at':         now_iso,
            'total_outcomes':      total_outcomes,
            'analytics_snapshot':  json.dumps(analytics),
            'proposed_changes':    json.dumps(proposed_changes),
            'overall_assessment':  overall_assessment,
            'methodology_version': METHODOLOGY_VERSION,
            'created_at':          now_iso,
        }
        db_insert_methodology_review(review_row)

        return {
            'ok':                 True,
            'review_id':          review_id,
            'total_outcomes':     total_outcomes,
            'overall_assessment': overall_assessment,
            'proposed_changes':   proposed_changes,
            'ai_available':       True,
        }

    except Exception as exc:
        return _fallback_review(review_id, now_iso, total_outcomes, analytics, str(exc))


def _fallback_review(
    review_id: str,
    now_iso: str,
    total_outcomes: int,
    analytics: Dict[str, Any],
    reason: str,
) -> Dict[str, Any]:
    """Persist a placeholder review row and return a graceful failure dict."""
    review_row: Dict[str, Any] = {
        'id':                  review_id,
        'reviewed_at':         now_iso,
        'total_outcomes':      total_outcomes,
        'analytics_snapshot':  json.dumps(analytics),
        'proposed_changes':    json.dumps([]),
        'overall_assessment':  f'AI review unavailable: {reason}',
        'methodology_version': METHODOLOGY_VERSION,
        'created_at':          now_iso,
    }
    db_insert_methodology_review(review_row)

    return {
        'ok':                 False,
        'review_id':          review_id,
        'total_outcomes':     total_outcomes,
        'overall_assessment': f'AI review unavailable: {reason}',
        'proposed_changes':   [],
        'ai_available':       False,
        'reason':             reason,
    }
