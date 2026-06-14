import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInventorySkuLookup } from './useInventorySkuLookup';

function fakeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv1',
    sku: 'abc-001',
    displayedSku: 'ABC-001',
    quantityOnHand: 3,
    quantityListed: 1,
    quantitySold: 2,
    costBasis: '5.00',
    sourceTag: '',
    sourceEvent: '',
    createdAt: '2026-05-29T00:00:00.000Z',
    updatedAt: '2026-05-29T00:00:00.000Z',
    ...overrides,
  };
}

describe('useInventorySkuLookup', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('returns idle state for an empty SKU', () => {
    const { result } = renderHook(() => useInventorySkuLookup('', 'tok'));
    expect(result.current).toEqual({ item: null, loading: false, error: null });
  });

  it('returns idle state for whitespace-only SKU', () => {
    const { result } = renderHook(() => useInventorySkuLookup('   ', 'tok'));
    expect(result.current).toEqual({ item: null, loading: false, error: null });
  });

  it('returns loading=true while the debounce timer is pending', () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(fakeItem()), { status: 200 }));
    const { result } = renderHook(() => useInventorySkuLookup('ABC', 'tok', 1000));
    expect(result.current.loading).toBe(true);
    expect(result.current.item).toBeNull();
  });

  it('fetches the inventory item after the debounce fires', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(fakeItem()), { status: 200 }));
    global.fetch = fetchSpy;
    const { result } = renderHook(() => useInventorySkuLookup('ABC-001', 'tok-xyz', 10));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.item?.sku).toBe('abc-001');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/inventory/by-sku/ABC-001');
    expect(fetchSpy.mock.calls[0][1].headers.Authorization).toBe('Bearer tok-xyz');
  });

  it('URL-encodes the SKU before requesting', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    global.fetch = fetchSpy;
    renderHook(() => useInventorySkuLookup('a/b c', 'tok', 10));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/inventory/by-sku/a%2Fb%20c');
  });

  it('treats a 404 as "not found", not an error', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const { result } = renderHook(() => useInventorySkuLookup('NOPE', 'tok', 10));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.item).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('surfaces unexpected HTTP failures via `error`', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    const { result } = renderHook(() => useInventorySkuLookup('OOPS', 'tok', 10));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.item).toBeNull();
    expect(result.current.error).toMatch(/Inventory lookup failed \(500\)/);
  });

  it('surfaces fetch rejection via `error`', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useInventorySkuLookup('OFFLINE', 'tok', 10));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('offline');
  });

  it('cancels the previous in-flight request when SKU changes before debounce fires', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(fakeItem()), { status: 200 }));
    global.fetch = fetchSpy;
    const { rerender } = renderHook(({ sku }) => useInventorySkuLookup(sku, 'tok', 300), {
      initialProps: { sku: 'AAA' },
    });
    // Half-way through the debounce, the SKU changes.
    act(() => { vi.advanceTimersByTime(150); });
    rerender({ sku: 'BBB' });
    act(() => { vi.advanceTimersByTime(300); });
    // The first timer never fired; only the second-SKU request goes out.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe('/api/inventory/by-sku/BBB');
  });

  it('does not fire the fetch when the hook unmounts before the debounce timer', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify(fakeItem()), { status: 200 }));
    global.fetch = fetchSpy;
    const { unmount } = renderHook(() => useInventorySkuLookup('ABC', 'tok', 500));
    unmount();
    act(() => { vi.advanceTimersByTime(500); });
    // The debounced fetch was cleared on unmount — no request goes out.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('clears state immediately when SKU goes from set → blank', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(fakeItem()), { status: 200 }));
    const { result, rerender } = renderHook(({ sku }) => useInventorySkuLookup(sku, 'tok', 10), {
      initialProps: { sku: 'ABC' },
    });
    await waitFor(() => expect(result.current.item).not.toBeNull());
    rerender({ sku: '' });
    expect(result.current).toEqual({ item: null, loading: false, error: null });
  });
});
