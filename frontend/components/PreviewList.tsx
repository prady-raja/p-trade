'use client';

import type { WatchlistItem } from '../lib/types';
import { Pill } from './Pill';
import { SectionCard } from './SectionCard';

type Props = {
  importedItems: WatchlistItem[];
  watchlist: WatchlistItem[];
  onRemove: (id: string) => void;
};

export function PreviewList({ importedItems, watchlist, onRemove }: Props) {
  return (
    <SectionCard
      title={
        importedItems.length > 0
          ? `Phase 1 — Preview (${importedItems.length} names)`
          : watchlist.length > 0
          ? 'Phase 2 — Scored (see buckets below)'
          : 'Preview'
      }
      right={
        importedItems.length > 0 ? <Pill label="Review then score" tone="blue" /> : undefined
      }
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
                    onClick={() => onRemove(item.id)}
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
  );
}
