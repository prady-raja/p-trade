"""
scoring_service.py — PTS deterministic scoring engine.

Extracted from services.py. Owns:
  - Math helpers: calculate_ema, calculate_rsi, calculate_volume_ratio, calculate_rs_vs_nifty
  - analyze_ticker_with_kite  — single-ticker full PTS score
  - scan_symbols              — batch scorer, errors isolated per symbol
  - score_shortlist           — maps a WatchlistItem batch through scan_symbols
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .market_service import store
from .models import AnalyzeResult, WatchlistItem


# ---------------------------------------------------------------------------
# Math helpers
# ---------------------------------------------------------------------------

def calculate_ema(closes: List[float], period: int) -> List[float]:
    if len(closes) < period:
        return []
    k = 2.0 / (period + 1)
    result = [sum(closes[:period]) / period]
    for price in closes[period:]:
        result.append(price * k + result[-1] * (1.0 - k))
    return result


def calculate_rsi(closes: List[float], period: int = 14) -> Optional[float]:
    if len(closes) < period + 1:
        return None
    deltas = [closes[i + 1] - closes[i] for i in range(len(closes) - 1)]
    recent = deltas[-period:]
    avg_gain = sum(max(d, 0.0) for d in recent) / period
    avg_loss = sum(abs(min(d, 0.0)) for d in recent) / period
    if avg_loss == 0.0:
        return 100.0
    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def calculate_volume_ratio(volumes: List[int], period: int = 20) -> Optional[float]:
    if len(volumes) < period + 1:
        return None
    avg = sum(volumes[-period - 1:-1]) / period
    if avg == 0:
        return None
    return volumes[-1] / avg


def calculate_rs_vs_nifty(
    ticker_closes: List[float],
    nifty_closes: List[float],
    period: int = 60,
) -> Optional[float]:
    if len(ticker_closes) < period or len(nifty_closes) < period:
        return None
    ticker_perf = (ticker_closes[-1] - ticker_closes[-period]) / ticker_closes[-period]
    nifty_perf = (nifty_closes[-1] - nifty_closes[-period]) / nifty_closes[-period]
    return ticker_perf - nifty_perf


# ---------------------------------------------------------------------------
# Single-ticker PTS score
# ---------------------------------------------------------------------------

def analyze_ticker_with_kite(ticker: str, date: Optional[str] = None) -> 'AnalyzeResult':
    from .kite_client import (
        ensure_connected,
        resolve_instrument_token,
        get_historical_candles,
        get_nifty_instrument_token,
    )
    from .models import ScoreBreakdown

    ensure_connected()

    normalized = ticker.upper().strip()
    to_date = datetime.strptime(date, '%Y-%m-%d') if date else datetime.today()
    from_date = to_date - timedelta(days=400)  # buffer for 200-day EMA + ~57 weekly candles

    instrument_token = resolve_instrument_token(normalized)
    candles = get_historical_candles(instrument_token, from_date, to_date, 'day')

    if len(candles) < 50:
        raise ValueError(
            f'Insufficient data for {normalized}: {len(candles)} candles, need at least 50.'
        )

    closes: List[float] = [float(c['close']) for c in candles]
    volumes: List[int] = [int(c['volume']) for c in candles]
    latest_price = closes[-1]
    latest_volume = volumes[-1]

    ema20_series = calculate_ema(closes, 20)
    ema50_series = calculate_ema(closes, 50)
    ema200_series = calculate_ema(closes, 200) if len(closes) >= 200 else []

    latest_ema20 = ema20_series[-1] if ema20_series else None
    latest_ema50 = ema50_series[-1] if ema50_series else None
    latest_ema200 = ema200_series[-1] if ema200_series else None

    avg_volume = sum(volumes[-21:-1]) / 20 if len(volumes) >= 21 else sum(volumes[:-1]) / max(len(volumes) - 1, 1)
    vol_ratio = calculate_volume_ratio(volumes)
    rsi = calculate_rsi(closes)
    extension_pct = (latest_price - latest_ema20) / latest_ema20 * 100 if latest_ema20 else None

    hard_blockers: List[str] = []
    blockers: List[str] = []
    reasons: List[str] = []

    # -------------------------------------------------------------------------
    # HARD BLOCKERS — evaluated first, override bucket to Reject if any trigger
    # -------------------------------------------------------------------------
    if latest_price < 20:
        hard_blockers.append(
            f'Penny stock — price ₹{latest_price:.2f} is below ₹20 minimum'
        )
    if avg_volume < 200_000:
        hard_blockers.append(
            f'Illiquid — avg daily volume {avg_volume / 1000:.0f}k shares (minimum 200k required)'
        )
    if latest_ema200 is not None and latest_price < latest_ema200:
        hard_blockers.append(
            f'Price ₹{latest_price:.2f} below 200 EMA ₹{latest_ema200:.2f} — structural downtrend, long side blocked'
        )

    # -------------------------------------------------------------------------
    # TREND SCORE (0-30): structure first — 200 EMA > 50 EMA stack > price vs 50
    # -------------------------------------------------------------------------
    trend_score = 0

    if latest_ema200 is not None and latest_price > latest_ema200:
        trend_score += 12
        reasons.append('Price above 200 EMA — structural uptrend')

    if latest_ema50 is not None and latest_ema200 is not None:
        if latest_ema50 > latest_ema200:
            trend_score += 10
            reasons.append('50 EMA above 200 EMA — intermediate structure bullish')
        else:
            blockers.append('50 EMA below 200 EMA — intermediate structure bearish')

    if latest_ema50 is not None:
        if latest_price > latest_ema50:
            trend_score += 8
            reasons.append('Price above 50 EMA — intermediate trend intact')
        else:
            blockers.append('Price below 50 EMA — intermediate trend broken')

    # -------------------------------------------------------------------------
    # STRENGTH SCORE (0-25): RSI momentum + EMA20 short-term confirmation
    # -------------------------------------------------------------------------
    strength_score = 0
    rsi_label = 'unknown'

    if rsi is not None:
        if rsi > 80:
            strength_score += 10   # strong but overbought — partial credit
            rsi_label = 'overbought'
            blockers.append(f'RSI {rsi:.1f} — overbought, elevated entry risk')
        elif rsi > 60:
            strength_score += 20
            rsi_label = 'bullish'
            reasons.append(f'RSI {rsi:.1f} — bullish momentum')
        elif rsi > 50:
            strength_score += 12
            rsi_label = 'neutral_bullish'
            reasons.append(f'RSI {rsi:.1f} — above midline')
        elif rsi > 40:
            strength_score += 4
            rsi_label = 'neutral'
        else:
            rsi_label = 'weak'
            blockers.append(f'RSI {rsi:.1f} — momentum weak')

    # EMA20 as short-term momentum addon (max +5, not structural)
    if latest_ema20 is not None and latest_price > latest_ema20:
        strength_score += 5
        reasons.append('Price above 20 EMA — short-term momentum positive')

    strength_score = min(strength_score, 25)

    # Soft blockers that don't affect score
    if extension_pct is not None and extension_pct > 8:
        blockers.append(
            f'Entry extended {extension_pct:.1f}% above 20 EMA — elevated risk, wait for pullback'
        )
    if 200_000 <= avg_volume < 500_000:
        blockers.append(f'Low liquidity — avg volume {avg_volume / 1000:.0f}k shares/day')

    # -------------------------------------------------------------------------
    # PARTICIPATION SCORE (0-20): today's volume vs 20-day average
    # -------------------------------------------------------------------------
    participation_score = 0
    vol_label = 'unknown'

    if vol_ratio is not None:
        if vol_ratio > 2.0:
            participation_score = 20
            vol_label = 'high'
            reasons.append(f'Volume {vol_ratio:.1f}x average — strong participation')
        elif vol_ratio > 1.5:
            participation_score = 15
            vol_label = 'above_average'
            reasons.append(f'Volume {vol_ratio:.1f}x average')
        elif vol_ratio > 1.0:
            participation_score = 8
            vol_label = 'normal'
        else:
            participation_score = 0
            vol_label = 'low'

    # -------------------------------------------------------------------------
    # RS VS NIFTY SCORE (0-15): 60-day relative performance
    # -------------------------------------------------------------------------
    rs_score = 0
    rs_value: Optional[float] = None
    try:
        nifty_token = get_nifty_instrument_token()
        nifty_candles = get_historical_candles(nifty_token, from_date, to_date, 'day')
        nifty_closes: List[float] = [float(c['close']) for c in nifty_candles]
        rs_value = calculate_rs_vs_nifty(closes, nifty_closes)
        if rs_value is not None:
            if rs_value > 0.05:
                rs_score = 15
                reasons.append(f'Outperforming Nifty by {rs_value * 100:.1f}%')
            elif rs_value > 0.0:
                rs_score = 10
                reasons.append(f'Marginally ahead of Nifty +{rs_value * 100:.1f}%')
            else:
                blockers.append(f'Underperforming Nifty by {abs(rs_value) * 100:.1f}%')
    except Exception:
        pass  # additive check — skip cleanly if Nifty data unavailable

    # -------------------------------------------------------------------------
    # WEEKLY SCORE (0-10): price vs weekly EMA20 (+8) + slope direction (+2)
    # -------------------------------------------------------------------------
    weekly_score = 0
    weekly_ema20_val: Optional[float] = None
    weekly_ema_slope: Optional[str] = None
    try:
        weekly_candles = get_historical_candles(instrument_token, from_date, to_date, 'week')
        if len(weekly_candles) >= 22:
            weekly_closes = [float(c['close']) for c in weekly_candles]
            weekly_ema20_series = calculate_ema(weekly_closes, 20)
            if len(weekly_ema20_series) >= 2:
                w_price = weekly_closes[-1]
                w_ema20_now = weekly_ema20_series[-1]
                w_ema20_prev = weekly_ema20_series[-2]
                weekly_ema20_val = round(w_ema20_now, 2)
                weekly_ema_slope = 'rising' if w_ema20_now > w_ema20_prev else 'falling'

                if w_price > w_ema20_now:
                    weekly_score += 8
                    reasons.append('Weekly price above 20-week EMA — uptrend confirmed')
                else:
                    blockers.append('Weekly price below 20-week EMA — weekly trend not confirmed')

                if weekly_ema_slope == 'rising':
                    weekly_score += 2
                    reasons.append('Weekly 20 EMA rising — trend strength intact')
                else:
                    blockers.append('Weekly 20 EMA declining — trend losing momentum')
    except Exception:
        pass  # confirmation only — skip cleanly if unavailable

    # -------------------------------------------------------------------------
    # FINAL SCORE AND BUCKET
    # Hard blockers override bucket to Reject regardless of score.
    # -------------------------------------------------------------------------
    total_score = trend_score + strength_score + participation_score + rs_score + weekly_score

    if hard_blockers:
        bucket = 'Reject'
        verdict = 'REJECT'
    elif total_score >= 75:
        bucket = 'Trade Today'
        verdict = 'STRONG BUY'
    elif total_score >= 50:
        bucket = 'Watch Tomorrow'
        verdict = 'BUY WATCH'
    elif total_score >= 25:
        bucket = 'Needs Work'
        verdict = 'WAIT'
    else:
        bucket = 'Reject'
        verdict = 'REJECT'

    trigger = (
        f'Above {latest_ema20:.2f} (20 EMA)'
        if latest_ema20 and not hard_blockers and total_score >= 50
        else None
    )
    stop = f'Below {latest_ema50:.2f} (50 EMA)' if latest_ema50 else None
    blocked_tag = ' [HARD BLOCKED]' if hard_blockers else ''
    summary = f'{normalized} scored {total_score}/100. Bucket: {bucket}.{blocked_tag}'

    return AnalyzeResult(
        ticker=normalized,
        verdict=verdict,
        score=total_score,
        bucket=bucket,
        price=round(latest_price, 2),
        hard_blockers=hard_blockers,
        score_breakdown=ScoreBreakdown(
            trend=trend_score,
            strength=strength_score,
            participation=participation_score,
            rs_vs_nifty=rs_score,
            weekly=weekly_score,
        ),
        reasons=reasons,
        blockers=blockers,
        metrics={
            'ema20': round(latest_ema20, 2) if latest_ema20 is not None else None,
            'ema50': round(latest_ema50, 2) if latest_ema50 is not None else None,
            'ema200': round(latest_ema200, 2) if latest_ema200 is not None else None,
            'rsi': round(rsi, 1) if rsi is not None else None,
            'rsi_label': rsi_label,
            'volume': latest_volume,
            'avg_volume': round(avg_volume, 0),
            'volume_ratio': round(vol_ratio, 2) if vol_ratio is not None else None,
            'volume_label': vol_label,
            'rs_vs_nifty_pct': round(rs_value * 100, 2) if rs_value is not None else None,
            'extension_pct': round(extension_pct, 1) if extension_pct is not None else None,
            'weekly_ema20': weekly_ema20_val,
            'weekly_ema_slope': weekly_ema_slope,
        },
        trigger=trigger,
        stop_loss=stop,
        target_1='Nearest resistance',
        target_2='Measured move target',
        risk_reward='1:3.0+' if total_score >= 50 and not hard_blockers else None,
        summary=summary,
    )


# ---------------------------------------------------------------------------
# Batch scanner
# ---------------------------------------------------------------------------

def scan_symbols(symbols: List[str], date: Optional[str] = None) -> List['ScannerResultItem']:
    """
    Score a list of NSE symbols using the deterministic PTS engine.
    Each symbol is attempted independently; failures produce an error row instead
    of aborting the whole scan.  Results are sorted strongest-first, errors last.
    """
    from .models import ScannerResultItem

    results: List[ScannerResultItem] = []
    for raw in symbols:
        symbol = raw.upper().strip()
        if not symbol:
            continue
        try:
            analysis = analyze_ticker_with_kite(symbol, date)
            results.append(ScannerResultItem(
                ticker=analysis.ticker,
                price=analysis.price,
                total_score=analysis.score,
                bucket=analysis.bucket,
                hard_blockers=analysis.hard_blockers,
                score_breakdown=analysis.score_breakdown,
                reasons=analysis.reasons,
                blockers=analysis.blockers,
                metrics=analysis.metrics,
            ))
        except Exception as exc:
            results.append(ScannerResultItem(
                ticker=symbol,
                price=None,
                total_score=0,
                bucket='Error',
                hard_blockers=[],
                score_breakdown=None,
                reasons=[],
                blockers=[],
                metrics=None,
                error=str(exc),
            ))

    # Sort: Trade Today first, then by score desc, errors at the end
    bucket_order = {'Trade Today': 0, 'Watch Tomorrow': 1, 'Needs Work': 2, 'Reject': 3, 'Error': 4}
    results.sort(key=lambda r: (bucket_order.get(r.bucket or 'Error', 4), -r.total_score))
    return results


# ---------------------------------------------------------------------------
# Watchlist-based shortlist scorer
# ---------------------------------------------------------------------------

def score_shortlist(provided_watchlist: Optional[List[WatchlistItem]] = None) -> List[WatchlistItem]:
    """
    Score each item using the real deterministic Kite-backed engine (analyze_ticker_with_kite).
    Preserves the original import metadata (company_name, sector, source, id) from the watchlist item.
    Requires Kite to be connected — raises ValueError if not.
    """
    base_watchlist = provided_watchlist if provided_watchlist else store.watchlist
    if not base_watchlist:
        return []

    tickers = [item.ticker.upper().strip() for item in base_watchlist if item.ticker.strip()]
    # Preserve original import metadata keyed by ticker
    meta: Dict[str, WatchlistItem] = {item.ticker.upper().strip(): item for item in base_watchlist}

    # Real deterministic scoring — one Kite call per ticker
    scan_results = scan_symbols(tickers)

    # Map ScannerResultItem bucket strings → WatchlistItem BucketType literals
    _BUCKET_MAP: Dict[str, str] = {
        'Trade Today': 'trade_today',
        'Watch Tomorrow': 'watch_tomorrow',
    }

    scored: List[WatchlistItem] = []
    for result in scan_results:
        original = meta.get(result.ticker)
        bucket_key = _BUCKET_MAP.get(result.bucket or '', 'reject')

        m = result.metrics or {}
        ema20 = m.get('ema20')

        if result.error:
            trigger_text = None
            summary = f'Analysis failed: {result.error}'
        else:
            hard_tag = ' [HARD BLOCKED]' if result.hard_blockers else ''
            summary = f'{result.ticker} scored {result.total_score}/100. Bucket: {result.bucket or "Reject"}.{hard_tag}'
            trigger_text = (
                f'Above ₹{ema20:.2f} (20 EMA)'
                if ema20 and bucket_key != 'reject'
                else None
            )

        scored.append(WatchlistItem(
            id=original.id if original else str(uuid.uuid4()),
            ticker=result.ticker,
            company_name=original.company_name if original else None,
            sector=original.sector if original else None,
            source=original.source if original else 'csv',
            bucket=bucket_key,  # type: ignore[arg-type]
            score=result.total_score,
            summary=summary,
            trigger=trigger_text,
            stop_loss=None,
            target_1=None,
            target_2=None,
            risk_reward=None,
        ))

    store.watchlist = scored
    return scored
