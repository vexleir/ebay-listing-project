import { useState } from 'react';
import { TrendingDown, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, ArrowRight, Zap } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface RepriceSuggestion {
  id: string;
  ebayDraftId: string | null;
  title: string;
  image: string | null;
  currentPrice: number;
  suggestedPrice: number;
  compAvg: number;
  compMedian: number;
  compCount: number;
  daysListed: number;
  priority: 'high' | 'medium' | 'low';
  pctAboveMarket: number;
  reason: string;
}

interface RepricingResult {
  suggestions: RepriceSuggestion[];
  analyzedCount: number;
  flaggedCount: number;
}

interface RepricingAdvisorProps {
  appPassword: string;
}

const PRIORITY_CONFIG = {
  high:   { label: 'High',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   icon: <AlertCircle size={14} /> },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  icon: <AlertTriangle size={14} /> },
  low:    { label: 'Low',    color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  icon: <TrendingDown size={14} /> },
};

export default function RepricingAdvisor({ appPassword }: RepricingAdvisorProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RepricingResult | null>(null);
  const [applying, setApplying] = useState<Record<string, boolean>>({});
  const [applied, setApplied] = useState<Record<string, number>>({});

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appPassword}` };

  const runAnalysis = async () => {
    setLoading(true);
    setResult(null);
    setApplied({});
    try {
      const resp = await fetch('/api/reprice/suggestions', { headers: { 'Authorization': `Bearer ${appPassword}` } });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
      if (data.flaggedCount === 0) toast(`Analyzed ${data.analyzedCount} listings — all prices look competitive.`, 'success');
    } catch (e: any) {
      toast('Repricing analysis failed: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const applyPrice = async (s: RepriceSuggestion) => {
    if (!s.ebayDraftId) {
      toast('This listing has no eBay item ID — update the price manually in the editor.', 'error');
      return;
    }
    setApplying(prev => ({ ...prev, [s.id]: true }));
    try {
      const resp = await fetch('/api/ebay/revise', {
        method: 'POST',
        headers,
        body: JSON.stringify({ itemId: s.ebayDraftId, newPrice: s.suggestedPrice.toFixed(2) }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Revise failed');
      if (data.warning) {
        toast(`Price not updated: item is currently on sale. Remove it from sale to change the price.`, 'warning');
      } else {
        setApplied(prev => ({ ...prev, [s.id]: s.suggestedPrice }));
        toast(`Price updated to $${s.suggestedPrice.toFixed(2)} on eBay.`, 'success');
      }
    } catch (e: any) {
      toast('Failed to apply price: ' + e.message, 'error');
    } finally {
      setApplying(prev => ({ ...prev, [s.id]: false }));
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingDown size={16} style={{ color: '#f59e0b' }} /> Repricing Advisor
          </h3>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Compares your active listings against current eBay market prices and flags overpriced items.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={runAnalysis}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 16px' }}
        >
          {loading
            ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</>
            : <><Zap size={14} /> Run Analysis</>}
        </button>
      </div>

      {loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Fetching market comps for each listing… this may take a moment.
        </div>
      )}

      {result && !loading && (
        <>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: '1.5rem', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginBottom: '1.25rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Analyzed: <strong style={{ color: 'var(--text-primary)' }}>{result.analyzedCount}</strong></span>
            <span style={{ color: 'var(--text-secondary)' }}>Flagged: <strong style={{ color: result.flaggedCount > 0 ? '#f59e0b' : 'var(--success)' }}>{result.flaggedCount}</strong></span>
            {result.flaggedCount > 0 && (
              <>
                <span style={{ color: '#ef4444' }}>{result.suggestions.filter(s => s.priority === 'high').length} high</span>
                <span style={{ color: '#f59e0b' }}>{result.suggestions.filter(s => s.priority === 'medium').length} medium</span>
                <span style={{ color: '#6366f1' }}>{result.suggestions.filter(s => s.priority === 'low').length} low</span>
              </>
            )}
          </div>

          {result.flaggedCount === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', color: 'var(--success)', fontSize: '0.9rem' }}>
              <CheckCircle2 size={18} /> All {result.analyzedCount} active listings are priced competitively vs. current market comps.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {result.suggestions.map(s => {
                const cfg = PRIORITY_CONFIG[s.priority];
                const wasApplied = applied[s.id] !== undefined;
                const isApplying = applying[s.id];
                const appliedPrice = applied[s.id];
                return (
                  <div key={s.id} style={{ display: 'flex', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: `1px solid ${wasApplied ? 'rgba(34,197,94,0.3)' : 'var(--border-color)'}`, alignItems: 'flex-start' }}>
                    {/* Thumbnail */}
                    {s.image && (
                      <img src={s.image} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title + priority badge */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</p>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 600, color: cfg.color, background: cfg.bg, flexShrink: 0 }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </div>
                      {/* Price row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ef4444', textDecoration: wasApplied ? 'line-through' : 'none', opacity: wasApplied ? 0.5 : 1 }}>
                          ${s.currentPrice.toFixed(2)}
                        </span>
                        {wasApplied
                          ? <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--success)' }}>${appliedPrice.toFixed(2)} ✓</span>
                          : <><ArrowRight size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                             <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--success)' }}>${s.suggestedPrice.toFixed(2)}</span></>
                        }
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>·</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>market median: ${s.compMedian.toFixed(2)}</span>
                        <span style={{ fontSize: '0.78rem', color: '#f59e0b' }}>{s.pctAboveMarket.toFixed(0)}% above</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>· {s.daysListed}d listed</span>
                      </div>
                      {/* Reason */}
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.75 }}>{s.reason}</p>
                    </div>
                    {/* Apply button */}
                    <button
                      className={wasApplied ? 'btn-secondary' : 'btn-primary'}
                      onClick={() => applyPrice(s)}
                      disabled={isApplying || wasApplied}
                      style={{ flexShrink: 0, fontSize: '0.8rem', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}
                    >
                      {isApplying
                        ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                        : wasApplied
                          ? <><CheckCircle2 size={13} /> Applied</>
                          : 'Apply'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <p style={{ margin: '1rem 0 0 0', fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
            Suggestions based on current active eBay listings. Suggested price is 5% below market median to ensure competitiveness. Only listings priced 10%+ above market are shown.
          </p>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
