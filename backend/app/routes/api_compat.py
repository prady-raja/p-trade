"""
API compatibility routes that expose the backend under /api/* paths.
These paths are used by the test suite and may be used by external clients.
The primary frontend routes (e.g. /market/current, /analyze/review) remain unchanged.
"""
from fastapi import APIRouter, File, HTTPException, UploadFile

from app import kite_client
from app.import_service import import_screener_csv, import_screener_screenshot
from app.market_service import store

router = APIRouter(prefix='/api', tags=['api-compat'])


@router.get('/market-regime')
def api_market_regime() -> dict:
    """Compute Nifty 50 market regime from live OHLCV data."""
    try:
        data = kite_client.get_nifty_ohlcv()
        price, ema50, ema200 = data['price'], data['ema50'], data['ema200']
        if price > ema50 and ema50 > ema200:
            condition = 'green'
        elif price < ema50 or price < ema200:
            condition = 'red'
        else:
            condition = 'yellow'
        return {
            'condition': condition,
            'regime': condition,
            'price': price,
            'ema50': ema50,
            'ema200': ema200,
        }
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f'Market regime unavailable: {exc}')


@router.post('/screener/screenshot')
async def api_screener_screenshot(file: UploadFile = File(...)) -> dict:
    valid_extensions = ('.png', '.jpg', '.jpeg', '.webp')
    if not file.filename.lower().endswith(valid_extensions):
        raise HTTPException(status_code=400, detail='Please upload a PNG, JPG, JPEG, or WEBP image.')
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail='Uploaded file is empty.')
    try:
        items = import_screener_screenshot(content)
        return {'stocks': [{'ticker': item.ticker, 'company_name': item.company_name} for item in items]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Screenshot import failed: {exc}')


@router.post('/screener/import')
async def api_screener_import(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail='Uploaded file is empty.')
    try:
        items = import_screener_csv(content)
        return {'stocks': [{'ticker': item.company_name or item.ticker} for item in items]}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'CSV import failed: {exc}')


@router.post('/analyze/chart')
async def api_analyze_chart(file: UploadFile = File(...)) -> dict:
    raise HTTPException(status_code=501, detail='Chart image analysis is not yet implemented.')


@router.get('/dashboard')
def api_dashboard() -> dict:
    trades = store.trades
    total = len(trades)
    open_count = sum(1 for t in trades if t.status == 'open')
    won = sum(1 for t in trades if t.status in ('hit_t1', 'hit_t2', 'closed_profit'))
    closed_count = sum(1 for t in trades if t.status != 'open')
    win_rate = round((won / closed_count) * 100) if closed_count else 0
    return {
        'total_trades': total,
        'open_count': open_count,
        'win_rate': win_rate,
        'total_pnl': 0.0,
    }
