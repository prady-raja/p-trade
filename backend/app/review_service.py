"""
review_service.py — full trade review card builder.

Extracted from services.py. Owns:
  - build_trade_review: runs the PTS scorer, derives numeric trade levels,
    adds a weekly note, invalidation rule, and an optional AI explanation.

PART B: now passes through the new framework fields (gates, hvs_score,
hvs_breakdown, opt_score, opt_breakdown, verdict, tradeable) into
TradeReviewResult. Entry plans (trigger, stop, targets) are gated on
`tradeable` — non-tradeable setups (AVOID, WAIT) never show entry plans.
"""

from typing import Optional

from .market_service import store
from .scoring_service import analyze_ticker_with_kite


def build_trade_review(ticker: str, date: Optional[str] = None) -> 'TradeReviewResult':
    """
    Full trade review card for one ticker.
    Runs the deterministic scorer, derives numeric trade levels, adds weekly note,
    invalidation rule, and an AI explanation (falls back gracefully if unavailable).
    """
    from .kite_client import resolve_company_name
    from .models import ScannerResultItem, TradeReviewResult

    analysis = analyze_ticker_with_kite(ticker, date)
    m = analysis.metrics or {}

    company_name = resolve_company_name(analysis.ticker)

    # -------------------------------------------------------------------------
    # Numeric trade levels — only computed for tradeable verdicts
    # (BUY WATCH or STRONG BUY). AVOID and WAIT get no entry plans.
    # -------------------------------------------------------------------------
    trigger_price: Optional[float] = None
    stop_price:    Optional[float] = None
    target_1:      Optional[float] = None
    target_2:      Optional[float] = None
    rr:            Optional[float] = None

    ema20 = m.get('ema20')
    ema50 = m.get('ema50')

    if analysis.tradeable and ema20 and ema50:
        trigger_price = round(ema20, 2)
        stop_price    = round(ema50 * 0.99, 2)
        risk          = trigger_price - stop_price
        if risk > 0:
            target_1 = round(trigger_price + 1.5 * risk, 2)
            target_2 = round(trigger_price + 3.0 * risk, 2)
            rr       = round((target_2 - trigger_price) / risk, 1)

    # -------------------------------------------------------------------------
    # Weekly note — plain-English summary of weekly trend
    # -------------------------------------------------------------------------
    weekly_note: Optional[str] = None
    weekly_slope = m.get('weekly_ema_slope')
    weekly_ema20 = m.get('weekly_ema20')
    price        = analysis.price
    if weekly_slope and weekly_ema20 and price is not None:
        slope_str    = 'rising'    if weekly_slope == 'rising' else 'declining'
        position_str = 'above'     if price > weekly_ema20     else 'below'
        weekly_note  = (
            f'Weekly 20 EMA is {slope_str} at ₹{weekly_ema20:.2f}. '
            f'Price is {position_str} weekly trend support.'
        )

    # -------------------------------------------------------------------------
    # Invalidation rule
    # -------------------------------------------------------------------------
    invalidation_rule: Optional[str] = None
    if stop_price:
        invalidation_rule = (
            f'Trade invalid on daily close below ₹{stop_price:.2f} (50 EMA support zone).'
        )
    elif analysis.hard_blockers:
        invalidation_rule = 'Rejected — hard gate failed. Do not trade.'
    elif analysis.verdict == 'WAIT':
        invalidation_rule = 'Setup not yet tradeable — wait for conditions to improve.'

    # -------------------------------------------------------------------------
    # AI explanation — single-item batch, graceful fallback
    # -------------------------------------------------------------------------
    ai_explanation: Optional[str] = None
    ai_bucket_for_snapshot: Optional[str] = None
    ai_cautions_for_snapshot: Optional[list] = None
    ai_available_for_snapshot: bool = False
    try:
        from .ai_layer import enrich_with_ai
        scan_item = ScannerResultItem(
            ticker=analysis.ticker,
            price=analysis.price,
            total_score=analysis.score,
            bucket=analysis.bucket,
            hard_blockers=analysis.hard_blockers,
            score_breakdown=analysis.score_breakdown,
            reasons=analysis.reasons,
            blockers=analysis.blockers,
            metrics=analysis.metrics,
            gates=analysis.gates,
            hvs_score=analysis.hvs_score,
            verdict=analysis.verdict,
            tradeable=analysis.tradeable,
        )
        ai_response = enrich_with_ai([scan_item])
        if ai_response.ai_available and ai_response.results:
            ai_item = ai_response.results[0]
            ai_explanation = ai_item.ai_explanation or None
            ai_bucket_for_snapshot = ai_item.ai_bucket
            ai_cautions_for_snapshot = ai_item.cautions
            ai_available_for_snapshot = True
    except Exception:
        pass

    market_regime = store.market.regime if store.market.regime != 'unset' else None

    result = TradeReviewResult(
        symbol=analysis.ticker,
        company_name=company_name,
        market_regime=market_regime,
        price=analysis.price,
        score_breakdown=analysis.score_breakdown,
        total_score=analysis.score,
        bucket=analysis.bucket,
        hard_blockers=analysis.hard_blockers,
        trigger_price=trigger_price,
        stop_loss=stop_price,
        target_1=target_1,
        target_2=target_2,
        risk_reward=rr,
        weekly_note=weekly_note,
        invalidation_rule=invalidation_rule,
        reasons=analysis.reasons,
        blockers=analysis.blockers,
        metrics=analysis.metrics,
        ai_explanation=ai_explanation,
        # New framework fields
        gates=analysis.gates,
        hvs_score=analysis.hvs_score,
        hvs_breakdown=analysis.hvs_breakdown,
        opt_score=analysis.opt_score,
        opt_breakdown=analysis.opt_breakdown,
        verdict=analysis.verdict,
        tradeable=analysis.tradeable,
    )

    # -------------------------------------------------------------------------
    # Decision snapshot — silent, never surfaces to caller
    # -------------------------------------------------------------------------
    try:
        from . import snapshot_service
        snapshot_id = snapshot_service.write_review_snapshot(
            result,
            analysis_date=date,
            ai_available=ai_available_for_snapshot,
            ai_bucket=ai_bucket_for_snapshot,
            ai_explanation=ai_explanation,
            ai_cautions=ai_cautions_for_snapshot,
        )
        result.snapshot_id = snapshot_id
    except Exception:
        pass

    return result
