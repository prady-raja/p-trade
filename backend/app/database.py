"""
SQLAlchemy persistence layer for P Trade.

DB selection (in priority order):
  DATABASE_URL set  → Postgres (Render / Supabase)
  DATABASE_URL unset → SQLite at DATABASE_PATH (local dev, default: ptrade.db)

init_db() (re)creates the SQLAlchemy engine from the current DB_PATH / DATABASE_URL
module-level variables, so tests can override these before calling init_db() to
redirect to a temp file — the same pattern as Phase 1B.

Public API (identical to Phase 1B):
  init_db()               — (re)create engine + idempotent CREATE TABLE IF NOT EXISTS
  get_db()                — context manager: connect, yield, commit/rollback on exit
  db_insert_trade()       — write a new trade (upsert by primary key)
  db_update_trade()       — update mutable fields on an existing trade
  db_load_all_trades()    — return all rows ordered by created_at DESC
  db_save_market_regime() — upsert the single regime row (only for resolved regimes)
  db_load_market_regime() — return the last persisted regime, or None

PART B additions (schema migration):
  Four new columns added to `trades` table:
    hvs_score    INTEGER  — HVS score (0-34) at time of logging
    opt_score    INTEGER  — OPT score (0-14) at time of logging
    gates_passed TEXT     — JSON array of passed gate names
    gate_failed  TEXT     — name of the failed gate, or NULL if all gates passed

  The columns are added via ALTER TABLE in _migrate_trades_schema(), which is called
  inside init_db(). Both SQLite and Postgres handle the error gracefully if the column
  already exists, so this is safe on every startup.
"""

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Dict, Generator, List, Optional

from sqlalchemy import create_engine, text, Engine
from sqlalchemy.engine import Connection

# ---------------------------------------------------------------------------
# DB: config — read from environment; tests override these module-level vars
#              before calling init_db() to redirect to a temp DB
# ---------------------------------------------------------------------------

DB_PATH: str = os.environ.get('DATABASE_PATH', 'ptrade.db')
DATABASE_URL: Optional[str] = os.environ.get('DATABASE_URL')

# ---------------------------------------------------------------------------
# DB: engine/session — module-level engine; (re)created by every init_db() call
# ---------------------------------------------------------------------------

_engine: Optional[Engine] = None


def _make_engine() -> Engine:
    """
    DB: engine/session
    Create a SQLAlchemy engine from the current DATABASE_URL or DB_PATH.
    """
    url = DATABASE_URL
    if url:
        return create_engine(
            url,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,  # CRITICAL: Supabase drops idle connections
            connect_args={},
        )
    return create_engine(
        f'sqlite:///{DB_PATH}',
        connect_args={'check_same_thread': False},
    )


# ---------------------------------------------------------------------------
# Schema DDL
# ---------------------------------------------------------------------------

_CREATE_TRADES = """
CREATE TABLE IF NOT EXISTS trades (
    id              TEXT PRIMARY KEY,
    ticker          TEXT NOT NULL,
    entry           TEXT,
    stop_loss       TEXT,
    target_1        TEXT,
    target_2        TEXT,
    note            TEXT,
    status          TEXT NOT NULL DEFAULT 'open',
    bucket          TEXT,
    score           INTEGER DEFAULT 0,
    score_breakdown TEXT,
    exit_price      REAL,
    current_price   REAL,
    qty             INTEGER,
    capital         REAL,
    market_regime   TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
)
"""

_CREATE_MARKET_REGIME = """
CREATE TABLE IF NOT EXISTS market_regime (
    id         INTEGER PRIMARY KEY CHECK(id = 1),
    regime     TEXT NOT NULL,
    note       TEXT,
    updated_at TEXT NOT NULL
)
"""

# New columns added in PART B — added via ALTER TABLE in _migrate_trades_schema()
_NEW_TRADE_COLUMNS: List[str] = [
    'ALTER TABLE trades ADD COLUMN hvs_score   INTEGER',
    'ALTER TABLE trades ADD COLUMN opt_score   INTEGER',
    'ALTER TABLE trades ADD COLUMN gates_passed TEXT',
    'ALTER TABLE trades ADD COLUMN gate_failed  TEXT',
    'ALTER TABLE trades ADD COLUMN verdict      TEXT',
]


# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

@contextmanager
def get_db() -> Generator[Connection, None, None]:
    """
    DB: engine/session
    Yields a transactional Connection. engine.begin() commits on clean exit
    and rolls back on exception — no manual commit/rollback needed.
    """
    assert _engine is not None, 'DB engine is not initialised — call init_db() first'
    with _engine.begin() as conn:
        yield conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# DB: config — Schema initialisation
# ---------------------------------------------------------------------------

def _migrate_trades_schema(conn: Connection) -> None:
    """
    Add new columns to the existing trades table if they do not exist yet.
    Errors from duplicate column additions are silently ignored — both SQLite
    and Postgres raise an error when you ADD COLUMN for an existing column.
    """
    for sql in _NEW_TRADE_COLUMNS:
        try:
            conn.execute(text(sql))
        except Exception:
            pass  # Column already exists — safe to ignore


def init_db() -> None:
    """
    DB: config
    (Re)create the SQLAlchemy engine, create all tables, then add any new
    columns introduced since the initial schema creation.

    Safe to call on every startup (CREATE TABLE IF NOT EXISTS + silent ADD COLUMN).
    """
    global _engine
    _engine = _make_engine()
    with _engine.begin() as conn:
        conn.execute(text(_CREATE_TRADES))
        conn.execute(text(_CREATE_MARKET_REGIME))
        _migrate_trades_schema(conn)


# ---------------------------------------------------------------------------
# DB: trade persistence
# ---------------------------------------------------------------------------

def _upsert_trade_sql(dialect_name: str) -> str:
    """DB: trade persistence — dialect-specific upsert SQL (avoids duplicate rows)."""
    if dialect_name == 'postgresql':
        return """
        INSERT INTO trades
            (id, ticker, entry, stop_loss, target_1, target_2, note, status,
             bucket, score, score_breakdown, exit_price, current_price,
             qty, capital, market_regime,
             hvs_score, opt_score, gates_passed, gate_failed, verdict,
             created_at, updated_at)
        VALUES
            (:id, :ticker, :entry, :stop_loss, :target_1, :target_2, :note, :status,
             :bucket, :score, :score_breakdown, :exit_price, :current_price,
             :qty, :capital, :market_regime,
             :hvs_score, :opt_score, :gates_passed, :gate_failed, :verdict,
             :created_at, :updated_at)
        ON CONFLICT (id) DO UPDATE SET
            ticker          = EXCLUDED.ticker,
            entry           = EXCLUDED.entry,
            stop_loss       = EXCLUDED.stop_loss,
            target_1        = EXCLUDED.target_1,
            target_2        = EXCLUDED.target_2,
            note            = EXCLUDED.note,
            status          = EXCLUDED.status,
            bucket          = EXCLUDED.bucket,
            score           = EXCLUDED.score,
            score_breakdown = EXCLUDED.score_breakdown,
            exit_price      = EXCLUDED.exit_price,
            current_price   = EXCLUDED.current_price,
            qty             = EXCLUDED.qty,
            capital         = EXCLUDED.capital,
            market_regime   = EXCLUDED.market_regime,
            hvs_score       = EXCLUDED.hvs_score,
            opt_score       = EXCLUDED.opt_score,
            gates_passed    = EXCLUDED.gates_passed,
            gate_failed     = EXCLUDED.gate_failed,
            verdict         = EXCLUDED.verdict,
            updated_at      = EXCLUDED.updated_at
        """
    # SQLite
    return """
    INSERT OR REPLACE INTO trades
        (id, ticker, entry, stop_loss, target_1, target_2, note, status,
         bucket, score, score_breakdown, exit_price, current_price,
         qty, capital, market_regime,
         hvs_score, opt_score, gates_passed, gate_failed, verdict,
         created_at, updated_at)
    VALUES
        (:id, :ticker, :entry, :stop_loss, :target_1, :target_2, :note, :status,
         :bucket, :score, :score_breakdown, :exit_price, :current_price,
         :qty, :capital, :market_regime,
         :hvs_score, :opt_score, :gates_passed, :gate_failed, :verdict,
         :created_at, :updated_at)
    """


def db_insert_trade(trade: Dict) -> None:
    """DB: trade persistence — persist a new trade (upsert by primary key)."""
    assert _engine is not None
    with get_db() as conn:
        sql = _upsert_trade_sql(_engine.dialect.name)
        # gates_passed is a List[str] in the model — serialise to JSON for storage
        gates_passed_raw = trade.get('gates_passed')
        conn.execute(
            text(sql),
            {
                'id':             trade['id'],
                'ticker':         trade['ticker'],
                'entry':          trade.get('entry'),
                'stop_loss':      trade.get('stop_loss'),
                'target_1':       trade.get('target_1'),
                'target_2':       trade.get('target_2'),
                'note':           trade.get('note'),
                'status':         trade.get('status', 'open'),
                'bucket':         trade.get('bucket'),
                'score':          trade.get('score'),
                'score_breakdown': (
                    json.dumps(trade['score_breakdown'])
                    if trade.get('score_breakdown') else None
                ),
                'exit_price':     trade.get('exit_price'),
                'current_price':  trade.get('current_price'),
                'qty':            trade.get('qty'),
                'capital':        trade.get('capital'),
                'market_regime':  trade.get('market_regime'),
                'hvs_score':      trade.get('hvs_score'),
                'opt_score':      trade.get('opt_score'),
                'gates_passed':   (
                    json.dumps(gates_passed_raw)
                    if isinstance(gates_passed_raw, list) else gates_passed_raw
                ),
                'gate_failed':    trade.get('gate_failed'),
                'verdict':        trade.get('verdict'),
                'created_at':     trade.get('created_at') or _now(),
                'updated_at':     _now(),
            },
        )


def db_update_trade(
    trade_id: str,
    status: Optional[str] = None,
    current_price: Optional[float] = None,
    exit_price: Optional[float] = None,
) -> None:
    """DB: trade persistence — update mutable fields. Only sets columns that are provided."""
    updates: List[str] = []
    params: Dict = {}

    if status is not None:
        updates.append('status = :status')
        params['status'] = status
    if current_price is not None:
        updates.append('current_price = :current_price')
        params['current_price'] = current_price
    if exit_price is not None:
        updates.append('exit_price = :exit_price')
        params['exit_price'] = exit_price
    if not updates:
        return

    updates.append('updated_at = :updated_at')
    params['updated_at'] = _now()
    params['trade_id'] = trade_id

    with get_db() as conn:
        conn.execute(
            text(f"UPDATE trades SET {', '.join(updates)} WHERE id = :trade_id"),
            params,
        )


def db_load_all_trades() -> List[Dict]:
    """DB: trade persistence — return all trades ordered newest-first."""
    with get_db() as conn:
        result = conn.execute(text('SELECT * FROM trades ORDER BY created_at DESC'))
        return [dict(row) for row in result.mappings().all()]


# ---------------------------------------------------------------------------
# DB: market persistence
# ---------------------------------------------------------------------------

def _upsert_regime_sql(dialect_name: str) -> str:
    """DB: market persistence — dialect-specific upsert SQL for singleton row."""
    if dialect_name == 'postgresql':
        return """
        INSERT INTO market_regime (id, regime, note, updated_at)
        VALUES (1, :regime, :note, :updated_at)
        ON CONFLICT (id) DO UPDATE SET
            regime     = EXCLUDED.regime,
            note       = EXCLUDED.note,
            updated_at = EXCLUDED.updated_at
        """
    return """
    INSERT OR REPLACE INTO market_regime (id, regime, note, updated_at)
    VALUES (1, :regime, :note, :updated_at)
    """


def db_save_market_regime(regime: str, note: str) -> None:
    """DB: market persistence — upsert the single market regime snapshot."""
    assert _engine is not None
    with get_db() as conn:
        sql = _upsert_regime_sql(_engine.dialect.name)
        conn.execute(text(sql), {'regime': regime, 'note': note, 'updated_at': _now()})


def db_load_market_regime() -> Optional[Dict]:
    """DB: market persistence — return the persisted regime row, or None if never saved."""
    with get_db() as conn:
        result = conn.execute(text('SELECT * FROM market_regime WHERE id = 1'))
        row = result.mappings().fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Auto-initialise on import
# Ensures engine + tables exist whether or not the caller uses the lifespan.
# init_db() uses CREATE TABLE IF NOT EXISTS so this is always safe.
# ---------------------------------------------------------------------------
try:
    init_db()
except Exception:
    pass  # Surfaces on first actual DB call if the path is truly unusable
