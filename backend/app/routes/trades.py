from fastapi import APIRouter, HTTPException
from app.models import TradeCreateRequest, TradeUpdateRequest
from app.services import create_trade, store

router = APIRouter(prefix='/trades', tags=['trades'])


@router.post('')
def create_trade_route(payload: TradeCreateRequest) -> dict:
    trade = create_trade(payload.ticker, payload.entry, payload.stop_loss, payload.target_1, payload.target_2, payload.note)
    return trade.model_dump()


@router.get('')
def list_trades() -> dict:
    return {'items': [t.model_dump() for t in store.trades]}


@router.patch('/{trade_id}')
def update_trade_route(trade_id: str, payload: TradeUpdateRequest) -> dict:
    for trade in store.trades:
        if trade.id == trade_id:
            if payload.status is not None:
                trade.status = payload.status
            return trade.model_dump()
    raise HTTPException(status_code=404, detail='Trade not found')
