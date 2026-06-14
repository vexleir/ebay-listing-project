// INTEL-003 — pure builder functions for `optimizer_actions` documents.
// Given before/after listing state + action metadata, produces the
// canonical optimizer_actions doc the intelligence module persists.
// Kept free of Mongo / fetch so the shape rules are trivially testable.

const VALID_ACTION_TYPES = ['revise', 'relist'];

/**
 * Strips $/whitespace and returns a stringified number when parsable.
 * Mirrors the normalizePrice logic from snapshot.js for consistency.
 */
function normalizePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== 'string') return null;
  const stripped = value.trim().replace(/^\$/, '').trim();
  if (!stripped) return null;
  const num = Number(stripped);
  return Number.isFinite(num) ? String(num) : null;
}

/**
 * Coerces a value to a non-negative integer count.
 * Handles numbers, arrays, and objects (key count).
 */
function toIntCount(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

/**
 * Extracts a snapshot from a listing object for the before/after fields.
 * Pure function — handles missing/null fields gracefully.
 *
 * @param {Object} listing - The listing payload
 * @returns {{ title: string|null, price: string|null, descriptionLength: number, itemSpecificsCount: number, imageCount: number }}
 */
function extractListingSnapshot(listing) {
  if (!listing || typeof listing !== 'object') {
    return {
      title: null,
      price: null,
      descriptionLength: 0,
      itemSpecificsCount: 0,
      imageCount: 0,
    };
  }

  const title = typeof listing.title === 'string' ? listing.title : null;
  const price = normalizePrice(listing.price ?? listing.priceRecommendation ?? null);

  // Description length: handle string description or pre-computed length
  let descriptionLength = 0;
  if (typeof listing.descriptionLength === 'number' && Number.isFinite(listing.descriptionLength) && listing.descriptionLength >= 0) {
    descriptionLength = Math.floor(listing.descriptionLength);
  } else if (typeof listing.description === 'string') {
    descriptionLength = listing.description.length;
  }

  const itemSpecificsCount = toIntCount(listing.itemSpecifics);
  const imageCount = toIntCount(listing.images);

  return {
    title,
    price,
    descriptionLength,
    itemSpecificsCount,
    imageCount,
  };
}

/**
 * Derives reason codes by diffing before and after snapshots.
 * Pure function.
 *
 * Derivation table:
 *   before.title !== after.title           → 'title_changed'
 *   before.price !== after.price           → 'price_changed'
 *   after.descriptionLength > before.descriptionLength → 'description_expanded'
 *   after.itemSpecificsCount > before.itemSpecificsCount → 'specifics_added'
 *   after.imageCount > before.imageCount   → 'images_added'
 *   after.imageCount < before.imageCount   → 'images_removed'
 *
 * @param {Object} before - Before snapshot
 * @param {Object} after - After snapshot
 * @returns {string[]} - e.g. ['title_changed', 'price_changed', 'specifics_added']
 */
function deriveReasonCodes(before, after) {
  const codes = [];

  if (!before || !after) return codes;

  if (before.title !== after.title) {
    codes.push('title_changed');
  }

  if (before.price !== after.price) {
    codes.push('price_changed');
  }

  if (after.descriptionLength > before.descriptionLength) {
    codes.push('description_expanded');
  }

  if (after.itemSpecificsCount > before.itemSpecificsCount) {
    codes.push('specifics_added');
  }

  if (after.imageCount > before.imageCount) {
    codes.push('images_added');
  }

  if (after.imageCount < before.imageCount) {
    codes.push('images_removed');
  }

  return codes;
}

/**
 * Normalizes actionType to one of the valid values ('revise' | 'relist').
 * Defaults to 'revise' for unrecognized values.
 */
function normalizeActionType(actionType) {
  if (typeof actionType !== 'string') return 'revise';
  const lower = actionType.trim().toLowerCase();
  if (VALID_ACTION_TYPES.includes(lower)) return lower;
  return 'revise';
}

/**
 * Builds an optimizer_actions document from the before/after state.
 * Pure function — no I/O.
 *
 * Validates required fields: companyId, listingId, ebayItemId, actionType.
 * Throws on missing required fields.
 *
 * @param {Object} params
 * @param {string} params.id - UUID for the action
 * @param {string} params.companyId
 * @param {string} params.listingId
 * @param {string} params.ebayItemId
 * @param {string} params.actionType - 'revise' | 'relist'
 * @param {Object} params.before - Before snapshot
 * @param {Object} params.after - After snapshot
 * @param {string[]} [params.reasonCodes] - Pre-computed reason codes (derived if not provided)
 * @param {Object} [params.expectedImpact] - { scoreChange?, priceChange? }
 * @param {Function} [params.now] - Override for current time (for tests)
 * @returns {Object} - The optimizer_actions document
 */
function buildOptimizerAction({
  id,
  companyId,
  listingId,
  ebayItemId,
  actionType,
  before,
  after,
  reasonCodes,
  expectedImpact,
  now = () => new Date().toISOString(),
} = {}) {
  // Validate required fields
  if (!companyId) throw new Error('companyId is required');
  if (!listingId) throw new Error('listingId is required');
  if (!ebayItemId) throw new Error('ebayItemId is required');
  if (!actionType) throw new Error('actionType is required');

  const timestamp = typeof now === 'function' ? now() : new Date().toISOString();
  const normalizedType = normalizeActionType(actionType);

  // Derive reason codes from snapshots if not explicitly provided
  const codes = Array.isArray(reasonCodes) ? reasonCodes : deriveReasonCodes(before, after);

  // Normalize expectedImpact
  const impact = expectedImpact && typeof expectedImpact === 'object'
    ? {
        scoreChange: typeof expectedImpact.scoreChange === 'number' && Number.isFinite(expectedImpact.scoreChange)
          ? expectedImpact.scoreChange
          : null,
        priceChange: typeof expectedImpact.priceChange === 'number' && Number.isFinite(expectedImpact.priceChange)
          ? expectedImpact.priceChange
          : null,
      }
    : { scoreChange: null, priceChange: null };

  return {
    id: id ? String(id) : null,
    companyId: String(companyId),
    listingId: String(listingId),
    ebayItemId: String(ebayItemId),
    createdAt: timestamp,
    appliedAt: timestamp,
    actionType: normalizedType,
    beforeSnapshot: before || { title: null, price: null, descriptionLength: 0, itemSpecificsCount: 0, imageCount: 0 },
    afterSnapshot: after || { title: null, price: null, descriptionLength: 0, itemSpecificsCount: 0, imageCount: 0 },
    reasonCodes: codes,
    expectedImpact: impact,
  };
}

module.exports = {
  extractListingSnapshot,
  deriveReasonCodes,
  buildOptimizerAction,
  // Re-exported for tests + downstream callers
  normalizePrice,
  normalizeActionType,
  toIntCount,
};
