import { useState, useRef } from 'react';
import { Trash2, Edit2, Copy, Check, Calendar, LayoutGrid, List, Wand2, TrendingUp, X, RefreshCw, ImagePlus, GripVertical, UploadCloud } from 'lucide-react';
import type { StagedListing } from '../types';
import ResultsEditor from './ResultsEditor';
import ImageSearchButton from './ImageSearchButton';
import Lightbox from './Lightbox';
import { useToast } from '../context/ToastContext';

interface StagedListingsProps {
  listings: StagedListing[];
  onUpdate: (listing: StagedListing) => void;
  onDelete: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
  onMoveToListed: (listing: StagedListing, draftId: string) => void;
  isEbayConnected?: boolean;
  appPassword?: string;
}

type ViewMode = 'grid' | 'list';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ImageEditModal({ listing, appPassword, onSave, onClose }: {
  listing: StagedListing;
  appPassword: string;
  onSave: (images: string[]) => void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [images, setImages] = useState<string[]>(listing.images || []);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newFilePreviews, setNewFilePreviews] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter(f => f.type.startsWith('image/'));
    const previews = valid.map(f => URL.createObjectURL(f));
    setNewFiles(prev => [...prev, ...valid]);
    setNewFilePreviews(prev => [...prev, ...previews]);
  };

  const removeExisting = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));
  const removeNew = (idx: number) => {
    URL.revokeObjectURL(newFilePreviews[idx]);
    setNewFiles(prev => prev.filter((_, i) => i !== idx));
    setNewFilePreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let uploadedUrls: string[] = [];
      if (newFiles.length > 0) {
        const base64Array = await Promise.all(newFiles.map(file => new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })));
        const resp = await fetch('/api/images/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-app-password': appPassword },
          body: JSON.stringify({ images: base64Array })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        uploadedUrls = data.urls;
      }
      onSave([...images, ...uploadedUrls]);
    } catch (e: any) {
      toast('Failed to save images: ' + e.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><ImagePlus size={18} /> Edit Images</h3>
          <button onClick={onClose} className="btn-icon"><X size={18} /></button>
        </div>

        {/* Existing images — drag to reorder */}
        {images.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>Drag to reorder · click × to remove</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {images.map((src, idx) => {
                const isOver = dragOverIdx === idx;
                const isDragging = draggedIdx === idx;
                return (
                  <div
                    key={idx}
                    draggable={true}
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setTimeout(() => setDraggedIdx(idx), 0); }}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; if (dragOverIdx !== idx) setDragOverIdx(idx); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverIdx(null); }}
                    onDrop={e => {
                      e.preventDefault();
                      if (draggedIdx !== null && draggedIdx !== idx) {
                        const from = draggedIdx;
                        setImages(prev => {
                          const arr = [...prev];
                          const [item] = arr.splice(from, 1);
                          arr.splice(idx, 0, item);
                          return arr;
                        });
                      }
                      setDraggedIdx(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null); }}
                    style={{
                      position: 'relative', width: '90px', height: '90px', flexShrink: 0,
                      borderRadius: '6px', overflow: 'hidden',
                      border: `2px solid ${isOver ? 'var(--accent-color)' : 'var(--border-color)'}`,
                      cursor: 'grab', opacity: isDragging ? 0.35 : 1,
                      boxShadow: isOver ? '0 0 0 3px rgba(99,102,241,0.35)' : 'none',
                      transition: 'border-color 0.15s, box-shadow 0.15s, opacity 0.15s',
                      userSelect: 'none'
                    }}
                  >
                    <img src={src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} />
                    {idx === 0 && (
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(99,102,241,0.8)', fontSize: '0.62rem', textAlign: 'center', color: 'white', padding: '2px 0' }}>MAIN</div>
                    )}
                    <div style={{ position: 'absolute', top: '4px', left: '4px', color: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}><GripVertical size={12} /></div>
                    <button onClick={() => removeExisting(idx)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* New files preview */}
        {newFiles.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>New photos to upload ({newFiles.length})</p>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {newFilePreviews.map((src, idx) => (
                <div key={idx} style={{ position: 'relative', width: '90px', height: '90px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', border: '2px solid var(--success)' }}>
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <button onClick={() => removeNew(idx)} style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Drop zone for adding new images */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setIsDraggingFiles(true); }}
          onDragLeave={() => setIsDraggingFiles(false)}
          onDrop={e => { e.preventDefault(); setIsDraggingFiles(false); addFiles(e.dataTransfer.files); }}
          style={{ border: `2px dashed ${isDraggingFiles ? 'var(--accent-color)' : 'var(--border-color)'}`, borderRadius: '8px', padding: '1.5rem', textAlign: 'center', cursor: 'pointer', background: isDraggingFiles ? 'var(--accent-light)' : 'rgba(0,0,0,0.2)', transition: 'all 0.2s', marginBottom: '1.5rem' }}
        >
          <UploadCloud size={28} style={{ color: isDraggingFiles ? 'var(--accent-color)' : 'var(--text-secondary)', marginBottom: '8px' }} />
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>Drop photos here or click to browse</p>
          <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={e => addFiles(e.target.files)} style={{ display: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn-primary" style={{ flex: 2 }} onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Uploading & Saving...' : `Save Images (${images.length + newFiles.length} total)`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StagedListingsView({ listings, onUpdate, onDelete, onBulkDelete, onMoveToListed, isEbayConnected, appPassword = '' }: StagedListingsProps) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPushingIds, setBulkPushingIds] = useState<Set<string>>(new Set());

  // Lightbox
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Re-analyze
  const [reanalyzeId, setReanalyzeId] = useState<string | null>(null);
  const [reanalyzeInstructions, setReanalyzeInstructions] = useState('');
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  // Sold comps
  const [compsId, setCompsId] = useState<string | null>(null);
  const [compsData, setCompsData] = useState<{ title: string; price: string; currency: string; condition: string; url: string }[]>([]);
  const [compsLoading, setCompsLoading] = useState(false);

  // Image editing
  const [imageEditId, setImageEditId] = useState<string | null>(null);

  if (listings.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No Staged Listings</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Create a new listing to see it here.</p>
      </div>
    );
  }

  const handleCopyHtml = (id: string, html: string) => {
    navigator.clipboard.writeText(html);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast('HTML description copied to clipboard.', 'success');
  };

  const handlePushToEbay = async (listing: StagedListing) => {
    const pw = appPassword || localStorage.getItem('app_password') || '';
    setPushingId(listing.id);
    try {
      const resp = await fetch('/api/ebay/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-password': pw },
        body: JSON.stringify({ listing })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      onMoveToListed(listing, data.draftId);
      toast(`"${listing.title.substring(0, 40)}..." pushed to eBay!`, 'success');
    } catch (e: any) {
      toast('Error pushing to eBay: ' + e.message, 'error');
    } finally {
      setPushingId(null);
    }
  };

  const handleBulkPush = async () => {
    if (!isEbayConnected) { toast('Connect to eBay first.', 'error'); return; }
    const ids = Array.from(selectedIds);
    const toListing = listings.filter(l => ids.includes(l.id));
    setBulkPushingIds(new Set(ids));
    let success = 0;
    for (const listing of toListing) {
      try {
        const pw = appPassword || localStorage.getItem('app_password') || '';
        const resp = await fetch('/api/ebay/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-app-password': pw },
          body: JSON.stringify({ listing })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        onMoveToListed(listing, data.draftId);
        success++;
      } catch (e: any) {
        toast(`Failed to push "${listing.title.substring(0, 30)}...": ${e.message}`, 'error');
      }
    }
    setBulkPushingIds(new Set());
    setSelectedIds(new Set());
    if (success > 0) toast(`${success} listing${success > 1 ? 's' : ''} pushed to eBay.`, 'success');
  };

  const handleBulkDelete = () => {
    const count = selectedIds.size;
    if (!confirm(`Delete ${count} selected listing${count > 1 ? 's' : ''}?`)) return;
    onBulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
    toast(`${count} listing${count > 1 ? 's' : ''} deleted.`, 'success');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(listings.map(l => l.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleReanalyze = async () => {
    const listing = listings.find(l => l.id === reanalyzeId);
    if (!listing) return;
    const urlImages = (listing.images || []).filter(img => img.startsWith('http'));
    if (urlImages.length === 0) {
      toast('No cloud images available for re-analysis. Only Cloudinary-uploaded images can be re-analyzed.', 'info');
      return;
    }
    setIsReanalyzing(true);
    try {
      const resp = await fetch('/api/generate-from-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-password': appPassword },
        body: JSON.stringify({ imageUrls: urlImages, instructions: reanalyzeInstructions })
      });
      if (!resp.ok) throw new Error(await resp.text());
      const result = await resp.json();
      onUpdate({ ...listing, ...result, images: listing.images, updatedAt: Date.now() });
      toast('Listing updated with new AI analysis.', 'success');
      setReanalyzeId(null);
      setReanalyzeInstructions('');
    } catch (e: any) {
      toast('Re-analysis failed: ' + e.message, 'error');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleFetchComps = async (listing: StagedListing) => {
    if (compsId === listing.id) { setCompsId(null); return; }
    setCompsId(listing.id);
    setCompsData([]);
    setCompsLoading(true);
    try {
      const query = listing.title.split(' ').slice(0, 5).join(' ');
      const resp = await fetch(`/api/ebay/sold-comps?query=${encodeURIComponent(query)}`, {
        headers: { 'x-app-password': appPassword }
      });
      const data = await resp.json();
      if (data.error) {
        toast(`Sold comps error: ${data.error}`, 'error');
        setCompsId(null);
      } else {
        setCompsData(data.items || []);
        if ((data.items || []).length === 0) toast('No recent sold comps found for this search.', 'info');
      }
    } catch (e: any) {
      toast('Failed to fetch sold comps: ' + e.message, 'error');
      setCompsId(null);
    } finally {
      setCompsLoading(false);
    }
  };

  if (editingId) {
    const l = listings.find(l => l.id === editingId);
    if (!l) return null;
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', height: '80vh' }}>
        <ResultsEditor
          data={{ title: l.title, description: l.description, condition: l.condition, category: l.category, priceRecommendation: l.priceRecommendation, shippingEstimate: l.shippingEstimate, itemSpecifics: l.itemSpecifics, sku: l.sku, sellerNotes: l.sellerNotes }}
          images={[]}
          existingImageUrls={l.images || []}
          appPassword={appPassword}
          onStage={(updatedData) => { onUpdate({ ...l, ...updatedData, updatedAt: Date.now() }); setEditingId(null); toast('Listing saved.', 'success'); }}
          onCancel={() => setEditingId(null)}
        />
      </div>
    );
  }

  const ActionButtons = ({ listing }: { listing: StagedListing }) => (
    <>
      <button className="btn-primary"
        style={{ fontSize: '0.85rem', padding: '6px 12px', opacity: !isEbayConnected ? 0.5 : 1, whiteSpace: 'nowrap' }}
        onClick={() => { if (!isEbayConnected) { toast('Connect to eBay first.', 'error'); return; } handlePushToEbay(listing); }}
        disabled={pushingId === listing.id || bulkPushingIds.has(listing.id)}
        title={!isEbayConnected ? 'Connect to eBay first' : 'Push to eBay'}
      >
        {(pushingId === listing.id || bulkPushingIds.has(listing.id)) ? 'Pushing...' : 'Push to eBay'}
      </button>
      <button className="btn-icon" title="Find Sold Comps" onClick={() => handleFetchComps(listing)} style={{ color: compsId === listing.id ? 'var(--success)' : undefined }}>
        <TrendingUp size={18} />
      </button>
      <button className="btn-icon" title="Re-analyze with AI" onClick={() => { setReanalyzeId(listing.id); setReanalyzeInstructions(''); }}>
        <Wand2 size={18} />
      </button>
      <button className="btn-icon" title="Copy HTML Description" onClick={() => handleCopyHtml(listing.id, listing.description)}>
        {copiedId === listing.id ? <Check size={18} color="var(--success)" /> : <Copy size={18} />}
      </button>
      <button className="btn-icon" onClick={() => setImageEditId(listing.id)} title="Edit / Add Images">
        <ImagePlus size={18} />
      </button>
      <button className="btn-icon" onClick={() => setEditingId(listing.id)} title="Edit Listing">
        <Edit2 size={18} />
      </button>
      <button className="btn-icon" style={{ color: '#ef4444' }}
        onClick={() => { if (confirm('Delete this staged listing?')) { onDelete(listing.id); toast('Listing deleted.', 'success'); } }}
        title="Delete Listing">
        <Trash2 size={18} />
      </button>
    </>
  );

  const CompsPanel = ({ listing }: { listing: StagedListing }) => {
    if (compsId !== listing.id) return null;
    return (
      <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--border-color)', marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingTop: '0.75rem' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)' }}>📊 Active eBay Prices</span>
          <button onClick={() => setCompsId(null)} className="btn-icon" style={{ padding: '2px' }}><X size={14} /></button>
        </div>
        {compsLoading && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Loading...</p>}
        {!compsLoading && compsData.length === 0 && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>No results found.</p>}
        {!compsLoading && compsData.map((comp, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: i < compsData.length - 1 ? '1px solid var(--border-color)' : 'none', gap: '8px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <a href={comp.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
                {comp.title}
              </a>
              {comp.condition && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7 }}>{comp.condition}</span>}
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success)', flexShrink: 0 }}>
              ${comp.price}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const imageEditListing = imageEditId ? listings.find(l => l.id === imageEditId) : null;

  return (
    <div>
      {/* Lightbox */}
      {lightboxImages && (
        <Lightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxImages(null)} onNavigate={setLightboxIndex} />
      )}

      {/* Re-analyze modal */}
      {reanalyzeId && (
        <div onClick={() => setReanalyzeId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '480px', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}><RefreshCw size={18} /> Re-analyze with AI</h3>
              <button onClick={() => setReanalyzeId(null)} className="btn-icon"><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              The AI will re-examine this listing's images with your updated instructions and regenerate all fields.
            </p>
            <textarea
              className="input-base"
              placeholder="Updated instructions (e.g. 'This is actually a 1st edition' or 'Price it higher, condition is excellent')"
              value={reanalyzeInstructions}
              onChange={e => setReanalyzeInstructions(e.target.value)}
              rows={4}
              style={{ marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setReanalyzeId(null)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 2 }} onClick={handleReanalyze} disabled={isReanalyzing}>
                {isReanalyzing ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing...</> : <><Wand2 size={16} /> Run Analysis</>}
              </button>
            </div>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Image edit modal */}
      {imageEditListing && (
        <ImageEditModal
          listing={imageEditListing}
          appPassword={appPassword}
          onSave={(newImages) => {
            onUpdate({ ...imageEditListing, images: newImages, updatedAt: Date.now() });
            setImageEditId(null);
            toast('Images updated.', 'success');
          }}
          onClose={() => setImageEditId(null)}
        />
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {listings.length} listing{listings.length !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {selectedIds.size === 0 ? (
            <button onClick={selectAll} style={{ fontSize: '0.8rem', padding: '5px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer' }}>
              Select All
            </button>
          ) : (
            <>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selectedIds.size} selected</span>
              <button onClick={handleBulkPush} disabled={bulkPushingIds.size > 0} className="btn-primary" style={{ fontSize: '0.8rem', padding: '5px 12px', opacity: !isEbayConnected ? 0.5 : 1 }}>
                Push {selectedIds.size} to eBay
              </button>
              <button onClick={handleBulkDelete} style={{ fontSize: '0.8rem', padding: '5px 10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '6px', cursor: 'pointer' }}>
                Delete Selected
              </button>
              <button onClick={clearSelection} className="btn-icon" style={{ padding: '5px' }} title="Clear selection">
                <X size={16} />
              </button>
            </>
          )}
          <button onClick={() => setViewMode('grid')} title="Grid view"
            style={{ padding: '6px 10px', background: viewMode === 'grid' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'grid' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LayoutGrid size={18} />
          </button>
          <button onClick={() => setViewMode('list')} title="List view"
            style={{ padding: '6px 10px', background: viewMode === 'list' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'list' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
          {listings.map(listing => {
            const isSelected = selectedIds.has(listing.id);
            return (
              <div key={listing.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', outline: isSelected ? '2px solid var(--accent-color)' : 'none', outlineOffset: '2px' }}>
                {/* Images */}
                <div style={{ display: 'flex', height: '140px', background: 'rgba(0,0,0,0.5)', position: 'relative' }}>
                  {/* Checkbox */}
                  <div onClick={() => toggleSelect(listing.id)} style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 3, cursor: 'pointer', width: '22px', height: '22px', borderRadius: '5px', background: isSelected ? 'var(--accent-color)' : 'rgba(0,0,0,0.6)', border: `2px solid ${isSelected ? 'var(--accent-color)' : 'rgba(255,255,255,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                    {isSelected && <Check size={13} color="white" />}
                  </div>
                  {/* Edit images button — overlay on image area */}
                  <button
                    onClick={() => setImageEditId(listing.id)}
                    title="Edit / Add Images"
                    style={{ position: 'absolute', bottom: '8px', right: '8px', zIndex: 3, background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', backdropFilter: 'blur(4px)' }}
                  >
                    <ImagePlus size={13} /> Edit
                  </button>
                  {listing.images && listing.images.length > 0 ? (
                    <>
                      <div style={{ flex: 2, height: '100%', position: 'relative', cursor: 'pointer' }} onClick={() => { setLightboxImages(listing.images); setLightboxIndex(0); }}>
                        <img src={listing.images[0]} alt="Main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <ImageSearchButton src={listing.images[0]} />
                      </div>
                      {listing.images.length > 1 && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '2px' }}>
                          {listing.images.slice(1, 3).map((img, i) => (
                            <div key={i} style={{ flex: 1, height: '50%', position: 'relative', cursor: 'pointer' }} onClick={() => { setLightboxImages(listing.images); setLightboxIndex(i + 1); }}>
                              <img src={img} alt={`Thumb ${i}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              <ImageSearchButton src={img} size="sm" />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No images</div>
                  )}
                </div>

                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {listing.title}
                  </h3>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Calendar size={13} /> {new Date(listing.createdAt).toLocaleDateString()}</span>
                    {listing.updatedAt && listing.updatedAt !== listing.createdAt && (
                      <span style={{ opacity: 0.7 }}>· updated {timeAgo(listing.updatedAt)}</span>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {listing.condition}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>${listing.priceRecommendation}</span>
                    <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>{listing.category}</span>
                    {listing.sku && <span style={{ fontSize: '0.8rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc' }}>SKU: {listing.sku}</span>}
                  </div>
                  {listing.sellerNotes && (
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 8px', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                      📝 {listing.sellerNotes}
                    </p>
                  )}
                  <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                    <span style={{ marginRight: 'auto' }} />
                    <ActionButtons listing={listing} />
                  </div>
                </div>

                <CompsPanel listing={listing} />
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {listings.map((listing, idx) => {
            const isSelected = selectedIds.has(listing.id);
            return (
              <div key={listing.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', background: isSelected ? 'rgba(99,102,241,0.06)' : 'none', borderBottom: '1px solid var(--border-color)' }}>
                  {/* Checkbox */}
                  <div onClick={() => toggleSelect(listing.id)} style={{ width: '18px', height: '18px', flexShrink: 0, borderRadius: '4px', background: isSelected ? 'var(--accent-color)' : 'transparent', border: `2px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSelected && <Check size={11} color="white" />}
                  </div>

                  {/* Thumbnail */}
                  <div style={{ width: '56px', height: '56px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', background: 'rgba(0,0,0,0.4)', position: 'relative', cursor: listing.images?.[0] ? 'pointer' : 'default' }}
                    onClick={() => listing.images?.[0] && (setLightboxImages(listing.images), setLightboxIndex(0))}>
                    {listing.images?.[0] ? (
                      <><img src={listing.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><ImageSearchButton src={listing.images[0]} size="sm" /></>
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>—</div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 500, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.title}</p>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                      {listing.sellerNotes && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic', flex: 1 }}>📝 {listing.sellerNotes}</p>}
                      {listing.updatedAt && listing.updatedAt !== listing.createdAt && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.7 }}>updated {timeAgo(listing.updatedAt)}</span>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>${listing.priceRecommendation}</span>
                    {listing.sku && <span style={{ fontSize: '0.78rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc', whiteSpace: 'nowrap' }}>{listing.sku}</span>}
                  </div>

                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>
                    {new Date(listing.createdAt).toLocaleDateString()}
                  </span>

                  <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, alignItems: 'center' }}>
                    <ActionButtons listing={listing} />
                  </div>
                </div>
                {compsId === listing.id && (
                  <div style={{ padding: '0 1.25rem', borderBottom: idx < listings.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                    <CompsPanel listing={listing} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
