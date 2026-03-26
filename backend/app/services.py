"""
services.py — compatibility shim.

All business logic has been extracted into domain modules:
  - market_service.py   InMemoryStore, store
  - import_service.py   CSV / screenshot import
  - scoring_service.py  PTS math helpers, analyze_ticker_with_kite, scan_symbols, score_shortlist
  - review_service.py   build_trade_review
  - trade_service.py    create_trade

This file re-exports everything so that any existing import of the form
  from app.services import <name>
continues to work without modification.  New code should import directly
from the relevant domain module.
"""

from .market_service import InMemoryStore, store  # noqa: F401
from .import_service import (  # noqa: F401
    SECTOR_MAP,
    CSV_TICKER_KEYS,
    CSV_NAME_KEYS,
    CSV_SECTOR_KEYS,
    import_screener_csv,
    import_screener_screenshot,
)
from .scoring_service import (  # noqa: F401
    calculate_ema,
    calculate_rsi,
    calculate_volume_ratio,
    calculate_rs_vs_nifty,
    analyze_ticker_with_kite,
    scan_symbols,
    score_shortlist,
)
from .review_service import build_trade_review  # noqa: F401
from .trade_service import create_trade  # noqa: F401

__all__ = [
    # store
    'InMemoryStore',
    'store',
    # import
    'SECTOR_MAP',
    'CSV_TICKER_KEYS',
    'CSV_NAME_KEYS',
    'CSV_SECTOR_KEYS',
    'import_screener_csv',
    'import_screener_screenshot',
    # scoring
    'calculate_ema',
    'calculate_rsi',
    'calculate_volume_ratio',
    'calculate_rs_vs_nifty',
    'analyze_ticker_with_kite',
    'scan_symbols',
    'score_shortlist',
    # review
    'build_trade_review',
    # trade
    'create_trade',
]
