// FE-001d — the per-listing icon-button row from StagedListings.
// Stateless: every interaction is a callback prop. The HealthBadge is
// passed in as a `healthBadge` React node so this component doesn't have
// to know about expandedHealthId.
//
// Wiring rule: the parent decides what "isPushing" means (current pushingId
// + bulk push set), so this component just renders the disabled+label state.

import type { ReactNode } from 'react';
import { Trash2, Edit2, Copy, Check, Wand2, TrendingUp, ImagePlus, Share2, CheckCircle2 } from 'lucide-react';
import type { StagedListing } from '../../types';

export interface StagedListingActionsProps {
  listing: StagedListing;
  healthBadge: ReactNode;
  isEbayConnected?: boolean;
  isPushing: boolean;
  isCompsActive: boolean;
  isCopied: boolean;
  onPush: (listing: StagedListing) => void;
  onFetchComps: (listing: StagedListing) => void;
  onReanalyze: (listing: StagedListing) => void;
  onCopyHtml: (listing: StagedListing) => void;
  onEditImages: (listing: StagedListing) => void;
  onEdit: (listing: StagedListing) => void;
  onCrossPost: (listing: StagedListing) => void;
  onMoveToListed: (listing: StagedListing) => void;
  onDelete: (listing: StagedListing) => void;
}

export default function StagedListingActions({
  listing,
  healthBadge,
  isEbayConnected = false,
  isPushing,
  isCompsActive,
  isCopied,
  onPush,
  onFetchComps,
  onReanalyze,
  onCopyHtml,
  onEditImages,
  onEdit,
  onCrossPost,
  onMoveToListed,
  onDelete,
}: StagedListingActionsProps) {
  return (
    <>
      {healthBadge}
      <button
        className="btn-primary"
        style={{ fontSize: '0.85rem', padding: '6px 12px', opacity: !isEbayConnected ? 0.5 : 1, whiteSpace: 'nowrap' }}
        onClick={() => onPush(listing)}
        disabled={isPushing}
        title={!isEbayConnected ? 'Connect to eBay first' : 'Push to eBay'}
      >
        {isPushing ? 'Pushing...' : 'Push to eBay'}
      </button>
      <button
        className="btn-icon"
        title="Find Sold Comps"
        aria-label="Find sold comps"
        onClick={() => onFetchComps(listing)}
        style={{ color: isCompsActive ? 'var(--success)' : undefined }}
      >
        <TrendingUp size={18} />
      </button>
      <button
        className="btn-icon"
        title="Re-analyze with AI"
        aria-label="Re-analyze with AI"
        onClick={() => onReanalyze(listing)}
      >
        <Wand2 size={18} />
      </button>
      <button
        className="btn-icon"
        title="Copy HTML Description"
        aria-label="Copy HTML description"
        onClick={() => onCopyHtml(listing)}
      >
        {isCopied ? <Check size={18} color="var(--success)" /> : <Copy size={18} />}
      </button>
      <button
        className="btn-icon"
        title="Edit / Add Images"
        aria-label="Edit or add images"
        onClick={() => onEditImages(listing)}
      >
        <ImagePlus size={18} />
      </button>
      <button
        className="btn-icon"
        title="Edit Listing"
        aria-label="Edit listing"
        onClick={() => onEdit(listing)}
      >
        <Edit2 size={18} />
      </button>
      <button
        className="btn-icon"
        title="Cross-post to other platforms"
        aria-label="Cross-post to other platforms"
        onClick={() => onCrossPost(listing)}
      >
        <Share2 size={18} />
      </button>
      <button
        className="btn-icon"
        title="Mark as Listed without pushing to eBay (for items already on eBay)"
        aria-label="Mark as listed without pushing"
        onClick={() => onMoveToListed(listing)}
      >
        <CheckCircle2 size={18} />
      </button>
      <button
        className="btn-icon"
        style={{ color: '#ef4444' }}
        onClick={() => onDelete(listing)}
        title="Delete Listing"
        aria-label="Delete listing"
      >
        <Trash2 size={18} />
      </button>
    </>
  );
}
