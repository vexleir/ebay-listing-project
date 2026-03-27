import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Calendar, CheckCircle, Trash2, Archive, ArchiveRestore, Search, ChevronDown, LayoutGrid, List, Download, RefreshCw, Eye, RotateCcw, Pencil, CircleSlash, X, Share2 } from 'lucide-react';
import type { StagedListing } from '../types';
import ImageSearchButton from './ImageSearchButton';
import Lightbox from './Lightbox';
import { useToast } from '../context/ToastContext';
import { calculateNetProfit } from '../utils/fees';
import CrossPostModal from './CrossPostModal';

interface ListedProductsProps {
  listings: StagedListing[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onSyncSold?: () => void;
  onRelist?: (listing: StagedListing) => void;
  isEbayConnected?: boolean;
  appPassword?: string;
}

type SortOption = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'price-asc' | 'price-desc';
type ViewMode = 'grid' | 'list';

function parsePrice(val: string): number {
  const m = val.replace(/[^0-9.]/g, '');
  return m ? parseFloat(m) : 0;
}

function ProfitBadge({ price, costBasis, category, shippingLabelCost }: { price: string; costBasis?: string; category?: string; shippingLabelCost?: string }) {
  if (!costBasis) return null;
  const np = calculateNetProfit(price, costBasis, category || '', shippingLabelCost);
  if (!np.salePrice || !np.costBasis) return null;
  const color = np.netProfit >= 0 ? 'var(--success)' : '#ef4444';
  const bg = np.netProfit >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
  const pct = np.netMarginPct !== null ? `${np.netMarginPct.toFixed(0)}%` : '';
  return (
    <span title={`Gross: $${np.grossProfit.toFixed(2)} · eBay fees: $${(np.ebayFee + np.transactionFee).toFixed(2)}${np.shippingCost > 0 ? ` · Shipping: $${np.shippingCost.toFixed(2)}` : ''}`}
      style={{ fontSize: '0.78rem', background: bg, color, padding: '2px 8px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'help' }}>
      Net {np.netProfit >= 0 ? '+' : ''}${np.netProfit.toFixed(2)}{pct ? ` (${pct})` : ''}
    </span>
  );
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function exportCsv(listings: StagedListing[]) {
  const headers = ['Title', 'SKU', 'Price', 'Category', 'eBay ID', 'Status', 'Date Created', 'Last Updated'];
  const rows = listings.map(l => [
    `"${(l.title || '').replace(/"/g, '""')}"`,
    `"${(l.sku || '').replace(/"/g, '""')}"`,
    l.priceRecommendation || '',
    `"${(l.category || '').replace(/"/g, '""')}"`,
    l.ebayDraftId || '',
    l.archived ? 'Archived' : 'Active',
    new Date(l.createdAt).toLocaleDateString(),
    l.updatedAt ? new Date(l.updatedAt).toLocaleDateString() : ''
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `listed-products-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ListedProductsView({ listings, onDelete, onArchive, onSyncSold, onRelist, isEbayConnected, appPassword = '' }: ListedProductsProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('date-desc');
  const [showArchived, setShowArchived] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, { watchCount: string; hitCount: string; quantitySold: string } | null>>({});
  const [loadingStatsId, setLoadingStatsId] = useState<string | null>(null);

  // Revise price modal
  const [crossPostListing, setCrossPostListing] = useState<StagedListing | null>(null);
  const [reviseModal, setReviseModal] = useState<{ listing: StagedListing; price: string; title: string } | null>(null);
  const [revising, setRevising] = useState(false);
  // End listing confirm
  const [endConfirmId, setEndConfirmId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const pw = appPassword || localStorage.getItem('app_password') || '';

  const handleRevise = async () => {
    if (!reviseModal) return;
    setRevising(true);
    try {
      const resp = await fetch('/api/ebay/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-password': pw },
        body: JSON.stringify({ itemId: reviseModal.listing.ebayDraftId, newPrice: reviseModal.price, newTitle: reviseModal.title })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Revise failed');
      onArchive(reviseModal.listing.id); // trigger re-fetch via archive toggle as update mechanism
      toast('eBay listing updated.', 'success');
      setReviseModal(null);
    } catch (e: any) {
      toast('Revise failed: ' + e.message, 'error');
    } finally {
      setRevising(false);
    }
  };

  const handleEndListing = async (listing: StagedListing) => {
    setEnding(true);
    try {
      const resp = await fetch('/api/ebay/end-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-password': pw },
        body: JSON.stringify({ itemId: listing.ebayDraftId })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'End listing failed');
      onArchive(listing.id);
      toast('eBay listing ended and archived.', 'success');
    } catch (e: any) {
      toast('End listing failed: ' + e.message, 'error');
    } finally {
      setEnding(false);
      setEndConfirmId(null);
    }
  };

  const fetchStats = async (listing: StagedListing) => {
    if (!listing.ebayDraftId) return;
    setLoadingStatsId(listing.id);
    try {
      const resp = await fetch(`/api/ebay/listing-stats?itemId=${encodeURIComponent(listing.ebayDraftId)}`);
      const data = await resp.json();
      if (data.error) { toast('Could not fetch stats: ' + data.error, 'error'); return; }
      setStats(prev => ({ ...prev, [listing.id]: data }));
    } catch (e: any) {
      toast('Stats fetch failed: ' + e.message, 'error');
    } finally {
      setLoadingStatsId(null);
    }
  };

  const active = listings.filter(l => !l.archived);
  const archived = listings.filter(l => l.archived);
  const allTags = Array.from(new Set(listings.flatMap(l => l.tags || [])));

  const applyFilter = (items: StagedListing[]) => {
    const q = search.toLowerCase();
    return items
      .filter(l => !activeTag || l.tags?.includes(activeTag))
      .filter(l => !q || l.title.toLowerCase().includes(q) || (l.sku || '').toLowerCase().includes(q) || (l.category || '').toLowerCase().includes(q))
      .sort((a, b) => {
        switch (sort) {
          case 'date-asc':   return a.createdAt - b.createdAt;
          case 'date-desc':  return b.createdAt - a.createdAt;
          case 'title-asc':  return a.title.localeCompare(b.title);
          case 'title-desc': return b.title.localeCompare(a.title);
          case 'price-asc':  return parsePrice(a.priceRecommendation) - parsePrice(b.priceRecommendation);
          case 'price-desc': return parsePrice(b.priceRecommendation) - parsePrice(a.priceRecommendation);
          default: return 0;
        }
      });
  };

  const filteredActive   = applyFilter(active);
  const filteredArchived = applyFilter(archived);

  if (listings.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No Listed Items</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Items you push to eBay will appear here.</p>
      </div>
    );
  }

  const renderCard = (listing: StagedListing, isArchived: boolean) => (
    <div key={listing.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${isArchived ? 'var(--border-color)' : 'var(--success-light)'}`, opacity: isArchived ? 0.65 : 1 }}>
      {listing.soldAt ? (
        <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.2)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
          ✓ SOLD
          {listing.soldPrice && <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>· Listed ${listing.priceRecommendation} → Sold ${listing.soldPrice}</span>}
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>{new Date(listing.soldAt).toLocaleDateString()}</span>
        </div>
      ) : !isArchived ? (
        <div style={{ padding: '8px 12px', background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
          <CheckCircle size={16} /> Successfully Pushed
          {listing.ebayDraftId && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.8 }}>ID: {listing.ebayDraftId}</span>}
        </div>
      ) : (
        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
          <Archive size={16} /> Archived
          {listing.ebayDraftId && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.6 }}>ID: {listing.ebayDraftId}</span>}
        </div>
      )}
      <div style={{ display: 'flex', height: '140px', background: 'rgba(0,0,0,0.5)' }}>
        {listing.images && listing.images.length > 0 ? (
          <div style={{ flex: 1, height: '100%', position: 'relative', cursor: 'pointer' }} onClick={() => { setLightboxImages(listing.images); setLightboxIndex(0); }}>
            <img src={listing.images[0]} alt="Main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <ImageSearchButton src={listing.images[0]} />
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No images</div>
        )}
      </div>
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{listing.title}</h3>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Calendar size={13} /> {new Date(listing.createdAt).toLocaleDateString()}</span>
          {listing.updatedAt && listing.updatedAt !== listing.createdAt && <span style={{ opacity: 0.7 }}>· updated {timeAgo(listing.updatedAt)}</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>${listing.priceRecommendation}</span>
          <ProfitBadge price={listing.priceRecommendation} costBasis={listing.costBasis} category={listing.category} shippingLabelCost={listing.shippingLabelCost} />
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>{listing.category}</span>
          {listing.sku && <span style={{ fontSize: '0.8rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc' }}>SKU: {listing.sku}</span>}
        </div>
        {listing.sellerNotes && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 8px', marginBottom: '0.75rem', fontStyle: 'italic' }}>📝 {listing.sellerNotes}</p>}
        {stats[listing.id] && (
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
            <span title="Views"><Eye size={12} style={{ marginRight: '3px', verticalAlign: 'middle' }} />{stats[listing.id]!.hitCount} views</span>
            <span title="Watchers">👁 {stats[listing.id]!.watchCount} watchers</span>
            {parseInt(stats[listing.id]!.quantitySold) > 0 && <span style={{ color: 'var(--success)' }}>✓ {stats[listing.id]!.quantitySold} sold</span>}
          </div>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <a className="btn-primary" href="https://www.ebay.com/mes/sellerhub" target="_blank" rel="noreferrer" style={{ textDecoration: 'none', flex: 1, fontSize: '0.85rem', padding: '6px 12px', minWidth: '90px' }}>
            <ExternalLink size={16} /> eBay
          </a>
          {onRelist && (isArchived || listing.soldAt) && (
            <button className="btn-icon" title="Re-stage for relisting" onClick={() => onRelist(listing)} style={{ color: 'var(--accent-color)' }}>
              <RotateCcw size={18} />
            </button>
          )}
          {listing.ebayDraftId && !isArchived && (
            <button className="btn-icon" title="Edit price/title on eBay" onClick={() => setReviseModal({ listing, price: listing.priceRecommendation || '', title: listing.title || '' })}>
              <Pencil size={18} />
            </button>
          )}
          {listing.ebayDraftId && !isArchived && (
            <button className="btn-icon" title="End listing on eBay" style={{ color: '#ef4444' }} onClick={() => setEndConfirmId(listing.id)}>
              <CircleSlash size={18} />
            </button>
          )}
          {listing.ebayDraftId && (
            <button className="btn-icon" title="Fetch view/watcher stats from eBay" onClick={() => fetchStats(listing)} disabled={loadingStatsId === listing.id} style={{ color: stats[listing.id] ? 'var(--accent-color)' : undefined }}>
              {loadingStatsId === listing.id ? <span style={{ fontSize: '10px' }}>...</span> : <Eye size={18} />}
            </button>
          )}
          <button className="btn-icon" title="Cross-post to other platforms" onClick={() => setCrossPostListing(listing)}>
            <Share2 size={18} />
          </button>
          <button className="btn-icon" title={isArchived ? 'Unarchive' : 'Archive'} onClick={() => { onArchive(listing.id); toast(isArchived ? 'Listing unarchived.' : 'Listing archived.', 'success'); }}>
            {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </button>
          <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }} onClick={() => onDelete(listing.id)}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  const renderListRow = (listing: StagedListing, isArchived: boolean) => (
    <div key={listing.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', opacity: isArchived ? 0.65 : 1, borderBottom: '1px solid var(--border-color)' }}>
      <div style={{ width: '56px', height: '56px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', background: 'rgba(0,0,0,0.4)', position: 'relative', cursor: listing.images?.[0] ? 'pointer' : 'default' }}
        onClick={() => listing.images?.[0] && (setLightboxImages(listing.images), setLightboxIndex(0))}>
        {listing.images?.[0] ? (
          <><img src={listing.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><ImageSearchButton src={listing.images[0]} size="sm" /></>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>—</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        {isArchived ? <Archive size={16} style={{ color: 'var(--text-secondary)' }} /> : <CheckCircle size={16} style={{ color: 'var(--success)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.title}</p>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
          {listing.sellerNotes && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic', flex: 1 }}>📝 {listing.sellerNotes}</p>}
          {listing.updatedAt && listing.updatedAt !== listing.createdAt && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.7 }}>updated {timeAgo(listing.updatedAt)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>${listing.priceRecommendation}</span>
        <ProfitBadge price={listing.priceRecommendation} costBasis={listing.costBasis} category={listing.category} shippingLabelCost={listing.shippingLabelCost} />
        {listing.sku && <span style={{ fontSize: '0.78rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc', whiteSpace: 'nowrap' }}>{listing.sku}</span>}
      </div>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>{new Date(listing.createdAt).toLocaleDateString()}</span>
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, alignItems: 'center' }}>
        <a className="btn-primary" href="https://www.ebay.com/mes/sellerhub" target="_blank" rel="noreferrer" style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '5px 10px', whiteSpace: 'nowrap' }}>
          <ExternalLink size={14} /> eBay
        </a>
        {listing.ebayDraftId && (
          <button className="btn-icon" title="Fetch view/watcher stats" onClick={() => fetchStats(listing)} disabled={loadingStatsId === listing.id} style={{ color: stats[listing.id] ? 'var(--accent-color)' : undefined }}>
            {loadingStatsId === listing.id ? <span style={{ fontSize: '10px' }}>...</span> : <Eye size={18} />}
          </button>
        )}
        <button className="btn-icon" title="Cross-post to other platforms" onClick={() => setCrossPostListing(listing)}>
          <Share2 size={18} />
        </button>
        <button className="btn-icon" title={isArchived ? 'Unarchive' : 'Archive'} onClick={() => { onArchive(listing.id); toast(isArchived ? 'Listing unarchived.' : 'Listing archived.', 'success'); }}>
          {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
        </button>
        <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }}
          onClick={() => onDelete(listing.id)}>
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {lightboxImages && createPortal(<Lightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxImages(null)} onNavigate={setLightboxIndex} />, document.body)}
      {crossPostListing && <CrossPostModal listing={crossPostListing} onClose={() => setCrossPostListing(null)} />}

      {/* Revise price modal */}
      {reviseModal && createPortal(
        <div onClick={() => setReviseModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '460px', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Pencil size={18} /> Edit eBay Listing</h3>
              <button onClick={() => setReviseModal(null)} className="btn-icon"><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Updates title and/or price on the live eBay listing. Images and description require eBay Seller Hub.</p>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Title (max 80 chars)</label>
            <input className="input-base" value={reviseModal.title} maxLength={80}
              onChange={e => setReviseModal(prev => prev ? { ...prev, title: e.target.value } : null)}
              style={{ marginBottom: '1rem' }} />
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>New Price ($)</label>
            <input className="input-base" type="number" step="0.01" min="0.01" value={reviseModal.price}
              onChange={e => setReviseModal(prev => prev ? { ...prev, price: e.target.value } : null)}
              style={{ marginBottom: '1.5rem' }} />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setReviseModal(null)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 2 }} onClick={handleRevise} disabled={revising}>
                {revising ? 'Updating...' : 'Update on eBay'}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* End listing confirm modal */}
      {endConfirmId && createPortal(
        <div onClick={() => setEndConfirmId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}><CircleSlash size={18} style={{ color: '#ef4444' }} /> End eBay Listing?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>This will permanently end the live eBay listing. The item will be archived in ListingStager. This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setEndConfirmId(null)}>Cancel</button>
              <button style={{ flex: 2, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => { const l = listings.find(x => x.id === endConfirmId); if (l) handleEndListing(l); }}
                disabled={ending}>
                {ending ? 'Ending...' : 'End Listing on eBay'}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', opacity: 0.7 }}>Filter:</span>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '4px', border: '1px solid', cursor: 'pointer', background: activeTag === tag ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)', borderColor: activeTag === tag ? 'var(--accent-color)' : 'var(--border-color)', color: activeTag === tag ? '#a5b4fc' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
              {tag}
            </button>
          ))}
          {activeTag && <button onClick={() => setActiveTag(null)} style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Clear</button>}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <input type="text" className="input-base" placeholder="Search by title, SKU, or category..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <select className="input-base" value={sort} onChange={e => setSort(e.target.value as SortOption)} style={{ paddingRight: '2rem', appearance: 'none', cursor: 'pointer', minWidth: '160px' }}>
            <option value="date-desc">Date: Newest First</option>
            <option value="date-asc">Date: Oldest First</option>
            <option value="title-asc">Title: A → Z</option>
            <option value="title-desc">Title: Z → A</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="price-asc">Price: Low → High</option>
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
        </div>
        {onSyncSold && (
          <button className="btn-icon" title={isEbayConnected ? 'Sync sold items from eBay' : 'Connect to eBay to sync sold items'} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: isEbayConnected ? 'var(--success)' : 'var(--text-secondary)', opacity: isEbayConnected ? 1 : 0.5 }}
            onClick={onSyncSold} disabled={!isEbayConnected}>
            <RefreshCw size={16} /> Sync Sold
          </button>
        )}
        <button className="btn-icon" title="Export CSV" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
          onClick={() => { exportCsv(listings); toast('CSV exported.', 'success'); }}>
          <Download size={16} /> CSV
        </button>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button onClick={() => setViewMode('grid')} title="Grid view" style={{ padding: '6px 10px', background: viewMode === 'grid' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'grid' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LayoutGrid size={18} />
          </button>
          <button onClick={() => setViewMode('list')} title="List view" style={{ padding: '6px 10px', background: viewMode === 'list' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'list' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <List size={18} />
          </button>
        </div>
      </div>

      {filteredActive.length === 0 && !search && <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', marginBottom: '1.5rem' }}><p style={{ color: 'var(--text-secondary)' }}>No active listed items.</p></div>}
      {filteredActive.length === 0 && search && <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}><p style={{ color: 'var(--text-secondary)' }}>No results for "{search}"</p></div>}

      {filteredActive.length > 0 && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {filteredActive.map(l => renderCard(l, false))}
        </div>
      )}
      {filteredActive.length > 0 && viewMode === 'list' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
          {filteredActive.map(l => renderListRow(l, false))}
          <div style={{ height: '1px' }} />
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <button onClick={() => setShowArchived(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1rem', padding: '4px 0' }}>
            <ChevronDown size={16} style={{ transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            Archived ({filteredArchived.length}{search ? ` of ${archived.length}` : ''})
          </button>
          {showArchived && filteredArchived.length > 0 && viewMode === 'grid' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
              {filteredArchived.map(l => renderCard(l, true))}
            </div>
          )}
          {showArchived && filteredArchived.length > 0 && viewMode === 'list' && (
            <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
              {filteredArchived.map(l => renderListRow(l, true))}
              <div style={{ height: '1px' }} />
            </div>
          )}
          {showArchived && filteredArchived.length === 0 && search && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No archived results for "{search}"</p>}
        </div>
      )}
    </div>
  );
}
