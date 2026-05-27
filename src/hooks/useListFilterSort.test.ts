import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useListFilterSort } from './useListFilterSort';

interface Row { id: number; title: string; price: number }
const sample: Row[] = [
  { id: 1, title: 'Apple', price: 5 },
  { id: 2, title: 'Banana', price: 1 },
  { id: 3, title: 'Cherry', price: 3 },
  { id: 4, title: 'Apricot', price: 2 },
  { id: 5, title: 'Date', price: 4 },
];

describe('useListFilterSort', () => {
  it('returns all items unsorted when no filter or sort is given', () => {
    const { result } = renderHook(() => useListFilterSort<Row>({ items: sample, perPage: 0 }));
    expect(result.current.visible).toEqual(sample);
    expect(result.current.paginated).toEqual(sample);
    expect(result.current.totalCount).toBe(5);
    expect(result.current.filteredCount).toBe(5);
  });

  it('applies the filter predicate with a lowercased query', () => {
    const { result } = renderHook(() =>
      useListFilterSort<Row>({
        items: sample,
        filter: (r, q) => !q || r.title.toLowerCase().includes(q),
        perPage: 0,
      }),
    );
    act(() => result.current.setQuery('AP'));
    // "AP" → "ap" → Apple + Apricot
    expect(result.current.visible.map((r) => r.title).sort()).toEqual(['Apple', 'Apricot']);
  });

  it('applies the sort comparator', () => {
    const { result } = renderHook(() =>
      useListFilterSort<Row>({
        items: sample,
        sort: (a, b) => a.price - b.price,
        perPage: 0,
      }),
    );
    expect(result.current.visible.map((r) => r.price)).toEqual([1, 2, 3, 4, 5]);
  });

  it('paginates and clamps currentPage when the result set shrinks', () => {
    const { result, rerender } = renderHook(
      ({ items }) => useListFilterSort<Row>({ items, perPage: 2 }),
      { initialProps: { items: sample } },
    );
    // 5 items / 2 per page = 3 pages
    expect(result.current.totalPages).toBe(3);
    expect(result.current.paginated).toHaveLength(2);
    act(() => result.current.setCurrentPage(3));
    expect(result.current.currentPage).toBe(3);
    expect(result.current.paginated).toHaveLength(1); // last page has 1 item

    // Shrink the list — should clamp currentPage to the new max page.
    rerender({ items: sample.slice(0, 2) });
    expect(result.current.totalPages).toBe(1);
    expect(result.current.currentPage).toBe(1);
  });

  it('resets to page 1 when the query changes', () => {
    const { result } = renderHook(() =>
      useListFilterSort<Row>({
        items: sample,
        filter: (r, q) => !q || r.title.toLowerCase().includes(q),
        perPage: 2,
      }),
    );
    act(() => result.current.setCurrentPage(3));
    expect(result.current.currentPage).toBe(3);
    act(() => result.current.setQuery('a'));
    expect(result.current.currentPage).toBe(1);
  });

  it('perPage = 0 means show all (no pagination)', () => {
    const { result } = renderHook(() => useListFilterSort<Row>({ items: sample, perPage: 0 }));
    expect(result.current.totalPages).toBe(1);
    expect(result.current.paginated).toHaveLength(5);
  });
});
