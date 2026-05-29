// INTEL-002 — unit tests for the captureOutcomeForEbayItem orchestrator.

const assert = require('node:assert/strict');
const test = require('node:test');

const { captureOutcomeForEbayItem } = require('../services/intelligence/captureOutcome');

function makeDeps(experiment, { now = '2026-05-27T12:00:00.000Z' } = {}) {
  const calls = { lookups: [], upserts: [] };
  return {
    calls,
    deps: {
      getExperimentByEbayItemId: async (companyId, ebayItemId) => {
        calls.lookups.push({ companyId, ebayItemId });
        return experiment;
      },
      upsertOutcome: async (companyId, doc) => {
        calls.upserts.push({ companyId, doc });
        return doc;
      },
      now: () => now,
    },
  };
}

const exampleExperiment = {
  id: 'exp1',
  companyId: 'co1',
  listingId: 'L1',
  ebayItemId: '999',
  publishedAt: '2026-05-20T12:00:00.000Z',
};

// ── happy path ─────────────────────────────────────────────────────────────

test('captureOutcomeForEbayItem looks up the experiment by ebayItemId and upserts the outcome', async () => {
  const { calls, deps } = makeDeps(exampleExperiment);
  const out = await captureOutcomeForEbayItem('co1', '999', {
    milestone: '7d',
    stats: { viewCount: 142, watcherCount: 8, activePrice: '$24.99' },
    status: 'active',
  }, deps);
  assert.equal(out.skipped, false);
  assert.equal(out.experimentId, 'exp1');
  assert.equal(out.outcome.id, 'exp1:7d');
  assert.equal(out.outcome.viewCount, 142);
  assert.equal(out.outcome.captureMilestone, '7d');
  assert.equal(calls.lookups.length, 1);
  assert.equal(calls.upserts.length, 1);
  assert.equal(calls.upserts[0].companyId, 'co1');
});

test('captureOutcomeForEbayItem honors the injected now()', async () => {
  // publishedAt is 2026-05-20 12:00:00 — 12 noon. From there to 2026-06-01
  // 12:00 noon would be 12 calendar days; injected now is 2026-06-01 00:00,
  // which is 11 days + 12 hours → floor is 11.
  const { deps } = makeDeps(exampleExperiment, { now: '2026-06-01T00:00:00.000Z' });
  const out = await captureOutcomeForEbayItem('co1', '999', { milestone: '14d' }, deps);
  assert.equal(out.outcome.capturedAt, '2026-06-01T00:00:00.000Z');
  assert.equal(out.outcome.ageDays, 11);
});

// ── skip / error paths ─────────────────────────────────────────────────────

test('captureOutcomeForEbayItem returns { skipped: true } when no experiment exists', async () => {
  const { calls, deps } = makeDeps(null);
  const out = await captureOutcomeForEbayItem('co1', '999', { milestone: '7d' }, deps);
  assert.equal(out.skipped, true);
  assert.equal(out.reason, 'no-experiment');
  assert.equal(calls.upserts.length, 0);
});

test('captureOutcomeForEbayItem rejects missing companyId / ebayItemId', async () => {
  const { deps } = makeDeps(exampleExperiment);
  await assert.rejects(
    () => captureOutcomeForEbayItem('', '999', { milestone: '7d' }, deps),
    /companyId required/,
  );
  await assert.rejects(
    () => captureOutcomeForEbayItem('co1', '', { milestone: '7d' }, deps),
    /ebayItemId required/,
  );
});

test('captureOutcomeForEbayItem rejects missing deps', async () => {
  await assert.rejects(
    () => captureOutcomeForEbayItem('co1', '999', { milestone: '7d' }, {}),
    /getExperimentByEbayItemId is required/,
  );
  await assert.rejects(
    () => captureOutcomeForEbayItem('co1', '999', { milestone: '7d' }, {
      getExperimentByEbayItemId: async () => exampleExperiment,
    }),
    /upsertOutcome is required/,
  );
});

test('captureOutcomeForEbayItem surfaces a missing-milestone error from the builder', async () => {
  const { deps } = makeDeps(exampleExperiment);
  await assert.rejects(
    () => captureOutcomeForEbayItem('co1', '999', {}, deps),
    /milestone required/,
  );
});
