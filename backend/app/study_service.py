"""
study_service.py — Study session engine for P Trade.

Responsibilities:
  run_study_session(tickers, session_id)  — score each ticker, persist as study_snapshot rows
  fetch_pending_outcomes()                — fetch forward-return prices for eligible snapshots
  compute_study_analytics(snapshots)      — aggregate accuracy / component correlation stats
  get_study_sessions_summary()            — list distinct session IDs with counts
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from .database import (
    db_insert_study_snapshot,
    db_load_pending_outcomes,
    db_load_study_snapshots,
    db_update_study_outcome,
)
from .version import METHODOLOGY_VERSION, SCORING_ENGINE_VERSION


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _outcome_eligible_after(study_date: str) -> str:
    """60 calendar days after study_date (ISO date string YYYY-MM-DD)."""
    d = datetime.strptime(study_date, '%Y-%m-%d')
    return (d + timedelta(days=60)).strftime('%Y-%m-%d')


def _compute_outcome_label(fwd_return_60d: Optional[float]) -> Optional[str]:
    if fwd_return_60d is None:
        return None
    if fwd_return_60d >= 10.0:
        return 'winner'
    if fwd_return_60d <= -5.0:
        return 'loser'
    return 'flat'


# ---------------------------------------------------------------------------
# Pearson correlation — pure Python, no numpy dependency
# ---------------------------------------------------------------------------

def _pearson(xs: List[float], ys: List[float]) -> Optional[float]:
    n = len(xs)
    if n < 3:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    cov = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    std_x = (sum((x - mean_x) ** 2 for x in xs) ** 0.5)
    std_y = (sum((y - mean_y) ** 2 for y in ys) ** 0.5)
    if std_x == 0 or std_y == 0:
        return None
    return round(cov / (std_x * std_y), 3)


# ---------------------------------------------------------------------------
# run_study_session
# ---------------------------------------------------------------------------

def run_study_session(
    tickers: List[str],
    session_id: Optional[str] = None,
    study_date: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Score each ticker using the live scoring engine and persist a study_snapshot row.
    Returns a summary dict with session_id and per-ticker results.
    """
    from .scoring_service import analyze_ticker_with_kite
    from .market_service import store

    sid = session_id or str(uuid.uuid4())
    date_str = study_date or datetime.today().strftime('%Y-%m-%d')
    market_regime = store.market.regime if store.market else None

    results = []
    errors = []

    for ticker in tickers:
        ticker = ticker.upper().strip()
        try:
            result = analyze_ticker_with_kite(ticker, date=date_str)

            gates_json = json.dumps([g.model_dump() for g in result.gates]) if result.gates else None
            hvs_bd_json = json.dumps(result.hvs_breakdown.model_dump()) if result.hvs_breakdown else None
            score_bd_json = json.dumps(result.score_breakdown.model_dump()) if result.score_breakdown else None
            metrics_json = json.dumps(result.metrics) if result.metrics else None
            reasons_json = json.dumps(result.reasons) if result.reasons else None
            blockers_json = json.dumps(result.blockers) if result.blockers else None

            gate_failed = next((g.name for g in result.gates if g.status == 'failed'), None)
            hard_blocked = 1 if bool(result.hard_blockers) else 0
            rs_pct = result.metrics.get('rs_vs_nifty_pct') if result.metrics else None

            snapshot: Dict[str, Any] = {
                'id':                    str(uuid.uuid4()),
                'session_id':            sid,
                'study_date':            date_str,
                'ticker':                ticker,
                'verdict':               result.verdict,
                'hvs_score':             result.hvs_score,
                'hvs_breakdown':         hvs_bd_json,
                'opt_score':             result.opt_score,
                'score_breakdown':       score_bd_json,
                'gates':                 gates_json,
                'hard_blocked':          hard_blocked,
                'gate_failed':           gate_failed,
                'reasons':               reasons_json,
                'blockers':              blockers_json,
                'metrics':               metrics_json,
                'price':                 result.price,
                'rs_vs_nifty_pct':       rs_pct,
                'market_regime':         market_regime,
                'methodology_version':   METHODOLOGY_VERSION,
                'scoring_engine_version': SCORING_ENGINE_VERSION,
                'outcome_fetched':       0,
                'outcome_eligible_after': _outcome_eligible_after(date_str),
                'fwd_return_5d':         None,
                'fwd_return_20d':        None,
                'fwd_return_60d':        None,
                'fwd_price_5d':          None,
                'fwd_price_20d':         None,
                'fwd_price_60d':         None,
                'outcome_label':         None,
                'created_at':            _now_iso(),
            }
            db_insert_study_snapshot(snapshot)
            results.append({
                'ticker':     ticker,
                'verdict':    result.verdict,
                'hvs_score':  result.hvs_score,
                'opt_score':  result.opt_score,
                'hard_blocked': bool(hard_blocked),
                'gate_failed':  gate_failed,
                'snapshot_id': snapshot['id'],
            })
        except Exception as exc:
            errors.append({'ticker': ticker, 'error': str(exc)})

    return {
        'session_id':   sid,
        'study_date':   date_str,
        'total':        len(tickers),
        'scored':       len(results),
        'errors':       len(errors),
        'results':      results,
        'error_details': errors,
    }


# ---------------------------------------------------------------------------
# fetch_pending_outcomes
# ---------------------------------------------------------------------------

def fetch_pending_outcomes() -> Dict[str, Any]:
    """
    For each snapshot whose 60-day window has passed, fetch the forward price
    from Kite historical data and compute forward returns.
    """
    from .kite_client import (
        ensure_connected,
        resolve_instrument_token,
        get_historical_candles,
    )

    pending = db_load_pending_outcomes()
    if not pending:
        return {'fetched': 0, 'errors': 0, 'details': []}

    ensure_connected()

    fetched = 0
    errors = 0
    details = []

    for row in pending:
        ticker = row['ticker']
        study_date_str = row['study_date']
        entry_price = row.get('price')
        snapshot_id = row['id']

        try:
            study_date = datetime.strptime(study_date_str, '%Y-%m-%d')
            d5  = study_date + timedelta(days=7)   # approx 5 trading days
            d20 = study_date + timedelta(days=28)  # approx 20 trading days
            d60 = study_date + timedelta(days=84)  # approx 60 trading days
            end_date = d60 + timedelta(days=5)

            token = resolve_instrument_token(ticker)
            candles = get_historical_candles(token, study_date, end_date, 'day')

            def _find_close(target_date: datetime) -> Optional[float]:
                # Closest candle on or after target_date
                for c in candles:
                    cdate = datetime.strptime(str(c['date'])[:10], '%Y-%m-%d')
                    if cdate >= target_date:
                        return float(c['close'])
                return None

            p5  = _find_close(d5)
            p20 = _find_close(d20)
            p60 = _find_close(d60)

            def _ret(p: Optional[float]) -> Optional[float]:
                if p is None or not entry_price:
                    return None
                return round((p - entry_price) / entry_price * 100, 2)

            fwd_return_60d = _ret(p60)
            outcomes = {
                'fwd_return_5d':  _ret(p5),
                'fwd_return_20d': _ret(p20),
                'fwd_return_60d': fwd_return_60d,
                'fwd_price_5d':   p5,
                'fwd_price_20d':  p20,
                'fwd_price_60d':  p60,
                'outcome_label':  _compute_outcome_label(fwd_return_60d),
            }
            db_update_study_outcome(snapshot_id, outcomes)
            fetched += 1
            details.append({'ticker': ticker, 'snapshot_id': snapshot_id, 'outcome_label': outcomes['outcome_label']})

        except Exception as exc:
            errors += 1
            details.append({'ticker': ticker, 'snapshot_id': snapshot_id, 'error': str(exc)})

    return {'fetched': fetched, 'errors': errors, 'details': details}


# ---------------------------------------------------------------------------
# compute_study_analytics
# ---------------------------------------------------------------------------

def compute_study_analytics() -> Dict[str, Any]:
    """
    Aggregate analytics over all study snapshots that have outcomes.
    Returns accuracy by verdict, component correlations, and session-level stats.
    """
    snapshots = db_load_study_snapshots()
    with_outcomes = [s for s in snapshots if s.get('outcome_fetched') and s.get('outcome_label')]

    total_outcomes = len(with_outcomes)
    if total_outcomes == 0:
        return {
            'total_outcomes': 0,
            'accuracy_by_verdict': {},
            'component_correlation': {},
            'avg_return_by_verdict': {},
        }

    # ── Accuracy by verdict ──
    verdict_buckets: Dict[str, Dict[str, int]] = {}
    for s in with_outcomes:
        v = s.get('verdict') or 'UNKNOWN'
        if v not in verdict_buckets:
            verdict_buckets[v] = {'total': 0, 'winner': 0, 'flat': 0, 'loser': 0}
        verdict_buckets[v]['total'] += 1
        label = s.get('outcome_label', 'flat')
        verdict_buckets[v][label] = verdict_buckets[v].get(label, 0) + 1

    accuracy_by_verdict: Dict[str, Any] = {}
    for verdict, counts in verdict_buckets.items():
        total = counts['total']
        accuracy_by_verdict[verdict] = {
            'total':        total,
            'winner_pct':   round(counts.get('winner', 0) / total * 100, 1),
            'flat_pct':     round(counts.get('flat', 0)   / total * 100, 1),
            'loser_pct':    round(counts.get('loser', 0)  / total * 100, 1),
        }

    # ── Average 60d return by verdict ──
    avg_return_by_verdict: Dict[str, Optional[float]] = {}
    for verdict in verdict_buckets:
        returns = [
            s['fwd_return_60d']
            for s in with_outcomes
            if s.get('verdict') == verdict and s.get('fwd_return_60d') is not None
        ]
        avg_return_by_verdict[verdict] = round(sum(returns) / len(returns), 2) if returns else None

    # ── Component correlation with 60d return ──
    returns_60d = [s['fwd_return_60d'] for s in with_outcomes if s.get('fwd_return_60d') is not None]
    paired = [s for s in with_outcomes if s.get('fwd_return_60d') is not None]

    component_correlation: Dict[str, Optional[float]] = {}

    def _extract_component(snapshots_list: List[Dict], field: str) -> List[float]:
        return [s[field] for s in snapshots_list if s.get(field) is not None]

    # hvs_score correlation
    hvs_vals = [s['hvs_score'] for s in paired if s.get('hvs_score') is not None]
    ret_hvs   = [s['fwd_return_60d'] for s in paired if s.get('hvs_score') is not None]
    component_correlation['hvs_score'] = _pearson(hvs_vals, ret_hvs)

    # opt_score correlation
    opt_vals = [s['opt_score'] for s in paired if s.get('opt_score') is not None]
    ret_opt   = [s['fwd_return_60d'] for s in paired if s.get('opt_score') is not None]
    component_correlation['opt_score'] = _pearson(opt_vals, ret_opt)

    # rs_vs_nifty correlation
    rs_vals  = [s['rs_vs_nifty_pct'] for s in paired if s.get('rs_vs_nifty_pct') is not None]
    ret_rs   = [s['fwd_return_60d']  for s in paired if s.get('rs_vs_nifty_pct') is not None]
    component_correlation['rs_vs_nifty'] = _pearson(rs_vals, ret_rs)

    # HVS sub-components from hvs_breakdown JSON
    for component in ('trend', 'momentum', 'rs_vs_nifty'):
        comp_vals = []
        comp_rets = []
        for s in paired:
            if not s.get('hvs_breakdown') or s.get('fwd_return_60d') is None:
                continue
            try:
                bd = json.loads(s['hvs_breakdown'])
                val = bd.get(component)
                if val is not None:
                    comp_vals.append(float(val))
                    comp_rets.append(s['fwd_return_60d'])
            except Exception:
                pass
        component_correlation[f'hvs_{component}'] = _pearson(comp_vals, comp_rets)

    return {
        'total_outcomes':         total_outcomes,
        'accuracy_by_verdict':    accuracy_by_verdict,
        'avg_return_by_verdict':  avg_return_by_verdict,
        'component_correlation':  component_correlation,
    }


# ---------------------------------------------------------------------------
# get_study_sessions_summary
# ---------------------------------------------------------------------------

def get_study_sessions_summary() -> List[Dict[str, Any]]:
    """Return distinct sessions with ticker count and outcome stats."""
    all_snapshots = db_load_study_snapshots()

    sessions: Dict[str, Dict[str, Any]] = {}
    for s in all_snapshots:
        sid = s['session_id']
        if sid not in sessions:
            sessions[sid] = {
                'session_id':    sid,
                'study_date':    s['study_date'],
                'total':         0,
                'with_outcomes': 0,
                'created_at':    s['created_at'],
            }
        sessions[sid]['total'] += 1
        if s.get('outcome_fetched'):
            sessions[sid]['with_outcomes'] += 1

    return sorted(sessions.values(), key=lambda x: x['created_at'], reverse=True)
