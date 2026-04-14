import { useState, useMemo } from 'react';
import { Download, RefreshCw, CheckSquare, Square, ChevronRight, ExternalLink, ArrowRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import type { StagedListing } from '../types';

interface EbayActiveItem {
  ebayItemId: string;
  title: string;
  price: string;
  condition: string;
  categoryId: string;
  categoryName: string;
  images: string[];
  endTime: string;
  quantity: string;
  quantitySold: string;
}

interface EbayImportTabProps {
  appPassword: string;
  isEbayConnected: boolean;
  onImported: (listings: StagedListing[]) => void;
}

export default function EbayImportTab({ appPassword, isEbayConnected, onImported }: EbayImportTabProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<EbayActiveItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFetching, setIsFetching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState<{ page: number; totalPages: number; totalEntries: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasFetched, setHasFetched] = useState(false);

  const bearerHeaders = () => ({ Authorization: `Bearer ${appPassword}` });
  const apiHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${appPassword}` });

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(i => i.title.toLowerCase().includes(q) || i.ebayItemId.includes(q) || i.categoryName.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const handleFetchAll = async () => {
    if (!isEbayConnected) { toast('Connect to eBay first.', 'error'); return; }
    setIsFetching(true);
    setItems([]);
    setSelectedIds(new Set());
    setHasFetched(false);

    try {
      let page = 1;
      let totalPages = 1;
      let totalEntries = 0;
      const allItems: EbayActiveItem[] = [];

      do {
        setFetchProgress({ page, totalPages, totalEntries });
        const resp = await fetch(`/api/ebay/active-listings?page=${page}`, { headers: bearerHeaders() });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: resp.statusText }));
          throw new Error(err.error || 'Failed to fetch listings');
        }
        const data = await resp.json();
        totalPages = data.totalPages || 1;
        totalEntries = data.totalEntries || 0;
        allItems.push(...(data.items || []));
        setFetchProgress({ page, totalPages, totalEntries });
        page++;
      } while (page <= totalPages);

      setItems(allItems);
      // Pre-select all by default
      setSelectedIds(new Set(allItems.map(i => i.ebayItemId)));
      setHasFetched(true);
      toast(`Fetched ${allItems.length} active listings from eBay.`, 'success');
    } catch (e: any) {
      toast('Fetch error: ' + e.message, 'error');
    } finally {
      setIsFetching(false);
      setFetchProgress(null);
    }
  };

  const toggleItem = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.ebayItemId)));
    }
  };

  const handleImport = async () => {
    const toImport = items.filter(i => selectedIds.has(i.ebayItemId));
    if (toImport.length === 0) { toast('No listings selected.', 'error'); return; }

    setIsImporting(true);
    try {
      const resp = await fetch('/api/ebay/import-listings', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ listings: toImport }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'Import failed');
      }
      const data = await resp.json();
      if (data.imported > 0) {
        onImported(data.listings as StagedListing[]);
        toast(`Imported ${data.imported} listing${data.imported !== 1 ? 's' : ''} to Listed tab${data.skipped > 0 ? ` (${data.skipped} already existed)` : ''}.`, 'success');
      } else {
        toast(`All ${data.skipped} selected listings already exist in your Listed tab.`, 'info');
      }
    } catch (e: any) {
      toast('Import error: ' + e.message, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every(i => selectedIds.has(i.ebayItemId));

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>eBay Active Listings Import</h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Fetch your active eBay listings and import them into the Listed tab. Review them here first.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn-primary"
            onClick={handleFetchAll}
            disabled={isFetching || !isEbayConnected}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={16} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
            {isFetching ? 'Fetching…' : hasFetched ? 'Re-fetch from eBay' : 'Fetch Active Listings'}
          </button>
          {hasFetched && (
            <button
              className="btn-primary"
              onClick={handleImport}
              disabled={isImporting || selectedIds.size === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              <ArrowRight size={16} />
              {isImporting ? 'Importing…' : `Import ${selectedIds.size} to Listed Tab`}
            </button>
          )}
        </div>
      </div>

      {/* Not connected warning */}
      {!isEbayConnected && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '1rem', color: '#ef4444', marginBottom: '1.5rem' }}>
          Connect to eBay first before fetching listings.
        </div>
      )}

      {/* Fetch progress */}
      {isFetching && fetchProgress && (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <span>Fetching page {fetchProgress.page} of {fetchProgress.totalPages}…</span>
            <span>{fetchProgress.totalEntries} total listings on eBay</span>
          </div>
          <div style={{ height: '6px', background: 'var(--border-color)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              background: 'linear-gradient(90deg, #a855f7, #6366f1)',
              borderRadius: '3px',
              width: `${Math.round((fetchProgress.page / fetchProgress.totalPages) * 100)}%`,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Results */}
      {hasFetched && !isFetching && (
        <>
          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={toggleAll}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem' }}
              >
                {allFilteredSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                {allFilteredSelected ? 'Deselect All' : 'Select All'}
              </button>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                {selectedIds.size} of {items.length} selected
              </span>
            </div>
            <input
              type="text"
              placeholder="Filter by title, item ID, or category…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--glass-bg)', color: 'var(--text-primary)', fontSize: '0.875rem', width: '280px' }}
            />
          </div>

          {/* Table */}
          <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', overflow: 'hidden' }}>
            {/* Table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '40px 60px 1fr 120px 130px 80px 80px', gap: '0', borderBottom: '1px solid var(--border-color)', padding: '0.6rem 1rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <div></div>
              <div>Image</div>
              <div>Title / Category</div>
              <div>Condition</div>
              <div style={{ textAlign: 'right' }}>Price</div>
              <div style={{ textAlign: 'center' }}>Qty</div>
              <div style={{ textAlign: 'center' }}>Link</div>
            </div>

            {/* Rows */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {filteredItems.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  {searchQuery ? 'No listings match your filter.' : 'No listings found.'}
                </div>
              ) : filteredItems.map((item, idx) => {
                const isSelected = selectedIds.has(item.ebayItemId);
                return (
                  <div
                    key={item.ebayItemId}
                    onClick={() => toggleItem(item.ebayItemId)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 60px 1fr 120px 130px 80px 80px',
                      gap: '0',
                      padding: '0.6rem 1rem',
                      borderBottom: idx < filteredItems.length - 1 ? '1px solid var(--border-color)' : 'none',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(99,102,241,0.06)' : 'transparent',
                      alignItems: 'center',
                      transition: 'background 0.15s',
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{ color: isSelected ? '#6366f1' : 'var(--text-secondary)' }}>
                      {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                    </div>

                    {/* Thumbnail */}
                    <div>
                      {item.images[0] ? (
                        <img src={item.images[0]} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                      ) : (
                        <div style={{ width: '48px', height: '48px', borderRadius: '6px', background: 'var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-secondary)' }}>No img</div>
                      )}
                    </div>

                    {/* Title / Category */}
                    <div style={{ minWidth: 0, paddingRight: '0.75rem' }}>
                      <div style={{ fontWeight: 500, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {item.categoryName || '—'} · #{item.ebayItemId}
                      </div>
                    </div>

                    {/* Condition */}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.condition || '—'}</div>

                    {/* Price */}
                    <div style={{ textAlign: 'right', fontWeight: 600, fontSize: '0.9rem' }}>
                      {item.price ? `$${parseFloat(item.price).toFixed(2)}` : '—'}
                    </div>

                    {/* Qty */}
                    <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      {item.quantity}
                      {parseInt(item.quantitySold) > 0 && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--success)', display: 'block' }}>({item.quantitySold} sold)</span>
                      )}
                    </div>

                    {/* eBay link */}
                    <div style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                      <a
                        href={`https://www.ebay.com/itm/${item.ebayItemId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--text-secondary)', display: 'inline-flex' }}
                        title="View on eBay"
                      >
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer action */}
          {selectedIds.size > 0 && (
            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn-primary"
                onClick={handleImport}
                disabled={isImporting}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'linear-gradient(135deg, #10b981, #059669)', fontSize: '1rem', padding: '10px 20px' }}
              >
                <Download size={16} />
                {isImporting ? 'Importing…' : `Import ${selectedIds.size} Selected Listing${selectedIds.size !== 1 ? 's' : ''} to Listed Tab`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty state before fetching */}
      {!hasFetched && !isFetching && (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-secondary)' }}>
          <Download size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
          <p style={{ fontSize: '1rem', margin: 0 }}>Click <strong>Fetch Active Listings</strong> to pull your current eBay inventory.</p>
          <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.7 }}>All active listings will be shown here. Select the ones you want to import, then click Import.</p>
        </div>
      )}
    </div>
  );
}
