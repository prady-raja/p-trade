// ---------------------------------------------------------------------------
// Legacy types (preserved for backward compat)
// ---------------------------------------------------------------------------

export type MarketRegime = 'green' | 'yellow' | 'red' | 'unset';
export type Bucket = 'trade_today' | 'watch_tomorrow' | 'reject';
export type SourceType = 'csv' | 'screenshot';
export type TradeStatus = 'open' | 'hit_t1' | 'hit_t2' | 'stopped' | 'closed';

// ---------------------------------------------------------------------------
// New framework types (PART B)
// ---------------------------------------------------------------------------

export type GateStatus = 'passed' | 'failed' | 'unavailable' | 'manual_review_required';
export type Verdict = 'STRONG BUY' | 'BUY WATCH' | 'WAIT' | 'AVOID';

export type GateResult = {
  name: string;
  label: string;
  status: GateStatus;
  description: string;
};

export type HvsBreakdown = {
  trend: number;        // 0-14
  momentum: number;     // 0-12
  rs_vs_nifty: number;  // 0-8
  total: number;        // 0-34
};

export type OptBreakdown = {
  participation: number; // 0-8
  weekly: number;        // 0-6
  total: number;         // 0-14
};

// ---------------------------------------------------------------------------
// Core domain types
// ---------------------------------------------------------------------------

export type WatchlistItem = {
  id: string;
  ticker: string;
  company_name?: string;
  sector?: string;
  source: SourceType;
  bucket: Bucket;
  score: number;         // legacy 0-100
  trigger?: string;
  stop_loss?: string;
  target_1?: string;
  target_2?: string;
  risk_reward?: string;
  summary?: string;
  // New framework fields
  hvs_score?: number;    // 0-34
  verdict?: Verdict;
};

export type ScoreBreakdown = {
  trend: number;         // 0-30
  strength: number;      // 0-25
  participation: number; // 0-20
  rs_vs_nifty: number;   // 0-15
  weekly: number;        // 0-10
};

export type TradeReviewResult = {
  symbol: string;
  company_name?: string;
  market_regime?: string;
  price?: number;
  // Legacy scoring (kept for backward compat)
  score_breakdown?: ScoreBreakdown;
  total_score: number;
  bucket?: string;
  hard_blockers?: string[];
  // Trade plan (only populated when tradeable = true)
  trigger_price?: number;
  stop_loss?: number;
  target_1?: number;
  target_2?: number;
  risk_reward?: number;
  // Detail fields
  weekly_note?: string;
  invalidation_rule?: string;
  reasons?: string[];
  blockers?: string[];
  metrics?: Record<string, unknown>;
  ai_explanation?: string;
  // New framework fields
  gates: GateResult[];
  hvs_score?: number;
  hvs_breakdown?: HvsBreakdown;
  opt_score?: number;
  opt_breakdown?: OptBreakdown;
  verdict?: Verdict;
  tradeable: boolean;
  // Snapshot (Part 1)
  snapshot_id?: string | null;
};

export type TradeRecord = {
  id: string;
  ticker: string;
  entry: string | null;
  stop_loss: string | null;
  target_1: string | null;
  target_2: string | null;
  note: string | null;
  status: TradeStatus;
  exit_price: number | null;
  current_price: number | null;
  hvs_score: number | null;
  opt_score: number | null;
  verdict: string | null;
  gates_passed: string[] | null;
  gate_failed: string | null;
  market_regime: string | null;
  snapshot_id?: string | null;
  // Post-mortem fields
  pm_checks: string[] | null;
  pm_lesson: string | null;
  pm_market: string | null;
};

export type KiteStatus = {
  connected: boolean;
  user_id?: string;
  user_name?: string;
  login_time?: string;
  error?: string;
  last_error?: string | null;
};

export type CachedMarket = {
  regime: MarketRegime;
  note?: string;
  cachedAt: number;
};

// ---------------------------------------------------------------------------
// Study session types (PART 3)
// ---------------------------------------------------------------------------

export type StudyResult = {
  ticker: string;
  verdict: string | null;
  hvs_score: number | null;
  opt_score: number | null;
  hard_blocked: boolean;
  gate_failed: string | null;
  snapshot_id: string;
};

export type StudySession = {
  session_id: string;
  study_date: string;
  total: number;
  with_outcomes: number;
  created_at: string;
};

export type AccuracyStats = {
  total: number;
  winner_pct: number;
  flat_pct: number;
  loser_pct: number;
};

export type StudyAnalytics = {
  total_outcomes: number;
  accuracy_by_verdict: Record<string, AccuracyStats>;
  avg_return_by_verdict: Record<string, number | null>;
  component_correlation: Record<string, number | null>;
};

export type ProposedChange = {
  id: string;
  component: string;
  current: string;
  proposed: string;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
  impact: 'major' | 'minor' | 'experimental';
  status: 'proposed' | 'accepted' | 'rejected';
};

export type MethodologyReview = {
  id: string;
  reviewed_at: string;
  total_outcomes: number;
  overall_assessment: string;
  proposed_changes: ProposedChange[];
  methodology_version: string | null;
  created_at: string;
};
