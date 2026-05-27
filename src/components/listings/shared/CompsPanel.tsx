// Shared sold-comps panel extracted from the listing screens. Renders the
// loading state, the empty state, and the list of active eBay comps.
// Stateless — the parent decides whether to render this at all (typically
// when `compsId === listing.id`) and supplies the data + dismiss callback.

import { X } from 'lucide-react';

export interface SoldComp {
  title: string;
  price: string;
  currency: string;
  condition: string;
  url: string;
}

export interface CompsPanelProps {
  loading: boolean;
  comps: SoldComp[];
  onDismiss: () => void;
}

export default function CompsPanel({ loading, comps, onDismiss }: CompsPanelProps) {
  return (
    <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--border-color)', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingTop: '0.75rem' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)' }}>📊 Active eBay Prices</span>
        <button onClick={onDismiss} className="btn-icon" style={{ padding: '2px' }} aria-label="Close comps panel">
          <X size={14} />
        </button>
      </div>
      {loading && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading...</p>}
      {!loading && comps.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No results found.</p>}
      {!loading && comps.map((comp, i) => (
        <div
          key={i}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: i < comps.length - 1 ? '1px solid var(--border-color)' : 'none', gap: '8px' }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <a
              href={comp.url}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
            >
              {comp.title}
            </a>
            {comp.condition && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7 }}>{comp.condition}</span>}
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>
            ${comp.price}
          </span>
        </div>
      ))}
    </div>
  );
}
