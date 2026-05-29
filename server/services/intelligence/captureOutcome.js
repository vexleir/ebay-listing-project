// INTEL-002 — high-level orchestration around outcome capture. Takes an
// `ebayItemId` (the lookup key the seller sees + the key eBay's GetItem /
// GetMyeBaySelling responses carry) plus a stats blob from the latest
// eBay fetch, looks up the matching experiment, and upserts the outcome
// row. Idempotent at (experimentId, milestone) — re-firing the same
// milestone overwrites instead of duplicating.
//
// Dependencies are injected so the caller can swap in fakes for tests:
//   deps.getExperimentByEbayItemId — required
//   deps.upsertOutcome             — required
//   deps.now                       — optional, defaults to () => new Date().toISOString()

const { buildOutcomeSnapshot } = require('./outcome');

async function captureOutcomeForEbayItem(companyId, ebayItemId, {
  milestone,
  stats = {},
  status,
} = {}, deps = {}) {
  if (!companyId) throw Object.assign(new Error('companyId required'), { status: 400 });
  if (!ebayItemId) throw Object.assign(new Error('ebayItemId required'), { status: 400 });
  const { getExperimentByEbayItemId, upsertOutcome, now } = deps;
  if (typeof getExperimentByEbayItemId !== 'function') {
    throw new Error('captureOutcomeForEbayItem: deps.getExperimentByEbayItemId is required');
  }
  if (typeof upsertOutcome !== 'function') {
    throw new Error('captureOutcomeForEbayItem: deps.upsertOutcome is required');
  }

  const experiment = await getExperimentByEbayItemId(companyId, ebayItemId);
  // No experiment means the listing was pushed before INTEL-001 went live.
  // Return `{ skipped: true }` so the caller can keep aggregate counters
  // honest without a thrown error tearing down the surrounding sync loop.
  if (!experiment) {
    return { skipped: true, reason: 'no-experiment' };
  }

  const doc = buildOutcomeSnapshot({
    experiment,
    milestone,
    stats,
    status,
    ...(now ? { now } : {}),
  });

  const persisted = await upsertOutcome(companyId, doc);
  return { skipped: false, outcome: persisted, experimentId: experiment.id };
}

module.exports = { captureOutcomeForEbayItem };
