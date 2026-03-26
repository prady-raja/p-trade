from fastapi import APIRouter, HTTPException

from app.models import AiScannerResponse, ScannerRunRequest, ScannerScoreRequest, ScannerScoreResponse
from app.scoring_service import score_shortlist, scan_symbols
from app.ai_layer import enrich_with_ai

router = APIRouter(prefix='/scanner', tags=['scanner'])


@router.post('/run')
def run_scanner(payload: ScannerRunRequest) -> dict:
    """Existing watchlist-based shortlist scorer (used by frontend)."""
    items = score_shortlist(payload.watchlist_items)
    return {
        'items': [item.model_dump() for item in items],
        'source': payload.source,
        'refresh': payload.refresh,
    }


@router.post('/score', response_model=ScannerScoreResponse)
def score_symbols_route(payload: ScannerScoreRequest) -> ScannerScoreResponse:
    """Kite-backed deterministic scorer. Accepts a symbols list, returns a ranked shortlist."""
    if not payload.symbols:
        raise HTTPException(status_code=400, detail='symbols list is required and must not be empty.')
    if len(payload.symbols) > 20:
        raise HTTPException(status_code=400, detail='Maximum 20 symbols per scan request.')
    try:
        results = scan_symbols(payload.symbols, payload.date)
        return ScannerScoreResponse(count=len(results), results=results)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Scanner failed: {exc}')


@router.post('/analyze', response_model=AiScannerResponse)
def analyze_with_ai(payload: ScannerScoreRequest) -> AiScannerResponse:
    """
    Deterministic scoring + AI enrichment in one call.
    Returns AI bucket, explanation, cautions, and trigger note per stock.
    Falls back to deterministic-only output if AI is unavailable.
    """
    if not payload.symbols:
        raise HTTPException(status_code=400, detail='symbols list is required.')
    if len(payload.symbols) > 20:
        raise HTTPException(status_code=400, detail='Maximum 20 symbols per request.')
    try:
        scored = scan_symbols(payload.symbols, payload.date)
        return enrich_with_ai(scored)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Analysis failed: {exc}')