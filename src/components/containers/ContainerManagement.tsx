import { useState, useEffect, useCallback } from 'react';
import { PlusCircle, ArrowLeft, Archive, RotateCcw, Merge, Split, MoveRight, Wand2, Loader2, ClipboardList, Layers, History } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import ContainerList from './ContainerList';
import ContainerForm from './ContainerForm';
import ReviewQueue from './ReviewQueue';
import BulkOperations from './BulkOperations';
import AuditHistory from './AuditHistory';
import type { ContainerRecord, ContainerType } from './ContainerList';

type View = 'list' | 'detail' | 'create' | 'edit';
type SubTab = 'containers' | 'review-queue' | 'bulk-operations';

interface ContainerManagementProps {
  appPassword: string;
}

export default function ContainerManagement({ appPassword }: ContainerManagementProps) {
  const { toast } = useToast();

  const [view, setView] = useState<View>('list');
  const [containers, setContainers] = useState<ContainerRecord[]>([]);
  const [containerTypes, setContainerTypes] = useState<ContainerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<ContainerRecord | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Sub-tab navigation (containers list, review queue, bulk operations)
  const [subTab, setSubTab] = useState<SubTab>('containers');

  // Modal states
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [moveItemsModalOpen, setMoveItemsModalOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [splitNames, setSplitNames] = useState('');
  const [moveTargetId, setMoveTargetId] = useState('');
  const [moveItemIds, setMoveItemIds] = useState('');

  // Generate containers state
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResults, setGenerateResults] = useState<{
    containersCreated: number;
    aliasesMapped: number;
    reviewQueueEntries: number;
    skipped: number;
  } | null>(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${appPassword}` };
  const authHeaders = { Authorization: `Bearer ${appPassword}` };

  // Fetch containers
  const fetchContainers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      const qs = params.toString();
      const resp = await fetch(`/api/containers${qs ? `?${qs}` : ''}`, { headers: authHeaders });
      if (!resp.ok) throw new Error('Failed to load containers');
      const data = await resp.json();
      setContainers(data.containers || []);
    } catch (e: any) {
      toast(e.message || 'Failed to load containers', 'error');
    } finally {
      setLoading(false);
    }
  }, [appPassword, statusFilter, typeFilter]);

  // Fetch container types
  const fetchTypes = useCallback(async () => {
    try {
      const resp = await fetch('/api/containers/types', { headers: authHeaders });
      if (!resp.ok) throw new Error('Failed to load container types');
      const data = await resp.json();
      setContainerTypes(data.types || []);
    } catch {
      // Silently fail — types will just be empty
    }
  }, [appPassword]);

  useEffect(() => {
    fetchContainers();
  }, [fetchContainers]);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  // Create container
  const handleCreate = async (data: Partial<ContainerRecord>) => {
    setSaving(true);
    try {
      const resp = await fetch('/api/containers', {
        method: 'POST',
        headers,
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to create container');
      }
      toast('Container created.', 'success');
      setView('list');
      fetchContainers();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Update container
  const handleUpdate = async (data: Partial<ContainerRecord>) => {
    if (!selectedContainer) return;
    setSaving(true);
    try {
      const resp = await fetch(`/api/containers/${selectedContainer.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to update container');
      }
      const updated = await resp.json();
      setSelectedContainer(updated);
      toast('Container updated.', 'success');
      setView('detail');
      fetchContainers();
    } catch (e: any) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Archive container
  const handleArchive = async () => {
    if (!selectedContainer) return;
    try {
      const resp = await fetch(`/api/containers/${selectedContainer.id}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to archive container');
      }
      toast(`"${selectedContainer.name}" archived.`, 'success');
      setView('list');
      setSelectedContainer(null);
      fetchContainers();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  // Restore container
  const handleRestore = async () => {
    if (!selectedContainer) return;
    try {
      const resp = await fetch(`/api/containers/${selectedContainer.id}/restore`, {
        method: 'PUT',
        headers: authHeaders,
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to restore container');
      }
      const updated = await resp.json();
      setSelectedContainer(updated);
      toast(`"${selectedContainer.name}" restored.`, 'success');
      fetchContainers();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  // Merge container
  const handleMerge = async () => {
    if (!selectedContainer || !mergeTargetId.trim()) return;
    try {
      const resp = await fetch(`/api/containers/${selectedContainer.id}/merge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetContainerId: mergeTargetId.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to merge container');
      }
      toast('Containers merged.', 'success');
      setMergeModalOpen(false);
      setMergeTargetId('');
      setView('list');
      setSelectedContainer(null);
      fetchContainers();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  // Split container
  const handleSplit = async () => {
    if (!selectedContainer || !splitNames.trim()) return;
    const newContainerNames = splitNames.split(',').map(n => n.trim()).filter(Boolean);
    if (newContainerNames.length === 0) {
      toast('Enter at least one new container name.', 'error');
      return;
    }
    try {
      const resp = await fetch(`/api/containers/${selectedContainer.id}/split`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ newContainers: newContainerNames.map(n => ({ name: n })) }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to split container');
      }
      toast('Container split successfully.', 'success');
      setSplitModalOpen(false);
      setSplitNames('');
      setView('list');
      setSelectedContainer(null);
      fetchContainers();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  // Move items
  const handleMoveItems = async () => {
    if (!selectedContainer || !moveTargetId.trim()) return;
    const itemIdList = moveItemIds.trim()
      ? moveItemIds.split(',').map(id => id.trim()).filter(Boolean)
      : undefined;
    try {
      const resp = await fetch(`/api/containers/${selectedContainer.id}/move-items`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetContainerId: moveTargetId.trim(),
          ...(itemIdList ? { itemIds: itemIdList } : {}),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to move items');
      }
      toast('Items moved successfully.', 'success');
      setMoveItemsModalOpen(false);
      setMoveTargetId('');
      setMoveItemIds('');
      fetchContainers();
    } catch (e: any) {
      toast(e.message, 'error');
    }
  };

  // Generate containers from SKUs
  const handleGenerate = async () => {
    setGenerateConfirmOpen(false);
    setGenerating(true);
    setGenerateResults(null);
    try {
      const resp = await fetch('/api/containers/generate', {
        method: 'POST',
        headers,
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || 'Failed to generate containers');
      }
      const data = await resp.json();
      setGenerateResults(data);
      toast(
        `Generated ${data.containersCreated} container${data.containersCreated !== 1 ? 's' : ''}, mapped ${data.aliasesMapped} alias${data.aliasesMapped !== 1 ? 'es' : ''}.`,
        'success'
      );
      fetchContainers();
    } catch (e: any) {
      toast(e.message || 'Failed to generate containers', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleSelectContainer = (container: ContainerRecord) => {
    setSelectedContainer(container);
    setView('detail');
  };

  const formatLocation = (c: ContainerRecord): string => {
    const parts: string[] = [];
    if (c.building) parts.push(c.building);
    if (c.room) parts.push(c.room);
    if (c.shelf) parts.push(`Shelf ${c.shelf}`);
    if (c.shelfRow) parts.push(`Row ${c.shelfRow}`);
    return parts.join(' - ') || 'No location set';
  };

  const formatDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  // ─── Modal Overlay ─────────────────────────────────────────────────────
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

  // ─── Render ────────────────────────────────────────────────────────────

  // Create / Edit form view
  if (view === 'create' || view === 'edit') {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <button
          onClick={() => { setView(view === 'edit' ? 'detail' : 'list'); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={14} /> Back
        </button>
        <ContainerForm
          appPassword={appPassword}
          containerTypes={containerTypes}
          existing={view === 'edit' ? selectedContainer : null}
          onSave={view === 'edit' ? handleUpdate : handleCreate}
          onCancel={() => setView(view === 'edit' ? 'detail' : 'list')}
          saving={saving}
        />
      </div>
    );
  }

  // Detail view
  if (view === 'detail' && selectedContainer) {
    const c = selectedContainer;
    const isArchived = c.status === 'Archived';

    return (
      <div>
        <button
          onClick={() => { setView('list'); setSelectedContainer(null); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '1rem', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={14} /> Back to list
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{c.name}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {c.containerType} &middot; {c.status}
            </p>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button onClick={() => setView('edit')} style={btnSecondary}>Edit</button>
            {isArchived ? (
              <button onClick={handleRestore} style={{ ...btnSecondary, color: '#22c55e', borderColor: 'rgba(34,197,94,0.4)' }}>
                <RotateCcw size={14} style={{ marginRight: '4px' }} /> Restore
              </button>
            ) : (
              <button onClick={handleArchive} style={{ ...btnSecondary, color: '#f59e0b', borderColor: 'rgba(245,158,11,0.4)' }}>
                <Archive size={14} style={{ marginRight: '4px' }} /> Archive
              </button>
            )}
            <button onClick={() => setMergeModalOpen(true)} style={btnSecondary}>
              <Merge size={14} style={{ marginRight: '4px' }} /> Merge
            </button>
            <button onClick={() => setSplitModalOpen(true)} style={btnSecondary}>
              <Split size={14} style={{ marginRight: '4px' }} /> Split
            </button>
            <button onClick={() => setMoveItemsModalOpen(true)} style={btnSecondary}>
              <MoveRight size={14} style={{ marginRight: '4px' }} /> Move Items
            </button>
          </div>
        </div>

        {/* Detail fields */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
          <DetailField label="Location" value={formatLocation(c)} />
          <DetailField label="Items" value={String(c.currentItemCount)} />
          <DetailField label="Fullness" value={c.fullnessPercentage != null ? `${c.fullnessPercentage}%` : '—'} />
          <DetailField label="Estimated Capacity" value={c.estimatedCapacity != null ? String(c.estimatedCapacity) : '—'} />
          <DetailField label="Capacity Type" value={c.capacityType || '—'} />
          <DetailField label="Max Recommended" value={c.maxRecommendedItemCount != null ? String(c.maxRecommendedItemCount) : '—'} />
          <DetailField label="Created" value={formatDate(c.createdAt)} />
          <DetailField label="Last Modified" value={formatDate(c.updatedAt)} />
        </div>

        {c.notes && (
          <div style={{ marginTop: '1.25rem' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Notes</span>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{c.notes}</p>
          </div>
        )}

        {/* ─── Audit History ───────────────────────────────────────── */}
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <History size={16} /> Audit History
          </h3>
          <AuditHistory containerId={c.id} appPassword={appPassword} />
        </div>

        {/* ─── Merge Modal ─────────────────────────────────────────── */}
        {mergeModalOpen && (
          <div style={modalOverlayStyle} onClick={() => setMergeModalOpen(false)}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Merge Container</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Merge "{c.name}" into another container. All items, aliases, and history will be transferred to the target.
              </p>
              <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Target Container ID</label>
              <select
                value={mergeTargetId}
                onChange={e => setMergeTargetId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select target...</option>
                {containers.filter(ct => ct.id !== c.id && ct.status !== 'Archived').map(ct => (
                  <option key={ct.id} value={ct.id}>{ct.name}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button onClick={() => setMergeModalOpen(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleMerge} disabled={!mergeTargetId} style={{ ...btnPrimary, opacity: mergeTargetId ? 1 : 0.5 }}>Merge</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Split Modal ─────────────────────────────────────────── */}
        {splitModalOpen && (
          <div style={modalOverlayStyle} onClick={() => setSplitModalOpen(false)}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Split Container</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Create new containers from "{c.name}". Enter comma-separated names for the new containers.
              </p>
              <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>New Container Names</label>
              <input
                type="text"
                value={splitNames}
                onChange={e => setSplitNames(e.target.value)}
                placeholder="e.g., Tote 1A, Tote 1B"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button onClick={() => setSplitModalOpen(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleSplit} disabled={!splitNames.trim()} style={{ ...btnPrimary, opacity: splitNames.trim() ? 1 : 0.5 }}>Split</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Move Items Modal ────────────────────────────────────── */}
        {moveItemsModalOpen && (
          <div style={modalOverlayStyle} onClick={() => setMoveItemsModalOpen(false)}>
            <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Move Items</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Move items from "{c.name}" to another container.
              </p>
              <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Target Container</label>
              <select
                value={moveTargetId}
                onChange={e => setMoveTargetId(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select target...</option>
                {containers.filter(ct => ct.id !== c.id && ct.status !== 'Archived').map(ct => (
                  <option key={ct.id} value={ct.id}>{ct.name}</option>
                ))}
              </select>
              <div style={{ marginTop: '0.75rem' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 500 }}>Item IDs (optional, comma-separated)</label>
                <input
                  type="text"
                  value={moveItemIds}
                  onChange={e => setMoveItemIds(e.target.value)}
                  placeholder="Leave empty to move all items"
                  style={inputStyle}
                />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Leave empty to move all items from this container.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                <button onClick={() => setMoveItemsModalOpen(false)} style={btnSecondary}>Cancel</button>
                <button onClick={handleMoveItems} disabled={!moveTargetId} style={{ ...btnPrimary, opacity: moveTargetId ? 1 : 0.5 }}>Move</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // List view (default)
  return (
    <div>
      {/* ─── Sub-tab navigation ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <button
          onClick={() => setSubTab('containers')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: subTab === 'containers' ? 'var(--glass-border)' : 'transparent',
            background: subTab === 'containers' ? 'var(--glass-bg)' : 'transparent',
            color: subTab === 'containers' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: subTab === 'containers' ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Layers size={15} /> Containers
        </button>
        <button
          onClick={() => setSubTab('review-queue')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: subTab === 'review-queue' ? 'var(--glass-border)' : 'transparent',
            background: subTab === 'review-queue' ? 'var(--glass-bg)' : 'transparent',
            color: subTab === 'review-queue' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: subTab === 'review-queue' ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <ClipboardList size={15} /> Review Queue
        </button>
        <button
          onClick={() => setSubTab('bulk-operations')}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: subTab === 'bulk-operations' ? 'var(--glass-border)' : 'transparent',
            background: subTab === 'bulk-operations' ? 'var(--glass-bg)' : 'transparent',
            color: subTab === 'bulk-operations' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: subTab === 'bulk-operations' ? 600 : 400,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Layers size={15} /> Bulk Operations
        </button>
      </div>

      {/* ─── Review Queue sub-tab ──────────────────────────────────── */}
      {subTab === 'review-queue' && (
        <ReviewQueue appPassword={appPassword} />
      )}

      {/* ─── Bulk Operations sub-tab ──────────────────────────────── */}
      {subTab === 'bulk-operations' && (
        <BulkOperations appPassword={appPassword} />
      )}

      {/* ─── Containers list sub-tab ──────────────────────────────── */}
      {subTab === 'containers' && (
        <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Containers</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => setGenerateConfirmOpen(true)}
            disabled={generating}
            style={{
              ...btnSecondary,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              opacity: generating ? 0.6 : 1,
              cursor: generating ? 'not-allowed' : 'pointer',
            }}
          >
            {generating ? <Loader2 size={14} className="spin" /> : <Wand2 size={14} />}
            {generating ? 'Generating...' : 'Generate from SKUs'}
          </button>
          <button
            onClick={() => setView('create')}
            style={{
              ...btnPrimary,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <PlusCircle size={14} /> New Container
          </button>
        </div>
      </div>

      {/* Generation Results Banner */}
      {generateResults && (
        <div style={{
          marginBottom: '1rem',
          padding: '1rem',
          borderRadius: '10px',
          background: 'var(--glass-bg)',
          border: '1px solid rgba(168, 85, 247, 0.3)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Generation Results</span>
            <button
              onClick={() => setGenerateResults(null)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Dismiss
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#a855f7' }}>{generateResults.containersCreated}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Containers Created</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#6366f1' }}>{generateResults.aliasesMapped}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aliases Mapped</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>{generateResults.reviewQueueEntries}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Review Queue</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{generateResults.skipped}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Skipped</div>
            </div>
          </div>
        </div>
      )}

      <ContainerList
        containers={containers}
        containerTypes={containerTypes}
        loading={loading}
        onSelect={handleSelectContainer}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
      />
        </>
      )}

      {/* ─── Generate Confirmation Modal ─────────────────────────────── */}
      {generateConfirmOpen && (
        <div style={modalOverlayStyle} onClick={() => setGenerateConfirmOpen(false)}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1rem', fontSize: '1rem' }}>Generate Containers from SKUs</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
              This will scan all inventory SKU values and automatically create containers based on normalized names.
            </p>
            <ul style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1rem', paddingLeft: '1.25rem' }}>
              <li>New containers will be created for unique SKU patterns</li>
              <li>Similar SKUs will be merged or queued for review</li>
              <li>Already-processed SKUs will be skipped</li>
            </ul>
            <p style={{ fontSize: '0.82rem', color: '#f59e0b', marginBottom: '1rem' }}>
              This may create many containers depending on your inventory size.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setGenerateConfirmOpen(false)} style={btnSecondary}>Cancel</button>
              <button onClick={handleGenerate} style={btnPrimary}>Generate</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper component ────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '0.75rem', borderRadius: '8px', background: 'var(--glass-bg)', border: '1px solid var(--border-color)' }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{value}</div>
    </div>
  );
}
