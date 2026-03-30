'use client';

import { useEffect, useMemo, useState } from 'react';
import { BucketColumns } from '../components/BucketColumns';
import { DashboardSection } from '../components/DashboardSection';
import { StudySection } from '../components/StudySection';
import { ImportPanel } from '../components/ImportPanel';
import { JournalSection } from '../components/JournalSection';
import { Pill } from '../components/Pill';
import { PostMortemModal } from '../components/PostMortemModal';
import { PreviewList } from '../components/PreviewList';
import { SectionCard } from '../components/SectionCard';
import { T1ExitModal } from '../components/T1ExitModal';
import { WinnerDetail } from '../components/WinnerDetail';
import { api, MARKET_CACHE_KEY } from '../lib/api';
import type {
  CachedMarket,
  KiteStatus,
  MarketRegime,
  TradeRecord,
  TradeReviewResult,
  WatchlistItem,
} from '../lib/types';

type ActiveView = 'analyze' | 'review' | 'trades' | 'watchlist' | 'score' | 'performance' | 'study';

export default function Page() {
  // Market regime state
  const [market, setMarket] = useState<{ regime: MarketRegime; note?: string }>({
    regime: 'unset',
  });
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState('');
  const [marketCachedAt, setMarketCachedAt] = useState<number | null>(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<Date | null>(null);

  // Import preview (Phase 1) vs scored watchlist (Phase 2)
  const [importedItems, setImportedItems] = useState<WatchlistItem[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // Trade review state
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

  // Trades
  const [trades, setTrades] = useState<TradeRecord[]>([]);

  // Modal state
  const [pmTrade, setPmTrade] = useState<TradeRecord | null>(null);
  const [t1Trade, setT1Trade] = useState<TradeRecord | null>(null);

  // Position sizing capital
  const [capital, setCapital] = useState<number>(0);

  // Active view
  const [activeView, setActiveView] = useState<ActiveView>('analyze');

  // Derived
  const openTradeCount = trades.filter((t) => t.status === 'open').length;

  useEffect(() => {
    fetchKiteStatus();
    fetchMarketRegime();
    fetchTrades();
    const saved = localStorage.getItem('p_trade_capital');
    if (saved) setCapital(parseFloat(saved) || 0);
  }, []);

  // ---------------------------------------------------------------------------
  // Capital
  // ---------------------------------------------------------------------------

  function handleCapitalChange(n: number) {
    setCapital(n);
    localStorage.setItem('p_trade_capital', String(n));
  }

  // ---------------------------------------------------------------------------
  // Trades
  // ---------------------------------------------------------------------------

  async function fetchTrades() {
    try {
      const data = await api<{ items: TradeRecord[] }>('/trades');
      setTrades(data.items || []);
    } catch {
      // silently ignore — Trades section shows empty state
    }
  }

  async function handleTradeUpdate(id: string, patch: Partial<TradeRecord>): Promise<void> {
    await api(`/trades/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    await fetchTrades();
  }

  async function handleLessonsSave(
    id: string,
    pm: { pm_checks: string; pm_lesson: string; pm_market: string }
  ): Promise<void> {
    await api(`/trades/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pm_checks: pm.pm_checks ? [pm.pm_checks] : null,
        pm_lesson: pm.pm_lesson || null,
        pm_market: pm.pm_market || null,
      }),
    });
    await fetchTrades();
    setPmTrade(null);
  }

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
      setMarketUpdatedAt(new Date());
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
        `${data.items?.length || 0} names imported. Review below then click "Run Scoring".`
      );
      setActiveView('watchlist');
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
        `${data.items?.length || 0} names extracted from screenshot. Review below then click "Run Scoring".`
      );
      setActiveView('watchlist');
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
      setLoading('Scoring watchlist with backend logic...');
      setError('');
      const data = await api<{ items: WatchlistItem[] }>('/scanner/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'watchlist', watchlist_items: itemsToScore }),
      });
      setWatchlist(data.items || []);
      setImportedItems([]);
      setStatus('Watchlist scored. Results in buckets below.');
      setActiveView('score');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to score watchlist');
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
      setActiveView('review');
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
          hvs_score: analysis.hvs_score ?? undefined,
          opt_score: analysis.opt_score ?? undefined,
          gates_passed: analysis.gates
            ?.filter((g) => g.status === 'passed')
            .map((g) => g.name),
          gate_failed: analysis.gates?.find((g) => g.status === 'failed')?.name ?? undefined,
          verdict: analysis.verdict ?? undefined,
          market_regime: market.regime !== 'unset' ? market.regime : undefined,
          snapshot_id: analysis.snapshot_id ?? undefined,
        }),
      });
      setTradeNote('');
      setStatus(`${analysis.symbol} trade logged.`);
      fetchTrades();
      setActiveView('trades');
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
      setMarketUpdatedAt(new Date());
      setWatchlist(scanData.items || []);
      setStatus('Sync complete.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sync watchlist');
    } finally {
      setLoading('');
    }
  }

  // ---------------------------------------------------------------------------
  // Regime note formatter
  // ---------------------------------------------------------------------------

  function formatRegimeNote(note: string): string {
    try {
      return note
        .split('|')
        .map((part) =>
          part
            .trim()
            .replace(/EMA(\d+)=/, 'EMA$1 ')
            .replace(/₹([\d.]+)/, (_, n) =>
              '₹' + Math.round(parseFloat(n)).toLocaleString('en-IN')
            )
        )
        .join(' · ');
    } catch {
      return note;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <div className="app-shell">

        {/* ── Sticky top bar ── */}
        <div className="top-bar">
          <span className="top-bar-logo">PTS</span>

          {loading && (
            <span className="top-bar-status top-bar-status-loading">{loading}</span>
          )}
          {!loading && error && (
            <span className="top-bar-status top-bar-status-error">{error}</span>
          )}
          {!loading && !error && status && (
            <span className="top-bar-status top-bar-status-success">{status}</span>
          )}
          {!loading && !error && !status && (
            <span style={{ flex: 1 }} />
          )}

          <Pill
            label={kiteStatus?.connected ? 'Kite Connected' : 'Kite Disconnected'}
            tone={kiteStatus?.connected ? 'green' : 'red'}
          />
          <Pill label={`${openTradeCount} open`} tone="slate" />
          <button className="top-bar-btn" onClick={runMarketRefresh} disabled={marketLoading}>
            Refresh
          </button>
          <button className="top-bar-btn" onClick={refreshNextDay}>
            Sync
          </button>
        </div>

        {/* ── Regime strip (hidden when unset) ── */}
        {market.regime !== 'unset' ? (
          <div className={`regime-strip regime-strip-${market.regime}`}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span className={`regime-dot regime-dot-${market.regime}`} />
              <strong>{market.regime.toUpperCase()}</strong>
              {market.note && (
                <span style={{ marginLeft: 12, fontWeight: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 500 }}>
                  {formatRegimeNote(market.note)}
                </span>
              )}
            </div>
            <span style={{ fontSize: 12, fontWeight: 400, flexShrink: 0 }}>
              {marketUpdatedAt
                ? `Updated at ${String(marketUpdatedAt.getHours()).padStart(2, '0')}:${String(marketUpdatedAt.getMinutes()).padStart(2, '0')}`
                : 'Updated just now'}
            </span>
          </div>
        ) : (
          <div className="regime-spacer" />
        )}

        {/* ── App body: nav + main ── */}
        <div className="app-body">

          {/* ── Left nav panel ── */}
          <div className="nav-panel">

            {/* Broker status — compact */}
            <div className="nav-broker">
              {kiteStatus?.connected ? (
                <div className="nav-broker-connected">
                  <span>
                    <span className="nav-broker-dot" />
                    <strong style={{ fontSize: 12 }}>{kiteStatus.user_id}</strong>
                  </span>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '2px 8px', fontSize: 11 }}
                    onClick={logoutKite}
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontSize: 12, color: '#991b1b' }}>
                    <span className="nav-broker-dot disconnected" />
                    {kiteStatus?.last_error || 'Not connected'}
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '6px', fontSize: 12 }}
                    onClick={connectKite}
                  >
                    Connect Kite
                  </button>
                </div>
              )}
            </div>

            {/* TODAY section */}
            <div className="nav-section">
              <div className="nav-section-label">Today</div>

              <button
                className={`nav-item${activeView === 'analyze' ? ' active' : ''}`}
                onClick={() => setActiveView('analyze')}
              >
                Analyze
              </button>

              <button
                className={`nav-item${activeView === 'review' ? ' active' : ''}`}
                onClick={() => setActiveView('review')}
              >
                Review
                {analysis && (
                  <span className="nav-item-count has-items">{analysis.symbol}</span>
                )}
              </button>

              <button
                className={`nav-item${activeView === 'trades' ? ' active' : ''}`}
                onClick={() => setActiveView('trades')}
              >
                Trades
                {openTradeCount > 0 && (
                  <span className="nav-item-count has-items">{openTradeCount}</span>
                )}
              </button>
            </div>

            <div className="nav-divider" />

            {/* SHORTLIST — Trade Today */}
            {tradeToday.length > 0 && (
              <div className="nav-section">
                <div className="nav-section-label">Trade Today · {tradeToday.length}</div>
                <div className="nav-bucket">
                  {tradeToday.map((item) => (
                    <button
                      key={item.id}
                      className={`nav-bucket-item${selectedTicker === item.ticker ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedTicker(item.ticker);
                        analyzeTicker(item.ticker);
                        setActiveView('review');
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{item.ticker}</span>
                      <Pill
                        label={String(item.hvs_score ?? item.score)}
                        tone="green"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SHORTLIST — Watch Tomorrow */}
            {watchTomorrow.length > 0 && (
              <div className="nav-section">
                <div className="nav-section-label">Watch · {watchTomorrow.length}</div>
                <div className="nav-bucket">
                  {watchTomorrow.map((item) => (
                    <button
                      key={item.id}
                      className={`nav-bucket-item${selectedTicker === item.ticker ? ' selected' : ''}`}
                      onClick={() => {
                        setSelectedTicker(item.ticker);
                        analyzeTicker(item.ticker);
                        setActiveView('review');
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{item.ticker}</span>
                      <Pill
                        label={String(item.hvs_score ?? item.score)}
                        tone="yellow"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="nav-divider" />

            {/* SETUP section */}
            <div className="nav-section">
              <div className="nav-section-label">Setup</div>

              <button
                className={`nav-item${activeView === 'watchlist' ? ' active' : ''}`}
                onClick={() => setActiveView('watchlist')}
              >
                Watchlist
                {importedItems.length > 0 && (
                  <span className="nav-item-count has-items">{importedItems.length}</span>
                )}
              </button>

              <button
                className={`nav-item${activeView === 'score' ? ' active' : ''}`}
                onClick={() => setActiveView('score')}
              >
                Score
                {watchlist.length > 0 && (
                  <span className="nav-item-count">{watchlist.length}</span>
                )}
              </button>
            </div>

            <div className="nav-divider" />

            {/* TRACK section */}
            <div className="nav-section">
              <div className="nav-section-label">Track</div>

              <button
                className={`nav-item${activeView === 'performance' ? ' active' : ''}`}
                onClick={() => setActiveView('performance')}
              >
                Performance
              </button>

              <button
                className={`nav-item${activeView === 'study' ? ' active' : ''}`}
                onClick={() => setActiveView('study')}
              >
                Study
              </button>
            </div>

          </div>

          {/* ── Main content panel ── */}
          <div className="main-panel">

            {/* Feedback inline */}
            {(loading || error || status) && (
              <div style={{ marginBottom: 16 }}>
                {loading && <div className="banner banner-info">{loading}</div>}
                {error   && <div className="banner banner-error">{error}</div>}
                {!loading && status && <div className="banner banner-success">{status}</div>}
              </div>
            )}

            {/* VIEW: Analyze */}
            <div className={`view${activeView === 'analyze' ? ' active' : ''}`}>
              <SectionCard title="Analyze">
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
                  onClick={() => {
                    analyzeTicker();
                    setActiveView('review');
                  }}
                  disabled={!ticker && !selectedTicker}
                >
                  Analyze
                </button>
              </SectionCard>
            </div>

            {/* VIEW: Review */}
            <div className={`view${activeView === 'review' ? ' active' : ''}`}>
              <WinnerDetail
                analysis={analysis}
                tradeNote={tradeNote}
                onTradeNoteChange={setTradeNote}
                onLogTrade={logTrade}
                capital={capital}
                onCapitalChange={handleCapitalChange}
                marketRegime={market.regime}
              />
            </div>

            {/* VIEW: Trades */}
            <div className={`view${activeView === 'trades' ? ' active' : ''}`}>
              <JournalSection
                trades={trades}
                onUpdate={handleTradeUpdate}
                onT1Hit={(trade) => setT1Trade(trade)}
                onClosed={(trade) => setPmTrade(trade)}
              />
            </div>

            {/* VIEW: Watchlist (import) */}
            <div className={`view${activeView === 'watchlist' ? ' active' : ''}`}>
              <ImportPanel
                onImportCsv={importScreenerCsv}
                onImportScreenshot={importScreenerScreenshot}
              />
              <PreviewList
                importedItems={importedItems}
                watchlist={watchlist}
                onRemove={removeImportedItem}
              />
            </div>

            {/* VIEW: Score */}
            <div className={`view${activeView === 'score' ? ' active' : ''}`}>
              <SectionCard title="Score">
                <div className="stack">
                  <p className="muted">
                    {importedItems.length > 0
                      ? `${importedItems.length} names ready. Click to classify into buckets.`
                      : watchlist.length > 0
                      ? `${watchlist.length} scored. Re-import to start a new session.`
                      : 'Import a watchlist first, then run scoring.'}
                  </p>
                  <button
                    className="btn btn-primary"
                    onClick={runShortlistScoring}
                    disabled={importedItems.length === 0 && watchlist.length === 0}
                  >
                    Run Scoring
                  </button>
                </div>
              </SectionCard>

              <BucketColumns
                tradeToday={tradeToday}
                watchTomorrow={watchTomorrow}
                rejected={rejected}
                onAnalyzeTicker={(t) => {
                  analyzeTicker(t);
                  setActiveView('review');
                }}
              />
            </div>

            {/* VIEW: Performance */}
            <div className={`view${activeView === 'performance' ? ' active' : ''}`}>
              <DashboardSection trades={trades} />
            </div>

            {/* VIEW: Study */}
            <div className={`view${activeView === 'study' ? ' active' : ''}`}>
              <StudySection />
            </div>

          </div>
        </div>
      </div>

      {/* Modals — outside app-body, fixed position */}
      <PostMortemModal
        trade={pmTrade}
        onSave={handleLessonsSave}
        onClose={() => setPmTrade(null)}
      />
      <T1ExitModal
        trade={t1Trade}
        onClose={() => setT1Trade(null)}
      />
    </>
  );
}
