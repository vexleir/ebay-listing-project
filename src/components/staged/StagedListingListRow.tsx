// FE-001d — list-view row render for a single staged listing. Same
// composition pattern as StagedListingCard: the parent supplies the
// listing, selection state, lightbox callback, and the rendered actions +
// (optional) comps panel subtree.

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { StagedListing } from '../../types';
import ImageSearchButton from '../ImageSearchButton';
import { timeAgo } from './helpers';

export interface StagedListingListRowProps {
  listing: StagedListing;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onOpenLightbox: (images: string[], index: number) => void;
  /** Rendered StagedListingActions row, supplied by the parent. */
  actions: ReactNode;
  /** Rendered CompsPanel subtree (or null when not active) + the divider wrapper. */
  compsPanel: ReactNode;
}

export default function StagedListingListRow({
  listing,
  isSelected,
  onToggleSelect,
  onOpenLightbox,
  actions,
  compsPanel,
}: StagedListingListRowProps) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.75rem 1.25rem',
          background: isSelected ? 'rgba(99,102,241,0.06)' : 'none',
          borderBottom: '1px solid var(--border-color)',
        }}
      >
        {/* Checkbox */}
        <div
          onClick={() => onToggleSelect(listing.id)}
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`Select listing "${listing.title.substring(0, 60)}"`}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggleSelect(listing.id); } }}
          style={{
            width: '18px', height: '18px', flexShrink: 0, borderRadius: '4px',
            background: isSelected ? 'var(--accent-color)' : 'transparent',
            border: `2px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isSelected && <Check size={11} color="white" />}
        </div>

        {/* Thumbnail */}
        <div
          style={{
            width: '56px', height: '56px', flexShrink: 0, borderRadius: '6px',
            overflow: 'hidden', background: 'rgba(0,0,0,0.4)', position: 'relative',
            cursor: listing.images?.[0] ? 'pointer' : 'default',
          }}
          onClick={() => listing.images?.[0] && onOpenLightbox(listing.images, 0)}
        >
          {listing.images?.[0] ? (
            <>
              <img src={listing.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <ImageSearchButton src={listing.images[0]} size="sm" />
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>
              —
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 500, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {listing.title}
          </p>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
            {listing.sellerNotes && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic', flex: 1 }}>
                📝 {listing.sellerNotes}
              </p>
            )}
            {listing.updatedAt && listing.updatedAt !== listing.createdAt && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.7 }}>
                updated {timeAgo(listing.updatedAt)}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
            ${listing.priceRecommendation}
          </span>
          {listing.sku && (
            <span style={{ fontSize: '0.78rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc', whiteSpace: 'nowrap' }}>
              {listing.sku}
            </span>
          )}
        </div>

        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>
          {new Date(listing.createdAt).toLocaleDateString()}
        </span>

        <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, alignItems: 'center' }}>
          {actions}
        </div>
      </div>
      {compsPanel}
    </div>
  );
}
