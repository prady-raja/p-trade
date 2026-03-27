import uuid

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
        # Write scan snapshots — silent, never affects response
        try:
            from app import snapshot_service
            scan_run_id = str(uuid.uuid4())
            for result in results:
                snapshot_service.write_scan_snapshot(result, scan_run_id, payload.date)
        except Exception:
            pass
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
        ai_response = enrich_with_ai(scored)
        # Write scan snapshots with AI fields — silent, never affects response
        try:
            from app import snapshot_service
            scan_run_id = str(uuid.uuid4())
            ai_lookup = {r.ticker: r for r in ai_response.results}
            for result in scored:
                ai_item = ai_lookup.get(result.ticker)
                snapshot_service.write_scan_snapshot(
                    result,
                    scan_run_id,
                    payload.date,
                    ai_available=bool(ai_response.ai_available and ai_item and ai_item.ai_available),
                    ai_bucket=ai_item.ai_bucket if ai_item else None,
                    ai_explanation=ai_item.ai_explanation if ai_item else None,
                    ai_cautions=list(ai_item.cautions) if ai_item else None,
                )
        except Exception:
            pass
        return ai_response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Analysis failed: {exc}')
