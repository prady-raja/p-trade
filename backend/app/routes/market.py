from fastapi import APIRouter
from app import kite_client
from app.models import MarketState
from app.services import store

router = APIRouter(prefix='/market', tags=['market'])


@router.get('/current', response_model=MarketState)
def get_current_market() -> MarketState:
    """
    Returns live Nifty 50 market regime based on EMA50 / EMA200 alignment.
    Requires an active Kite session. On any failure, returns regime='unset'
    with the real error as the note — never a synthetic fallback.

    PTS regime logic:
      price > EMA50 and EMA50 > EMA200  →  green  (bull trend confirmed)
      price < EMA50 or price < EMA200   →  red    (structural downtrend)
      anything else                     →  yellow (mixed / transitional)
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
        store.market = MarketState(
            regime=regime,
            note=f'Nifty \u20b9{price} | EMA50={ema50} | EMA200={ema200}',
        )
    except Exception as exc:
        store.market = MarketState(regime='unset', note=str(exc))
    return store.market
