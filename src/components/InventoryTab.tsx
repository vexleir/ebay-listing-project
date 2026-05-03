import { useEffect, useMemo, useState } from 'react';
import { Package, Box, Archive, MapPin, Plus, Trash2, ArrowLeft, Search, X } from 'lucide-react';
import type { Container, ContainerType, ContainerLooseItem, StagedListing } from '../types';
import { useToast } from '../context/ToastContext';

const CONTAINER_TYPES: ContainerType[] = ['bin', 'box', 'shelf', 'drawer', 'tote', 'pallet', 'other'];

const TYPE_ICON: Record<ContainerType, typeof Package> = {
  bin: Box,
  box: Package,
  shelf: Archive,
  drawer: Archive,
  tote: Box,
  pallet: Package,
  other: Package,
};

interface ContainerDetailResponse {
  container: Container;
  listings: Array<Pick<StagedListing, 'id' | 'title' | 'sku' | 'priceRecommendation' | 'images' | 'status' | 'ebayDraftId' | 'containerId'>>;
}

interface InventoryTabProps {
  containers: Container[];
  selectedContainerId: string | null;
  setSelectedContainerId: (id: string | null) => void;
  onCreateContainer: (input: Omit<Container, 'id' | 'createdAt'>) => Promise<Container>;
  onUpdateContainer: (id: string, updates: Partial<Container>) => Promise<void>;
  onDeleteContainer: (id: string) => Promise<void>;
  onAssignListingToContainer: (listingId: string, containerId: string | null) => Promise<void>;
  onAddLooseItem: (containerId: string, label: string, notes?: string) => Promise<ContainerLooseItem | null>;
  onRemoveLooseItem: (containerId: string, itemId: string) => Promise<void>;
  appPassword: string;
}

const bearerHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export default function InventoryTab(props: InventoryTabProps) {
  const {
    containers, selectedContainerId, setSelectedContainerId,
    onCreateContainer, onUpdateContainer, onDeleteContainer,
    onAssignListingToContainer, onAddLooseItem, onRemoveLooseItem,
    appPassword,
  } = props;

  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editMetaOpen, setEditMetaOpen] = useState(false);

  const selectedContainer = useMemo(
    () => containers.find(c => c.id === selectedContainerId) || null,
    [containers, selectedContainerId]
  );

  if (selectedContainer) {
    return (
      <ContainerDetail
        container={selectedContainer}
        appPassword={appPassword}
        onBack={() => setSelectedContainerId(null)}
        onUpdate={onUpdateContainer}
        onDelete={async (id) => {
          await onDeleteContainer(id);
          setSelectedContainerId(null);
          toast('Container deleted', 'success');
        }}
        onAssignListing={onAssignListingToContainer}
        onAddLooseItem={onAddLooseItem}
        onRemoveLooseItem={onRemoveLooseItem}
        editMetaOpen={editMetaOpen}
        setEditMetaOpen={setEditMetaOpen}
      />
    );
  }

  const q = search.toLowerCase();
  const visible = containers.filter(c =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    (c.location || '').toLowerCase().includes(q) ||
    c.type.includes(q)
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={22} /> Inventory
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Containers hold listings and pre-listed items. Click a container to view its contents.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreateModalOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Plus size={16} /> New container
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: '1rem' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, location, or type…"
          style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
        />
      </div>

      {visible.length === 0 ? (
        <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {containers.length === 0
            ? 'No containers yet. Create one to start tracking where your items physically live.'
            : 'No containers match your search.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {visible.map(c => (
            <ContainerCard
              key={c.id}
              container={c}
              onClick={() => setSelectedContainerId(c.id)}
            />
          ))}
        </div>
      )}

      {createModalOpen && (
        <ContainerEditModal
          mode="create"
          onClose={() => setCreateModalOpen(false)}
          onSubmit={async (input) => {
            const c = await onCreateContainer(input);
            setCreateModalOpen(false);
            setSelectedContainerId(c.id);
            toast(`Created "${c.name}"`, 'success');
          }}
        />
      )}
    </div>
  );
}

// ─── Container card (list view) ─────────────────────────────────────────────

function ContainerCard({ container, onClick }: { container: Container; onClick: () => void }) {
  const Icon = TYPE_ICON[container.type] || Package;
  const looseCount = container.looseItems?.length || 0;
  return (
    <button
      onClick={onClick}
      className="glass-panel"
      style={{ padding: '1rem', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Icon size={18} style={{ color: 'var(--accent-color)' }} />
        <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>{container.name}</span>
        <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '3px', background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {container.type}
        </span>
      </div>
      {container.location && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <MapPin size={12} /> {container.location}
        </div>
      )}
      {looseCount > 0 && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
          {looseCount} loose item{looseCount === 1 ? '' : 's'}
        </div>
      )}
      {container.notes && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {container.notes}
        </div>
      )}
    </button>
  );
}

// ─── Container detail view ──────────────────────────────────────────────────

function ContainerDetail(props: {
  container: Container;
  appPassword: string;
  onBack: () => void;
  onUpdate: (id: string, updates: Partial<Container>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAssignListing: (listingId: string, containerId: string | null) => Promise<void>;
  onAddLooseItem: (containerId: string, label: string, notes?: string) => Promise<ContainerLooseItem | null>;
  onRemoveLooseItem: (containerId: string, itemId: string) => Promise<void>;
  editMetaOpen: boolean;
  setEditMetaOpen: (open: boolean) => void;
}) {
  const { container, appPassword, onBack, onUpdate, onDelete, onAssignListing, onAddLooseItem, onRemoveLooseItem, editMetaOpen, setEditMetaOpen } = props;
  const Icon = TYPE_ICON[container.type] || Package;

  const [listings, setListings] = useState<ContainerDetailResponse['listings']>([]);
  const [looseLabel, setLooseLabel] = useState('');
  const [looseNotes, setLooseNotes] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/containers/${container.id}`, { headers: bearerHeaders(appPassword) })
      .then(r => r.ok ? r.json() : null)
      .then((data: ContainerDetailResponse | null) => {
        if (!cancelled && data) setListings(data.listings || []);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [container.id, appPassword, refreshTick]);

  const looseItems = container.looseItems || [];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <ArrowLeft size={14} /> Back
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Icon size={22} style={{ color: 'var(--accent-color)' }} />
              <h2 style={{ margin: 0, fontSize: '1.4rem' }}>{container.name}</h2>
              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', textTransform: 'uppercase' }}>
                {container.type}
              </span>
            </div>
            {container.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                <MapPin size={14} /> {container.location}
              </div>
            )}
            {container.notes && (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                {container.notes}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setEditMetaOpen(true)} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Edit
            </button>
            <button
              onClick={() => {
                const linkedCount = listings.length;
                const msg = linkedCount > 0
                  ? `Delete "${container.name}"? This will unlink ${linkedCount} listing${linkedCount === 1 ? '' : 's'} (the listings themselves are kept).`
                  : `Delete "${container.name}"?`;
                if (confirm(msg)) onDelete(container.id);
              }}
              style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '6px', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </div>

      {/* Listings inside */}
      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
          Listings ({listings.length})
        </h3>
        {listings.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            No listings assigned yet. Open a listing's edit form and pick this container, or use the container picker on the staged/listed views.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {listings.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 4, overflow: 'hidden', background: 'rgba(0,0,0,0.4)' }}>
                  {l.images?.[0] && <img src={l.images[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</div>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '2px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {l.sku && <span>SKU: {l.sku}</span>}
                    <span>${l.priceRecommendation}</span>
                    <span style={{ textTransform: 'uppercase', opacity: 0.7 }}>{l.status}</span>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    await onAssignListing(l.id, null);
                    setRefreshTick(t => t + 1);
                  }}
                  style={{ padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Loose items */}
      <div className="glass-panel" style={{ padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem' }}>
          Loose items ({looseItems.length})
        </h3>
        <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          Items physically here but not yet turned into a listing.
        </p>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={looseLabel}
            onChange={e => setLooseLabel(e.target.value)}
            placeholder="Label (e.g. 'box of unphotographed shirts')"
            style={{ flex: 1, minWidth: '200px', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
          />
          <input
            type="text"
            value={looseNotes}
            onChange={e => setLooseNotes(e.target.value)}
            placeholder="Notes (optional)"
            style={{ flex: 1, minWidth: '180px', padding: '6px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
          />
          <button
            onClick={async () => {
              if (!looseLabel.trim()) return;
              await onAddLooseItem(container.id, looseLabel.trim(), looseNotes.trim() || undefined);
              setLooseLabel('');
              setLooseNotes('');
            }}
            disabled={!looseLabel.trim()}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {looseItems.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No loose items.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {looseItems.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem' }}>{item.label}</div>
                  {item.notes && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{item.notes}</div>}
                </div>
                <button
                  onClick={() => onRemoveLooseItem(container.id, item.id)}
                  style={{ padding: '4px 8px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                  title="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {editMetaOpen && (
        <ContainerEditModal
          mode="edit"
          initial={container}
          onClose={() => setEditMetaOpen(false)}
          onSubmit={async (input) => {
            await onUpdate(container.id, input);
            setEditMetaOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Create / Edit modal ────────────────────────────────────────────────────

function ContainerEditModal(props: {
  mode: 'create' | 'edit';
  initial?: Container;
  onClose: () => void;
  onSubmit: (input: Omit<Container, 'id' | 'createdAt'>) => Promise<void>;
}) {
  const { mode, initial, onClose, onSubmit } = props;
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState<ContainerType>(initial?.type || 'bin');
  const [location, setLocation] = useState(initial?.location || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        type,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        looseItems: initial?.looseItems,
        archived: initial?.archived,
        updatedAt: Date.now(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()} className="glass-panel" style={{ width: '100%', maxWidth: '460px', padding: '1.5rem' }}>
        <h3 style={{ margin: '0 0 1rem' }}>{mode === 'create' ? 'New container' : 'Edit container'}</h3>

        <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          <span style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Name *</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Bin A1"
            autoFocus
            style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          <span style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Type *</span>
          <select
            value={type}
            onChange={e => setType(e.target.value as ContainerType)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
          >
            {CONTAINER_TYPES.map(t => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
          <span style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Location</span>
          <input
            type="text"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="e.g. Garage shelf 3"
            style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: '1rem', fontSize: '0.85rem' }}>
          <span style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Notes</span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'vertical' }}
          />
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button onClick={onClose} style={{ padding: '8px 14px', background: 'transparent', border: '1px solid var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={submit} disabled={!name.trim() || submitting} className="btn-primary">
            {submitting ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
