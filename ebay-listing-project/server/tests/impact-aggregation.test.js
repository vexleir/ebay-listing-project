// Unit tests for server/services/intelligence/impactAggregation.js
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { computeOptimizerImpact } = require('../services/intelligence/impactAggregation');

// --- Helpers ---

function makeDeps({ actions = [], outcomes = [], stats = null } = {}) {
  return {
    listOptimizerActionsForCompany: async () => actions,
    listOutcomesForCompany: async () => outcomes,
    getOptimizerActionStats: async () => stats || {
      totalActions: actions.length,
      actionsByType: { revise: 0, relist: 0 },
      uniqueListings: 0,
    },
  };
}

function makeAction({ listingId, scoreChange = null, priceChange = null, title = 'Test Listing' } = {}) {
  return {
    id: `action-${Math.random().toString(36).slice(2)}`,
    companyId: 'company-1',
    listingId: listingId || `listing-${Math.random().toString(36).slice(2)}`,
    ebayItemId: `ebay-${Math.random().toString(36).slice(2)}`,
    actionType: 'revise',
    appliedAt: new Date().toISOString(),
    beforeSnapshot: { title: 'Old Title', price: '10', descriptionLength: 50, itemSpecificsCount: 3, imageCount: 2 },
    afterSnapshot: { title, price: '15', descriptionLength: 80, itemSpecificsCount: 5, imageCount: 4 },
    reasonCodes: ['title_changed', 'price_changed'],
    expectedImpact: { scoreChange, priceChange },
  };
}

function makeOutcome({ listingId, milestone, viewCount = null, watcherCount = null, finalSalePrice = null } = {}) {
  return {
    id: `exp-1:${milestone}`,
    companyId: 'company-1',
    experimentId: 'exp-1',
    listingId,
    ebayItemId: 'ebay-1',
    captureMilestone: milestone,
    capturedAt: new Date().toISOString(),
    viewCount,
    watcherCount,
    finalSalePrice,
    status: milestone === 'sold' ? 'completed' : 'active',
  };
}

// --- Tests ---

describe('computeOptimizerImpact', () => {
  it('throws when deps are missing', async () => {
    await assert.rejects(
      () => computeOptimizerImpact('company-1', {}, {}),
      /all deps are required/,
    );
  });

  it('returns zeroed metrics when no actions exist', async () => {
    const deps = makeDeps({ actions: [] });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.deepEqual(result, {
      optimizedListingsCount: 0,
      averageScoreLift: null,
      averageWatcherLift: null,
      averageViewLift: null,
      sellThroughCount: 0,
      totalActions: 0,
      strongestWins: [],
    });
  });

  it('computes optimizedListingsCount as unique listingIds', async () => {
    const actions = [
      makeAction({ listingId: 'listing-A' }),
      makeAction({ listingId: 'listing-B' }),
      makeAction({ listingId: 'listing-A' }), // duplicate
    ];
    const deps = makeDeps({ actions });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.optimizedListingsCount, 2);
  });

  it('computes averageScoreLift as mean of non-null scoreChange values', async () => {
    const actions = [
      makeAction({ listingId: 'l1', scoreChange: 10 }),
      makeAction({ listingId: 'l2', scoreChange: 20 }),
      makeAction({ listingId: 'l3', scoreChange: null }), // excluded
    ];
    const deps = makeDeps({ actions });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.averageScoreLift, 15); // (10 + 20) / 2
  });

  it('returns null averageScoreLift when all scoreChange values are null', async () => {
    const actions = [
      makeAction({ listingId: 'l1', scoreChange: null }),
      makeAction({ listingId: 'l2', scoreChange: null }),
    ];
    const deps = makeDeps({ actions });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.averageScoreLift, null);
  });

  it('computes totalActions from stats', async () => {
    const actions = [
      makeAction({ listingId: 'l1' }),
      makeAction({ listingId: 'l2' }),
    ];
    const deps = makeDeps({
      actions,
      stats: { totalActions: 5, actionsByType: { revise: 3, relist: 2 }, uniqueListings: 2 },
    });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.totalActions, 5);
  });

  it('computes sellThroughCount from sold outcomes matching optimized listings', async () => {
    const actions = [
      makeAction({ listingId: 'listing-A' }),
      makeAction({ listingId: 'listing-B' }),
    ];
    const outcomes = [
      makeOutcome({ listingId: 'listing-A', milestone: 'sold', finalSalePrice: '25.00' }),
      makeOutcome({ listingId: 'listing-C', milestone: 'sold', finalSalePrice: '30.00' }), // not optimized
    ];
    const deps = makeDeps({ actions, outcomes });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.sellThroughCount, 1);
  });

  it('computes averageWatcherLift and averageViewLift from early vs late outcomes', async () => {
    const actions = [
      makeAction({ listingId: 'listing-A' }),
    ];
    const outcomes = [
      makeOutcome({ listingId: 'listing-A', milestone: '7d', viewCount: 10, watcherCount: 2 }),
      makeOutcome({ listingId: 'listing-A', milestone: '14d', viewCount: 30, watcherCount: 8 }),
    ];
    const deps = makeDeps({ actions, outcomes });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.averageViewLift, 20); // 30 - 10
    assert.equal(result.averageWatcherLift, 6); // 8 - 2
  });

  it('returns null watcher/view lift when no early/late outcome pairs exist', async () => {
    const actions = [
      makeAction({ listingId: 'listing-A' }),
    ];
    const outcomes = [
      makeOutcome({ listingId: 'listing-A', milestone: '7d', viewCount: 10, watcherCount: 2 }),
      // No 14d or 30d outcome
    ];
    const deps = makeDeps({ actions, outcomes });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.averageViewLift, null);
    assert.equal(result.averageWatcherLift, null);
  });

  it('computes strongestWins as top 3 by scoreChange', async () => {
    const actions = [
      makeAction({ listingId: 'l1', scoreChange: 5, title: 'Low Win' }),
      makeAction({ listingId: 'l2', scoreChange: 25, title: 'Top Win' }),
      makeAction({ listingId: 'l3', scoreChange: 15, title: 'Mid Win' }),
      makeAction({ listingId: 'l4', scoreChange: 30, title: 'Best Win' }),
    ];
    const deps = makeDeps({ actions });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.strongestWins.length, 3);
    assert.equal(result.strongestWins[0].title, 'Best Win');
    assert.equal(result.strongestWins[0].scoreLift, 30);
    assert.equal(result.strongestWins[1].title, 'Top Win');
    assert.equal(result.strongestWins[2].title, 'Mid Win');
  });

  it('strongestWins includes salePriceFormatted for sold listings', async () => {
    const actions = [
      makeAction({ listingId: 'listing-A', scoreChange: 10, title: 'Sold Item' }),
    ];
    const outcomes = [
      makeOutcome({ listingId: 'listing-A', milestone: 'sold', finalSalePrice: '49.99' }),
    ];
    const deps = makeDeps({ actions, outcomes });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.strongestWins.length, 1);
    assert.equal(result.strongestWins[0].salePriceFormatted, '$49.99');
    assert.equal(result.strongestWins[0].scoreLift, 10);
  });

  it('strongestWins deduplicates by listingId (takes best action)', async () => {
    const actions = [
      makeAction({ listingId: 'listing-A', scoreChange: 5, title: 'First Try' }),
      makeAction({ listingId: 'listing-A', scoreChange: 20, title: 'Second Try' }),
    ];
    const deps = makeDeps({ actions });
    const result = await computeOptimizerImpact('company-1', {}, deps);

    assert.equal(result.strongestWins.length, 1);
    assert.equal(result.strongestWins[0].scoreLift, 20);
  });
});
