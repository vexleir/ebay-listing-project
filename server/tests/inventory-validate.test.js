// INV-001 — unit tests for the pure inventory validation/normalization
// helpers. No Mongo, no fakes — just the math.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeInventorySku,
  coerceNonNegativeInt,
  coerceCurrencyString,
  validateInventoryItem,
  buildInventoryItemDoc,
  buildInventoryItemUpdates,
} = require('../services/inventory/validate');

// ── normalizeInventorySku ───────────────────────────────────────────────────

test('normalizeInventorySku lowercases and trims', () => {
  assert.equal(normalizeInventorySku('  ABC-001 '), 'abc-001');
  assert.equal(normalizeInventorySku('SKU-42'), 'sku-42');
});

test('normalizeInventorySku returns empty string for non-string / empty input', () => {
  assert.equal(normalizeInventorySku(''), '');
  assert.equal(normalizeInventorySku(undefined), '');
  assert.equal(normalizeInventorySku(null), '');
  assert.equal(normalizeInventorySku(42), '');
});

// ── coerceNonNegativeInt ────────────────────────────────────────────────────

test('coerceNonNegativeInt accepts non-negative integers', () => {
  assert.equal(coerceNonNegativeInt(0), 0);
  assert.equal(coerceNonNegativeInt(5), 5);
  assert.equal(coerceNonNegativeInt('17'), 17);
});

test('coerceNonNegativeInt clamps negatives to 0', () => {
  assert.equal(coerceNonNegativeInt(-3), 0);
  assert.equal(coerceNonNegativeInt('-99'), 0);
});

test('coerceNonNegativeInt floors floats', () => {
  assert.equal(coerceNonNegativeInt(2.9), 2);
  assert.equal(coerceNonNegativeInt('4.7'), 4);
});

test('coerceNonNegativeInt returns the fallback for non-finite / blank input', () => {
  assert.equal(coerceNonNegativeInt(undefined, 8), 8);
  assert.equal(coerceNonNegativeInt(null, 8), 8);
  assert.equal(coerceNonNegativeInt('', 8), 8);
  assert.equal(coerceNonNegativeInt(NaN, 8), 8);
  assert.equal(coerceNonNegativeInt('abc', 8), 8);
});

// ── coerceCurrencyString ────────────────────────────────────────────────────

test('coerceCurrencyString strips a leading $ and trims', () => {
  assert.equal(coerceCurrencyString('$12.50'), '12.50');
  assert.equal(coerceCurrencyString('  $7.00 '), '7.00');
});

test('coerceCurrencyString converts numbers to strings', () => {
  assert.equal(coerceCurrencyString(8.5), '8.5');
  assert.equal(coerceCurrencyString(0), '0');
});

test('coerceCurrencyString returns empty string for non-finite / null / non-string', () => {
  assert.equal(coerceCurrencyString(null), '');
  assert.equal(coerceCurrencyString(undefined), '');
  assert.equal(coerceCurrencyString(NaN), '');
  assert.equal(coerceCurrencyString({}), '');
});

// ── validateInventoryItem ───────────────────────────────────────────────────

test('validateInventoryItem accepts a minimal valid item', () => {
  const res = validateInventoryItem({ id: 'inv1', sku: 'ABC' });
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
});

test('validateInventoryItem rejects missing id', () => {
  const res = validateInventoryItem({ sku: 'ABC' });
  assert.equal(res.valid, false);
  assert.ok(res.errors.includes('id is required'));
});

test('validateInventoryItem rejects missing / blank SKU', () => {
  assert.deepEqual(validateInventoryItem({ id: 'a' }).errors, ['sku is required']);
  assert.deepEqual(validateInventoryItem({ id: 'a', sku: '' }).errors, ['sku is required']);
  assert.deepEqual(validateInventoryItem({ id: 'a', sku: '   ' }).errors, ['sku is required']);
});

test('validateInventoryItem rejects negative quantities', () => {
  const res = validateInventoryItem({ id: 'a', sku: 'X', quantityOnHand: -1 });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => /quantityOnHand/.test(e)));
});

test('validateInventoryItem ignores missing quantity fields (default 0)', () => {
  const res = validateInventoryItem({ id: 'a', sku: 'X' });
  assert.equal(res.valid, true);
});

test('validateInventoryItem rejects non-object input', () => {
  assert.equal(validateInventoryItem(null).valid, false);
  assert.equal(validateInventoryItem(undefined).valid, false);
  assert.equal(validateInventoryItem('x').valid, false);
});

// ── buildInventoryItemDoc ───────────────────────────────────────────────────

test('buildInventoryItemDoc fills defaults and timestamps', () => {
  const fixedNow = '2026-05-28T12:00:00.000Z';
  const doc = buildInventoryItemDoc('co_1', { id: 'inv1', sku: 'ABC-001' }, { now: () => fixedNow });
  assert.equal(doc.id, 'inv1');
  assert.equal(doc.companyId, 'co_1');
  assert.equal(doc.sku, 'abc-001');           // normalized
  assert.equal(doc.displayedSku, 'ABC-001');  // preserved
  assert.equal(doc.quantityOnHand, 0);
  assert.equal(doc.quantityListed, 0);
  assert.equal(doc.quantitySold, 0);
  assert.equal(doc.costBasis, '');
  assert.equal(doc.sourceTag, '');
  assert.equal(doc.sourceEvent, '');
  assert.equal(doc.createdAt, fixedNow);
  assert.equal(doc.updatedAt, fixedNow);
});

test('buildInventoryItemDoc honors caller-supplied createdAt but always refreshes updatedAt', () => {
  const t1 = '2026-05-01T00:00:00.000Z';
  const t2 = '2026-05-28T12:00:00.000Z';
  const doc = buildInventoryItemDoc('co', { id: 'i', sku: 'X', createdAt: t1 }, { now: () => t2 });
  assert.equal(doc.createdAt, t1);
  assert.equal(doc.updatedAt, t2);
});

test('buildInventoryItemDoc trims source fields and strips $ from costBasis', () => {
  const doc = buildInventoryItemDoc('co', {
    id: 'i', sku: 'X',
    sourceTag: '  estate-sale  ',
    sourceEvent: '   Saturday market   ',
    costBasis: '$12.50',
  });
  assert.equal(doc.sourceTag, 'estate-sale');
  assert.equal(doc.sourceEvent, 'Saturday market');
  assert.equal(doc.costBasis, '12.50');
});

// ── buildInventoryItemUpdates ──────────────────────────────────────────────

test('buildInventoryItemUpdates returns only the fields the caller set', () => {
  const updates = buildInventoryItemUpdates({ quantityOnHand: 5 });
  // Only quantityOnHand and updatedAt.
  assert.deepEqual(Object.keys(updates).sort(), ['quantityOnHand', 'updatedAt']);
  assert.equal(updates.quantityOnHand, 5);
});

test('buildInventoryItemUpdates renormalizes SKU + preserves displayedSku', () => {
  const updates = buildInventoryItemUpdates({ sku: '  WIDGET-2 ' });
  assert.equal(updates.sku, 'widget-2');
  assert.equal(updates.displayedSku, 'WIDGET-2');
});

test('buildInventoryItemUpdates honors costBasis renormalization', () => {
  const updates = buildInventoryItemUpdates({ costBasis: '$3.99' });
  assert.equal(updates.costBasis, '3.99');
});

test('buildInventoryItemUpdates always stamps updatedAt', () => {
  const t = '2026-05-28T13:00:00.000Z';
  const updates = buildInventoryItemUpdates({ quantityListed: 2 }, { now: () => t });
  assert.equal(updates.updatedAt, t);
});

test('buildInventoryItemUpdates returns null for non-object input', () => {
  assert.equal(buildInventoryItemUpdates(null), null);
  assert.equal(buildInventoryItemUpdates(undefined), null);
  assert.equal(buildInventoryItemUpdates('x'), null);
});
