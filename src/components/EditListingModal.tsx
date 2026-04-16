import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Send, Plus, Trash2 } from 'lucide-react';
import type { StagedListing } from '../types';
import { useToast } from '../context/ToastContext';

interface EditListingModalProps {
  listing: StagedListing;
  appPassword: string;
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

export default function EditListingModal({ listing, appPassword, onClose, onSaved }: EditListingModalProps) {
  const { toast } = useToast();
  const [title, setTitle] = useState(listing.title || '');
  const [price, setPrice] = useState(listing.priceRecommendation || '');
  const [condition, setCondition] = useState(() => conditionTextToId(listing.condition || ''));
  const [description, setDescription] = useState(listing.description || '');
  const [sku, setSku] = useState(listing.sku || '');
  const [sellerNotes, setSellerNotes] = useState(listing.sellerNotes || '');
  const [specifics, setSpecifics] = useState<{ name: string; value: string }[]>(
    Object.entries(listing.itemSpecifics || {}).map(([name, value]) => ({ name, value }))
  );
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);

  const jsonHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appPassword}` };

  const buildUpdates = () => ({
    title: title.substring(0, 80),
    priceRecommendation: price,
    condition: CONDITIONS.find(c => c.id === condition)?.label || listing.condition,
    description,
    sku: sku || undefined,
    sellerNotes: sellerNotes || undefined,
    itemSpecifics: Object.fromEntries(
      specifics.filter(s => s.name.trim() && s.value.trim()).map(s => [s.name.trim(), s.value.trim()])
    ),
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
        })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'eBay push failed');
      onSaved({ ...listing, ...updates });
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
      <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

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
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Seller Notes (internal)</label>
              <input className="input-base" value={sellerNotes} onChange={e => setSellerNotes(e.target.value)} />
            </div>
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
    </div>,
    document.body
  );
}
