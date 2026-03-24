from fastapi import APIRouter
from app.models import TradeCreateRequest
from app.services import create_trade, store

router = APIRouter(prefix='/trades', tags=['trades'])

@router.post('')
def create_trade_route(payload: TradeCreateRequest) -> dict:
    trade = create_trade(payload.ticker, payload.entry, payload.stop_loss, payload.target_1, payload.target_2, payload.note)
    return trade.model_dump()

@router.get('')
def list_trades() -> dict:
    return {'items': [t.model_dump() for t in store.trades]}
