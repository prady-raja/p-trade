'use client';

import type { GateResult, GateStatus, TradeReviewResult, Verdict } from '../lib/types';
import { Pill } from './Pill';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function verdictTone(v?: Verdict | string): 'green' | 'yellow' | 'red' | 'blue' | 'slate' {
  if (v === 'STRONG BUY') return 'green';
  if (v === 'BUY WATCH')  return 'blue';
  if (v === 'WAIT')       return 'yellow';
  if (v === 'AVOID')      return 'red';
  return 'slate';
}

function gateIcon(status: GateStatus): string {
  if (status === 'passed')                return '✓';
  if (status === 'failed')                return '✗';
  if (status === 'unavailable')           return '—';
  if (status === 'manual_review_required') return '⚠';
  return '?';
}

function gateColor(status: GateStatus): string {
  if (status === 'passed')   return 'success';
  if (status === 'failed')   return 'danger';
  if (status === 'unavailable') return 'muted';
  return '';
}

function fmt(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Sub-sections
// ---------------------------------------------------------------------------

function GatesSection({ gates }: { gates: GateResult[] }) {
  if (!gates || gates.length === 0) return null;
  return (
    <div className="metric metric-wide">
      <div className="metric-label">Hard Gates</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        {gates.map((gate) => (
          <div
            key={gate.name}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13 }}
          >
            <span
              className={gateColor(gate.status)}
              style={{ fontWeight: 800, minWidth: 14, lineHeight: 1.6 }}
            >
              {gateIcon(gate.status)}
            </span>
            <div>
              <span style={{ fontWeight: 700 }}>{gate.label}</span>
              <span className="muted" style={{ marginLeft: 8 }}>
                {gate.description}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HvsSection({
  hvs_score,
  hvs_breakdown,
}: {
  hvs_score?: number;
  hvs_breakdown?: TradeReviewResult['hvs_breakdown'];
}) {
  if (hvs_score == null) return null;
  return (
    <div className="metric">
      <div className="metric-label">HVS — High Value Score</div>
      <div className="metric-value" style={{ fontSize: 22, fontWeight: 900 }}>
        {hvs_score}
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginLeft: 2 }}>
          /34
        </span>
      </div>
      {hvs_breakdown && (
        <div style={{ fontSize: 12, lineHeight: 2, marginTop: 6, color: 'var(--muted)' }}>
          <div>
            Trend&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>
              {hvs_breakdown.trend}/14
            </span>
          </div>
          <div>
            Momentum&nbsp;
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>
              {hvs_breakdown.momentum}/12
            </span>
          </div>
          <div>
            RS / Nifty&nbsp;
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>
              {hvs_breakdown.rs_vs_nifty}/8
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function OptSection({
  opt_score,
  opt_breakdown,
}: {
  opt_score?: number;
  opt_breakdown?: TradeReviewResult['opt_breakdown'];
}) {
  if (opt_score == null) return null;
  return (
    <div className="metric">
      <div className="metric-label">OPT — Timing / Polish</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <div className="metric-value" style={{ fontSize: 22, fontWeight: 900 }}>
          {opt_score}
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', marginLeft: 2 }}>
            /14
          </span>
        </div>
        <span className="muted" style={{ fontSize: 11 }}>does not change verdict</span>
      </div>
      {opt_breakdown && (
        <div style={{ fontSize: 12, lineHeight: 2, marginTop: 6, color: 'var(--muted)' }}>
          <div>
            Participation&nbsp;
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>
              {opt_breakdown.participation}/8
            </span>
          </div>
          <div>
            Weekly&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>
              {opt_breakdown.weekly}/6
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ResultGrid
// ---------------------------------------------------------------------------

export function ResultGrid({ result }: { result: TradeReviewResult }) {
  const verdict   = result.verdict;
  const tradeable = result.tradeable;

  return (
    <div className="result-grid">

      {/* ── Row 1: Verdict + Price ── */}
      <div className="metric">
        <div className="metric-label">Verdict</div>
        <div className="metric-value" style={{ marginTop: 4 }}>
          <Pill
            label={verdict || result.bucket || 'Unknown'}
            tone={verdictTone(verdict)}
          />
        </div>
        {!tradeable && (
          <div className="danger" style={{ fontSize: 12, marginTop: 8, fontWeight: 600 }}>
            {verdict === 'AVOID' ? 'Not tradeable — do not enter.' : 'Not yet tradeable — wait for conditions to improve.'}
          </div>
        )}
      </div>

      {result.price != null && (
        <div className="metric">
          <div className="metric-label">Price (LTP)</div>
          <div className="metric-value">{fmt(result.price)}</div>
        </div>
      )}

      {/* ── Row 2: Hard Gates (full width) ── */}
      <GatesSection gates={result.gates} />

      {/* ── Row 3: HVS + OPT ── */}
      <HvsSection hvs_score={result.hvs_score} hvs_breakdown={result.hvs_breakdown} />
      <OptSection opt_score={result.opt_score} opt_breakdown={result.opt_breakdown} />

      {/* ── Trade Plan ── only for tradeable setups ── */}
      {tradeable ? (
        <>
          <div className="metric">
            <div className="metric-label">Trigger (Enter Above)</div>
            <div className="metric-value">
              {result.trigger_price != null ? fmt(result.trigger_price) : '—'}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Stop Loss</div>
            <div className="metric-value danger">
              {result.stop_loss != null ? fmt(result.stop_loss) : '—'}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Target 1</div>
            <div className="metric-value success">
              {result.target_1 != null ? fmt(result.target_1) : '—'}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Target 2</div>
            <div className="metric-value success">
              {result.target_2 != null ? fmt(result.target_2) : '—'}
            </div>
          </div>
          <div className="metric">
            <div className="metric-label">Risk / Reward</div>
            <div className="metric-value">
              {result.risk_reward != null ? `1:${result.risk_reward}` : '—'}
            </div>
          </div>
        </>
      ) : (
        <div className="metric metric-wide">
          <div className="metric-label">Trade Plan</div>
          <div className="metric-value danger">
            {verdict === 'AVOID'
              ? 'Not tradeable under PTS rules — do not enter this position.'
              : 'Setup not yet actionable — re-evaluate when HVS improves or conditions align.'}
          </div>
        </div>
      )}

      {/* ── Reasons ── */}
      {result.reasons && result.reasons.length > 0 && (
        <div className="metric metric-wide">
          <div className="metric-label">Why This Verdict</div>
          <div className="metric-value" style={{ fontSize: 13, lineHeight: 1.8 }}>
            {result.reasons.map((r, i) => (
              <div key={i}>· {r}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Cautions ── */}
      {result.blockers && result.blockers.length > 0 && (
        <div className="metric metric-wide">
          <div className="metric-label">Cautions</div>
          <div className="metric-value" style={{ fontSize: 13, lineHeight: 1.8 }}>
            {result.blockers.map((b, i) => (
              <div key={i}>⚠ {b}</div>
            ))}
          </div>
        </div>
      )}

      {/* ── Weekly note ── */}
      {result.weekly_note && (
        <div className="metric metric-wide">
          <div className="metric-label">Weekly Chart</div>
          <div className="metric-value muted">{result.weekly_note}</div>
        </div>
      )}

      {/* ── Invalidation rule ── */}
      {result.invalidation_rule && (
        <div className="metric metric-wide">
          <div className="metric-label">Invalidation Rule</div>
          <div className="metric-value danger" style={{ fontSize: 13 }}>
            {result.invalidation_rule}
          </div>
        </div>
      )}

      {/* ── AI analysis ── */}
      {result.ai_explanation && (
        <div className="metric metric-wide">
          <div className="metric-label">AI Analysis</div>
          <div className="metric-value muted">{result.ai_explanation}</div>
        </div>
      )}

    </div>
  );
}
