import { Archive, Trash2, X } from 'lucide-react';

export interface ListedBulkToolbarProps {
  selectedCount: number;
  onArchiveSelected: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}

export default function ListedBulkToolbar({ selectedCount, onArchiveSelected, onDeleteSelected, onClearSelection }: ListedBulkToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', padding: '0.6rem 1rem', background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.85rem', color: '#a5b4fc', fontWeight: 500 }}>{selectedCount} selected</span>
      <button onClick={onArchiveSelected} style={{ fontSize: '0.8rem', padding: '4px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Archive size={13} /> Archive
      </button>
      <button onClick={onDeleteSelected} style={{ fontSize: '0.8rem', padding: '4px 12px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Trash2 size={13} /> Delete
      </button>
      <button onClick={onClearSelection} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} aria-label="Clear selected listings">
        <X size={16} />
      </button>
    </div>
  );
}
