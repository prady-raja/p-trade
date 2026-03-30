'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import type {
  MethodologyReview,
  ProposedChange,
  StudyAnalytics,
  StudyResult,
  StudySession,
} from '../lib/types';
import { SectionCard } from './SectionCard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdictColor(v: string | null): string {
  if (v === 'STRONG BUY') return '#166534';
  if (v === 'BUY WATCH')  return '#1e40af';
  if (v === 'WAIT')        return '#92400e';
  return '#991b1b';
}

function confidenceColor(c: string): string {
  if (c === 'high')   return '#166534';
  if (c === 'medium') return '#92400e';
  return '#6b7280';
}

function impactColor(i: string): string {
  if (i === 'major')        return '#1e40af';
  if (i === 'minor')        return '#92400e';
  return '#6b7280';
}

function corrBar(corr: number | null): string {
  if (corr === null || corr === undefined) return '—';
  const pct = Math.round(Math.abs(corr) * 100);
  const sign = corr >= 0 ? '+' : '−';
  return `${sign}${pct}%`;
}

function corrColor(corr: number | null): string {
  if (corr === null || corr === undefined) return 'var(--muted)';
  const abs = Math.abs(corr);
  if (abs >= 0.4) return corr > 0 ? '#166534' : '#991b1b';
  if (abs >= 0.2) return corr > 0 ? '#92400e' : '#92400e';
  return 'var(--muted)';
}

// ---------------------------------------------------------------------------
// Tab: Run Session
// ---------------------------------------------------------------------------

function RunSessionTab() {
  const [tickers, setTickers]       = useState('');
  const [studyDate, setStudyDate]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [result, setResult]         = useState<{
    session_id: string;
    study_date: string;
    total: number;
    scored: number;
    errors: number;
    results: StudyResult[];
    error_details: { ticker: string; error: string }[];
  } | null>(null);

  const [fetchingOutcomes, setFetchingOutcomes] = useState(false);
  const [fetchResult, setFetchResult]           = useState('');

  async function handleRun() {
    const list = tickers.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
    if (list.length === 0) {
      setError('Enter at least one ticker.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api<typeof result>('/study/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: list, study_date: studyDate || undefined }),
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Study run failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchOutcomes() {
    setFetchingOutcomes(true);
    setFetchResult('');
    try {
      const data = await api<{ fetched: number; errors: number }>('/study/fetch-outcomes', { method: 'POST' });
      setFetchResult(`Fetched ${data.fetched} outcomes${data.errors ? `, ${data.errors} errors` : ''}.`);
    } catch (e) {
      setFetchResult(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setFetchingOutcomes(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
        <div style={{ flex: 3 }}>
          <span className="form-label">Tickers (comma or space separated)</span>
          <input
            value={tickers}
            onChange={(e) => setTickers(e.target.value)}
            placeholder="e.g. POLYCAB, TITAN, BAJFINANCE"
          />
        </div>
        <div style={{ flex: 1 }}>
          <span className="form-label">Study Date (optional)</span>
          <input type="date" value={studyDate} onChange={(e) => setStudyDate(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={handleRun} disabled={loading}>
          {loading ? 'Running...' : 'Run Study Session'}
        </button>
        <button className="btn btn-secondary" onClick={handleFetchOutcomes} disabled={fetchingOutcomes}>
          {fetchingOutcomes ? 'Fetching...' : 'Fetch Pending Outcomes'}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {fetchResult && (
        <div className={`banner ${fetchResult.includes('error') || fetchResult.includes('fail') ? 'banner-error' : 'banner-success'}`} style={{ marginBottom: 12 }}>
          {fetchResult}
        </div>
      )}

      {result && (
        <div>
          <div className="study-session-meta">
            Session <strong>{result.session_id.slice(0, 8)}…</strong> · {result.study_date} ·{' '}
            {result.scored}/{result.total} scored
            {result.errors > 0 && <span style={{ color: '#991b1b' }}> · {result.errors} errors</span>}
          </div>

          <div style={{ marginTop: 12 }}>
            {result.results.map((r) => (
              <div key={r.snapshot_id} className="study-result-row">
                <strong style={{ fontSize: 14, minWidth: 120 }}>{r.ticker}</strong>
                <span style={{ fontSize: 13, color: verdictColor(r.verdict), fontWeight: 600 }}>
                  {r.verdict || '—'}
                </span>
                <span className="study-result-scores">
                  HVS {r.hvs_score ?? '—'} · OPT {r.opt_score ?? '—'}
                </span>
                {r.hard_blocked && (
                  <span className="pill pill-red" style={{ fontSize: 11 }}>BLOCKED</span>
                )}
                {r.gate_failed && !r.hard_blocked && (
                  <span className="pill pill-yellow" style={{ fontSize: 11 }}>{r.gate_failed}</span>
                )}
              </div>
            ))}
            {result.error_details.map((e) => (
              <div key={e.ticker} className="study-result-row" style={{ color: '#991b1b' }}>
                <strong style={{ fontSize: 14, minWidth: 120 }}>{e.ticker}</strong>
                <span style={{ fontSize: 12 }}>{e.error}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Analytics
// ---------------------------------------------------------------------------

function AnalyticsTab() {
  const [loading, setLoading]     = useState(false);
  const [analytics, setAnalytics] = useState<StudyAnalytics | null>(null);
  const [sessions, setSessions]   = useState<StudySession[]>([]);
  const [error, setError]         = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [analyticsData, sessionsData] = await Promise.all([
        api<StudyAnalytics>('/study/analytics'),
        api<{ sessions: StudySession[] }>('/study/sessions'),
      ]);
      setAnalytics(analyticsData);
      setSessions(sessionsData.sessions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }

  if (!analytics && !loading) {
    return (
      <div>
        <button className="btn btn-secondary" onClick={load}>Load Analytics</button>
        {error && <div className="banner banner-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
    );
  }

  if (loading) return <p className="muted">Loading analytics…</p>;
  if (error)   return <div className="banner banner-error">{error}</div>;
  if (!analytics) return null;

  if (analytics.total_outcomes === 0) {
    return (
      <div>
        <p className="muted">No outcomes yet. Run study sessions and fetch outcomes first.</p>
        <button className="btn btn-secondary" onClick={load} style={{ marginTop: 8 }}>Refresh</button>
      </div>
    );
  }

  const correlations = analytics.component_correlation;
  const maxAbsCorr   = Math.max(...Object.values(correlations).filter((v): v is number => v !== null).map(Math.abs), 0.01);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {analytics.total_outcomes} resolved outcomes across {sessions.length} sessions
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ padding: '4px 10px', fontSize: 12 }}>Refresh</button>
      </div>

      {/* Accuracy by verdict */}
      <div style={{ marginBottom: 20 }}>
        <div className="dash-chart-label">Accuracy by Verdict</div>
        {Object.entries(analytics.accuracy_by_verdict).map(([verdict, stats]) => (
          <div key={verdict} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <strong style={{ color: verdictColor(verdict) }}>{verdict}</strong>
              <span className="muted">{stats.total} trades</span>
            </div>
            <div className="study-accuracy-bar">
              <div style={{ width: `${stats.winner_pct}%`, background: '#22c55e', height: '100%', borderRadius: '3px 0 0 3px' }} title={`Winner ${stats.winner_pct}%`} />
              <div style={{ width: `${stats.flat_pct}%`, background: '#d1d5db', height: '100%' }} title={`Flat ${stats.flat_pct}%`} />
              <div style={{ width: `${stats.loser_pct}%`, background: '#ef4444', height: '100%', borderRadius: '0 3px 3px 0' }} title={`Loser ${stats.loser_pct}%`} />
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              <span style={{ color: '#166534' }}>Winner {stats.winner_pct}%</span>
              <span>Flat {stats.flat_pct}%</span>
              <span style={{ color: '#991b1b' }}>Loser {stats.loser_pct}%</span>
              {analytics.avg_return_by_verdict[verdict] !== null && (
                <span>Avg 60d: <strong style={{ color: (analytics.avg_return_by_verdict[verdict] ?? 0) >= 0 ? '#166534' : '#991b1b' }}>
                  {analytics.avg_return_by_verdict[verdict]}%
                </strong></span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Component correlations */}
      <div style={{ marginBottom: 12 }}>
        <div className="dash-chart-label">Component Correlation with 60d Return</div>
        {Object.entries(correlations).map(([comp, corr]) => {
          const pct = corr !== null ? Math.abs(corr) / maxAbsCorr * 100 : 0;
          return (
            <div key={comp} className="dash-bar-row">
              <span className="study-corr-label">{comp.replace(/_/g, ' ')}</span>
              <div className="dash-bar-track">
                <div
                  className="dash-bar-fill"
                  style={{ width: `${pct}%`, background: corr !== null && corr >= 0 ? '#22c55e' : '#ef4444' }}
                />
              </div>
              <span className="dash-bar-value" style={{ color: corrColor(corr) }}>
                {corrBar(corr)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Methodology Review
// ---------------------------------------------------------------------------

function ChangeCard({
  change,
  onStatusChange,
}: {
  change: ProposedChange;
  onStatusChange: (id: string, status: string) => void;
}) {
  const statusColors: Record<string, string> = {
    proposed: '#1e40af',
    accepted: '#166534',
    rejected: '#991b1b',
  };

  return (
    <div className="change-card">
      <div className="change-card-header">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13 }}>{change.component}</strong>
          <span className="pill pill-slate" style={{ fontSize: 11 }}>{change.confidence} confidence</span>
          <span className="pill pill-blue" style={{ fontSize: 11 }}>{change.impact}</span>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: statusColors[change.status] ?? 'var(--muted)' }}>
          {change.status.toUpperCase()}
        </span>
      </div>
      <div className="change-card-body">
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          <span className="muted">Current: </span><span>{change.current}</span>
          <span className="muted" style={{ margin: '0 6px' }}>→</span>
          <span style={{ fontWeight: 600 }}>{change.proposed}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{change.rationale}</div>
      </div>
      {change.status === 'proposed' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '4px 12px', color: '#166534', borderColor: '#22c55e' }}
            onClick={() => onStatusChange(change.id, 'accepted')}
          >
            Accept
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '4px 12px', color: '#991b1b', borderColor: '#ef4444' }}
            onClick={() => onStatusChange(change.id, 'rejected')}
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function MethodologyTab() {
  const [loading, setLoading]     = useState(false);
  const [running, setRunning]     = useState(false);
  const [reviews, setReviews]     = useState<MethodologyReview[]>([]);
  const [error, setError]         = useState('');
  const [runMsg, setRunMsg]       = useState('');
  const [loaded, setLoaded]       = useState(false);

  async function loadReviews() {
    setLoading(true);
    setError('');
    try {
      const data = await api<{ reviews: MethodologyReview[] }>('/study/methodology-reviews');
      setReviews(data.reviews || []);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }

  async function runReview() {
    setRunning(true);
    setRunMsg('');
    setError('');
    try {
      const data = await api<{ ok: boolean; reason?: string; overall_assessment?: string }>('/study/methodology-review', {
        method: 'POST',
      });
      if (data.ok) {
        setRunMsg('Review complete. Reloading…');
        await loadReviews();
      } else {
        setRunMsg(data.reason || 'Review unavailable');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    } finally {
      setRunning(false);
    }
  }

  async function handleStatusChange(reviewId: string, changeId: string, status: string) {
    try {
      await api(`/study/methodology-reviews/${reviewId}/changes/${changeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setReviews((prev) =>
        prev.map((r) => {
          if (r.id !== reviewId) return r;
          return {
            ...r,
            proposed_changes: r.proposed_changes.map((c) =>
              c.id === changeId ? { ...c, status: status as ProposedChange['status'] } : c
            ),
          };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update change');
    }
  }

  if (!loaded && !loading) {
    return (
      <div>
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <button className="btn btn-secondary" onClick={loadReviews}>Load Reviews</button>
          <button className="btn btn-primary" onClick={runReview} disabled={running}>
            {running ? 'Reviewing…' : 'Run Methodology Review'}
          </button>
        </div>
        {error  && <div className="banner banner-error">{error}</div>}
        {runMsg && <div className="banner banner-info">{runMsg}</div>}
      </div>
    );
  }

  if (loading) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={runReview} disabled={running}>
          {running ? 'Reviewing…' : 'Run New Review'}
        </button>
        <button className="btn btn-secondary" onClick={loadReviews}>Refresh</button>
      </div>

      {error  && <div className="banner banner-error" style={{ marginBottom: 12 }}>{error}</div>}
      {runMsg && <div className="banner banner-info" style={{ marginBottom: 12 }}>{runMsg}</div>}

      {reviews.length === 0 ? (
        <p className="muted">No methodology reviews yet. Run one above (requires ≥ 30 resolved outcomes).</p>
      ) : (
        reviews.map((review) => (
          <div key={review.id} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                  {new Date(review.reviewed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 10 }}>
                  {review.total_outcomes} outcomes · v{review.methodology_version}
                </span>
              </div>
            </div>
            {review.overall_assessment && (
              <div className="study-assessment">{review.overall_assessment}</div>
            )}
            {review.proposed_changes?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {review.proposed_changes.map((change) => (
                  <ChangeCard
                    key={change.id}
                    change={change}
                    onStatusChange={(cid, status) => handleStatusChange(review.id, cid, status)}
                  />
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StudySection — top-level component
// ---------------------------------------------------------------------------

type Tab = 'run' | 'analytics' | 'methodology';

export function StudySection() {
  const [tab, setTab] = useState<Tab>('run');

  return (
    <SectionCard title="Study">
      <div className="study-tabs">
        {(['run', 'analytics', 'methodology'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`study-tab-btn${tab === t ? ' study-tab-active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'run' ? 'Run Session' : t === 'analytics' ? 'Analytics' : 'Methodology Review'}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        {tab === 'run'         && <RunSessionTab />}
        {tab === 'analytics'   && <AnalyticsTab />}
        {tab === 'methodology' && <MethodologyTab />}
      </div>
    </SectionCard>
  );
}
