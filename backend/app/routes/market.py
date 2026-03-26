from fastapi import APIRouter
from app import kite_client
from app.database import db_save_market_regime
from app.models import MarketState
from app.market_service import store

router = APIRouter(prefix='/market', tags=['market'])


@router.get('/current', response_model=MarketState)
def get_current_market() -> MarketState:
    """
    Returns live Nifty 50 market regime based on EMA50 / EMA200 alignment.
    Requires an active Kite session. On any Kite failure, returns regime='unset'
    with the real error as the note — never a synthetic fallback.

    PTS regime logic:
      price > EMA50 and EMA50 > EMA200  →  green  (bull trend confirmed)
      price < EMA50 or price < EMA200   →  red    (structural downtrend)
      anything else                     →  yellow (mixed / transitional)

    Resolved regimes (green/yellow/red) are persisted to SQLite so the
    last known regime survives a backend restart. DB failure does NOT affect
    the computed regime returned to the caller.
    """
    try:
        data = kite_client.get_nifty_ohlcv()
        price, ema50, ema200 = data['price'], data['ema50'], data['ema200']
        if price > ema50 and ema50 > ema200:
            regime = 'green'
        elif price < ema50 or price < ema200:
            regime = 'red'
        else:
            regime = 'yellow'
        note = f'Nifty \u20b9{price} | EMA50={ema50} | EMA200={ema200}'
        store.market = MarketState(regime=regime, note=note)
    except Exception as exc:
        store.market = MarketState(regime='unset', note=str(exc))
        return store.market

    # Persist in a separate try so DB errors don't corrupt the Kite-computed regime
    try:
        db_save_market_regime(store.market.regime, store.market.note)
    except Exception:
        pass  # Non-critical — regime is correct in memory; retry on next call

    return store.market
