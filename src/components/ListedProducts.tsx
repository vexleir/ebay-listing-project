import { ExternalLink, Calendar, CheckCircle } from 'lucide-react';
import type { StagedListing } from '../types';

interface ListedProductsProps {
  listings: StagedListing[];
}

export default function ListedProductsView({ listings }: ListedProductsProps) {
  if (listings.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No Listed Items</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Items you push to eBay will appear here.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
      {listings.map(listing => (
        <div key={listing.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid var(--success-light)' }}>
          
          <div style={{ padding: '8px 12px', background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
             <CheckCircle size={16} /> Successfully Pushed
          </div>

          <div style={{ display: 'flex', height: '140px', background: 'rgba(0,0,0,0.5)' }}>
            {listing.images && listing.images.length > 0 ? (
                <div style={{ flex: 1, height: '100%' }}>
                  <img src={listing.images[0]} alt="Main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
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
            
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={14} /> {new Date(listing.createdAt).toLocaleDateString()}
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                Est: {listing.priceRecommendation}
              </span>
              <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                {listing.category}
              </span>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              <a 
                className="btn-primary" 
                href="https://www.ebay.com/mes/sellerhub" 
                target="_blank" 
                rel="noreferrer"
                style={{ textDecoration: 'none', width: '100%' }}
              >
                <ExternalLink size={18} /> View on eBay
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
