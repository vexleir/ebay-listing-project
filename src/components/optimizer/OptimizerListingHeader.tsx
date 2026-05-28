// FE-003 — header used at the top of the analyze phase. Shows the live
// overall score, the listing title/category/price/SKU summary, two
// action buttons (open on eBay / start new analysis), and a stats strip.

import { AlertTriangle, ExternalLink, RefreshCw } from 'lucide-react';
import type { ListingScore } from '../../utils/listingScore';
import OverallScore from './OverallScore';
import type { FetchedListing } from './types';

export interface OptimizerListingHeaderProps {
  listing: FetchedListing;
  score: ListingScore;
  pushSuccess: boolean;
  onNewAnalysis: () => void;
}

export default function OptimizerListingHeader({
  listing, score, pushSuccess, onNewAnalysis,
}: OptimizerListingHeaderProps) {
  return (
    <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <OverallScore score={score} pushSuccess={pushSuccess} />
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: '0.95rem',
              marginBottom: '2px',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {listing.title}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{listing.categoryName}</span>
            <span>·</span>
            <span>${listing.price.toFixed(2)}</span>
            {listing.conditionName && <><span>·</span><span>{listing.conditionName}</span></>}
            {listing.sku && (
              <>
                <span>·</span>
                <span
                  style={{ fontFamily: 'monospace', background: 'rgba(34,197,94,0.15)', color: '#86efac', padding: '1px 6px', borderRadius: '3px' }}
                  title="SKU on the live eBay listing"
                >
                  SKU: {listing.sku}
                </span>
              </>
            )}
            {!listing.isOwner && (
              <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={11} /> Not your listing — analysis only
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0, flexWrap: 'wrap' }}>
          <a
            href={`https://www.ebay.com/itm/${listing.itemId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-icon"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 12px', textDecoration: 'none' }}
          >
            <ExternalLink size={14} /> View on eBay
          </a>
          <button
            className="btn-icon"
            onClick={onNewAnalysis}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 12px' }}
          >
            <RefreshCw size={14} /> New Analysis
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
        {[
          { label: 'Watch Count', value: listing.watchCount },
          { label: 'Views', value: listing.hitCount },
          { label: 'Qty Sold', value: listing.quantitySold },
          { label: 'Status', value: listing.listingStatus },
          { label: 'Images', value: listing.images.length },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
