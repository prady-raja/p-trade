"""
import_service.py — screener data import (CSV and screenshot).

Extracted from services.py. Owns:
  - SECTOR_MAP and CSV column-key constants
  - _pick_value / _dedupe_watchlist helpers
  - import_screener_csv
  - import_screener_screenshot
"""

import base64
import csv
import io
import json
import uuid
from typing import Dict, List, Optional

from .config import settings
from .market_service import store
from .models import WatchlistItem


SECTOR_MAP: dict = {}  # Phase 1A: cleared — no hardcoded tickers; sector resolved from CSV or Kite

CSV_TICKER_KEYS = ['ticker', 'symbol', 'stock', 'tradingsymbol', 'nse code', 'nsecode', 'code', 'name']
CSV_NAME_KEYS = ['name', 'company', 'company name', 'company_name', 'stock name']
CSV_SECTOR_KEYS = ['industry', 'sector', 'industry group']


def _pick_value(row: Dict[str, str], options: List[str]) -> Optional[str]:
    lowered = {str(k).strip().lower(): str(v).strip() for k, v in row.items() if v is not None}
    for key in options:
        value = lowered.get(key)
        if value:
            return value
    return None


def _dedupe_watchlist(items: List[WatchlistItem]) -> List[WatchlistItem]:
    seen = set()
    deduped: List[WatchlistItem] = []
    for item in items:
        ticker = item.ticker.strip().upper()
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        deduped.append(item.model_copy(update={'ticker': ticker}))
    return deduped


def import_screener_csv(file_bytes: bytes) -> List[WatchlistItem]:
    text = file_bytes.decode('utf-8', errors='ignore')
    reader = csv.DictReader(io.StringIO(text))
    items: List[WatchlistItem] = []

    for row in reader:
        ticker = _pick_value(row, CSV_TICKER_KEYS)
        if not ticker:
            continue

        ticker = ticker.upper().replace('NSE:', '').strip()
        if not ticker:
            continue

        company_name = _pick_value(row, CSV_NAME_KEYS)
        sector = _pick_value(row, CSV_SECTOR_KEYS) or SECTOR_MAP.get(ticker, 'Unknown')

        items.append(
            WatchlistItem(
                id=str(uuid.uuid4()),
                ticker=ticker,
                company_name=company_name,
                sector=sector,
                source='csv',
                bucket='watch_tomorrow',
                score=0,
                summary='Imported from Screener CSV. Awaiting scoring.',
                trigger='Needs confirmation',
            )
        )

    store.watchlist = _dedupe_watchlist(items)
    return store.watchlist


def import_screener_screenshot(file_bytes: bytes) -> List[WatchlistItem]:
    # FIX: Bug 1 — Send actual image bytes to Claude; never return hardcoded mock data.
    if not settings.anthropic_api_key:
        raise ValueError(
            'ANTHROPIC_API_KEY is not set. Screenshot import requires Claude AI. '
            'Add ANTHROPIC_API_KEY to your .env file.'
        )

    try:
        import anthropic
    except ImportError:
        raise ValueError('anthropic SDK is not installed. Run: pip install anthropic>=0.40.0')

    # Detect image media type from magic bytes
    if file_bytes[:8] == b'\x89PNG\r\n\x1a\n':
        media_type = 'image/png'
    elif file_bytes[:3] == b'\xff\xd8\xff':
        media_type = 'image/jpeg'
    elif file_bytes[:4] == b'RIFF' and file_bytes[8:12] == b'WEBP':
        media_type = 'image/webp'
    else:
        media_type = 'image/jpeg'  # fallback

    image_data = base64.standard_b64encode(file_bytes).decode('utf-8')

    # FIX: Bug 1 — System prompt matches the battle-tested PTS screener prompt from project spec
    system_prompt = (
        'You are an expert NSE trader using PTS (Pradyumna Trading System). '
        'The user uploaded a screener.in screenshot. '
        'Extract ALL visible stock tickers/symbols shown in the table. '
        'Do not invent tickers — only extract what is actually visible in the image. '
        'Apply a basic PTS pre-filter inference (trend, tide, 52w position) where visible. '
        'Rank strongest to weakest based on what you can read. '
        'Return ONLY valid JSON — no markdown, no explanation, no code blocks.\n\n'
        'Format: {"stocks":[{"rank":1,"ticker":"SYMBOL","company_name":"Full Name or null",'
        '"signal":"brief one-line reason or null"}]}'
    )

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    response = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=1024,
        system=system_prompt,
        messages=[{
            'role': 'user',
            'content': [
                {
                    'type': 'image',
                    'source': {
                        'type': 'base64',
                        'media_type': media_type,
                        'data': image_data,
                    },
                },
                {
                    'type': 'text',
                    'text': (
                        'Extract all stock tickers from this screener screenshot. '
                        'Return only the JSON with the stocks array.'
                    ),
                },
            ],
        }],
    )

    raw_text = response.content[0].text.strip()

    # Strip markdown code fences if Claude wraps them despite the instruction
    if raw_text.startswith('```'):
        lines = raw_text.split('\n')
        raw_text = '\n'.join(
            line for line in lines
            if not line.strip().startswith('```')
        ).strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        raise ValueError(f'Claude returned unparseable JSON: {exc}. Raw: {raw_text[:200]}')

    stocks = parsed.get('stocks', [])
    if not stocks:
        raise ValueError('Claude could not extract any tickers from the screenshot.')

    items: List[WatchlistItem] = []
    for stock in stocks:
        ticker = str(stock.get('ticker') or '').upper().strip()
        if not ticker:
            continue
        ticker = ticker.replace('NSE:', '').replace('BSE:', '').strip()
        if not ticker:
            continue

        company_name: Optional[str] = stock.get('company_name') or None
        signal: Optional[str] = stock.get('signal') or None

        items.append(WatchlistItem(
            id=str(uuid.uuid4()),
            ticker=ticker,
            company_name=company_name,
            sector=SECTOR_MAP.get(ticker, 'Unknown'),
            source='screenshot',
            bucket='watch_tomorrow',
            score=0,
            summary=signal or 'Extracted from screenshot.',
            trigger='Needs confirmation',
        ))

    if not items:
        raise ValueError('No valid tickers could be parsed from the Claude response.')

    store.watchlist = _dedupe_watchlist(items)
    return store.watchlist
