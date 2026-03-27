from fastapi import APIRouter, HTTPException
from app.database import db_update_trade
from app.models import TradeCreateRequest, TradeUpdateRequest
from app.trade_service import create_trade
from app.market_service import store

router = APIRouter(prefix='/trades', tags=['trades'])


@router.post('')
def create_trade_route(payload: TradeCreateRequest) -> dict:
    trade = create_trade(
        payload.ticker,
        payload.entry,
        payload.stop_loss,
        payload.target_1,
        payload.target_2,
        payload.note,
        hvs_score=payload.hvs_score,
        opt_score=payload.opt_score,
        gates_passed=payload.gates_passed,
        gate_failed=payload.gate_failed,
        verdict=payload.verdict,
    )
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
            if payload.current_price is not None:
                trade.current_price = payload.current_price
            db_update_trade(
                trade_id,
                status=payload.status,
                current_price=payload.current_price,
            )
            return trade.model_dump()
    raise HTTPException(status_code=404, detail='Trade not found')
