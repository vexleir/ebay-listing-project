import { ChevronDown, Download, LayoutGrid, List, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
import type { ListedSortOption, ListedViewMode } from './helpers';

export interface ListedToolbarProps {
  search: string;
  onSearchChange: (search: string) => void;
  sort: ListedSortOption;
  onSortChange: (sort: ListedSortOption) => void;
  maxHealth: number;
  maxHealthInput: string;
  onMaxHealthChange: (score: number) => void;
  onMaxHealthInputChange: (value: string) => void;
  onSyncSold?: () => void;
  isEbayConnected?: boolean;
  onExportCsv: () => void;
  selectedCount: number;
  filteredCount: number;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  viewMode: ListedViewMode;
  onViewModeChange: (mode: ListedViewMode) => void;
}

export default function ListedToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  maxHealth,
  maxHealthInput,
  onMaxHealthChange,
  onMaxHealthInputChange,
  onSyncSold,
  isEbayConnected,
  onExportCsv,
  selectedCount,
  filteredCount,
  onSelectAllFiltered,
  onClearSelection,
  viewMode,
  onViewModeChange,
}: ListedToolbarProps) {
  const applyMaxHealthInput = (raw: string) => {
    onMaxHealthInputChange(raw);
    if (raw === '') return;
    const value = parseInt(raw, 10);
    if (!Number.isNaN(value)) onMaxHealthChange(Math.max(0, Math.min(100, value)));
  };

  const commitMaxHealthInput = () => {
    const value = parseInt(maxHealthInput, 10);
    if (Number.isNaN(value)) {
      onMaxHealthChange(100);
      onMaxHealthInputChange('100');
      return;
    }
    const clamped = Math.max(0, Math.min(100, value));
    onMaxHealthChange(clamped);
    onMaxHealthInputChange(String(clamped));
  };

  const resetMaxHealth = () => {
    onMaxHealthChange(100);
    onMaxHealthInputChange('100');
  };

  return (
    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
        <input
          type="text"
          className="input-base"
          placeholder="Search by title, SKU, or category..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ paddingLeft: '36px' }}
        />
      </div>
      <div style={{ position: 'relative' }}>
        <select className="input-base" value={sort} onChange={(e) => onSortChange(e.target.value as ListedSortOption)} style={{ paddingRight: '2rem', appearance: 'none', cursor: 'pointer', minWidth: '160px' }}>
          <option value="date-desc">Date: Newest First</option>
          <option value="date-asc">Date: Oldest First</option>
          <option value="title-asc">Title: A to Z</option>
          <option value="title-desc">Title: Z to A</option>
          <option value="price-desc">Price: High to Low</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="health-asc">Health: Low to High</option>
          <option value="health-desc">Health: High to Low</option>
        </select>
        <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }} />
      </div>
      <div
        title="Show only listings whose health score is at or below this value (100 = show all)"
        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px', height: '38px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--glass-bg)' }}
      >
        <ShieldAlert size={14} style={{ color: maxHealth >= 100 ? 'var(--text-secondary)' : '#f59e0b' }} />
        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Health &lt;=</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          value={maxHealthInput}
          onChange={(e) => applyMaxHealthInput(e.target.value)}
          onBlur={commitMaxHealthInput}
          onFocus={(e) => e.target.select()}
          style={{ width: '52px', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'right' }}
        />
        {maxHealth < 100 && (
          <button onClick={resetMaxHealth} title="Reset" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}>
            <X size={13} />
          </button>
        )}
      </div>
      {onSyncSold && (
        <button
          className="btn-icon"
          title={isEbayConnected ? 'Sync sold items from eBay' : 'Connect to eBay to sync sold items'}
          style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: isEbayConnected ? 'var(--success)' : 'var(--text-secondary)', opacity: isEbayConnected ? 1 : 0.5 }}
          onClick={onSyncSold}
          disabled={!isEbayConnected}
        >
          <RefreshCw size={16} /> Sync Sold
        </button>
      )}
      <button className="btn-icon" title="Export CSV" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '9px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }} onClick={onExportCsv}>
        <Download size={16} /> CSV
      </button>
      <button
        onClick={selectedCount > 0 ? onClearSelection : onSelectAllFiltered}
        style={{ fontSize: '0.8rem', padding: '5px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        {selectedCount > 0 ? 'Deselect All' : `Select All (${filteredCount})`}
      </button>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <button onClick={() => onViewModeChange('grid')} title="Grid view" style={{ padding: '6px 10px', background: viewMode === 'grid' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'grid' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <LayoutGrid size={18} />
        </button>
        <button onClick={() => onViewModeChange('list')} title="List view" style={{ padding: '6px 10px', background: viewMode === 'list' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'list' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
          <List size={18} />
        </button>
      </div>
    </div>
  );
}
