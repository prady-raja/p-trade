from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse

from app.config import settings
from app.kite_client import (
    clear_kite_session,
    exchange_request_token,
    get_kite_status,
    get_login_url,
    is_kite_configured,
)

router = APIRouter(prefix='/broker/kite', tags=['broker-kite'])


@router.get('/login-url')
def kite_login_url() -> Dict[str, Any]:
    if not is_kite_configured():
        raise HTTPException(
            status_code=503,
            detail='Kite is not configured. Set KITE_API_KEY, KITE_API_SECRET, and KITE_REDIRECT_URL.',
        )
    try:
        return {'url': get_login_url()}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get('/status')
def kite_status() -> Dict[str, Any]:
    raw = get_kite_status()
    if not raw['connected']:
        return {'connected': False, 'error': 'Kite is not connected.'}
    return {
        'connected': True,
        'user_id': raw.get('user_id'),
        'user_name': raw.get('user_name'),
        'login_time': raw.get('login_time'),
    }


@router.get('/callback')
def kite_callback(
    request_token: Optional[str] = Query(default=None),
    action: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
):
    if error:
        raise HTTPException(status_code=400, detail='Kite login failed or was cancelled.')

    if not request_token:
        raise HTTPException(status_code=400, detail='Missing request_token in Kite callback.')

    try:
        session = exchange_request_token(request_token)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if settings.frontend_app_url:
        return RedirectResponse(
            url=f"{settings.frontend_app_url}?kite=connected&user_id={session.get('user_id', '')}"
        )

    html = f"""
    <html>
      <head>
        <title>Kite Connected</title>
        <style>
          body {{
            font-family: Arial, sans-serif;
            background: #0b1020;
            color: #eef2ff;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
          }}
          .card {{
            max-width: 640px;
            padding: 24px;
            border-radius: 16px;
            background: #11182d;
            border: 1px solid #22304f;
          }}
          h1 {{ margin-top: 0; }}
          p {{ line-height: 1.6; color: #cbd5e1; }}
          code {{
            background: #161f38;
            padding: 4px 8px;
            border-radius: 8px;
          }}
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Kite connected successfully</h1>
          <p>User ID: <code>{session.get('user_id', '')}</code></p>
          <p>User Name: <code>{session.get('user_name', '')}</code></p>
          <p>You can close this tab and return to the app.</p>
        </div>
      </body>
    </html>
    """
    return HTMLResponse(content=html)


@router.post('/logout')
def kite_logout() -> dict:
    clear_kite_session()
    return {'ok': True, 'message': 'Kite logged out successfully.'}