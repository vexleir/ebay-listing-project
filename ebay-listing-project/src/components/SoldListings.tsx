import { useState, useEffect, useCallback, useMemo } from 'react';
import { Trash2, RotateCcw, Search, ChevronDown, LayoutGrid, List, DollarSign, TrendingUp, Package, Check, X, Download, RefreshCw } from 'lucide-react';
import type { StagedListing } from '../types';
import { useToast } from '../context/ToastContext';
import { calculateNetProfit } from '../utils/fees';
import { buildSoldExportCsv, buildSoldExportFilename } from '../utils/soldExport';
import { downloadCsv } from '../utils/csv';
import { useListFilterSort } from '../hooks/useListFilterSort';

interface SoldListingsProps {
  listings: StagedListing[];
  onDelete: (id: string) => void;
  onUnmarkSold: (id: string) => void;
  onRelist?: (listing: StagedListing) => void;
  // P0.2 — sold-history sync controls. Optional so the component still
  // renders in isolation (tests) without an eBay connection.
  isEbayConnected?: boolean;
  lookbackDays?: number;
  onLookbackChange?: (days: number) => void;
  onSyncSold?: (lookbackDays: number) => void | Promise<void>;
}

type SortOption = 'sold-desc' | 'sold-asc' | 'revenue-desc' | 'revenue-asc' | 'title-asc';
type ViewMode = 'grid' | 'list';

function parsePrice(val: string | undefined): number {
  return parseFloat((val || '0').replace(/[^0-9.]/g, '')) || 0;
}

function formatDate(ts: number | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

export default function SoldListings({ listings, onDelete, onUnmarkSold, onRelist, isEbayConnected, lookbackDays = 30, onLookbackChange, onSyncSold }: SoldListingsProps) {
  const { toast } = useToast();
  const [sort, setSort] = useState<SortOption>('sold-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  const handleSyncClick = async () => {
    if (!onSyncSold) return;
    setSyncing(true);
    try {
      await onSyncSold(lookbackDays);
    } finally {
      setSyncing(false);
    }
  };

  // FE-004 follow-through — search / pagination state moves to the shared hook.
  const filterFn = useCallback((l: StagedListing, q: string) =>
    !q || l.title.toLowerCase().includes(q) || (l.sku || '').toLowerCase().includes(q)
  , []);
  const sortFn = useMemo(() => {
    switch (sort) {
      case 'sold-desc':    return (a: StagedListing, b: StagedListing) => (b.soldAt || 0) - (a.soldAt || 0);
      case 'sold-asc':     return (a: StagedListing, b: StagedListing) => (a.soldAt || 0) - (b.soldAt || 0);
      case 'revenue-desc': return (a: StagedListing, b: StagedListing) => parsePrice(b.soldPrice) - parsePrice(a.soldPrice);
      case 'revenue-asc':  return (a: StagedListing, b: StagedListing) => parsePrice(a.soldPrice) - parsePrice(b.soldPrice);
      case 'title-asc':    return (a: StagedListing, b: StagedListing) => a.title.localeCompare(b.title);
    }
  }, [sort]);

  const {
    query: search,
    setQuery: setSearch,
    perPage,
    setPerPage,
    currentPage,
    setCurrentPage,
    visible: filtered,
    paginated,
    totalPages,
  } = useListFilterSort<StagedListing>({
    items: listings,
    filter: filterFn,
    sort: sortFn,
    perPage: 20,
  });

  // The hook resets to page 1 on query change but doesn't know about the
  // local `sort` state — reset manually so sorting from page 3 lands on page 1.
  useEffect(() => { setCurrentPage(1); }, [sort, setCurrentPage]);

  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAllFiltered = () => setSelectedIds(new Set(filtered.map(l => l.id)));
  const clearSelection = () => setSelectedIds(new Set());
  const handleBulkDelete = () => { Array.from(selectedIds).forEach(id => onDelete(id)); clearSelection(); };

  // DATA-001 — export visible (filtered + sorted) sold items as CSV.
  // Uses the same fee math as Analytics so seller's bookkeeping matches the
  // in-app totals.
  const handleExportCsv = () => {
    if (filtered.length === 0) { toast('No sold items to export.', 'info'); return; }
    const csv = buildSoldExportCsv(filtered);
    downloadCsv(buildSoldExportFilename(), csv);
    toast(`Exported ${filtered.length} sold item${filtered.length === 1 ? '' : 's'} to CSV.`, 'success');
  };

  const totalRevenue = listings.reduce((sum, l) => sum + parsePrice(l.soldPrice), 0);
  const totalProfit = listings.reduce((sum, l) => {
    if (!l.costBasis) return sum;
    const np = calculateNetProfit(l.soldPrice || l.priceRecommendation, l.costBasis, l.category || '', l.shippingLabelCost);
    return sum + (np.netProfit || 0);
  }, 0);

  // Sync control — rendered in both the empty state and the toolbar so a
  // seller with zero synced sales can still pull their eBay sold history.
  const syncControls = onSyncSold ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
      <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Look back</label>
      <select
        className="input-base"
        aria-label="Sold history lookback window"
        value={lookbackDays}
        onChange={e => onLookbackChange?.(parseInt(e.target.value, 10))}
        style={{ width: 'auto', padding: '5px 8px', fontSize: '0.8rem', cursor: 'pointer' }}
      >
        <option value={30}>30 days</option>
        <option value={60}>60 days</option>
        <option value={90}>90 days</option>
      </select>
      <button
        onClick={handleSyncClick}
        disabled={syncing || !isEbayConnected}
        title={isEbayConnected ? 'Sync sold items from eBay' : 'Connect to eBay first'}
        style={{ fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--success)', borderRadius: '6px', cursor: syncing || !isEbayConnected ? 'default' : 'pointer', opacity: syncing || !isEbayConnected ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}
      >
        <RefreshCw size={13} style={syncing ? { animation: 'spin 1s linear infinite' } : undefined} />
        {syncing ? 'Syncing…' : 'Sync Sold'}
      </button>
    </div>
  ) : null;

  if (listings.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <DollarSign size={48} style={{ color: 'var(--text-secondary)', opacity: 0.3, marginBottom: '1rem' }} />
        <h2 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>No Sold Items</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: syncControls ? '1.5rem' : 0 }}>Items marked as sold will appear here.</p>
        {syncControls && <div style={{ display: 'flex', justifyContent: 'center' }}>{syncControls}</div>}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const renderCard = (listing: StagedListing) => {
    const soldAmt = parsePrice(listing.soldPrice);
    const listedAmt = parsePrice(listing.priceRecommendation);
    const np = listing.costBasis
      ? calculateNetProfit(listing.soldPrice || listing.priceRecommendation, listing.costBasis, listing.category || '', listing.shippingLabelCost)
      : null;
    const isSelected = selectedIds.has(listing.id);

    return (
      <div key={listing.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${isSelected ? 'var(--accent-color)' : 'rgba(16,185,129,0.35)'}`, outline: isSelected ? '2px solid var(--accent-color)' : 'none', outlineOffset: '2px' }}>
        <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.15)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: 600 }}>
          ✓ SOLD · {formatDate(listing.soldAt)}
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', opacity: 0.8 }}>
            {listedAmt > 0 && soldAmt > 0 && listedAmt !== soldAmt ? `Listed $${listedAmt.toFixed(2)} → ` : ''}
            ${soldAmt > 0 ? soldAmt.toFixed(2) : listedAmt.toFixed(2)}
          </span>
        </div>
        <div style={{ height: '120px', background: 'rgba(0,0,0,0.5)', cursor: listing.images?.[0] ? 'pointer' : 'default', position: 'relative' }}
          onClick={() => listing.images?.[0] && (setLightboxImages(listing.images), setLightboxIndex(0))}>
          <div onClick={e => { e.stopPropagation(); toggleSelect(listing.id); }} style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 3, cursor: 'pointer', width: '22px', height: '22px', borderRadius: '5px', background: isSelected ? 'var(--accent-color)' : 'rgba(0,0,0,0.6)', border: `2px solid ${isSelected ? 'var(--accent-color)' : 'rgba(255,255,255,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
            {isSelected && <Check size={13} color="white" />}
          </div>
          {listing.images?.[0]
            ? <img src={listing.images[0]} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>No image</div>
          }
        </div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{listing.title}</h3>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            {listing.sku && <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.2)', padding: '2px 7px', borderRadius: '4px', color: '#a5b4fc' }}>SKU: {listing.sku}</span>}
            {listing.category && <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.08)', padding: '2px 7px', borderRadius: '4px' }}>{listing.category}</span>}
          </div>
          {np && (
            <div style={{ fontSize: '0.8rem', color: np.netProfit >= 0 ? 'var(--success)' : '#ef4444', marginBottom: '0.75rem' }}>
              Net {np.netProfit >= 0 ? '+' : ''}${np.netProfit.toFixed(2)}
              {np.netMarginPct !== null && <span style={{ opacity: 0.7 }}> ({np.netMarginPct.toFixed(0)}%)</span>}
            </div>
          )}
          <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)' }}>
            {onRelist && (
              <button className="btn-icon" title="Re-stage for relisting" onClick={() => onRelist(listing)} style={{ color: 'var(--accent)' }}>
                <RotateCcw size={17} />
              </button>
            )}
            <button className="btn-icon" title="Unmark as sold (move back to Listed)" onClick={() => { onUnmarkSold(listing.id); toast('Moved back to Listed.', 'info'); }}
              style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', gap: '4px' }}>
              <Package size={17} /> Unmark
            </button>
            <button className="btn-icon" title="Delete" style={{ color: '#ef4444', marginLeft: 'auto' }} onClick={() => onDelete(listing.id)}>
              <Trash2 size={17} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderListRow = (listing: StagedListing) => {
    const soldAmt = parsePrice(listing.soldPrice);
    const listedAmt = parsePrice(listing.priceRecommendation);
    const isSelected = selectedIds.has(listing.id);
    return (
      <div key={listing.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
        <div onClick={() => toggleSelect(listing.id)} style={{ width: '18px', height: '18px', flexShrink: 0, borderRadius: '4px', background: isSelected ? 'var(--accent-color)' : 'transparent', border: `2px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isSelected && <Check size={11} color="white" />}
        </div>
        <div style={{ width: '48px', height: '48px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', background: 'rgba(0,0,0,0.4)', cursor: listing.images?.[0] ? 'pointer' : 'default' }}
          onClick={() => listing.images?.[0] && (setLightboxImages(listing.images), setLightboxIndex(0))}>
          {listing.images?.[0]
            ? <img src={listing.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.65rem' }}>—</div>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 500, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.title}</p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{listing.category}</span>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--success)' }}>${soldAmt > 0 ? soldAmt.toFixed(2) : listedAmt.toFixed(2)}</div>
          {listedAmt > 0 && soldAmt > 0 && listedAmt !== soldAmt && (
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>listed ${listedAmt.toFixed(2)}</div>
          )}
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>{formatDate(listing.soldAt)}</span>
        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          {onRelist && (
            <button className="btn-icon" title="Re-stage for relisting" onClick={() => onRelist(listing)} style={{ color: 'var(--accent)' }}>
              <RotateCcw size={16} />
            </button>
          )}
          <button className="btn-icon" title="Unmark as sold" onClick={() => { onUnmarkSold(listing.id); toast('Moved back to Listed.', 'info'); }}>
            <Package size={16} />
          </button>
          <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }} onClick={() => onDelete(listing.id)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div>
      {lightboxImages && (
        <div onClick={() => setLightboxImages(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={lightboxImages[lightboxIndex]} alt="" style={{ maxHeight: '90vh', maxWidth: '90vw', objectFit: 'contain' }} onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Summary stats */}
      <div className="summary-tiles-row" style={{ marginBottom: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Package size={22} style={{ color: 'var(--success)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{listings.length}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Items Sold</div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <DollarSign size={22} style={{ color: 'var(--success)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>${totalRevenue.toFixed(2)}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Total Revenue</div>
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <TrendingUp size={22} style={{ color: totalProfit >= 0 ? 'var(--success)' : '#ef4444', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: totalProfit >= 0 ? 'var(--success)' : '#ef4444' }}>
              {totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Net Profit</div>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '0.6rem 1rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 500 }}>{selectedIds.size} selected</span>
          <button onClick={handleBulkDelete} style={{ fontSize: '0.8rem', padding: '4px 12px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Trash2 size={13} /> Delete Selected
          </button>
          <button onClick={clearSelection} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <input type="text" className="input-base" placeholder="Search sold items..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <select className="input-base" value={sort} onChange={e => setSort(e.target.value as SortOption)} style={{ paddingRight: '2rem', appearance: 'none', cursor: 'pointer', minWidth: '160px' }}>
            <option value="sold-desc">Sold: Newest First</option>
            <option value="sold-asc">Sold: Oldest First</option>
            <option value="revenue-desc">Revenue: High → Low</option>
            <option value="revenue-asc">Revenue: Low → High</option>
            <option value="title-asc">Title: A → Z</option>
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
        </div>
        <button onClick={selectedIds.size > 0 ? clearSelection : selectAllFiltered}
          style={{ fontSize: '0.8rem', padding: '5px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {selectedIds.size > 0 ? 'Deselect All' : `Select All (${filtered.length})`}
        </button>
        <button onClick={handleExportCsv} title="Export visible sold items as CSV"
          style={{ fontSize: '0.8rem', padding: '5px 10px', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--success)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <Download size={13} /> Export CSV
        </button>
        {syncControls}
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button onClick={() => setViewMode('grid')} title="Grid view" style={{ padding: '6px 10px', background: viewMode === 'grid' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'grid' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LayoutGrid size={18} />
          </button>
          <button onClick={() => setViewMode('list')} title="List view" style={{ padding: '6px 10px', background: viewMode === 'list' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'list' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <List size={18} />
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No results for "{search}"</p>
        </div>
      )}

      {paginated.length > 0 && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {paginated.map(l => renderCard(l))}
        </div>
      )}
      {paginated.length > 0 && viewMode === 'list' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {paginated.map(l => renderListRow(l))}
          <div style={{ height: '1px' }} />
        </div>
      )}

      {/* Pagination controls */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span style={{ marginRight: '4px' }}>Show:</span>
            {[20, 50, 100, 200, 0].map(n => (
              <button key={n} onClick={() => { setPerPage(n); setCurrentPage(1); }}
                style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid', cursor: 'pointer', fontSize: '0.8rem',
                  background: perPage === n ? 'rgba(99,102,241,0.2)' : 'transparent',
                  borderColor: perPage === n ? 'var(--accent-color)' : 'var(--border-color)',
                  color: perPage === n ? '#a5b4fc' : 'var(--text-secondary)' }}>
                {n === 0 ? 'All' : n}
              </button>
            ))}
          </div>
          {totalPages > 1 && (
            <>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.35 : 1 }}>
                ←
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Page {currentPage} of {totalPages} · {filtered.length} items
              </span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.35 : 1 }}>
                →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
