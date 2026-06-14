// FE-001e — the second toolbar row from StagedListings: result-count
// summary, bulk select/push/delete controls, and the grid/list view toggle.
// Stateless — the parent owns selection state and view mode.

import { LayoutGrid, List, X } from 'lucide-react';

export type ViewMode = 'grid' | 'list';

export interface StagedBulkToolbarProps {
  /** All visible (filtered+sorted) listings, used for the result-count line. */
  visibleCount: number;
  /** Total count before filter, used to render "X of Y" when a search is active. */
  totalCount: number;
  /** Current search query — empty string when no filter. */
  search: string;

  /** Currently selected IDs. */
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkPush: () => void;
  onBulkDelete: () => void;
  /** Disables Push button when true. */
  bulkPushing?: boolean;
  /** Greys out the Push button when eBay isn't connected. */
  isEbayConnected?: boolean;

  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
}

export default function StagedBulkToolbar(props: StagedBulkToolbarProps) {
  const {
    visibleCount, totalCount, search,
    selectedCount, onSelectAll, onClearSelection, onBulkPush, onBulkDelete,
    bulkPushing = false, isEbayConnected = false,
    viewMode, onViewModeChange,
  } = props;

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '0.75rem', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        {visibleCount}{search ? ` of ${totalCount}` : ''} listing{visibleCount !== 1 ? 's' : ''}
        {search && <span style={{ opacity: 0.6 }}> matching "{search}"</span>}
      </span>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {selectedCount === 0 ? (
          <button
            onClick={onSelectAll}
            style={{ fontSize: '0.8rem', padding: '5px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer' }}
          >
            Select All
          </button>
        ) : (
          <>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selectedCount} selected</span>
            <button
              onClick={onBulkPush}
              disabled={bulkPushing}
              className="btn-primary"
              title={!isEbayConnected ? 'Connect to eBay first' : `Push ${selectedCount} to eBay`}
              style={{ fontSize: '0.8rem', padding: '5px 12px', opacity: !isEbayConnected ? 0.5 : 1 }}
            >
              Push {selectedCount} to eBay
            </button>
            <button
              onClick={onBulkDelete}
              style={{ fontSize: '0.8rem', padding: '5px 10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '6px', cursor: 'pointer' }}
            >
              Delete Selected
            </button>
            <button
              onClick={onClearSelection}
              className="btn-icon"
              style={{ padding: '5px' }}
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X size={16} />
            </button>
          </>
        )}
        <button
          onClick={() => onViewModeChange('grid')}
          title="Grid view"
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
          style={{ padding: '6px 10px', background: viewMode === 'grid' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'grid' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <LayoutGrid size={18} />
        </button>
        <button
          onClick={() => onViewModeChange('list')}
          title="List view"
          aria-label="List view"
          aria-pressed={viewMode === 'list'}
          style={{ padding: '6px 10px', background: viewMode === 'list' ? 'var(--glass-bg)' : 'transparent', border: '1px solid', borderColor: viewMode === 'list' ? 'var(--glass-border)' : 'transparent', color: 'var(--text-primary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <List size={18} />
        </button>
      </div>
    </div>
  );
}
