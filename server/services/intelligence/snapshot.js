// INTEL-001 — pure snapshot builder for a `listing_experiments` row.
// Given the listing payload + the eBay push outcome + the push request
// context (settings / overrides), returns the canonical experiment doc
// the intelligence module persists. Kept free of Mongo / fetch so the
// shape rules are trivially testable.
//
// Schema:
//   id                   — caller-supplied UUID; matches the listings pattern
//   companyId            — tenant key
//   listingId            — local DB id of the listing this experiment tracks
//   ebayItemId           — the eBay item ID returned by AddFixedPriceItem
//   source               — 'push' | 'relist' (so analytics can split first
//                           publishes from relists)
//   createdAt            — ISO timestamp when the experiment row was written
//   publishedAt          — ISO timestamp of the push success (same as
//                          createdAt unless the caller back-dates it)
//   promptVersion        — version string from the AI generation that
//                          produced this listing, or null when unknown
//   optimizerVersion     — version string from the last optimizer run, or
//                          null when the listing was never optimized
//   listingScoreAtPublish— health score 0..100 if the caller had one, else null
//   titleLength          — character count of the title at push time
//   categoryId           — eBay category id used for the push
//   categoryName         — local DB's category label, free text
//   priceAtPublish       — currency string (no $)
//   shippingPolicyId     — fulfillment policy used for the push, or null
//   bestOfferEnabled     — whether the push enabled Best Offer
//   itemSpecificsCount   — count of non-empty item specifics
//   imageCount           — count of images on the listing at push time
//   tags                 — copy of the listing's tags array (deduped)

function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return value;
}

function toIntCount(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

// Strips $/whitespace + returns a stringified number when parsable. Used
// because the listings store the price as a free-text string and we want
// the experiment record to be a clean numeric string for downstream math.
function normalizePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== 'string') return null;
  const stripped = value.trim().replace(/^\$/, '').trim();
  if (!stripped) return null;
  const num = Number(stripped);
  return Number.isFinite(num) ? String(num) : null;
}

function uniqueStrings(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

// Build the experiment doc. Required: companyId, id, listing, ebayItemId.
// Optional: pushContext (categoryId/shippingPolicyId/bestOfferEnabled),
// score, source ('push' | 'relist'), now (override for tests).
function buildExperimentSnapshot({
  id,
  companyId,
  listing,
  ebayItemId,
  pushContext = {},
  promptVersion = null,
  optimizerVersion = null,
  listingScoreAtPublish = null,
  source = 'push',
  now = () => new Date().toISOString(),
} = {}) {
  if (!id) throw new Error('experiment id required');
  if (!companyId) throw new Error('companyId required');
  if (!listing || typeof listing !== 'object') throw new Error('listing required');
  if (!ebayItemId) throw new Error('ebayItemId required');

  const timestamp = now();

  return {
    id: String(id),
    companyId: String(companyId),
    listingId: String(listing.id || ''),
    ebayItemId: String(ebayItemId),
    source: source === 'relist' ? 'relist' : 'push',
    createdAt: timestamp,
    publishedAt: timestamp,
    promptVersion: clean(promptVersion),
    optimizerVersion: clean(optimizerVersion),
    listingScoreAtPublish: typeof listingScoreAtPublish === 'number' && Number.isFinite(listingScoreAtPublish)
      ? listingScoreAtPublish
      : null,
    titleLength: typeof listing.title === 'string' ? listing.title.length : 0,
    categoryId: clean(pushContext.categoryId ?? listing.categoryId),
    categoryName: clean(listing.category),
    priceAtPublish: normalizePrice(listing.priceRecommendation),
    shippingPolicyId: clean(pushContext.shippingPolicyId ?? listing.fulfillmentPolicyId),
    bestOfferEnabled: !!pushContext.bestOfferEnabled,
    itemSpecificsCount: toIntCount(listing.itemSpecifics),
    imageCount: toIntCount(listing.images),
    tags: uniqueStrings(listing.tags),
  };
}

module.exports = {
  buildExperimentSnapshot,
  // Re-exported for tests + downstream callers that need the same
  // normalization without rebuilding the whole doc.
  normalizePrice,
  uniqueStrings,
  toIntCount,
};
