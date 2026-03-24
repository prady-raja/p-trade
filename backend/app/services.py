import csv
import io
import random
import uuid
from dataclasses import dataclass, field
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