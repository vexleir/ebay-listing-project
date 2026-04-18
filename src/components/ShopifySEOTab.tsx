import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import {
  RefreshCw, CheckSquare, Square, ExternalLink, Sparkles, ArrowRight,
  X, Check, XCircle, Loader2, ChevronDown, ChevronUp, AlertCircle
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import type {
  ShopifyProduct, SEOProductSuggestion, SEOFieldSuggestion, SEOFieldKey,
} from '../types';
import { computeShopifySEOScore } from '../utils/shopifySeoScore';

interface ShopifySEOTabProps {
  appPassword: string;
  isShopifyConnected: boolean;
}

const FIELD_LABELS: Record<SEOFieldKey, string> = {
  title: 'Product Title',
  descriptionHtml: 'Description',
  seoTitle: 'SEO Meta Title',
  seoDescription: 'SEO Meta Description',
  tags: 'Tags',
  productType: 'Product Type',
  vendor: 'Vendor / Brand',
};

function stripHtml(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function displayValue(field: SEOFieldKey, value: string): string {
  if (field === 'descriptionHtml') {
    const plain = stripHtml(value);
    return plain.length > 280 ? plain.substring(0, 280) + '…' : plain;
  }
  return value || '';
}

function ScoreBadge({ score, grade }: { score: number; grade: string }) {
  const color =
    grade === 'A' || grade === 'B' ? '#10b981'
    : grade === 'C' ? '#f59e0b'
    : '#ef4444';
  const deg = Math.max(0, Math.min(360, score * 3.6));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: `conic-gradient(${color} ${deg}deg, rgba(255,255,255,0.08) 0deg)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 3, borderRadius: '50%', background: 'var(--bg-primary, #0f0f14)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.72rem', fontWeight: 700, color,
        }}>{grade}</div>
      </div>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{score}</span>
    </div>
  );
}

export default function ShopifySEOTab({ appPassword, isShopifyConnected }: ShopifySEOTabProps) {
  const { toast } = useToast();
  const [products, setProducts] = useState<ShopifyProduct[]>([]);
  const [pageInfo, setPageInfo] = useState<{ hasNextPage: boolean; endCursor: string | null }>({ hasNextPage: false, endCursor: null });
  const [isFetchingProducts, setIsFetchingProducts] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizingProductIds, setOptimizingProductIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<SEOProductSuggestion[]>([]);
  const [reviewingProductId, setReviewingProductId] = useState<string | null>(null);
  const [pushingIds, setPushingIds] = useState<Set<string>>(new Set());
  const [pushedIds, setPushedIds] = useState<Set<string>>(new Set());
  const [hidePerfectScore, setHidePerfectScore] = useState(true);

  const bearerHeaders = () => ({ Authorization: `Bearer ${appPassword}` });
  const apiHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${appPassword}` });

  const suggestionsMap = useMemo(() => {
    const m = new Map<string, SEOProductSuggestion>();
    for (const s of suggestions) m.set(s.productId, s);
    return m;
  }, [suggestions]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (hidePerfectScore) {
      result = result.filter(p => computeShopifySEOScore(p).total < 100);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.productType || '').toLowerCase().includes(q) ||
        (p.vendor || '').toLowerCase().includes(q) ||
        (p.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    return result;
  }, [products, searchQuery, hidePerfectScore]);

  const perfectScoreCount = useMemo(
    () => products.filter(p => computeShopifySEOScore(p).total === 100).length,
    [products]
  );

  const handleLoadProducts = async (cursor: string | null = null) => {
    if (!isShopifyConnected) { toast('Connect Shopify in Settings first.', 'error'); return; }
    setIsFetchingProducts(true);
    try {
      const url = `/api/shopify/products${cursor ? `?after=${encodeURIComponent(cursor)}` : ''}`;
      const resp = await fetch(url, { headers: bearerHeaders() });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'Failed to load products');
      }
      const data = await resp.json();
      setProducts(prev => cursor ? [...prev, ...(data.products || [])] : (data.products || []));
      setPageInfo(data.pageInfo || { hasNextPage: false, endCursor: null });
      setHasFetched(true);
      if (!cursor) {
        setSelectedIds(new Set());
        setSuggestions([]);
        setPushedIds(new Set());
      }
      toast(`Loaded ${data.products?.length || 0} product${data.products?.length !== 1 ? 's' : ''}.`, 'success');
    } catch (e: any) {
      toast('Load error: ' + e.message, 'error');
    } finally {
      setIsFetchingProducts(false);
    }
  };

  const toggleProduct = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const handleOptimize = async () => {
    const selected = products.filter(p => selectedIds.has(p.id));
    if (!selected.length) { toast('No products selected.', 'error'); return; }

    setIsOptimizing(true);
    setOptimizingProductIds(new Set(selected.map(p => p.id)));
    try {
      const resp = await fetch('/api/shopify/seo-optimize', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ products: selected }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'Optimization failed');
      }
      const data = await resp.json();
      const incoming: SEOProductSuggestion[] = data.suggestions || [];

      setSuggestions(prev => {
        const map = new Map(prev.map(s => [s.productId, s]));
        for (const s of incoming) map.set(s.productId, s);
        return Array.from(map.values());
      });

      const errors: string[] = data.errors || [];
      if (errors.length > 0) toast(`Optimized ${incoming.length}, ${errors.length} failed.`, 'info');
      else toast(`Optimized ${incoming.length} product${incoming.length !== 1 ? 's' : ''}.`, 'success');

      if (incoming.length > 0) setReviewingProductId(incoming[0].productId);
    } catch (e: any) {
      toast('Optimize error: ' + e.message, 'error');
    } finally {
      setIsOptimizing(false);
      setOptimizingProductIds(new Set());
    }
  };

  const setFieldDecision = (productId: string, field: SEOFieldKey, accepted: boolean | null) => {
    setSuggestions(prev => prev.map(s => {
      if (s.productId !== productId) return s;
      return { ...s, fields: s.fields.map(f => f.field === field ? { ...f, accepted } : f) };
    }));
  };

  const setFieldAfter = (productId: string, field: SEOFieldKey, newAfter: string) => {
    setSuggestions(prev => prev.map(s => {
      if (s.productId !== productId) return s;
      return { ...s, fields: s.fields.map(f => f.field === field ? { ...f, after: newAfter } : f) };
    }));
  };

  const acceptAll = (productId: string) => {
    setSuggestions(prev => prev.map(s => {
      if (s.productId !== productId) return s;
      return { ...s, fields: s.fields.map(f => ({ ...f, accepted: true })) };
    }));
  };

  const rejectAll = (productId: string) => {
    setSuggestions(prev => prev.map(s => {
      if (s.productId !== productId) return s;
      return { ...s, fields: s.fields.map(f => ({ ...f, accepted: false })) };
    }));
  };

  const handlePushProduct = async (productId: string) => {
    const suggestion = suggestionsMap.get(productId);
    if (!suggestion) return;

    const approved = suggestion.fields.filter(f => f.accepted === true);
    if (approved.length === 0) { toast('No fields approved.', 'error'); return; }

    const payload: Record<string, any> = {};
    for (const f of approved) {
      if (f.field === 'tags') {
        payload.tags = f.after.split(',').map(t => t.trim()).filter(Boolean);
      } else {
        payload[f.field] = f.after;
      }
    }

    const numericId = productId.includes('/') ? productId.split('/').pop() : productId;

    setPushingIds(prev => new Set([...prev, productId]));
    try {
      const resp = await fetch(`/api/shopify/products/${numericId}`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'Push failed');
      }
      // Update local product state so score refreshes
      setProducts(prev => prev.map(p => {
        if (p.id !== productId) return p;
        return {
          ...p,
          title: payload.title ?? p.title,
          descriptionHtml: payload.descriptionHtml ?? p.descriptionHtml,
          seo: {
            title: payload.seoTitle ?? p.seo.title,
            description: payload.seoDescription ?? p.seo.description,
          },
          tags: payload.tags ?? p.tags,
          productType: payload.productType ?? p.productType,
          vendor: payload.vendor ?? p.vendor,
        };
      }));
      setPushedIds(prev => new Set([...prev, productId]));
      toast(`Pushed ${approved.length} change${approved.length !== 1 ? 's' : ''} to Shopify.`, 'success');
      setReviewingProductId(null);
    } catch (e: any) {
      toast('Push error: ' + e.message, 'error');
    } finally {
      setPushingIds(prev => { const s = new Set(prev); s.delete(productId); return s; });
    }
  };

  const allFilteredSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedIds.has(p.id));
  const reviewingSuggestion = reviewingProductId ? suggestionsMap.get(reviewingProductId) : null;
  const reviewingProduct = reviewingProductId ? products.find(p => p.id === reviewingProductId) : null;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={22} style={{ color: '#10b981' }} />
            Shopify SEO Optimizer
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Pull products from Shopify, run AI SEO optimization, review changes, and push approved updates back.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            onClick={() => handleLoadProducts(null)}
            disabled={isFetchingProducts || !isShopifyConnected}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={16} style={{ animation: isFetchingProducts ? 'spin 1s linear infinite' : 'none' }} />
            {isFetchingProducts ? 'Loading…' : hasFetched ? 'Reload Products' : 'Load Products'}
          </button>
          {hasFetched && (
            <button
              className="btn-primary"
              onClick={handleOptimize}
              disabled={isOptimizing || selectedIds.size === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              <Sparkles size={16} style={{ animation: isOptimizing ? 'spin 1s linear infinite' : 'none' }} />
              {isOptimizing ? 'Optimizing…' : `Optimize ${selectedIds.size} Selected`}
            </button>
          )}
        </div>
      </div>

      {/* Not connected warning */}
      {!isShopifyConnected && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '1rem', color: '#ef4444', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={18} />
          Connect Shopify in the Settings tab before using the SEO Optimizer.
        </div>
      )}

      {/* Results */}
      {hasFetched && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={toggleAll}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}
              >
                {allFilteredSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                {allFilteredSelected ? 'Deselect All' : 'Select All'}
              </button>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {selectedIds.size} of {products.length} selected
              </span>
              {perfectScoreCount > 0 && (
                <button
                  onClick={() => setHidePerfectScore(h => !h)}
                  style={{ background: hidePerfectScore ? 'rgba(16,185,129,0.15)' : 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer', color: '#10b981', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}
                >
                  {hidePerfectScore ? <Square size={13} /> : <CheckSquare size={13} />}
                  {perfectScoreCount} perfect 100 — {hidePerfectScore ? 'show' : 'hide'}
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="Filter by title, type, vendor, or tag…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--glass-bg)', color: 'var(--text-primary)', fontSize: '0.875rem', width: '280px' }}
            />
          </div>

          {/* Table */}
          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 60px 1fr 130px 160px 120px 80px', gap: '0', borderBottom: '1px solid var(--border-color)', padding: '0.6rem 1rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <div></div>
              <div>Image</div>
              <div>Title / Type</div>
              <div>SEO Score</div>
              <div>Status</div>
              <div>Action</div>
              <div style={{ textAlign: 'center' }}>Link</div>
            </div>

            <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {filteredProducts.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {searchQuery ? 'No products match your filter.' : 'No products loaded yet.'}
                </div>
              ) : filteredProducts.map((p, idx) => {
                const isSelected = selectedIds.has(p.id);
                const score = computeShopifySEOScore(p);
                const suggestion = suggestionsMap.get(p.id);
                const isOptimizingThis = optimizingProductIds.has(p.id);
                const isPushingThis = pushingIds.has(p.id);
                const wasPushed = pushedIds.has(p.id);
                const numericId = p.id.split('/').pop();

                return (
                  <div
                    key={p.id}
                    onClick={() => toggleProduct(p.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 60px 1fr 130px 160px 120px 80px',
                      gap: '0',
                      padding: '0.6rem 1rem',
                      borderBottom: idx < filteredProducts.length - 1 ? '1px solid var(--border-color)' : 'none',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(16,185,129,0.06)' : 'transparent',
                      alignItems: 'center',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ color: isSelected ? '#10b981' : 'var(--text-secondary)' }}>
                      {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                    </div>

                    <div>
                      {p.images[0]?.url ? (
                        <img src={p.images[0].url} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                      ) : (
                        <div style={{ width: '48px', height: '48px', borderRadius: '6px', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>No img</div>
                      )}
                    </div>

                    <div style={{ minWidth: 0, paddingRight: '0.75rem' }}>
                      <div style={{ fontWeight: 500, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {p.productType || '—'} · {p.vendor || '—'} · {(p.tags || []).length} tag{(p.tags || []).length !== 1 ? 's' : ''}
                      </div>
                    </div>

                    <div onClick={e => e.stopPropagation()}>
                      <ScoreBadge score={score.total} grade={score.grade} />
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {isOptimizingThis ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981' }}>
                          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Optimizing…
                        </span>
                      ) : wasPushed ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: 600 }}>
                          <Check size={13} /> Pushed
                        </span>
                      ) : suggestion ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#a855f7' }}>
                          <Sparkles size={13} /> Ready to review
                        </span>
                      ) : (
                        <span>
                          {score.breakdown.hasSeoTitle === 0 && '• Missing SEO title '}
                          {score.breakdown.hasSeoDescription === 0 && '• Missing meta desc '}
                          {score.breakdown.tagCount < 5 && '• Few tags '}
                        </span>
                      )}
                    </div>

                    <div onClick={e => e.stopPropagation()}>
                      {suggestion && !wasPushed ? (
                        <button
                          onClick={() => setReviewingProductId(p.id)}
                          disabled={isPushingThis}
                          style={{
                            padding: '4px 10px', borderRadius: '6px',
                            background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)',
                            color: '#a855f7', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px',
                          }}
                        >
                          {isPushingThis ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={12} />}
                          Review
                        </button>
                      ) : null}
                    </div>

                    <div style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <a
                        href={`/admin/products/${numericId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}
                        title="Open in Shopify Admin"
                      >
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {pageInfo.hasNextPage && (
              <div style={{ padding: '0.75rem', borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
                <button
                  onClick={() => handleLoadProducts(pageInfo.endCursor)}
                  disabled={isFetchingProducts}
                  style={{
                    padding: '6px 14px', borderRadius: '6px',
                    background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)', fontSize: '0.85rem', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                  }}
                >
                  <ChevronDown size={14} />
                  {isFetchingProducts ? 'Loading…' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Review Modal */}
      {reviewingSuggestion && reviewingProduct && (
        <ReviewModal
          suggestion={reviewingSuggestion}
          product={reviewingProduct}
          isPushing={pushingIds.has(reviewingSuggestion.productId)}
          onClose={() => setReviewingProductId(null)}
          onFieldDecision={setFieldDecision}
          onFieldEdit={setFieldAfter}
          onAcceptAll={acceptAll}
          onRejectAll={rejectAll}
          onPush={handlePushProduct}
        />
      )}
    </div>
  );
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

interface ReviewModalProps {
  suggestion: SEOProductSuggestion;
  product: ShopifyProduct;
  isPushing: boolean;
  onClose: () => void;
  onFieldDecision: (productId: string, field: SEOFieldKey, accepted: boolean | null) => void;
  onFieldEdit: (productId: string, field: SEOFieldKey, newAfter: string) => void;
  onAcceptAll: (productId: string) => void;
  onRejectAll: (productId: string) => void;
  onPush: (productId: string) => void;
}

function ReviewModal({ suggestion, product, isPushing, onClose, onFieldDecision, onFieldEdit, onAcceptAll, onRejectAll, onPush }: ReviewModalProps) {
  const approvedCount = suggestion.fields.filter(f => f.accepted === true).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '2rem 1rem', backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-primary, #141419)', border: '1px solid var(--glass-border)',
          borderRadius: '12px', maxWidth: '1400px', width: '95vw',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 4rem)', height: 'calc(100vh - 4rem)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            {product.images[0]?.url && (
              <img src={product.images[0].url} alt="" style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.title}</h3>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Review AI SEO suggestions · {approvedCount} of {suggestion.fields.length} approved
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
            <X size={20} />
          </button>
        </div>

        {/* Batch buttons */}
        <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onAcceptAll(suggestion.productId)}
            style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Check size={13} /> Accept All
          </button>
          <button
            onClick={() => onRejectAll(suggestion.productId)}
            style={{ padding: '6px 12px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <X size={13} /> Reject All
          </button>
        </div>

        {/* Field Diffs */}
        <div style={{ overflowY: 'auto', padding: '1rem 1.5rem', flex: 1, minHeight: 0 }}>
          {suggestion.fields.map(f => (
            <FieldDiffRow
              key={f.field}
              field={f}
              onDecision={(accepted) => onFieldDecision(suggestion.productId, f.field, accepted)}
              onEdit={(newAfter) => onFieldEdit(suggestion.productId, f.field, newAfter)}
            />
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {approvedCount === 0 ? 'No fields approved — accept at least one to push.' : `${approvedCount} approved change${approvedCount !== 1 ? 's' : ''} will be pushed to Shopify.`}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{ padding: '8px 14px', borderRadius: '6px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)', fontSize: '0.88rem', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={() => onPush(suggestion.productId)}
              disabled={approvedCount === 0 || isPushing}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: '0.88rem', padding: '8px 14px', opacity: approvedCount === 0 ? 0.5 : 1 }}
            >
              {isPushing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={14} />}
              {isPushing ? 'Pushing…' : 'Push Approved to Shopify'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Field Diff Row ───────────────────────────────────────────────────────────

function FieldDiffRow({ field, onDecision, onEdit }: { field: SEOFieldSuggestion; onDecision: (accepted: boolean | null) => void; onEdit: (newAfter: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isSameValue = field.before.trim() === field.after.trim();
  const isEmptyAfter = !field.after.trim();
  const accepted = field.accepted;
  const borderColor =
    accepted === true ? 'rgba(16,185,129,0.4)'
    : accepted === false ? 'rgba(239,68,68,0.3)'
    : 'var(--glass-border)';
  const bgColor =
    accepted === true ? 'rgba(16,185,129,0.05)'
    : accepted === false ? 'rgba(239,68,68,0.03)'
    : 'transparent';

  const beforeText = displayValue(field.field, field.before);
  const isMultiline = field.field === 'descriptionHtml';
  const editorStyle: CSSProperties = {
    background: 'rgba(16,185,129,0.06)',
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: '6px',
    padding: '0.5rem 0.75rem',
    fontSize: '0.82rem',
    color: 'var(--text-primary)',
    width: '100%',
    fontFamily: isMultiline ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    resize: isMultiline ? 'vertical' : undefined,
    minHeight: '2.4em',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: '8px',
      padding: '0.75rem 1rem',
      marginBottom: '0.75rem',
      background: bgColor,
      transition: 'background 0.15s, border-color 0.15s',
    }}>
      {/* Row header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{FIELD_LABELS[field.field]}</span>
          {isSameValue && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: '4px' }}>No change</span>}
          {isEmptyAfter && !isSameValue && <span style={{ fontSize: '0.68rem', color: '#f59e0b' }}>Empty suggestion</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => onDecision(accepted === true ? null : true)}
            style={{
              padding: '4px 10px', borderRadius: '6px',
              background: accepted === true ? '#10b981' : 'rgba(16,185,129,0.1)',
              border: `1px solid ${accepted === true ? '#10b981' : 'rgba(16,185,129,0.3)'}`,
              color: accepted === true ? '#fff' : '#10b981',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
            disabled={isEmptyAfter}
          >
            <Check size={12} /> Accept
          </button>
          <button
            onClick={() => onDecision(accepted === false ? null : false)}
            style={{
              padding: '4px 10px', borderRadius: '6px',
              background: accepted === false ? '#ef4444' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${accepted === false ? '#ef4444' : 'rgba(239,68,68,0.25)'}`,
              color: accepted === false ? '#fff' : '#ef4444',
              fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
          >
            <XCircle size={12} /> Reject
          </button>
        </div>
      </div>

      {/* Before / After */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: '8px', alignItems: 'stretch' }}>
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.82rem',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: '2.4em',
          color: beforeText ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}>
          {beforeText || <em>(empty)</em>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
          <ArrowRight size={14} />
        </div>
        {isMultiline ? (
          <textarea
            value={field.after}
            onChange={e => onEdit(e.target.value)}
            rows={14}
            placeholder="HTML description"
            style={editorStyle}
          />
        ) : (
          <input
            type="text"
            value={field.after}
            onChange={e => onEdit(e.target.value)}
            placeholder={field.field === 'tags' ? 'comma, separated, tags, TC200' : ''}
            style={editorStyle}
          />
        )}
      </div>

      {/* Tags catalog-code hint */}
      {field.field === 'tags' && (
        <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
          Tip: Catalog codes use <span style={{ background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '3px', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: 'var(--text-primary)' }}>XX###</span> format — e.g. <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>TC200</span>, <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>TY100</span>, <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>PK200</span>. Edit above to add or change one.
        </div>
      )}

      {/* Rationale */}
      {field.rationale && (
        <div style={{ marginTop: '0.5rem' }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.76rem', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Hide' : 'Show'} AI rationale
          </button>
          {expanded && (
            <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', paddingLeft: '16px', borderLeft: '2px solid var(--border-color)' }}>
              {field.rationale}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
