import { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Send, Plus, Trash2, ImagePlus } from 'lucide-react';
import type { StagedListing } from '../types';
import { useToast } from '../context/ToastContext';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { findConflictingListings } from '../utils/duplicateSku';
import DuplicateSkuWarning from './DuplicateSkuWarning';
import InventoryItemBadge from './InventoryItemBadge';
import { useInventorySkuLookup } from '../hooks/useInventorySkuLookup';
import ImageEditModal from './ImageEditModal';

interface EditListingModalProps {
  listing: StagedListing;
  appPassword: string;
  // INV-002 (lite) — staged + listed pool for duplicate-SKU detection.
  // Optional + defaults to []; the modal degrades to silent when callers
  // don't pass it in.
  allListings?: StagedListing[];
  onClose: () => void;
  onSaved: (updated: StagedListing) => void;
}

const CONDITIONS = [
  { id: '1000', label: 'New' },
  { id: '1500', label: 'New Other' },
  { id: '1750', label: 'New with Defects' },
  { id: '2000', label: 'Certified Refurbished' },
  { id: '2500', label: 'Seller Refurbished' },
  { id: '2750', label: 'Like New' },
  { id: '3000', label: 'Used' },
  { id: '4000', label: 'Very Good' },
  { id: '5000', label: 'Good' },
  { id: '6000', label: 'Acceptable' },
  { id: '7000', label: 'For Parts or Not Working' },
];

function conditionTextToId(text: string): string {
  const lower = (text || '').toLowerCase();
  if (lower.includes('new with defects')) return '1750';
  if (lower.includes('new other')) return '1500';
  if (lower.includes('certified')) return '2000';
  if (lower.includes('seller refurb')) return '2500';
  if (lower.includes('like new')) return '2750';
  if (lower.startsWith('new')) return '1000';
  if (lower.includes('very good')) return '4000';
  if (lower.includes('good')) return '5000';
  if (lower.includes('acceptable')) return '6000';
  if (lower.includes('parts') || lower.includes('not working')) return '7000';
  return '3000';
}

export default function EditListingModal({ listing, appPassword, allListings = [], onClose, onSaved }: EditListingModalProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(listing.title || '');
  const [price, setPrice] = useState(listing.priceRecommendation || '');
  const [condition, setCondition] = useState(() => conditionTextToId(listing.condition || ''));
  const [description, setDescription] = useState(listing.description || '');
  const [sku, setSku] = useState(listing.sku || '');
  const [quantity, setQuantity] = useState<string>(listing.quantity ? String(listing.quantity) : '1');
  const [sellerNotes, setSellerNotes] = useState(listing.sellerNotes || '');
  const [specifics, setSpecifics] = useState<{ name: string; value: string }[]>(
    Object.entries(listing.itemSpecifics || {}).map(([name, value]) => ({ name, value }))
  );
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);

  // IMG-003 — local image state. Seeded from the listing record and dirtied
  // when the sub-modal returns a different URL list (deep-equal compare so
  // pure reorders also count as "modified" — eBay's <PictureDetails> is a
  // full replacement so order matters for the main image).
  const [images, setImages] = useState<string[]>(listing.images || []);
  const [showImageModal, setShowImageModal] = useState(false);
  const imagesDirty = useMemo(() => {
    const original = listing.images || [];
    if (original.length !== images.length) return true;
    for (let i = 0; i < original.length; i++) if (original[i] !== images[i]) return true;
    return false;
  }, [listing.images, images]);

  // INV-002 — exclude the listing being edited so renaming your own SKU
  // to the same value doesn't trigger a self-collision warning.
  const skuConflicts = useMemo(
    () => findConflictingListings(sku, allListings, listing.id),
    [sku, allListings, listing.id],
  );

  // INV-002 follow-through — durable inventory lookup against /api/inventory.
  const inventoryLookup = useInventorySkuLookup(sku, appPassword);

  // UX-002 — Escape dismisses the modal, but only when nothing is in flight
  // (matches the Cancel button's disabled gating on line 217ish).
  useEscapeKey(onClose, !saving && !pushing);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const jsonHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appPassword}` };

  const buildUpdates = () => ({
    title: title.substring(0, 80),
    priceRecommendation: price,
    condition: CONDITIONS.find(c => c.id === condition)?.label || listing.condition,
    description,
    sku: sku || undefined,
    quantity: Math.max(1, parseInt(quantity, 10) || 1),
    sellerNotes: sellerNotes || undefined,
    itemSpecifics: Object.fromEntries(
      specifics.filter(s => s.name.trim() && s.value.trim()).map(s => [s.name.trim(), s.value.trim()])
    ),
    // IMG-003 — persist the latest image list with the save. Save-to-app
    // only updates the local DB; the eBay push happens in handleSaveAndPush
    // below and is what actually changes the live <PictureDetails>.
    ...(imagesDirty ? { images } : {}),
    updatedAt: Date.now(),
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = buildUpdates();
      const resp = await fetch(`/api/listings/${listing.id}`, {
        method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ updates })
      });
      if (!resp.ok) throw new Error('Save failed');
      onSaved({ ...listing, ...updates });
      toast('Listing saved.', 'success');
      onClose();
    } catch (e: any) {
      toast('Save failed: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAndPush = async () => {
    if (!listing.ebayDraftId) { toast('No eBay listing ID — cannot push.', 'error'); return; }
    setPushing(true);
    try {
      const updates = buildUpdates();
      await fetch(`/api/listings/${listing.id}`, {
        method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ updates })
      });
      const resp = await fetch('/api/ebay/revise', {
        method: 'POST', headers: jsonHeaders,
        body: JSON.stringify({
          itemId: listing.ebayDraftId,
          newTitle: updates.title,
          newPrice: price,
          description: updates.description,
          conditionId: condition,
          itemSpecifics: specifics.filter(s => s.name.trim() && s.value.trim()),
          quantity: updates.quantity,
          // IMG-003 — only send images when the seller actually changed them
          // so unrelated revise calls (price/title/condition edits) leave
          // the live photo set untouched.
          ...(imagesDirty ? { images, listingId: listing.id } : {}),
        })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'eBay push failed');
      // If the server resolved cloudinary/data: URIs into EPS URLs, mirror
      // those back into the local record so the next modal-open shows the
      // canonical eBay-hosted versions.
      const resolvedImages = Array.isArray(data.imageUrls) ? data.imageUrls : images;
      onSaved({ ...listing, ...updates, images: resolvedImages });
      if (data.warning) {
        toast('Saved and pushed to eBay. Note: ' + data.warning, 'info');
      } else {
        toast('Saved and pushed to eBay.', 'success');
      }
      onClose();
    } catch (e: any) {
      toast('Push failed: ' + e.message, 'error');
    } finally {
      setPushing(false);
    }
  };

  const addSpecific = () => setSpecifics(prev => [...prev, { name: '', value: '' }]);
  const removeSpecific = (i: number) => setSpecifics(prev => prev.filter((_, idx) => idx !== i));
  const updateSpecific = (i: number, field: 'name' | 'value', val: string) =>
    setSpecifics(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div
        ref={dialogRef}
        className="glass-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit listing"
        style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Edit Listing</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {listing.ebayDraftId ? `eBay ID: ${listing.ebayDraftId}` : 'Not yet pushed to eBay'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}><X size={20} /></button>
        </div>

        <div style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
          {/* IMG-003 — Images row. Thumbnail strip + Edit-images button.
              The "Modified" pill tells the seller their next Save & Push will
              replace the live photo set on eBay. */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
                Images <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({images.length})</span>
                {imagesDirty && (
                  <span className="badge badge--warning" title="Images modified — next push to eBay will replace the live photo set">
                    Modified
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => setShowImageModal(true)}
                disabled={saving || pushing}
                className="btn-secondary"
                style={{ fontSize: '0.82rem', padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ImagePlus size={14} /> Edit images…
              </button>
            </div>
            {images.length > 0 ? (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {images.slice(0, 8).map((src, i) => (
                  <div
                    key={i}
                    style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '6px', overflow: 'hidden', border: i === 0 ? '2px solid var(--accent-color)' : '1px solid var(--border-color)' }}
                    title={i === 0 ? 'Main image' : `Image ${i + 1}`}
                  >
                    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                ))}
                {images.length > 8 && (
                  <div style={{ width: '64px', height: '64px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    +{images.length - 8}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>No images. Click <strong>Edit images…</strong> to add some.</p>
            )}
            <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              eBay treats <code>PictureDetails</code> as a full replacement — modifying the list here will replace the live photo set when you Save &amp; Push.
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
              Title <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>({title.length}/80)</span>
            </label>
            <input className="input-base" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Price ($)</label>
              <input className="input-base" type="number" step="0.01" min="0.01" value={price} onChange={e => setPrice(e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Condition</label>
              <select className="input-base" value={condition} onChange={e => setCondition(e.target.value)}>
                {CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Description</label>
            <textarea className="input-base" value={description} onChange={e => setDescription(e.target.value)}
              rows={6} style={{ resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Item Specifics</label>
              <button onClick={addSpecific} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
                <Plus size={14} /> Add
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {specifics.length === 0 && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>No item specifics. Click Add to create one.</p>
              )}
              {specifics.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                  <input className="input-base" placeholder="Name (e.g. Brand)" value={s.name}
                    onChange={e => updateSpecific(i, 'name', e.target.value)} style={{ fontSize: '0.85rem' }} />
                  <input className="input-base" placeholder="Value" value={s.value}
                    onChange={e => updateSpecific(i, 'value', e.target.value)} style={{ fontSize: '0.85rem' }} />
                  <button onClick={() => removeSpecific(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>SKU</label>
              <input className="input-base" value={sku} onChange={e => setSku(e.target.value)} />
              <DuplicateSkuWarning conflicts={skuConflicts} />
              <InventoryItemBadge item={inventoryLookup.item} loading={inventoryLookup.loading} hideLoading />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Quantity</label>
              <input className="input-base" type="number" min="1" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Seller Notes (internal)</label>
            <input className="input-base" value={sellerNotes} onChange={e => setSellerNotes(e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving || pushing}>Cancel</button>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={handleSave} disabled={saving || pushing}>
            <Save size={15} /> {saving ? 'Saving...' : 'Save to App'}
          </button>
          {listing.ebayDraftId && (
            <button className="btn-primary" style={{ flex: 1.5 }} onClick={handleSaveAndPush} disabled={saving || pushing}>
              <Send size={15} /> {pushing ? 'Pushing...' : 'Save & Push to eBay'}
            </button>
          )}
        </div>
      </div>

      {/* IMG-003 — sub-modal for image add/remove/reorder. The sub-modal
          handles its own Cloudinary upload via /api/images/upload; we
          receive the resulting URL list and stamp it onto local state. */}
      {showImageModal && (
        <ImageEditModal
          listing={{ ...listing, images }}
          appPassword={appPassword}
          onSave={(next) => { setImages(next); setShowImageModal(false); }}
          onClose={() => setShowImageModal(false)}
        />
      )}
    </div>,
    document.body
  );
}
