import { useState } from 'react';
import { Trash2, Edit2, Copy, Check, Calendar } from 'lucide-react';
import type { StagedListing } from '../types';
import ResultsEditor from './ResultsEditor';

interface StagedListingsProps {
  listings: StagedListing[];
  onUpdate: (listing: StagedListing) => void;
  onDelete: (id: string) => void;
  isEbayConnected?: boolean;
}

export default function StagedListingsView({ listings, onUpdate, onDelete, isEbayConnected }: StagedListingsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);

  if (listings.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No Staged Listings</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Create a new listing to see it here. Staged listings are saved locally to your browser.
        </p>
      </div>
    );
  }

  const handleCopyHtml = (id: string, html: string) => {
    navigator.clipboard.writeText(html);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (editingId) {
    const listingToEdit = listings.find(l => l.id === editingId);
    if (!listingToEdit) return null;

    // Convert base64 back to File object mock for the editor
    // We actually just pass them as is or pass empty array since ResultsEditor expects File[]
    // For simplicity, we'll modify ResultsEditor or pass empty array
    
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', height: '80vh' }}>
        <ResultsEditor 
          data={{
            title: listingToEdit.title,
            description: listingToEdit.description,
            condition: listingToEdit.condition,
            category: listingToEdit.category,
            priceRecommendation: listingToEdit.priceRecommendation,
            shippingEstimate: listingToEdit.shippingEstimate,
            itemSpecifics: listingToEdit.itemSpecifics
          }}
          images={[]} // Images are already base64 in the listing, so we don't re-upload
          onStage={(updatedData) => {
            onUpdate({
              ...listingToEdit,
              ...updatedData,
              images: listingToEdit.images // preserve old images
            });
            setEditingId(null);
          }}
          onCancel={() => setEditingId(null)}
        />
      </div>
    );
  }

  const handlePushToEbay = async (listing: StagedListing) => {
    const pw = localStorage.getItem('app_password') || '';
    setPushingId(listing.id);
    try {
      const resp = await fetch('http://localhost:3001/api/ebay/draft', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-password': pw
        },
        body: JSON.stringify({ listing })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      alert(`Success! Check your eBay Drafts for Item ID: ${data.draftId}`);
      // In a full implementation, we would move this to the "Listed" tab.
    } catch (e: any) {
      alert("Error pushing to eBay: " + e.message);
    } finally {
      setPushingId(null);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
      {listings.map(listing => (
        <div key={listing.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Images preview row */}
          <div style={{ display: 'flex', height: '140px', background: 'rgba(0,0,0,0.5)' }}>
            {listing.images && listing.images.length > 0 ? (
              <>
                <div style={{ flex: 2, height: '100%' }}>
                  <img src={listing.images[0]} alt="Main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                {listing.images.length > 1 && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '2px' }}>
                    {listing.images.slice(1, 3).map((img, i) => (
                      <div key={i} style={{ flex: 1, height: '50%' }}>
                        <img src={img} alt={`Thumb ${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    ))}
                    {listing.images.length > 3 && (
                      <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', padding: '2px 6px', borderRadius: '12px', fontSize: '0.75rem' }}>
                        +{listing.images.length - 3} more
                      </div>
                    )}
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
            
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={14} /> {new Date(listing.createdAt).toLocaleDateString()}
            </div>
            
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {listing.condition}
            </p>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                Est: {listing.priceRecommendation}
              </span>
              <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                {listing.category}
              </span>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
              
              <button 
                className="btn-primary" 
                style={{ marginRight: 'auto', fontSize: '0.85rem', padding: '6px 12px', opacity: !isEbayConnected ? 0.5 : 1 }}
                onClick={() => {
                  if (!isEbayConnected) {
                    alert('Please connect to eBay in the top right corner first!');
                    return;
                  }
                  handlePushToEbay(listing);
                }}
                disabled={pushingId === listing.id}
                title={!isEbayConnected ? "Connect to eBay first" : "Push to eBay"}
              >
                {pushingId === listing.id ? 'Pushing...' : 'Push to eBay'}
              </button>

              <button  
                className="btn-icon" 
                title="Copy HTML Description"
                onClick={() => handleCopyHtml(listing.id, listing.description)}
              >
                {copiedId === listing.id ? <Check size={18} color="var(--success)" /> : <Copy size={18} />}
              </button>
              <button 
                className="btn-icon" 
                onClick={() => setEditingId(listing.id)}
                title="Edit Listing"
              >
                <Edit2 size={18} />
              </button>
              <button 
                className="btn-icon" 
                style={{ color: '#ef4444' }}
                onClick={() => {
                  if (confirm('Are you sure you want to delete this staged listing?')) {
                    onDelete(listing.id);
                  }
                }}
                title="Delete Listing"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
