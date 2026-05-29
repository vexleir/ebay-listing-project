// INTEL-002 slice 2 — Scheduled milestone capture. Walks experiments
// published within the 7–31 day window and fires outcome captures for
// milestones that are due but not yet recorded.
//
// Two exports:
//   computeDueMilestones(experiment, existingMilestones, now)
//     Pure function — returns array of milestone strings that are due.
//
//   runScheduledCapture({ companyId, dryRun }, deps)
//     Orchestrator — walks eligible experiments, fetches eBay stats,
//     fires captureOutcomeForEbayItem per due milestone.

const { daysSince } = require('./outcome');

// Milestone thresholds in days. Only time-based milestones are scheduled;
// 'publish', 'sold', and 'end' are event-driven.
const MILESTONE_THRESHOLDS = Object.freeze({
  '7d': 7,
  '14d': 14,
  '30d': 30,
});

/**
 * Pure function. For a single experiment, determines which milestones are
 * due but not yet captured.
 *
 * @param {Object} experiment - The experiment document (needs publishedAt)
 * @param {string[]} existingMilestones - Already-captured milestone names
 * @param {Date} now - Current time for age calculation
 * @returns {string[]} - Milestones that should be captured (e.g. ['7d', '14d'])
 */
function computeDueMilestones(experiment, existingMilestones, now) {
  if (!experiment || !experiment.publishedAt) return [];

  const nowIso = now instanceof Date ? now.toISOString() : String(now);
  const ageDays = daysSince(experiment.publishedAt, nowIso);

  // daysSince returns null for invalid dates
  if (ageDays === null) return [];

  const existingSet = new Set(Array.isArray(existingMilestones) ? existingMilestones : []);
  const due = [];

  for (const [milestone, threshold] of Object.entries(MILESTONE_THRESHOLDS)) {
    if (ageDays >= threshold && !existingSet.has(milestone)) {
      due.push(milestone);
    }
  }

  return due;
}

/**
 * Walks experiments published 7–31 days ago, checks existing outcomes,
 * fetches eBay stats via GetItem for eligible items, fires
 * captureOutcomeForEbayItem per milestone.
 *
 * @param {Object} options
 * @param {string} options.companyId - Tenant to process
 * @param {boolean} [options.dryRun=false] - Compute eligible without capturing
 * @param {Object} deps - Injectable dependencies
 * @param {Function} deps.listExperimentsForCompany - (companyId, opts) => experiments[]
 * @param {Function} deps.listOutcomesForExperiment - (companyId, experimentId) => outcomes[]
 * @param {Function} deps.fetchEbayStats - (companyId, ebayItemId) => stats
 * @param {Function} deps.captureOutcomeForEbayItem - (companyId, ebayItemId, opts, deps) => result
 * @param {Function} deps.getExperimentByEbayItemId - (companyId, ebayItemId) => experiment
 * @param {Function} deps.upsertOutcome - (companyId, doc) => doc
 * @returns {Promise<{processed: number, captured: number, skipped: number, errors: number}>}
 */
async function runScheduledCapture({ companyId, dryRun = false } = {}, deps = {}) {
  if (!companyId) throw Object.assign(new Error('companyId required'), { status: 400 });

  const {
    listExperimentsForCompany,
    listOutcomesForExperiment,
    fetchEbayStats,
    captureOutcomeForEbayItem,
    getExperimentByEbayItemId,
    upsertOutcome,
  } = deps;

  if (typeof listExperimentsForCompany !== 'function') {
    throw new Error('runScheduledCapture: deps.listExperimentsForCompany is required');
  }
  if (typeof listOutcomesForExperiment !== 'function') {
    throw new Error('runScheduledCapture: deps.listOutcomesForExperiment is required');
  }
  if (typeof captureOutcomeForEbayItem !== 'function') {
    throw new Error('runScheduledCapture: deps.captureOutcomeForEbayItem is required');
  }

  const now = new Date();
  const summary = { processed: 0, captured: 0, skipped: 0, errors: 0 };

  // Query experiments in the 7–31 day window. Anything older has passed
  // all milestones; anything younger isn't eligible yet.
  const windowStart = new Date(now.getTime() - 31 * 86400000).toISOString();
  const windowEnd = new Date(now.getTime() - 7 * 86400000).toISOString();

  const experiments = await listExperimentsForCompany(companyId, {
    since: windowStart,
    limit: 500,
  });

  // Filter to experiments within the window (publishedAt <= windowEnd)
  const eligible = experiments.filter((exp) => {
    if (!exp.publishedAt) return false;
    return exp.publishedAt <= windowEnd;
  });

  for (const experiment of eligible) {
    summary.processed++;

    // Get existing outcomes to determine which milestones are already captured
    const outcomes = await listOutcomesForExperiment(companyId, experiment.id);
    const existingMilestones = outcomes.map((o) => o.captureMilestone);

    const dueMilestones = computeDueMilestones(experiment, existingMilestones, now);

    if (dueMilestones.length === 0) {
      summary.skipped++;
      continue;
    }

    if (dryRun) {
      // In dry-run mode, count what would be captured without calling eBay
      summary.captured += dueMilestones.length;
      continue;
    }

    // Fetch eBay stats once per experiment (all due milestones share the same stats)
    let stats;
    try {
      stats = await fetchEbayStats(companyId, experiment.ebayItemId);
    } catch (err) {
      // Single GetItem failure is non-fatal — log and continue
      console.error(
        `[scheduledCapture] GetItem failed for item ${experiment.ebayItemId}:`,
        err.message || err,
      );
      summary.errors++;
      continue;
    }

    // Fire capture for each due milestone
    for (const milestone of dueMilestones) {
      try {
        const result = await captureOutcomeForEbayItem(
          companyId,
          experiment.ebayItemId,
          { milestone, stats },
          { getExperimentByEbayItemId, upsertOutcome },
        );

        if (result && result.skipped) {
          summary.skipped++;
        } else {
          summary.captured++;
        }
      } catch (err) {
        console.error(
          `[scheduledCapture] Capture failed for ${experiment.ebayItemId} @ ${milestone}:`,
          err.message || err,
        );
        summary.errors++;
      }
    }
  }

  return summary;
}

module.exports = {
  computeDueMilestones,
  runScheduledCapture,
  MILESTONE_THRESHOLDS,
};
