from typing import Any, Dict, Literal, Optional, List
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


class ScoreBreakdown(BaseModel):
    trend: int        # 0-30: structural EMA alignment
    strength: int     # 0-25: RSI + EMA20 momentum
    participation: int  # 0-20: volume vs average
    rs_vs_nifty: int  # 0-15: relative strength vs index
    weekly: int       # 0-10: weekly EMA20 position + slope


class AnalyzeResult(BaseModel):
    ticker: str
    verdict: str                              # kept for frontend backward compat
    score: int                                # 0-100 total
    bucket: Optional[str] = None             # "Trade Today" / "Watch Tomorrow" / "Needs Work" / "Reject"
    price: Optional[float] = None
    hard_blockers: List[str] = Field(default_factory=list)  # override bucket to Reject if non-empty
    score_breakdown: Optional[ScoreBreakdown] = None
    reasons: Optional[List[str]] = None
    blockers: Optional[List[str]] = None
    metrics: Optional[Dict[str, Any]] = None  # flat dict of all computed values
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


class ScannerScoreRequest(BaseModel):
    symbols: List[str]
    date: Optional[str] = None  # YYYY-MM-DD, defaults to today


class ScannerResultItem(BaseModel):
    ticker: str
    price: Optional[float] = None
    total_score: int = 0
    bucket: Optional[str] = None
    hard_blockers: List[str] = Field(default_factory=list)
    score_breakdown: Optional[ScoreBreakdown] = None
    reasons: Optional[List[str]] = None
    blockers: Optional[List[str]] = None
    metrics: Optional[Dict[str, Any]] = None
    error: Optional[str] = None  # set when this symbol failed; score will be 0


class ScannerScoreResponse(BaseModel):
    count: int
    results: List[ScannerResultItem]


class AiResultItem(BaseModel):
    ticker: str
    total_score: int
    deterministic_bucket: str     # what the scoring engine decided
    ai_bucket: str                # "Trade Today" / "Watch Tomorrow" / "Reject" — AI may downgrade only
    ai_explanation: str           # 1-2 sentence plain-English rationale
    cautions: List[str] = Field(default_factory=list)  # max 2 specific cautions
    trigger_note: Optional[str] = None  # clean actionable entry language
    ai_available: bool = True     # False when AI call failed; deterministic values are shown


class AiScannerResponse(BaseModel):
    count: int
    ai_available: bool            # False when the entire AI call failed or key is missing
    results: List[AiResultItem]


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