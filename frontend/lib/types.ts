export type MarketRegime = 'green' | 'yellow' | 'red' | 'unset';
export type Bucket = 'trade_today' | 'watch_tomorrow' | 'reject';
export type SourceType = 'csv' | 'screenshot';

export type WatchlistItem = {
  id: string;
  ticker: string;
  company_name?: string;
  sector?: string;
  source: SourceType;
  bucket: Bucket;
  score: number;
  trigger?: string;
  stop_loss?: string;
  target_1?: string;
  target_2?: string;
  risk_reward?: string;
  summary?: string;
};

export type ScoreBreakdown = {
  trend: number;       // 0-30
  strength: number;    // 0-25
  participation: number; // 0-20
  rs_vs_nifty: number; // 0-15
  weekly: number;      // 0-10
};

export type TradeReviewResult = {
  symbol: string;
  company_name?: string;
  market_regime?: string;
  price?: number;
  score_breakdown?: ScoreBreakdown;
  total_score: number;
  bucket?: string;
  hard_blockers?: string[];
  trigger_price?: number;
  stop_loss?: number;
  target_1?: number;
  target_2?: number;
  risk_reward?: number;
  weekly_note?: string;
  invalidation_rule?: string;
  reasons?: string[];
  blockers?: string[];
  metrics?: Record<string, unknown>;
  ai_explanation?: string;
};

export type KiteStatus = {
  connected: boolean;
  user_id?: string;
  user_name?: string;
  login_time?: string;
  error?: string;
};

export type CachedMarket = {
  regime: MarketRegime;
  note?: string;
  cachedAt: number;
};
