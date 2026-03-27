"""
trade_service.py — trade creation and in-memory store update.

Extracted from services.py. Owns:
  - create_trade: writes to the SQLAlchemy-backed DB (via database.db_insert_trade)
    AND updates the in-memory store so the running process reflects the new trade
    without requiring a restart.

PART B: create_trade now accepts the new framework fields (hvs_score, opt_score,
gates_passed, gate_failed, verdict) as optional kwargs so they are persisted to
the trades table. All are optional for backward compatibility.
"""

import uuid
from typing import List, Optional

from .database import db_insert_trade
from .market_service import store
from .models import TradeRecord


def create_trade(
    ticker: str,
    entry: Optional[str],
    stop_loss: Optional[str],
    target_1: Optional[str],
    target_2: Optional[str],
    note: Optional[str],
    hvs_score: Optional[int] = None,
    opt_score: Optional[int] = None,
    gates_passed: Optional[List[str]] = None,
    gate_failed: Optional[str] = None,
    verdict: Optional[str] = None,
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
        hvs_score=hvs_score,
        opt_score=opt_score,
        gates_passed=gates_passed,
        gate_failed=gate_failed,
        verdict=verdict,
    )
    # DB: trade persistence — persist to SQLAlchemy-backed store first
    db_insert_trade(trade.model_dump())
    # Keep in-memory list consistent with DB without requiring a restart
    store.trades.insert(0, trade)
    return trade
