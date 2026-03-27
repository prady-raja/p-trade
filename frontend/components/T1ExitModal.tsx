'use client';

import type { TradeRecord } from '../lib/types';

type Props = {
  trade: TradeRecord | null;
  onClose: () => void;
};

type Step = {
  icon: string;
  title: string;
  body: string;
};

export function T1ExitModal({ trade, onClose }: Props) {
  if (!trade) return null;

  const t1    = parseFloat(trade.target_1 ?? '0');
  const t2    = parseFloat(trade.target_2 ?? '0');
  const entry = parseFloat(trade.entry    ?? '0');

  const steps: Step[] = [
    {
      icon: '💰',
      title: 'Sell half your position',
      body: `Sell at ₹${t1.toLocaleString('en-IN')} on Zerodha — lock in profit now`,
    },
    {
      icon: '🛡️',
      title: 'Move GTT stop to breakeven',
      body: `Set GTT stop to ₹${entry.toLocaleString('en-IN')} — you are now risk-free on the remaining position`,
    },
    {
      icon: '📈',
      title: 'Hold remainder to T2',
      body: `Hold remaining shares → Target 2 at ₹${t2.toLocaleString('en-IN')}`,
    },
    {
      icon: '📊',
      title: 'Update current price in Trades',
      body: "Enter today's price in the trailing SL strip to get precise zone guidance",
    },
  ];

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="modal-title">{trade.ticker} — T1 Hit</div>
        <div className="modal-subtitle">
          Price reached ₹{t1.toLocaleString('en-IN')} — take these steps now
        </div>

        {steps.map((step, i) => (
          <div key={i} className="exit-step">
            <div className="exit-step-icon">{step.icon}</div>
            <div>
              <div className="exit-step-title">{step.title}</div>
              <div className="exit-step-body">{step.body}</div>
            </div>
          </div>
        ))}

        <button
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 8 }}
          onClick={onClose}
        >
          Done — actioning on Zerodha
        </button>
      </div>
    </div>
  );
}
