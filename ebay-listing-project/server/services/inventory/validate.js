// INV-001 — pure validation + normalization for inventory items. Kept
// free of Mongo so the rules are trivially testable.
//
// Schema (one document per physical SKU per company):
//   id              — caller-supplied UUID; matches the listings pattern
//   companyId       — tenant key
//   sku             — required, stored lowercase + trimmed; user-facing
//                     displayedSku preserves the original case
//   displayedSku    — original case/format as the seller typed it
//   quantityOnHand  — total physical units the seller owns
//   quantityListed  — units currently live on a marketplace (eBay etc.)
//   quantitySold    — lifetime sold count
//   costBasis       — per-unit acquisition cost (string for currency safety)
//   sourceTag       — short identifier (e.g. "estate-sale-2026-05")
//   sourceEvent     — free-text source description
//   createdAt       — ISO timestamp
//   updatedAt       — ISO timestamp

// Lowercase + trim. Returns '' for falsy / non-string input. This is the
// canonical lookup form; comparisons across listings should always
// normalize first.
function normalizeInventorySku(sku) {
  if (typeof sku !== 'string') return '';
  return sku.trim().toLowerCase();
}

function coerceNonNegativeInt(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function coerceCurrencyString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Strip $ and whitespace; keep the rest for the caller's format check.
  return trimmed.replace(/^\$/, '').trim();
}

// Returns { valid: boolean, errors: string[] }. Errors are user-facing.
function validateInventoryItem(input) {
  const errors = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['inventory item must be an object'] };
  }
  if (!input.id || typeof input.id !== 'string') {
    errors.push('id is required');
  }
  const skuNormalized = normalizeInventorySku(input.sku);
  if (!skuNormalized) {
    errors.push('sku is required');
  }
  // quantities default to 0 if missing; explicit negatives are a real error.
  for (const field of ['quantityOnHand', 'quantityListed', 'quantitySold']) {
    if (input[field] !== undefined && input[field] !== null && input[field] !== '') {
      const n = Number(input[field]);
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`${field} must be a non-negative integer`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// Fills defaults and normalizes the user-supplied shape into the canonical
// document we persist. Caller is responsible for supplying `id` and
// `companyId`. Returns the new doc (does NOT mutate the input).
function buildInventoryItemDoc(companyId, input, { now = () => new Date().toISOString() } = {}) {
  const timestamp = now();
  const skuRaw = typeof input.sku === 'string' ? input.sku.trim() : '';
  return {
    id: String(input.id),
    companyId: String(companyId),
    sku: normalizeInventorySku(input.sku),
    displayedSku: skuRaw,
    quantityOnHand: coerceNonNegativeInt(input.quantityOnHand, 0),
    quantityListed: coerceNonNegativeInt(input.quantityListed, 0),
    quantitySold: coerceNonNegativeInt(input.quantitySold, 0),
    costBasis: coerceCurrencyString(input.costBasis),
    sourceTag: typeof input.sourceTag === 'string' ? input.sourceTag.trim() : '',
    sourceEvent: typeof input.sourceEvent === 'string' ? input.sourceEvent.trim() : '',
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

// Sanitizes update payloads so callers can pass partial fields without
// risk of overwriting companyId / id / createdAt. Counter fields go
// through coerceNonNegativeInt; SKU gets re-normalized. Returns a NEW
// object containing only the fields the caller actually set (so $set
// doesn't blow away unrelated fields).
function buildInventoryItemUpdates(input, { now = () => new Date().toISOString() } = {}) {
  if (!input || typeof input !== 'object') return null;
  const out = {};
  if (input.sku !== undefined) {
    out.sku = normalizeInventorySku(input.sku);
    out.displayedSku = typeof input.sku === 'string' ? input.sku.trim() : '';
  }
  for (const field of ['quantityOnHand', 'quantityListed', 'quantitySold']) {
    if (input[field] !== undefined) out[field] = coerceNonNegativeInt(input[field], 0);
  }
  if (input.costBasis !== undefined) out.costBasis = coerceCurrencyString(input.costBasis);
  if (input.sourceTag !== undefined) {
    out.sourceTag = typeof input.sourceTag === 'string' ? input.sourceTag.trim() : '';
  }
  if (input.sourceEvent !== undefined) {
    out.sourceEvent = typeof input.sourceEvent === 'string' ? input.sourceEvent.trim() : '';
  }
  out.updatedAt = now();
  return out;
}

module.exports = {
  normalizeInventorySku,
  coerceNonNegativeInt,
  coerceCurrencyString,
  validateInventoryItem,
  buildInventoryItemDoc,
  buildInventoryItemUpdates,
};
