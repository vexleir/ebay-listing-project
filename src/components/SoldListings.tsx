import { useState } from 'react';
import { Trash2, RotateCcw, Search, ChevronDown, LayoutGrid, List, DollarSign, TrendingUp, Package } from 'lucide-react';
import type { StagedListing } from '../types';
import { useToast } from '../context/ToastContext';
import { calculateNetProfit } from '../utils/fees';

interface SoldListingsProps {
  listings: StagedListing[];
  onDelete: (id: string) => void;
  onUnmarkSold: (id: string) => void;
  onRelist?: (listing: StagedListing) => void;
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

export default function SoldListings({ listings, onDelete, onUnmarkSold, onRelist }: SoldListingsProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('sold-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const filtered = listings
    .filter(l => {
      const q = search.toLowerCase();
      return !q || l.title.toLowerCase().includes(q) || (l.sku || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sort) {
        case 'sold-desc':    return (b.soldAt || 0) - (a.soldAt || 0);
        case 'sold-asc':     return (a.soldAt || 0) - (b.soldAt || 0);
        case 'revenue-desc': return parsePrice(b.soldPrice) - parsePrice(a.soldPrice);
        case 'revenue-asc':  return parsePrice(a.soldPrice) - parsePrice(b.soldPrice);
        case 'title-asc':    return a.title.localeCompare(b.title);
        default: return 0;
      }
    });

  const totalRevenue = listings.reduce((sum, l) => sum + parsePrice(l.soldPrice), 0);
  const totalProfit = listings.reduce((sum, l) => {
    if (!l.costBasis) return sum;
    const np = calculateNetProfit(l.soldPrice || l.priceRecommendation, l.costBasis, l.category || '', l.shippingLabelCost);
    return sum + (np.netProfit || 0);
  }, 0);

  if (listings.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <DollarSign size={48} style={{ color: 'var(--text-secondary)', opacity: 0.3, marginBottom: '1rem' }} />
        <h2 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>No Sold Items</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Items marked as sold will appear here.</p>
      </div>
    );
  }

  const renderCard = (listing: StagedListing) => {
    const soldAmt = parsePrice(listing.soldPrice);
    const listedAmt = parsePrice(listing.priceRecommendation);
    const np = listing.costBasis
      ? calculateNetProfit(listing.soldPrice || listing.priceRecommendation, listing.costBasis, listing.category || '', listing.shippingLabelCost)
      : null;

    return (
      <div key={listing.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid rgba(16,185,129,0.35)' }}>
        <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.15)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem', fontWeight: 600 }}>
          ✓ SOLD · {formatDate(listing.soldAt)}
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', opacity: 0.8 }}>
            {listedAmt > 0 && soldAmt > 0 && listedAmt !== soldAmt ? `Listed $${listedAmt.toFixed(2)} → ` : ''}
            ${soldAmt > 0 ? soldAmt.toFixed(2) : listedAmt.toFixed(2)}
          </span>
        </div>
        <div style={{ height: '120px', background: 'rgba(0,0,0,0.5)', cursor: listing.images?.[0] ? 'pointer' : 'default' }}
          onClick={() => listing.images?.[0] && (setLightboxImages(listing.images), setLightboxIndex(0))}>
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
    return (
      <div key={listing.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
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

      {filtered.length > 0 && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {filtered.map(l => renderCard(l))}
        </div>
      )}
      {filtered.length > 0 && viewMode === 'list' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.map(l => renderListRow(l))}
          <div style={{ height: '1px' }} />
        </div>
      )}
    </div>
  );
}
