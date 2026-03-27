'use client';

import type { Verdict, WatchlistItem } from '../lib/types';
import { Pill } from './Pill';
import { SectionCard } from './SectionCard';

type Props = {
  tradeToday: WatchlistItem[];
  watchTomorrow: WatchlistItem[];
  rejected: WatchlistItem[];
  onAnalyzeTicker: (ticker: string) => void;
};

function verdictTone(v?: Verdict | string): 'green' | 'yellow' | 'red' | 'blue' | 'slate' {
  if (v === 'STRONG BUY') return 'green';
  if (v === 'BUY WATCH')  return 'blue';
  if (v === 'WAIT')       return 'yellow';
  if (v === 'AVOID')      return 'red';
  return 'slate';
}

function verdictLabel(item: WatchlistItem): string {
  if (item.verdict) return item.verdict;
  // Fallback for items without a verdict (e.g. re-scored with old backend)
  if (item.bucket === 'trade_today')    return 'STRONG BUY';
  if (item.bucket === 'watch_tomorrow') return 'BUY WATCH';
  return 'AVOID';
}

function ScoreDisplay({ item }: { item: WatchlistItem }) {
  const vLabel = verdictLabel(item);
  const tone   = verdictTone(item.verdict || vLabel);
  const hvsText = item.hvs_score != null ? `HVS ${item.hvs_score}/34` : `${item.score}/100`;
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <Pill label={vLabel} tone={tone} />
      <span className="muted" style={{ fontSize: 12 }}>{hvsText}</span>
    </div>
  );
}

export function BucketColumns({ tradeToday, watchTomorrow, rejected, onAnalyzeTicker }: Props) {
  return (
    <div className="three-col" style={{ marginTop: 16 }}>

      {/* Trade Today — STRONG BUY */}
      <div className="col-green">
        <SectionCard
          title="Trade Today"
          right={<Pill label={String(tradeToday.length)} tone="slate" />}
        >
          <div className="list-wrap">
            {tradeToday.length === 0 ? (
              <p className="muted">No names yet.</p>
            ) : (
              tradeToday.map((item) => (
                <button
                  key={item.id}
                  className="list-card action-card"
                  onClick={() => onAnalyzeTicker(item.ticker)}
                >
                  <div className="list-card-top">
                    <strong>{item.ticker}</strong>
                    <ScoreDisplay item={item} />
                  </div>
                  <div className="muted small">
                    {item.summary || item.company_name || 'Trade candidate'}
                  </div>
                  {item.trigger && (
                    <div className="small trigger">{item.trigger}</div>
                  )}
                </button>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      {/* Watch Tomorrow — BUY WATCH or WAIT */}
      <div className="col-yellow">
        <SectionCard
          title="Watch Tomorrow"
          right={<Pill label={String(watchTomorrow.length)} tone="slate" />}
        >
          <div className="list-wrap">
            {watchTomorrow.length === 0 ? (
              <p className="muted">No names yet.</p>
            ) : (
              watchTomorrow.map((item) => (
                <button
                  key={item.id}
                  className="list-card action-card"
                  onClick={() => onAnalyzeTicker(item.ticker)}
                >
                  <div className="list-card-top">
                    <strong>{item.ticker}</strong>
                    <ScoreDisplay item={item} />
                  </div>
                  <div className="muted small">
                    {item.summary || item.company_name || 'Watch candidate'}
                  </div>
                  {item.verdict === 'BUY WATCH' && item.trigger && (
                    <div className="small trigger">{item.trigger}</div>
                  )}
                  {item.verdict === 'WAIT' && (
                    <div className="small muted" style={{ marginTop: 8, fontSize: 12 }}>
                      Wait — conditions not yet met for entry
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </SectionCard>
      </div>

      {/* Reject — AVOID */}
      <div className="col-grey">
        <SectionCard
          title="Reject"
          right={<Pill label={String(rejected.length)} tone="slate" />}
        >
          <div className="list-wrap">
            {rejected.length === 0 ? (
              <p className="muted">No names yet.</p>
            ) : (
              rejected.map((item) => (
                <div key={item.id} className="list-card">
                  <div className="list-card-top">
                    <strong>{item.ticker}</strong>
                    <Pill label="AVOID" tone="red" />
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

    </div>
  );
}
