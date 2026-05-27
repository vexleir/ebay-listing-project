import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { StagedListing } from '../types';
import Lightbox from './Lightbox';
import { useToast } from '../context/ToastContext';
import CrossPostModal from './CrossPostModal';
import EditListingModal from './EditListingModal';
import { useListFilterSort } from '../hooks/useListFilterSort';
import { autoConditionId, computeHealthScore } from './listings/shared/helpers';
import ListedStatusFilters from './listed/ListedStatusFilters';
import ListedTagFilterBar from './listed/ListedTagFilterBar';
import ListedBulkToolbar from './listed/ListedBulkToolbar';
import ListedToolbar from './listed/ListedToolbar';
import ListedListingCard from './listed/ListedListingCard';
import ListedListingListRow from './listed/ListedListingListRow';
import MarkSoldModal from './listed/MarkSoldModal';
import EndListingConfirmModal from './listed/EndListingConfirmModal';
import DelistRelistModal from './listed/DelistRelistModal';
import OptimizeListingModal, { type OptimizeDimensions, type OptimizeResult } from './listed/OptimizeListingModal';
import {
  compareListed,
  exportListedCsv,
  matchesListedQuery,
  type ListedSortOption,
  type ListedStatusFilter,
  type ListedViewMode,
  type ListingStats,
} from './listed/helpers';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface ListedProductsProps {
  listings: StagedListing[];
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
  onSyncSold?: () => void;
  onRelist?: (listing: StagedListing) => void;
  onDelistRelist?: (listing: StagedListing, options?: { allowOffers?: boolean }) => Promise<{ newDraftId: string } | null>;
  onMoveToStaged?: (listing: StagedListing) => void;
  onMarkSold?: (id: string, soldPrice: string, soldAt: number) => void;
  onUpdateListing?: (updated: StagedListing) => void;
  isEbayConnected?: boolean;
  appPassword?: string;
}

export default function ListedProductsView({
  listings,
  onDelete,
  onArchive,
  onSyncSold,
  onRelist,
  onDelistRelist,
  onMoveToStaged,
  onMarkSold,
  onUpdateListing,
  isEbayConnected,
  appPassword = '',
}: ListedProductsProps) {
  const { toast } = useToast();
  const [sort, setSort] = useState<ListedSortOption>('date-desc');
  const [statusFilter, setStatusFilter] = useState<ListedStatusFilter>('all');
  const [maxHealth, setMaxHealth] = useState<number>(100);
  const [maxHealthInput, setMaxHealthInput] = useState<string>('100');
  const [viewMode, setViewMode] = useState<ListedViewMode>('grid');
  const [editListing, setEditListing] = useState<StagedListing | null>(null);
  const [markSoldModal, setMarkSoldModal] = useState<{ listing: StagedListing; price: string; date: string } | null>(null);
  const [markingSold, setMarkingSold] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState<boolean>(false);
  const [stats, setStats] = useState<Record<string, ListingStats | null>>({});
  const [loadingStatsId, setLoadingStatsId] = useState<string | null>(null);
  const [refreshingImagesId, setRefreshingImagesId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [crossPostListing, setCrossPostListing] = useState<StagedListing | null>(null);
  const [endConfirmId, setEndConfirmId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [delistRelistConfirmId, setDelistRelistConfirmId] = useState<string | null>(null);
  const [delistRelistingId, setDelistRelistingId] = useState<string | null>(null);
  const [delistRelistAllowOffers, setDelistRelistAllowOffers] = useState<boolean>(true);
  const [optimizeAllowOffers, setOptimizeAllowOffers] = useState<boolean>(true);
  const [optimizeListing, setOptimizeListing] = useState<StagedListing | null>(null);
  const [optimizeDescView, setOptimizeDescView] = useState<'html' | 'preview'>('html');
  const [optimizeInstructions, setOptimizeInstructions] = useState('');
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);
  const [optimizeSaving, setOptimizeSaving] = useState(false);
  const [optimizeDimensions, setOptimizeDimensions] = useState<OptimizeDimensions>({
    packageLength: '',
    packageWidth: '',
    packageDepth: '',
    packageWeightLbs: '',
    packageWeightOz: '',
  });

  const pw = appPassword || localStorage.getItem('app_password') || '';

  const nonSold = useMemo(() => listings.filter(l => !l.soldAt), [listings]);
  const allTags = useMemo(() => Array.from(new Set(nonSold.flatMap(l => l.tags || []))), [nonSold]);
  const counts: Record<ListedStatusFilter, number> = useMemo(() => ({
    all: nonSold.length,
    active: nonSold.filter(l => !l.archived).length,
    ended: nonSold.filter(l => l.archived).length,
  }), [nonSold]);

  const filteredByStatusTagHealth = useMemo(() => nonSold
    .filter(l => {
      if (statusFilter === 'active') return !l.archived;
      if (statusFilter === 'ended') return l.archived;
      return true;
    })
    .filter(l => !activeTag || l.tags?.includes(activeTag))
    .filter(l => maxHealth >= 100 || computeHealthScore(l).score <= maxHealth),
  [nonSold, statusFilter, activeTag, maxHealth]);

  const sortComparator = useMemo(() => (a: StagedListing, b: StagedListing) => compareListed(a, b, sort), [sort]);
  const list = useListFilterSort<StagedListing>({
    items: filteredByStatusTagHealth,
    filter: matchesListedQuery,
    sort: sortComparator,
    perPage: 20,
  });
  const search = list.query;
  const setSearch = list.setQuery;
  const perPage = list.perPage;
  const setPerPage = list.setPerPage;
  const currentPage = list.currentPage;
  const setCurrentPage = list.setCurrentPage;
  const filteredListings = list.visible;
  const paginatedListings = list.paginated;
  const totalPages = list.totalPages;

  useEffect(() => { setCurrentPage(1); }, [statusFilter, activeTag, sort, maxHealth, setCurrentPage]);

  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const selectAllFiltered = () => setSelectedIds(new Set(filteredListings.map(l => l.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkArchive = () => {
    Array.from(selectedIds).forEach(id => onArchive(id));
    clearSelection();
    toast(`${selectedIds.size} listings archived.`, 'success');
  };

  const handleBulkDelete = () => {
    Array.from(selectedIds).forEach(id => onDelete(id));
    clearSelection();
  };

  const openMarkSoldModal = (listing: StagedListing) => {
    setMarkSoldModal({ listing, price: listing.priceRecommendation || '', date: new Date().toISOString().split('T')[0] });
  };

  const confirmMarkSold = () => {
    if (!markSoldModal) return;
    setMarkingSold(true);
    const soldAt = markSoldModal.date ? new Date(markSoldModal.date).getTime() : Date.now();
    const soldPrice = markSoldModal.price ? `$${parseFloat(markSoldModal.price).toFixed(2)}` : '';
    onMarkSold?.(markSoldModal.listing.id, soldPrice, soldAt);
    setMarkSoldModal(null);
    setMarkingSold(false);
    toast('Listing marked as sold.', 'success');
  };

  const openOptimizeModal = (listing: StagedListing) => {
    setOptimizeListing(listing);
    setOptimizeResult(null);
    setOptimizeInstructions('');
    setOptimizeDescView('html');
    setOptimizeDimensions({
      packageLength: listing.packageLength || '',
      packageWidth: listing.packageWidth || '',
      packageDepth: listing.packageDepth || '',
      packageWeightLbs: listing.packageWeightLbs || '',
      packageWeightOz: listing.packageWeightOz || '',
    });
  };

  const handleToggleArchive = (listing: StagedListing) => {
    onArchive(listing.id);
    toast(listing.archived ? 'Listing unarchived.' : 'Listing archived.', 'success');
  };

  const handleEndListing = async (listing: StagedListing) => {
    setEnding(true);
    try {
      const resp = await fetch('/api/ebay/end-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
        body: JSON.stringify({ itemId: listing.ebayDraftId }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'End listing failed');
      onArchive(listing.id);
      toast('eBay listing ended and archived.', 'success');
    } catch (e: unknown) {
      toast('End listing failed: ' + getErrorMessage(e), 'error');
    } finally {
      setEnding(false);
      setEndConfirmId(null);
    }
  };

  const handleDelistRelist = async (listing: StagedListing, allowOffers: boolean) => {
    if (!onDelistRelist) return;
    setDelistRelistingId(listing.id);
    try {
      await onDelistRelist(listing, { allowOffers });
    } finally {
      setDelistRelistingId(null);
      setDelistRelistConfirmId(null);
    }
  };

  const handleRefetchImages = async (listing: StagedListing) => {
    if (!listing.ebayDraftId) return;
    setRefreshingImagesId(listing.id);
    try {
      const resp = await fetch(`/api/ebay/refresh-images/${listing.id}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${pw}` },
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Refresh failed');
      onUpdateListing?.({ ...listing, images: data.images, updatedAt: data.updatedAt });
      toast(`Refreshed ${data.images.length} image${data.images.length === 1 ? '' : 's'} from eBay.`, 'success');
    } catch (e: unknown) {
      toast('Image refresh failed: ' + getErrorMessage(e), 'error');
    } finally {
      setRefreshingImagesId(null);
    }
  };

  const fetchStats = async (listing: StagedListing) => {
    if (!listing.ebayDraftId) return;
    setLoadingStatsId(listing.id);
    try {
      const resp = await fetch(`/api/ebay/listing-stats?itemId=${encodeURIComponent(listing.ebayDraftId)}`);
      const data = await resp.json();
      if (data.error) {
        toast('Could not fetch stats: ' + data.error, 'error');
        return;
      }
      setStats(prev => ({ ...prev, [listing.id]: data }));
    } catch (e: unknown) {
      toast('Stats fetch failed: ' + getErrorMessage(e), 'error');
    } finally {
      setLoadingStatsId(null);
    }
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
      const origPrice = String(optimizeListing.priceRecommendation || '').replace(/[^0-9.]/g, '');
      const aiSuggestedPrice = String(data.priceRecommendation || '').replace(/[^0-9.]/g, '');
      setOptimizeResult({ ...data, aiSuggestedPrice, priceRecommendation: origPrice });
    } catch (e: unknown) {
      toast('AI optimization failed: ' + getErrorMessage(e), 'error');
    } finally {
      setOptimizing(false);
    }
  };

  const resetOptimizeModal = () => {
    setOptimizeListing(null);
    setOptimizeResult(null);
    setOptimizeInstructions('');
  };

  const handleSaveOptimized = async (pushEbay: boolean, delistAndRelist: boolean = false) => {
    if (!optimizeListing || !optimizeResult) return;
    setOptimizeSaving(true);
    const updated: StagedListing = {
      ...optimizeListing,
      title: optimizeResult.title || optimizeListing.title,
      description: optimizeResult.description || optimizeListing.description,
      priceRecommendation: optimizeResult.priceRecommendation || optimizeListing.priceRecommendation,
      category: optimizeResult.category || optimizeListing.category,
      condition: optimizeResult.condition || optimizeListing.condition,
      itemSpecifics: {
        ...(optimizeListing.itemSpecifics || {}),
        ...Object.fromEntries(Object.entries(optimizeResult.itemSpecifics || {}).map(([name, value]) => [name, String(value)])),
      },
      tags: Array.isArray(optimizeResult.tags)
        ? optimizeResult.tags
        : optimizeResult.tags
          ? String(optimizeResult.tags).split(',').map(tag => tag.trim()).filter(Boolean)
          : optimizeListing.tags,
      seoKeywords: optimizeResult.seoKeywords || optimizeListing.seoKeywords || '',
      packageLength: optimizeDimensions.packageLength,
      packageWidth: optimizeDimensions.packageWidth,
      packageDepth: optimizeDimensions.packageDepth,
      packageWeightLbs: optimizeDimensions.packageWeightLbs,
      packageWeightOz: optimizeDimensions.packageWeightOz,
      updatedAt: Date.now(),
    };
    try {
      const saveResp = await fetch(`/api/listings/${optimizeListing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
        body: JSON.stringify({ updates: updated }),
      });
      if (!saveResp.ok) {
        const data = await saveResp.json();
        throw new Error(data.error || 'Save failed');
      }
      onUpdateListing?.(updated);

      if (delistAndRelist && optimizeListing.ebayDraftId && onDelistRelist) {
        const result = await onDelistRelist(updated, { allowOffers: optimizeAllowOffers });
        if (!result) throw new Error('Delist & relist failed');
        resetOptimizeModal();
        return;
      }

      if (pushEbay && optimizeListing.ebayDraftId) {
        const conditionId = autoConditionId(updated.condition || '');
        const specifics = Object.entries(updated.itemSpecifics || {}).map(([name, value]) => ({ name, value: String(value) }));
        const reviseResp = await fetch('/api/ebay/revise', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${pw}` },
          body: JSON.stringify({
            itemId: optimizeListing.ebayDraftId,
            newTitle: updated.title,
            newPrice: String(updated.priceRecommendation || '').replace(/[^0-9.]/g, ''),
            description: updated.description,
            conditionId,
            itemSpecifics: specifics,
          }),
        });
        const reviseData = await reviseResp.json();
        if (!reviseResp.ok || reviseData.error) throw new Error('eBay revise failed: ' + reviseData.error);
        if (reviseData.warning) {
          toast(`Listing optimized and pushed to eBay. Note: ${reviseData.warning}`, 'info');
          resetOptimizeModal();
          return;
        }
      }

      toast(`Listing optimized${pushEbay ? ' and pushed to eBay' : ''}!`, 'success');
      resetOptimizeModal();
    } catch (e: unknown) {
      toast(getErrorMessage(e), 'error');
    } finally {
      setOptimizeSaving(false);
    }
  };

  const endConfirmListing = endConfirmId ? listings.find(listing => listing.id === endConfirmId) : null;
  const delistRelistListing = delistRelistConfirmId ? listings.find(listing => listing.id === delistRelistConfirmId) : null;

  if (nonSold.length === 0) {
    return (
      <div className="glass-panel" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>No Listed Items</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Items you push to eBay will appear here.</p>
      </div>
    );
  }

  return (
    <div>
      {lightboxImages && createPortal(<Lightbox images={lightboxImages} index={lightboxIndex} onClose={() => setLightboxImages(null)} onNavigate={setLightboxIndex} />, document.body)}
      {crossPostListing && <CrossPostModal listing={crossPostListing} onClose={() => setCrossPostListing(null)} />}

      {editListing && (
        <EditListingModal
          listing={editListing}
          appPassword={appPassword}
          onClose={() => setEditListing(null)}
          onSaved={updated => { setEditListing(null); onUpdateListing?.(updated); }}
        />
      )}

      {markSoldModal && (
        <MarkSoldModal
          price={markSoldModal.price}
          date={markSoldModal.date}
          markingSold={markingSold}
          onPriceChange={price => setMarkSoldModal(prev => prev ? { ...prev, price } : null)}
          onDateChange={date => setMarkSoldModal(prev => prev ? { ...prev, date } : null)}
          onClose={() => setMarkSoldModal(null)}
          onConfirm={confirmMarkSold}
        />
      )}

      {endConfirmListing && (
        <EndListingConfirmModal
          ending={ending}
          onClose={() => setEndConfirmId(null)}
          onConfirm={() => handleEndListing(endConfirmListing)}
        />
      )}

      {delistRelistListing && (
        <DelistRelistModal
          allowOffers={delistRelistAllowOffers}
          working={!!delistRelistingId}
          onAllowOffersChange={setDelistRelistAllowOffers}
          onClose={() => setDelistRelistConfirmId(null)}
          onConfirm={() => handleDelistRelist(delistRelistListing, delistRelistAllowOffers)}
        />
      )}

      {optimizeListing && (
        <OptimizeListingModal
          listing={optimizeListing}
          result={optimizeResult}
          instructions={optimizeInstructions}
          descView={optimizeDescView}
          optimizing={optimizing}
          saving={optimizeSaving}
          dimensions={optimizeDimensions}
          allowOffers={optimizeAllowOffers}
          canDelistRelist={!!onDelistRelist}
          onClose={() => setOptimizeListing(null)}
          onInstructionsChange={setOptimizeInstructions}
          onDescViewChange={setOptimizeDescView}
          onGenerate={handleOptimize}
          onResultChange={setOptimizeResult}
          onDimensionsChange={setOptimizeDimensions}
          onAllowOffersChange={setOptimizeAllowOffers}
          onSave={handleSaveOptimized}
        />
      )}

      <ListedStatusFilters statusFilter={statusFilter} counts={counts} onStatusFilterChange={setStatusFilter} />
      <ListedTagFilterBar
        tags={allTags}
        activeTag={activeTag}
        expanded={tagsExpanded}
        onExpandedChange={setTagsExpanded}
        onActiveTagChange={setActiveTag}
      />
      <ListedBulkToolbar
        selectedCount={selectedIds.size}
        onArchiveSelected={handleBulkArchive}
        onDeleteSelected={handleBulkDelete}
        onClearSelection={clearSelection}
      />
      <ListedToolbar
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        maxHealth={maxHealth}
        maxHealthInput={maxHealthInput}
        onMaxHealthChange={setMaxHealth}
        onMaxHealthInputChange={setMaxHealthInput}
        onSyncSold={onSyncSold}
        isEbayConnected={isEbayConnected}
        onExportCsv={() => { exportListedCsv(listings); toast('CSV exported.', 'success'); }}
        selectedCount={selectedIds.size}
        filteredCount={filteredListings.length}
        onSelectAllFiltered={selectAllFiltered}
        onClearSelection={clearSelection}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {filteredListings.length === 0 && (
        <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
          <p style={{ color: 'var(--text-secondary)' }}>
            {search ? `No results for "${search}"` : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}items.`}
          </p>
        </div>
      )}

      {paginatedListings.length > 0 && viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
          {paginatedListings.map(listing => (
            <ListedListingCard
              key={listing.id}
              listing={listing}
              isArchived={!!listing.archived}
              isSelected={selectedIds.has(listing.id)}
              isEbayConnected={isEbayConnected}
              stats={stats[listing.id]}
              loadingStats={loadingStatsId === listing.id}
              refreshingImages={refreshingImagesId === listing.id}
              delistRelisting={delistRelistingId === listing.id}
              onToggleSelect={toggleSelect}
              onOpenLightbox={(images, index) => { setLightboxImages(images); setLightboxIndex(index); }}
              onRefreshImages={handleRefetchImages}
              onRelist={onRelist}
              onMoveToStaged={onMoveToStaged}
              onMarkSold={onMarkSold ? openMarkSoldModal : undefined}
              onOptimize={openOptimizeModal}
              onEdit={setEditListing}
              onDelistRelist={onDelistRelist ? l => setDelistRelistConfirmId(l.id) : undefined}
              onEndListing={l => setEndConfirmId(l.id)}
              onFetchStats={fetchStats}
              onCrossPost={setCrossPostListing}
              onToggleArchive={handleToggleArchive}
              onDelete={l => onDelete(l.id)}
            />
          ))}
        </div>
      )}

      {paginatedListings.length > 0 && viewMode === 'list' && (
        <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
          {paginatedListings.map(listing => (
            <ListedListingListRow
              key={listing.id}
              listing={listing}
              isArchived={!!listing.archived}
              isSelected={selectedIds.has(listing.id)}
              stats={stats[listing.id]}
              loadingStats={loadingStatsId === listing.id}
              delistRelisting={delistRelistingId === listing.id}
              onToggleSelect={toggleSelect}
              onOpenLightbox={(images, index) => { setLightboxImages(images); setLightboxIndex(index); }}
              onMoveToStaged={onMoveToStaged}
              onMarkSold={onMarkSold ? openMarkSoldModal : undefined}
              onOptimize={openOptimizeModal}
              onEdit={setEditListing}
              onFetchStats={fetchStats}
              onDelistRelist={onDelistRelist ? l => setDelistRelistConfirmId(l.id) : undefined}
              onCrossPost={setCrossPostListing}
              onToggleArchive={handleToggleArchive}
              onDelete={l => onDelete(l.id)}
            />
          ))}
          <div style={{ height: '1px' }} />
        </div>
      )}

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
                &larr;
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Page {currentPage} of {totalPages} - {filteredListings.length} items
              </span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-primary)', cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.35 : 1 }}>
                &rarr;
              </button>
            </>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
