from fastapi import APIRouter
from app.models import MarketState
from app.services import store

router = APIRouter(prefix='/market', tags=['market'])


@router.get('/current', response_model=MarketState)
def get_current_market() -> MarketState:
    # Return the current stored state.
    # When regime is 'unset', return it as-is with the honest default note.
    # Real Nifty-backed regime detection is a future roadmap item.
    # The frontend handles 'unset' by showing "UNKNOWN" with a retry option.
    return store.market
