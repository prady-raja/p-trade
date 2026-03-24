import csv
import io
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .models import AnalyzeResult, MarketState, TradeRecord, WatchlistItem


@dataclass
class InMemoryStore:
    market: MarketState = field(default_factory=MarketState)
    watchlist: List[WatchlistItem] = field(default_factory=list)
    trades: List[TradeRecord] = field(default_factory=list)


store = InMemoryStore()

SECTOR_MAP = {
    'POLYCAB': 'Capital Goods',
    'BSE': 'Financials',
    'CAMS': 'Financials',
    'DIXON': 'Consumer Discretionary',
    'PERSISTENT': 'IT',
    'ZOMATO': 'Consumer Discretionary',
    'KEI': 'Capital Goods',
    'APLAPOLLO': 'Metals',
}

CSV_TICKER_KEYS = ['ticker', 'symbol', 'stock', 'tradingsymbol', 'nse code', 'nsecode', 'code']
CSV_NAME_KEYS = ['name', 'company', 'company name', 'company_name', 'stock name']
CSV_SECTOR_KEYS = ['industry', 'sector', 'industry group']


def fake_market_regime() -> MarketState:
    if store.market.regime != 'unset':
      return store.market

    store.market = MarketState(regime='green', note='Bullish regime — longs supported.')
    return store.market


def set_market_regime_for_refresh() -> MarketState:
    cycle = {'unset': 'green', 'green': 'yellow', 'yellow': 'red', 'red': 'green'}
    note_map = {
        'green': 'Bullish regime — longs supported.',
        'yellow': 'Mixed regime — be selective on new entries.',
        'red': 'Bearish regime — longs at higher risk.',
    }
    next_regime = cycle.get(store.market.regime, 'green')
    store.market = MarketState(regime=next_regime, note=note_map[next_regime])
    return store.market


def _pick_value(row: Dict[str, str], options: List[str]) -> Optional[str]:
    lowered = {str(k).strip().lower(): str(v).strip() for k, v in row.items() if v is not None}
    for key in options:
        value = lowered.get(key)
        if value:
            return value
    return None


def _dedupe_watchlist(items: List[WatchlistItem]) -> List[WatchlistItem]:
    seen = set()
    deduped: List[WatchlistItem] = []
    for item in items:
        ticker = item.ticker.strip().upper()
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        deduped.append(item.model_copy(update={'ticker': ticker}))
    return deduped


def import_screener_csv(file_bytes: bytes) -> List[WatchlistItem]:
    text = file_bytes.decode('utf-8', errors='ignore')
    reader = csv.DictReader(io.StringIO(text))
    items: List[WatchlistItem] = []

    for row in reader:
        ticker = _pick_value(row, CSV_TICKER_KEYS)
        if not ticker:
            continue

        ticker = ticker.upper().replace('NSE:', '').strip()
        if not ticker:
            continue

        company_name = _pick_value(row, CSV_NAME_KEYS)
        sector = _pick_value(row, CSV_SECTOR_KEYS) or SECTOR_MAP.get(ticker, 'Unknown')

        items.append(
            WatchlistItem(
                id=str(uuid.uuid4()),
                ticker=ticker,
                company_name=company_name,
                sector=sector,
                source='csv',
                bucket='watch_tomorrow',
                score=0,
                summary='Imported from Screener CSV. Awaiting scoring.',
                trigger='Needs confirmation',
            )
        )

    store.watchlist = _dedupe_watchlist(items)
    return store.watchlist


def import_screener_screenshot(file_bytes: bytes) -> List[WatchlistItem]:
    # Placeholder extraction until real OCR / vision is added.
    demo_rows = [
        ('POLYCAB', 'Polycab India Ltd', 'Capital Goods'),
        ('BSE', 'BSE Ltd', 'Financials'),
        ('CAMS', 'Computer Age Management Services Ltd', 'Financials'),
        ('KEI', 'KEI Industries Ltd', 'Capital Goods'),
        ('ZOMATO', 'Zomato Ltd', 'Consumer Internet'),
    ]

    items = [
        WatchlistItem(
            id=str(uuid.uuid4()),
            ticker=ticker,
            company_name=name,
            sector=sector,
            source='screenshot',
            bucket='watch_tomorrow',
            score=0,
            summary='Extracted from screenshot preview.',
            trigger='Needs confirmation',
        )
        for ticker, name, sector in demo_rows
    ]

    store.watchlist = _dedupe_watchlist(items)
    return store.watchlist


def score_shortlist(provided_watchlist: Optional[List[WatchlistItem]] = None) -> List[WatchlistItem]:
    base_watchlist = provided_watchlist if provided_watchlist else store.watchlist
    if not base_watchlist:
        base_watchlist = [
            WatchlistItem(
                id=str(uuid.uuid4()),
                ticker='POLYCAB',
                company_name='Polycab India Ltd',
                sector='Capital Goods',
                source='csv',
            ),
            WatchlistItem(
                id=str(uuid.uuid4()),
                ticker='BSE',
                company_name='BSE Ltd',
                sector='Financials',
                source='csv',
            ),
        ]

    regime = fake_market_regime().regime
    scored: List[WatchlistItem] = []

    for item in base_watchlist:
        base = random.randint(7, 19)
        if regime == 'green':
            score = min(20, base + 1)
        elif regime == 'red':
            score = max(0, base - 3)
        else:
            score = base

        if score >= 16:
            bucket = 'trade_today'
            summary = 'High-quality candidate after shortlist scoring.'
            trigger = f'Breakout above recent pivot in {item.ticker}'
        elif score >= 11:
            bucket = 'watch_tomorrow'
            summary = 'Decent setup, but needs confirmation.'
            trigger = f'Watch {item.ticker} for confirmation tomorrow'
        else:
            bucket = 'reject'
            summary = 'Weak structure or low priority relative to other names.'
            trigger = None

        scored.append(
            item.model_copy(
                update={
                    'score': score,
                    'bucket': bucket,
                    'summary': summary,
                    'trigger': trigger,
                    'stop_loss': 'Auto from structure',
                    'target_1': 'T1 from resistance',
                    'target_2': 'T2 from measured move',
                    'risk_reward': '1:3.0+',
                }
            )
        )

    scored.sort(key=lambda x: (x.bucket != 'trade_today', x.bucket != 'watch_tomorrow', -x.score))
    store.watchlist = scored
    return scored


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


def analyze_ticker_with_kite(ticker: str, date: Optional[str] = None) -> 'AnalyzeResult':
    from .kite_client import (
        ensure_connected,
        resolve_instrument_token,
        get_historical_candles,
        get_nifty_instrument_token,
    )

    ensure_connected()

    normalized = ticker.upper().strip()
    to_date = datetime.strptime(date, '%Y-%m-%d') if date else datetime.today()
    from_date = to_date - timedelta(days=400)  # buffer for 200-day EMA

    instrument_token = resolve_instrument_token(normalized)
    candles = get_historical_candles(instrument_token, from_date, to_date, 'day')

    if len(candles) < 200:
        raise ValueError(
            f'Insufficient data for {normalized}: {len(candles)} candles returned, need at least 200.'
        )

    closes: List[float] = [float(c['close']) for c in candles]
    volumes: List[int] = [int(c['volume']) for c in candles]

    ema20 = calculate_ema(closes, 20)
    ema50 = calculate_ema(closes, 50)
    ema200 = calculate_ema(closes, 200)

    latest_price = closes[-1]
    latest_ema20 = ema20[-1]
    latest_ema50 = ema50[-1]
    latest_ema200 = ema200[-1]

    score = 0
    checks: List[str] = []

    if latest_price > latest_ema20:
        score += 1
        checks.append('Price > 20 EMA')

    if latest_ema20 > latest_ema50:
        score += 1
        checks.append('20 EMA > 50 EMA')

    if latest_ema50 > latest_ema200:
        score += 1
        checks.append('50 EMA > 200 EMA')

    rsi = calculate_rsi(closes)
    if rsi is not None and rsi > 50.0:
        score += 1
        checks.append(f'RSI {rsi:.1f} > 50')

    vol_ratio = calculate_volume_ratio(volumes)
    if vol_ratio is not None and vol_ratio > 1.5:
        score += 1
        checks.append(f'Vol {vol_ratio:.1f}x 20-day avg')

    try:
        nifty_token = get_nifty_instrument_token()
        nifty_candles = get_historical_candles(nifty_token, from_date, to_date, 'day')
        nifty_closes: List[float] = [float(c['close']) for c in nifty_candles]
        rs = calculate_rs_vs_nifty(closes, nifty_closes)
        if rs is not None and rs > 0.0:
            score += 1
            checks.append(f'RS vs Nifty +{rs * 100:.1f}%')
    except Exception:
        pass  # skip RS check if Nifty data unavailable

    if score >= 5:
        verdict = 'STRONG BUY'
    elif score >= 3:
        verdict = 'BUY WATCH'
    elif score >= 1:
        verdict = 'WAIT'
    else:
        verdict = 'REJECT'

    summary = f'{normalized} scored {score}/6. Checks: {", ".join(checks) or "none"}.'
    trigger = f'Above {latest_ema20:.2f} (20 EMA)' if score >= 3 else None
    stop = f'Below {latest_ema50:.2f} (50 EMA)'

    return AnalyzeResult(
        ticker=normalized,
        verdict=verdict,
        score=score,
        trigger=trigger,
        stop_loss=stop,
        target_1='Nearest resistance',
        target_2='Measured move target',
        risk_reward='1:3.0+' if score >= 3 else None,
        summary=summary,
    )


def analyze_ticker(ticker: str, date: Optional[str] = None) -> AnalyzeResult:
    normalized = ticker.upper().strip()
    seed = sum(ord(c) for c in normalized) % 100
    score = max(8, min(20, 10 + (seed % 9)))

    if score >= 17:
        verdict = 'STRONG BUY'
    elif score >= 13:
        verdict = 'BUY WATCH'
    elif score >= 9:
        verdict = 'WAIT'
    else:
        verdict = 'REJECT'

    return AnalyzeResult(
        ticker=normalized,
        verdict=verdict,
        score=score,
        trigger=f'Breakout above trigger level for {normalized}',
        stop_loss='Structure stop below recent low',
        target_1='Nearest resistance',
        target_2='Measured move target',
        risk_reward='1:3.1',
        summary=f'Starter analysis for {normalized}. Replace with Kite-based logic later. Date={date or "latest"}.',
    )


def create_trade(
    ticker: str,
    entry: Optional[str],
    stop_loss: Optional[str],
    target_1: Optional[str],
    target_2: Optional[str],
    note: Optional[str],
) -> TradeRecord:
    trade = TradeRecord(
        id=str(uuid.uuid4()),
        ticker=ticker.upper().strip(),
        entry=entry,
        stop_loss=stop_loss,
        target_1=target_1,
        target_2=target_2,
        note=note,
        status='open',
    )
    store.trades.insert(0, trade)
    return trade