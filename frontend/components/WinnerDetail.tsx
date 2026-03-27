'use client';

import type { TradeReviewResult, Verdict } from '../lib/types';
import { Pill } from './Pill';
import { ResultGrid } from './ResultGrid';
import { SectionCard } from './SectionCard';

type Props = {
  analysis: TradeReviewResult | null;
  tradeNote: string;
  onTradeNoteChange: (note: string) => void;
  onLogTrade: () => void;
};

function verdictTone(v?: Verdict | string): 'green' | 'yellow' | 'red' | 'blue' | 'slate' {
  if (v === 'STRONG BUY') return 'green';
  if (v === 'BUY WATCH')  return 'blue';
  if (v === 'WAIT')       return 'yellow';
  if (v === 'AVOID')      return 'red';
  return 'slate';
}

export function WinnerDetail({ analysis, tradeNote, onTradeNoteChange, onLogTrade }: Props) {
  return (
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
                label={analysis.verdict || analysis.bucket || 'Unknown'}
                tone={verdictTone(analysis.verdict)}
              />
            </div>
          </div>

          <ResultGrid result={analysis} />

          {/* Log Trade — shown only for tradeable setups (BUY WATCH or STRONG BUY) */}
          {analysis.tradeable && (
            <div className="stack top-gap">
              <label>
                <span>Trade note</span>
                <textarea
                  value={tradeNote}
                  onChange={(e) => onTradeNoteChange(e.target.value)}
                  placeholder="Why you are taking this trade"
                  rows={3}
                />
              </label>
              <button className="btn btn-primary" onClick={onLogTrade}>
                Log Trade
              </button>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
