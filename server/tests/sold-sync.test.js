// REL-001/002 — tests for the sold-sync lookback resolver and the
// allowed-value set. Pagination behavior is covered indirectly by the
// existing routes tests; this file locks the small pure helper.

const assert = require('node:assert/strict');
const test = require('node:test');

const syncRouter = require('../routes/ebay/sync');
const { resolveLookbackDays, SOLD_SYNC_ALLOWED_LOOKBACK, SOLD_SYNC_DEFAULT_LOOKBACK } = syncRouter.__test__;

test('resolveLookbackDays accepts the three documented values', () => {
  assert.equal(resolveLookbackDays('30'), 30);
  assert.equal(resolveLookbackDays('60'), 60);
  assert.equal(resolveLookbackDays('90'), 90);
  assert.equal(resolveLookbackDays(30), 30);
});

test('resolveLookbackDays falls back to default for empty / unrecognized / out-of-set inputs', () => {
  assert.equal(resolveLookbackDays(undefined), SOLD_SYNC_DEFAULT_LOOKBACK);
  assert.equal(resolveLookbackDays(null), SOLD_SYNC_DEFAULT_LOOKBACK);
  assert.equal(resolveLookbackDays(''), SOLD_SYNC_DEFAULT_LOOKBACK);
  assert.equal(resolveLookbackDays('banana'), SOLD_SYNC_DEFAULT_LOOKBACK);
  // 7-day window not supported (no UI for it) — should be normalized.
  assert.equal(resolveLookbackDays('7'), SOLD_SYNC_DEFAULT_LOOKBACK);
  // 120 days exceeds eBay's Trading API cap — should be normalized.
  assert.equal(resolveLookbackDays('120'), SOLD_SYNC_DEFAULT_LOOKBACK);
});

test('SOLD_SYNC_ALLOWED_LOOKBACK locks the documented option set', () => {
  assert.deepEqual([...SOLD_SYNC_ALLOWED_LOOKBACK].sort((a, b) => a - b), [30, 60, 90]);
  assert.equal(SOLD_SYNC_DEFAULT_LOOKBACK, 30);
});
