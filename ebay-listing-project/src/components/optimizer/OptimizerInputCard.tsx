// FE-003 — the initial "paste an eBay URL" card shown before any
// analysis. Stateless: parent owns the URL string + the in-flight flag.

import { AlertTriangle, Loader, Search, Zap } from 'lucide-react';

export interface OptimizerInputCardProps {
  url: string;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
}

export default function OptimizerInputCard({
  url, onUrlChange, onSubmit, loading, error,
}: OptimizerInputCardProps) {
  return (
    <div style={{ maxWidth: '620px', margin: '4rem auto', padding: '0 1rem' }}>
      <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <Zap size={28} color="#fff" />
        </div>
        <h2 style={{ marginBottom: '0.5rem', fontSize: '1.4rem' }}>Listing Optimizer</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.75rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Enter any eBay listing URL to get a health score, SEO analysis, and AI-powered improvement suggestions.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
          <input
            type="text"
            className="input-base"
            aria-label="eBay listing URL or item number"
            placeholder="https://www.ebay.com/itm/123456789012 or item ID"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && url.trim() && !loading) onSubmit(); }}
            style={{ textAlign: 'left' }}
          />
          {error && (
            <div style={{ color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={13} /> {error}
            </div>
          )}
          <button
            className="btn-primary"
            onClick={onSubmit}
            disabled={!url.trim() || loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
          >
            {loading ? (
              <><Loader size={16} className="spin" /> Fetching listing…</>
            ) : (
              <><Search size={16} /> Analyze Listing</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
