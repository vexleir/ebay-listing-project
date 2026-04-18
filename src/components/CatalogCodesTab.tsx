import { useState, useEffect, useMemo } from 'react';
import { BookMarked, Plus, Trash2, Pencil, Check, X, RefreshCw, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';

interface CatalogCode {
  code: string;
  name: string;
}

interface CatalogCodesTabProps {
  appPassword: string;
}

const CODE_RE = /^[A-Z]{2}\d{3}$/;

export default function CatalogCodesTab({ appPassword }: CatalogCodesTabProps) {
  const { toast } = useToast();
  const [codes, setCodes] = useState<CatalogCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');

  const bearerHeaders = () => ({ Authorization: `Bearer ${appPassword}` });
  const apiHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${appPassword}` });

  const load = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/catalog-codes', { headers: bearerHeaders() });
      if (!resp.ok) throw new Error('Failed to load catalog codes');
      const data = await resp.json();
      setCodes((data.codes || []).sort((a: CatalogCode, b: CatalogCode) => a.code.localeCompare(b.code)));
    } catch (e: any) {
      toast('Load error: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const normalizedNewCode = newCode.trim().toUpperCase();
  const newCodeValid = CODE_RE.test(normalizedNewCode);
  const newCodeDuplicate = codes.some(c => c.code === normalizedNewCode);
  const canAdd = newCodeValid && !newCodeDuplicate && newName.trim().length > 0;

  const handleAdd = async () => {
    if (!canAdd) return;
    setSaving(true);
    try {
      const resp = await fetch('/api/catalog-codes', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ code: normalizedNewCode, name: newName.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'Failed to add code');
      }
      setNewCode('');
      setNewName('');
      toast(`Added ${normalizedNewCode}`, 'success');
      await load();
    } catch (e: any) {
      toast('Add error: ' + e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c: CatalogCode) => {
    setEditingCode(c.code);
    setEditCode(c.code);
    setEditName(c.name);
  };

  const cancelEdit = () => {
    setEditingCode(null);
    setEditCode('');
    setEditName('');
  };

  const saveEdit = async (oldCode: string) => {
    const normCode = editCode.trim().toUpperCase();
    if (!CODE_RE.test(normCode) || !editName.trim()) return;
    if (normCode !== oldCode && codes.some(c => c.code === normCode)) {
      toast(`Code ${normCode} already exists`, 'error');
      return;
    }
    try {
      const resp = await fetch(`/api/catalog-codes/${encodeURIComponent(oldCode)}`, {
        method: 'PUT',
        headers: apiHeaders(),
        body: JSON.stringify({ code: normCode, name: editName.trim() }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'Failed to update code');
      }
      toast(`Updated ${normCode}`, 'success');
      cancelEdit();
      await load();
    } catch (e: any) {
      toast('Update error: ' + e.message, 'error');
    }
  };

  const handleDelete = async (code: string) => {
    if (!confirm(`Delete catalog code "${code}"? This cannot be undone.`)) return;
    try {
      const resp = await fetch(`/api/catalog-codes/${encodeURIComponent(code)}`, {
        method: 'DELETE',
        headers: bearerHeaders(),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'Failed to delete code');
      }
      toast(`Deleted ${code}`, 'success');
      await load();
    } catch (e: any) {
      toast('Delete error: ' + e.message, 'error');
    }
  };

  const filteredCodes = useMemo(() => {
    if (!searchQuery.trim()) return codes;
    const q = searchQuery.toLowerCase();
    return codes.filter(c =>
      c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
    );
  }, [codes, searchQuery]);

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookMarked size={22} style={{ color: '#a855f7' }} />
            Catalog Codes
          </h2>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Manage the catalog codes used by the AI to categorize listings for Shopify collections.
            Format: two uppercase letters + three digits (e.g. <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>DV100</code>).
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Reload
        </button>
      </div>

      {/* Add new */}
      <div style={{
        background: 'rgba(168,85,247,0.06)',
        border: '1px solid rgba(168,85,247,0.25)',
        borderRadius: '10px',
        padding: '1rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} style={{ color: '#a855f7' }} />
          Add new catalog code
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Code</label>
            <input
              type="text"
              value={newCode}
              onChange={e => setNewCode(e.target.value.toUpperCase().slice(0, 5))}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="DV100"
              maxLength={5}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                background: 'var(--glass-bg)',
                border: `1px solid ${newCode && !newCodeValid ? 'rgba(239,68,68,0.4)' : 'var(--border-color)'}`,
                borderRadius: '6px',
                padding: '7px 10px',
                fontSize: '0.88rem',
                color: 'var(--text-primary)',
                width: '110px',
                outline: 'none',
                textTransform: 'uppercase',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: '240px' }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Display name</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="Diecast Vehicles"
              style={{
                background: 'var(--glass-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '7px 10px',
                fontSize: '0.88rem',
                color: 'var(--text-primary)',
                width: '100%',
                outline: 'none',
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <label style={{ fontSize: '0.72rem', color: 'transparent' }}>.</label>
            <button
              onClick={handleAdd}
              disabled={!canAdd || saving}
              className="btn-primary"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'linear-gradient(135deg, #a855f7, #7e22ce)',
                opacity: (!canAdd || saving) ? 0.5 : 1,
                cursor: (!canAdd || saving) ? 'not-allowed' : 'pointer',
                fontSize: '0.88rem',
                padding: '7px 14px',
              }}
            >
              <Plus size={15} /> Add
            </button>
          </div>
        </div>
        {newCode && !newCodeValid && (
          <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertCircle size={12} /> Code must be 2 uppercase letters + 3 digits (e.g. DV100)
          </div>
        )}
        {newCodeValid && newCodeDuplicate && (
          <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertCircle size={12} /> {normalizedNewCode} already exists
          </div>
        )}
      </div>

      {/* Search + count */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          {loading ? 'Loading…' : `${filteredCodes.length} of ${codes.length} codes`}
        </span>
        <input
          type="text"
          placeholder="Search by code or name…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--glass-bg)', color: 'var(--text-primary)', fontSize: '0.875rem', width: '280px' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '160px 1fr 180px',
          gap: '0',
          borderBottom: '1px solid var(--border-color)',
          padding: '0.6rem 1rem',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          <div>Code</div>
          <div>Name</div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</div>
          ) : filteredCodes.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              {searchQuery ? 'No codes match your search.' : 'No catalog codes yet.'}
            </div>
          ) : filteredCodes.map((c, idx) => {
            const isEditing = editingCode === c.code;
            const normEdit = editCode.trim().toUpperCase();
            const editValid = CODE_RE.test(normEdit) && editName.trim().length > 0;

            return (
              <div
                key={c.code}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 1fr 180px',
                  gap: '0',
                  padding: '0.55rem 1rem',
                  borderBottom: idx < filteredCodes.length - 1 ? '1px solid var(--border-color)' : 'none',
                  alignItems: 'center',
                  background: isEditing ? 'rgba(168,85,247,0.06)' : 'transparent',
                }}
              >
                <div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editCode}
                      onChange={e => setEditCode(e.target.value.toUpperCase().slice(0, 5))}
                      maxLength={5}
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        background: 'var(--bg-primary, #0f0f14)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '0.85rem',
                        color: 'var(--text-primary)',
                        width: '110px',
                        outline: 'none',
                        textTransform: 'uppercase',
                      }}
                    />
                  ) : (
                    <span style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      background: 'rgba(168,85,247,0.12)',
                      color: '#a855f7',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}>{c.code}</span>
                  )}
                </div>
                <div style={{ paddingRight: '1rem' }}>
                  {isEditing ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && editValid) saveEdit(c.code); if (e.key === 'Escape') cancelEdit(); }}
                      style={{
                        background: 'var(--bg-primary, #0f0f14)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '0.85rem',
                        color: 'var(--text-primary)',
                        width: '100%',
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.88rem' }}>{c.name}</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  {isEditing ? (
                    <>
                      <button
                        onClick={() => saveEdit(c.code)}
                        disabled={!editValid}
                        title="Save"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: editValid ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${editValid ? 'rgba(16,185,129,0.4)' : 'var(--border-color)'}`,
                          color: editValid ? '#10b981' : 'var(--text-secondary)',
                          cursor: editValid ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onClick={cancelEdit}
                        title="Cancel"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => startEdit(c)}
                        title="Edit"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: 'rgba(168,85,247,0.1)',
                          border: '1px solid rgba(168,85,247,0.3)',
                          color: '#a855f7',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.76rem',
                        }}
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(c.code)}
                        title="Delete"
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.3)',
                          color: '#ef4444',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.76rem',
                        }}
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
