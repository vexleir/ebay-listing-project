import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, Download, Check, AlertTriangle, Package } from 'lucide-react';

interface ScanItem {
  itemId: string;
  title: string;
  price: string;
  conditionId: string;
  images: string[];
  startTime?: string;
  soldDate?: string;
  endTime?: string;
  status: 'active' | 'sold' | 'ended';
  alreadyImported: boolean;
}

interface ScanResults {
  active: ScanItem[];
  sold: ScanItem[];
  ended: ScanItem[];
}

interface ImportModalProps {
  appPassword: string;
  isEbayConnected?: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return '';
  }
}

function formatPrice(price: string | undefined): string {
  const n = parseFloat(price || '0');
  return n > 0 ? `$${n.toFixed(2)}` : '—';
}

export default function ImportModal({ appPassword, isEbayConnected, onClose, onImportComplete }: ImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [results, setResults] = useState<ScanResults | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'sold' | 'ended'>('active');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; failed: { itemId: string; title: string; reason: string }[] } | null>(null);

  const headers = { 'Authorization': `Bearer ${appPassword}` };
  const jsonHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${appPassword}` };

  const scan = async () => {
    setScanError('');
    setScanning(true);
    try {
      const res = await fetch('/api/ebay/import/scan', { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setResults(data);

      // Pre-select all items that haven't been imported yet
      const autoSelect = new Set<string>();
      for (const item of [...data.active, ...data.sold, ...data.ended]) {
        if (!item.alreadyImported && item.itemId) autoSelect.add(item.itemId);
      }
      setSelected(autoSelect);

      // Set default tab to first non-empty type
      if (data.active.length > 0) setActiveTab('active');
      else if (data.sold.length > 0) setActiveTab('sold');
      else if (data.ended.length > 0) setActiveTab('ended');

      setStep(2);
    } catch (e: any) {
      setScanError(e.message);
    } finally {
      setScanning(false);
    }
  };

  const toggleItem = (itemId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  const selectAll = (items: ScanItem[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      items.forEach(i => { if (i.itemId) next.add(i.itemId); });
      return next;
    });
  };

  const deselectAll = (items: ScanItem[]) => {
    setSelected(prev => {
      const next = new Set(prev);
      items.forEach(i => next.delete(i.itemId));
      return next;
    });
  };

  const executeImport = async () => {
    if (!results || selected.size === 0) return;
    const allItems = [...results.active, ...results.sold, ...results.ended];
    const toImport = allItems.filter(i => selected.has(i.itemId));

    setStep(3);
    try {
      const res = await fetch('/api/ebay/import/execute', {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({ items: toImport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setImportResult(data);
      setStep(4);
    } catch (e: any) {
      setImportResult({ imported: 0, skipped: 0, failed: [{ itemId: '', title: '', reason: e.message }] });
      setStep(4);
    } finally {

    }
  };

  const currentItems = results ? results[activeTab] : [];
  const currentTabSelected = currentItems.filter(i => selected.has(i.itemId)).length;
  const totalSelected = selected.size;

  const tabLabel = (key: 'active' | 'sold' | 'ended', label: string) => {
    const count = results?.[key]?.length ?? 0;
    return (
      <button
        key={key}
        onClick={() => setActiveTab(key)}
        style={{
          padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '0.85rem', fontWeight: activeTab === key ? 600 : 400,
          color: activeTab === key ? 'var(--accent-color)' : 'var(--text-secondary)',
          borderBottom: activeTab === key ? '2px solid var(--accent-color)' : '2px solid transparent',
          marginBottom: '-1px', whiteSpace: 'nowrap',
        }}
      >
        {label} {count > 0 ? <span style={{ opacity: 0.7 }}>({count})</span> : ''}
      </button>
    );
  };

  const renderItem = (item: ScanItem) => {
    const isChecked = selected.has(item.itemId);
    const dateStr = item.status === 'sold' ? formatDate(item.soldDate) : item.status === 'ended' ? formatDate(item.endTime) : formatDate(item.startTime);
    const label = item.status === 'sold' ? 'Sold' : item.status === 'ended' ? 'Ended' : 'Listed';
    const dateLabel = item.status === 'sold' ? 'Sold' : item.status === 'ended' ? 'Ended' : 'Listed';

    return (
      <div
        key={item.itemId}
        onClick={() => toggleItem(item.itemId)}
        style={{
          display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
          borderBottom: '1px solid var(--border-color)', cursor: 'pointer',
          background: isChecked ? 'rgba(99,102,241,0.06)' : 'transparent',
          opacity: item.alreadyImported && !isChecked ? 0.55 : 1,
          transition: 'background 0.1s',
        }}
      >
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => toggleItem(item.itemId)}
          onClick={e => e.stopPropagation()}
          style={{ flexShrink: 0, cursor: 'pointer', width: '16px', height: '16px' }}
        />
        {item.images[0]
          ? <img src={item.images[0]} alt="" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '5px', flexShrink: 0 }} />
          : <div style={{ width: '48px', height: '48px', borderRadius: '5px', background: 'rgba(255,255,255,0.06)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Package size={20} color="var(--text-secondary)" /></div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
          <div style={{ display: 'flex', gap: '10px', marginTop: '3px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: item.status === 'sold' ? 'var(--success)' : 'var(--text-secondary)' }}>{formatPrice(item.price)}</span>
            {dateStr && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.7 }}>{dateLabel}: {dateStr}</span>}
            {item.alreadyImported && (
              <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                Already imported
              </span>
            )}
          </div>
        </div>
        <span style={{ fontSize: '0.72rem', padding: '2px 7px', borderRadius: '4px', background: item.status === 'active' ? 'rgba(34,197,94,0.12)' : item.status === 'sold' ? 'rgba(99,102,241,0.12)' : 'rgba(107,114,128,0.12)', color: item.status === 'active' ? '#22c55e' : item.status === 'sold' ? '#818cf8' : 'var(--text-secondary)', flexShrink: 0 }}>
          {label}
        </span>
      </div>
    );
  };

  return createPortal(
    <div
      onClick={step === 3 ? undefined : onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        className="glass-panel"
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={16} style={{ color: 'var(--accent-color)' }} /> Import from eBay
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Bring your existing eBay listings into FlipSide
            </p>
          </div>
          {step !== 3 && <button onClick={onClose} className="btn-icon"><X size={18} /></button>}
        </div>

        {/* Step 1 — Scan */}
        {step === 1 && (
          <div style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {!isEbayConnected && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', fontSize: '0.85rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={15} /> Connect your eBay account first before importing.
              </div>
            )}
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              This will scan your eBay account and show up to 200 listings per category.
              You'll choose which ones to import before anything is saved.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              {([
                { label: 'Active Listings', sub: 'Currently live on eBay', color: '#22c55e' },
                { label: 'Sold (60 days)', sub: 'Marked sold in your account', color: '#818cf8' },
                { label: 'Ended (60 days)', sub: 'Expired or ended without sale', color: 'var(--text-secondary)' },
              ] as const).map(({ label, sub, color }) => (
                <div key={label} style={{ padding: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 600, color }}>{label}</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.8 }}>{sub}</p>
                </div>
              ))}
            </div>
            {scanError && <p style={{ color: '#ef4444', margin: 0, fontSize: '0.85rem' }}>{scanError}</p>}
            <button
              className="btn-primary"
              onClick={scan}
              disabled={scanning || !isEbayConnected}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '0.9rem', padding: '12px' }}
            >
              {scanning
                ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Scanning eBay…</>
                : <><Download size={15} /> Scan My eBay Listings</>}
            </button>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Step 2 — Review & Select */}
        {step === 2 && results && (
          <>
            {/* Tab bar */}
            <div style={{ display: 'flex', padding: '0 1.5rem', borderBottom: '1px solid var(--border-color)', gap: '4px', overflowX: 'auto', flexShrink: 0 }}>
              {tabLabel('active', 'Active')}
              {tabLabel('sold', 'Sold')}
              {tabLabel('ended', 'Ended')}
            </div>

            {/* Tab toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 1.5rem', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {currentTabSelected}/{currentItems.length} selected on this tab
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-icon" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => selectAll(currentItems)}>Select All</button>
                <button className="btn-icon" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => deselectAll(currentItems)}>Deselect All</button>
              </div>
            </div>

            {/* Item list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {currentItems.length === 0
                ? <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No {activeTab} listings found.</p>
                : currentItems.map(renderItem)
              }
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '1rem' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {totalSelected} item{totalSelected !== 1 ? 's' : ''} selected for import
              </span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn-secondary" onClick={() => setStep(1)} style={{ fontSize: '0.85rem' }}>Back</button>
                <button
                  className="btn-primary"
                  onClick={executeImport}
                  disabled={totalSelected === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 20px' }}
                >
                  <Download size={14} /> Import {totalSelected} Listing{totalSelected !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Step 3 — Importing */}
        {step === 3 && (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
            <RefreshCw size={32} style={{ color: 'var(--accent-color)', animation: 'spin 1s linear infinite' }} />
            <div>
              <p style={{ margin: '0 0 6px 0', fontSize: '1rem', fontWeight: 600 }}>Importing {totalSelected} listings…</p>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Fetching full details from eBay. This may take a moment for large batches.
              </p>
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Step 4 — Done */}
        {step === 4 && importResult && (
          <div style={{ padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ padding: '1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '8px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '1.6rem', fontWeight: 700, color: '#22c55e' }}>{importResult.imported}</p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Successfully imported</p>
              </div>
              <div style={{ padding: '1rem', background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.2)', borderRadius: '8px', textAlign: 'center' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{importResult.skipped}</p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Failed / skipped</p>
              </div>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Active listings appear in your <strong>Listed</strong> tab. Ended listings appear in <strong>Staged</strong>. Sold items are in Listed (archived).
            </p>
            {importResult.failed.length > 0 && (
              <details style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <summary style={{ cursor: 'pointer', marginBottom: '6px' }}>
                  <AlertTriangle size={13} style={{ display: 'inline', marginRight: '4px', color: '#f59e0b' }} />
                  {importResult.failed.length} item{importResult.failed.length !== 1 ? 's' : ''} had errors
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '8px' }}>
                  {importResult.failed.map((f, i) => (
                    <p key={i} style={{ margin: 0, opacity: 0.8 }}>{f.title || f.itemId}: {f.reason}</p>
                  ))}
                </div>
              </details>
            )}
            <button
              className="btn-primary"
              onClick={() => { onImportComplete(); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.9rem', padding: '10px' }}
            >
              <Check size={15} /> Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
