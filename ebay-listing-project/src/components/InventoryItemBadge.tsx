// INV-002 follow-through — informational badge shown under a SKU input
// when the value matches a row in the seller's inventory. Pure: parent
// passes the lookup result through (typically from
// `useInventorySkuLookup`).
//
// This is intentionally NOT a warning — duplicate-SKU conflicts already
// fire `DuplicateSkuWarning`. The inventory badge is contextual info:
// "you already own N of these; M are currently listed; here's the source
// tag if you set one." Helps the seller distinguish a genuine duplicate
// from restocking the same SKU.

import { Package, RefreshCw } from 'lucide-react';
import type { InventoryItem } from '../hooks/useInventorySkuLookup';

export interface InventoryItemBadgeProps {
  item: InventoryItem | null;
  loading?: boolean;
  // Optional: when true, suppress the loading spinner so the badge does
  // not flicker while the seller types. Defaults to false.
  hideLoading?: boolean;
}

export default function InventoryItemBadge({ item, loading = false, hideLoading = false }: InventoryItemBadgeProps) {
  if (!item) {
    if (loading && !hideLoading) {
      return (
        <div
          role="status"
          aria-label="Checking inventory"
          style={{
            marginTop: '6px', padding: '6px 10px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <RefreshCw size={11} className="spin" aria-hidden="true" />
          <span>Checking inventory…</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      role="status"
      aria-label={`In inventory: ${item.quantityOnHand} on hand, ${item.quantityListed} listed, ${item.quantitySold} sold`}
      style={{
        marginTop: '6px',
        padding: '6px 10px',
        background: 'rgba(99, 102, 241, 0.10)',
        border: '1px solid rgba(99, 102, 241, 0.35)',
        borderRadius: '6px',
        fontSize: '0.78rem',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}
    >
      <Package size={12} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent-color)' }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          In inventory as <span style={{ fontFamily: 'monospace' }}>{item.displayedSku || item.sku}</span>
        </div>
        <div style={{ marginTop: '2px' }}>
          <strong style={{ color: 'var(--text-primary)' }}>{item.quantityOnHand} on hand</strong>
          {' · '}{item.quantityListed} listed
          {' · '}{item.quantitySold} sold
          {item.sourceTag && (
            <> · source: <em style={{ color: 'var(--text-primary)' }}>{item.sourceTag}</em></>
          )}
        </div>
      </div>
    </div>
  );
}
