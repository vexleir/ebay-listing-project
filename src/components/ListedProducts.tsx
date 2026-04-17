import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Calendar, CheckCircle, Trash2, Archive, ArchiveRestore, Search, ChevronDown, LayoutGrid, List, Download, RefreshCw, Eye, RotateCcw, CircleSlash, Share2, DollarSign, Pencil, ShoppingBag, Check, X, Wand2, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import type { StagedListing } from '../types';
import ImageSearchButton from './ImageSearchButton';
import Lightbox from './Lightbox';
import { useToast } from '../context/ToastContext';
import { calculateNetProfit } from '../utils/fees';
import CrossPostModal from './CrossPostModal';
import EditListingModal from './EditListingModal';
import CollectionSelector from './CollectionSelector';

interface ListedProductsProps {
  listings: StagedListing[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onSyncSold?: () => void;
  onRelist?: (listing: StagedListing) => void;
  onMarkSold?: (id: string, soldPrice: string, soldAt: number) => void;
  onUpdateListing?: (updated: StagedListing) => void;
  isEbayConnected?: boolean;
  isShopifyConnected?: boolean;
  appPassword?: string;
}

type SortOption = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'price-asc' | 'price-desc';
type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'active' | 'ended';
type MarketplaceFilter = 'all' | 'ebay-only' | 'shopify' | 'both';

function parsePrice(val: string): number {
  const m = val.replace(/[^0-9.]/g, '');
  return m ? parseFloat(m) : 0;
}

function ProfitBadge({ price, costBasis, category, shippingLabelCost }: { price: string; costBasis?: string; category?: string; shippingLabelCost?: string }) {
  if (!costBasis) return null;
  const np = calculateNetProfit(price, costBasis, category || '', shippingLabelCost);
  if (!np.salePrice || !np.costBasis) return null;
  const color = np.netProfit >= 0 ? 'var(--success)' : '#ef4444';
  const bg = np.netProfit >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
  const pct = np.netMarginPct !== null ? `${np.netMarginPct.toFixed(0)}%` : '';
  return (
    <span title={`Gross: $${np.grossProfit.toFixed(2)} · eBay fees: $${(np.ebayFee + np.transactionFee).toFixed(2)}${np.shippingCost > 0 ? ` · Shipping: $${np.shippingCost.toFixed(2)}` : ''}`}
      style={{ fontSize: '0.78rem', background: bg, color, padding: '2px 8px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'help' }}>
      Net {np.netProfit >= 0 ? '+' : ''}${np.netProfit.toFixed(2)}{pct ? ` (${pct})` : ''}
    </span>
  );
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

function exportCsv(listings: StagedListing[]) {
  const headers = ['Title', 'SKU', 'Price', 'Category', 'eBay ID', 'Status', 'Date Created', 'Last Updated'];
  const rows = listings.map(l => [
    `"${(l.title || '').replace(/"/g, '""')}"`,
    `"${(l.sku || '').replace(/"/g, '""')}"`,
    l.priceRecommendation || '',
    `"${(l.category || '').replace(/"/g, '""')}"`,
    l.ebayDraftId || '',
    l.archived ? 'Archived' : 'Active',
    new Date(l.createdAt).toLocaleDateString(),
    l.updatedAt ? new Date(l.updatedAt).toLocaleDateString() : ''
  ].join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `listed-products-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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

function HealthBadge({ listing }: { listing: StagedListing }) {
  const { score, issues } = computeHealthScore(listing);
  const color = score >= 80 ? 'var(--success)' : score >= 55 ? '#f59e0b' : '#ef4444';
  const bg = score >= 80 ? 'rgba(16,185,129,0.15)' : score >= 55 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
  const Icon = score >= 80 ? ShieldCheck : score >= 55 ? ShieldAlert : ShieldX;
  const tooltip = score >= 80 ? `Health: ${score}/100 — Good` : `Health: ${score}/100\n${issues.join('\n')}`;
  return (
    <span title={tooltip} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: bg, color, padding: '2px 7px', borderRadius: '4px', fontWeight: 600, cursor: 'help', whiteSpace: 'nowrap' }}>
      <Icon size={11} /> {score}
    </span>
  );
}

export default function ListedProductsView({ listings, onDelete, onArchive, onSyncSold, onRelist, onMarkSold, onUpdateListing, isEbayConnected, isShopifyConnected, appPassword = '' }: ListedProductsProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('date-desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [marketplaceFilter, setMarketplaceFilter] = useState<MarketplaceFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [editListing, setEditListing] = useState<StagedListing | null>(null);
  const [markSoldModal, setMarkSoldModal] = useState<{ listing: StagedListing; price: string; date: string } | null>(null);
  const [markingSold, setMarkingSold] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, { watchCount: string; hitCount: string; quantitySold: string } | null>>({});
  const [loadingStatsId, setLoadingStatsId] = useState<string | null>(null);
  const [shopifyPushingId, setShopifyPushingId] = useState<string | null>(null);
  const [shopifyDelistingId, setShopifyDelistingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkShopifyPushingIds, setBulkShopifyPushingIds] = useState<Set<string>>(new Set());
  const [perPage, setPerPage] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState(1);

  const [crossPostListing, setCrossPostListing] = useState<StagedListing | null>(null);
  // End listing confirm
  const [endConfirmId, setEndConfirmId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  // AI optimize modal
  const [optimizeListing, setOptimizeListing] = useState<StagedListing | null>(null);
  const [optimizeInstructions, setOptimizeInstructions] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<any>(null);
  const [optimizeSaving, setOptimizeSaving] = useState(false);
  const [optimizeCollectionCodes, setOptimizeCollectionCodes] = useState<string[]>([]);
  // Shopify push options modal
  const [pushOptionsListing, setPushOptionsListing] = useState<StagedListing | null>(null);
  const [pushOptionsCollectionCodes, setPushOptionsCollectionCodes] = useState<string[]>([]);
  const [pushOptionsTags, setPushOptionsTags] = useState<string[]>([]);
  const [pushOptionsSeoKeywords, setPushOptionsSeoKeywords] = useState('');
  const [pushOptionsPushing, setPushOptionsPushing] = useState(false);

  const pw = appPassword || localStorage.getItem('app_password') || '';

  const handleEndListing = async (listing: StagedListing) => {
    setEnding(true);
    try {
      const resp = await fetch('/api/ebay/end-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
        body: JSON.stringify({ itemId: listing.ebayDraftId })
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'End listing failed');
      onArchive(listing.id);
      toast('eBay listing ended and archived.', 'success');
    } catch (e: any) {
      toast('End listing failed: ' + e.message, 'error');
    } finally {
      setEnding(false);
      setEndConfirmId(null);
    }
  };

  const fetchStats = async (listing: StagedListing) => {
    if (!listing.ebayDraftId) return;
    setLoadingStatsId(listing.id);
    try {
      const resp = await fetch(`/api/ebay/listing-stats?itemId=${encodeURIComponent(listing.ebayDraftId)}`);
      const data = await resp.json();
      if (data.error) { toast('Could not fetch stats: ' + data.error, 'error'); return; }
      setStats(prev => ({ ...prev, [listing.id]: data }));
    } catch (e: any) {
      toast('Stats fetch failed: ' + e.message, 'error');
    } finally {
      setLoadingStatsId(null);
    }
  };

  const openShopifyPushModal = (listing: StagedListing) => {
    setPushOptionsListing(listing);
    setPushOptionsCollectionCodes(listing.collectionCodes || []);
    setPushOptionsTags(listing.tags || []);
    setPushOptionsSeoKeywords(listing.seoKeywords || (listing.tags || []).join(', '));
  };

  const handleShopifyPushConfirm = async () => {
    if (!pushOptionsListing) return;
    const enriched: StagedListing = {
      ...pushOptionsListing,
      collectionCodes: pushOptionsCollectionCodes,
      tags: pushOptionsTags,
      seoKeywords: pushOptionsSeoKeywords,
    };
    setPushOptionsPushing(true);
    setShopifyPushingId(pushOptionsListing.id);
    try {
      const resp = await fetch('/api/shopify/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
        body: JSON.stringify({ listing: enriched }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Shopify push failed');
      onUpdateListing?.({ ...enriched, shopifyProductId: data.shopifyProductId, shopifyStatus: 'listed', shopifyListedAt: Date.now() });

      // Report what happened with metafields / collections
      const mfSet = data.metafieldsSet || [];
      const mfErrors = data.metafieldErrors || [];
      const colWarnings = data.collectionWarnings || [];
      if (mfErrors.length > 0 || colWarnings.length > 0) {
        const problems = [...mfErrors, ...colWarnings].join(' | ');
        toast(`Listed on Shopify — but some fields failed: ${problems}`, 'error');
      } else if (mfSet.length > 0) {
        toast(`Listed on Shopify! Metafields set: ${mfSet.join(', ')}`, 'success');
      } else {
        toast('Listed on Shopify!', 'success');
      }
      setPushOptionsListing(null);
    } catch (e: any) {
      toast('Shopify push failed: ' + e.message, 'error');
    } finally {
      setPushOptionsPushing(false);
      setShopifyPushingId(null);
    }
  };

  const handleShopifyPush = (listing: StagedListing) => openShopifyPushModal(listing);

  const handleShopifyDelist = async (listing: StagedListing) => {
    setShopifyDelistingId(listing.id);
    try {
      const resp = await fetch(`/api/shopify/delist/${listing.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${pw}` },
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Delist failed');
      if (onUpdateListing) {
        onUpdateListing({ ...listing, shopifyStatus: 'unlisted' });
      }
      toast('Removed from Shopify store.', 'success');
    } catch (e: any) {
      toast('Shopify delist failed: ' + e.message, 'error');
    } finally {
      setShopifyDelistingId(null);
    }
  };

  // Sold items have their own tab — exclude them here
  const nonSold = listings.filter(l => !l.soldAt);
  const allTags = Array.from(new Set(nonSold.flatMap(l => l.tags || [])));

  const counts = {
    all:    nonSold.length,
    active: nonSold.filter(l => !l.archived).length,
    ended:  nonSold.filter(l => l.archived).length,
  };

  const filteredListings = nonSold
    .filter(l => {
      if (statusFilter === 'active') return !l.archived;
      if (statusFilter === 'ended')  return l.archived;
      return true;
    })
    .filter(l => {
      const onShopify = !!(l.shopifyProductId && l.shopifyStatus === 'listed');
      if (marketplaceFilter === 'shopify')   return onShopify;
      if (marketplaceFilter === 'ebay-only') return !onShopify;
      if (marketplaceFilter === 'both')      return !!(l.ebayDraftId) && onShopify;
      return true;
    })
    .filter(l => !activeTag || l.tags?.includes(activeTag))
    .filter(l => {
      const q = search.toLowerCase();
      return !q || l.title.toLowerCase().includes(q) || (l.sku || '').toLowerCase().includes(q) || (l.category || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      switch (sort) {
        case 'date-asc':   return a.createdAt - b.createdAt;
        case 'date-desc':  return b.createdAt - a.createdAt;
        case 'title-asc':  return a.title.localeCompare(b.title);
        case 'title-desc': return b.title.localeCompare(a.title);
        case 'price-asc':  return parsePrice(a.priceRecommendation) - parsePrice(b.priceRecommendation);
        case 'price-desc': return parsePrice(b.priceRecommendation) - parsePrice(a.priceRecommendation);
        default: return 0;
      }
    });

  // Reset to page 1 when filters/search change
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter, marketplaceFilter, activeTag, sort]);


  const totalPages = perPage === 0 ? 1 : Math.ceil(filteredListings.length / perPage);
  const paginatedListings = perPage === 0 ? filteredListings : filteredListings.slice((currentPage - 1) * perPage, currentPage * perPage);

  const toggleSelect = (id: string) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAllFiltered = () => setSelectedIds(new Set(filteredListings.map(l => l.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkShopifyPush = async () => {
    const toPush = filteredListings.filter(l => selectedIds.has(l.id) && !(l.shopifyProductId && l.shopifyStatus === 'listed'));
    if (toPush.length === 0) { toast('All selected items are already on Shopify.', 'info'); return; }
    setBulkShopifyPushingIds(new Set(toPush.map(l => l.id)));
    let success = 0; let fail = 0;
    for (const listing of toPush) {
      try {
        const resp = await fetch('/api/shopify/push', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` }, body: JSON.stringify({ listing }) });
        const data = await resp.json();
        if (!resp.ok || data.error) throw new Error(data.error);
        onUpdateListing?.({ ...listing, shopifyProductId: data.shopifyProductId, shopifyStatus: 'listed', shopifyListedAt: Date.now() });
        success++;
      } catch { fail++; }
    }
    setBulkShopifyPushingIds(new Set());
    clearSelection();
    toast(`Shopify push: ${success} listed${fail > 0 ? `, ${fail} failed` : ''}.`, success > 0 ? 'success' : 'error');
  };

  const handleBulkArchive = () => {
    Array.from(selectedIds).forEach(id => onArchive(id));
    clearSelection();
    toast(`${selectedIds.size} listings archived.`, 'success');
  };

  const handleBulkDelete = () => {
    Array.from(selectedIds).forEach(id => onDelete(id));
    clearSelection();
  };

  const handleOptimize = async () => {
    if (!optimizeListing) return;
    setOptimizing(true);
    setOptimizeResult(null);
    try {
      const resp = await fetch('/api/generate-from-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
        body: JSON.stringify({ imageUrls: optimizeListing.images || [], instructions: optimizeInstructions }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'AI optimization failed');
      setOptimizeResult(data);
    } catch (e: any) {
      toast('AI optimization failed: ' + e.message, 'error');
    } finally {
      setOptimizing(false);
    }
  };

  const handleSaveOptimized = async (pushEbay: boolean, pushShopify: boolean) => {
    if (!optimizeListing || !optimizeResult) return;
    setOptimizeSaving(true);
    const updated: StagedListing = {
      ...optimizeListing,
      title: optimizeResult.title || optimizeListing.title,
      description: optimizeResult.description || optimizeListing.description,
      priceRecommendation: optimizeResult.priceRecommendation || optimizeListing.priceRecommendation,
      category: optimizeResult.category || optimizeListing.category,
      condition: optimizeResult.condition || optimizeListing.condition,
      itemSpecifics: optimizeResult.itemSpecifics || optimizeListing.itemSpecifics,
      tags: optimizeResult.tags || optimizeListing.tags,
      seoKeywords: optimizeResult.seoKeywords || optimizeListing.seoKeywords || '',
      collectionCodes: optimizeCollectionCodes.length > 0 ? optimizeCollectionCodes : optimizeListing.collectionCodes,
      updatedAt: Date.now(),
    };
    try {
      // Save to DB
      const saveResp = await fetch(`/api/listings/${optimizeListing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
        body: JSON.stringify({ updates: updated }),
      });
      if (!saveResp.ok) { const d = await saveResp.json(); throw new Error(d.error || 'Save failed'); }
      onUpdateListing?.(updated);

      // Push to eBay
      if (pushEbay && optimizeListing.ebayDraftId) {
        const conditionId = autoConditionId(updated.condition || '');
        const specifics = Object.entries(updated.itemSpecifics || {}).map(([name, value]) => ({ name, value: String(value) }));
        const reviseResp = await fetch('/api/ebay/revise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
          body: JSON.stringify({ itemId: optimizeListing.ebayDraftId, newTitle: updated.title, newPrice: String(updated.priceRecommendation || '').replace(/[^0-9.]/g, ''), description: updated.description, conditionId, itemSpecifics: specifics }),
        });
        const reviseData = await reviseResp.json();
        if (!reviseResp.ok || reviseData.error) throw new Error('eBay revise failed: ' + reviseData.error);
        if (reviseData.warning) console.warn('[revise]', reviseData.warning);
      }

      // Push to Shopify
      if (pushShopify && optimizeListing.shopifyProductId) {
        const shopifyResp = await fetch(`/api/shopify/update/${optimizeListing.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
          body: JSON.stringify(updated),
        });
        const shopifyData = await shopifyResp.json();
        if (!shopifyResp.ok || shopifyData.error) throw new Error('Shopify update failed: ' + shopifyData.error);
      }

      const where = [pushEbay && 'eBay', pushShopify && 'Shopify'].filter(Boolean).join(' & ');
      toast(`Listing optimized${where ? ` and pushed to ${where}` : ''}!`, 'success');
      setOptimizeListing(null);
      setOptimizeResult(null);
      setOptimizeInstructions('');
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setOptimizeSaving(false);
    }
  };

  if (nonSold.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No Listed Items</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Items you push to eBay will appear here.</p>
      </div>
    );
  }

  const renderCard = (listing: StagedListing, isArchived: boolean) => {
    const isSelected = selectedIds.has(listing.id);
    return (
    <div key={listing.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', border: `1px solid ${isSelected ? 'var(--accent-color)' : isArchived ? 'var(--border-color)' : 'var(--success-light)'}`, opacity: isArchived ? 0.65 : 1, outline: isSelected ? '2px solid var(--accent-color)' : 'none', outlineOffset: '2px' }}>
      {listing.soldAt ? (
        <div style={{ padding: '8px 12px', background: 'rgba(16,185,129,0.2)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
          ✓ SOLD
          {listing.soldPrice && <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>· Listed ${listing.priceRecommendation} → Sold ${listing.soldPrice}</span>}
          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.7 }}>{new Date(listing.soldAt).toLocaleDateString()}</span>
        </div>
      ) : !isArchived ? (
        <div style={{ padding: '8px 12px', background: 'var(--success-light)', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
          <CheckCircle size={16} /> Successfully Pushed
          {listing.ebayDraftId && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.8 }}>ID: {listing.ebayDraftId}</span>}
        </div>
      ) : (
        <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
          <Archive size={16} /> Archived
          {listing.ebayDraftId && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.6 }}>ID: {listing.ebayDraftId}</span>}
        </div>
      )}
      <div style={{ display: 'flex', height: '140px', background: 'rgba(0,0,0,0.5)', position: 'relative' }}>
        <div onClick={() => toggleSelect(listing.id)} style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 3, cursor: 'pointer', width: '22px', height: '22px', borderRadius: '5px', background: isSelected ? 'var(--accent-color)' : 'rgba(0,0,0,0.6)', border: `2px solid ${isSelected ? 'var(--accent-color)' : 'rgba(255,255,255,0.4)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
          {isSelected && <Check size={13} color="white" />}
        </div>
        {listing.images && listing.images.length > 0 ? (
          <div style={{ flex: 1, height: '100%', position: 'relative', cursor: 'pointer' }} onClick={() => { setLightboxImages(listing.images); setLightboxIndex(0); }}>
            <img src={listing.images[0]} alt="Main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <ImageSearchButton src={listing.images[0]} />
          </div>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No images</div>
        )}
      </div>
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{listing.title}</h3>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Calendar size={13} /> {new Date(listing.createdAt).toLocaleDateString()}</span>
          {listing.updatedAt && listing.updatedAt !== listing.createdAt && <span style={{ opacity: 0.7 }}>· updated {timeAgo(listing.updatedAt)}</span>}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>${listing.priceRecommendation}</span>
          <ProfitBadge price={listing.priceRecommendation} costBasis={listing.costBasis} category={listing.category} shippingLabelCost={listing.shippingLabelCost} />
          <HealthBadge listing={listing} />
          <span style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>{listing.category}</span>
          {listing.sku && <span style={{ fontSize: '0.8rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc' }}>SKU: {listing.sku}</span>}
          {listing.shopifyProductId && listing.shopifyStatus === 'listed' && (
            <span style={{ fontSize: '0.78rem', background: 'rgba(150,191,72,0.2)', color: '#96bf48', border: '1px solid rgba(150,191,72,0.35)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              Shopify ✓
            </span>
          )}
        </div>
        {listing.sellerNotes && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', padding: '6px 8px', marginBottom: '0.75rem', fontStyle: 'italic' }}>📝 {listing.sellerNotes}</p>}
        {stats[listing.id] && (
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
            <span title="Views"><Eye size={12} style={{ marginRight: '3px', verticalAlign: 'middle' }} />{stats[listing.id]!.hitCount} views</span>
            <span title="Watchers">👁 {stats[listing.id]!.watchCount} watchers</span>
            {parseInt(stats[listing.id]!.quantitySold) > 0 && <span style={{ color: 'var(--success)' }}>✓ {stats[listing.id]!.quantitySold} sold</span>}
          </div>
        )}
        <div style={{ marginTop: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
          <a className="btn-primary" href={listing.ebayDraftId ? `https://www.ebay.com/itm/${listing.ebayDraftId}` : 'https://www.ebay.com/mes/sellerhub'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', flex: 1, fontSize: '0.85rem', padding: '6px 12px', minWidth: '90px' }}>
            <ExternalLink size={16} /> eBay
          </a>
          {onRelist && isArchived && (
            <button className="btn-icon" title="Re-stage for relisting" onClick={() => onRelist(listing)} style={{ color: 'var(--accent)' }}>
              <RotateCcw size={18} />
            </button>
          )}
          {!isArchived && onMarkSold && (
            <button className="btn-icon" title="Mark as sold" onClick={() => setMarkSoldModal({ listing, price: listing.priceRecommendation || '', date: new Date().toISOString().split('T')[0] })}
              style={{ color: 'var(--success)', fontSize: '0.75rem', gap: '4px' }}>
              <DollarSign size={17} /> Sold
            </button>
          )}
          <button className="btn-icon" title="AI Optimize listing" onClick={() => { setOptimizeListing(listing); setOptimizeResult(null); setOptimizeInstructions(''); setOptimizeCollectionCodes(listing.collectionCodes || []); }}
            style={{ color: '#a78bfa' }}>
            <Wand2 size={18} />
          </button>
          <button className="btn-icon" title="Edit listing" onClick={() => setEditListing(listing)}><Pencil size={18} /></button>
          {listing.ebayDraftId && !isArchived && (
            <button className="btn-icon" title="End listing on eBay" style={{ color: '#ef4444' }} onClick={() => setEndConfirmId(listing.id)}>
              <CircleSlash size={18} />
            </button>
          )}
          {listing.ebayDraftId && (
            <button className="btn-icon" title="Fetch view/watcher stats from eBay" onClick={() => fetchStats(listing)} disabled={loadingStatsId === listing.id} style={{ color: stats[listing.id] ? 'var(--accent-color)' : undefined }}>
              {loadingStatsId === listing.id ? <span style={{ fontSize: '10px' }}>...</span> : <Eye size={18} />}
            </button>
          )}
          {isShopifyConnected && !isArchived && (
            listing.shopifyProductId && listing.shopifyStatus === 'listed' ? (
              <button className="btn-icon" title="Remove from Shopify" onClick={() => handleShopifyDelist(listing)}
                disabled={shopifyDelistingId === listing.id}
                style={{ color: '#96bf48', fontSize: '0.7rem', gap: '3px' }}>
                {shopifyDelistingId === listing.id ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShoppingBag size={16} />}
              </button>
            ) : (
              <button className="btn-icon" title="Push to Shopify" onClick={() => handleShopifyPush(listing)}
                disabled={shopifyPushingId === listing.id}
                style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', gap: '3px' }}>
                {shopifyPushingId === listing.id ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShoppingBag size={16} />}
              </button>
            )
          )}
          <button className="btn-icon" title="Cross-post to other platforms" onClick={() => setCrossPostListing(listing)}>
            <Share2 size={18} />
          </button>
          <button className="btn-icon" title={isArchived ? 'Unarchive' : 'Archive'} onClick={() => { onArchive(listing.id); toast(isArchived ? 'Listing unarchived.' : 'Listing archived.', 'success'); }}>
            {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
          </button>
          <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }} onClick={() => onDelete(listing.id)}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
    );
  };

  const renderListRow = (listing: StagedListing, isArchived: boolean) => {
    const isSelected = selectedIds.has(listing.id);
    return (
    <div key={listing.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.25rem', opacity: isArchived ? 0.65 : 1, borderBottom: '1px solid var(--border-color)', background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
      <div onClick={() => toggleSelect(listing.id)} style={{ width: '18px', height: '18px', flexShrink: 0, borderRadius: '4px', background: isSelected ? 'var(--accent-color)' : 'transparent', border: `2px solid ${isSelected ? 'var(--accent-color)' : 'var(--border-color)'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isSelected && <Check size={11} color="white" />}
      </div>
      <div style={{ width: '56px', height: '56px', flexShrink: 0, borderRadius: '6px', overflow: 'hidden', background: 'rgba(0,0,0,0.4)', position: 'relative', cursor: listing.images?.[0] ? 'pointer' : 'default' }}
        onClick={() => listing.images?.[0] && (setLightboxImages(listing.images), setLightboxIndex(0))}>
        {listing.images?.[0] ? (
          <><img src={listing.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /><ImageSearchButton src={listing.images[0]} size="sm" /></>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: '0.7rem' }}>—</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>
        {isArchived ? <Archive size={16} style={{ color: 'var(--text-secondary)' }} /> : <CheckCircle size={16} style={{ color: 'var(--success)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 500, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{listing.title}</p>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
          {listing.sellerNotes && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic', flex: 1 }}>📝 {listing.sellerNotes}</p>}
          {listing.updatedAt && listing.updatedAt !== listing.createdAt && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', flexShrink: 0, opacity: 0.7 }}>updated {timeAgo(listing.updatedAt)}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap' }}>${listing.priceRecommendation}</span>
        <ProfitBadge price={listing.priceRecommendation} costBasis={listing.costBasis} category={listing.category} shippingLabelCost={listing.shippingLabelCost} />
        <HealthBadge listing={listing} />
        {listing.sku && <span style={{ fontSize: '0.78rem', background: 'rgba(99,102,241,0.25)', padding: '2px 8px', borderRadius: '4px', color: '#a5b4fc', whiteSpace: 'nowrap' }}>{listing.sku}</span>}
      </div>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0, minWidth: '80px', textAlign: 'right' }}>{new Date(listing.createdAt).toLocaleDateString()}</span>
      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0, alignItems: 'center' }}>
        <a className="btn-primary" href={listing.ebayDraftId ? `https://www.ebay.com/itm/${listing.ebayDraftId}` : 'https://www.ebay.com/mes/sellerhub'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '5px 10px', whiteSpace: 'nowrap' }}>
          <ExternalLink size={14} /> eBay
        </a>
        {!isArchived && onMarkSold && (
          <button className="btn-icon" title="Mark as sold" onClick={() => setMarkSoldModal({ listing, price: listing.priceRecommendation || '', date: new Date().toISOString().split('T')[0] })}
            style={{ color: 'var(--success)' }}>
            <DollarSign size={17} />
          </button>
        )}
        <button className="btn-icon" title="AI Optimize listing" onClick={() => { setOptimizeListing(listing); setOptimizeResult(null); setOptimizeInstructions(''); setOptimizeCollectionCodes(listing.collectionCodes || []); }}
          style={{ color: '#a78bfa' }}>
          <Wand2 size={17} />
        </button>
        <button className="btn-icon" title="Edit listing" onClick={() => setEditListing(listing)}>
          <Pencil size={17} />
        </button>
        {listing.ebayDraftId && (
          <button className="btn-icon" title="Fetch view/watcher stats" onClick={() => fetchStats(listing)} disabled={loadingStatsId === listing.id} style={{ color: stats[listing.id] ? 'var(--accent-color)' : undefined }}>
            {loadingStatsId === listing.id ? <span style={{ fontSize: '10px' }}>...</span> : <Eye size={18} />}
          </button>
        )}
        {isShopifyConnected && !isArchived && (
          listing.shopifyProductId && listing.shopifyStatus === 'listed' ? (
            <button className="btn-icon" title="Remove from Shopify" onClick={() => handleShopifyDelist(listing)}
              disabled={shopifyDelistingId === listing.id} style={{ color: '#96bf48' }}>
              {shopifyDelistingId === listing.id ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShoppingBag size={16} />}
            </button>
          ) : (
            <button className="btn-icon" title="Push to Shopify" onClick={() => handleShopifyPush(listing)}
              disabled={shopifyPushingId === listing.id}>
              {shopifyPushingId === listing.id ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ShoppingBag size={16} />}
            </button>
          )
        )}
        <button className="btn-icon" title="Cross-post to other platforms" onClick={() => setCrossPostListing(listing)}>
          <Share2 size={18} />
        </button>
        <button className="btn-icon" title={isArchived ? 'Unarchive' : 'Archive'} onClick={() => { onArchive(listing.id); toast(isArchived ? 'Listing unarchived.' : 'Listing archived.', 'success'); }}>
          {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
        </button>
        <button className="btn-icon" title="Delete" style={{ color: '#ef4444' }}
          onClick={() => onDelete(listing.id)}>
          <Trash2 size={18} />
        </button>
      </div>
    </div>
    );
  };

  return (
    <div>
      {lightboxImages && createPortal(<Lightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxImages(null)} onNavigate={setLightboxIndex} />, document.body)}
      {crossPostListing && <CrossPostModal listing={crossPostListing} onClose={() => setCrossPostListing(null)} />}

      {/* Edit listing modal */}
      {editListing && (
        <EditListingModal
          listing={editListing}
          appPassword={appPassword}
          onClose={() => setEditListing(null)}
          onSaved={updated => { setEditListing(null); onUpdateListing?.(updated); }}
        />
      )}

      {/* Mark as Sold modal */}
      {markSoldModal && createPortal(
        <div onClick={() => setMarkSoldModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
            <h3 style={{ margin: '0 0 1.25rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={18} style={{ color: 'var(--success)' }} /> Mark as Sold
            </h3>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Sold Price ($)</label>
            <input className="input-base" type="number" step="0.01" min="0" value={markSoldModal.price}
              onChange={e => setMarkSoldModal(prev => prev ? { ...prev, price: e.target.value } : null)}
              style={{ marginBottom: '1rem' }} />
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Sold Date</label>
            <input className="input-base" type="date" value={markSoldModal.date}
              onChange={e => setMarkSoldModal(prev => prev ? { ...prev, date: e.target.value } : null)}
              style={{ marginBottom: '1.5rem' }} />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setMarkSoldModal(null)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 2, background: 'rgba(16,185,129,0.25)', borderColor: 'rgba(16,185,129,0.5)', color: 'var(--success)' }}
                disabled={markingSold}
                onClick={async () => {
                  setMarkingSold(true);
                  const soldAt = markSoldModal.date ? new Date(markSoldModal.date).getTime() : Date.now();
                  const soldPrice = markSoldModal.price ? `$${parseFloat(markSoldModal.price).toFixed(2)}` : '';
                  onMarkSold?.(markSoldModal.listing.id, soldPrice, soldAt);
                  setMarkSoldModal(null);
                  setMarkingSold(false);
                  toast('Listing marked as sold.', 'success');
                }}>
                {markingSold ? 'Saving...' : 'Mark as Sold'}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* End listing confirm modal */}
      {endConfirmId && createPortal(
        <div onClick={() => setEndConfirmId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}><CircleSlash size={18} style={{ color: '#ef4444' }} /> End eBay Listing?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>This will permanently end the live eBay listing. The item will be archived in ListingStager. This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setEndConfirmId(null)}>Cancel</button>
              <button style={{ flex: 2, background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => { const l = listings.find(x => x.id === endConfirmId); if (l) handleEndListing(l); }}
                disabled={ending}>
                {ending ? 'Ending...' : 'End Listing on eBay'}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Shopify push options modal */}
      {pushOptionsListing && createPortal(
        <div onClick={() => setPushOptionsListing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '560px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
              <ShoppingBag size={18} style={{ color: '#96bf48' }} />
              <h3 style={{ margin: 0, flex: 1 }}>Push to Shopify</h3>
              <button onClick={() => setPushOptionsListing(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
            </div>

            {/* Listing preview */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '1.25rem', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
              {pushOptionsListing.images?.[0] && <img src={pushOptionsListing.images[0]} alt="" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 2px 0', fontWeight: 500, fontSize: '0.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pushOptionsListing.title}</p>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>${pushOptionsListing.priceRecommendation}</span>
              </div>
            </div>

            {/* Collections */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                Collections
                {pushOptionsCollectionCodes.length > 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#96bf48', marginLeft: '6px' }}>
                    ({pushOptionsCollectionCodes.length} selected)
                  </span>
                )}
              </label>
              <CollectionSelector selected={pushOptionsCollectionCodes} onChange={setPushOptionsCollectionCodes} />
            </div>

            {/* Tags */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Tags <span style={{ fontWeight: 400, opacity: 0.6 }}>(comma-separated)</span></label>
              <input className="input-base" style={{ width: '100%' }}
                value={pushOptionsTags.join(', ')}
                onChange={e => setPushOptionsTags(e.target.value.split(',').map(t => t.trim()).filter(Boolean))}
                placeholder="vintage, collectible, anime…" />
            </div>

            {/* SEO Keywords */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                SEO Keywords <span style={{ fontWeight: 400, opacity: 0.6 }}>(Google Shopping metafield)</span>
              </label>
              <input className="input-base" style={{ width: '100%' }}
                value={pushOptionsSeoKeywords}
                onChange={e => setPushOptionsSeoKeywords(e.target.value)}
                placeholder="vintage figure, collectible toy, 90s anime…" />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setPushOptionsListing(null)}>Cancel</button>
              <button className="btn-primary" style={{ flex: 2, background: 'linear-gradient(135deg,#96bf48,#5e8e3e)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                disabled={pushOptionsPushing} onClick={handleShopifyPushConfirm}>
                {pushOptionsPushing ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Pushing…</> : <><ShoppingBag size={14} /> Push to Shopify</>}
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* AI Optimize modal */}
      {optimizeListing && createPortal(
        <div onClick={() => setOptimizeListing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
          <div className="glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '700px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
              <Wand2 size={20} style={{ color: '#a78bfa' }} />
              <h3 style={{ margin: 0, flex: 1 }}>AI Optimize Listing</h3>
              <button onClick={() => setOptimizeListing(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
            </div>

            {/* Current listing summary */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '1.25rem', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
              {optimizeListing.images?.[0] && <img src={optimizeListing.images[0]} alt="" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: '0 0 4px 0', fontWeight: 500, fontSize: '0.9rem' }}>{optimizeListing.title}</p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>${optimizeListing.priceRecommendation}</span>
                  <HealthBadge listing={optimizeListing} />
                  {optimizeListing.ebayDraftId && <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '1px 7px', borderRadius: '4px' }}>eBay listed</span>}
                  {optimizeListing.shopifyProductId && optimizeListing.shopifyStatus === 'listed' && <span style={{ fontSize: '0.75rem', background: 'rgba(150,191,72,0.2)', color: '#96bf48', padding: '1px 7px', borderRadius: '4px' }}>Shopify listed</span>}
                </div>
              </div>
            </div>

            {/* Collection picker */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                Collections
                {optimizeCollectionCodes.length > 0 && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '6px' }}>
                    ({optimizeCollectionCodes.length} selected)
                  </span>
                )}
              </label>
              <CollectionSelector selected={optimizeCollectionCodes} onChange={setOptimizeCollectionCodes} />
            </div>

            {/* Instructions */}
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Optimization Instructions (optional)</label>
            <textarea className="input-base" rows={3} placeholder="e.g. 'Focus on collectible value', 'Target vintage buyers', 'Improve condition description'…"
              value={optimizeInstructions} onChange={e => setOptimizeInstructions(e.target.value)}
              style={{ marginBottom: '1rem', resize: 'vertical', width: '100%' }} />

            {!optimizeResult ? (
              <button className="btn-primary" onClick={handleOptimize} disabled={optimizing}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center', padding: '10px' }}>
                {optimizing ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing images & generating…</> : <><Wand2 size={15} /> Generate Optimized Listing</>}
              </button>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>✓ Optimization ready</span>
                  <button onClick={handleOptimize} disabled={optimizing} style={{ fontSize: '0.75rem', padding: '3px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer' }}>
                    {optimizing ? 'Re-generating…' : 'Regenerate'}
                  </button>
                </div>

                {/* Title */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Title ({(optimizeResult.title || '').length}/80)</label>
                  <input className="input-base" value={optimizeResult.title || ''} onChange={e => setOptimizeResult((r: any) => ({ ...r, title: e.target.value }))} style={{ width: '100%' }} />
                </div>

                {/* Price + Category row */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Price</label>
                    <input className="input-base" value={optimizeResult.priceRecommendation || ''} onChange={e => setOptimizeResult((r: any) => ({ ...r, priceRecommendation: e.target.value }))} style={{ width: '100%' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Condition</label>
                    <input className="input-base" value={optimizeResult.condition || ''} onChange={e => setOptimizeResult((r: any) => ({ ...r, condition: e.target.value }))} style={{ width: '100%' }} />
                  </div>
                </div>

                {/* Description */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Description</label>
                  <textarea className="input-base" rows={5} value={optimizeResult.description || ''} onChange={e => setOptimizeResult((r: any) => ({ ...r, description: e.target.value }))} style={{ width: '100%', resize: 'vertical' }} />
                </div>

                {/* Item specifics preview */}
                {optimizeResult.itemSpecifics && Object.keys(optimizeResult.itemSpecifics).length > 0 && (
                  <div style={{ marginBottom: '0.75rem', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                    <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Item Specifics</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {Object.entries(optimizeResult.itemSpecifics).map(([k, v]) => (
                        <span key={k} style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '4px' }}>{k}: {String(v)}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tags */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                    Shopify/eBay Tags <span style={{ opacity: 0.6 }}>(comma-separated)</span>
                  </label>
                  <input className="input-base"
                    value={Array.isArray(optimizeResult.tags) ? optimizeResult.tags.join(', ') : (optimizeResult.tags || '')}
                    onChange={e => setOptimizeResult((r: any) => ({ ...r, tags: e.target.value.split(',').map((t: string) => t.trim()).filter(Boolean) }))}
                    style={{ width: '100%' }} placeholder="vintage, collectible, action-figure…" />
                </div>

                {/* SEO Keywords */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                    SEO Keywords <span style={{ opacity: 0.6 }}>(Shopify metafield · Google Shopping)</span>
                  </label>
                  <input className="input-base"
                    value={optimizeResult.seoKeywords || ''}
                    onChange={e => setOptimizeResult((r: any) => ({ ...r, seoKeywords: e.target.value }))}
                    style={{ width: '100%' }} placeholder="vintage figure, collectible anime toy, 90s action figure…" />
                </div>

                {/* Google metafields preview */}
                <div style={{ marginBottom: '1rem', padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <p style={{ margin: '0 0 6px 0', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Google Shopping Metafields (auto-derived)</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      { label: 'google.condition', value: (() => { const s = (optimizeResult.condition || '').toLowerCase(); return s.includes('new') && !s.includes('like') ? 'new' : s.includes('refurb') ? 'refurbished' : 'used'; })() },
                      { label: 'google.mpn', value: optimizeResult.itemSpecifics?.MPN || optimizeResult.itemSpecifics?.['Model Number'] || '—' },
                      { label: 'google.age_group', value: optimizeResult.itemSpecifics?.['Age Group'] || optimizeResult.itemSpecifics?.['Target Audience'] || '—' },
                      { label: 'google.gender', value: optimizeResult.itemSpecifics?.Gender || '—' },
                    ].map(({ label, value }) => (
                      <span key={label} style={{ fontSize: '0.72rem', background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)', padding: '2px 8px', borderRadius: '4px' }}>
                        {label}: <strong>{value}</strong>
                      </span>
                    ))}
                  </div>
                  <p style={{ margin: '6px 0 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.6 }}>These are set automatically on Shopify when you push. Edit item specifics above to change them.</p>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button className="btn-secondary" style={{ flex: 1 }} disabled={optimizeSaving} onClick={() => handleSaveOptimized(false, false)}>
                    {optimizeSaving ? 'Saving…' : 'Save Only'}
                  </button>
                  {optimizeListing.ebayDraftId && (
                    <button className="btn-primary" style={{ flex: 1, background: 'rgba(99,102,241,0.25)', borderColor: 'rgba(99,102,241,0.5)' }} disabled={optimizeSaving} onClick={() => handleSaveOptimized(true, false)}>
                      {optimizeSaving ? 'Saving…' : 'Save + Revise eBay'}
                    </button>
                  )}
                  {optimizeListing.shopifyProductId && optimizeListing.shopifyStatus === 'listed' && (
                    <button className="btn-primary" style={{ flex: 1, background: 'rgba(150,191,72,0.2)', borderColor: 'rgba(150,191,72,0.4)', color: '#96bf48' }} disabled={optimizeSaving} onClick={() => handleSaveOptimized(false, true)}>
                      {optimizeSaving ? 'Saving…' : 'Save + Update Shopify'}
                    </button>
                  )}
                  {optimizeListing.ebayDraftId && optimizeListing.shopifyProductId && optimizeListing.shopifyStatus === 'listed' && (
                    <button className="btn-primary" style={{ flex: 1 }} disabled={optimizeSaving} onClick={() => handleSaveOptimized(true, true)}>
                      {optimizeSaving ? 'Saving…' : 'Save + Push Both'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>, document.body
      )}

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
        {(['all', 'active', 'ended'] as StatusFilter[]).map(f => {
          const labels: Record<StatusFilter, string> = { all: 'All', active: 'Active', ended: 'Ended' };
          const colors: Record<StatusFilter, string> = { all: 'var(--accent)', active: 'var(--success)', ended: 'var(--text-secondary)' };
          const isActive = statusFilter === f;
          return (
            <button key={f} onClick={() => setStatusFilter(f)}
              style={{ fontSize: '0.82rem', padding: '4px 12px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
                background: isActive ? `rgba(99,102,241,0.2)` : 'rgba(255,255,255,0.04)',
                borderColor: isActive ? colors[f] : 'var(--border-color)',
                color: isActive ? colors[f] : 'var(--text-secondary)', fontWeight: isActive ? 600 : 400, transition: 'all 0.15s' }}>
              {labels[f]} <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>({counts[f]})</span>
            </button>
          );
        })}
      </div>

      {/* Marketplace filter pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', opacity: 0.7 }}>Platform:</span>
        {([
          { key: 'all',       label: 'All platforms' },
          { key: 'ebay-only', label: 'eBay only',       color: '#6366f1' },
          { key: 'shopify',   label: 'On Shopify',      color: '#96bf48' },
          { key: 'both',      label: 'Both platforms',  color: '#f59e0b' },
        ] as { key: MarketplaceFilter; label: string; color?: string }[]).map(({ key, label, color }) => {
          const isActive = marketplaceFilter === key;
          return (
            <button key={key} onClick={() => setMarketplaceFilter(key)}
              style={{ fontSize: '0.8rem', padding: '3px 11px', borderRadius: '20px', border: '1px solid', cursor: 'pointer',
                background: isActive ? `rgba(${color ? color : '99,102,241'},0.15)` : 'rgba(255,255,255,0.04)',
                borderColor: isActive ? (color || 'var(--accent-color)') : 'var(--border-color)',
                color: isActive ? (color || 'var(--accent)') : 'var(--text-secondary)',
                fontWeight: isActive ? 600 : 400, transition: 'all 0.15s' }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', opacity: 0.7 }}>Tags:</span>
          {allTags.map(tag => (
            <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              style={{ fontSize: '0.78rem', padding: '3px 10px', borderRadius: '4px', border: '1px solid', cursor: 'pointer', background: activeTag === tag ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)', borderColor: activeTag === tag ? 'var(--accent-color)' : 'var(--border-color)', color: activeTag === tag ? '#a5b4fc' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
              {tag}
            </button>
          ))}
          {activeTag && <button onClick={() => setActiveTag(null)} style={{ fontSize: '0.78rem', padding: '3px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Clear</button>}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '0.6rem 1rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 500 }}>{selectedIds.size} selected</span>
          {isShopifyConnected && (
            <button className="btn-primary" onClick={handleBulkShopifyPush} disabled={bulkShopifyPushingIds.size > 0}
              style={{ fontSize: '0.8rem', padding: '4px 12px', background: 'linear-gradient(135deg, #96bf48, #5e8e3e)', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {bulkShopifyPushingIds.size > 0 ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <ShoppingBag size={13} />}
              {bulkShopifyPushingIds.size > 0 ? `Pushing ${bulkShopifyPushingIds.size}…` : `Push to Shopify`}
            </button>
          )}
          <button onClick={handleBulkArchive} style={{ fontSize: '0.8rem', padding: '4px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Archive size={13} /> Archive
          </button>
          <button onClick={handleBulkDelete} style={{ fontSize: '0.8rem', padding: '4px 12px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Trash2 size={13} /> Delete
          </button>
          <button onClick={clearSelection} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <input type="text" className="input-base" placeholder="Search by title, SKU, or category..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>
        <div style={{ position: 'relative' }}>
          <select className="input-base" value={sort} onChange={e => setSort(e.target.value as SortOption)} style={{ paddingRight: '2rem', appearance: 'none', cursor: 'pointer', minWidth: '160px' }}>
            <option value="date-desc">Date: Newest First</option>
            <option value="date-asc">Date: Oldest First</option>
            <option value="title-asc">Title: A → Z</option>
            <option value="title-desc">Title: Z → A</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="price-asc">Price: Low → High</option>
          </select>
          <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
        </div>
        {onSyncSold && (
          <button className="btn-icon" title={isEbayConnected ? 'Sync sold items from eBay' : 'Connect to eBay to sync sold items'} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: isEbayConnected ? 'var(--success)' : 'var(--text-secondary)', opacity: isEbayConnected ? 1 : 0.5 }}
            onClick={onSyncSold} disabled={!isEbayConnected}>
            <RefreshCw size={16} /> Sync Sold
          </button>
        )}

        <button className="btn-icon" title="Export CSV" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}
          onClick={() => { exportCsv(listings); toast('CSV exported.', 'success'); }}>
          <Download size={16} /> CSV
        </button>
        <button onClick={selectedIds.size > 0 ? clearSelection : selectAllFiltered}
          style={{ fontSize: '0.8rem', padding: '5px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {selectedIds.size > 0 ? `Deselect All` : `Select All (${filteredListings.length})`}
        </button>
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button onClick={() => setViewMode('grid')} title="Grid view" style={{ padding: '6px 10px', background: viewMode === 'grid' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'grid' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <LayoutGrid size={18} />
          </button>
          <button onClick={() => setViewMode('list')} title="List view" style={{ padding: '6px 10px', background: viewMode === 'list' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'list' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <List size={18} />
          </button>
        </div>
      </div>

      {filteredListings.length === 0 && (
        <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            {search ? `No results for "${search}"` : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}items.`}
          </p>
        </div>
      )}

      {paginatedListings.length > 0 && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {paginatedListings.map(l => renderCard(l, !!l.archived))}
        </div>
      )}
      {paginatedListings.length > 0 && viewMode === 'list' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
          {paginatedListings.map(l => renderListRow(l, !!l.archived))}
          <div style={{ height: '1px' }} />
        </div>
      )}

      {/* Pagination controls */}
      {filteredListings.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center', marginTop: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
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
                Page {currentPage} of {totalPages} · {filteredListings.length} items
              </span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.35 : 1 }}>
                →
              </button>
            </>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
