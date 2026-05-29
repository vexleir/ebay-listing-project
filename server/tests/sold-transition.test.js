// INV-002 — unit tests for the pure sold-transition detector.

const assert = require('node:assert/strict');
const test = require('node:test');

const { isSoldState, detectSoldTransition } = require('../services/inventory/soldTransition');

// ── isSoldState ─────────────────────────────────────────────────────────────

test('isSoldState is true for a positive numeric soldAt', () => {
  assert.equal(isSoldState({ soldAt: 1700000000000 }), true);
});

test('isSoldState is true for a non-blank string soldAt', () => {
  assert.equal(isSoldState({ soldAt: '2026-05-29T00:00:00.000Z' }), true);
});

test('isSoldState is false for null / undefined / 0 / empty string', () => {
  assert.equal(isSoldState({ soldAt: null }), false);
  assert.equal(isSoldState({ soldAt: undefined }), false);
  assert.equal(isSoldState({ soldAt: 0 }), false);
  assert.equal(isSoldState({ soldAt: '' }), false);
  assert.equal(isSoldState({ soldAt: '   ' }), false);
});

test('isSoldState is false for null / non-object input', () => {
  assert.equal(isSoldState(null), false);
  assert.equal(isSoldState(undefined), false);
  assert.equal(isSoldState('x'), false);
});

// ── detectSoldTransition ──────────────────────────────────────────────────

test('returns null when the updates payload does not mention soldAt', () => {
  const existing = { id: 'L1', sku: 'X', soldAt: null };
  assert.equal(detectSoldTransition(existing, { priceRecommendation: '10.00' }), null);
});

test('returns the +1 sold / -1 listed delta on a not-sold → sold transition', () => {
  const existing = { id: 'L1', sku: 'WIDGET-1', soldAt: null };
  const out = detectSoldTransition(existing, { soldAt: 1700000000000 });
  assert.deepEqual(out, { sku: 'WIDGET-1', deltas: { quantitySold: 1, quantityListed: -1 } });
});

test('returns the -1 sold / +1 listed delta on a sold → not-sold transition', () => {
  const existing = { id: 'L1', sku: 'WIDGET-1', soldAt: 1700000000000 };
  const out = detectSoldTransition(existing, { soldAt: null });
  assert.deepEqual(out, { sku: 'WIDGET-1', deltas: { quantitySold: -1, quantityListed: 1 } });
});

test('returns null when the transition does not actually cross the sold boundary', () => {
  // Already sold → still sold (e.g. updating sale date).
  const existing = { id: 'L1', sku: 'X', soldAt: 1700000000000 };
  assert.equal(detectSoldTransition(existing, { soldAt: 1700000000001 }), null);
  // Not sold → still not sold.
  const fresh = { id: 'L2', sku: 'Y', soldAt: null };
  assert.equal(detectSoldTransition(fresh, { soldAt: null }), null);
});

test('returns null when the existing listing has no SKU', () => {
  const existing = { id: 'L1', soldAt: null };
  assert.equal(detectSoldTransition(existing, { soldAt: 1700000000000 }), null);
});

test('returns null when the existing SKU is blank / whitespace', () => {
  assert.equal(detectSoldTransition({ sku: '' }, { soldAt: 1 }), null);
  assert.equal(detectSoldTransition({ sku: '   ' }, { soldAt: 1 }), null);
});

test('returns null for null / non-object inputs', () => {
  assert.equal(detectSoldTransition(null, { soldAt: 1 }), null);
  assert.equal(detectSoldTransition({}, null), null);
  assert.equal(detectSoldTransition({}, 'x'), null);
});

test('treats the unmark-sold path (soldAt: undefined) as a transition when previously sold', () => {
  const existing = { id: 'L1', sku: 'X', soldAt: 1700000000000 };
  // Frontend convention: explicit `soldAt: undefined` (i.e. listed in the
  // payload but undefined) is still a sold-state clear. Use `'soldAt' in
  // updates` to detect intent.
  const updates = { soldAt: undefined };
  // Manually emulate the "the key is present in the object" semantics.
  Object.defineProperty(updates, 'soldAt', { value: undefined, enumerable: true });
  const out = detectSoldTransition(existing, updates);
  assert.deepEqual(out, { sku: 'X', deltas: { quantitySold: -1, quantityListed: 1 } });
});
