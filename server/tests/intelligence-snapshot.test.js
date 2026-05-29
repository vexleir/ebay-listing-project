// INTEL-001 — unit tests for the pure experiment-snapshot builder.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildExperimentSnapshot,
  normalizePrice,
  uniqueStrings,
  toIntCount,
} = require('../services/intelligence/snapshot');

// ── normalizePrice ────────────────────────────────────────────────────────

test('normalizePrice strips $ and trims', () => {
  assert.equal(normalizePrice('$12.99'), '12.99');
  assert.equal(normalizePrice('  $50  '), '50');
});

test('normalizePrice handles finite numbers', () => {
  assert.equal(normalizePrice(7.5), '7.5');
  assert.equal(normalizePrice(0), '0');
});

test('normalizePrice returns null for empty / non-finite / non-numeric input', () => {
  assert.equal(normalizePrice(null), null);
  assert.equal(normalizePrice(undefined), null);
  assert.equal(normalizePrice(''), null);
  assert.equal(normalizePrice('abc'), null);
  assert.equal(normalizePrice(NaN), null);
  assert.equal(normalizePrice({}), null);
});

// ── uniqueStrings ─────────────────────────────────────────────────────────

test('uniqueStrings dedupes preserving first-seen order', () => {
  assert.deepEqual(uniqueStrings(['a', 'b', 'a', 'c', 'b']), ['a', 'b', 'c']);
});

test('uniqueStrings trims and drops blanks', () => {
  assert.deepEqual(uniqueStrings(['  hello  ', '', '   ', 'world']), ['hello', 'world']);
});

test('uniqueStrings returns empty for non-array input', () => {
  assert.deepEqual(uniqueStrings(null), []);
  assert.deepEqual(uniqueStrings(undefined), []);
  assert.deepEqual(uniqueStrings('not-an-array'), []);
});

// ── toIntCount ────────────────────────────────────────────────────────────

test('toIntCount returns finite non-negative numbers floored', () => {
  assert.equal(toIntCount(3), 3);
  assert.equal(toIntCount(2.9), 2);
});

test('toIntCount returns the length of an array', () => {
  assert.equal(toIntCount(['a', 'b', 'c']), 3);
  assert.equal(toIntCount([]), 0);
});

test('toIntCount returns the key count of a plain object', () => {
  assert.equal(toIntCount({ a: 1, b: 2 }), 2);
  assert.equal(toIntCount({}), 0);
});

test('toIntCount returns 0 for null / undefined / strings / negatives', () => {
  assert.equal(toIntCount(null), 0);
  assert.equal(toIntCount(undefined), 0);
  assert.equal(toIntCount('x'), 0);
  assert.equal(toIntCount(-5), 0);
});

// ── buildExperimentSnapshot ─────────────────────────────────────────────

function baseListing(overrides = {}) {
  return {
    id: 'L1',
    title: 'Vintage Camera',
    priceRecommendation: '$249.99',
    category: 'Cameras > Vintage',
    categoryId: '15230',
    itemSpecifics: { Brand: 'Leica', Model: 'IIIf' },
    images: ['a.jpg', 'b.jpg', 'c.jpg'],
    tags: ['vintage', 'camera', 'vintage'], // intentional dupe
    ...overrides,
  };
}

test('buildExperimentSnapshot returns the canonical doc shape', () => {
  const fixedNow = '2026-05-29T12:00:00.000Z';
  const doc = buildExperimentSnapshot({
    id: 'exp1',
    companyId: 'co_1',
    listing: baseListing(),
    ebayItemId: '123456789012',
    pushContext: { categoryId: '15230', shippingPolicyId: 'pol-A', bestOfferEnabled: true },
    promptVersion: 'listing.final/v2',
    optimizerVersion: 'optimizer.optimize/v1',
    listingScoreAtPublish: 82,
    source: 'push',
    now: () => fixedNow,
  });

  assert.equal(doc.id, 'exp1');
  assert.equal(doc.companyId, 'co_1');
  assert.equal(doc.listingId, 'L1');
  assert.equal(doc.ebayItemId, '123456789012');
  assert.equal(doc.source, 'push');
  assert.equal(doc.createdAt, fixedNow);
  assert.equal(doc.publishedAt, fixedNow);
  assert.equal(doc.promptVersion, 'listing.final/v2');
  assert.equal(doc.optimizerVersion, 'optimizer.optimize/v1');
  assert.equal(doc.listingScoreAtPublish, 82);
  assert.equal(doc.titleLength, 'Vintage Camera'.length);
  assert.equal(doc.categoryId, '15230');
  assert.equal(doc.categoryName, 'Cameras > Vintage');
  assert.equal(doc.priceAtPublish, '249.99');
  assert.equal(doc.shippingPolicyId, 'pol-A');
  assert.equal(doc.bestOfferEnabled, true);
  assert.equal(doc.itemSpecificsCount, 2);
  assert.equal(doc.imageCount, 3);
  assert.deepEqual(doc.tags, ['vintage', 'camera']);
});

test('buildExperimentSnapshot defaults source to "push" and treats anything-but-relist as push', () => {
  const doc = buildExperimentSnapshot({
    id: 'a', companyId: 'co', listing: baseListing(), ebayItemId: '1',
  });
  assert.equal(doc.source, 'push');
  const relist = buildExperimentSnapshot({
    id: 'b', companyId: 'co', listing: baseListing(), ebayItemId: '2', source: 'relist',
  });
  assert.equal(relist.source, 'relist');
  // unknown value still routes to 'push'
  const garbage = buildExperimentSnapshot({
    id: 'c', companyId: 'co', listing: baseListing(), ebayItemId: '3', source: 'reanalyze',
  });
  assert.equal(garbage.source, 'push');
});

test('buildExperimentSnapshot tolerates missing optional fields', () => {
  const doc = buildExperimentSnapshot({
    id: 'a', companyId: 'co', listing: { id: 'L', title: 'X' }, ebayItemId: '1',
  });
  assert.equal(doc.promptVersion, null);
  assert.equal(doc.optimizerVersion, null);
  assert.equal(doc.listingScoreAtPublish, null);
  assert.equal(doc.titleLength, 1);
  assert.equal(doc.categoryId, null);
  assert.equal(doc.categoryName, null);
  assert.equal(doc.priceAtPublish, null);
  assert.equal(doc.shippingPolicyId, null);
  assert.equal(doc.bestOfferEnabled, false);
  assert.equal(doc.itemSpecificsCount, 0);
  assert.equal(doc.imageCount, 0);
  assert.deepEqual(doc.tags, []);
});

test('buildExperimentSnapshot prefers pushContext.categoryId over listing.categoryId', () => {
  const doc = buildExperimentSnapshot({
    id: 'a', companyId: 'co', ebayItemId: '1',
    listing: baseListing({ categoryId: 'LOCAL-1' }),
    pushContext: { categoryId: 'OVERRIDE-2' },
  });
  assert.equal(doc.categoryId, 'OVERRIDE-2');
});

test('buildExperimentSnapshot throws on missing required fields', () => {
  assert.throws(() => buildExperimentSnapshot({ companyId: 'co', listing: {}, ebayItemId: '1' }), /experiment id required/);
  assert.throws(() => buildExperimentSnapshot({ id: 'a', listing: {}, ebayItemId: '1' }), /companyId required/);
  assert.throws(() => buildExperimentSnapshot({ id: 'a', companyId: 'co', ebayItemId: '1' }), /listing required/);
  assert.throws(() => buildExperimentSnapshot({ id: 'a', companyId: 'co', listing: {} }), /ebayItemId required/);
});

test('buildExperimentSnapshot rejects non-finite listingScoreAtPublish without throwing', () => {
  const doc = buildExperimentSnapshot({
    id: 'a', companyId: 'co', listing: baseListing(), ebayItemId: '1',
    listingScoreAtPublish: NaN,
  });
  assert.equal(doc.listingScoreAtPublish, null);
});
