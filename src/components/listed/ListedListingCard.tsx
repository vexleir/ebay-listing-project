import { Archive, ArchiveRestore, Calendar, Check, CheckCircle, CircleSlash, DollarSign, ExternalLink, Eye, Pencil, RefreshCw, RotateCcw, Share2, Trash2, Undo2, Wand2 } from 'lucide-react';
import type { StagedListing } from '../../types';
import ImageSearchButton from '../ImageSearchButton';
import HealthBadge from '../listings/shared/HealthBadge';
import { timeAgo } from '../listings/shared/helpers';
import type { ListingStats } from './helpers';
import ProfitBadge from './ProfitBadge';

export interface ListedListingCardProps {
  listing: StagedListing;
  isArchived: boolean;
  isSelected: boolean;
  isEbayConnected?: boolean;
  stats?: ListingStats | null;
  loadingStats: boolean;
  refreshingImages: boolean;
  delistRelisting: boolean;
  onToggleSelect: (id: string) => void;
  onOpenLightbox: (images: string[], index: number) => void;
  onRefreshImages: (listing: StagedListing) => void;
  onRelist?: (listing: StagedListing) => void;
  onMoveToStaged?: (listing: StagedListing) => void;
  onMarkSold?: (listing: StagedListing) => void;
  onOptimize: (listing: StagedListing) => void;
  onEdit: (listing: StagedListing) => void;
  onDelistRelist?: (listing: StagedListing) => void;
  onEndListing: (listing: StagedListing) => void;
  onFetchStats: (listing: StagedListing) => void;
  onCrossPost: (listing: StagedListing) => void;
  onToggleArchive: (listing: StagedListing) => void;
  onDelete: (listing: StagedListing) => void;
}

export default function ListedListingCard({
  listing,
  isArchived,
  isSelected,
  isEbayConnected,
  stats,
  loadingStats,
  refreshingImages,
  delistRelisting,
  onToggleSelect,
  onOpenLightbox,
  onRefreshImages,
  onRelist,
  onMoveToStaged,
  onMarkSold,
  onOptimize,
  onEdit,
  onDelistRelist,
  onEndListing,
  onFetchStats,
  onCrossPost,
  onToggleArchive,
  onDelete,
}: ListedListingCardProps) {
  return (
    <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${isSelected ? 'var(--accent-color)' : isArchived ? 'var(--border-color)' : 'var(--success-light)'}`, opacity: isArchived ? 0.65 : 1, outline: isSelected ? '2px solid var(--accent-color)' : 'none', outlineOffset: '2px' }}>
      {listing.soldAt ? (
        <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.2)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
          SOLD
          {listing.soldPrice && <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>Listed ${listing.priceRecommendation} - Sold ${listing.soldPrice}</span>}
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
      <div style={{ display: 'flex', height: '140px', background: 'rgba(0,0,0,0.5)', position: 'relative' }}>
        <div onClick={() => onToggleSelect(listing.id)} style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 3, cursor: 'pointer', width: '22px', height: '22px', borderRadius: '5px', background: isSelected ? 'var(--accent-color)' : 'rgba(0,0,0,0.6)', border: `2px solid ${isSelected ? 'var(--accent-color)' : 'rgba(255,255,255,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
          {isSelected && <Check size={13} color="white" />}
        </div>
        {listing.images && listing.images.length > 0 ? (
          <div style={{ flex: 1, height: '100%', position: 'relative', cursor: 'pointer' }} onClick={() => onOpenLightbox(listing.images, 0)}>
            <img src={listing.images[0]} alt="Main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <ImageSearchButton src={listing.images[0]} />
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
            <span>No images</span>
            {listing.ebayDraftId && isEbayConnected && (
              <button
                className="btn-secondary"
                disabled={refreshingImages}
                onClick={() => onRefreshImages(listing)}
                style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Fetch image URLs from eBay for this item"
              >
                <RefreshCw size={12} style={{ animation: refreshingImages ? 'spin 1s linear infinite' : 'none' }} />
                {refreshingImages ? 'Fetching...' : 'Fetch from eBay'}
              </button>
            )}
          </div>
        )}
      </div>
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{listing.title}</h3>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Calendar size={13} /> {new Date(listing.createdAt).toLocaleDateString()}</span>
          {listing.updatedAt && listing.updatedAt !== listing.createdAt && <span style={{ opacity: 0.7 }}>updated {timeAgo(listing.updatedAt)}</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>${listing.priceRecommendation}</span>
          <ProfitBadge price={listing.priceRecommendation} costBasis={listing.costBasis} category={listing.category} shippingLabelCost={listing.shippingLabelCost} />
          <HealthBadge listing={listing} />
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>{listing.category}</span>
          {listing.sku && <span style={{ fontSize: '0.8rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc' }}>SKU: {listing.sku}</span>}
        </div>
        {listing.sellerNotes && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 8px', marginBottom: '0.75rem', fontStyle: 'italic' }}>{listing.sellerNotes}</p>}
        {stats && (
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
            <span title="Views"><Eye size={12} style={{ marginRight: '3px', verticalAlign: 'middle' }} />{stats.hitCount} views</span>
            <span title="Watchers">{stats.watchCount} watchers</span>
            {parseInt(stats.quantitySold) > 0 && <span style={{ color: 'var(--success)' }}>{stats.quantitySold} sold</span>}
          </div>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <a className="btn-primary" href={listing.ebayDraftId ? `https://www.ebay.com/itm/${listing.ebayDraftId}` : 'https://www.ebay.com/mes/sellerhub'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', flex: 1, fontSize: '0.85rem', padding: '6px 12px', minWidth: '90px' }}>
            <ExternalLink size={16} /> eBay
          </a>
          {onRelist && isArchived && (
            <button className="btn-icon" title="Re-stage for relisting" onClick={() => onRelist(listing)} style={{ color: 'var(--accent)' }}>
              <RotateCcw size={18} />
            </button>
          )}
          {onMoveToStaged && (
            <button
              className="btn-icon"
              title="Move back to Staged (use if the eBay listing was deleted and needs to be pushed again)"
              onClick={() => {
                if (window.confirm(`Move "${listing.title.substring(0, 50)}..." back to Staged?\n\nThis clears the eBay item ID and sold/archive status so you can push it to eBay again. Use this after deleting the listing on eBay.`)) {
                  onMoveToStaged(listing);
                }
              }}
              style={{ color: 'var(--accent-color)' }}
            >
              <Undo2 size={18} />
            </button>
          )}
          {!isArchived && onMarkSold && (
            <button className="btn-icon" title="Mark as sold" onClick={() => onMarkSold(listing)} style={{ color: 'var(--success)', fontSize: '0.75rem', gap: '4px' }}>
              <DollarSign size={17} /> Sold
            </button>
          )}
          <button className="btn-icon" title="AI Optimize listing" onClick={() => onOptimize(listing)} style={{ color: '#a78bfa' }}>
            <Wand2 size={18} />
          </button>
          <button className="btn-icon" title="Edit listing" onClick={() => onEdit(listing)}><Pencil size={18} /></button>
          {listing.ebayDraftId && !isArchived && onDelistRelist && (
            <button className="btn-icon" title="Delist & relist on eBay (immediate, refreshes listing)" style={{ color: '#f59e0b' }} disabled={delistRelisting} onClick={() => onDelistRelist(listing)}>
              {delistRelisting ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={18} />}
            </button>
          )}
          {listing.ebayDraftId && !isArchived && (
            <button className="btn-icon" title="End listing on eBay" style={{ color: '#ef4444' }} onClick={() => onEndListing(listing)}>
              <CircleSlash size={18} />
            </button>
          )}
          {listing.ebayDraftId && (
            <button className="btn-icon" title="Fetch view/watcher stats from eBay" onClick={() => onFetchStats(listing)} disabled={loadingStats} style={{ color: stats ? 'var(--accent-color)' : undefined }}>
              {loadingStats ? <span style={{ fontSize: '10px' }}>...</span> : <Eye size={18} />}
            </button>
          )}
          <button className="btn-icon" title="Cross-post to other platforms" onClick={() => onCrossPost(listing)}>
            <Share2 size={18} />
          </button>
          <button className="btn-icon" title={isArchived ? 'Unarchive' : 'Archive'} onClick={() => onToggleArchive(listing)}>
            {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </button>
          <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }} onClick={() => onDelete(listing)}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
