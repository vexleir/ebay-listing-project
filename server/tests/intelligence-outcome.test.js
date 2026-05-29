// INTEL-002 — unit tests for the pure outcome-snapshot builder.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildOutcomeSnapshot,
  normalizeMilestone,
  normalizePrice,
  toIntOrNull,
  daysSince,
  VALID_MILESTONES,
} = require('../services/intelligence/outcome');

// ── VALID_MILESTONES ─────────────────────────────────────────────────────

test('VALID_MILESTONES is the documented set, frozen', () => {
  assert.deepEqual(
    [...VALID_MILESTONES],
    ['publish', '7d', '14d', '30d', 'sold', 'end'],
  );
  assert.equal(Object.isFrozen(VALID_MILESTONES), true);
});

// ── normalizeMilestone ───────────────────────────────────────────────────

test('normalizeMilestone accepts known values case-insensitively + trims', () => {
  assert.equal(normalizeMilestone('publish'), 'publish');
  assert.equal(normalizeMilestone('  7D '), '7d');
  assert.equal(normalizeMilestone('SOLD'), 'sold');
});

test('normalizeMilestone returns null for unknown / non-string input', () => {
  assert.equal(normalizeMilestone('hourly'), null);
  assert.equal(normalizeMilestone(7), null);
  assert.equal(normalizeMilestone(null), null);
  assert.equal(normalizeMilestone(undefined), null);
  assert.equal(normalizeMilestone(''), null);
});

// ── toIntOrNull ──────────────────────────────────────────────────────────

test('toIntOrNull returns finite non-negative integers, floored', () => {
  assert.equal(toIntOrNull(3), 3);
  assert.equal(toIntOrNull(7.9), 7);
  assert.equal(toIntOrNull(0), 0);
  assert.equal(toIntOrNull('42'), 42);
});

test('toIntOrNull returns null for negatives / non-finite / non-numeric', () => {
  assert.equal(toIntOrNull(-1), null);
  assert.equal(toIntOrNull(NaN), null);
  assert.equal(toIntOrNull('abc'), null);
  assert.equal(toIntOrNull(null), null);
  assert.equal(toIntOrNull(undefined), null);
  assert.equal(toIntOrNull(''), null);
});

// ── normalizePrice ───────────────────────────────────────────────────────

test('normalizePrice strips $ + whitespace, handles numbers + nulls', () => {
  assert.equal(normalizePrice('$12.99'), '12.99');
  assert.equal(normalizePrice('  $5  '), '5');
  assert.equal(normalizePrice(7.5), '7.5');
  assert.equal(normalizePrice(null), null);
  assert.equal(normalizePrice('abc'), null);
  assert.equal(normalizePrice(NaN), null);
});

// ── daysSince ────────────────────────────────────────────────────────────

test('daysSince computes calendar-day difference between two ISO timestamps', () => {
  assert.equal(daysSince('2026-05-20T12:00:00.000Z', '2026-05-27T12:00:00.000Z'), 7);
  assert.equal(daysSince('2026-05-20T12:00:00.000Z', '2026-05-20T12:00:00.000Z'), 0);
});

test('daysSince clamps negative deltas to 0 (clock skew safety)', () => {
  assert.equal(daysSince('2026-05-27T12:00:00.000Z', '2026-05-20T12:00:00.000Z'), 0);
});

test('daysSince returns null on invalid / missing input', () => {
  assert.equal(daysSince(null, '2026-05-27T12:00:00.000Z'), null);
  assert.equal(daysSince('garbage', '2026-05-27T12:00:00.000Z'), null);
  assert.equal(daysSince('2026-05-27T12:00:00.000Z', 'garbage'), null);
});

// ── buildOutcomeSnapshot ─────────────────────────────────────────────────

function exampleExperiment(overrides = {}) {
  return {
    id: 'exp1',
    companyId: 'co1',
    listingId: 'L1',
    ebayItemId: '999',
    publishedAt: '2026-05-20T12:00:00.000Z',
    ...overrides,
  };
}

test('buildOutcomeSnapshot returns the canonical shape', () => {
  const fixedNow = '2026-05-27T12:00:00.000Z';
  const doc = buildOutcomeSnapshot({
    experiment: exampleExperiment(),
    milestone: '7d',
    stats: {
      viewCount: 142, watcherCount: 8, quantitySold: 0,
      activePrice: '$24.99', finalSalePrice: null, soldAt: null,
    },
    status: 'active',
    now: () => fixedNow,
  });

  assert.equal(doc.id, 'exp1:7d');
  assert.equal(doc.companyId, 'co1');
  assert.equal(doc.experimentId, 'exp1');
  assert.equal(doc.listingId, 'L1');
  assert.equal(doc.ebayItemId, '999');
  assert.equal(doc.captureMilestone, '7d');
  assert.equal(doc.capturedAt, fixedNow);
  assert.equal(doc.ageDays, 7);
  assert.equal(doc.viewCount, 142);
  assert.equal(doc.watcherCount, 8);
  assert.equal(doc.quantitySold, 0);
  assert.equal(doc.activePrice, '24.99');
  assert.equal(doc.finalSalePrice, null);
  assert.equal(doc.soldAt, null);
  assert.equal(doc.status, 'active');
});

test('buildOutcomeSnapshot builds the sold-milestone shape with finalSalePrice + soldAt', () => {
  const doc = buildOutcomeSnapshot({
    experiment: exampleExperiment(),
    milestone: 'sold',
    stats: {
      viewCount: 300, watcherCount: 12, quantitySold: 1,
      finalSalePrice: '$28.50', soldAt: '2026-05-27T15:00:00.000Z',
    },
    status: 'completed',
    now: () => '2026-05-28T00:00:00.000Z',
  });
  assert.equal(doc.captureMilestone, 'sold');
  assert.equal(doc.finalSalePrice, '28.5');
  assert.equal(doc.soldAt, '2026-05-27T15:00:00.000Z');
  assert.equal(doc.quantitySold, 1);
  assert.equal(doc.status, 'completed');
});

test('buildOutcomeSnapshot composite id is "experimentId:milestone" — idempotent at the milestone', () => {
  const a = buildOutcomeSnapshot({ experiment: exampleExperiment(), milestone: 'publish', now: () => 'x' });
  const b = buildOutcomeSnapshot({ experiment: exampleExperiment(), milestone: 'publish', now: () => 'y' });
  assert.equal(a.id, b.id); // same composite id even though capturedAt differs
  assert.equal(a.id, 'exp1:publish');
});

test('buildOutcomeSnapshot tolerates missing optional listing/ebay ids', () => {
  const doc = buildOutcomeSnapshot({
    experiment: { id: 'exp1', companyId: 'co1', publishedAt: '2026-05-01T00:00:00.000Z' },
    milestone: '14d',
  });
  assert.equal(doc.listingId, null);
  assert.equal(doc.ebayItemId, null);
});

test('buildOutcomeSnapshot returns null ageDays when the experiment has no publishedAt', () => {
  const doc = buildOutcomeSnapshot({
    experiment: { id: 'exp1', companyId: 'co1' },
    milestone: '7d',
    now: () => '2026-05-27T12:00:00.000Z',
  });
  assert.equal(doc.ageDays, null);
});

test('buildOutcomeSnapshot throws on missing experiment / id / companyId', () => {
  assert.throws(() => buildOutcomeSnapshot({ milestone: '7d' }), /experiment required/);
  assert.throws(() => buildOutcomeSnapshot({ experiment: { companyId: 'co' }, milestone: '7d' }), /experiment.id required/);
  assert.throws(() => buildOutcomeSnapshot({ experiment: { id: 'a' }, milestone: '7d' }), /experiment.companyId required/);
});

test('buildOutcomeSnapshot throws on unknown milestone', () => {
  assert.throws(
    () => buildOutcomeSnapshot({ experiment: exampleExperiment(), milestone: 'monthly' }),
    /milestone required/,
  );
});

test('buildOutcomeSnapshot silently nulls out non-finite stats fields rather than throwing', () => {
  const doc = buildOutcomeSnapshot({
    experiment: exampleExperiment(),
    milestone: '7d',
    stats: { viewCount: NaN, watcherCount: 'abc', quantitySold: -5 },
  });
  assert.equal(doc.viewCount, null);
  assert.equal(doc.watcherCount, null);
  assert.equal(doc.quantitySold, null);
});
