import { useState } from 'react';
import { ExternalLink, Calendar, CheckCircle, Trash2, Archive, ArchiveRestore, Search, ChevronDown } from 'lucide-react';
import type { StagedListing } from '../types';

interface ListedProductsProps {
  listings: StagedListing[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
}

type SortOption = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'price-asc' | 'price-desc';

function parsePrice(val: string): number {
  const m = val.replace(/[^0-9.]/g, '');
  return m ? parseFloat(m) : 0;
}

export default function ListedProductsView({ listings, onDelete, onArchive }: ListedProductsProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('date-desc');
  const [showArchived, setShowArchived] = useState(false);

  const active = listings.filter(l => !l.archived);
  const archived = listings.filter(l => l.archived);

  const applyFilter = (items: StagedListing[]) => {
    const q = search.toLowerCase();
    return items
      .filter(l =>
        !q ||
        l.title.toLowerCase().includes(q) ||
        (l.sku || '').toLowerCase().includes(q) ||
        (l.category || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        switch (sort) {
          case 'date-asc':  return a.createdAt - b.createdAt;
          case 'date-desc': return b.createdAt - a.createdAt;
          case 'title-asc': return a.title.localeCompare(b.title);
          case 'title-desc':return b.title.localeCompare(a.title);
          case 'price-asc': return parsePrice(a.priceRecommendation) - parsePrice(b.priceRecommendation);
          case 'price-desc':return parsePrice(b.priceRecommendation) - parsePrice(a.priceRecommendation);
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
    <div
      key={listing.id}
      className="glass-card"
      style={{
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        border: `1px solid ${isArchived ? 'var(--border-color)' : 'var(--success-light)'}`,
        opacity: isArchived ? 0.65 : 1
      }}
    >
      {!isArchived && (
        <div style={{ padding: '8px 12px', background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
          <CheckCircle size={16} /> Successfully Pushed
          {listing.ebayDraftId && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.8 }}>ID: {listing.ebayDraftId}</span>}
        </div>
      )}
      {isArchived && (
        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
          <Archive size={16} /> Archived
          {listing.ebayDraftId && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.6 }}>ID: {listing.ebayDraftId}</span>}
        </div>
      )}

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

        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Calendar size={14} /> {new Date(listing.createdAt).toLocaleDateString()}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
            Est: {listing.priceRecommendation}
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
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 8px', marginBottom: '0.75rem', fontStyle: 'italic' }}>
            📝 {listing.sellerNotes}
          </p>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <a
            className="btn-primary"
            href="https://www.ebay.com/mes/sellerhub"
            target="_blank"
            rel="noreferrer"
            style={{ textDecoration: 'none', flex: 1, fontSize: '0.85rem', padding: '6px 12px' }}
          >
            <ExternalLink size={16} /> View on eBay
          </a>
          <button
            className="btn-icon"
            title={isArchived ? 'Unarchive' : 'Archive'}
            onClick={() => onArchive(listing.id)}
          >
            {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </button>
          <button
            className="btn-icon"
            title="Delete"
            style={{ color: '#ef4444' }}
            onClick={() => {
              if (confirm('Remove this listing from your records?')) onDelete(listing.id);
            }}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <input
            type="text"
            className="input-base"
            placeholder="Search by title, SKU, or category..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
        </div>
        <div style={{ position: 'relative' }}>
          <select
            className="input-base"
            value={sort}
            onChange={e => setSort(e.target.value as SortOption)}
            style={{ paddingRight: '2rem', appearance: 'none', cursor: 'pointer', minWidth: '160px' }}
          >
            <option value="date-desc">Date: Newest First</option>
            <option value="date-asc">Date: Oldest First</option>
            <option value="title-asc">Title: A → Z</option>
            <option value="title-desc">Title: Z → A</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="price-asc">Price: Low → High</option>
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
        </div>
      </div>

      {/* Active listings */}
      {filteredActive.length === 0 && !search && (
        <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No active listed items.</p>
        </div>
      )}
      {filteredActive.length === 0 && search && (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>No results for "{search}"</p>
        </div>
      )}
      {filteredActive.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {filteredActive.map(l => renderCard(l, false))}
        </div>
      )}

      {/* Archived section */}
      {archived.length > 0 && (
        <div>
          <button
            onClick={() => setShowArchived(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem', marginBottom: '1rem', padding: '4px 0' }}
          >
            <ChevronDown size={16} style={{ transform: showArchived ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            Archived ({filteredArchived.length}{search ? ` of ${archived.length}` : ''})
          </button>
          {showArchived && filteredArchived.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
              {filteredArchived.map(l => renderCard(l, true))}
            </div>
          )}
          {showArchived && filteredArchived.length === 0 && search && (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No archived results for "{search}"</p>
          )}
        </div>
      )}
    </div>
  );
}
