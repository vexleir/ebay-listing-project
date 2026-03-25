import type { StagedListing } from '../types';
import { TrendingUp, Package, Tag, DollarSign, BarChart2, Clock } from 'lucide-react';

interface AnalyticsProps {
  staged: StagedListing[];
  listed: StagedListing[];
}

function parsePrice(val: string | undefined): number {
  if (!val) return 0;
  const m = val.replace(/[^0-9.]/g, '');
  return m ? parseFloat(m) : 0;
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: color || 'var(--accent-color)' }}>
        {icon}
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <p style={{ fontSize: '1.8rem', fontWeight: 700, margin: 0, color: color || 'var(--text-primary)' }}>{value}</p>
      {sub && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{sub}</p>}
    </div>
  );
}

export default function Analytics({ staged, listed }: AnalyticsProps) {
  const active = listed.filter(l => !l.archived);
  const archived = listed.filter(l => l.archived);

  const stagedValue = staged.reduce((sum, l) => sum + parsePrice(l.priceRecommendation), 0);
  const listedValue = active.reduce((sum, l) => sum + parsePrice(l.priceRecommendation), 0);
  const totalValue = stagedValue + listedValue;

  const listedWithCost = active.filter(l => l.costBasis && parsePrice(l.costBasis) > 0);
  const totalProfit = listedWithCost.reduce((sum, l) => sum + (parsePrice(l.priceRecommendation) - parsePrice(l.costBasis)), 0);
  const avgMarginPct = listedWithCost.length > 0
    ? listedWithCost.reduce((sum, l) => {
        const cost = parsePrice(l.costBasis);
        return sum + (cost > 0 ? ((parsePrice(l.priceRecommendation) - cost) / cost) * 100 : 0);
      }, 0) / listedWithCost.length
    : null;

  const avgStagedPrice = staged.length > 0 ? stagedValue / staged.length : 0;
  const avgListedPrice = active.length > 0 ? listedValue / active.length : 0;

  // Category breakdown across all listings
  const categoryMap = new Map<string, number>();
  [...staged, ...active].forEach(l => {
    const cat = l.category || 'Uncategorized';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
  });
  const topCategories = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Tag breakdown
  const tagMap = new Map<string, number>();
  [...staged, ...active].forEach(l => (l.tags || []).forEach(tag => tagMap.set(tag, (tagMap.get(tag) || 0) + 1)));
  const topTags = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Days sitting (staged listings age)
  const now = Date.now();
  const oldestStaged = staged.length > 0 ? Math.max(...staged.map(l => Math.floor((now - l.createdAt) / 86400000))) : 0;
  const avgDaysStaged = staged.length > 0 ? Math.floor(staged.reduce((sum, l) => sum + (now - l.createdAt) / 86400000, 0) / staged.length) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <BarChart2 size={24} className="text-gradient" /> Analytics
      </h2>

      {/* Key stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
        <StatCard icon={<Package size={18} />} label="Staged Listings" value={String(staged.length)} sub={`$${stagedValue.toFixed(2)} total value`} />
        <StatCard icon={<TrendingUp size={18} />} label="Active Listed" value={String(active.length)} sub={`$${listedValue.toFixed(2)} total value`} color="var(--success)" />
        <StatCard icon={<DollarSign size={18} />} label="Total Inventory Value" value={`$${totalValue.toFixed(2)}`} sub={`${staged.length + active.length} items`} color="var(--accent-color)" />
        {avgMarginPct !== null
          ? <StatCard icon={<TrendingUp size={18} />} label="Avg Profit Margin" value={`${avgMarginPct.toFixed(0)}%`} sub={`$${totalProfit.toFixed(2)} total tracked profit`} color={totalProfit >= 0 ? 'var(--success)' : '#ef4444'} />
          : <StatCard icon={<TrendingUp size={18} />} label="Profit Tracking" value="—" sub="Add cost basis to listings to track margin" color="var(--text-secondary)" />
        }
        <StatCard icon={<DollarSign size={18} />} label="Avg Staged Price" value={staged.length ? `$${avgStagedPrice.toFixed(2)}` : '—'} />
        <StatCard icon={<DollarSign size={18} />} label="Avg Listed Price" value={active.length ? `$${avgListedPrice.toFixed(2)}` : '—'} color="var(--success)" />
        <StatCard icon={<Clock size={18} />} label="Avg Days Staged" value={staged.length ? String(avgDaysStaged) : '—'} sub={staged.length ? `oldest: ${oldestStaged}d` : undefined} color={avgDaysStaged > 30 ? '#f59e0b' : undefined} />
        <StatCard icon={<Package size={18} />} label="Archived" value={String(archived.length)} sub="completed or sold" color="var(--text-secondary)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {/* Category breakdown */}
        {topCategories.length > 0 && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><BarChart2 size={16} /> Top Categories</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topCategories.map(([cat, count]) => {
                const total = staged.length + active.length || 1;
                const pct = (count / total) * 100;
                return (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', fontSize: '0.85rem' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>{cat}</span>
                      <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>{count}</span>
                    </div>
                    <div style={{ height: '5px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent-color)', borderRadius: '3px', transition: 'width 0.3s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tags */}
        {topTags.length > 0 && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Tag size={16} /> Tags</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {topTags.map(([tag, count]) => (
                <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', borderRadius: '6px', padding: '4px 10px', fontSize: '0.82rem' }}>
                  {tag} <span style={{ opacity: 0.6, fontSize: '0.75rem' }}>×{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Profit breakdown table */}
        {listedWithCost.length > 0 && (
          <div className="glass-panel" style={{ padding: '1.5rem', gridColumn: 'span 2' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><DollarSign size={16} /> Profit Breakdown (top {Math.min(listedWithCost.length, 8)})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {listedWithCost
                .map(l => ({ l, profit: parsePrice(l.priceRecommendation) - parsePrice(l.costBasis) }))
                .sort((a, b) => b.profit - a.profit)
                .slice(0, 8)
                .map(({ l, profit }) => {
                  const pct = parsePrice(l.costBasis) > 0 ? ((profit / parsePrice(l.costBasis)) * 100).toFixed(0) : '—';
                  const color = profit >= 0 ? 'var(--success)' : '#ef4444';
                  return (
                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
                      <p style={{ flex: 1, margin: 0, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</p>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>cost ${parsePrice(l.costBasis).toFixed(2)}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>sell ${parsePrice(l.priceRecommendation).toFixed(2)}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color, flexShrink: 0 }}>{profit >= 0 ? '+' : ''}${profit.toFixed(2)} ({pct}%)</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {staged.length === 0 && active.length === 0 && (
        <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No listings yet. Create some listings to see analytics here.</p>
        </div>
      )}
    </div>
  );
}
