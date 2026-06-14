import { Archive, ArchiveRestore, Check, CheckCircle, DollarSign, ExternalLink, Eye, Pencil, RefreshCw, RotateCcw, Share2, Trash2, Undo2, Wand2 } from 'lucide-react';
import type { StagedListing } from '../../types';
import ImageSearchButton from '../ImageSearchButton';
import HealthBadge from '../listings/shared/HealthBadge';
import { timeAgo } from '../listings/shared/helpers';
import type { ListingStats } from './helpers';
import ProfitBadge from './ProfitBadge';

export interface ListedListingListRowProps {
  listing: StagedListing;
  isArchived: boolean;
  isSelected: boolean;
  stats?: ListingStats | null;
  loadingStats: boolean;
  delistRelisting: boolean;
  onToggleSelect: (id: string) => void;
  onOpenLightbox: (images: string[], index: number) => void;
  onMoveToStaged?: (listing: StagedListing) => void;
  onMarkSold?: (listing: StagedListing) => void;
  onOptimize: (listing: StagedListing) => void;
  onEdit: (listing: StagedListing) => void;
  onFetchStats: (listing: StagedListing) => void;
  onDelistRelist?: (listing: StagedListing) => void;
  onCrossPost: (listing: StagedListing) => void;
  onToggleArchive: (listing: StagedListing) => void;
  onDelete: (listing: StagedListing) => void;
}

export default function ListedListingListRow({
  listing,
  isArchived,
  isSelected,
  stats,
  loadingStats,
  delistRelisting,
  onToggleSelect,
  onOpenLightbox,
  onMoveToStaged,
  onMarkSold,
  onOptimize,
  onEdit,
  onFetchStats,
  onDelistRelist,
  onCrossPost,
  onToggleArchive,
  onDelete,
}: ListedListingListRowProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', opacity: isArchived ? 0.65 : 1, borderBottom: '1px solid var(--border-color)', background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
      <div onClick={() => onToggleSelect(listing.id)} style={{ width: '18px', height: '18px', flexShrink: 0, borderRadius: '4px', background: isSelected ? 'var(--accent-color)' : 'transparent', border: `2px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isSelected && <Check size={11} color="white" />}
      </div>
      <div
        style={{ width: '56px', height: '56px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', background: 'rgba(0,0,0,0.4)', position: 'relative', cursor: listing.images?.[0] ? 'pointer' : 'default' }}
        onClick={() => listing.images?.[0] && onOpenLightbox(listing.images, 0)}
      >
        {listing.images?.[0] ? (
          <>
            <img src={listing.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <ImageSearchButton src={listing.images[0]} size="sm" />
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>-</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        {isArchived ? <Archive size={16} style={{ color: 'var(--text-secondary)' }} /> : <CheckCircle size={16} style={{ color: 'var(--success)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.title}</p>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
          {listing.sellerNotes && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic', flex: 1 }}>{listing.sellerNotes}</p>}
          {listing.updatedAt && listing.updatedAt !== listing.createdAt && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.7 }}>updated {timeAgo(listing.updatedAt)}</span>}
          {stats && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0 }}>{stats.hitCount} views / {stats.watchCount} watchers</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>${listing.priceRecommendation}</span>
        <ProfitBadge price={listing.priceRecommendation} costBasis={listing.costBasis} category={listing.category} shippingLabelCost={listing.shippingLabelCost} />
        <HealthBadge listing={listing} />
        {listing.sku && <span style={{ fontSize: '0.78rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc', whiteSpace: 'nowrap' }}>{listing.sku}</span>}
      </div>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>{new Date(listing.createdAt).toLocaleDateString()}</span>
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, alignItems: 'center' }}>
        <a className="btn-primary" href={listing.ebayDraftId ? `https://www.ebay.com/itm/${listing.ebayDraftId}` : 'https://www.ebay.com/mes/sellerhub'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '5px 10px', whiteSpace: 'nowrap' }}>
          <ExternalLink size={14} /> eBay
        </a>
        {!isArchived && onMarkSold && (
          <button className="btn-icon" title="Mark as sold" onClick={() => onMarkSold(listing)} style={{ color: 'var(--success)' }}>
            <DollarSign size={17} />
          </button>
        )}
        <button className="btn-icon" title="AI Optimize listing" onClick={() => onOptimize(listing)} style={{ color: '#a78bfa' }}>
          <Wand2 size={17} />
        </button>
        <button className="btn-icon" title="Edit listing" onClick={() => onEdit(listing)}>
          <Pencil size={17} />
        </button>
        {listing.ebayDraftId && (
          <button className="btn-icon" title="Fetch view/watcher stats" onClick={() => onFetchStats(listing)} disabled={loadingStats} style={{ color: stats ? 'var(--accent-color)' : undefined }}>
            {loadingStats ? <span style={{ fontSize: '10px' }}>...</span> : <Eye size={18} />}
          </button>
        )}
        {listing.ebayDraftId && !isArchived && onDelistRelist && (
          <button className="btn-icon" title="Delist & relist on eBay (immediate, refreshes listing)" style={{ color: '#f59e0b' }} disabled={delistRelisting} onClick={() => onDelistRelist(listing)}>
            {delistRelisting ? <RefreshCw size={17} style={{ animation: 'spin 1s linear infinite' }} /> : <RotateCcw size={17} />}
          </button>
        )}
        <button className="btn-icon" title="Cross-post to other platforms" onClick={() => onCrossPost(listing)}>
          <Share2 size={18} />
        </button>
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
            <Undo2 size={17} />
          </button>
        )}
        <button className="btn-icon" title={isArchived ? 'Unarchive' : 'Archive'} onClick={() => onToggleArchive(listing)}>
          {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
        </button>
        <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }} onClick={() => onDelete(listing)}>
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
