'use client';

import { useMemo, useState } from 'react';

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

type AnalyzeResult = {
  ticker: string;
  verdict: string;
  score: number;
  trigger?: string;
  stop_loss?: string;
  target_1?: string;
  target_2?: string;
  risk_reward?: string;
  summary?: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error('NEXT_PUBLIC_API_BASE_URL is missing. Add it in .env.local.');
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options?.headers || {}),
    },
    cache: 'no-store',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    throw new Error(data?.detail || 'Request failed');
  }

  return data as T;
}

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

function ResultGrid({ result }: { result: AnalyzeResult }) {
  return (
    <div className="result-grid">
      <div className="metric">
        <div className="metric-label">Verdict</div>
        <div className="metric-value">{result.verdict}</div>
      </div>
      <div className="metric">
        <div className="metric-label">Score</div>
        <div className="metric-value">{result.score}/20</div>
      </div>
      <div className="metric">
        <div className="metric-label">Trigger</div>
        <div className="metric-value">{result.trigger || '—'}</div>
      </div>
      <div className="metric">
        <div className="metric-label">Stop</div>
        <div className="metric-value danger">{result.stop_loss || '—'}</div>
      </div>
      <div className="metric">
        <div className="metric-label">Target 1</div>
        <div className="metric-value success">{result.target_1 || '—'}</div>
      </div>
      <div className="metric">
        <div className="metric-label">Target 2</div>
        <div className="metric-value success">{result.target_2 || '—'}</div>
      </div>
      <div className="metric metric-wide">
        <div className="metric-label">Risk / Reward</div>
        <div className="metric-value">{result.risk_reward || '—'}</div>
      </div>
      <div className="metric metric-wide">
        <div className="metric-label">Summary</div>
        <div className="metric-value muted">{result.summary || '—'}</div>
      </div>
    </div>
  );
}

export default function Page() {
  const [market, setMarket] = useState<{ regime: MarketRegime; note?: string }>({
    regime: 'unset',
  });
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState('');
  const [tradeNote, setTradeNote] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

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
    try {
      setLoading('Refreshing market regime...');
      setError('');
      const data = await api<{ regime: MarketRegime; note?: string }>('/market/current');
      setMarket(data);
      setStatus('Market regime updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh market');
    } finally {
      setLoading('');
    }
  }

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

      setWatchlist(data.items || []);
      setStatus(`Imported ${data.items?.length || 0} stocks from CSV preview.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import CSV');
    } finally {
      setLoading('');
    }
  }

  async function importScreenerScreenshot() {
    if (!screenshotFile) return;

    try {
      setLoading('Importing Screener screenshot preview...');
      setError('');
      const formData = new FormData();
      formData.append('file', screenshotFile);

      const data = await api<{ items: WatchlistItem[] }>('/watchlist/import-screenshot', {
        method: 'POST',
        body: formData,
      });

      setWatchlist(data.items || []);
      setStatus(`Imported ${data.items?.length || 0} stocks from screenshot preview.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import screenshot');
    } finally {
      setLoading('');
    }
  }

  function removeWatchlistItem(id: string) {
    setWatchlist((prev) => prev.filter((item) => item.id !== id));
    setStatus('Removed one row from preview.');
  }

  async function runShortlistScoring() {
    try {
      setLoading('Scoring shortlist with backend logic...');
      setError('');
      const data = await api<{ items: WatchlistItem[] }>('/scanner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'watchlist', watchlist_items: watchlist }),
      });

      setWatchlist(data.items || []);
      setStatus('Shortlist scored.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to score shortlist');
    } finally {
      setLoading('');
    }
  }

  async function analyzeTicker(forceTicker?: string) {
    const finalTicker = forceTicker || ticker || selectedTicker;
    if (!finalTicker) return;

    try {
      setLoading(`Analyzing ${finalTicker}...`);
      setError('');
      const data = await api<AnalyzeResult>('/analyze/ticker', {
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

  async function logTrade() {
    if (!analysis) return;

    try {
      setLoading(`Logging ${analysis.ticker} trade...`);
      setError('');
      await api('/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: analysis.ticker,
          entry: analysis.trigger,
          stop_loss: analysis.stop_loss,
          target_1: analysis.target_1,
          target_2: analysis.target_2,
          note: tradeNote,
        }),
      });

      setTradeNote('');
      setStatus(`${analysis.ticker} trade logged.`);
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

  return (
    <main className="page-shell">
      <div className="hero">
        <div>
          <div className="eyebrow">P Trade V1</div>
          <h1>Import → Score → Trade Today / Watch Tomorrow</h1>
          <p>
            Starter frontend for Screener import, shortlist scoring, ticker analysis,
            trade logging, and next-day refresh.
          </p>
        </div>
        <div className="hero-actions">
          <button className="btn btn-primary" onClick={runMarketRefresh}>
            Refresh Market
          </button>
          <button className="btn btn-secondary" onClick={refreshNextDay}>
            Next-Day Refresh
          </button>
        </div>
      </div>

      {(loading || error || status) && (
        <div className="feedback-row">
          {loading && <div className="banner banner-info">{loading}</div>}
          {error && <div className="banner banner-error">{error}</div>}
          {!loading && status && <div className="banner banner-success">{status}</div>}
        </div>
      )}

      <div className="top-grid">
        <SectionCard
          title="1. Market Regime"
          right={
            <Pill
              label={market.regime.toUpperCase()}
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
          }
        >
          <p className="muted">
            {market.note || 'Refresh to load the latest market condition from the backend.'}
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
            <p className="muted">
              Run scoring and classification on the imported shortlist.
            </p>
            <button
              className="btn btn-primary"
              onClick={runShortlistScoring}
              disabled={watchlist.length === 0}
            >
              Run Shortlist Scoring
            </button>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title={`Preview (${watchlist.length})`}
        right={watchlist.length > 0 ? <Pill label="Confirm before scoring" tone="blue" /> : undefined}
      >
        {watchlist.length === 0 ? (
          <p className="muted">No imported rows yet.</p>
        ) : (
          <div className="list-wrap">
            {watchlist.map((item) => (
              <div key={item.id} className="list-card">
                <div className="list-card-top">
                  <strong>{item.ticker}</strong>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Pill label={item.source.toUpperCase()} tone={item.source === 'csv' ? 'blue' : 'yellow'} />
                    <Pill label={`${item.score}/20`} tone={item.score >= 16 ? 'green' : item.score >= 11 ? 'yellow' : 'red'} />
                  </div>
                </div>
                <div className="muted small">{item.company_name || 'No company name'}</div>
                <div className="muted small">{item.sector || 'Unknown sector'}</div>
                <div className="small trigger">{item.summary || 'Awaiting scoring.'}</div>
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn-secondary" onClick={() => removeWatchlistItem(item.id)}>
                    Delete Row
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

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
                    <Pill label={`${item.score}/20`} tone="green" />
                  </div>
                  <div className="muted small">{item.summary || item.company_name || 'Trade candidate'}</div>
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
                    <Pill label={`${item.score}/20`} tone="yellow" />
                  </div>
                  <div className="muted small">{item.summary || item.company_name || 'Watch candidate'}</div>
                  <div className="small trigger">{item.trigger || 'Needs trigger confirmation'}</div>
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
                    <Pill label={`${item.score}/20`} tone="red" />
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

        <SectionCard title="5. Winner Detail">
          {!analysis ? (
            <p className="muted">
              Open any Trade Today or Watch Tomorrow name to see full result.
            </p>
          ) : (
            <>
              <div className="winner-head">
                <h3>{analysis.ticker}</h3>
                <Pill
                  label={analysis.verdict}
                  tone={
                    analysis.verdict.toLowerCase().includes('strong')
                      ? 'green'
                      : analysis.verdict.toLowerCase().includes('watch')
                      ? 'yellow'
                      : 'slate'
                  }
                />
              </div>

              <ResultGrid result={analysis} />

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
            </>
          )}
        </SectionCard>
      </div>
    </main>
  );
}