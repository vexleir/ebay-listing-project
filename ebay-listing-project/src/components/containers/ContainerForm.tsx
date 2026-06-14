import { useState, useEffect } from 'react';
import { Save, X } from 'lucide-react';
import type { ContainerRecord, ContainerType } from './ContainerList';

const CAPACITY_TYPES = ['Item Count', 'Card Count', 'Box Count', 'Cubic Space', 'Weight', 'User Defined'];

interface ContainerFormProps {
  appPassword: string;
  containerTypes: ContainerType[];
  /** If provided, we're editing an existing container */
  existing?: ContainerRecord | null;
  onSave: (data: Partial<ContainerRecord>) => void;
  onCancel: () => void;
  saving: boolean;
}

interface FormErrors {
  name?: string;
  containerType?: string;
  estimatedCapacity?: string;
  maxRecommendedItemCount?: string;
}

export default function ContainerForm({
  containerTypes,
  existing,
  onSave,
  onCancel,
  saving,
}: ContainerFormProps) {
  const [name, setName] = useState(existing?.name || '');
  const [containerType, setContainerType] = useState(existing?.containerType || 'Other');
  const [building, setBuilding] = useState(existing?.building || '');
  const [room, setRoom] = useState(existing?.room || '');
  const [shelf, setShelf] = useState(existing?.shelf || '');
  const [shelfRow, setShelfRow] = useState(existing?.shelfRow || '');
  const [estimatedCapacity, setEstimatedCapacity] = useState(existing?.estimatedCapacity?.toString() || '');
  const [capacityType, setCapacityType] = useState(existing?.capacityType || '');
  const [maxRecommendedItemCount, setMaxRecommendedItemCount] = useState(existing?.maxRecommendedItemCount?.toString() || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (existing) {
      setName(existing.name || '');
      setContainerType(existing.containerType || 'Other');
      setBuilding(existing.building || '');
      setRoom(existing.room || '');
      setShelf(existing.shelf || '');
      setShelfRow(existing.shelfRow || '');
      setEstimatedCapacity(existing.estimatedCapacity?.toString() || '');
      setCapacityType(existing.capacityType || '');
      setMaxRecommendedItemCount(existing.maxRecommendedItemCount?.toString() || '');
      setNotes(existing.notes || '');
    }
  }, [existing]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.trim().length > 100) {
      newErrors.name = 'Name must be 100 characters or less';
    }

    if (!containerType.trim()) {
      newErrors.containerType = 'Container type is required';
    }

    if (estimatedCapacity.trim()) {
      const cap = parseInt(estimatedCapacity, 10);
      if (isNaN(cap) || cap < 1 || cap > 999999) {
        newErrors.estimatedCapacity = 'Capacity must be between 1 and 999,999';
      }
    }

    if (maxRecommendedItemCount.trim()) {
      const max = parseInt(maxRecommendedItemCount, 10);
      if (isNaN(max) || max < 1 || max > 999999) {
        newErrors.maxRecommendedItemCount = 'Max recommended must be between 1 and 999,999';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const data: Partial<ContainerRecord> = {
      name: name.trim(),
      containerType: containerType.trim(),
      building: building.trim() || null,
      room: room.trim() || null,
      shelf: shelf.trim() || null,
      shelfRow: shelfRow.trim() || null,
      estimatedCapacity: estimatedCapacity.trim() ? parseInt(estimatedCapacity, 10) : null,
      capacityType: capacityType.trim() || null,
      maxRecommendedItemCount: maxRecommendedItemCount.trim() ? parseInt(maxRecommendedItemCount, 10) : null,
      notes: notes.trim() || null,
    };

    onSave(data);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border-color)',
    background: 'var(--glass-bg)',
    color: 'var(--text-primary)',
    fontSize: '0.85rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.82rem',
    fontWeight: 500,
    marginBottom: '4px',
    color: 'var(--text-primary)',
  };

  const errorStyle: React.CSSProperties = {
    fontSize: '0.75rem',
    color: '#ef4444',
    marginTop: '3px',
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
          {existing ? 'Edit Container' : 'Create Container'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
          aria-label="Close form"
        >
          <X size={18} />
        </button>
      </div>

      {/* Name */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>Name *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g., Tote 1, Shelf Bin A"
          maxLength={100}
          style={{ ...inputStyle, borderColor: errors.name ? '#ef4444' : 'var(--border-color)' }}
        />
        {errors.name && <div style={errorStyle}>{errors.name}</div>}
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{name.length}/100</div>
      </div>

      {/* Container Type */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={labelStyle}>Container Type *</label>
        <select
          value={containerType}
          onChange={e => setContainerType(e.target.value)}
          style={{ ...inputStyle, borderColor: errors.containerType ? '#ef4444' : 'var(--border-color)' }}
        >
          <option value="">Select type...</option>
          {containerTypes.map(t => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
        {errors.containerType && <div style={errorStyle}>{errors.containerType}</div>}
      </div>

      {/* Location Fields */}
      <div style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Location (optional)</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle}>Building</label>
          <input type="text" value={building} onChange={e => setBuilding(e.target.value)} placeholder="e.g., Home" maxLength={100} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Room</label>
          <input type="text" value={room} onChange={e => setRoom(e.target.value)} placeholder="e.g., Garage" maxLength={100} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Shelf</label>
          <input type="text" value={shelf} onChange={e => setShelf(e.target.value)} placeholder="e.g., C" maxLength={50} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Shelf Row</label>
          <input type="text" value={shelfRow} onChange={e => setShelfRow(e.target.value)} placeholder="e.g., 3" maxLength={50} style={inputStyle} />
        </div>
      </div>

      {/* Capacity Fields */}
      <div style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Capacity (optional)</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <label style={labelStyle}>Estimated Capacity</label>
          <input
            type="number"
            value={estimatedCapacity}
            onChange={e => setEstimatedCapacity(e.target.value)}
            placeholder="e.g., 50"
            min={1}
            max={999999}
            style={{ ...inputStyle, borderColor: errors.estimatedCapacity ? '#ef4444' : 'var(--border-color)' }}
          />
          {errors.estimatedCapacity && <div style={errorStyle}>{errors.estimatedCapacity}</div>}
        </div>
        <div>
          <label style={labelStyle}>Capacity Type</label>
          <select value={capacityType} onChange={e => setCapacityType(e.target.value)} style={inputStyle}>
            <option value="">Select...</option>
            {CAPACITY_TYPES.map(ct => (
              <option key={ct} value={ct}>{ct}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Max Recommended Items</label>
          <input
            type="number"
            value={maxRecommendedItemCount}
            onChange={e => setMaxRecommendedItemCount(e.target.value)}
            placeholder="e.g., 100"
            min={1}
            max={999999}
            style={{ ...inputStyle, borderColor: errors.maxRecommendedItemCount ? '#ef4444' : 'var(--border-color)' }}
          />
          {errors.maxRecommendedItemCount && <div style={errorStyle}>{errors.maxRecommendedItemCount}</div>}
        </div>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: '1.25rem' }}>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional notes about this container..."
          maxLength={1000}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{notes.length}/1000</div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'transparent',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'linear-gradient(135deg, #a855f7, #6366f1)',
            color: '#fff',
            fontSize: '0.85rem',
            fontWeight: 500,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Save size={14} />
          {saving ? 'Saving...' : existing ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  );
}
