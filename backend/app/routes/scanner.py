from fastapi import APIRouter

from app.models import ScannerRunRequest
from app.services import score_shortlist

router = APIRouter(prefix='/scanner', tags=['scanner'])


@router.post('/run')
def run_scanner(payload: ScannerRunRequest) -> dict:
    items = score_shortlist(payload.watchlist_items)
    return {
        'items': [item.model_dump() for item in items],
        'source': payload.source,
        'refresh': payload.refresh,
    }