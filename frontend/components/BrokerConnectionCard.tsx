'use client';

import type { KiteStatus } from '../lib/types';
import { Pill } from './Pill';
import { SectionCard } from './SectionCard';

type Props = {
  kiteStatus: KiteStatus | null;
  kiteLoading: string;
  onConnect: () => void;
  onRefreshStatus: () => void;
  onLogout: () => void;
};

export function BrokerConnectionCard({
  kiteStatus,
  kiteLoading,
  onConnect,
  onRefreshStatus,
  onLogout,
}: Props) {
  return (
    <SectionCard
      title="Broker Connection"
      right={
        kiteLoading ? (
          <Pill label="CHECKING..." tone="slate" />
        ) : kiteStatus?.connected ? (
          <Pill label="CONNECTED" tone="green" />
        ) : (
          <Pill label="NOT CONNECTED" tone="red" />
        )
      }
    >
      {kiteLoading && (
        <div className="banner banner-info" style={{ marginBottom: 14 }}>
          {kiteLoading}
        </div>
      )}
      {!kiteLoading && kiteStatus?.connected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <div className="small">
            <span className="muted">User ID&nbsp;&nbsp;&nbsp;</span>
            <strong>{kiteStatus.user_id || '—'}</strong>
          </div>
          <div className="small">
            <span className="muted">Name&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <strong>{kiteStatus.user_name || '—'}</strong>
          </div>
          <div className="small">
            <span className="muted">Login Time</span>
            <strong style={{ marginLeft: 8 }}>{kiteStatus.login_time || '—'}</strong>
          </div>
        </div>
      )}
      {!kiteLoading && kiteStatus && !kiteStatus.connected && (
        <div className="banner banner-error" style={{ marginBottom: 14 }}>
          {kiteStatus.error || 'Kite is not connected.'}
        </div>
      )}
      <div className="hero-actions">
        <button className="btn btn-primary" onClick={onConnect} disabled={!!kiteLoading}>
          Connect Kite
        </button>
        <button className="btn btn-secondary" onClick={onRefreshStatus} disabled={!!kiteLoading}>
          Refresh Status
        </button>
        {kiteStatus?.connected && (
          <button className="btn btn-secondary" onClick={onLogout} disabled={!!kiteLoading}>
            Logout Kite
          </button>
        )}
      </div>
    </SectionCard>
  );
}
