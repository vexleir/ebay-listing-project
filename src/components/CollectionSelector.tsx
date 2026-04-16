import { useState, useEffect, useRef } from 'react';
import { ChevronDown, X, Plus, Layers } from 'lucide-react';
import { DEFAULT_COLLECTIONS, type Collection } from '../data/collections';

interface CollectionSelectorProps {
  selected: string[];
  onChange: (codes: string[]) => void;
}

const CUSTOM_STORAGE_KEY = 'flipside_custom_collections';

function loadCustomCollections(): Collection[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomCollections(cols: Collection[]) {
  localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(cols));
}

export default function CollectionSelector({ selected, onChange }: CollectionSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [customCollections, setCustomCollections] = useState<Collection[]>(loadCustomCollections);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allCollections = [...DEFAULT_COLLECTIONS, ...customCollections];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowAddForm(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = allCollections.filter(c =>
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter(c => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  const addCustom = () => {
    const code = newCode.trim().toUpperCase();
    const name = newName.trim();
    if (!code || !name) return;
    if (allCollections.some(c => c.code === code)) return;
    const updated = [...customCollections, { code, name }];
    setCustomCollections(updated);
    saveCustomCollections(updated);
    onChange([...selected, code]);
    setNewCode('');
    setNewName('');
    setShowAddForm(false);
  };

  const removeCustom = (code: string) => {
    const updated = customCollections.filter(c => c.code !== code);
    setCustomCollections(updated);
    saveCustomCollections(updated);
    onChange(selected.filter(c => c !== code));
  };

  const getCollection = (code: string) => allCollections.find(c => c.code === code);

  return (
    <div>
      <label style={{ display: 'flex', marginBottom: '8px', color: 'var(--text-secondary)', alignItems: 'center', gap: '6px' }}>
        <Layers size={15} /> Collections (Shopify)
        <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '2px' }}>(codes added as tags)</span>
      </label>
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        {/* Selected chips + trigger */}
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px',
            background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-color)', minHeight: '42px',
            alignItems: 'center', cursor: 'pointer', userSelect: 'none',
          }}
          onClick={() => { setIsOpen(v => !v); setSearch(''); }}
        >
          {selected.length === 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Select collections...</span>
          )}
          {selected.map(code => {
            const col = getCollection(code);
            return (
              <span key={code} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)',
                color: '#6ee7b7', borderRadius: '4px', padding: '2px 8px', fontSize: '0.82rem',
              }}>
                <strong>{code}</strong>
                {col && <span style={{ opacity: 0.7 }}>— {col.name}</span>}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); toggle(code); }}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, lineHeight: 1, opacity: 0.7, marginLeft: '2px' }}
                >×</button>
              </span>
            );
          })}
          <ChevronDown
            size={15}
            style={{
              marginLeft: 'auto', color: 'var(--text-secondary)', flexShrink: 0,
              transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
            }}
          />
        </div>

        {/* Dropdown */}
        {isOpen && (
          <div className="glass-panel" style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 300,
            marginTop: '4px', maxHeight: '300px',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Search */}
            <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              <input
                type="text"
                className="input-base"
                placeholder="Search by code or name..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                autoFocus
                style={{ fontSize: '0.85rem', padding: '6px 10px' }}
              />
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filtered.map(col => {
                const isSelected = selected.includes(col.code);
                const isCustom = customCollections.some(c => c.code === col.code);
                return (
                  <div
                    key={col.code}
                    onClick={() => toggle(col.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '7px 12px', cursor: 'pointer',
                      background: isSelected ? 'rgba(16,185,129,0.08)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background = isSelected ? 'rgba(16,185,129,0.08)' : 'transparent';
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: '15px', height: '15px', borderRadius: '3px', flexShrink: 0,
                      border: `2px solid ${isSelected ? '#10b981' : 'rgba(255,255,255,0.2)'}`,
                      background: isSelected ? '#10b981' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.1s',
                    }}>
                      {isSelected && (
                        <svg width="9" height="9" viewBox="0 0 9 9">
                          <polyline points="1.5,4.5 3.5,6.5 7.5,2.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#6ee7b7', fontWeight: 600, minWidth: '52px', letterSpacing: '0.02em' }}>{col.code}</span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', flex: 1 }}>{col.name}</span>
                    {isCustom && (
                      <button
                        type="button"
                        title="Remove custom entry"
                        onClick={e => { e.stopPropagation(); removeCustom(col.code); }}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', opacity: 0.6, flexShrink: 0 }}
                      ><X size={12} /></button>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ padding: '14px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
                  No matches found
                </div>
              )}
            </div>

            {/* Add custom entry */}
            <div style={{ borderTop: '1px solid var(--border-color)', padding: '8px', flexShrink: 0 }}>
              {!showAddForm ? (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setShowAddForm(true); }}
                  style={{
                    background: 'none', border: 'none', color: 'var(--accent-color)',
                    cursor: 'pointer', fontSize: '0.82rem',
                    display: 'flex', alignItems: 'center', gap: '4px', padding: '4px',
                  }}
                >
                  <Plus size={13} /> Add custom collection
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  <input
                    type="text"
                    className="input-base"
                    placeholder="Code"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value.toUpperCase())}
                    style={{ width: '90px', fontSize: '0.82rem', padding: '5px 8px' }}
                    maxLength={8}
                  />
                  <input
                    type="text"
                    className="input-base"
                    placeholder="Collection name"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustom()}
                    style={{ flex: 1, fontSize: '0.82rem', padding: '5px 8px' }}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={addCustom}
                    style={{
                      background: 'rgba(99,102,241,0.2)', border: '1px solid var(--accent-color)',
                      color: 'var(--accent-color)', borderRadius: '6px', padding: '5px 10px',
                      cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap',
                    }}
                  >Add</button>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
                  ><X size={14} /></button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
