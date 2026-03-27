from typing import Any, Dict, Literal, Optional, List, Union
from pydantic import BaseModel, ConfigDict, Field

MarketRegime = Literal['green', 'yellow', 'red', 'unset']
BucketType = Literal['trade_today', 'watch_tomorrow', 'reject']
SourceType = Literal['csv', 'screenshot']

# New methodology types
GateStatus = Literal['passed', 'failed', 'unavailable', 'manual_review_required']
Verdict = Literal['STRONG BUY', 'BUY WATCH', 'WAIT', 'AVOID']


class MarketState(BaseModel):
    regime: MarketRegime = 'unset'
    note: str = 'Market regime not yet evaluated — real Nifty data connection required.'


class WatchlistItem(BaseModel):
    id: str
    ticker: str
    company_name: Optional[str] = None
    sector: Optional[str] = None
    source: SourceType = 'csv'
    bucket: BucketType = 'watch_tomorrow'
    score: int = Field(default=0, ge=0, le=100)  # legacy 0-100 total score
    trigger: Optional[str] = None
    stop_loss: Optional[str] = None
    target_1: Optional[str] = None
    target_2: Optional[str] = None
    risk_reward: Optional[str] = None
    summary: Optional[str] = None
    # New framework fields (optional for backward compat)
    hvs_score: Optional[int] = None   # 0-34
    verdict: Optional[str] = None     # 'STRONG BUY' | 'BUY WATCH' | 'WAIT' | 'AVOID'


class AnalyzeTickerRequest(BaseModel):
    ticker: str
    date: Optional[str] = None


class ScoreBreakdown(BaseModel):
    trend: int          # 0-30: structural EMA alignment
    strength: int       # 0-25: RSI + EMA20 momentum
    participation: int  # 0-20: volume vs average
    rs_vs_nifty: int    # 0-15: relative strength vs index
    weekly: int         # 0-10: weekly EMA20 position + slope


# ---------------------------------------------------------------------------
# New framework: Gate / HVS / OPT models
# ---------------------------------------------------------------------------

class GateResult(BaseModel):
    """Result of a single hard gate evaluation."""
    name: str                # machine-readable identifier
    label: str               # human-readable name
    status: GateStatus       # passed | failed | unavailable | manual_review_required
    description: str         # human-readable detail (value, threshold, reason)


class HvsBreakdown(BaseModel):
    """High Value Score breakdown. Max = 34. Drives verdict."""
    trend: int        # 0-14 (mapped from trend_score 0-30)
    momentum: int     # 0-12 (mapped from strength_score 0-25)
    rs_vs_nifty: int  # 0-8  (mapped from rs_vs_nifty 0-15)
    total: int        # 0-34


class OptBreakdown(BaseModel):
    """Optional Score breakdown. Max = 14. Timing/polish only — NEVER changes verdict."""
    participation: int  # 0-8 (mapped from participation_score 0-20)
    weekly: int         # 0-6 (mapped from weekly_score 0-10)
    total: int          # 0-14


# ---------------------------------------------------------------------------
# Core result models
# ---------------------------------------------------------------------------

class AnalyzeResult(BaseModel):
    ticker: str
    verdict: str                              # kept for frontend backward compat
    score: int                                # 0-100 total (legacy)
    bucket: Optional[str] = None             # "Trade Today" / "Watch Tomorrow" / "Needs Work" / "Reject"
    price: Optional[float] = None
    hard_blockers: List[str] = Field(default_factory=list)  # human-readable failed gate descriptions
    score_breakdown: Optional[ScoreBreakdown] = None
    reasons: Optional[List[str]] = None
    blockers: Optional[List[str]] = None
    metrics: Optional[Dict[str, Any]] = None
    trigger: Optional[str] = None
    stop_loss: Optional[str] = None
    target_1: Optional[str] = None
    target_2: Optional[str] = None
    risk_reward: Optional[str] = None
    summary: Optional[str] = None
    # New framework fields
    gates: List[GateResult] = Field(default_factory=list)
    hvs_score: Optional[int] = None
    hvs_breakdown: Optional[HvsBreakdown] = None
    opt_score: Optional[int] = None
    opt_breakdown: Optional[OptBreakdown] = None
    tradeable: bool = False


class TradeUpdateRequest(BaseModel):
    status: Optional[str] = None
    current_price: Optional[float] = None
    exit_price: Optional[float] = None
    pm_checks: Optional[List[str]] = None
    pm_lesson: Optional[str] = None
    pm_market: Optional[str] = None


class ScannerRunRequest(BaseModel):
    source: str = 'watchlist'
    refresh: bool = False
    watchlist_items: Optional[List[WatchlistItem]] = None


class TradeCreateRequest(BaseModel):
    model_config = ConfigDict(coerce_numbers_to_str=True)
    ticker: str
    entry: Optional[str] = None
    stop_loss: Optional[str] = None
    target_1: Optional[str] = None
    target_2: Optional[str] = None
    note: Optional[str] = None
    # New framework tracking fields
    hvs_score: Optional[int] = None
    opt_score: Optional[int] = None
    gates_passed: Optional[List[str]] = None
    gate_failed: Optional[str] = None
    verdict: Optional[str] = None
    market_regime: Optional[str] = None
    snapshot_id: Optional[str] = None


class TradeRecord(BaseModel):
    id: str
    ticker: str
    entry: Optional[str] = None
    stop_loss: Optional[str] = None
    target_1: Optional[str] = None
    target_2: Optional[str] = None
    note: Optional[str] = None
    status: str = 'open'
    exit_price: Optional[float] = None
    current_price: Optional[float] = None
    # New framework tracking fields
    hvs_score: Optional[int] = None
    opt_score: Optional[int] = None
    gates_passed: Optional[List[str]] = None
    gate_failed: Optional[str] = None
    verdict: Optional[str] = None
    market_regime: Optional[str] = None
    snapshot_id: Optional[str] = None
    # Post-mortem fields
    pm_checks: Optional[List[str]] = None
    pm_lesson: Optional[str] = None
    pm_market: Optional[str] = None


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
    error: Optional[str] = None
    # New framework fields
    gates: List[GateResult] = Field(default_factory=list)
    hvs_score: Optional[int] = None
    verdict: Optional[str] = None
    tradeable: bool = False


class ScannerScoreResponse(BaseModel):
    count: int
    results: List[ScannerResultItem]


class AiResultItem(BaseModel):
    ticker: str
    total_score: int
    deterministic_bucket: str     # what the scoring engine decided
    ai_bucket: str                # AI may downgrade only
    ai_explanation: str           # 1-2 sentence plain-English rationale
    cautions: List[str] = Field(default_factory=list)
    trigger_note: Optional[str] = None
    ai_available: bool = True


class AiScannerResponse(BaseModel):
    count: int
    ai_available: bool
    results: List[AiResultItem]


class TradeReviewResult(BaseModel):
    symbol: str
    company_name: Optional[str] = None
    market_regime: Optional[str] = None
    price: Optional[float] = None
    score_breakdown: Optional[ScoreBreakdown] = None
    total_score: int                                        # legacy 0-100
    bucket: Optional[str] = None                           # legacy bucket string
    hard_blockers: List[str] = Field(default_factory=list) # human-readable failed gate messages
    trigger_price: Optional[float] = None
    stop_loss: Optional[float] = None
    target_1: Optional[float] = None
    target_2: Optional[float] = None
    risk_reward: Optional[float] = None
    weekly_note: Optional[str] = None
    invalidation_rule: Optional[str] = None
    reasons: Optional[List[str]] = None
    blockers: Optional[List[str]] = None
    metrics: Optional[Dict[str, Any]] = None
    ai_explanation: Optional[str] = None
    # New framework fields
    gates: List[GateResult] = Field(default_factory=list)
    hvs_score: Optional[int] = None
    hvs_breakdown: Optional[HvsBreakdown] = None
    opt_score: Optional[int] = None
    opt_breakdown: Optional[OptBreakdown] = None
    verdict: Optional[str] = None     # 'STRONG BUY' | 'BUY WATCH' | 'WAIT' | 'AVOID'
    tradeable: bool = False
    snapshot_id: Optional[str] = None


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
