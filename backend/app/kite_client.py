from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from kiteconnect import KiteConnect

from app.config import settings


@dataclass
class KiteAuthState:
    access_token: Optional[str] = None
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    login_time: Optional[str] = None
    last_error: Optional[str] = None


auth_state = KiteAuthState(
    access_token=settings.kite_access_token,
)


def is_kite_configured() -> bool:
    return bool(
        settings.kite_api_key
        and settings.kite_api_secret
        and settings.kite_redirect_url
    )


def create_kite_client(access_token: Optional[str] = None) -> KiteConnect:
    if not settings.kite_api_key:
        raise ValueError('KITE_API_KEY is missing.')
    kite = KiteConnect(api_key=settings.kite_api_key)
    token = access_token or auth_state.access_token
    if token:
        kite.set_access_token(token)
    return kite


def get_login_url() -> str:
    if not is_kite_configured():
        raise ValueError('Kite is not fully configured on the backend.')
    kite = create_kite_client()
    return kite.login_url()


def exchange_request_token(request_token: str) -> Dict[str, Any]:
    if not is_kite_configured():
        raise ValueError('Kite is not fully configured on the backend.')
    if not request_token:
        raise ValueError('request_token is required.')

    kite = create_kite_client()
    session = kite.generate_session(
        request_token=request_token,
        api_secret=settings.kite_api_secret,
    )

    access_token = session.get('access_token')
    if not access_token:
        raise ValueError('No access_token returned by Kite.')

    auth_state.access_token = access_token
    auth_state.user_id = session.get('user_id')
    auth_state.user_name = session.get('user_name')
    auth_state.login_time = str(session.get('login_time')) if session.get('login_time') else None
    auth_state.last_error = None

    return session


def get_kite_status() -> Dict[str, Any]:
    configured = is_kite_configured()
    connected = bool(auth_state.access_token)

    return {
        'configured': configured,
        'connected': connected,
        'user_id': auth_state.user_id,
        'user_name': auth_state.user_name,
        'login_time': auth_state.login_time,
        'api_key_present': bool(settings.kite_api_key),
        'redirect_url_present': bool(settings.kite_redirect_url),
        'last_error': auth_state.last_error,
    }


def clear_kite_session() -> None:
    auth_state.access_token = None
    auth_state.user_id = None
    auth_state.user_name = None
    auth_state.login_time = None
    auth_state.last_error = None


_instruments_cache: Dict[str, List[Dict[str, Any]]] = {}


def get_instruments(exchange: str = 'NSE') -> List[Dict[str, Any]]:
    ensure_connected()
    if exchange in _instruments_cache:
        return _instruments_cache[exchange]
    kite = create_kite_client()
    instruments = kite.instruments(exchange=exchange)
    _instruments_cache[exchange] = instruments
    return instruments


def resolve_instrument_token(tradingsymbol: str, exchange: str = 'NSE') -> int:
    ensure_connected()
    sym = tradingsymbol.upper().strip()
    for inst in get_instruments(exchange):
        if inst['tradingsymbol'] == sym and inst['exchange'] == exchange:
            return inst['instrument_token']
    raise ValueError(f'Instrument not found: {tradingsymbol} on {exchange}')


def get_historical_candles(
    instrument_token: int,
    from_date: datetime,
    to_date: datetime,
    interval: str = 'day',
) -> List[Dict[str, Any]]:
    ensure_connected()
    kite = create_kite_client()
    return kite.historical_data(instrument_token, from_date, to_date, interval)


def get_nifty_instrument_token() -> int:
    ensure_connected()
    for inst in get_instruments('NSE'):
        if inst['tradingsymbol'] == 'NIFTY 50':
            return inst['instrument_token']
    raise ValueError('NIFTY 50 instrument not found in NSE instruments list.')


def get_profile() -> Dict[str, Any]:
    kite = create_kite_client()
    return kite.profile()


def ensure_connected() -> None:
    if not auth_state.access_token:
        raise ValueError('Kite is not connected yet. Complete the login flow first.')