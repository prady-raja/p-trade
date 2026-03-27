'use client';

import type { WatchlistItem } from '../lib/types';
import { Pill } from './Pill';
import { SectionCard } from './SectionCard';

type Props = {
  tradeToday: WatchlistItem[];
  watchTomorrow: WatchlistItem[];
  rejected: WatchlistItem[];
  onAnalyzeTicker: (ticker: string) => void;
};

function scorePillTone(score: number): 'green' | 'yellow' | 'red' {
  if (score >= 75) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

export function BucketColumns({ tradeToday, watchTomorrow, rejected, onAnalyzeTicker }: Props) {
  return (
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
                onClick={() => onAnalyzeTicker(item.ticker)}
              >
                <div className="list-card-top">
                  <strong>{item.ticker}</strong>
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
                onClick={() => onAnalyzeTicker(item.ticker)}
              >
                <div className="list-card-top">
                  <strong>{item.ticker}</strong>
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
  );
}
