from typing import Literal, Optional, List
from pydantic import BaseModel, Field

MarketRegime = Literal['green', 'yellow', 'red', 'unset']
BucketType = Literal['trade_today', 'watch_tomorrow', 'reject']
SourceType = Literal['csv', 'screenshot']


class MarketState(BaseModel):
    regime: MarketRegime = 'unset'
    note: str = 'Market not evaluated yet.'


class WatchlistItem(BaseModel):
    id: str
    ticker: str
    company_name: Optional[str] = None
    sector: Optional[str] = None
    source: SourceType = 'csv'
    bucket: BucketType = 'watch_tomorrow'
    score: int = Field(default=0, ge=0, le=20)
    trigger: Optional[str] = None
    stop_loss: Optional[str] = None
    target_1: Optional[str] = None
    target_2: Optional[str] = None
    risk_reward: Optional[str] = None
    summary: Optional[str] = None


class AnalyzeTickerRequest(BaseModel):
    ticker: str
    date: Optional[str] = None


class TrendContext(BaseModel):
    price: float
    ema20: float
    ema50: float
    ema200: float
    price_vs_ema20: str   # "above" / "below"
    price_vs_ema50: str
    price_vs_ema200: str
    ema_stack: str        # "aligned" / "partial" / "bearish" / "unknown"
    score: int            # 0-30


class StrengthContext(BaseModel):
    rsi: Optional[float]
    rsi_label: str        # "overbought" / "bullish" / "neutral_bullish" / "neutral" / "weak"
    score: int            # 0-25


class ParticipationContext(BaseModel):
    volume: int
    avg_volume: float
    ratio: Optional[float]
    label: str            # "high" / "above_average" / "normal" / "low"
    score: int            # 0-20


class WeeklyContext(BaseModel):
    available: bool
    price_vs_weekly_ema20: Optional[str] = None  # "above" / "below"
    score: int = 0        # 0-10


class AnalyzeResult(BaseModel):
    ticker: str
    verdict: str          # kept for frontend backward compat
    score: int            # 0-100
    bucket: Optional[str] = None
    price: Optional[float] = None
    trend: Optional[TrendContext] = None
    strength: Optional[StrengthContext] = None
    participation: Optional[ParticipationContext] = None
    weekly_context: Optional[WeeklyContext] = None
    reasons: Optional[List[str]] = None
    blockers: Optional[List[str]] = None
    rs_vs_nifty: Optional[float] = None  # % delta vs Nifty over 60 days
    trigger: Optional[str] = None
    stop_loss: Optional[str] = None
    target_1: Optional[str] = None
    target_2: Optional[str] = None
    risk_reward: Optional[str] = None
    summary: Optional[str] = None


class ScannerRunRequest(BaseModel):
    source: str = 'watchlist'
    refresh: bool = False
    watchlist_items: Optional[List[WatchlistItem]] = None


class TradeCreateRequest(BaseModel):
    ticker: str
    entry: Optional[str] = None
    stop_loss: Optional[str] = None
    target_1: Optional[str] = None
    target_2: Optional[str] = None
    note: Optional[str] = None


class TradeRecord(BaseModel):
    id: str
    ticker: str
    entry: Optional[str] = None
    stop_loss: Optional[str] = None
    target_1: Optional[str] = None
    target_2: Optional[str] = None
    note: Optional[str] = None
    status: str = 'open'


class KiteLoginUrlResponse(BaseModel):
    configured: bool
    connected: bool
    login_url: Optional[str] = None
    message: str


class KiteStatusResponse(BaseModel):
    configured: bool
    connected: bool
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    login_time: Optional[str] = None
    api_key_present: bool
    redirect_url_present: bool
    last_error: Optional[str] = None