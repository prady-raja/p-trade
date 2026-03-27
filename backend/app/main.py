import json
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.market import router as market_router
from app.routes.watchlist import router as watchlist_router
from app.routes.scanner import router as scanner_router
from app.routes.analyze import router as analyze_router
from app.routes.trades import router as trades_router
from app.routes.broker import router as broker_router
from app.routes.api_compat import router as api_compat_router


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    """
    Startup: initialise SQLite schema, hydrate in-memory store from DB.
    Shutdown: nothing needed — SQLite writes happen synchronously on each request.
    """
    from app.database import init_db, db_load_all_trades, db_load_market_regime
    from app.models import MarketState, TradeRecord
    from app.market_service import store

    init_db()

    # Hydrate trades — newest-first order preserved
    rows = db_load_all_trades()
    store.trades = [
        TradeRecord(
            id=r['id'],
            ticker=r['ticker'],
            entry=r.get('entry'),
            stop_loss=r.get('stop_loss'),
            target_1=r.get('target_1'),
            target_2=r.get('target_2'),
            note=r.get('note'),
            status=r.get('status', 'open'),
            exit_price=r.get('exit_price'),
            current_price=r.get('current_price'),
            hvs_score=r.get('hvs_score'),
            opt_score=r.get('opt_score'),
            gates_passed=json.loads(r['gates_passed']) if r.get('gates_passed') else None,
            gate_failed=r.get('gate_failed'),
            verdict=r.get('verdict'),
            market_regime=r.get('market_regime'),
            snapshot_id=r.get('snapshot_id'),
        )
        for r in rows
    ]

    # Hydrate last known market regime (only if a real regime was ever saved)
    regime_row = db_load_market_regime()
    if regime_row:
        store.market = MarketState(
            regime=regime_row['regime'],
            note=regime_row.get('note') or '',
        )

    yield  # app runs here


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list(),
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


@app.get('/health')
def health() -> dict:
    return {'ok': True, 'app': settings.app_name, 'env': settings.app_env}


@app.get('/version')
def version() -> dict:
    return {'version': '0.1.0'}


app.include_router(market_router)
app.include_router(watchlist_router)
app.include_router(scanner_router)
app.include_router(analyze_router)
app.include_router(trades_router)
app.include_router(broker_router)
# /api/* aliases — used by test suite and external clients
app.include_router(api_compat_router)
app.include_router(analyze_router, prefix='/api')
app.include_router(trades_router, prefix='/api')
