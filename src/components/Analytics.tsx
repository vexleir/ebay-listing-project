import { useState, useEffect } from 'react';
import type { StagedListing } from '../types';
import { TrendingUp, Package, Tag, DollarSign, BarChart2, Clock, Zap, Download, Calendar } from 'lucide-react';

interface AnalyticsProps {
  staged: StagedListing[];
  listed: StagedListing[];
  appPassword?: string;
}

interface TokenStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  callCount: number;
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

export default function Analytics({ staged, listed, appPassword }: AnalyticsProps) {
  const [tokenStats, setTokenStats] = useState<TokenStats | null>(null);

  useEffect(() => {
    if (!appPassword) return;
    fetch('/api/token-usage', { headers: { 'x-app-password': appPassword } })
      .then(r => r.json())
      .then(data => setTokenStats(data))
      .catch(() => {});
  }, [appPassword]);

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

  // Sold totals
  const soldItems = listed.filter(l => l.soldAt && l.soldPrice);
  const totalSoldValue = soldItems.reduce((sum, l) => sum + parsePrice(l.soldPrice), 0);

  // Avg % diff between listed price and sold price
  const soldWithBoth = soldItems.filter(l => parsePrice(l.priceRecommendation) > 0);
  const avgPriceDiffPct = soldWithBoth.length > 0
    ? soldWithBoth.reduce((sum, l) => {
        const lp = parsePrice(l.priceRecommendation);
        const sp = parsePrice(l.soldPrice);
        return sum + ((sp - lp) / lp * 100);
      }, 0) / soldWithBoth.length
    : null;

  // 30-day sales
  const thirtyDaysAgo = now - 30 * 86400000;
  const recentSold = soldItems.filter(l => l.soldAt! >= thirtyDaysAgo);
  const recentSoldValue = recentSold.reduce((sum, l) => sum + parsePrice(l.soldPrice), 0);

  // Days to sell
  const soldWithDates = soldItems.filter(l => l.soldAt && l.createdAt);
  const avgDaysToSell = soldWithDates.length > 0
    ? Math.round(soldWithDates.reduce((sum, l) => sum + (l.soldAt! - l.createdAt) / 86400000, 0) / soldWithDates.length)
    : null;

  // Monthly revenue (last 6 months)
  const monthlyData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const y = d.getFullYear(), m = d.getMonth();
    const items = soldItems.filter(l => {
      if (!l.soldAt) return false;
      const sd = new Date(l.soldAt);
      return sd.getFullYear() === y && sd.getMonth() === m;
    });
    return { label: d.toLocaleString('default', { month: 'short' }), revenue: items.reduce((sum, l) => sum + parsePrice(l.soldPrice), 0), count: items.length };
  });
  const maxMonthlyRevenue = Math.max(...monthlyData.map(m => m.revenue), 1);

  // Gemini cost estimate (approx Gemini 1.5 Flash rates)
  const estimatedCost = tokenStats
    ? (tokenStats.promptTokens / 1_000_000) * 0.075 + (tokenStats.completionTokens / 1_000_000) * 0.30
    : 0;

  const handleExportData = () => {
    const data = { exportedAt: new Date().toISOString(), staged, listed };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listingstager-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart2 size={24} className="text-gradient" /> Analytics
        </h2>
        <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }} onClick={handleExportData}>
          <Download size={16} /> Export Data
        </button>
      </div>

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
        <StatCard icon={<Package size={18} />} label="Archived / Sold" value={String(archived.length)} sub={soldItems.length > 0 ? `${soldItems.length} confirmed sold` : 'completed or sold'} color="var(--text-secondary)" />
        {soldItems.length > 0 && (
          <StatCard icon={<DollarSign size={18} />} label="Total Sold Revenue" value={`$${totalSoldValue.toFixed(2)}`} sub={`${soldItems.length} item${soldItems.length > 1 ? 's' : ''} · avg $${(totalSoldValue / soldItems.length).toFixed(2)}`} color="var(--success)" />
        )}
        {recentSold.length > 0 && (
          <StatCard icon={<TrendingUp size={18} />} label="Sales (Last 30 Days)" value={`$${recentSoldValue.toFixed(2)}`} sub={`${recentSold.length} item${recentSold.length > 1 ? 's' : ''} sold`} color="var(--success)" />
        )}
        {avgPriceDiffPct !== null && (
          <StatCard icon={<TrendingUp size={18} />} label="Avg Sale vs Listed" value={`${avgPriceDiffPct >= 0 ? '+' : ''}${avgPriceDiffPct.toFixed(1)}%`} sub={`across ${soldWithBoth.length} sold item${soldWithBoth.length > 1 ? 's' : ''}`} color={avgPriceDiffPct >= 0 ? 'var(--success)' : '#f59e0b'} />
        )}
        {avgDaysToSell !== null && (
          <StatCard icon={<Calendar size={18} />} label="Avg Days to Sell" value={String(avgDaysToSell)} sub={`across ${soldWithDates.length} sold item${soldWithDates.length > 1 ? 's' : ''}`} color={avgDaysToSell > 30 ? '#f59e0b' : 'var(--success)'} />
        )}
        {tokenStats && tokenStats.callCount > 0 && (
          <StatCard icon={<Zap size={18} />} label="AI Token Usage" value={tokenStats.totalTokens.toLocaleString()} sub={`${tokenStats.callCount} calls · ~$${estimatedCost.toFixed(4)} est. cost`} color="#a855f7" />
        )}
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

        {/* Sold items breakdown */}
        {soldItems.length > 0 && (
          <div className="glass-panel" style={{ padding: '1.5rem', gridColumn: 'span 2' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><TrendingUp size={16} /> Sold Items — Listed vs Sold Price</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto) 1fr', gap: '0 1rem', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px', padding: '0 0 6px 0', borderBottom: '1px solid var(--border-color)' }}>
              <span>Listed</span><span>Sold</span><span>Difference</span><span></span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {soldItems.slice(0, 10).map(l => {
                const lp = parsePrice(l.priceRecommendation);
                const sp = parsePrice(l.soldPrice);
                const diff = sp - lp;
                const diffPct = lp > 0 ? ((diff / lp) * 100).toFixed(0) : null;
                const diffColor = diff >= 0 ? 'var(--success)' : '#f59e0b';
                return (
                  <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '5px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>${lp.toFixed(2)}</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>${sp.toFixed(2)}</span>
                    {diffPct !== null && <span style={{ fontSize: '0.78rem', color: diffColor, flexShrink: 0 }}>{diff >= 0 ? '+' : ''}{diffPct}%</span>}
                    <p style={{ flex: 1, margin: 0, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>{l.title}</p>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.6 }}>{l.soldAt ? new Date(l.soldAt).toLocaleDateString() : ''}</span>
                  </div>
                );
              })}
            </div>
            {soldItems.length > 0 && (
              <div style={{ display: 'flex', gap: '2rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Total listed: <strong style={{ color: 'var(--text-primary)' }}>${soldWithBoth.reduce((s, l) => s + parsePrice(l.priceRecommendation), 0).toFixed(2)}</strong></span>
                <span style={{ color: 'var(--text-secondary)' }}>Total sold: <strong style={{ color: 'var(--success)' }}>${totalSoldValue.toFixed(2)}</strong></span>
                {avgPriceDiffPct !== null && <span style={{ color: 'var(--text-secondary)' }}>Avg diff: <strong style={{ color: avgPriceDiffPct >= 0 ? 'var(--success)' : '#f59e0b' }}>{avgPriceDiffPct >= 0 ? '+' : ''}{avgPriceDiffPct.toFixed(1)}%</strong></span>}
              </div>
            )}
          </div>
        )}

        {/* Monthly revenue chart */}
        {soldItems.length > 0 && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.25rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><BarChart2 size={16} /> Monthly Revenue (last 6 months)</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '120px' }}>
              {monthlyData.map(m => (
                <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                  {m.revenue > 0 && <span style={{ fontSize: '0.68rem', color: 'var(--success)', textAlign: 'center', whiteSpace: 'nowrap' }}>${m.revenue >= 1000 ? (m.revenue / 1000).toFixed(1) + 'k' : m.revenue.toFixed(0)}</span>}
                  {m.count > 0 && <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', opacity: 0.7 }}>{m.count}</span>}
                  <div style={{ width: '100%', height: `${Math.max((m.revenue / maxMonthlyRevenue) * 72, m.revenue > 0 ? 8 : 3)}px`, background: m.revenue > 0 ? 'var(--success)' : 'rgba(255,255,255,0.06)', borderRadius: '3px 3px 0 0', transition: 'height 0.3s ease', minHeight: '3px' }} />
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Token usage detail */}
        {tokenStats && tokenStats.callCount > 0 && (
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Zap size={16} /> AI Token Usage (this session)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Generations</span><strong>{tokenStats.callCount}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Input tokens</span><strong>{tokenStats.promptTokens.toLocaleString()}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Output tokens</span><strong>{tokenStats.completionTokens.toLocaleString()}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-secondary)' }}>Total tokens</span><strong>{tokenStats.totalTokens.toLocaleString()}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }}><span style={{ color: 'var(--text-secondary)' }}>Est. cost (Flash rates)</span><strong style={{ color: '#a855f7' }}>${estimatedCost.toFixed(4)}</strong></div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.6 }}>Resets on server restart. Based on Gemini 1.5 Flash pricing.</p>
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
