import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Edit2, Copy, Check, Calendar, LayoutGrid, List, Wand2, TrendingUp, X, RefreshCw, ImagePlus, GripVertical, UploadCloud, Search, ChevronDown, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import type { StagedListing, EbayPolicy } from '../types';
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
type SortOption = 'date-desc' | 'date-asc' | 'price-asc' | 'price-desc' | 'title-asc' | 'health-asc';

interface HealthScore { score: number; issues: string[]; }

function computeHealthScore(listing: StagedListing): HealthScore {
  const issues: string[] = [];
  let score = 0;

  const titleLen = listing.title?.length || 0;
  if (titleLen >= 70) score += 20;
  else if (titleLen >= 50) { score += 10; issues.push(`Title short: ${titleLen}/80 chars`); }
  else { issues.push(`Title very short: ${titleLen}/80 chars`); }

  const imgCount = (listing.images || []).length;
  if (imgCount >= 3) score += 20;
  else if (imgCount >= 1) { score += 10; issues.push(`Only ${imgCount} image — add 3+ for best visibility`); }
  else { issues.push('No images attached'); }

  const hasCloudImages = (listing.images || []).some(img => img.startsWith('http'));
  if (hasCloudImages) score += 10;
  else if (imgCount > 0) issues.push('Images not uploaded to cloud — push may fail');

  const descLen = listing.description?.length || 0;
  if (descLen > 300) score += 15;
  else if (descLen > 80) { score += 8; issues.push('Description is short'); }
  else { issues.push('Description missing or very short'); }

  const cat = listing.category || '';
  if (cat && cat !== 'Unknown') score += 15;
  else issues.push('Category not set');

  const price = parseFloat((listing.priceRecommendation || '').replace(/[^0-9.]/g, ''));
  if (price > 0) score += 10;
  else issues.push('Price not set');

  const specificsCount = Object.keys(listing.itemSpecifics || {}).length;
  if (specificsCount >= 5) score += 10;
  else if (specificsCount >= 2) { score += 5; issues.push(`Only ${specificsCount} item specifics`); }
  else { issues.push('Item specifics missing'); }

  return { score, issues };
}

const EBAY_CONDITIONS = [
  { id: '1000', label: 'New' },
  { id: '1500', label: 'New Other (open box)' },
  { id: '2000', label: 'Certified Refurbished' },
  { id: '2500', label: 'Seller Refurbished' },
  { id: '3000', label: 'Used' },
  { id: '4000', label: 'Very Good' },
  { id: '5000', label: 'Good' },
  { id: '6000', label: 'Acceptable' },
  { id: '7000', label: 'For Parts / Not Working' },
];

function autoConditionId(conditionStr: string): string {
  const s = (conditionStr || '').toLowerCase();
  if (s.includes('for parts') || s.includes('not working')) return '7000';
  if (s.includes('acceptable') || s.includes('heavy wear')) return '6000';
  if (s.includes('good') && !s.includes('very good') && !s.includes('like new')) return '5000';
  if (s.includes('very good')) return '4000';
  if (s.includes('like new') || s.includes('mint') || s.includes('open box')) return '2500';
  if (s.includes('refurbished') || s.includes('refurb')) return '2500';
  if (s.includes('new other')) return '1500';
  if (s.includes('new') && !s.includes('like')) return '1000';
  return '3000';
}

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

  return createPortal(
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
    </div>,
    document.body
  );
}

interface PushModal {
  listing: StagedListing;
  conditionId: string;
  fulfillmentPolicyId: string;
  categoryId: string;
  fulfillmentPolicies: EbayPolicy[];
  loading: boolean;
}

export default function StagedListingsView({ listings, onUpdate, onDelete, onBulkDelete, onMoveToListed, isEbayConnected, appPassword = '' }: StagedListingsProps) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [pushModal, setPushModal] = useState<PushModal | null>(null);
  const [expandedHealthId, setExpandedHealthId] = useState<string | null>(null);

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

  const visibleListings = (() => {
    const q = search.toLowerCase();
    let result = activeTag ? listings.filter(l => l.tags?.includes(activeTag)) : listings;
    if (q) result = result.filter(l => l.title.toLowerCase().includes(q) || (l.sku || '').toLowerCase().includes(q) || (l.category || '').toLowerCase().includes(q));
    return result.slice().sort((a, b) => {
      if (sortBy === 'date-asc') return a.createdAt - b.createdAt;
      if (sortBy === 'date-desc') return b.createdAt - a.createdAt;
      if (sortBy === 'price-asc') return parseFloat(a.priceRecommendation || '0') - parseFloat(b.priceRecommendation || '0');
      if (sortBy === 'price-desc') return parseFloat(b.priceRecommendation || '0') - parseFloat(a.priceRecommendation || '0');
      if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
      if (sortBy === 'health-asc') return computeHealthScore(a).score - computeHealthScore(b).score;
      return 0;
    });
  })();

  if (listings.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No Staged Listings</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Create a new listing on the New Listing tab to see it here.</p>
      </div>
    );
  }

  const handleCopyHtml = (id: string, html: string) => {
    navigator.clipboard.writeText(html);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast('HTML description copied to clipboard.', 'success');
  };

  const openPushModal = async (listing: StagedListing) => {
    if (!isEbayConnected) { toast('Connect to eBay first.', 'error'); return; }
    const pw = appPassword || localStorage.getItem('app_password') || '';
    // Pre-load: settings for default policy, categories for suggested ID
    setPushModal({ listing, conditionId: autoConditionId(listing.condition), fulfillmentPolicyId: '', categoryId: '', fulfillmentPolicies: [], loading: true });
    try {
      const [settingsResp, policiesResp, categoryResp] = await Promise.all([
        fetch('/api/settings', { headers: { 'x-app-password': pw } }).then(r => r.json()).catch(() => ({})),
        fetch('/api/ebay/policies', { headers: { 'x-app-password': pw } }).then(r => r.json()).catch(() => ({ fulfillmentPolicies: [] })),
        fetch(`/api/ebay/categories?query=${encodeURIComponent(listing.category || listing.title.split(' ').slice(0, 4).join(' '))}`, { headers: { 'x-app-password': pw } }).then(r => r.json()).catch(() => []),
      ]);
      const defaultPolicyId = settingsResp.defaultFulfillmentPolicyId || '';
      const suggestedCategoryId = Array.isArray(categoryResp) && categoryResp[0] ? categoryResp[0].id : '';
      setPushModal(prev => prev ? { ...prev, loading: false, fulfillmentPolicyId: defaultPolicyId, categoryId: suggestedCategoryId, fulfillmentPolicies: policiesResp.fulfillmentPolicies || [] } : null);
    } catch {
      setPushModal(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const confirmPushToEbay = async () => {
    if (!pushModal) return;
    const { listing, conditionId, fulfillmentPolicyId, categoryId } = pushModal;
    const pw = appPassword || localStorage.getItem('app_password') || '';
    setPushingId(listing.id);
    setPushModal(null);
    try {
      const resp = await fetch('/api/ebay/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-password': pw },
        body: JSON.stringify({ listing, overrideConditionId: conditionId, overrideFulfillmentPolicyId: fulfillmentPolicyId || undefined, overrideCategoryId: categoryId || undefined })
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
    let fail = 0;
    for (const listing of toListing) {
      try {
        const pw = appPassword || localStorage.getItem('app_password') || '';
        const resp = await fetch('/api/ebay/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-app-password': pw },
          body: JSON.stringify({ listing, overrideConditionId: autoConditionId(listing.condition) })
        });
        if (!resp.ok) throw new Error(await resp.text());
        const data = await resp.json();
        onMoveToListed(listing, data.draftId);
        success++;
      } catch (e: any) {
        fail++;
        toast(`Failed: "${listing.title.substring(0, 30)}...": ${e.message}`, 'error');
      }
    }
    setBulkPushingIds(new Set());
    setSelectedIds(new Set());
    if (success > 0) toast(`${success} pushed${fail > 0 ? `, ${fail} failed` : ''}.`, success > 0 ? 'success' : 'error');
  };

  const handleBulkDelete = () => {
    onBulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
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
          data={{ title: l.title, description: l.description, condition: l.condition, category: l.category, priceRecommendation: l.priceRecommendation, shippingEstimate: l.shippingEstimate, itemSpecifics: l.itemSpecifics, sku: l.sku, sellerNotes: l.sellerNotes, costBasis: l.costBasis, tags: l.tags }}
          images={[]}
          existingImageUrls={l.images || []}
          appPassword={appPassword}
          onStage={(updatedData) => { onUpdate({ ...l, ...updatedData, updatedAt: Date.now() }); setEditingId(null); toast('Listing saved.', 'success'); }}
          onCancel={() => setEditingId(null)}
        />
      </div>
    );
  }

  const HealthBadge = ({ listing }: { listing: StagedListing }) => {
    const { score, issues } = computeHealthScore(listing);
    const color = score >= 80 ? 'var(--success)' : score >= 55 ? '#f59e0b' : '#ef4444';
    const Icon = score >= 80 ? ShieldCheck : score >= 55 ? ShieldAlert : ShieldX;
    const isExpanded = expandedHealthId === listing.id;
    return (
      <div style={{ position: 'relative' }}>
        <button onClick={() => setExpandedHealthId(isExpanded ? null : listing.id)}
          title={`Listing health: ${score}/100`}
          style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'transparent', border: 'none', color, cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
          <Icon size={15} /> {score}
        </button>
        {isExpanded && issues.length > 0 && createPortal(
          <div onClick={() => setExpandedHealthId(null)} style={{ position: 'fixed', inset: 0, zIndex: 8500 }}>
            <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '1rem 1.25rem', minWidth: '280px', maxWidth: '400px', zIndex: 8501, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', fontWeight: 600, color }}>Health: {score}/100 — {issues.length} issue{issues.length > 1 ? 's' : ''}</p>
              {issues.map((issue, i) => <p key={i} style={{ margin: '3px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>• {issue}</p>)}
            </div>
          </div>, document.body
        )}
      </div>
    );
  };

  const ActionButtons = ({ listing }: { listing: StagedListing }) => (
    <>
      <HealthBadge listing={listing} />
      <button className="btn-primary"
        style={{ fontSize: '0.85rem', padding: '6px 12px', opacity: !isEbayConnected ? 0.5 : 1, whiteSpace: 'nowrap' }}
        onClick={() => openPushModal(listing)}
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
        onClick={() => onDelete(listing.id)}
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
  const allTags = Array.from(new Set(listings.flatMap(l => l.tags || [])));

  return (
    <div>
      {/* Push confirmation modal */}
      {pushModal && createPortal(
        <div onClick={() => setPushModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '520px', padding: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Confirm Push to eBay</h3>
              <button onClick={() => setPushModal(null)} className="btn-icon"><X size={18} /></button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pushModal.listing.title}
            </p>
            {pushModal.loading ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginRight: '8px', verticalAlign: 'middle' }} />Loading policies & category...
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>eBay Condition</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>AI assessed: "{pushModal.listing.condition?.substring(0, 80)}"</p>
                  <select className="input-base" value={pushModal.conditionId} onChange={e => setPushModal(prev => prev ? { ...prev, conditionId: e.target.value } : null)}>
                    {EBAY_CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.id} — {c.label}</option>)}
                  </select>
                </div>
                {pushModal.fulfillmentPolicies.length > 0 && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Shipping Policy</label>
                    <select className="input-base" value={pushModal.fulfillmentPolicyId} onChange={e => setPushModal(prev => prev ? { ...prev, fulfillmentPolicyId: e.target.value } : null)}>
                      <option value="">— Use server default —</option>
                      {pushModal.fulfillmentPolicies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>eBay Category ID</label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>AI category: "{pushModal.listing.category}"</p>
                  <input className="input-base" value={pushModal.categoryId} onChange={e => setPushModal(prev => prev ? { ...prev, categoryId: e.target.value } : null)} placeholder="Leave blank to use server default" />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
                  <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setPushModal(null)}>Cancel</button>
                  <button className="btn-primary" style={{ flex: 2 }} onClick={confirmPushToEbay}>Push to eBay</button>
                </div>
              </div>
            )}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>, document.body
      )}

      {/* Lightbox — portalled to avoid transform ancestor issues */}
      {lightboxImages && createPortal(
        <Lightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxImages(null)} onNavigate={setLightboxIndex} />,
        document.body
      )}

      {/* Re-analyze modal — portalled */}
      {reanalyzeId && createPortal(
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
        </div>,
        document.body
      )}

      {/* Image edit modal — portalled */}
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

      {/* Search + Sort controls */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <input type="text" className="input-base" placeholder="Search title, SKU, category..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '32px' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <select className="input-base" value={sortBy} onChange={e => setSortBy(e.target.value as SortOption)} style={{ paddingRight: '2rem', appearance: 'none', cursor: 'pointer', minWidth: '180px' }}>
            <option value="date-desc">Date: Newest First</option>
            <option value="date-asc">Date: Oldest First</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="title-asc">Title: A → Z</option>
            <option value="health-asc">Health Score: Lowest First</option>
          </select>
          <ChevronDown size={13} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', opacity: 0.7 }}>Filter:</span>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '4px', border: '1px solid', cursor: 'pointer', background: activeTag === tag ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)', borderColor: activeTag === tag ? 'var(--accent-color)' : 'var(--border-color)', color: activeTag === tag ? '#a5b4fc' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
              {tag}
            </button>
          ))}
          {activeTag && <button onClick={() => setActiveTag(null)} style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Clear</button>}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          {visibleListings.length}{(activeTag || search) ? ` of ${listings.length}` : ''} listing{visibleListings.length !== 1 ? 's' : ''}
          {search && <span style={{ opacity: 0.6 }}> matching "{search}"</span>}
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
          {visibleListings.map(listing => {
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
                  {listing.tags && listing.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                      {listing.tags.map(tag => (
                        <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)} style={{ fontSize: '0.72rem', padding: '1px 7px', borderRadius: '4px', border: '1px solid', cursor: 'pointer', background: activeTag === tag ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.35)', color: '#a5b4fc' }}>
                          {tag}
                        </button>
                      ))}
                    </div>
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
          {visibleListings.map((listing, idx) => {
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
                  <div style={{ padding: '0 1.25rem', borderBottom: idx < visibleListings.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
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
