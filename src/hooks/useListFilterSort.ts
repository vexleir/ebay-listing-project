// FE-004 — shared filter / sort / paginate hook for the staging, listed,
// and sold tabs. Each tab supplies its own:
//   - filter predicate (search match, status filter, tag filter, etc.)
//   - sort comparator (date, price, title, health, ...)
//   - pagination size
//
// The hook owns the state. Filter resets pagination when the query or sort
// changes — matches the existing per-tab behavior so nothing visible
// changes when the tabs migrate to it.

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';

export interface UseListFilterSortOptions<T> {
  items: T[];
  // Return true to KEEP the item. Receives the lowercased search query so
  // callers don't have to lowercase repeatedly.
  filter?: (item: T, query: string) => boolean;
  // Standard Array.sort comparator.
  sort?: (a: T, b: T) => number;
  // Page size in items. 0 means "show all".
  perPage?: number;
  // Optional initial search query (rarely useful; defaults to '').
  initialQuery?: string;
}

export interface UseListFilterSortResult<T> {
  query: string;
  setQuery: (q: string) => void;
  perPage: number;
  setPerPage: Dispatch<SetStateAction<number>>;
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  visible: T[];        // filtered + sorted
  paginated: T[];      // visible sliced to current page
  totalPages: number;
  totalCount: number;  // items.length
  filteredCount: number;
}

export function useListFilterSort<T>({
  items,
  filter,
  sort,
  perPage: initialPerPage = 20,
  initialQuery = '',
}: UseListFilterSortOptions<T>): UseListFilterSortResult<T> {
  const [query, setQueryRaw] = useState(initialQuery);
  const [perPage, setPerPage] = useState(initialPerPage);
  const [currentPage, setCurrentPage] = useState(1);

  // Query setter always resets to page 1 so the two effects (query-reset
  // and clamp-to-max) can't race against each other.
  const setQuery = (q: string) => {
    setQueryRaw(q);
    setCurrentPage(1);
  };

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    let out = items;
    if (filter) {
      out = out.filter((item) => filter(item, q));
    }
    if (sort) {
      out = out.slice().sort(sort);
    }
    return out;
  }, [items, query, filter, sort]);

  // Clamp the current page if the result set shrinks below it (e.g. bulk-
  // delete leaves the user past the new last page).
  useEffect(() => {
    if (perPage === 0) return;
    const max = Math.max(1, Math.ceil(visible.length / perPage));
    if (currentPage > max) setCurrentPage(max);
  }, [visible.length, perPage, currentPage]);

  const totalPages = perPage === 0 ? 1 : Math.max(1, Math.ceil(visible.length / perPage));
  const paginated = perPage === 0
    ? visible
    : visible.slice((currentPage - 1) * perPage, currentPage * perPage);

  return {
    query,
    setQuery,
    perPage,
    setPerPage,
    currentPage,
    setCurrentPage,
    visible,
    paginated,
    totalPages,
    totalCount: items.length,
    filteredCount: visible.length,
  };
}
