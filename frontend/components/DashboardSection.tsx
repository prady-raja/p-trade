'use client';

import type { TradeRecord } from '../lib/types';
import { SectionCard } from './SectionCard';

type Props = {
  trades: TradeRecord[];
};

export function DashboardSection({ trades }: Props) {
  // ---------------------------------------------------------------------------
  // Computations — pure, no API calls
  // ---------------------------------------------------------------------------

  const total  = trades.length;
  const open   = trades.filter((t) => t.status === 'open').length;
  const won    = trades.filter((t) => t.status === 'hit_t1' || t.status === 'hit_t2').length;
  const lost   = trades.filter((t) => t.status === 'stopped').length;
  const closed = won + lost + trades.filter((t) => t.status === 'closed').length;

  const winRate =
    closed > 0 ? Math.round((won / closed) * 100) : null;

  const hvsValues = trades
    .filter((t) => t.hvs_score !== null)
    .map((t) => t.hvs_score!);
  const avgHvs =
    hvsValues.length > 0
      ? Math.round((hvsValues.reduce((a, b) => a + b, 0) / hvsValues.length) * 10) / 10
      : null;

  // ---------------------------------------------------------------------------
  // Bar chart rows — newest first, max 20
  // ---------------------------------------------------------------------------

  const barRows = trades.slice(0, 20).map((trade) => {
    const entryF = parseFloat(trade.entry ?? '');
    if (trade.exit_price !== null && !isNaN(entryF) && entryF > 0) {
      const pct   = (trade.exit_price - entryF) / entryF;
      const width = Math.min(Math.abs(pct) * 500, 100).toFixed(1) + '%';
      const color = pct > 0 ? '#22c55e' : '#ef4444';
      const valueColor = pct > 0 ? '#166534' : '#991b1b';
      const sign  = pct > 0 ? '+' : '';
      const valueStr = `${sign}${(pct * 100).toFixed(1)}%`;
      return { ticker: trade.ticker, width, color, valueStr, valueColor, status: null };
    }
    return {
      ticker: trade.ticker,
      width: '15%',
      color: '#d1d5db',
      valueStr: null,
      valueColor: 'var(--muted)',
      status: trade.status,
    };
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <SectionCard title="Performance">
      {total === 0 ? (
        <p className="muted">No trades yet — log your first trade to see performance</p>
      ) : (
        <>
          {/* 2×2 stat grid */}
          <div className="dash-grid">
            <div className="dash-stat">
              <div className="dash-stat-label">Open</div>
              <div className="dash-stat-value">{open}</div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-label">Win Rate</div>
              <div className="dash-stat-value">
                {winRate !== null ? `${winRate}%` : '—'}
              </div>
              <div className="dash-stat-sub">{won}W / {lost}L</div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-label">P&amp;L</div>
              <div className="dash-stat-value">—</div>
              <div className="dash-stat-sub">Qty tracking coming soon</div>
            </div>
            <div className="dash-stat">
              <div className="dash-stat-label">Avg HVS</div>
              <div className="dash-stat-value">
                {avgHvs !== null ? `${avgHvs}/34` : '—'}
              </div>
              <div className="dash-stat-sub">Average setup quality</div>
            </div>
          </div>

          {/* Trade outcome bars */}
          <div className="dash-chart-label">Trade Outcomes</div>
          {barRows.map((row, i) => (
            <div key={i} className="dash-bar-row">
              <div className="dash-bar-ticker">{row.ticker}</div>
              <div className="dash-bar-track">
                <div
                  className="dash-bar-fill"
                  style={{ width: row.width, background: row.color }}
                />
              </div>
              <div className="dash-bar-value" style={{ color: row.valueColor }}>
                {row.valueStr ?? (
                  <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                    {row.status}
                  </span>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </SectionCard>
  );
}
