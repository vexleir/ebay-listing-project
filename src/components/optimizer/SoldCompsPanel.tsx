// FE-003 — sticky-side panel that surfaces sold comps fetched in the
// background after the initial fetch. Renders a Sold Median price card
// when ≥3 comps are available.

import { Loader } from 'lucide-react';
import { compMedian, formatOptimizerDate } from './helpers';
import type { SoldComp } from './types';

export interface SoldCompsPanelProps {
  comps: SoldComp[];
  loading: boolean;
  maxToShow?: number;
}

export default function SoldCompsPanel({ comps, loading, maxToShow = 8 }: SoldCompsPanelProps) {
  const median = compMedian(comps.map((c) => c.price));

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
        Sold Comps{' '}
        {loading && <Loader size={12} className="spin" style={{ display: 'inline', marginLeft: '6px' }} />}
      </h3>
      {median !== null && (
        <div style={{ marginBottom: '1rem', padding: '8px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sold Median Price</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>${median.toFixed(2)}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>from {comps.length} recent sales</div>
        </div>
      )}
      {comps.length === 0 && !loading && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>No sold comps found.</div>
      )}
      {comps.slice(0, maxToShow).map((comp, i) => (
        <a
          key={i}
          href={comp.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', gap: '8px', marginBottom: '8px', textDecoration: 'none', alignItems: 'center' }}
        >
          {comp.image ? (
            <img src={comp.image} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
          ) : (
            <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comp.title}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{comp.condition} · {formatOptimizerDate(comp.endDate)}</div>
          </div>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#10b981', flexShrink: 0 }}>${comp.price.toFixed(2)}</div>
        </a>
      ))}
    </div>
  );
}
