'use client';

import { useState } from 'react';
import type { TradeRecord, TradeStatus } from '../lib/types';
import { Pill } from './Pill';
import { SectionCard } from './SectionCard';

type Props = {
  trades: TradeRecord[];
  onUpdate: (id: string, patch: Partial<TradeRecord>) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdictTone(v?: string | null): 'green' | 'yellow' | 'red' | 'blue' | 'slate' {
  if (v === 'STRONG BUY') return 'green';
  if (v === 'BUY WATCH')  return 'blue';
  if (v === 'WAIT')       return 'yellow';
  if (v === 'AVOID')      return 'red';
  return 'slate';
}

type StatusPillInfo = { label: string; tone: 'green' | 'yellow' | 'red' | 'blue' | 'slate' };

function statusPill(status: string): StatusPillInfo {
  switch (status) {
    case 'open':    return { label: 'OPEN',    tone: 'blue' };
    case 'hit_t1':  return { label: 'T1 HIT',  tone: 'green' };
    case 'hit_t2':  return { label: 'T2 HIT',  tone: 'green' };
    case 'stopped': return { label: 'STOPPED', tone: 'red' };
    case 'closed':  return { label: 'CLOSED',  tone: 'slate' };
    default:        return { label: status.toUpperCase(), tone: 'slate' };
  }
}

function fmtPrice(s: string | null): string {
  if (!s) return '—';
  const n = parseFloat(s);
  if (isNaN(n)) return '—';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Trailing SL zone logic
// ---------------------------------------------------------------------------

type ZoneInfo = {
  zone: number;
  sl: number;
  pct: number | null;
  action: string;
  desc: string;
};

function trailZone(trade: TradeRecord): ZoneInfo | null {
  if (trade.status !== 'open' && trade.status !== 'hit_t1') return null;

  const entry = parseFloat(trade.entry     ?? '0');
  const stop  = parseFloat(trade.stop_loss ?? '0');
  const t1    = parseFloat(trade.target_1  ?? '0');
  const t2    = parseFloat(trade.target_2  ?? '0');
  const cp    = trade.current_price;

  if (trade.status === 'open') {
    return {
      zone: 1, sl: stop, pct: null,
      action: 'Hold original stop loss',
      desc: 'T1 not reached yet — no stop adjustment needed',
    };
  }

  // status === 'hit_t1'
  if (cp === null || t2 <= t1) {
    return {
      zone: 2, sl: entry, pct: null,
      action: 'Move SL to breakeven',
      desc: "Enter today's price to get zone guidance",
    };
  }

  const progress = Math.min(Math.max((cp - t1) / (t2 - t1), 0), 1);

  if (progress < 0.5) {
    return {
      zone: 2, sl: entry, pct: progress,
      action: 'Move SL to breakeven',
      desc: 'T1 hit — move stop to entry price',
    };
  }
  if (progress < 0.8) {
    return {
      zone: 3, sl: t1, pct: progress,
      action: 'Trail SL up to T1',
      desc: 'Lock in minimum profit',
    };
  }
  return {
    zone: 4, sl: (t1 + t2) / 2, pct: progress,
    action: 'Tighten — near target',
    desc: 'Protect most of the gain',
  };
}

// ---------------------------------------------------------------------------
// TradeCard — one per trade row (isolated state per trade)
// ---------------------------------------------------------------------------

function TradeCard({
  trade,
  onUpdate,
}: {
  trade: TradeRecord;
  onUpdate: (id: string, patch: Partial<TradeRecord>) => Promise<void>;
}) {
  const [expanded,      setExpanded]      = useState(false);
  const [formStatus,    setFormStatus]    = useState<string>(trade.status);
  const [formCurPrice,  setFormCurPrice]  = useState('');
  const [formExitPrice, setFormExitPrice] = useState('');
  const [saving,        setSaving]        = useState(false);
  const [saveError,     setSaveError]     = useState('');

  const zone      = trailZone(trade);
  const sp        = statusPill(trade.status);
  const hasBelow  = zone !== null || expanded;
  const needsExit = formStatus === 'stopped' || formStatus === 'closed';

  const t1 = parseFloat(trade.target_1 ?? '0');
  const t2 = parseFloat(trade.target_2 ?? '0');

  function openForm() {
    setFormStatus(trade.status);
    setFormCurPrice(trade.current_price != null ? String(trade.current_price) : '');
    setFormExitPrice(trade.exit_price   != null ? String(trade.exit_price)    : '');
    setSaveError('');
    setExpanded(true);
  }

  function closeForm() {
    setExpanded(false);
    setSaveError('');
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      const patch: Partial<TradeRecord> = {};
      if (formStatus !== trade.status) patch.status = formStatus as TradeStatus;
      const cp = parseFloat(formCurPrice);
      if (!isNaN(cp) && cp > 0) patch.current_price = cp;
      if (needsExit) {
        const ep = parseFloat(formExitPrice);
        if (!isNaN(ep) && ep > 0) patch.exit_price = ep;
      }
      await onUpdate(trade.id, patch);
      setExpanded(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to update trade');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 12 }}>
      {/* ── Trade row card ── */}
      <div
        className="list-card"
        style={hasBelow ? { borderRadius: '10px 10px 0 0', borderBottom: 'none' } : undefined}
      >
        <div className="trade-row">
          <div className="trade-row-left">
            <strong style={{ fontSize: 15, flexShrink: 0 }}>{trade.ticker}</strong>
            {trade.verdict
              ? <Pill label={trade.verdict} tone={verdictTone(trade.verdict)} />
              : <Pill label="—" tone="slate" />
            }
            {trade.hvs_score != null && (
              <span className="pill pill-slate" style={{ fontSize: 11, padding: '2px 8px' }}>
                HVS {trade.hvs_score}/34
              </span>
            )}
          </div>
          <div className="trade-row-center">
            Entry {fmtPrice(trade.entry)} · SL {fmtPrice(trade.stop_loss)} · T1 {fmtPrice(trade.target_1)}
          </div>
          <div className="trade-row-right">
            <Pill label={sp.label} tone={sp.tone} />
            <button
              className="btn btn-secondary"
              style={{ padding: '5px 10px', fontSize: 12 }}
              onClick={expanded ? closeForm : openForm}
            >
              {expanded ? 'Close ▴' : 'Update ▾'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Trailing SL strip ── */}
      {zone && (
        <div
          className={`trail-strip trail-zone-${zone.zone}`}
          style={expanded ? { borderRadius: 0 } : undefined}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`zone-chip zone-${zone.zone}-chip`}>Zone {zone.zone}</span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{zone.action}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{zone.desc}</div>
          </div>
          <div className="trail-gtt">GTT Stop: ₹{zone.sl.toLocaleString('en-IN')}</div>
          {trade.status === 'hit_t1' && trade.current_price !== null && zone.pct !== null && (
            <div style={{ width: '100%' }}>
              <div className="trail-bar-labels">
                <span>T1 ₹{t1.toLocaleString('en-IN')}</span>
                <span>T2 ₹{t2.toLocaleString('en-IN')}</span>
              </div>
              <div className="trail-bar-track">
                <div
                  className="trail-bar-fill"
                  style={{ width: `${Math.round(zone.pct * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Inline update form ── */}
      {expanded && (
        <div className="update-form">
          <div className="update-form-grid">
            <div>
              <span className="form-label">Current Price (₹)</span>
              <input
                type="number"
                value={formCurPrice}
                onChange={(e) => setFormCurPrice(e.target.value)}
                placeholder="e.g. 1540"
              />
            </div>
            <div>
              <span className="form-label">Status</span>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
              >
                <option value="open">Open</option>
                <option value="hit_t1">T1 Hit</option>
                <option value="hit_t2">T2 Hit</option>
                <option value="stopped">Stopped Out</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
          {needsExit && (
            <div style={{ marginBottom: 12 }}>
              <span className="form-label">Exit Price (₹)</span>
              <input
                type="number"
                value={formExitPrice}
                onChange={(e) => setFormExitPrice(e.target.value)}
                placeholder="e.g. 1480"
              />
            </div>
          )}
          {saveError && (
            <div className="banner banner-error" style={{ marginBottom: 10 }}>{saveError}</div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-secondary" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// JournalSection
// ---------------------------------------------------------------------------

export function JournalSection({ trades, onUpdate }: Props) {
  return (
    <SectionCard title="Trades">
      {trades.length === 0 ? (
        <p className="muted">No trades yet — log your first from Review above</p>
      ) : (
        <div>
          {trades.map((trade) => (
            <TradeCard key={trade.id} trade={trade} onUpdate={onUpdate} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
