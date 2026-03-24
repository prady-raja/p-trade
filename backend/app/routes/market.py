from fastapi import APIRouter
from app.models import MarketState
from app.services import set_market_regime_for_refresh, store

router = APIRouter(prefix='/market', tags=['market'])

@router.get('/current', response_model=MarketState)
def get_current_market() -> MarketState:
    if store.market.regime == 'unset':
        return set_market_regime_for_refresh()
    return store.market
