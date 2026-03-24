from fastapi import APIRouter, HTTPException
from app.models import AnalyzeTickerRequest, AnalyzeResult
from app.services import analyze_ticker

router = APIRouter(prefix='/analyze', tags=['analyze'])

@router.post('/ticker', response_model=AnalyzeResult)
def analyze_ticker_route(payload: AnalyzeTickerRequest) -> AnalyzeResult:
    if not payload.ticker.strip():
        raise HTTPException(status_code=400, detail='Ticker is required.')
    return analyze_ticker(payload.ticker, payload.date)
