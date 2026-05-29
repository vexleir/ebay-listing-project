import { useState, useEffect } from 'react';
import { Loader, Zap, Award } from 'lucide-react';

interface OptimizerImpactData {
  optimizedListingsCount: number;
  averageScoreLift: number | null;
  averageWatcherLift: number | null;
  averageViewLift: number | null;
  sellThroughCount: number;
  totalActions: number;
  strongestWins: Array<{
    listingId: string;
    title: string;
    scoreLift?: number;
    salePriceFormatted?: string;
  }>;
}

interface OptimizerImpactPanelProps {
  appPassword: string;
}

export default function OptimizerImpactPanel({ appPassword }: OptimizerImpactPanelProps) {
  const [data, setData] = useState<OptimizerImpactData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appPassword) {
      setLoading(false);
      return;
    }

    fetch('/api/intelligence/optimizer-impact', {
      headers: { 'Authorization': `Bearer ${appPassword}` },
    })
      .then(r => r.json())
      .then((result: OptimizerImpactData) => setData(result))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [appPassword]);

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
        <Loader size={18} className="spin" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading optimizer impact…</span>
      </div>
    );
  }

  if (!data || data.totalActions === 0) {
    return (
      <div className="empty-state">
        <Zap size={32} style={{ opacity: 0.5 }} />
        <h3>Optimizer Impact</h3>
        <p>Apply optimizer recommendations to see impact data here</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Zap size={16} className="text-gradient" /> Optimizer Impact
      </h3>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
        <div className="metric-cell">
          <span className="metric-label">Optimized Listings</span>
          <span className="metric-value" style={{ color: 'var(--accent-color)' }}>
            {data.optimizedListingsCount}
          </span>
        </div>

        <div className="metric-cell">
          <span className="metric-label">Avg Score Lift</span>
          <span className="metric-value" style={{ color: 'var(--success)' }}>
            {data.averageScoreLift !== null ? `+${data.averageScoreLift.toFixed(1)}` : '—'}
          </span>
        </div>

        <div className="metric-cell">
          <span className="metric-label">Avg Watcher/View Lift</span>
          <span className="metric-value" style={{ color: 'var(--success)' }}>
            {data.averageWatcherLift !== null || data.averageViewLift !== null
              ? `+${(data.averageWatcherLift ?? data.averageViewLift ?? 0).toFixed(1)}`
              : '—'}
          </span>
        </div>

        <div className="metric-cell">
          <span className="metric-label">Sell-Through</span>
          <span className="metric-value" style={{ color: 'var(--success)' }}>
            {data.sellThroughCount}
          </span>
        </div>

        <div className="metric-cell">
          <span className="metric-label">Total Actions</span>
          <span className="metric-value">
            {data.totalActions}
          </span>
        </div>
      </div>

      {/* Strongest Wins */}
      {data.strongestWins.length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem' }}>
          <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
            <Award size={14} /> Strongest Wins
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.strongestWins.slice(0, 3).map((win) => (
              <div
                key={win.listingId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.5rem 0',
                  borderBottom: '1px solid var(--border-color)',
                }}
              >
                <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {win.title}
                </span>
                {win.scoreLift != null && (
                  <span className="badge badge--success" style={{ flexShrink: 0 }}>
                    +{win.scoreLift} pts
                  </span>
                )}
                {win.salePriceFormatted && (
                  <span className="badge badge--success" style={{ flexShrink: 0 }}>
                    {win.salePriceFormatted}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
