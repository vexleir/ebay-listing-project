// FE-004 — shared filter / sort / paginate hook for the staging, listed,
// and sold tabs. Each tab supplies its own:
//   - filter predicate (search match, status filter, tag filter, etc.)
//   - sort comparator (date, price, title, health, ...)
//   - pagination size
//
// The hook owns the state. Filter resets pagination when the query or sort
// changes — matches the existing per-tab behavior so nothing visible
// changes when the tabs migrate to it.

import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';

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
  const [currentPage, setCurrentPageRaw] = useState(1);

  // Query setter always resets to page 1 so the visible window starts at the
  // top after a search change.
  const setQuery = (q: string) => {
    setQueryRaw(q);
    setCurrentPageRaw(1);
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

  const totalPages = perPage === 0 ? 1 : Math.max(1, Math.ceil(visible.length / perPage));

  // Clamp during render instead of via a setState-in-effect. When the result
  // set shrinks below the current page (e.g. after a bulk delete), we page
  // back to the last valid page on read — no effect, no cascading render.
  const clampedPage = Math.min(currentPage, totalPages);

  // Wrap the public setter so callers can pass either a value or an updater,
  // and the stored value always stays within [1, totalPages].
  const setCurrentPage: Dispatch<SetStateAction<number>> = (action) => {
    setCurrentPageRaw((prev) => {
      const next = typeof action === 'function' ? (action as (p: number) => number)(prev) : action;
      return Math.max(1, Math.min(next, totalPages));
    });
  };

  const paginated = perPage === 0
    ? visible
    : visible.slice((clampedPage - 1) * perPage, clampedPage * perPage);

  return {
    query,
    setQuery,
    perPage,
    setPerPage,
    currentPage: clampedPage,
    setCurrentPage,
    visible,
    paginated,
    totalPages,
    totalCount: items.length,
    filteredCount: visible.length,
  };
}
