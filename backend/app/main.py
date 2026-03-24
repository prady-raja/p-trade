from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.market import router as market_router
from app.routes.watchlist import router as watchlist_router
from app.routes.scanner import router as scanner_router
from app.routes.analyze import router as analyze_router
from app.routes.trades import router as trades_router
from app.routes.broker import router as broker_router

app = FastAPI(title=settings.app_name)

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