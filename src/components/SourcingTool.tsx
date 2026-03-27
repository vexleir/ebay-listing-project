import { useState } from 'react';
import { Search, RefreshCw, TrendingUp, DollarSign, ExternalLink, ChevronDown, ChevronUp, ShoppingBag, AlertTriangle, CheckCircle2, XCircle, Barcode } from 'lucide-react';
import type { StagedListing } from '../types';

interface SourceResult {
  query: string;
  comps: { title: string; price: string; condition: string; url: string }[];
  stats: { count: number; avg: number; median: number; min: number; max: number } | null;
  askingPrice: number;
  targetSellPrice: number;
  ebayFee: number;
  netProfit: number | null;
  roi: number | null;
  recommendation: 'buy' | 'consider' | 'pass' | null;
  reason: string;
  error: string | null;
}

interface SourcingToolProps {
  appPassword: string;
  listed: StagedListing[];
}

function parsePrice(val: string | undefined): number {
  if (!val) return 0;
  const m = val.replace(/[^0-9.]/g, '');
  return m ? parseFloat(m) : 0;
}

const REC_CONFIG = {
  buy:     { label: 'BUY',     color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)', icon: <CheckCircle2 size={28} /> },
  consider:{ label: 'CONSIDER',color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)',  icon: <AlertTriangle size={28} /> },
  pass:    { label: 'PASS',    color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)',   icon: <XCircle size={28} /> },
};

function usePersonalHistory(listed: StagedListing[], query: string) {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (keywords.length === 0) return null;

  const matches = listed.filter(l => {
    const text = `${l.title} ${l.category || ''}`.toLowerCase();
    return keywords.some(kw => text.includes(kw));
  });
  const sold = matches.filter(l => l.soldAt && l.soldPrice);
  const avgSoldPrice = sold.length > 0
    ? sold.reduce((s, l) => s + parsePrice(l.soldPrice), 0) / sold.length
    : null;
  const avgDaysToSell = sold.length > 0
    ? Math.round(sold.reduce((s, l) => s + (l.soldAt! - l.createdAt) / 86400000, 0) / sold.length)
    : null;

  return { totalMatches: matches.length, soldCount: sold.length, avgSoldPrice, avgDaysToSell };
}

export default function SourcingTool({ appPassword, listed }: SourcingToolProps) {
  const [query, setQuery] = useState('');
  const [askingPrice, setAskingPrice] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [result, setResult] = useState<SourceResult | null>(null);
  const [showComps, setShowComps] = useState(false);
  const [resolvedName, setResolvedName] = useState<string | null>(null);

  const headers = { 'x-app-password': appPassword };

  const isBarcode = (s: string) => /^\d{8,14}$/.test(s.trim());

  const analyze = async (overrideQuery?: string) => {
    const q = (overrideQuery || query).trim();
    if (!q) return;
    setLoading(true);
    setResult(null);
    setShowComps(false);
    try {
      const params = new URLSearchParams({ query: q });
      if (askingPrice) params.set('askingPrice', askingPrice);
      const resp = await fetch(`/api/source/analyze?${params}`, { headers });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      setResult({ query: q, comps: [], stats: null, askingPrice: parseFloat(askingPrice) || 0, targetSellPrice: 0, ebayFee: 0, netProfit: null, roi: null, recommendation: null, reason: e.message, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const q = query.trim();
    if (!q) return;

    // Auto-resolve barcodes to product name
    if (isBarcode(q)) {
      setResolving(true);
      setResolvedName(null);
      try {
        const resp = await fetch(`/api/barcode?upc=${encodeURIComponent(q)}`, { headers });
        const data = await resp.json();
        if (data.title) {
          setResolvedName(data.title);
          setQuery(data.title);
          await analyze(data.title);
          return;
        }
      } catch { /* fall through to raw query */ }
      finally { setResolving(false); }
    }

    await analyze();
  };

  const history = result ? usePersonalHistory(listed, result.query) : null;
  const rec = result?.recommendation ? REC_CONFIG[result.recommendation] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '860px', margin: '0 auto' }}>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShoppingBag size={24} className="text-gradient" /> Sourcing Intelligence
      </h2>
      <p style={{ margin: '-0.5rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
        Enter a product name, keywords, or scan a barcode. Get an instant buy/pass recommendation based on current eBay market prices.
      </p>

      {/* Search form */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '240px', position: 'relative' }}>
            <input
              className="input-base"
              value={query}
              onChange={e => { setQuery(e.target.value); setResolvedName(null); }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Nike Air Max 90 size 10, or scan UPC..."
              style={{ paddingLeft: '36px' }}
            />
            {isBarcode(query)
              ? <Barcode size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--accent-color)', pointerEvents: 'none' }} />
              : <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            }
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Asking $</span>
            <input
              className="input-base"
              value={askingPrice}
              onChange={e => setAskingPrice(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. 12.00"
              style={{ width: '110px' }}
            />
          </div>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading || resolving || !query.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 20px', whiteSpace: 'nowrap' }}>
            {(loading || resolving)
              ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> {resolving ? 'Looking up barcode…' : 'Analyzing…'}</>
              : <><Search size={15} /> Analyze</>}
          </button>
        </div>
        {resolvedName && (
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--accent-color)' }}>
            Barcode resolved → <strong>{resolvedName}</strong>
          </p>
        )}
        {isBarcode(query) && !resolvedName && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
            Barcode detected — will auto-lookup product name before searching eBay.
          </p>
        )}
      </div>

      {/* Results */}
      {result && !loading && (
        <>
          {result.error ? (
            <div className="glass-panel" style={{ padding: '1.5rem', color: '#ef4444' }}>Error: {result.error}</div>
          ) : !result.stats ? (
            <div className="glass-panel" style={{ padding: '1.5rem', color: 'var(--text-secondary)' }}>{result.reason}</div>
          ) : (
            <>
              {/* Recommendation banner */}
              {rec && (
                <div style={{ padding: '1.25rem 1.5rem', background: rec.bg, border: `1px solid ${rec.border}`, borderRadius: '12px', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: rec.color, flexShrink: 0 }}>
                    {rec.icon}
                    <span style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '0.05em' }}>{rec.label}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)', flex: 1 }}>{result.reason}</p>
                </div>
              )}

              {/* Stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                {/* Market data */}
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <TrendingUp size={15} /> eBay Market Data
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Active listings</span>
                      <strong>{result.stats.count}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Median price</span>
                      <strong style={{ color: 'var(--success)' }}>${result.stats.median.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Average price</span>
                      <strong>${result.stats.avg.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Price range</span>
                      <strong>${result.stats.min.toFixed(2)} – ${result.stats.max.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Target sell price</span>
                      <strong>${result.targetSellPrice.toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

                {/* Your numbers */}
                <div className="glass-panel" style={{ padding: '1.25rem' }}>
                  <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <DollarSign size={15} /> Your Numbers
                  </h4>
                  {result.askingPrice > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Asking price</span>
                        <strong>${result.askingPrice.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>eBay fees (est.)</span>
                        <strong style={{ color: '#f59e0b' }}>-${result.ebayFee.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Est. net profit</span>
                        <strong style={{ fontSize: '1rem', color: result.netProfit !== null && result.netProfit >= 0 ? 'var(--success)' : '#ef4444' }}>
                          {result.netProfit !== null ? `${result.netProfit >= 0 ? '+' : ''}$${result.netProfit.toFixed(2)}` : '—'}
                        </strong>
                      </div>
                      {result.roi !== null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>ROI</span>
                          <strong style={{ color: result.roi >= 100 ? 'var(--success)' : result.roi >= 40 ? '#f59e0b' : '#ef4444' }}>
                            {result.roi.toFixed(0)}%
                          </strong>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
                      Enter an asking price above to see your profit estimate.
                    </p>
                  )}
                </div>
              </div>

              {/* Personal history */}
              {history && history.totalMatches > 0 && (
                <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.85rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: 'var(--accent-color)', fontSize: '0.9rem' }}>Your History</span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {history.totalMatches} similar item{history.totalMatches > 1 ? 's' : ''} in inventory
                  </span>
                  {history.soldCount > 0 && (
                    <>
                      <span style={{ color: 'var(--success)' }}>{history.soldCount} sold</span>
                      {history.avgSoldPrice !== null && (
                        <span style={{ color: 'var(--text-secondary)' }}>avg sold <strong style={{ color: 'var(--text-primary)' }}>${history.avgSoldPrice.toFixed(2)}</strong></span>
                      )}
                      {history.avgDaysToSell !== null && (
                        <span style={{ color: 'var(--text-secondary)' }}>avg <strong style={{ color: 'var(--text-primary)' }}>{history.avgDaysToSell}d</strong> to sell</span>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Comps toggle */}
              {result.comps.length > 0 && (
                <div className="glass-panel" style={{ padding: '1rem 1.25rem' }}>
                  <button onClick={() => setShowComps(v => !v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 500, width: '100%', justifyContent: 'space-between' }}>
                    <span>Active eBay Listings ({result.comps.length})</span>
                    {showComps ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {showComps && (
                    <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {result.comps.map((c, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '5px 0', borderBottom: i < result.comps.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                          <p style={{ flex: 1, margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</p>
                          {c.condition && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7, flexShrink: 0 }}>{c.condition}</span>}
                          <span style={{ fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>${c.price}</span>
                          {c.url && (
                            <a href={c.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
                Based on {result.stats.count} active eBay listings. eBay fee estimate uses 13.25% FVF + $0.30/order (most categories). Excludes shipping label cost — subtract that from net profit for final margin.
              </p>
            </>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
