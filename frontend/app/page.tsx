'use client';

import { useEffect, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MarketRegime = 'green' | 'yellow' | 'red' | 'unset';
type Bucket = 'trade_today' | 'watch_tomorrow' | 'reject';
type SourceType = 'csv' | 'screenshot';

type WatchlistItem = {
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

// FIX: Bug 4 — Replace AnalyzeResult (old /analyze/ticker shape) with TradeReviewResult
// matching the /analyze/review response from the backend
type ScoreBreakdown = {
  trend: number;       // 0-30
  strength: number;    // 0-25
  participation: number; // 0-20
  rs_vs_nifty: number; // 0-15
  weekly: number;      // 0-10
};

type TradeReviewResult = {
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

type KiteStatus = {
  connected: boolean;
  user_id?: string;
  user_name?: string;
  login_time?: string;
  error?: string;
};

// FIX: Bug 5 — Type for localStorage market cache
type CachedMarket = {
  regime: MarketRegime;
  note?: string;
  cachedAt: number;
};

// ---------------------------------------------------------------------------
// API helper
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
const MARKET_CACHE_KEY = 'p_trade_market_cache';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is missing. Add it in .env.local.');
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { ...(options?.headers || {}) },
    cache: 'no-store',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new Error(data?.detail || 'Request failed');
  }

  return data as T;
}

// ---------------------------------------------------------------------------
// Shared UI components
// ---------------------------------------------------------------------------

function Pill({
  label,
  tone = 'slate',
}: {
  label: string;
  tone?: 'green' | 'yellow' | 'red' | 'blue' | 'slate';
}) {
  return <span className={`pill pill-${tone}`}>{label}</span>;
}

function SectionCard({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

// FIX: Bug 4 — Completely rewritten to use TradeReviewResult (numeric fields, full PTS data)
// FIX: Bug 2 — Score denominator is /100 everywhere
function ResultGrid({ result }: { result: TradeReviewResult }) {
  const isRejected =
    (result.hard_blockers && result.hard_blockers.length > 0) ||
    result.bucket === 'Reject' ||
    result.bucket === 'Needs Work';

  const bucketTone =
    result.bucket === 'Trade Today'
      ? 'green'
      : result.bucket === 'Watch Tomorrow'
      ? 'yellow'
      : 'red';

  const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="result-grid">
      {/* Score and Bucket */}
      <div className="metric">
        <div className="metric-label">Score</div>
        {/* FIX: Bug 2 — denominator is /100 */}
        <div className="metric-value">{result.total_score}/100</div>
      </div>
      <div className="metric">
        <div className="metric-label">Bucket</div>
        <div className="metric-value">
          <Pill label={result.bucket || 'Unknown'} tone={bucketTone} />
        </div>
      </div>

      {/* Price */}
      {result.price != null && (
        <div className="metric">
          <div className="metric-label">Price (LTP)</div>
          <div className="metric-value">{fmt(result.price)}</div>
        </div>
      )}

      {/* Score breakdown */}
      {result.score_breakdown && (
        <div className="metric">
          <div className="metric-label">Score Breakdown</div>
          <div className="metric-value" style={{ fontSize: 13, lineHeight: 1.9 }}>
            Trend&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{result.score_breakdown.trend}/30
            <br />
            Strength&nbsp;&nbsp;&nbsp;&nbsp;{result.score_breakdown.strength}/25
            <br />
            Participation&nbsp;{result.score_breakdown.participation}/20
            <br />
            RS vs Nifty&nbsp;&nbsp;{result.score_breakdown.rs_vs_nifty}/15
            <br />
            Weekly&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{result.score_breakdown.weekly}/10
          </div>
        </div>
      )}

      {/* Hard blockers */}
      {result.hard_blockers && result.hard_blockers.length > 0 && (
        <div className="metric metric-wide">
          <div className="metric-label">Hard Blockers</div>
          <div className="metric-value danger" style={{ fontSize: 13, lineHeight: 1.8 }}>
            {result.hard_blockers.map((b, i) => (
              <div key={i}>⛔ {b}</div>
            ))}
          </div>
        </div>
      )}

      {/* FIX: Bug 4 — Not tradeable gate: no entry plans shown for Reject / hard-blocked stocks */}
      {isRejected ? (
        <div className="metric metric-wide">
          <div className="metric-label">Trade Plan</div>
          <div className="metric-value danger">
            Not tradeable under PTS rules — do not enter this position.
          </div>
        </div>
      ) : (
        <>
          <div className="metric">
            <div className="metric-label">Trigger (Enter Above)</div>
            <div className="metric-value">
              {result.trigger_price != null ? fmt(result.trigger_price) : '—'}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Stop Loss</div>
            <div className="metric-value danger">
              {result.stop_loss != null ? fmt(result.stop_loss) : '—'}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Target 1</div>
            <div className="metric-value success">
              {result.target_1 != null ? fmt(result.target_1) : '—'}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Target 2</div>
            <div className="metric-value success">
              {result.target_2 != null ? fmt(result.target_2) : '—'}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Risk / Reward</div>
            <div className="metric-value">
              {result.risk_reward != null ? `1:${result.risk_reward}` : '—'}
            </div>
          </div>
        </>
      )}

      {/* Reasons */}
      {result.reasons && result.reasons.length > 0 && (
        <div className="metric metric-wide">
          <div className="metric-label">Why This Bucket</div>
          <div className="metric-value" style={{ fontSize: 13, lineHeight: 1.8 }}>
            {result.reasons.map((r, i) => (
              <div key={i}>✓ {r}</div>
            ))}
          </div>
        </div>
      )}

      {/* Soft blockers */}
      {result.blockers && result.blockers.length > 0 && (
        <div className="metric metric-wide">
          <div className="metric-label">Cautions</div>
          <div className="metric-value" style={{ fontSize: 13, lineHeight: 1.8 }}>
            {result.blockers.map((b, i) => (
              <div key={i}>⚠ {b}</div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly note */}
      {result.weekly_note && (
        <div className="metric metric-wide">
          <div className="metric-label">Weekly Chart</div>
          <div className="metric-value muted">{result.weekly_note}</div>
        </div>
      )}

      {/* Invalidation rule */}
      {result.invalidation_rule && (
        <div className="metric metric-wide">
          <div className="metric-label">Invalidation Rule</div>
          <div className="metric-value danger" style={{ fontSize: 13 }}>
            {result.invalidation_rule}
          </div>
        </div>
      )}

      {/* AI explanation */}
      {result.ai_explanation && (
        <div className="metric metric-wide">
          <div className="metric-label">AI Analysis</div>
          <div className="metric-value muted">{result.ai_explanation}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Page() {
  // Market regime state
  const [market, setMarket] = useState<{ regime: MarketRegime; note?: string }>({
    regime: 'unset',
  });
  // FIX: Bug 5 — Dedicated loading/error/cache states for market regime
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const [marketCachedAt, setMarketCachedAt] = useState<number | null>(null);

  // FIX: Bug 3 — Separate import preview state from scored watchlist state
  // importedItems: raw tickers from CSV/screenshot (Phase 1 — preview only)
  // watchlist: scored items that populate Trade Today / Watch Tomorrow / Reject (Phase 2)
  const [importedItems, setImportedItems] = useState<WatchlistItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // FIX: Bug 4 — analysis now holds TradeReviewResult (from /analyze/review)
  const [analysis, setAnalysis] = useState<TradeReviewResult | null>(null);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState('');
  const [tradeNote, setTradeNote] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [kiteStatus, setKiteStatus] = useState<KiteStatus | null>(null);
  const [kiteLoading, setKiteLoading] = useState('');

  // FIX: Bug 5 — Fetch market regime on load (not just Kite status)
  useEffect(() => {
    fetchKiteStatus();
    fetchMarketRegime();
  }, []);

  // FIX: Bug 5 — Market regime fetch with localStorage caching and retry
  async function fetchMarketRegime() {
    setMarketLoading(true);
    setMarketError('');
    setMarketCachedAt(null);
    try {
      const data = await api<{ regime: MarketRegime; note?: string }>('/market/current');
      setMarket(data);
      // Cache in localStorage with timestamp
      const cache: CachedMarket = { ...data, cachedAt: Date.now() };
      localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      // Try localStorage fallback before showing error
      try {
        const raw = localStorage.getItem(MARKET_CACHE_KEY);
        if (raw) {
          const cached: CachedMarket = JSON.parse(raw);
          setMarket({ regime: cached.regime, note: cached.note });
          setMarketCachedAt(cached.cachedAt);
          setMarketError(
            `Could not reach backend — using cached regime from ${new Date(cached.cachedAt).toLocaleTimeString()}`
          );
        } else {
          setMarketError(
            e instanceof Error
              ? e.message
              : 'Could not fetch market regime — check backend connection'
          );
        }
      } catch {
        setMarketError(
          e instanceof Error
            ? e.message
            : 'Could not fetch market regime — check backend connection'
        );
      }
    } finally {
      setMarketLoading(false);
    }
  }

  async function fetchKiteStatus() {
    try {
      setKiteLoading('Checking Kite status...');
      const data = await api<KiteStatus>('/broker/kite/status');
      setKiteStatus(data);
    } catch (e) {
      setKiteStatus({
        connected: false,
        error: e instanceof Error ? e.message : 'Status check failed',
      });
    } finally {
      setKiteLoading('');
    }
  }

  async function connectKite() {
    try {
      setKiteLoading('Fetching Kite login URL...');
      const data = await api<{ url: string }>('/broker/kite/login-url');
      window.location.href = data.url;
    } catch (e) {
      setKiteLoading('');
      setError(e instanceof Error ? e.message : 'Failed to get Kite login URL');
    }
  }

  async function logoutKite() {
    try {
      setKiteLoading('Logging out...');
      await api('/broker/kite/logout', { method: 'POST' });
      await fetchKiteStatus();
      setStatus('Kite logged out.');
    } catch (e) {
      setKiteLoading('');
      setError(e instanceof Error ? e.message : 'Failed to logout from Kite');
    }
  }

  // FIX: Bug 3 — Bucket columns derive from watchlist (scored items only)
  const tradeToday = useMemo(
    () => watchlist.filter((x) => x.bucket === 'trade_today'),
    [watchlist]
  );
  const watchTomorrow = useMemo(
    () => watchlist.filter((x) => x.bucket === 'watch_tomorrow'),
    [watchlist]
  );
  const rejected = useMemo(
    () => watchlist.filter((x) => x.bucket === 'reject'),
    [watchlist]
  );

  async function runMarketRefresh() {
    setError('');
    setStatus('');
    await fetchMarketRegime();
    if (!marketError) setStatus('Market regime updated.');
  }

  // FIX: Bug 3 — Import CSV populates importedItems (preview), NOT watchlist (scored buckets)
  async function importScreenerCsv() {
    if (!csvFile) return;
    try {
      setLoading('Importing Screener CSV...');
      setError('');
      const formData = new FormData();
      formData.append('file', csvFile);

      const data = await api<{ items: WatchlistItem[] }>('/watchlist/import-screener', {
        method: 'POST',
        body: formData,
      });

      // FIX: Bug 3 — Set importedItems only; clear previous scored buckets on fresh import
      setImportedItems(data.items || []);
      setWatchlist([]);
      setStatus(
        `Phase 1 — ${data.items?.length || 0} names imported from CSV. Review then click "Run Shortlist Scoring".`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import CSV');
    } finally {
      setLoading('');
    }
  }

  // FIX: Bug 1 — Frontend was already sending the image correctly; backend was returning mock data.
  //              Backend now sends the real image to Claude. Loading message updated to reflect this.
  // FIX: Bug 3 — Screenshot import populates importedItems (preview), NOT watchlist
  async function importScreenerScreenshot() {
    if (!screenshotFile) return;
    try {
      setLoading('Sending screenshot to AI for ticker extraction — this may take a few seconds...');
      setError('');
      const formData = new FormData();
      formData.append('file', screenshotFile);

      const data = await api<{ items: WatchlistItem[] }>('/watchlist/import-screenshot', {
        method: 'POST',
        body: formData,
      });

      // FIX: Bug 3 — Set importedItems only; clear previous scored buckets on fresh import
      setImportedItems(data.items || []);
      setWatchlist([]);
      setStatus(
        `Phase 1 — ${data.items?.length || 0} names extracted from screenshot. Review then click "Run Shortlist Scoring".`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import screenshot');
    } finally {
      setLoading('');
    }
  }

  // FIX: Bug 3 — Remove from importedItems (preview), not watchlist
  function removeImportedItem(id: string) {
    setImportedItems((prev) => prev.filter((item) => item.id !== id));
    setStatus('Removed one row from preview.');
  }

  // FIX: Bug 3 — Scoring takes importedItems as input and populates watchlist (bucket columns)
  async function runShortlistScoring() {
    const itemsToScore = importedItems.length > 0 ? importedItems : watchlist;
    try {
      setLoading('Scoring shortlist with backend logic...');
      setError('');
      const data = await api<{ items: WatchlistItem[] }>('/scanner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'watchlist', watchlist_items: itemsToScore }),
      });

      // FIX: Bug 3 — Scored results go to watchlist; clear import preview
      setWatchlist(data.items || []);
      setImportedItems([]);
      setStatus('Phase 2 — Shortlist scored. Trade Today / Watch Tomorrow / Reject populated below.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to score shortlist');
    } finally {
      setLoading('');
    }
  }

  // FIX: Bug 4 — Calls /analyze/review instead of /analyze/ticker for full trade review card
  async function analyzeTicker(forceTicker?: string) {
    const finalTicker = forceTicker || ticker || selectedTicker;
    if (!finalTicker) return;
    try {
      setLoading(`Analyzing ${finalTicker}...`);
      setError('');
      const data = await api<TradeReviewResult>('/analyze/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: finalTicker, date: date || undefined }),
      });

      setAnalysis(data);
      setSelectedTicker(finalTicker);
      setTicker(finalTicker);
      setStatus(`${finalTicker} analysis ready.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to analyze ticker');
    } finally {
      setLoading('');
    }
  }

  // FIX: Bug 4 — logTrade uses TradeReviewResult field names (trigger_price instead of trigger)
  async function logTrade() {
    if (!analysis) return;
    try {
      setLoading(`Logging ${analysis.symbol} trade...`);
      setError('');
      await api('/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: analysis.symbol,
          entry: analysis.trigger_price != null ? String(analysis.trigger_price) : undefined,
          stop_loss: analysis.stop_loss != null ? String(analysis.stop_loss) : undefined,
          target_1: analysis.target_1 != null ? String(analysis.target_1) : undefined,
          target_2: analysis.target_2 != null ? String(analysis.target_2) : undefined,
          note: tradeNote,
        }),
      });

      setTradeNote('');
      setStatus(`${analysis.symbol} trade logged.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log trade');
    } finally {
      setLoading('');
    }
  }

  async function refreshNextDay() {
    try {
      setLoading('Refreshing market and watchlist context...');
      setError('');
      const [marketData, scanData] = await Promise.all([
        api<{ regime: MarketRegime; note?: string }>('/market/current'),
        api<{ items: WatchlistItem[] }>('/scanner/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'watchlist', refresh: true, watchlist_items: watchlist }),
        }),
      ]);

      setMarket(marketData);
      setWatchlist(scanData.items || []);
      setStatus('Next-day refresh complete.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh next-day state');
    } finally {
      setLoading('');
    }
  }

  // FIX: Bug 2 — Score pill threshold based on 0-100 scale
  function scorePillTone(score: number): 'green' | 'yellow' | 'red' {
    if (score >= 75) return 'green';
    if (score >= 50) return 'yellow';
    return 'red';
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="page-shell">
      <div className="hero">
        <div>
          <div className="eyebrow">P Trade V1</div>
          <h1>Import → Score → Trade Today / Watch Tomorrow</h1>
          <p>
            PTS-based screener workflow: import names, score shortlist, review winners, log trades.
          </p>
        </div>
        <div className="hero-actions">
          <button
            className="btn btn-primary"
            onClick={runMarketRefresh}
            disabled={marketLoading}
          >
            Refresh Market
          </button>
          <button className="btn btn-secondary" onClick={refreshNextDay}>
            Next-Day Refresh
          </button>
        </div>
      </div>

      {/* Global feedback banner */}
      {(loading || error || status) && (
        <div className="feedback-row">
          {loading && <div className="banner banner-info">{loading}</div>}
          {error && <div className="banner banner-error">{error}</div>}
          {!loading && status && <div className="banner banner-success">{status}</div>}
        </div>
      )}

      {/* Broker Connection */}
      <SectionCard
        title="Broker Connection"
        right={
          kiteLoading ? (
            <Pill label="CHECKING..." tone="slate" />
          ) : kiteStatus?.connected ? (
            <Pill label="CONNECTED" tone="green" />
          ) : (
            <Pill label="NOT CONNECTED" tone="red" />
          )
        }
      >
        {kiteLoading && (
          <div className="banner banner-info" style={{ marginBottom: 14 }}>
            {kiteLoading}
          </div>
        )}
        {!kiteLoading && kiteStatus?.connected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            <div className="small">
              <span className="muted">User ID&nbsp;&nbsp;&nbsp;</span>
              <strong>{kiteStatus.user_id || '—'}</strong>
            </div>
            <div className="small">
              <span className="muted">Name&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
              <strong>{kiteStatus.user_name || '—'}</strong>
            </div>
            <div className="small">
              <span className="muted">Login Time</span>
              <strong style={{ marginLeft: 8 }}>{kiteStatus.login_time || '—'}</strong>
            </div>
          </div>
        )}
        {!kiteLoading && kiteStatus && !kiteStatus.connected && (
          <div className="banner banner-error" style={{ marginBottom: 14 }}>
            {kiteStatus.error || 'Kite is not connected.'}
          </div>
        )}
        <div className="hero-actions">
          <button
            className="btn btn-primary"
            onClick={connectKite}
            disabled={!!kiteLoading}
          >
            Connect Kite
          </button>
          <button
            className="btn btn-secondary"
            onClick={fetchKiteStatus}
            disabled={!!kiteLoading}
          >
            Refresh Status
          </button>
          {kiteStatus?.connected && (
            <button
              className="btn btn-secondary"
              onClick={logoutKite}
              disabled={!!kiteLoading}
            >
              Logout Kite
            </button>
          )}
        </div>
      </SectionCard>

      <div className="top-grid">
        {/* FIX: Bug 5 — Market Regime auto-fetches on load, shows spinner, error with retry,
            cached fallback with warning. Never shows UNSET as a final resolved state. */}
        <SectionCard
          title="1. Market Regime"
          right={
            marketLoading ? (
              <Pill label="LOADING..." tone="slate" />
            ) : (
              <Pill
                label={market.regime === 'unset' ? 'UNKNOWN' : market.regime.toUpperCase()}
                tone={
                  market.regime === 'green'
                    ? 'green'
                    : market.regime === 'yellow'
                    ? 'yellow'
                    : market.regime === 'red'
                    ? 'red'
                    : 'slate'
                }
              />
            )
          }
        >
          {/* FIX: Bug 5 — Loading spinner replaces the static UNSET display */}
          {marketLoading && (
            <div className="banner banner-info" style={{ marginBottom: 12 }}>
              Fetching market regime...
            </div>
          )}

          {/* FIX: Bug 5 — Cached fallback with timestamp and retry */}
          {!marketLoading && marketCachedAt && (
            <div className="banner banner-error" style={{ marginBottom: 12 }}>
              ⚠ Using cached regime — backend may be down. Last updated{' '}
              {new Date(marketCachedAt).toLocaleTimeString()}.{' '}
              <button
                className="btn btn-secondary"
                style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }}
                onClick={fetchMarketRegime}
              >
                Retry
              </button>
            </div>
          )}

          {/* FIX: Bug 5 — Error state with retry button */}
          {!marketLoading && marketError && !marketCachedAt && (
            <div className="banner banner-error" style={{ marginBottom: 12 }}>
              {marketError}
              <button
                className="btn btn-secondary"
                style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }}
                onClick={fetchMarketRegime}
              >
                Retry
              </button>
            </div>
          )}

          <p className="muted">
            {market.note ||
              (!marketLoading && !marketError
                ? 'Click Refresh Market to load the latest market condition.'
                : '')}
          </p>
        </SectionCard>

        <SectionCard title="2. Import Screener Data">
          <div className="stack">
            <label>
              <span>CSV upload</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              />
            </label>
            <button
              className="btn btn-primary"
              onClick={importScreenerCsv}
              disabled={!csvFile}
            >
              Import CSV
            </button>

            <label>
              <span>Screenshot upload</span>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                onChange={(e) => setScreenshotFile(e.target.files?.[0] || null)}
              />
            </label>
            <button
              className="btn btn-secondary"
              onClick={importScreenerScreenshot}
              disabled={!screenshotFile}
            >
              Import Screenshot
            </button>
          </div>
        </SectionCard>

        <SectionCard title="3. Score Shortlist">
          <div className="stack">
            {/* FIX: Bug 3 — Context-aware prompt based on current phase */}
            <p className="muted">
              {importedItems.length > 0
                ? `${importedItems.length} names ready in preview. Click to classify into buckets.`
                : watchlist.length > 0
                ? `${watchlist.length} scored names in buckets below. Re-import to start a new session.`
                : 'Import names first (CSV or screenshot), then run scoring.'}
            </p>
            <button
              className="btn btn-primary"
              onClick={runShortlistScoring}
              // FIX: Bug 3 — Button active when importedItems (pre-scoring) or watchlist (re-score)
              disabled={importedItems.length === 0 && watchlist.length === 0}
            >
              Run Shortlist Scoring
            </button>
          </div>
        </SectionCard>
      </div>

      {/* FIX: Bug 3 — Preview shows ONLY importedItems (Phase 1), with ticker names only.
          No scores, no buckets, no scoring language in the import preview. */}
      <SectionCard
        title={
          importedItems.length > 0
            ? `Phase 1 — Preview (${importedItems.length} names)`
            : watchlist.length > 0
            ? 'Phase 2 — Scored (see buckets below)'
            : 'Preview'
        }
        right={importedItems.length > 0 ? <Pill label="Review then score" tone="blue" /> : undefined}
      >
        {importedItems.length > 0 ? (
          <>
            <p className="muted small" style={{ marginBottom: 14 }}>
              Phase 1 — {importedItems.length} names imported. Delete unwanted rows, then click
              &quot;Run Shortlist Scoring&quot; to classify.
            </p>
            <div className="list-wrap">
              {importedItems.map((item) => (
                <div key={item.id} className="list-card">
                  <div className="list-card-top">
                    <strong>{item.ticker}</strong>
                    {/* FIX: Bug 3 — Source badge only. No score pill, no bucket, no summary in import preview. */}
                    <Pill
                      label={item.source.toUpperCase()}
                      tone={item.source === 'csv' ? 'blue' : 'yellow'}
                    />
                  </div>
                  {item.company_name && (
                    <div className="muted small">{item.company_name}</div>
                  )}
                  {item.sector && item.sector !== 'Unknown' && (
                    <div className="muted small">{item.sector}</div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => removeImportedItem(item.id)}
                    >
                      Delete Row
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : watchlist.length > 0 ? (
          <p className="muted small">
            Scoring complete — {watchlist.length} stocks classified. See Trade Today / Watch
            Tomorrow / Reject below.
          </p>
        ) : (
          <p className="muted">No imported rows yet. Import CSV or screenshot to begin.</p>
        )}
      </SectionCard>

      {/* FIX: Bug 3 — Bucket columns only show watchlist (scored items). Never show importedItems here. */}
      {/* FIX: Bug 2 — Score denominator /100 everywhere in bucket cards */}
      <div className="three-col" style={{ marginTop: 16 }}>
        <SectionCard title={`Trade Today (${tradeToday.length})`}>
          <div className="list-wrap">
            {tradeToday.length === 0 ? (
              <p className="muted">No names yet.</p>
            ) : (
              tradeToday.map((item) => (
                <button
                  key={item.id}
                  className="list-card action-card"
                  onClick={() => analyzeTicker(item.ticker)}
                >
                  <div className="list-card-top">
                    <strong>{item.ticker}</strong>
                    {/* FIX: Bug 2 — /100 denominator */}
                    <Pill label={`${item.score}/100`} tone={scorePillTone(item.score)} />
                  </div>
                  <div className="muted small">
                    {item.summary || item.company_name || 'Trade candidate'}
                  </div>
                  <div className="small trigger">{item.trigger || 'Open analysis'}</div>
                </button>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title={`Watch Tomorrow (${watchTomorrow.length})`}>
          <div className="list-wrap">
            {watchTomorrow.length === 0 ? (
              <p className="muted">No names yet.</p>
            ) : (
              watchTomorrow.map((item) => (
                <button
                  key={item.id}
                  className="list-card action-card"
                  onClick={() => analyzeTicker(item.ticker)}
                >
                  <div className="list-card-top">
                    <strong>{item.ticker}</strong>
                    {/* FIX: Bug 2 — /100 denominator */}
                    <Pill label={`${item.score}/100`} tone={scorePillTone(item.score)} />
                  </div>
                  <div className="muted small">
                    {item.summary || item.company_name || 'Watch candidate'}
                  </div>
                  <div className="small trigger">
                    {item.trigger || 'Needs trigger confirmation'}
                  </div>
                </button>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title={`Reject (${rejected.length})`}>
          <div className="list-wrap">
            {rejected.length === 0 ? (
              <p className="muted">No names yet.</p>
            ) : (
              rejected.map((item) => (
                <div key={item.id} className="list-card">
                  <div className="list-card-top">
                    <strong>{item.ticker}</strong>
                    {/* FIX: Bug 2 — /100 denominator */}
                    <Pill label={`${item.score}/100`} tone="red" />
                  </div>
                  <div className="muted small">
                    {item.summary || item.company_name || 'Rejected candidate'}
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      <div className="bottom-grid">
        <SectionCard title="4. Manual Analyze by Ticker">
          <div className="form-grid">
            <label>
              <span>Ticker</span>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g. POLYCAB"
              />
            </label>
            <label>
              <span>Date (optional)</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => analyzeTicker()}
            disabled={!ticker && !selectedTicker}
          >
            Analyze
          </button>
        </SectionCard>

        {/* FIX: Bug 4 — Winner Detail uses /analyze/review and TradeReviewResult shape */}
        <SectionCard title="5. Winner Detail">
          {!analysis ? (
            <p className="muted">
              Open any Trade Today or Watch Tomorrow name, or manually analyze a ticker above.
            </p>
          ) : (
            <>
              <div className="winner-head">
                <div>
                  <h3 style={{ margin: 0 }}>{analysis.symbol}</h3>
                  {analysis.company_name && (
                    <div className="muted small" style={{ marginTop: 4 }}>
                      {analysis.company_name}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {analysis.market_regime && (
                    <Pill
                      label={`Market: ${analysis.market_regime.toUpperCase()}`}
                      tone={
                        analysis.market_regime === 'green'
                          ? 'green'
                          : analysis.market_regime === 'yellow'
                          ? 'yellow'
                          : 'red'
                      }
                    />
                  )}
                  <Pill
                    label={analysis.bucket || 'Unknown'}
                    tone={
                      analysis.bucket === 'Trade Today'
                        ? 'green'
                        : analysis.bucket === 'Watch Tomorrow'
                        ? 'yellow'
                        : 'red'
                    }
                  />
                </div>
              </div>

              <ResultGrid result={analysis} />

              {/* FIX: Bug 4 — Log Trade only shown for tradeable stocks (not Reject / hard-blocked) */}
              {(!analysis.hard_blockers || analysis.hard_blockers.length === 0) &&
                analysis.bucket !== 'Reject' &&
                analysis.bucket !== 'Needs Work' && (
                  <div className="stack top-gap">
                    <label>
                      <span>Trade note</span>
                      <textarea
                        value={tradeNote}
                        onChange={(e) => setTradeNote(e.target.value)}
                        placeholder="Why you are taking this trade"
                        rows={3}
                      />
                    </label>
                    <button className="btn btn-primary" onClick={logTrade}>
                      Log Trade
                    </button>
                  </div>
                )}
            </>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
