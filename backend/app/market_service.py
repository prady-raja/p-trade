"""
market_service.py — shared in-memory runtime store.

Owns the singleton InMemoryStore that all other services mutate.
Keeping it in its own module breaks the circular-import chain:
  import_service / scoring_service / review_service / trade_service
  all import `store` from here, never from each other.
"""

from dataclasses import dataclass, field
from typing import List

from .models import MarketState, TradeRecord, WatchlistItem


@dataclass
class InMemoryStore:
    market: MarketState = field(default_factory=MarketState)
    watchlist: List[WatchlistItem] = field(default_factory=list)
    trades: List[TradeRecord] = field(default_factory=list)


# Module-level singleton — imported by every other service module and route.
store = InMemoryStore()
