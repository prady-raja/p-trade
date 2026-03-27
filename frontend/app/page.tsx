'use client';

import { useEffect, useMemo, useState } from 'react';
import { BrokerConnectionCard } from '../components/BrokerConnectionCard';
import { BucketColumns } from '../components/BucketColumns';
import { ImportPanel } from '../components/ImportPanel';
import { MarketRegimeCard } from '../components/MarketRegimeCard';
import { PreviewList } from '../components/PreviewList';
import { SectionCard } from '../components/SectionCard';
import { WinnerDetail } from '../components/WinnerDetail';
import { api, MARKET_CACHE_KEY } from '../lib/api';
import type {
  CachedMarket,
  KiteStatus,
  MarketRegime,
  TradeReviewResult,
  WatchlistItem,
} from '../lib/types';

export default function Page() {
  // Market regime state
  const [market, setMarket] = useState<{ regime: MarketRegime; note?: string }>({
    regime: 'unset',
  });
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const [marketCachedAt, setMarketCachedAt] = useState<number | null>(null);

  // Import preview (Phase 1) vs scored watchlist (Phase 2)
  const [importedItems, setImportedItems] = useState<WatchlistItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // Winner detail state
  const [analysis, setAnalysis] = useState<TradeReviewResult | null>(null);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState('');
  const [tradeNote, setTradeNote] = useState('');

  // Global feedback
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');

  // Broker state
  const [kiteStatus, setKiteStatus] = useState<KiteStatus | null>(null);
  const [kiteLoading, setKiteLoading] = useState('');

  useEffect(() => {
    fetchKiteStatus();
    fetchMarketRegime();
  }, []);

  // ---------------------------------------------------------------------------
  // Market regime
  // ---------------------------------------------------------------------------

  async function fetchMarketRegime() {
    setMarketLoading(true);
    setMarketError('');
    setMarketCachedAt(null);
    try {
      const data = await api<{ regime: MarketRegime; note?: string }>('/market/current');
      setMarket(data);
      const cache: CachedMarket = { ...data, cachedAt: Date.now() };
      localStorage.setItem(MARKET_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
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

  async function runMarketRefresh() {
    setError('');
    setStatus('');
    await fetchMarketRegime();
    if (!marketError) setStatus('Market regime updated.');
  }

  // ---------------------------------------------------------------------------
  // Broker / Kite
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------

  async function importScreenerCsv(file: File) {
    try {
      setLoading('Importing Screener CSV...');
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      const data = await api<{ items: WatchlistItem[] }>('/watchlist/import-screener', {
        method: 'POST',
        body: formData,
      });
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

  async function importScreenerScreenshot(file: File) {
    try {
      setLoading('Sending screenshot to AI for ticker extraction — this may take a few seconds...');
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      const data = await api<{ items: WatchlistItem[] }>('/watchlist/import-screenshot', {
        method: 'POST',
        body: formData,
      });
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

  function removeImportedItem(id: string) {
    setImportedItems((prev) => prev.filter((item) => item.id !== id));
    setStatus('Removed one row from preview.');
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------

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
      setWatchlist(data.items || []);
      setImportedItems([]);
      setStatus('Phase 2 — Shortlist scored. Trade Today / Watch Tomorrow / Reject populated below.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to score shortlist');
    } finally {
      setLoading('');
    }
  }

  // ---------------------------------------------------------------------------
  // Analysis & trade logging
  // ---------------------------------------------------------------------------

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

      <BrokerConnectionCard
        kiteStatus={kiteStatus}
        kiteLoading={kiteLoading}
        onConnect={connectKite}
        onRefreshStatus={fetchKiteStatus}
        onLogout={logoutKite}
      />

      <div className="top-grid">
        <MarketRegimeCard
          market={market}
          marketLoading={marketLoading}
          marketError={marketError}
          marketCachedAt={marketCachedAt}
          onFetchMarketRegime={fetchMarketRegime}
        />

        <ImportPanel
          onImportCsv={importScreenerCsv}
          onImportScreenshot={importScreenerScreenshot}
        />

        <SectionCard title="3. Score Shortlist">
          <div className="stack">
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
              disabled={importedItems.length === 0 && watchlist.length === 0}
            >
              Run Shortlist Scoring
            </button>
          </div>
        </SectionCard>
      </div>

      <PreviewList
        importedItems={importedItems}
        watchlist={watchlist}
        onRemove={removeImportedItem}
      />

      <BucketColumns
        tradeToday={tradeToday}
        watchTomorrow={watchTomorrow}
        rejected={rejected}
        onAnalyzeTicker={analyzeTicker}
      />

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

        <WinnerDetail
          analysis={analysis}
          tradeNote={tradeNote}
          onTradeNoteChange={setTradeNote}
          onLogTrade={logTrade}
        />
      </div>
    </main>
  );
}
