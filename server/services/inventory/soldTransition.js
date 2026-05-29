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

module.exports = {
  isSoldState,
  detectSoldTransition,
};
