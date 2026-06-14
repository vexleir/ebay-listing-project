import { useState } from 'react';
import { Search, Filter } from 'lucide-react';

export interface ContainerRecord {
  id: string;
  name: string;
  containerType: string;
  status: string;
  active: boolean;
  building: string | null;
  room: string | null;
  shelf: string | null;
  shelfRow: string | null;
  estimatedCapacity: number | null;
  capacityType: string | null;
  currentItemCount: number;
  fullnessPercentage: number | null;
  maxRecommendedItemCount: number | null;
  capacityNotes: string | null;
  notes: string | null;
  barcodeValue: string | null;
  qrCodeValue: string | null;
  printableLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContainerType {
  name: string;
  isDefault: boolean;
  companyId: string;
  createdAt: string;
}

const STATUS_OPTIONS = ['Active', 'In Use', 'Full', 'Overflow', 'Archived', 'Missing', 'Needs Verification'];

const STATUS_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  Active: { bg: 'rgba(34,197,94,0.15)', fg: '#86efac', border: 'rgba(34,197,94,0.4)' },
  'In Use': { bg: 'rgba(59,130,246,0.15)', fg: '#93c5fd', border: 'rgba(59,130,246,0.4)' },
  Full: { bg: 'rgba(245,158,11,0.15)', fg: '#fcd34d', border: 'rgba(245,158,11,0.4)' },
  Overflow: { bg: 'rgba(239,68,68,0.15)', fg: '#fca5a5', border: 'rgba(239,68,68,0.4)' },
  Archived: { bg: 'rgba(148,163,184,0.15)', fg: '#cbd5e1', border: 'rgba(148,163,184,0.4)' },
  Missing: { bg: 'rgba(168,85,247,0.15)', fg: '#d8b4fe', border: 'rgba(168,85,247,0.4)' },
  'Needs Verification': { bg: 'rgba(251,146,60,0.15)', fg: '#fdba74', border: 'rgba(251,146,60,0.4)' },
};

interface ContainerListProps {
  containers: ContainerRecord[];
  containerTypes: ContainerType[];
  loading: boolean;
  onSelect: (container: ContainerRecord) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
}

export default function ContainerList({
  containers,
  containerTypes,
  loading,
  onSelect,
  statusFilter,
  onStatusFilterChange,
  typeFilter,
  onTypeFilterChange,
}: ContainerListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = containers.filter(c => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!c.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const formatLocation = (c: ContainerRecord): string => {
    const parts: string[] = [];
    if (c.building) parts.push(c.building);
    if (c.room) parts.push(c.room);
    if (c.shelf) parts.push(`Shelf ${c.shelf}`);
    if (c.shelfRow) parts.push(`Row ${c.shelfRow}`);
    return parts.join(' - ') || '—';
  };

  const getFullnessDisplay = (c: ContainerRecord): string => {
    if (c.fullnessPercentage != null) return `${c.fullnessPercentage}%`;
    return '—';
  };

  const getFullnessColor = (c: ContainerRecord): string => {
    if (c.fullnessPercentage == null) return 'var(--text-secondary)';
    if (c.fullnessPercentage >= 100) return '#ef4444';
    if (c.fullnessPercentage >= 80) return '#f59e0b';
    if (c.fullnessPercentage >= 50) return '#3b82f6';
    return '#22c55e';
  };

  return (
    <div>
      {/* Filters Row */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Search containers..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 32px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--glass-bg)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          />
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Filter size={14} style={{ color: 'var(--text-secondary)' }} />
          <select
            value={statusFilter}
            onChange={e => onStatusFilterChange(e.target.value)}
            style={{
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--glass-bg)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Type Filter */}
        <select
          value={typeFilter}
          onChange={e => onTypeFilterChange(e.target.value)}
          style={{
            padding: '8px 10px',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            background: 'var(--glass-bg)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
          }}
        >
          <option value="">All Types</option>
          {containerTypes.map(t => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading containers...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          {containers.length === 0 ? 'No containers yet. Create one to get started.' : 'No containers match your filters.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Type</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Status</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Location</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Items</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', color: 'var(--text-secondary)', fontWeight: 500 }}>Fullness</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const statusColor = STATUS_COLORS[c.status] || STATUS_COLORS.Active;
                return (
                  <tr
                    key={c.id}
                    onClick={() => onSelect(c)}
                    style={{ borderBottom: '1px solid var(--border-color)', cursor: 'pointer', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--glass-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 500 }}>{c.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{c.containerType}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '2px 10px', borderRadius: '999px',
                        fontSize: '0.72rem', fontWeight: 600,
                        background: statusColor.bg, color: statusColor.fg, border: `1px solid ${statusColor.border}`,
                        whiteSpace: 'nowrap',
                      }}>{c.status}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {formatLocation(c)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{c.currentItemCount}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: getFullnessColor(c) }}>
                      {getFullnessDisplay(c)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        {filtered.length} container{filtered.length !== 1 ? 's' : ''}{searchQuery || statusFilter || typeFilter ? ' (filtered)' : ''}
      </div>
    </div>
  );
}
