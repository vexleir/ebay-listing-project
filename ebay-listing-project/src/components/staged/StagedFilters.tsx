// FE-001e — search input + sort dropdown extracted from StagedListings.
// Owns no state of its own; the parent (or the useListFilterSort hook)
// supplies search and sort plus their setters.

import { Search, ChevronDown } from 'lucide-react';
import type { SortOption } from './helpers';

export interface StagedFiltersProps {
  search: string;
  onSearchChange: (q: string) => void;
  sortBy: SortOption;
  onSortChange: (s: SortOption) => void;
}

export default function StagedFilters({ search, onSearchChange, sortBy, onSortChange }: StagedFiltersProps) {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
        <Search
          size={15}
          aria-hidden="true"
          style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }}
        />
        <input
          type="text"
          className="input-base"
          placeholder="Search title, SKU, category..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search staged listings"
          style={{ paddingLeft: '32px' }}
        />
      </div>
      <div style={{ position: 'relative' }}>
        <select
          className="input-base"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          aria-label="Sort staged listings"
          style={{ paddingRight: '2rem', appearance: 'none', cursor: 'pointer', minWidth: '180px' }}
        >
          <option value="date-desc">Date: Newest First</option>
          <option value="date-asc">Date: Oldest First</option>
          <option value="price-desc">Price: High → Low</option>
          <option value="price-asc">Price: Low → High</option>
          <option value="title-asc">Title: A → Z</option>
          <option value="health-asc">Health Score: Lowest First</option>
        </select>
        <ChevronDown
          size={13}
          aria-hidden="true"
          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }}
        />
      </div>
    </div>
  );
}
