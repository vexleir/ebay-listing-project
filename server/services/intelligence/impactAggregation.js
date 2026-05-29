// INTEL-004 — Impact aggregation service. Computes pre-aggregated
// optimizer effectiveness metrics for the Impact Panel. All data access
// is injected so the aggregation logic is testable without Mongo.
//
// Metrics computed:
//   optimizedListingsCount — unique listingIds from optimizer actions
//   averageScoreLift       — mean of non-null scoreChange values
//   averageWatcherLift     — compare early vs late outcomes for optimized experiments
//   averageViewLift        — compare early vs late outcomes for optimized experiments
//   sellThroughCount       — optimized listings with a 'sold' milestone outcome
//   totalActions           — total count of optimizer actions
//   strongestWins          — top 3 by scoreChange or sale price

/**
 * Computes pre-aggregated optimizer impact metrics for a company.
 *
 * @param {string} companyId
 * @param {Object} options - { since? }
 * @param {Object} deps - Injectable data access functions
 * @param {Function} deps.listOptimizerActionsForCompany - (companyId, { limit, since }) => actions[]
 * @param {Function} deps.listOutcomesForCompany - (companyId, { milestone, limit, since }) => outcomes[]
 * @param {Function} deps.getOptimizerActionStats - (companyId, { since }) => stats
 * @returns {Promise<{
 *   optimizedListingsCount: number,
 *   averageScoreLift: number | null,
 *   averageWatcherLift: number | null,
 *   averageViewLift: number | null,
 *   sellThroughCount: number,
 *   totalActions: number,
 *   strongestWins: Array<{ listingId, title, scoreLift?, salePriceFormatted? }>
 * }>}
 */
async function computeOptimizerImpact(companyId, options = {}, deps = {}) {
  const { since } = options;
  const {
    listOptimizerActionsForCompany,
    listOutcomesForCompany,
    getOptimizerActionStats,
  } = deps;

  if (!listOptimizerActionsForCompany || !listOutcomesForCompany || !getOptimizerActionStats) {
    throw new Error('computeOptimizerImpact: all deps are required');
  }

  // Fetch all optimizer actions for the company
  const actions = await listOptimizerActionsForCompany(companyId, { limit: 500, since });

  // Early return: no actions means zeroed metrics
  if (!actions || actions.length === 0) {
    return {
      optimizedListingsCount: 0,
      averageScoreLift: null,
      averageWatcherLift: null,
      averageViewLift: null,
      sellThroughCount: 0,
      totalActions: 0,
      strongestWins: [],
    };
  }

  // --- optimizedListingsCount: unique listingIds ---
  const listingIdSet = new Set();
  for (const action of actions) {
    if (action.listingId) listingIdSet.add(action.listingId);
  }
  const optimizedListingsCount = listingIdSet.size;

  // --- averageScoreLift: mean of non-null scoreChange values ---
  const scoreChanges = [];
  for (const action of actions) {
    const sc = action.expectedImpact && action.expectedImpact.scoreChange;
    if (sc !== null && sc !== undefined && typeof sc === 'number' && Number.isFinite(sc)) {
      scoreChanges.push(sc);
    }
  }
  const averageScoreLift = scoreChanges.length > 0
    ? scoreChanges.reduce((sum, v) => sum + v, 0) / scoreChanges.length
    : null;

  // --- totalActions from stats ---
  const stats = await getOptimizerActionStats(companyId, { since });
  const totalActions = stats.totalActions || actions.length;

  // --- Fetch outcomes to compute watcher/view lift and sell-through ---
  // Get all outcomes for the company (we need publish/7d and 14d/30d + sold)
  const allOutcomes = await listOutcomesForCompany(companyId, { limit: 500, since });

  // Build a set of optimized experiment IDs by matching listingIds
  // Outcomes reference experimentId, actions reference listingId.
  // We need to find outcomes whose listingId is in our optimized set.
  const optimizedListingIds = listingIdSet;

  // Group outcomes by listingId for optimized listings
  const outcomesByListing = new Map();
  for (const outcome of allOutcomes) {
    if (outcome.listingId && optimizedListingIds.has(outcome.listingId)) {
      if (!outcomesByListing.has(outcome.listingId)) {
        outcomesByListing.set(outcome.listingId, []);
      }
      outcomesByListing.get(outcome.listingId).push(outcome);
    }
  }

  // --- averageWatcherLift and averageViewLift ---
  // Compare early outcomes (publish, 7d) vs late outcomes (14d, 30d)
  const EARLY_MILESTONES = new Set(['publish', '7d']);
  const LATE_MILESTONES = new Set(['14d', '30d']);

  const watcherLifts = [];
  const viewLifts = [];

  for (const [, outcomes] of outcomesByListing) {
    // Find the earliest early outcome and latest late outcome
    const earlyOutcomes = outcomes.filter(o => EARLY_MILESTONES.has(o.captureMilestone));
    const lateOutcomes = outcomes.filter(o => LATE_MILESTONES.has(o.captureMilestone));

    if (earlyOutcomes.length === 0 || lateOutcomes.length === 0) continue;

    // Use the earliest early and latest late for comparison
    const early = earlyOutcomes[earlyOutcomes.length - 1]; // last in sorted order (earliest milestone)
    const late = lateOutcomes[0]; // first in sorted order (latest milestone)

    // Watcher lift
    if (early.watcherCount !== null && early.watcherCount !== undefined &&
        late.watcherCount !== null && late.watcherCount !== undefined) {
      watcherLifts.push(late.watcherCount - early.watcherCount);
    }

    // View lift
    if (early.viewCount !== null && early.viewCount !== undefined &&
        late.viewCount !== null && late.viewCount !== undefined) {
      viewLifts.push(late.viewCount - early.viewCount);
    }
  }

  const averageWatcherLift = watcherLifts.length > 0
    ? watcherLifts.reduce((sum, v) => sum + v, 0) / watcherLifts.length
    : null;

  const averageViewLift = viewLifts.length > 0
    ? viewLifts.reduce((sum, v) => sum + v, 0) / viewLifts.length
    : null;

  // --- sellThroughCount: optimized listings with a 'sold' milestone outcome ---
  let sellThroughCount = 0;
  const soldListings = new Set();
  for (const outcome of allOutcomes) {
    if (outcome.captureMilestone === 'sold' &&
        outcome.listingId &&
        optimizedListingIds.has(outcome.listingId) &&
        !soldListings.has(outcome.listingId)) {
      soldListings.add(outcome.listingId);
      sellThroughCount++;
    }
  }

  // --- strongestWins: top 3 by scoreChange or sale price ---
  const strongestWins = computeStrongestWins(actions, allOutcomes, optimizedListingIds);

  return {
    optimizedListingsCount,
    averageScoreLift,
    averageWatcherLift,
    averageViewLift,
    sellThroughCount,
    totalActions,
    strongestWins,
  };
}

/**
 * Computes the top 3 strongest wins from optimizer actions.
 * Ranks by scoreChange first, then by sale price for sold items.
 *
 * @param {Array} actions - Optimizer action documents
 * @param {Array} outcomes - Outcome documents
 * @param {Set} optimizedListingIds - Set of optimized listing IDs
 * @returns {Array<{ listingId, title, scoreLift?, salePriceFormatted? }>}
 */
function computeStrongestWins(actions, outcomes, optimizedListingIds) {
  // Build a map of listingId -> best sale price from sold outcomes
  const salePriceByListing = new Map();
  for (const outcome of outcomes) {
    if (outcome.captureMilestone === 'sold' &&
        outcome.listingId &&
        optimizedListingIds.has(outcome.listingId) &&
        outcome.finalSalePrice) {
      const price = parseFloat(outcome.finalSalePrice);
      if (Number.isFinite(price)) {
        const existing = salePriceByListing.get(outcome.listingId);
        if (!existing || price > existing) {
          salePriceByListing.set(outcome.listingId, price);
        }
      }
    }
  }

  // Build candidates: each action can be a win candidate
  // Deduplicate by listingId — take the best action per listing
  const bestByListing = new Map();
  for (const action of actions) {
    if (!action.listingId) continue;

    const scoreLift = action.expectedImpact && action.expectedImpact.scoreChange;
    const salePrice = salePriceByListing.get(action.listingId) || null;
    const title = (action.afterSnapshot && action.afterSnapshot.title) ||
                  (action.beforeSnapshot && action.beforeSnapshot.title) ||
                  null;

    // Compute a ranking score: prioritize scoreChange, then sale price
    const numericLift = (typeof scoreLift === 'number' && Number.isFinite(scoreLift)) ? scoreLift : 0;
    const numericPrice = salePrice || 0;
    const rankScore = numericLift * 100 + numericPrice; // weight score lift heavily

    const existing = bestByListing.get(action.listingId);
    if (!existing || rankScore > existing.rankScore) {
      bestByListing.set(action.listingId, {
        listingId: action.listingId,
        title,
        scoreLift: (typeof scoreLift === 'number' && Number.isFinite(scoreLift)) ? scoreLift : undefined,
        salePriceFormatted: salePrice ? `$${salePrice.toFixed(2)}` : undefined,
        rankScore,
      });
    }
  }

  // Sort by rankScore descending, take top 3
  const sorted = Array.from(bestByListing.values())
    .sort((a, b) => b.rankScore - a.rankScore)
    .slice(0, 3);

  // Strip internal rankScore from output
  return sorted.map(({ rankScore, ...rest }) => rest);
}

module.exports = { computeOptimizerImpact };
