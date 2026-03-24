from fastapi import APIRouter, HTTPException
from app.models import AnalyzeTickerRequest, AnalyzeResult
from app.services import analyze_ticker_with_kite

router = APIRouter(prefix='/analyze', tags=['analyze'])

@router.post('/ticker', response_model=AnalyzeResult)
def analyze_ticker_route(payload: AnalyzeTickerRequest) -> AnalyzeResult:
    if not payload.ticker.strip():
        raise HTTPException(status_code=400, detail='Ticker is required.')
    try:
        return analyze_ticker_with_kite(payload.ticker, payload.date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Analysis failed: {exc}')
