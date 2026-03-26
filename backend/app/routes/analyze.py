from fastapi import APIRouter, HTTPException
from app.models import AnalyzeTickerRequest, AnalyzeResult, TradeReviewResult
from app.scoring_service import analyze_ticker_with_kite
from app.review_service import build_trade_review

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


@router.post('/review', response_model=TradeReviewResult)
def review_ticker_route(payload: AnalyzeTickerRequest) -> TradeReviewResult:
    """Full trade review card: numeric levels, weekly note, invalidation rule, AI explanation."""
    if not payload.ticker.strip():
        raise HTTPException(status_code=400, detail='Ticker is required.')
    try:
        return build_trade_review(payload.ticker, payload.date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Review failed: {exc}')
