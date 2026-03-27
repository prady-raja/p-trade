'use client';

import type { MarketRegime } from '../lib/types';
import { Pill } from './Pill';
import { SectionCard } from './SectionCard';

type Props = {
  market: { regime: MarketRegime; note?: string };
  marketLoading: boolean;
  marketError: string;
  marketCachedAt: number | null;
  onFetchMarketRegime: () => void;
};

export function MarketRegimeCard({
  market,
  marketLoading,
  marketError,
  marketCachedAt,
  onFetchMarketRegime,
}: Props) {
  return (
    <SectionCard
      title="Market"
      right={
        marketLoading ? (
          <Pill label="LOADING..." tone="slate" />
        ) : (
          <Pill
            label={market.regime === 'unset' ? 'UNKNOWN' : market.regime.toUpperCase()}
            tone={
              market.regime === 'green'
                ? 'green'
                : market.regime === 'yellow'
                ? 'yellow'
                : market.regime === 'red'
                ? 'red'
                : 'slate'
            }
          />
        )
      }
    >
      {marketLoading && (
        <div className="banner banner-info" style={{ marginBottom: 12 }}>
          Fetching market regime...
        </div>
      )}

      {!marketLoading && marketCachedAt && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          ⚠ Using cached regime — backend may be down. Last updated{' '}
          {new Date(marketCachedAt).toLocaleTimeString()}.{' '}
          <button
            className="btn btn-secondary"
            style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }}
            onClick={onFetchMarketRegime}
          >
            Retry
          </button>
        </div>
      )}

      {!marketLoading && marketError && !marketCachedAt && (
        <div className="banner banner-error" style={{ marginBottom: 12 }}>
          {marketError}
          <button
            className="btn btn-secondary"
            style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }}
            onClick={onFetchMarketRegime}
          >
            Retry
          </button>
        </div>
      )}

      <p className="muted">
        {market.note ||
          (!marketLoading && !marketError
            ? 'Click Refresh Market to load the latest market condition.'
            : '')}
      </p>
    </SectionCard>
  );
}
