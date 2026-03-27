'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import type { TradeRecord } from '../lib/types';
import { Pill } from './Pill';
import { SectionCard } from './SectionCard';

type Props = {
  trades: TradeRecord[];
  onRefresh: () => void;
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

function statusPill(status: string): { label: string; tone: 'green' | 'yellow' | 'red' | 'blue' | 'slate' } {
  switch (status) {
    case 'open':    return { label: 'OPEN',    tone: 'blue' };
    case 'hit_t1':  return { label: 'T1 HIT',  tone: 'green' };
    case 'hit_t2':  return { label: 'T2 HIT',  tone: 'green' };
    case 'stopped': return { label: 'STOPPED', tone: 'red' };
    case 'closed':  return { label: 'CLOSED',  tone: 'slate' };
    default:        return { label: status.toUpperCase(), tone: 'slate' };
  }
}

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Trailing SL zone logic
// ---------------------------------------------------------------------------

type ZoneInfo = {
  zone: number;
  zoneLabel: string;
  action: string;
  sl: number;
  progressPct?: number; // 0-100, only when status=hit_t1 and current_price is set
};

const ZONE_LABELS = [
  '',
  'Zone 1 — Hold Original',
  'Zone 2 — Breakeven',
  'Zone 3 — Trail to T1',
  'Zone 4 — Tighten',
];

function trailZone(trade: TradeRecord): ZoneInfo | null {
  if (trade.status !== 'open' && trade.status !== 'hit_t1') return null;

  const entry = parseFloat(trade.entry ?? '');
  const sl    = parseFloat(trade.stop_loss ?? '');
  const t1    = parseFloat(trade.target_1 ?? '');
  const t2    = parseFloat(trade.target_2 ?? '');

  if (isNaN(sl) || isNaN(entry)) return null;

  if (trade.status === 'open') {
    return {
      zone: 1,
      zoneLabel: ZONE_LABELS[1],
      sl,
      action: 'T1 not reached yet — no stop adjustment needed',
    };
  }

  // status === 'hit_t1'
  const cp = trade.current_price;

  if (!cp || isNaN(t1) || isNaN(t2) || t2 <= t1) {
    return {
      zone: 2,
      zoneLabel: ZONE_LABELS[2],
      sl: entry,
      action: 'Enter current price above to get precise zone guidance',
    };
  }

  const rawProgress = (cp - t1) / (t2 - t1);
  const progress    = Math.max(0, Math.min(1, rawProgress));
  const progressPct = Math.round(progress * 100);

  if (progress < 0.5) {
    return { zone: 2, zoneLabel: ZONE_LABELS[2], sl: entry, action: 'Move SL to breakeven', progressPct };
  }
  if (progress < 0.8) {
    return { zone: 3, zoneLabel: ZONE_LABELS[3], sl: t1, action: 'Trail SL up to T1 — lock minimum profit', progressPct };
  }
  const midpoint = (t1 + t2) / 2;
  return { zone: 4, zoneLabel: ZONE_LABELS[4], sl: midpoint, action: 'Tighten SL — near target', progressPct };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JournalSection({ trades, onRefresh }: Props) {
  const [expandedId,      setExpandedId]      = useState<string | null>(null);
  const [formStatus,      setFormStatus]      = useState('open');
  const [formCurPrice,    setFormCurPrice]    = useState('');
  const [formExitPrice,   setFormExitPrice]   = useState('');
  const [saving,          setSaving]          = useState(false);
  const [saveError,       setSaveError]       = useState('');

  function openForm(trade: TradeRecord) {
    setExpandedId(trade.id);
    setFormStatus(trade.status);
    setFormCurPrice(trade.current_price != null ? String(trade.current_price) : '');
    setFormExitPrice(trade.exit_price   != null ? String(trade.exit_price)    : '');
    setSaveError('');
  }

  function closeForm() {
    setExpandedId(null);
    setFormStatus('open');
    setFormCurPrice('');
    setFormExitPrice('');
    setSaveError('');
  }

  async function saveUpdate(tradeId: string) {
    setSaving(true);
    setSaveError('');
    try {
      const body: Record<string, unknown> = { status: formStatus };
      if (formCurPrice)  body.current_price = parseFloat(formCurPrice);
      const needsExit = formStatus === 'stopped' || formStatus === 'closed';
      if (needsExit && formExitPrice) body.exit_price = parseFloat(formExitPrice);

      await api(`/trades/${tradeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      closeForm();
      onRefresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to update trade');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard title="6. Journal">
      {trades.length === 0 ? (
        <p className="muted">
          No trades logged yet. Analyze a winner and log it from Section 5.
        </p>
      ) : (
        <div className="list-wrap">
          {trades.map((trade) => {
            const zone       = trailZone(trade);
            const sp         = statusPill(trade.status);
            const isExpanded = expandedId === trade.id;
            const needsExit  = formStatus === 'stopped' || formStatus === 'closed';

            return (
              <div key={trade.id}>
                {/* ── Trade row card ── */}
                <div
                  className="list-card"
                  style={{ borderRadius: zone ? '14px 14px 0 0' : undefined }}
                >
                  {/* Row 1: ticker + verdict + status + HVS */}
                  <div className="list-card-top">
                    <strong style={{ fontSize: 15 }}>{trade.ticker}</strong>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {trade.verdict && (
                        <Pill label={trade.verdict} tone={verdictTone(trade.verdict)} />
                      )}
                      <Pill label={sp.label} tone={sp.tone} />
                      {trade.hvs_score != null && (
                        <span className="pill pill-slate" style={{ fontSize: 11, padding: '3px 8px' }}>
                          HVS {trade.hvs_score}/34
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Row 2: price levels */}
                  <div className="small muted" style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                    {trade.entry     && <span>Entry <strong style={{ color: 'var(--text)' }}>₹{trade.entry}</strong></span>}
                    {trade.stop_loss && <span>SL <strong className="danger">₹{trade.stop_loss}</strong></span>}
                    {trade.target_1  && <span>T1 <strong className="success">₹{trade.target_1}</strong></span>}
                    {trade.target_2  && <span>T2 <strong className="success">₹{trade.target_2}</strong></span>}
                    {trade.current_price != null && (
                      <span>CMP <strong style={{ color: 'var(--text)' }}>₹{trade.current_price}</strong></span>
                    )}
                  </div>

                  {/* Row 3: note */}
                  {trade.note && (
                    <div className="small muted" style={{ marginTop: 6 }}>{trade.note}</div>
                  )}

                  {/* Row 4: update button / inline form */}
                  <div style={{ marginTop: 10 }}>
                    {isExpanded ? (
                      <div className="stack">
                        <div className="form-grid" style={{ marginBottom: 0 }}>
                          <label>
                            <span>Current Price</span>
                            <input
                              type="number"
                              value={formCurPrice}
                              onChange={(e) => setFormCurPrice(e.target.value)}
                              placeholder="e.g. 1540"
                            />
                          </label>
                          <label>
                            <span>Status</span>
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
                          </label>
                        </div>
                        {needsExit && (
                          <label>
                            <span>Exit Price</span>
                            <input
                              type="number"
                              value={formExitPrice}
                              onChange={(e) => setFormExitPrice(e.target.value)}
                              placeholder="e.g. 1480"
                            />
                          </label>
                        )}
                        {saveError && (
                          <div className="banner banner-error">{saveError}</div>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            className="btn btn-primary"
                            onClick={() => saveUpdate(trade.id)}
                            disabled={saving}
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button className="btn btn-secondary" onClick={closeForm}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: 13 }}
                        onClick={() => openForm(trade)}
                      >
                        Update
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Trailing SL zone strip ── */}
                {zone && (
                  <div className={`trail-strip trail-strip-${zone.zone}`}>
                    <div>
                      <span className={`zone-chip zone-${zone.zone}`}>{zone.zoneLabel}</span>
                      <span style={{ marginLeft: 10, fontSize: 13 }}>{zone.action}</span>
                      {zone.progressPct !== undefined && (
                        <div className="trail-bar-track">
                          <div
                            className="trail-bar-fill"
                            style={{ width: `${zone.progressPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
                      GTT Stop: {fmt(zone.sl)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
