// INV-002 sold-sync counter wiring — pure transition detector. Given the
// existing listing doc + the partial updates payload, returns the inventory
// deltas to apply (or null when no transition crosses the sold boundary).
//
// State transitions tracked:
//
//   previously NOT sold  → now sold       → { quantitySold: +1, quantityListed: −1 }
//   previously sold      → now NOT sold   → { quantitySold: −1, quantityListed: +1 }
//                                           (sellers can unmark via the UI or
//                                            the "Move to Staged" flow)
//
// Anything else (price-only edits, image swaps, condition tweaks, etc.) is a
// no-op. Returns `null` so the caller can skip the inventory call entirely.

// Was the listing in the "sold" bucket? We use `soldAt` as the source of
// truth — that's what the frontend writes when the seller marks an item
// sold either manually or via the auto sync.
function isSoldState(record) {
  if (!record || typeof record !== 'object') return false;
  const ts = record.soldAt;
  if (ts === null || ts === undefined) return false;
  if (typeof ts === 'number') return ts > 0;
  if (typeof ts === 'string') return ts.trim() !== '';
  return Boolean(ts);
}

// Returns:
//   { sku, deltas } when a sold transition crosses the boundary
//   null otherwise
function detectSoldTransition(existing, updates) {
  if (!existing || !updates || typeof updates !== 'object') return null;

  // The updates payload only mentions soldAt when the seller is touching
  // the sold state. We rely on the frontend convention: `soldAt: <number>`
  // to mark sold, `soldAt: null` to unmark.
  if (!('soldAt' in updates)) return null;

  const wasSold = isSoldState(existing);
  const willBeSold = isSoldState({ soldAt: updates.soldAt });

  if (wasSold === willBeSold) return null;

  const sku = existing.sku;
  if (typeof sku !== 'string' || !sku.trim()) return null;

  if (!wasSold && willBeSold) {
    return { sku, deltas: { quantitySold: 1, quantityListed: -1 } };
  }
  // wasSold && !willBeSold
  return { sku, deltas: { quantitySold: -1, quantityListed: 1 } };
}

// INV-002 end-listing counter wiring — when a listed item is moved back to
// staged (the explicit "Move to Staged" flow), the unit returns to the
// shelf. Detector returns the deltas for the route to apply, or null when
// the update doesn't cross the listed→staged boundary.
//
// Skip the transition when the item is also being marked sold in the same
// PUT — the sold transition is the primary signal there and double-firing
// would compound the listed decrement.
function detectListedToStagedTransition(existing, updates) {
  if (!existing || !updates || typeof updates !== 'object') return null;
  if (!('status' in updates)) return null;
  const wasListed = existing.status === 'listed';
  const willBeStaged = updates.status === 'staged';
  if (!wasListed || !willBeStaged) return null;
  // If the same update also marks the item sold, defer to the sold
  // transition — that one writes both `quantitySold +1` and
  // `quantityListed −1`, which already covers the listed decrement.
  if ('soldAt' in updates && updates.soldAt) return null;
  // Already-sold items live in a different bucket; moving an archived sold
  // item back to staged shouldn't restore a unit to on-hand.
  if (isSoldState(existing)) return null;
  const sku = existing.sku;
  if (typeof sku !== 'string' || !sku.trim()) return null;
  return { sku, deltas: { quantityOnHand: 1, quantityListed: -1 } };
}

module.exports = {
  isSoldState,
  detectSoldTransition,
  detectListedToStagedTransition,
};
