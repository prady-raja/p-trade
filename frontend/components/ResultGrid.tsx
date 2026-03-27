'use client';

import type { TradeReviewResult } from '../lib/types';
import { Pill } from './Pill';

export function ResultGrid({ result }: { result: TradeReviewResult }) {
  const isRejected =
    (result.hard_blockers && result.hard_blockers.length > 0) ||
    result.bucket === 'Reject' ||
    result.bucket === 'Needs Work';

  const bucketTone =
    result.bucket === 'Trade Today'
      ? 'green'
      : result.bucket === 'Watch Tomorrow'
      ? 'yellow'
      : 'red';

  const fmt = (n: number) =>
    '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="result-grid">
      {/* Score and Bucket */}
      <div className="metric">
        <div className="metric-label">Score</div>
        <div className="metric-value">{result.total_score}/100</div>
      </div>
      <div className="metric">
        <div className="metric-label">Bucket</div>
        <div className="metric-value">
          <Pill label={result.bucket || 'Unknown'} tone={bucketTone} />
        </div>
      </div>

      {/* Price */}
      {result.price != null && (
        <div className="metric">
          <div className="metric-label">Price (LTP)</div>
          <div className="metric-value">{fmt(result.price)}</div>
        </div>
      )}

      {/* Score breakdown */}
      {result.score_breakdown && (
        <div className="metric">
          <div className="metric-label">Score Breakdown</div>
          <div className="metric-value" style={{ fontSize: 13, lineHeight: 1.9 }}>
            Trend&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{result.score_breakdown.trend}/30
            <br />
            Strength&nbsp;&nbsp;&nbsp;&nbsp;{result.score_breakdown.strength}/25
            <br />
            Participation&nbsp;{result.score_breakdown.participation}/20
            <br />
            RS vs Nifty&nbsp;&nbsp;{result.score_breakdown.rs_vs_nifty}/15
            <br />
            Weekly&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{result.score_breakdown.weekly}/10
          </div>
        </div>
      )}

      {/* Hard blockers */}
      {result.hard_blockers && result.hard_blockers.length > 0 && (
        <div className="metric metric-wide">
          <div className="metric-label">Hard Blockers</div>
          <div className="metric-value danger" style={{ fontSize: 13, lineHeight: 1.8 }}>
            {result.hard_blockers.map((b, i) => (
              <div key={i}>⛔ {b}</div>
            ))}
          </div>
        </div>
      )}

      {/* Not tradeable gate / trade plan */}
      {isRejected ? (
        <div className="metric metric-wide">
          <div className="metric-label">Trade Plan</div>
          <div className="metric-value danger">
            Not tradeable under PTS rules — do not enter this position.
          </div>
        </div>
      ) : (
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
      )}

      {/* Reasons */}
      {result.reasons && result.reasons.length > 0 && (
        <div className="metric metric-wide">
          <div className="metric-label">Why This Bucket</div>
          <div className="metric-value" style={{ fontSize: 13, lineHeight: 1.8 }}>
            {result.reasons.map((r, i) => (
              <div key={i}>✓ {r}</div>
            ))}
          </div>
        </div>
      )}

      {/* Soft blockers */}
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

      {/* Weekly note */}
      {result.weekly_note && (
        <div className="metric metric-wide">
          <div className="metric-label">Weekly Chart</div>
          <div className="metric-value muted">{result.weekly_note}</div>
        </div>
      )}

      {/* Invalidation rule */}
      {result.invalidation_rule && (
        <div className="metric metric-wide">
          <div className="metric-label">Invalidation Rule</div>
          <div className="metric-value danger" style={{ fontSize: 13 }}>
            {result.invalidation_rule}
          </div>
        </div>
      )}

      {/* AI explanation */}
      {result.ai_explanation && (
        <div className="metric metric-wide">
          <div className="metric-label">AI Analysis</div>
          <div className="metric-value muted">{result.ai_explanation}</div>
        </div>
      )}
    </div>
  );
}
