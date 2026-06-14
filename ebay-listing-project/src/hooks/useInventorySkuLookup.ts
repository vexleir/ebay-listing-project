// INV-002 follow-through — debounced lookup of a SKU against the
// `/api/inventory/by-sku/:sku` endpoint introduced under INV-001.
//
// The hook returns `{ item, loading, error }`:
//   - `item: InventoryItem | null` — the canonical inventory record, or
//     null when the SKU isn't in inventory yet (404 is treated as "not
//     found", not an error).
//   - `loading: boolean` — true while the debounce timer is pending OR
//     the fetch is in flight.
//   - `error: string | null` — non-null only for unexpected failures
//     (network, 500, etc). 404 stays null.
//
// In-flight requests are cancelled when the SKU changes again before the
// debounce fires, so the user can type quickly without spamming the
// backend or seeing stale results land out of order.

import { useEffect, useState } from 'react';

export interface InventoryItem {
  id: string;
  sku: string;
  displayedSku: string;
  quantityOnHand: number;
  quantityListed: number;
  quantitySold: number;
  costBasis: string;
  sourceTag: string;
  sourceEvent: string;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLookupState {
  item: InventoryItem | null;
  loading: boolean;
  error: string | null;
}

const DEFAULT_DEBOUNCE_MS = 300;

export function useInventorySkuLookup(
  sku: string,
  appPassword: string,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): InventoryLookupState {
  const [state, setState] = useState<InventoryLookupState>({ item: null, loading: false, error: null });

  useEffect(() => {
    const trimmed = (sku || '').trim();
    if (!trimmed) {
      setState({ item: null, loading: false, error: null });
      return;
    }

    // Show the loading state immediately so the UI can dim the existing
    // badge while the debounce + fetch run; this beats showing stale
    // info during keystrokes.
    setState((prev) => ({ ...prev, loading: true, error: null }));

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch(`/api/inventory/by-sku/${encodeURIComponent(trimmed)}`, {
          headers: { Authorization: `Bearer ${appPassword}` },
        });
        if (cancelled) return;
        if (resp.status === 404) {
          setState({ item: null, loading: false, error: null });
          return;
        }
        if (!resp.ok) {
          setState({ item: null, loading: false, error: `Inventory lookup failed (${resp.status})` });
          return;
        }
        const data = await resp.json();
        setState({ item: data as InventoryItem, loading: false, error: null });
      } catch (e: any) {
        if (cancelled) return;
        setState({ item: null, loading: false, error: e?.message || 'inventory lookup failed' });
      }
    }, debounceMs);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [sku, appPassword, debounceMs]);

  return state;
}
