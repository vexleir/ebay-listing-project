// P1.3 — the Merge / Split / Move-Items modals extracted from
// ContainerManagement's detail view. Stateless: the parent owns the
// open flags, the field values, and the confirm handlers; this component
// just renders whichever modal is open and proxies the inputs back up.

import type { ContainerRecord } from './ContainerList';

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalContentStyle: React.CSSProperties = {
  background: 'var(--card-bg, #1e1e2e)',
  borderRadius: '12px',
  padding: '1.5rem',
  width: '90%',
  maxWidth: '440px',
  border: '1px solid var(--border-color)',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'var(--glass-bg)',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  marginTop: '6px',
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: 'none',
  background: 'linear-gradient(135deg, #a855f7, #6366f1)',
  color: '#fff',
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'transparent',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  cursor: 'pointer',
};

export interface ContainerActionModalsProps {
  container: ContainerRecord;
  // Sibling containers to populate the target dropdowns (parent already has
  // the full list; we filter out self + archived here).
  containers: ContainerRecord[];

  // Merge
  mergeOpen: boolean;
  mergeTargetId: string;
  onMergeTargetChange: (id: string) => void;
  onMergeConfirm: () => void;
  onMergeClose: () => void;

  // Split
  splitOpen: boolean;
  splitNames: string;
  onSplitNamesChange: (names: string) => void;
  onSplitConfirm: () => void;
  onSplitClose: () => void;

  // Move items
  moveOpen: boolean;
  moveTargetId: string;
  onMoveTargetChange: (id: string) => void;
  moveItemIds: string;
  onMoveItemIdsChange: (ids: string) => void;
  onMoveConfirm: () => void;
  onMoveClose: () => void;
}

export default function ContainerActionModals(props: ContainerActionModalsProps) {
  const { container: c, containers } = props;
  const targets = containers.filter(ct => ct.id !== c.id && ct.status !== 'Archived');

  return (
    <>
      {/* ─── Merge Modal ─────────────────────────────────────────── */}
      {props.mergeOpen && (
        <div style={modalOverlayStyle} onClick={props.onMergeClose}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Merge Container</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Merge "{c.name}" into another container. All items, aliases, and history will be transferred to the target.
            </p>
            <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Target Container ID</label>
            <select value={props.mergeTargetId} onChange={e => props.onMergeTargetChange(e.target.value)} style={inputStyle}>
              <option value="">Select target...</option>
              {targets.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={props.onMergeClose} style={btnSecondary}>Cancel</button>
              <button onClick={props.onMergeConfirm} disabled={!props.mergeTargetId} style={{ ...btnPrimary, opacity: props.mergeTargetId ? 1 : 0.5 }}>Merge</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Split Modal ─────────────────────────────────────────── */}
      {props.splitOpen && (
        <div style={modalOverlayStyle} onClick={props.onSplitClose}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Split Container</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Create new containers from "{c.name}". Enter comma-separated names for the new containers.
            </p>
            <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>New Container Names</label>
            <input
              type="text"
              value={props.splitNames}
              onChange={e => props.onSplitNamesChange(e.target.value)}
              placeholder="e.g., Tote 1A, Tote 1B"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={props.onSplitClose} style={btnSecondary}>Cancel</button>
              <button onClick={props.onSplitConfirm} disabled={!props.splitNames.trim()} style={{ ...btnPrimary, opacity: props.splitNames.trim() ? 1 : 0.5 }}>Split</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Move Items Modal ────────────────────────────────────── */}
      {props.moveOpen && (
        <div style={modalOverlayStyle} onClick={props.onMoveClose}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Move Items</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Move items from "{c.name}" to another container.
            </p>
            <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Target Container</label>
            <select value={props.moveTargetId} onChange={e => props.onMoveTargetChange(e.target.value)} style={inputStyle}>
              <option value="">Select target...</option>
              {targets.map(ct => <option key={ct.id} value={ct.id}>{ct.name}</option>)}
            </select>
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Item IDs (optional, comma-separated)</label>
              <input
                type="text"
                value={props.moveItemIds}
                onChange={e => props.onMoveItemIdsChange(e.target.value)}
                placeholder="Leave empty to move all items"
                style={inputStyle}
              />
              <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Leave empty to move all items from this container.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button onClick={props.onMoveClose} style={btnSecondary}>Cancel</button>
              <button onClick={props.onMoveConfirm} disabled={!props.moveTargetId} style={{ ...btnPrimary, opacity: props.moveTargetId ? 1 : 0.5 }}>Move</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
