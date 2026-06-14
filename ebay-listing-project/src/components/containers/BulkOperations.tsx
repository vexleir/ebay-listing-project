import { useState } from 'react';
import { ArrowRightLeft, MapPin, Type, Layers, GitMerge } from 'lucide-react';

interface BulkOperationsProps {
  appPassword: string;
}

interface BulkResult {
  success: boolean;
  processed: number;
  failed: number;
  failures: { itemId: string; error: string }[];
}

function authHeaders(token: string) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

// ─── Result Display ───────────────────────────────────────────────────────────

function ResultPanel({ result }: { result: BulkResult | null }) {
  if (!result) return null;

  return (
    <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)' }}>
      <div style={{ display: 'flex', gap: '1.5rem', marginBottom: result.failed > 0 ? '0.75rem' : 0 }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--success)' }}>
          ✓ {result.processed} succeeded
        </span>
        {result.failed > 0 && (
          <span style={{ fontSize: '0.85rem', color: '#ef4444' }}>
            ✗ {result.failed} failed
          </span>
        )}
      </div>
      {result.failures.length > 0 && (
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Item ID</th>
                <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Error</th>
              </tr>
            </thead>
            <tbody>
              {result.failures.map((f, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: '0.78rem' }}>{f.itemId}</td>
                  <td style={{ padding: '6px 10px', color: '#ef4444' }}>{f.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Bulk Move Items ──────────────────────────────────────────────────────────

function BulkMoveItems({ appPassword }: { appPassword: string }) {
  const [sourceContainerId, setSourceContainerId] = useState('');
  const [targetContainerId, setTargetContainerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!sourceContainerId.trim() || !targetContainerId.trim()) {
      setError('Both source and target container IDs are required.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/containers/bulk/move-items', {
        method: 'POST',
        headers: authHeaders(appPassword),
        body: JSON.stringify({ sourceContainerId: sourceContainerId.trim(), targetContainerId: targetContainerId.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
        Move all inventory items from one container to another.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Source Container ID</label>
          <input className="input-base" placeholder="Source container ID" value={sourceContainerId} onChange={e => setSourceContainerId(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Target Container ID</label>
          <input className="input-base" placeholder="Target container ID" value={targetContainerId} onChange={e => setTargetContainerId(e.target.value)} />
        </div>
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: '0 0 0.75rem 0' }}>{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
        {loading ? 'Moving…' : 'Move Items'}
      </button>
      <ResultPanel result={result} />
    </form>
  );
}

// ─── Bulk Move Location ───────────────────────────────────────────────────────

function BulkMoveLocation({ appPassword }: { appPassword: string }) {
  const [level, setLevel] = useState('building');
  const [currentValue, setCurrentValue] = useState('');
  const [newValue, setNewValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!currentValue.trim() || !newValue.trim()) {
      setError('Both current and new values are required.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/containers/bulk/move-location', {
        method: 'POST',
        headers: authHeaders(appPassword),
        body: JSON.stringify({ level, currentValue: currentValue.trim(), newValue: newValue.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
        Move all containers at a specified location level to a new value.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Location Level</label>
          <select className="input-base" value={level} onChange={e => setLevel(e.target.value)}>
            <option value="building">Building</option>
            <option value="room">Room</option>
            <option value="shelf">Shelf</option>
            <option value="shelfRow">Shelf Row</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Current Value</label>
          <input className="input-base" placeholder="Current value" value={currentValue} onChange={e => setCurrentValue(e.target.value)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>New Value</label>
          <input className="input-base" placeholder="New value" value={newValue} onChange={e => setNewValue(e.target.value)} />
        </div>
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: '0 0 0.75rem 0' }}>{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
        {loading ? 'Moving…' : 'Move Location'}
      </button>
      <ResultPanel result={result} />
    </form>
  );
}

// ─── Bulk Rename ──────────────────────────────────────────────────────────────

function BulkRename({ appPassword }: { appPassword: string }) {
  const [renameText, setRenameText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);

    const lines = renameText.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      setError('Enter at least one rename entry (one per line: containerId, newName).');
      return;
    }
    if (lines.length > 500) {
      setError('Cannot rename more than 500 containers at once.');
      return;
    }

    const renames: { containerId: string; newName: string }[] = [];
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        setError(`Invalid line: "${line}". Expected format: containerId, newName`);
        return;
      }
      renames.push({ containerId: parts[0], newName: parts[1] });
    }

    setLoading(true);
    try {
      const res = await fetch('/api/containers/bulk/rename', {
        method: 'POST',
        headers: authHeaders(appPassword),
        body: JSON.stringify({ renames }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
        Rename multiple containers. Enter one per line: <code style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '2px 4px', borderRadius: '3px' }}>containerId, newName</code>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Rename Entries (max 500)</label>
        <textarea
          className="input-base"
          rows={6}
          placeholder={"abc-123, New Container Name\ndef-456, Another Name"}
          value={renameText}
          onChange={e => setRenameText(e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }}
        />
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: '0 0 0.75rem 0' }}>{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
        {loading ? 'Renaming…' : `Rename Containers`}
      </button>
      <ResultPanel result={result} />
    </form>
  );
}

// ─── Bulk Assign Shelves ──────────────────────────────────────────────────────

function BulkAssignShelves({ appPassword }: { appPassword: string }) {
  const [assignText, setAssignText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);

    const lines = assignText.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      setError('Enter at least one assignment (one per line: containerId, shelf, shelfRow).');
      return;
    }
    if (lines.length > 500) {
      setError('Cannot assign shelves to more than 500 containers at once.');
      return;
    }

    const assignments: { containerId: string; shelf?: string; shelfRow?: string }[] = [];
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 2 || !parts[0]) {
        setError(`Invalid line: "${line}". Expected format: containerId, shelf[, shelfRow]`);
        return;
      }
      const entry: { containerId: string; shelf?: string; shelfRow?: string } = { containerId: parts[0] };
      if (parts[1]) entry.shelf = parts[1];
      if (parts[2]) entry.shelfRow = parts[2];
      if (!entry.shelf && !entry.shelfRow) {
        setError(`Invalid line: "${line}". At least shelf or shelfRow is required.`);
        return;
      }
      assignments.push(entry);
    }

    setLoading(true);
    try {
      const res = await fetch('/api/containers/bulk/assign-shelves', {
        method: 'POST',
        headers: authHeaders(appPassword),
        body: JSON.stringify({ assignments }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
        Assign shelf locations to multiple containers. Enter one per line: <code style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '2px 4px', borderRadius: '3px' }}>containerId, shelf, shelfRow</code>
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '1rem' }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Shelf Assignments (max 500)</label>
        <textarea
          className="input-base"
          rows={6}
          placeholder={"abc-123, A, 1\ndef-456, B, 3\nghi-789, C"}
          value={assignText}
          onChange={e => setAssignText(e.target.value)}
          style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }}
        />
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: '0 0 0.75rem 0' }}>{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
        {loading ? 'Assigning…' : 'Assign Shelves'}
      </button>
      <ResultPanel result={result} />
    </form>
  );
}

// ─── Bulk Merge Aliases ───────────────────────────────────────────────────────

function BulkMergeAliases({ appPassword }: { appPassword: string }) {
  const [aliasIdsText, setAliasIdsText] = useState('');
  const [targetContainerId, setTargetContainerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BulkResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);

    const aliasIds = aliasIdsText.trim().split('\n').map(s => s.trim()).filter(Boolean);
    if (aliasIds.length === 0) {
      setError('Enter at least one alias ID.');
      return;
    }
    if (!targetContainerId.trim()) {
      setError('Target container ID is required.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/containers/bulk/merge-aliases', {
        method: 'POST',
        headers: authHeaders(appPassword),
        body: JSON.stringify({ aliasIds, targetContainerId: targetContainerId.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0' }}>
        Merge multiple container aliases into a single canonical container.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Alias IDs (one per line)</label>
          <textarea
            className="input-base"
            rows={5}
            placeholder={"alias-id-1\nalias-id-2\nalias-id-3"}
            value={aliasIdsText}
            onChange={e => setAliasIdsText(e.target.value)}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.82rem' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Target Container ID</label>
          <input className="input-base" placeholder="Target container ID" value={targetContainerId} onChange={e => setTargetContainerId(e.target.value)} />
        </div>
      </div>
      {error && <p style={{ color: '#ef4444', fontSize: '0.82rem', margin: '0 0 0.75rem 0' }}>{error}</p>}
      <button type="submit" className="btn-primary" disabled={loading} style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
        {loading ? 'Merging…' : 'Merge Aliases'}
      </button>
      <ResultPanel result={result} />
    </form>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type BulkTab = 'move-items' | 'move-location' | 'rename' | 'assign-shelves' | 'merge-aliases';

export default function BulkOperations({ appPassword }: BulkOperationsProps) {
  const [activeTab, setActiveTab] = useState<BulkTab>('move-items');

  const tabs: { id: BulkTab; label: string; Icon: any }[] = [
    { id: 'move-items', label: 'Move Items', Icon: ArrowRightLeft },
    { id: 'move-location', label: 'Move Location', Icon: MapPin },
    { id: 'rename', label: 'Rename', Icon: Type },
    { id: 'assign-shelves', label: 'Assign Shelves', Icon: Layers },
    { id: 'merge-aliases', label: 'Merge Aliases', Icon: GitMerge },
  ];

  const tabBtnStyle = (id: BulkTab): React.CSSProperties => ({
    padding: '8px 16px',
    background: activeTab === id ? 'var(--glass-bg)' : 'transparent',
    border: '1px solid',
    borderColor: activeTab === id ? 'var(--glass-border)' : 'transparent',
    borderRadius: '8px',
    color: activeTab === id ? 'var(--text-primary)' : 'var(--text-secondary)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontWeight: activeTab === id ? 600 : 400,
    fontSize: '0.85rem',
    transition: 'all 0.2s ease',
  });

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem' }}>Bulk Operations</h3>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Perform batch actions on containers and inventory items.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {tabs.map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)} style={tabBtnStyle(id)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        {activeTab === 'move-items' && <BulkMoveItems appPassword={appPassword} />}
        {activeTab === 'move-location' && <BulkMoveLocation appPassword={appPassword} />}
        {activeTab === 'rename' && <BulkRename appPassword={appPassword} />}
        {activeTab === 'assign-shelves' && <BulkAssignShelves appPassword={appPassword} />}
        {activeTab === 'merge-aliases' && <BulkMergeAliases appPassword={appPassword} />}
      </div>
    </div>
  );
}
