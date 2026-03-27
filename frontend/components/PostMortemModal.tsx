'use client';

import { useEffect, useState } from 'react';
import type { TradeRecord } from '../lib/types';

type Props = {
  trade: TradeRecord | null;
  onSave: (id: string, pm: {
    pm_checks: string;
    pm_lesson: string;
    pm_market: string;
  }) => Promise<void>;
  onClose: () => void;
};

export function PostMortemModal({ trade, onSave, onClose }: Props) {
  const [pmChecks, setPmChecks] = useState('');
  const [pmLesson, setPmLesson] = useState('');
  const [pmMarket, setPmMarket] = useState('');
  const [saving,   setSaving]   = useState(false);

  // Pre-populate when trade changes
  useEffect(() => {
    if (trade) {
      setPmChecks(trade.pm_checks?.join('\n') ?? '');
      setPmLesson(trade.pm_lesson ?? '');
      setPmMarket(trade.pm_market ?? '');
    }
  }, [trade?.id]);

  if (!trade) return null;

  const subtitle =
    trade.status === 'stopped'
      ? 'Stopped out · what did you learn?'
      : 'Closed · what did you learn?';

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(trade!.id, {
        pm_checks: pmChecks,
        pm_lesson: pmLesson,
        pm_market: pmMarket,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-title">Lessons — {trade.ticker}</div>
        <div className="modal-subtitle">{subtitle}</div>

        <div className="modal-field">
          <label>Which PTS checks looked right but weren&apos;t?</label>
          <textarea
            value={pmChecks}
            onChange={(e) => setPmChecks(e.target.value)}
            placeholder="e.g. Tide was borderline, MACD histogram already falling"
            rows={3}
          />
        </div>

        <div className="modal-field">
          <label>What would you do differently?</label>
          <textarea
            value={pmLesson}
            onChange={(e) => setPmLesson(e.target.value)}
            placeholder="e.g. Should have waited for Hat Signal confirmation"
            rows={3}
          />
        </div>

        <div className="modal-field">
          <label>Market context at entry vs exit</label>
          <textarea
            value={pmMarket}
            onChange={(e) => setPmMarket(e.target.value)}
            placeholder="e.g. Entered green, Nifty turned yellow mid-trade"
            rows={3}
          />
        </div>

        <div className="modal-actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Lessons'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
