import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Wand2, X, RefreshCw, ImagePlus, GripVertical, UploadCloud, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle } from 'lucide-react';
import type { StagedListing, EbayPolicy } from '../types';
import ResultsEditor from './ResultsEditor';
import Lightbox from './Lightbox';
import { useToast } from '../context/ToastContext';
import CrossPostModal from './CrossPostModal';
import { useListFilterSort } from '../hooks/useListFilterSort';
// staged/HealthBadge is the lighter badge used by future FE-001 splits and
// by FE-002 (ListedProducts); the local HealthBadge below composes a custom
// trigger button with the extracted HealthIssuesPopover.
import HealthIssuesPopover from './staged/HealthIssuesPopover';
import StagedFilters from './staged/StagedFilters';
import StagedBulkToolbar from './staged/StagedBulkToolbar';
import CompsPanel from './staged/CompsPanel';
import StagedListingActions from './staged/StagedListingActions';
import StagedListingCard from './staged/StagedListingCard';
import StagedListingListRow from './staged/StagedListingListRow';
import {
  computeHealthScore,
  autoConditionId,
  toArizonaLocalISO,
  EBAY_CONDITIONS,
  compareStaged,
  matchesStagedQuery,
  type SortOption,
} from './staged/helpers';

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

// computeHealthScore, autoConditionId, timeAgo, toArizonaLocalISO,
// EBAY_CONDITIONS, SortOption — extracted to ./staged/helpers (FE-001a).

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
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appPassword}` },
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
  validConditions: { id: string; label: string }[];
  scheduleDate: string; // datetime-local string, empty = list immediately
  fulfillmentPolicyId: string;
  categoryId: string;
  fulfillmentPolicies: EbayPolicy[];
  loading: boolean;
  acceptOffers: boolean;
  autoAcceptPrice: string;
  minOfferPrice: string;
}

export default function StagedListingsView({ listings, onUpdate, onDelete, onBulkDelete, onMoveToListed, isEbayConnected, appPassword = '' }: StagedListingsProps) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('date-desc');
  const [pushModal, setPushModal] = useState<PushModal | null>(null);
  const [pushExtraSpecifics, setPushExtraSpecifics] = useState<{ name: string; value: string }[]>([]);
  const [pushErrorModal, setPushErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [expandedHealthId, setExpandedHealthId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkPushingIds, setBulkPushingIds] = useState<Set<string>>(new Set());

  // FE-004 — search / sort / pagination owned by the shared hook so the
  // staged + listed + sold tabs converge on one contract.
  const sortComparator = useMemo(() => (a: StagedListing, b: StagedListing) => compareStaged(a, b, sortBy), [sortBy]);
  const list = useListFilterSort<StagedListing>({
    items: listings,
    filter: matchesStagedQuery,
    sort: sortComparator,
    perPage: 20,
  });
  const search = list.query;
  const setSearch = list.setQuery;
  const perPage = list.perPage;
  const setPerPage = list.setPerPage;
  const currentPage = list.currentPage;
  const setCurrentPage = list.setCurrentPage;
  const visibleListings = list.visible;
  const paginatedListings = list.paginated;
  const totalPages = list.totalPages;

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
  const [crossPostListing, setCrossPostListing] = useState<StagedListing | null>(null);

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
    const hasType = Object.keys(listing.itemSpecifics || {}).some(k => k.toLowerCase() === 'type');
    setPushExtraSpecifics(hasType ? [] : [{ name: 'Type', value: '' }]);
    // Pre-load: settings for default policy, categories for suggested ID
    const desiredConditionId = autoConditionId(listing.condition);
    // Default schedule: 21 days from now (eBay's max), formatted for datetime-local input
    const defaultSchedule = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    const defaultScheduleStr = toArizonaLocalISO(defaultSchedule);
    setPushModal({ listing, conditionId: desiredConditionId, validConditions: [], scheduleDate: defaultScheduleStr, fulfillmentPolicyId: '', categoryId: '', fulfillmentPolicies: [], loading: true, acceptOffers: true, autoAcceptPrice: '', minOfferPrice: '' });
    try {
      const [settingsResp, policiesResp, categoryResp] = await Promise.all([
        fetch('/api/settings', { headers: { 'Authorization': `Bearer ${pw}` } }).then(r => r.json()).catch(() => ({})),
        fetch('/api/ebay/policies', { headers: { 'Authorization': `Bearer ${pw}` } }).then(r => r.json()).catch(() => ({ fulfillmentPolicies: [] })),
        fetch(`/api/ebay/categories?query=${encodeURIComponent(listing.category || listing.title.split(' ').slice(0, 4).join(' '))}`, { headers: { 'Authorization': `Bearer ${pw}` } }).then(r => r.json()).catch(() => []),
      ]);
      const defaultPolicyId = settingsResp.defaultFulfillmentPolicyId || '';
      const suggestedCategoryId = Array.isArray(categoryResp) && categoryResp[0] ? categoryResp[0].id : '';

      // Fetch valid conditions for the resolved category
      let validConditions: { id: string; label: string }[] = [];
      if (suggestedCategoryId) {
        validConditions = await fetch(`/api/ebay/category-conditions?categoryId=${suggestedCategoryId}`, { headers: { 'Authorization': `Bearer ${pw}` } })
          .then(r => r.json()).then(d => d.conditions || []).catch(() => []);
      }

      // Auto-correct condition: if desired condition isn't valid for this category, pick closest
      let resolvedConditionId = desiredConditionId;
      if (validConditions.length > 0) {
        const validIds = validConditions.map(c => c.id);
        if (!validIds.includes(resolvedConditionId)) {
          // Walk from desired toward 3000 (Used) to find the nearest valid option
          const fallbackOrder = [desiredConditionId, '3000', '1000', '4000', '5000', '6000'];
          resolvedConditionId = fallbackOrder.find(id => validIds.includes(id)) ?? validIds[0];
        }
      }

      setPushModal(prev => prev ? { ...prev, loading: false, conditionId: resolvedConditionId, validConditions, fulfillmentPolicyId: defaultPolicyId, categoryId: suggestedCategoryId, fulfillmentPolicies: policiesResp.fulfillmentPolicies || [] } : null);
    } catch {
      setPushModal(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const confirmPushToEbay = async () => {
    if (!pushModal) return;
    const { listing, conditionId, fulfillmentPolicyId, categoryId, scheduleDate, acceptOffers, autoAcceptPrice, minOfferPrice } = pushModal;
    const pw = appPassword || localStorage.getItem('app_password') || '';
    setPushingId(listing.id);
    setPushModal(null);
    try {
      const mergedSpecifics = {
        ...listing.itemSpecifics,
        ...Object.fromEntries(pushExtraSpecifics.filter(s => s.name && s.value).map(s => [s.name, s.value])),
      };
      const resp = await fetch('/api/ebay/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
        // Append Arizona offset (-07:00) so the server parses the local time correctly
        body: JSON.stringify({
          listing: { ...listing, itemSpecifics: mergedSpecifics },
          overrideConditionId: conditionId,
          overrideFulfillmentPolicyId: fulfillmentPolicyId || undefined,
          overrideCategoryId: categoryId || undefined,
          scheduleDate: scheduleDate ? new Date(scheduleDate + ':00-07:00').toISOString() : undefined,
          bestOffer: { enabled: acceptOffers, autoAcceptPrice: autoAcceptPrice || undefined, minOfferPrice: minOfferPrice || undefined },
        })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error ?? 'Push failed');
      if (data.conditionFallback) {
        toast(`Pushed! eBay auto-corrected condition to "Used" for this category.`, 'info');
      }
      onMoveToListed(listing, data.draftId);
      toast(`"${listing.title.substring(0, 40)}..." pushed to eBay!`, 'success');
    } catch (e: any) {
      // Show a persistent error modal so the full message is readable
      setPushErrorModal({ title: listing.title.substring(0, 60), message: e.message });
    } finally {
      setPushingId(null);
    }
  };

  const handleBulkPush = async () => {
    if (!isEbayConnected) { toast('Connect to eBay first.', 'error'); return; }
    const ids = Array.from(selectedIds);
    const toListing = listings.filter(l => ids.includes(l.id));

    // Match single-push default: schedule 21 days out unless user opts to list immediately.
    const scheduleIso = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString();
    const scheduleLabel = new Date(scheduleIso).toLocaleString();
    const mode = window.confirm(
      `Push ${toListing.length} listing${toListing.length !== 1 ? 's' : ''} to eBay?\n\n` +
      `OK     → Schedule all for ${scheduleLabel} (eBay's 21-day max)\n` +
      `Cancel → Don't push (use per-listing push for immediate / custom schedule)`
    );
    if (!mode) return;

    setBulkPushingIds(new Set(ids));
    let success = 0;
    let fail = 0;
    for (const listing of toListing) {
      try {
        const pw = appPassword || localStorage.getItem('app_password') || '';
        // Resolve a category per listing — prefer a stored categoryId, otherwise
        // ask eBay's GetSuggestedCategories using the listing's category text or
        // first few title words. Without this, the server falls through to the
        // hardcoded default (Action Figures).
        let resolvedCategoryId: string | undefined = listing.categoryId;
        if (!resolvedCategoryId) {
          try {
            const q = listing.category || listing.title.split(' ').slice(0, 4).join(' ');
            const catResp = await fetch(`/api/ebay/categories?query=${encodeURIComponent(q)}`, { headers: { 'Authorization': `Bearer ${pw}` } }).then(r => r.json()).catch(() => []);
            if (Array.isArray(catResp) && catResp[0]?.id) resolvedCategoryId = catResp[0].id;
          } catch { /* leave undefined; server default takes over */ }
        }
        const resp = await fetch('/api/ebay/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
          body: JSON.stringify({ listing, overrideConditionId: autoConditionId(listing.condition), overrideCategoryId: resolvedCategoryId, scheduleDate: scheduleIso, bestOffer: { enabled: true } })
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
    if (success > 0) toast(`${success} scheduled for ${scheduleLabel}${fail > 0 ? `, ${fail} failed` : ''}.`, success > 0 ? 'success' : 'error');
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

  // Pagination clamping + reset-on-query are owned by useListFilterSort.
  // We still need to reset to page 1 when the sort changes, since the hook
  // intentionally only resets on query changes (sort doesn't change
  // result-set composition, just order).
  useEffect(() => { setCurrentPage(1); }, [sortBy, setCurrentPage]);

  const selectAll = () => setSelectedIds(new Set(visibleListings.map(l => l.id)));
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appPassword}` },
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
        headers: { 'Authorization': `Bearer ${appPassword}` }
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
          data={{ title: l.title, description: l.description, condition: l.condition, category: l.category, priceRecommendation: l.priceRecommendation, shippingEstimate: l.shippingEstimate, itemSpecifics: l.itemSpecifics, sku: l.sku, sellerNotes: l.sellerNotes, costBasis: l.costBasis, shippingLabelCost: l.shippingLabelCost, tags: l.tags, quantity: l.quantity }}
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
          aria-label={`Listing health ${score} of 100, ${issues.length} issue${issues.length === 1 ? '' : 's'}`}
          aria-expanded={isExpanded}
          style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'transparent', border: 'none', color, cursor: 'pointer', padding: '2px 4px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 600 }}>
          <Icon size={15} /> {score}
        </button>
        <HealthIssuesPopover
          open={isExpanded}
          score={score}
          issues={issues}
          color={color}
          onDismiss={() => setExpandedHealthId(null)}
        />
      </div>
    );
  };

  // Thin adapter — wires closure state/setters into the extracted
  // StagedListingActions row so the per-listing render functions don't
  // have to thread them through.
  const ActionButtons = ({ listing }: { listing: StagedListing }) => (
    <StagedListingActions
      listing={listing}
      healthBadge={<HealthBadge listing={listing} />}
      isEbayConnected={isEbayConnected}
      isPushing={pushingId === listing.id || bulkPushingIds.has(listing.id)}
      isCompsActive={compsId === listing.id}
      isCopied={copiedId === listing.id}
      onPush={openPushModal}
      onFetchComps={handleFetchComps}
      onReanalyze={(l) => { setReanalyzeId(l.id); setReanalyzeInstructions(''); }}
      onCopyHtml={(l) => handleCopyHtml(l.id, l.description)}
      onEditImages={(l) => setImageEditId(l.id)}
      onEdit={(l) => setEditingId(l.id)}
      onCrossPost={setCrossPostListing}
      onMoveToListed={(l) => {
        const id = window.prompt(
          `Mark "${l.title.substring(0, 40)}..." as Listed without pushing to eBay?\n\nEnter the eBay item ID for this listing (or leave blank if unknown):`,
          '',
        );
        if (id === null) return;
        onMoveToListed(l, id.trim());
        toast('Listing moved to Listed.', 'success');
      }}
      onDelete={(l) => onDelete(l.id)}
    />
  );

  // The extracted CompsPanel is unconditionally rendered; the parent gates
  // visibility by passing nothing when it's not the active listing.
  const renderCompsPanel = (listing: StagedListing) => (
    compsId === listing.id
      ? <CompsPanel loading={compsLoading} comps={compsData} onDismiss={() => setCompsId(null)} />
      : null
  );

  const imageEditListing = imageEditId ? listings.find(l => l.id === imageEditId) : null;

  return (
    <div>
      {crossPostListing && <CrossPostModal listing={crossPostListing} onClose={() => setCrossPostListing(null)} />}

      {/* Push error modal — persistent so the full message can be read */}
      {pushErrorModal && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '560px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
              <AlertTriangle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#ef4444' }}>eBay Push Failed</h3>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pushErrorModal.title}
            </p>
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '8px', padding: '12px 14px', fontSize: '0.85rem', color: '#fca5a5', lineHeight: 1.6, marginBottom: '1.25rem', wordBreak: 'break-word', userSelect: 'text' }}>
              {pushErrorModal.message}
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Copy the error above and share it if you need help. Check your item specifics (especially "Type") and condition for this category.
            </p>
            <button className="btn-primary" onClick={() => setPushErrorModal(null)} style={{ width: '100%' }}>Dismiss</button>
          </div>
        </div>,
        document.body
      )}

      {/* Push confirmation modal */}
      {pushModal && createPortal(
        <div onClick={() => setPushModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '520px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
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
                    {(pushModal.validConditions.length > 0 ? pushModal.validConditions : EBAY_CONDITIONS)
                      .map(c => <option key={c.id} value={c.id}>{c.id} — {c.label}</option>)}
                  </select>
                  {pushModal.validConditions.length > 0 && pushModal.validConditions.length < EBAY_CONDITIONS.length && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Showing {pushModal.validConditions.length} condition{pushModal.validConditions.length !== 1 ? 's' : ''} valid for this category
                    </p>
                  )}
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
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Schedule Listing</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={!!pushModal.scheduleDate}
                        onChange={e => {
                          if (e.target.checked) {
                            const d = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
                            setPushModal(prev => prev ? { ...prev, scheduleDate: toArizonaLocalISO(d) } : null);
                          } else {
                            setPushModal(prev => prev ? { ...prev, scheduleDate: '' } : null);
                          }
                        }}
                        style={{ accentColor: 'var(--accent-color)', width: '14px', height: '14px' }}
                      />
                      Schedule for later
                    </label>
                  </div>
                  {pushModal.scheduleDate ? (
                    <>
                      <input
                        type="datetime-local"
                        className="input-base"
                        value={pushModal.scheduleDate}
                        min={toArizonaLocalISO(new Date(Date.now() + 5 * 60 * 1000))}
                        max={toArizonaLocalISO(new Date(Date.now() + 21 * 24 * 60 * 60 * 1000))}
                        onChange={e => setPushModal(prev => prev ? { ...prev, scheduleDate: e.target.value } : null)}
                      />
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                        eBay will make this listing live at the selected time (max 21 days out)
                      </p>
                    </>
                  ) : (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Listing will go live immediately when pushed</p>
                  )}
                </div>
                {/* Best Offer */}
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                    <input
                      type="checkbox"
                      checked={pushModal.acceptOffers}
                      onChange={e => setPushModal(prev => prev ? { ...prev, acceptOffers: e.target.checked } : null)}
                      style={{ accentColor: 'var(--accent-color)', width: '14px', height: '14px' }}
                    />
                    Accept Best Offers
                  </label>
                  {pushModal.acceptOffers && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Auto-accept at ($)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="input-base"
                            value={pushModal.autoAcceptPrice}
                            onChange={e => setPushModal(prev => prev ? { ...prev, autoAcceptPrice: e.target.value } : null)}
                            placeholder="(off)"
                            style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Auto-decline below ($)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            className="input-base"
                            value={pushModal.minOfferPrice}
                            onChange={e => setPushModal(prev => prev ? { ...prev, minOfferPrice: e.target.value } : null)}
                            placeholder="(off)"
                            style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                          />
                        </div>
                      </div>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                        Leave blank to review every offer manually. eBay only auto-accepts/declines when a value is set.
                      </p>
                    </>
                  )}
                </div>
                {/* Item Specifics quick-fix */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                      Item Specifics
                      <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '6px' }}>
                        ({Object.keys(pushModal.listing.itemSpecifics || {}).length} set)
                      </span>
                    </label>
                    <button
                      className="btn-icon"
                      style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      onClick={() => setPushExtraSpecifics(prev => [...prev, { name: '', value: '' }])}
                    >+ Add field</button>
                  </div>
                  {!Object.keys(pushModal.listing.itemSpecifics || {}).some(k => k.toLowerCase() === 'type') &&
                   !pushExtraSpecifics.some(s => s.name.toLowerCase() === 'type') && (
                    <div style={{ fontSize: '0.78rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                      <AlertTriangle size={12} /> "Type" is required for most eBay categories — fill it in below
                    </div>
                  )}
                  {pushExtraSpecifics.map((s, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', marginBottom: '6px' }}>
                      <input
                        className="input-base"
                        value={s.name}
                        onChange={e => setPushExtraSpecifics(prev => prev.map((r, idx) => idx === i ? { ...r, name: e.target.value } : r))}
                        placeholder="Name (e.g. Type)"
                        style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                      />
                      <input
                        className="input-base"
                        value={s.value}
                        onChange={e => setPushExtraSpecifics(prev => prev.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                        placeholder="Value (e.g. T-Shirt)"
                        style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                      />
                      <button className="btn-icon" style={{ color: '#ef4444', padding: '4px 8px' }} onClick={() => setPushExtraSpecifics(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                    </div>
                  ))}
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

      <StagedFilters
        search={search}
        onSearchChange={setSearch}
        sortBy={sortBy}
        onSortChange={setSortBy}
      />
      <StagedBulkToolbar
        visibleCount={visibleListings.length}
        totalCount={listings.length}
        search={search}
        selectedCount={selectedIds.size}
        onSelectAll={selectAll}
        onClearSelection={clearSelection}
        onBulkPush={handleBulkPush}
        onBulkDelete={handleBulkDelete}
        bulkPushing={bulkPushingIds.size > 0}
        isEbayConnected={isEbayConnected}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Grid view */}
      {viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
          {paginatedListings.map((listing) => (
            <StagedListingCard
              key={listing.id}
              listing={listing}
              isSelected={selectedIds.has(listing.id)}
              onToggleSelect={toggleSelect}
              onEditImages={(id) => setImageEditId(id)}
              onOpenLightbox={(imgs, idx) => { setLightboxImages(imgs); setLightboxIndex(idx); }}
              actions={<ActionButtons listing={listing} />}
              compsPanel={renderCompsPanel(listing)}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
          {paginatedListings.map((listing, idx) => (
            <StagedListingListRow
              key={listing.id}
              listing={listing}
              isSelected={selectedIds.has(listing.id)}
              onToggleSelect={toggleSelect}
              onOpenLightbox={(imgs, i) => { setLightboxImages(imgs); setLightboxIndex(i); }}
              actions={<ActionButtons listing={listing} />}
              compsPanel={compsId === listing.id ? (
                <div style={{ padding: '0 1.25rem', borderBottom: idx < paginatedListings.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                  {renderCompsPanel(listing)}
                </div>
              ) : null}
            />
          ))}
        </div>
      )}

      {/* Pagination controls */}
      {visibleListings.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span style={{ marginRight: '4px' }}>Show:</span>
            {[20, 50, 100, 200, 0].map(n => (
              <button key={n} onClick={() => { setPerPage(n); setCurrentPage(1); }}
                style={{ padding: '3px 8px', borderRadius: '4px', border: '1px solid', cursor: 'pointer', fontSize: '0.8rem',
                  background: perPage === n ? 'rgba(99,102,241,0.2)' : 'transparent',
                  borderColor: perPage === n ? 'var(--accent-color)' : 'var(--border-color)',
                  color: perPage === n ? '#a5b4fc' : 'var(--text-secondary)' }}>
                {n === 0 ? 'All' : n}
              </button>
            ))}
          </div>
          {totalPages > 1 && (
            <>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.35 : 1 }}>
                ←
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Page {currentPage} of {totalPages} · {visibleListings.length} listings
              </span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.35 : 1 }}>
                →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
