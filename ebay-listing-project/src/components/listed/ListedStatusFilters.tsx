import type { ListedStatusFilter } from './helpers';

export interface ListedStatusFiltersProps {
  statusFilter: ListedStatusFilter;
  counts: Record<ListedStatusFilter, number>;
  onStatusFilterChange: (filter: ListedStatusFilter) => void;
}

export default function ListedStatusFilters({ statusFilter, counts, onStatusFilterChange }: ListedStatusFiltersProps) {
  const labels: Record<ListedStatusFilter, string> = { all: 'All', active: 'Active', ended: 'Ended' };
  const colors: Record<ListedStatusFilter, string> = { all: 'var(--accent)', active: 'var(--success)', ended: 'var(--text-secondary)' };

  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
      {(['all', 'active', 'ended'] as ListedStatusFilter[]).map((filter) => {
        const isActive = statusFilter === filter;
        return (
          <button
            key={filter}
            onClick={() => onStatusFilterChange(filter)}
            style={{
              fontSize: '0.82rem',
              padding: '4px 12px',
              borderRadius: '20px',
              border: '1px solid',
              cursor: 'pointer',
              background: isActive ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
              borderColor: isActive ? colors[filter] : 'var(--border-color)',
              color: isActive ? colors[filter] : 'var(--text-secondary)',
              fontWeight: isActive ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {labels[filter]} <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>({counts[filter]})</span>
          </button>
        );
      })}
    </div>
  );
}
