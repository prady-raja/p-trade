"""
review_service.py — full trade review card builder.

Extracted from services.py. Owns:
  - build_trade_review: runs the PTS scorer, derives numeric trade levels,
    adds a weekly note, invalidation rule, and an optional AI explanation.
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
    # Numeric trade levels — only computed for tradeable buckets
    # -------------------------------------------------------------------------
    trigger_price: Optional[float] = None
    stop_price: Optional[float] = None
    target_1: Optional[float] = None
    target_2: Optional[float] = None
    rr: Optional[float] = None

    ema20 = m.get('ema20')
    ema50 = m.get('ema50')

    if not analysis.hard_blockers and analysis.score >= 50 and ema20 and ema50:
        trigger_price = round(ema20, 2)
        stop_price = round(ema50 * 0.99, 2)
        risk = trigger_price - stop_price
        if risk > 0:
            target_1 = round(trigger_price + 1.5 * risk, 2)
            target_2 = round(trigger_price + 3.0 * risk, 2)
            rr = round((target_2 - trigger_price) / risk, 1)

    # -------------------------------------------------------------------------
    # Weekly note — plain-English summary of weekly trend
    # -------------------------------------------------------------------------
    weekly_note: Optional[str] = None
    weekly_slope = m.get('weekly_ema_slope')
    weekly_ema20 = m.get('weekly_ema20')
    price = analysis.price
    if weekly_slope and weekly_ema20 and price is not None:
        slope_str = 'rising' if weekly_slope == 'rising' else 'declining'
        position_str = 'above' if price > weekly_ema20 else 'below'
        weekly_note = (
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
        invalidation_rule = 'Rejected — hard blockers present. Do not trade.'

    # -------------------------------------------------------------------------
    # AI explanation — single-item batch, graceful fallback
    # -------------------------------------------------------------------------
    ai_explanation: Optional[str] = None
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
        )
        ai_response = enrich_with_ai([scan_item])
        if ai_response.ai_available and ai_response.results:
            ai_explanation = ai_response.results[0].ai_explanation or None
    except Exception:
        pass

    market_regime = store.market.regime if store.market.regime != 'unset' else None

    return TradeReviewResult(
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
    )
