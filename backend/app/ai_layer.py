"""
AI enrichment layer for P Trade.

Responsibility:
- Accept a pre-scored ScannerResultItem list from the deterministic engine
- Send a single batch request to Claude using tool_use (schema-enforced JSON)
- Map Claude's output back to AiResultItem objects
- Enforce the no-upgrade rule server-side: AI may only hold or downgrade buckets
- Return a full AiScannerResponse with ai_available=False on any failure

This module must never import from services.py or kite_client.py.
Deterministic scoring is done before this layer is called.
"""

from typing import Any, Dict, List, Optional

from .config import settings
from .models import AiResultItem, AiScannerResponse, ScannerResultItem


# ---------------------------------------------------------------------------
# Bucket ordering — lower number = stronger bucket
# Used to enforce the no-upgrade rule.
# ---------------------------------------------------------------------------
_BUCKET_RANK: Dict[str, int] = {
    'Trade Today': 0,
    'Watch Tomorrow': 1,
    'Needs Work': 2,
    'Reject': 3,
}

_VALID_AI_BUCKETS = {'Trade Today', 'Watch Tomorrow', 'Reject'}


# ---------------------------------------------------------------------------
# System prompt — sent once per API call
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """\
You are a trading analyst for P Trade using the PTS methodology. You receive a shortlist \
of NSE stocks already scored by a deterministic engine. Your role is narrow and specific.

The scoring framework (for your context):
  HARD GATES: binary pass/fail (price ≥ ₹20, avg volume ≥ 200k, price > 200 EMA).
    Any failed gate → verdict is AVOID regardless of score.
  HVS (High Value Score, 0-34): structural quality. Drives the verdict:
    HVS < 18  → AVOID   |  HVS 18-25 → WAIT
    HVS 26-33 → BUY WATCH  |  HVS ≥ 34  → STRONG BUY
  OPT (Optional Score, 0-14): timing and polish only. NEVER changes verdict.

Your job:
1. CONFIRM or DOWNGRADE (by one level only) the deterministic bucket — NEVER upgrade.
   - "Trade Today" (STRONG BUY) may become "Watch Tomorrow" if you see a genuine concern.
   - "Watch Tomorrow" (BUY WATCH / WAIT) may become "Reject" if the setup looks weak.
   - You must NOT move any stock to a stronger bucket than the deterministic result.

2. Write a 1–2 sentence plain-English explanation referencing the verdict level \
(STRONG BUY / BUY WATCH / WAIT / AVOID) and the key reason. Be specific to the data.

3. List up to 2 specific cautions. If none, return an empty list.

4. If trigger context is present, write a clean actionable entry note: \
"Buy above X.XX only if Y holds." For AVOID or WAIT setups, return null — no entry language.

Rules:
- You must NOT modify or invent any score or HVS value.
- For AVOID setups (hard gate failed or HVS < 18): never suggest entry.
- For WAIT setups (HVS 18-25): explain what needs to improve before considering entry.
- Explanations must be ≤ 2 sentences.
- Return results for every ticker provided — no omissions.
"""


# ---------------------------------------------------------------------------
# Tool schema — forces Claude to return structured JSON via tool_use
# ---------------------------------------------------------------------------
_ANALYZE_TOOL: Dict[str, Any] = {
    'name': 'submit_shortlist_analysis',
    'description': 'Submit AI bucket analysis for each stock in the shortlist.',
    'input_schema': {
        'type': 'object',
        'properties': {
            'results': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'ticker': {'type': 'string'},
                        'ai_bucket': {
                            'type': 'string',
                            'enum': ['Trade Today', 'Watch Tomorrow', 'Reject'],
                        },
                        'ai_explanation': {'type': 'string'},
                        'cautions': {
                            'type': 'array',
                            'items': {'type': 'string'},
                        },
                        'trigger_note': {'type': ['string', 'null']},
                    },
                    'required': [
                        'ticker', 'ai_bucket', 'ai_explanation',
                        'cautions', 'trigger_note',
                    ],
                },
            },
        },
        'required': ['results'],
    },
}


# ---------------------------------------------------------------------------
# Prompt builder — compact one-line-per-stock representation
# ---------------------------------------------------------------------------
def _build_candidate_lines(items: List[ScannerResultItem]) -> str:
    lines: List[str] = []
    for item in items:
        if item.error:
            continue  # error rows are not sent to AI

        bd = item.score_breakdown
        m = item.metrics or {}
        parts: List[str] = [
            f'TICKER={item.ticker}',
            f'verdict={item.verdict or item.bucket}',
            f'hvs={item.hvs_score}/34' if item.hvs_score is not None else f'score={item.total_score}/100',
            f'bucket={item.bucket}',
        ]
        if bd:
            parts.append(
                f'breakdown=trend:{bd.trend}+strength:{bd.strength}'
                f'+participation:{bd.participation}+rs:{bd.rs_vs_nifty}+weekly:{bd.weekly}'
            )
        if m.get('rsi') is not None:
            parts.append(f"RSI={m['rsi']}({m.get('rsi_label', '')})")
        if m.get('volume_ratio') is not None:
            parts.append(f"vol={m['volume_ratio']}x")
        if m.get('rs_vs_nifty_pct') is not None:
            sign = '+' if m['rs_vs_nifty_pct'] >= 0 else ''
            parts.append(f"rs_vs_nifty={sign}{m['rs_vs_nifty_pct']}%")
        if m.get('extension_pct') is not None:
            parts.append(f"extension={m['extension_pct']}%_above_ema20")
        if m.get('weekly_ema_slope'):
            parts.append(f"weekly_slope={m['weekly_ema_slope']}")
        if item.hard_blockers:
            parts.append('HARD_BLOCKED=true')
        if item.blockers:
            parts.append(f"blockers=[{'; '.join(item.blockers[:2])}]")
        if item.reasons:
            parts.append(f"reasons=[{'; '.join(item.reasons[:3])}]")

        lines.append(' | '.join(parts))

    return '\n'.join(lines)


# ---------------------------------------------------------------------------
# Fallback constructor — used when AI is unavailable for a given item
# ---------------------------------------------------------------------------
def _make_fallback(item: ScannerResultItem) -> AiResultItem:
    return AiResultItem(
        ticker=item.ticker,
        total_score=item.total_score,
        deterministic_bucket=item.bucket or 'Unknown',
        ai_bucket=item.bucket or 'Unknown',
        ai_explanation='AI analysis unavailable — showing deterministic result.',
        cautions=[],
        trigger_note=None,
        ai_available=False,
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def enrich_with_ai(items: List[ScannerResultItem]) -> AiScannerResponse:
    """
    Takes a scored shortlist and returns AI-enriched results.
    Falls back gracefully if the API key is missing or the call fails.
    """
    if not settings.anthropic_api_key:
        return AiScannerResponse(
            count=len(items),
            ai_available=False,
            results=[_make_fallback(item) for item in items],
        )

    scoreable = [item for item in items if not item.error]
    error_items = [item for item in items if item.error]

    if not scoreable:
        return AiScannerResponse(
            count=len(items),
            ai_available=False,
            results=[_make_fallback(item) for item in items],
        )

    candidate_text = _build_candidate_lines(scoreable)
    user_message = (
        'Here is the deterministic shortlist to analyze:\n\n'
        + candidate_text
        + '\n\nAnalyze each ticker and call submit_shortlist_analysis with your results.'
    )

    try:
        import anthropic  # imported here so the module loads cleanly when SDK is absent

        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            tools=[_ANALYZE_TOOL],
            tool_choice={'type': 'tool', 'name': 'submit_shortlist_analysis'},
            messages=[{'role': 'user', 'content': user_message}],
        )

        tool_block = next(
            (block for block in response.content if block.type == 'tool_use'),
            None,
        )
        if not tool_block:
            raise ValueError('Claude returned no tool_use block.')

        ai_results_raw: List[Dict[str, Any]] = tool_block.input.get('results', [])
        ai_lookup: Dict[str, Dict[str, Any]] = {r['ticker']: r for r in ai_results_raw}

        enriched: List[AiResultItem] = []

        for item in scoreable:
            ai_data = ai_lookup.get(item.ticker)
            if not ai_data:
                enriched.append(_make_fallback(item))
                continue

            det_bucket = item.bucket or 'Reject'
            ai_bucket_raw = ai_data.get('ai_bucket', det_bucket)

            # Enforce no-upgrade: if AI tries to improve the bucket, revert silently
            if _BUCKET_RANK.get(ai_bucket_raw, 3) < _BUCKET_RANK.get(det_bucket, 3):
                ai_bucket_raw = det_bucket

            # Normalise to valid values only
            if ai_bucket_raw not in _VALID_AI_BUCKETS:
                ai_bucket_raw = det_bucket

            enriched.append(AiResultItem(
                ticker=item.ticker,
                total_score=item.total_score,
                deterministic_bucket=det_bucket,
                ai_bucket=ai_bucket_raw,
                ai_explanation=ai_data.get('ai_explanation', '').strip(),
                cautions=ai_data.get('cautions', [])[:2],
                trigger_note=ai_data.get('trigger_note') or None,
                ai_available=True,
            ))

        # Error rows always get fallback entries
        for item in error_items:
            enriched.append(_make_fallback(item))

        # Re-sort by AI bucket then score descending, errors last
        bucket_order = {
            'Trade Today': 0, 'Watch Tomorrow': 1, 'Needs Work': 2,
            'Reject': 3, 'Error': 4, 'Unknown': 5,
        }
        enriched.sort(key=lambda r: (bucket_order.get(r.ai_bucket, 4), -r.total_score))

        return AiScannerResponse(
            count=len(enriched),
            ai_available=True,
            results=enriched,
        )

    except Exception:
        # Full fallback — deterministic data preserved, ai_available=False throughout
        return AiScannerResponse(
            count=len(items),
            ai_available=False,
            results=[_make_fallback(item) for item in items],
        )
