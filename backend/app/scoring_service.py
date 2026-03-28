"""
scoring_service.py — PTS deterministic scoring engine.

Extracted from services.py. Owns:
  - Math helpers: calculate_ema, calculate_rsi, calculate_volume_ratio, calculate_rs_vs_nifty
  - Framework helpers: _compute_gates, _compute_hvs, _compute_opt, _compute_verdict
  - analyze_ticker_with_kite  — single-ticker full PTS score
  - scan_symbols              — batch scorer, errors isolated per symbol
  - score_shortlist           — maps a WatchlistItem batch through scan_symbols

Scoring methodology (PART B):
  Hard Gates → HVS (0-34) → Verdict → OPT (0-14, never changes verdict)

  Verdict rules (server-side, never overridden by AI):
    Any gate failed           → AVOID
    All gates pass, HVS < 18  → AVOID
    All gates pass, HVS 18-25 → WAIT
    All gates pass, HVS 26-33 → BUY WATCH
    All gates pass, HVS >= 34 → STRONG BUY

  HVS components (max 34):
    trend      (0-30) → 0-14  via × 14/30
    strength   (0-25) → 0-12  via × 12/25
    rs_vs_nifty(0-15) → 0-8   via × 8/15

  OPT components (max 14 — structurally cannot reach the WAIT threshold of 18):
    participation (0-20) → 0-8  via × 8/20
    weekly        (0-10) → 0-6  via × 6/10
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from .market_service import store
from .models import (
    AnalyzeResult,
    GateResult,
    HvsBreakdown,
    OptBreakdown,
    WatchlistItem,
)


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
# Framework helpers: Gates / HVS / OPT / Verdict
# ---------------------------------------------------------------------------

def _compute_gates(
    price: float,
    avg_volume: float,
    ema200: Optional[float],
) -> List[GateResult]:
    """
    Evaluate the three computable hard gates.
    status is one of: passed | failed | unavailable | manual_review_required
    """
    gates: List[GateResult] = [
        GateResult(
            name='price_minimum',
            label='Price ≥ ₹20',
            status='passed' if price >= 20 else 'failed',
            description=(
                f'Penny stock — price ₹{price:.2f} is below ₹20 minimum'
                if price < 20
                else f'Price ₹{price:.2f} — meets ₹20 minimum'
            ),
        ),
        GateResult(
            name='liquidity_minimum',
            label='Daily Value ≥ ₹5 Cr',
            status='passed' if (avg_volume * price) >= 5_00_00_000 else 'failed',
            description=(
                f'Illiquid — avg daily traded value ₹{(avg_volume * price) / 1e7:.1f} Cr (minimum ₹5 Cr required)'
                if (avg_volume * price) < 5_00_00_000
                else f'Avg daily traded value ₹{(avg_volume * price) / 1e7:.1f} Cr — meets liquidity minimum'
            ),
        ),
    ]

    if ema200 is not None:
        gates.append(GateResult(
            name='above_200ema',
            label='Price > 200 EMA',
            status='passed' if price > ema200 else 'failed',
            description=(
                f'Price ₹{price:.2f} below 200 EMA ₹{ema200:.2f} — structural downtrend, long side blocked'
                if price <= ema200
                else f'Price ₹{price:.2f} above 200 EMA ₹{ema200:.2f} — structural uptrend'
            ),
        ))
    else:
        gates.append(GateResult(
            name='above_200ema',
            label='Price > 200 EMA',
            status='unavailable',
            description='Insufficient data for 200-day EMA (need ≥200 daily candles)',
        ))

    return gates


def _compute_hvs(
    trend_score: int,
    strength_score: int,
    rs_score: int,
) -> Tuple[int, HvsBreakdown]:
    """
    HVS = High Value Score (0-34).

    Scales the three core deterministic components:
      trend      (0-30) → 0-14
      strength   (0-25) → 0-12
      rs_vs_nifty(0-15) → 0-8
    Max total = 34, which is exactly the STRONG BUY threshold.
    """
    trend_hvs    = round(trend_score    * 14 / 30)
    momentum_hvs = round(strength_score * 12 / 25)
    rs_hvs       = round(rs_score       *  8 / 15)
    total = min(trend_hvs + momentum_hvs + rs_hvs, 34)
    return total, HvsBreakdown(
        trend=trend_hvs,
        momentum=momentum_hvs,
        rs_vs_nifty=rs_hvs,
        total=total,
    )


def _compute_opt(
    participation_score: int,
    weekly_score: int,
) -> Tuple[int, OptBreakdown]:
    """
    OPT = Optional Score (0-14).

    Timing and polish signals only. Structurally cannot reach 18
    (the WAIT verdict threshold), so OPT can NEVER change the verdict.

      participation (0-20) → 0-8
      weekly        (0-10) → 0-6
    """
    p_opt = round(participation_score * 8 / 20)
    w_opt = round(weekly_score        * 6 / 10)
    total = p_opt + w_opt
    return total, OptBreakdown(participation=p_opt, weekly=w_opt, total=total)


def _compute_verdict(gates: List[GateResult], hvs: int) -> str:
    """
    Server-side verdict computation. Authoritative — AI output never overrides this.

    Any failed gate → AVOID, regardless of HVS.
    No failed gates:
      HVS < 18  → AVOID
      HVS 18-25 → WAIT
      HVS 26-33 → BUY WATCH
      HVS >= 34 → STRONG BUY
    """
    if any(g.status == 'failed' for g in gates):
        return 'AVOID'
    if hvs < 18:
        return 'AVOID'
    if hvs < 26:
        return 'WAIT'
    if hvs < 34:
        return 'BUY WATCH'
    return 'STRONG BUY'


def _verdict_to_bucket(verdict: str) -> str:
    """Map new verdict strings to legacy bucket strings for backward compat."""
    if verdict == 'STRONG BUY':
        return 'Trade Today'
    if verdict in ('BUY WATCH', 'WAIT'):
        return 'Watch Tomorrow'
    return 'Reject'


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
    volumes: List[int]  = [int(c['volume']) for c in candles]
    latest_price  = closes[-1]
    latest_volume = volumes[-1]

    ema20_series  = calculate_ema(closes, 20)
    ema50_series  = calculate_ema(closes, 50)
    ema200_series = calculate_ema(closes, 200) if len(closes) >= 200 else []

    latest_ema20  = ema20_series[-1]  if ema20_series  else None
    latest_ema50  = ema50_series[-1]  if ema50_series  else None
    latest_ema200 = ema200_series[-1] if ema200_series else None

    avg_volume = (
        sum(volumes[-21:-1]) / 20
        if len(volumes) >= 21
        else sum(volumes[:-1]) / max(len(volumes) - 1, 1)
    )
    vol_ratio      = calculate_volume_ratio(volumes)
    rsi            = calculate_rsi(closes)
    extension_pct  = (
        (latest_price - latest_ema20) / latest_ema20 * 100
        if latest_ema20 else None
    )

    blockers: List[str] = []
    reasons:  List[str] = []

    # -------------------------------------------------------------------------
    # HARD GATES — evaluated first, drive verdict via _compute_verdict()
    # -------------------------------------------------------------------------
    gates = _compute_gates(latest_price, avg_volume, latest_ema200)

    # Keep hard_blockers list for backward compat (human-readable descriptions)
    hard_blockers: List[str] = [g.description for g in gates if g.status == 'failed']

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
        blockers.append(f'Low liquidity — avg volume {avg_volume / 1_000:.0f}k shares/day')

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
        nifty_token   = get_nifty_instrument_token()
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
    weekly_ema20_val: Optional[float]  = None
    weekly_ema_slope: Optional[str]    = None
    try:
        weekly_candles = get_historical_candles(instrument_token, from_date, to_date, 'week')
        if len(weekly_candles) >= 22:
            weekly_closes = [float(c['close']) for c in weekly_candles]
            weekly_ema20_series = calculate_ema(weekly_closes, 20)
            if len(weekly_ema20_series) >= 2:
                w_price     = weekly_closes[-1]
                w_ema20_now  = weekly_ema20_series[-1]
                w_ema20_prev = weekly_ema20_series[-2]
                weekly_ema20_val  = round(w_ema20_now, 2)
                weekly_ema_slope  = 'rising' if w_ema20_now > w_ema20_prev else 'falling'

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
    # FRAMEWORK: HVS / OPT / Verdict
    # -------------------------------------------------------------------------
    total_score = trend_score + strength_score + participation_score + rs_score + weekly_score

    hvs_total, hvs_bd = _compute_hvs(trend_score, strength_score, rs_score)
    opt_total, opt_bd = _compute_opt(participation_score, weekly_score)
    new_verdict        = _compute_verdict(gates, hvs_total)
    is_tradeable       = new_verdict in ('BUY WATCH', 'STRONG BUY')

    # Map verdict → bucket string (backward compat)
    bucket = _verdict_to_bucket(new_verdict)

    # -------------------------------------------------------------------------
    # Trade level hints (summary only — numeric levels computed in review_service)
    # -------------------------------------------------------------------------
    trigger = (
        f'Above ₹{latest_ema20:.2f} (20 EMA)'
        if latest_ema20 and is_tradeable
        else None
    )
    stop    = f'Below ₹{latest_ema50:.2f} (50 EMA)' if latest_ema50 else None
    blocked_tag = ' [HARD BLOCKED]' if hard_blockers else ''
    summary = f'{normalized} — {new_verdict}. HVS {hvs_total}/34.{blocked_tag}'

    return AnalyzeResult(
        ticker=normalized,
        verdict=new_verdict,
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
            'ema20':           round(latest_ema20, 2)  if latest_ema20  is not None else None,
            'ema50':           round(latest_ema50, 2)  if latest_ema50  is not None else None,
            'ema200':          round(latest_ema200, 2) if latest_ema200 is not None else None,
            'rsi':             round(rsi, 1)            if rsi           is not None else None,
            'rsi_label':       rsi_label,
            'volume':          latest_volume,
            'avg_volume':      round(avg_volume, 0),
            'volume_ratio':    round(vol_ratio, 2)      if vol_ratio     is not None else None,
            'volume_label':    vol_label,
            'rs_vs_nifty_pct': round(rs_value * 100, 2) if rs_value     is not None else None,
            'extension_pct':   round(extension_pct, 1) if extension_pct is not None else None,
            'weekly_ema20':    weekly_ema20_val,
            'weekly_ema_slope': weekly_ema_slope,
        },
        trigger=trigger,
        stop_loss=stop,
        target_1='Nearest resistance',
        target_2='Measured move target',
        risk_reward='1:3.0+' if is_tradeable else None,
        summary=summary,
        # New framework fields
        gates=gates,
        hvs_score=hvs_total,
        hvs_breakdown=hvs_bd,
        opt_score=opt_total,
        opt_breakdown=opt_bd,
        tradeable=is_tradeable,
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
                gates=analysis.gates,
                hvs_score=analysis.hvs_score,
                verdict=analysis.verdict,
                tradeable=analysis.tradeable,
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
                gates=[],
                hvs_score=None,
                verdict=None,
                tradeable=False,
                error=str(exc),
            ))

    # Sort: STRONG BUY first, then by HVS desc, errors at end
    verdict_order = {'STRONG BUY': 0, 'BUY WATCH': 1, 'WAIT': 2, 'AVOID': 3, None: 4}
    bucket_order  = {'Trade Today': 0, 'Watch Tomorrow': 1, 'Needs Work': 2, 'Reject': 3, 'Error': 4}
    results.sort(key=lambda r: (
        verdict_order.get(r.verdict, 4),
        bucket_order.get(r.bucket or 'Error', 4),
        -(r.hvs_score or 0),
    ))
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
    meta: Dict[str, WatchlistItem] = {
        item.ticker.upper().strip(): item for item in base_watchlist
    }

    scan_results = scan_symbols(tickers)

    # Verdict → WatchlistItem BucketType
    _VERDICT_BUCKET: Dict[str, str] = {
        'STRONG BUY': 'trade_today',
        'BUY WATCH':  'watch_tomorrow',
        'WAIT':       'watch_tomorrow',
        'AVOID':      'reject',
    }

    scored: List[WatchlistItem] = []
    for result in scan_results:
        original   = meta.get(result.ticker)
        bucket_key = _VERDICT_BUCKET.get(result.verdict or '', 'reject')

        m     = result.metrics or {}
        ema20 = m.get('ema20')

        if result.error:
            trigger_text = None
            summary = f'Analysis failed: {result.error}'
        else:
            hard_tag = ' [HARD BLOCKED]' if result.hard_blockers else ''
            verdict_str = result.verdict or 'AVOID'
            summary = (
                f'{result.ticker} — {verdict_str}. '
                f'HVS {result.hvs_score}/34.{hard_tag}'
            )
            trigger_text = (
                f'Above ₹{ema20:.2f} (20 EMA)'
                if ema20 and result.tradeable
                else None
            )

        scored.append(WatchlistItem(
            id=original.id if original else str(uuid.uuid4()),
            ticker=result.ticker,
            company_name=original.company_name if original else None,
            sector=original.sector if original else None,
            source=original.source if original else 'csv',
            bucket=bucket_key,       # type: ignore[arg-type]
            score=result.total_score,
            summary=summary,
            trigger=trigger_text,
            stop_loss=None,
            target_1=None,
            target_2=None,
            risk_reward=None,
            hvs_score=result.hvs_score,
            verdict=result.verdict,
        ))

    store.watchlist = scored
    return scored
