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
  // Position sizing
  capital: number;
  onCapitalChange: (n: number) => void;
  marketRegime: string | undefined;
};

function verdictTone(v?: Verdict | string): 'green' | 'yellow' | 'red' | 'blue' | 'slate' {
  if (v === 'STRONG BUY') return 'green';
  if (v === 'BUY WATCH')  return 'blue';
  if (v === 'WAIT')       return 'yellow';
  if (v === 'AVOID')      return 'red';
  return 'slate';
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

type SizingResult = {
  qty: number;
  deployed: number;
  atRisk: number;
  pctAtRisk: number;
  riskPct: number;
};

function computeSizing(
  capital: number,
  entry: number | undefined,
  stopLoss: number | undefined,
  regime: string | undefined,
): SizingResult | null {
  if (!capital || !entry || !stopLoss) return null;
  const riskPct = regime === 'yellow' ? 0.01 : 0.02;
  const riskPerShare = entry - stopLoss;
  if (riskPerShare <= 0) return null;
  const qty = Math.floor((capital * riskPct) / riskPerShare);
  if (qty === 0) return null;
  const deployed = qty * entry;
  const atRisk = qty * riskPerShare;
  const pctAtRisk = (atRisk / capital) * 100;
  return { qty, deployed, atRisk, pctAtRisk, riskPct };
}

export function WinnerDetail({
  analysis,
  tradeNote,
  onTradeNoteChange,
  onLogTrade,
  capital,
  onCapitalChange,
  marketRegime,
}: Props) {
  return (
    <SectionCard title="Review">
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
              {/* Position sizing */}
              <label>
                <span>Capital (₹)</span>
                <input
                  type="number"
                  value={capital || ''}
                  onChange={(e) => onCapitalChange(parseFloat(e.target.value) || 0)}
                  placeholder="Your total capital e.g. 500000"
                />
              </label>
              {(() => {
                const sizing = computeSizing(
                  capital,
                  analysis.trigger_price,
                  analysis.stop_loss,
                  marketRegime,
                );
                if (!sizing) return null;
                const ruleLabel =
                  sizing.riskPct === 0.01 ? '— 1% rule (yellow market)' : '— 2% rule';
                return (
                  <div className="sizing-result">
                    Buy {sizing.qty} shares · ₹{fmtNum(sizing.deployed)} deployed ·{' '}
                    <span className="success">
                      ₹{fmtNum(sizing.atRisk)} at risk ({sizing.pctAtRisk.toFixed(1)}%)
                    </span>
                    {' '}{ruleLabel}
                  </div>
                );
              })()}

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
