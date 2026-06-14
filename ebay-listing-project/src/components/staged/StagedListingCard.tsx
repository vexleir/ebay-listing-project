// FE-001d — grid-card render for a single staged listing. Stateless: the
// parent supplies the listing, selection state, lightbox/edit/comps
// callbacks, and the rendered actions + comps subtree.
//
// The card composes (rather than encapsulates) StagedListingActions and
// CompsPanel so the parent can wire those to its own state (lightbox
// portals, expandedHealthId, comps fetch lifecycle) without prop drilling
// every callback through this component.

import type { ReactNode } from 'react';
import { Check, Calendar, ImagePlus } from 'lucide-react';
import type { StagedListing } from '../../types';
import ImageSearchButton from '../ImageSearchButton';
import { timeAgo } from './helpers';

export interface StagedListingCardProps {
  listing: StagedListing;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onEditImages: (id: string) => void;
  onOpenLightbox: (images: string[], index: number) => void;
  /** Rendered StagedListingActions row, supplied by the parent. */
  actions: ReactNode;
  /** Rendered CompsPanel subtree (or null when not active), supplied by the parent. */
  compsPanel: ReactNode;
}

export default function StagedListingCard({
  listing,
  isSelected,
  onToggleSelect,
  onEditImages,
  onOpenLightbox,
  actions,
  compsPanel,
}: StagedListingCardProps) {
  return (
    <div
      className="glass-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        outline: isSelected ? '2px solid var(--accent-color)' : 'none',
        outlineOffset: '2px',
      }}
    >
      {/* Images */}
      <div style={{ display: 'flex', height: '140px', background: 'rgba(0,0,0,0.5)', position: 'relative' }}>
        {/* Checkbox */}
        <div
          onClick={() => onToggleSelect(listing.id)}
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`Select listing "${listing.title.substring(0, 60)}"`}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggleSelect(listing.id); } }}
          style={{
            position: 'absolute', top: '8px', left: '8px', zIndex: 3, cursor: 'pointer',
            width: '22px', height: '22px', borderRadius: '5px',
            background: isSelected ? 'var(--accent-color)' : 'rgba(0,0,0,0.6)',
            border: `2px solid ${isSelected ? 'var(--accent-color)' : 'rgba(255,255,255,0.4)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
          }}
        >
          {isSelected && <Check size={13} color="white" />}
        </div>
        {/* Edit images button — overlay on image area */}
        <button
          onClick={() => onEditImages(listing.id)}
          title="Edit / Add Images"
          aria-label="Edit or add images"
          style={{
            position: 'absolute', bottom: '8px', right: '8px', zIndex: 3,
            background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.2)',
            color: 'white', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem',
            backdropFilter: 'blur(4px)',
          }}
        >
          <ImagePlus size={13} /> Edit
        </button>
        {listing.images && listing.images.length > 0 ? (
          <>
            <div
              style={{ flex: 2, height: '100%', position: 'relative', cursor: 'pointer' }}
              onClick={() => onOpenLightbox(listing.images, 0)}
            >
              <img src={listing.images[0]} alt="Main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <ImageSearchButton src={listing.images[0]} />
            </div>
            {listing.images.length > 1 && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '2px' }}>
                {listing.images.slice(1, 3).map((img, i) => (
                  <div
                    key={i}
                    style={{ flex: 1, height: '50%', position: 'relative', cursor: 'pointer' }}
                    onClick={() => onOpenLightbox(listing.images, i + 1)}
                  >
                    <img src={img} alt={`Thumb ${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <ImageSearchButton src={img} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            No images
          </div>
        )}
      </div>

      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {listing.title}
        </h3>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Calendar size={13} /> {new Date(listing.createdAt).toLocaleDateString()}
          </span>
          {listing.updatedAt && listing.updatedAt !== listing.createdAt && (
            <span style={{ opacity: 0.7 }}>· updated {timeAgo(listing.updatedAt)}</span>
          )}
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {listing.condition}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
            ${listing.priceRecommendation}
          </span>
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
            {listing.category}
          </span>
          {listing.sku && (
            <span style={{ fontSize: '0.8rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc' }}>
              SKU: {listing.sku}
            </span>
          )}
        </div>
        {listing.sellerNotes && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 8px', marginBottom: '0.5rem', fontStyle: 'italic' }}>
            📝 {listing.sellerNotes}
          </p>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <span style={{ marginRight: 'auto' }} />
          {actions}
        </div>
      </div>

      {compsPanel}
    </div>
  );
}
