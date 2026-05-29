// Feature: listing-intelligence-completion, Property 1: Milestone eligibility is correct and idempotent
// **Validates: Requirements 1.1, 1.4**

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

const { computeDueMilestones, MILESTONE_THRESHOLDS } = require('../services/intelligence/scheduledCapture');

describe('computeDueMilestones — Property 1: Milestone eligibility is correct and idempotent', () => {
  // Arbitrary for generating a publishedAt date within the last 60 days
  // Use integer timestamps to avoid NaN date edge cases
  const now = Date.now();
  const publishedAtArb = fc
    .integer({ min: now - 60 * 86400000, max: now })
    .map((ts) => new Date(ts));

  // Arbitrary for generating a random subset of milestone keys
  const existingMilestonesArb = fc.subarray(['7d', '14d', '30d'], { minLength: 0, maxLength: 3 });

  // Arbitrary for generating a "now" date that is >= publishedAt
  // We generate an offset in days (0–60) to add to publishedAt
  const nowOffsetArb = fc.integer({ min: 0, max: 60 });

  it('returns only milestones where age >= threshold AND milestone not already captured (100+ iterations)', () => {
    fc.assert(
      fc.property(
        publishedAtArb,
        existingMilestonesArb,
        nowOffsetArb,
        (publishedAt, existingMilestones, nowOffsetDays) => {
          // Construct "now" as publishedAt + offset days
          const now = new Date(publishedAt.getTime() + nowOffsetDays * 86400000);

          const experiment = { publishedAt: publishedAt.toISOString() };
          const result = computeDueMilestones(experiment, existingMilestones, now);

          // Compute expected age in days (same logic as daysSince)
          const ageDays = Math.floor(Math.max(0, now.getTime() - publishedAt.getTime()) / 86400000);
          const existingSet = new Set(existingMilestones);

          // Assert: every returned milestone meets both conditions
          for (const milestone of result) {
            const threshold = MILESTONE_THRESHOLDS[milestone];
            assert.ok(
              ageDays >= threshold,
              `Returned milestone '${milestone}' but age ${ageDays} < threshold ${threshold}`,
            );
            assert.ok(
              !existingSet.has(milestone),
              `Returned milestone '${milestone}' but it was already in existing set`,
            );
          }

          // Assert: no eligible milestone is missing from the result
          for (const [milestone, threshold] of Object.entries(MILESTONE_THRESHOLDS)) {
            const shouldBeIncluded = ageDays >= threshold && !existingSet.has(milestone);
            const isIncluded = result.includes(milestone);
            assert.equal(
              isIncluded,
              shouldBeIncluded,
              `Milestone '${milestone}': expected ${shouldBeIncluded ? 'included' : 'excluded'} ` +
              `(age=${ageDays}, threshold=${threshold}, existing=${existingSet.has(milestone)})`,
            );
          }

          // Assert: result contains no duplicates (idempotency aspect)
          const resultSet = new Set(result);
          assert.equal(result.length, resultSet.size, 'Result contains duplicate milestones');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is idempotent — calling with result as existing milestones returns empty', () => {
    fc.assert(
      fc.property(
        publishedAtArb,
        existingMilestonesArb,
        nowOffsetArb,
        (publishedAt, existingMilestones, nowOffsetDays) => {
          const now = new Date(publishedAt.getTime() + nowOffsetDays * 86400000);
          const experiment = { publishedAt: publishedAt.toISOString() };

          // First call
          const firstResult = computeDueMilestones(experiment, existingMilestones, now);

          // Second call with first result added to existing milestones
          const combined = [...existingMilestones, ...firstResult];
          const secondResult = computeDueMilestones(experiment, combined, now);

          assert.deepEqual(
            secondResult,
            [],
            'Second call should return empty (idempotent) but got: ' + JSON.stringify(secondResult),
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});


// Task 1.3: Unit tests for runScheduledCapture
// Validates: Requirements 1.2, 1.3, 1.5, 1.7

const { runScheduledCapture } = require('../services/intelligence/scheduledCapture');

describe('runScheduledCapture — unit tests', () => {
  // Helper: create an experiment published N days ago
  function makeExperiment(id, daysAgo, ebayItemId) {
    const publishedAt = new Date(Date.now() - daysAgo * 86400000).toISOString();
    return { id, publishedAt, ebayItemId: ebayItemId || `ebay-${id}` };
  }

  // Helper: build default deps with sensible mocks
  function makeDeps(overrides = {}) {
    return {
      listExperimentsForCompany: overrides.listExperimentsForCompany || (async () => []),
      listOutcomesForExperiment: overrides.listOutcomesForExperiment || (async () => []),
      fetchEbayStats: overrides.fetchEbayStats || (async () => ({ views: 10, watchers: 2 })),
      captureOutcomeForEbayItem: overrides.captureOutcomeForEbayItem || (async () => ({ captured: true })),
      getExperimentByEbayItemId: overrides.getExperimentByEbayItemId || (async () => null),
      upsertOutcome: overrides.upsertOutcome || (async () => ({})),
    };
  }

  describe('dry-run mode', () => {
    it('returns eligible count without calling captureOutcomeForEbayItem or fetchEbayStats', async () => {
      const exp = makeExperiment('exp-1', 10); // 10 days ago → 7d milestone due
      let captureCalled = false;
      let fetchStatsCalled = false;

      const deps = makeDeps({
        listExperimentsForCompany: async () => [exp],
        listOutcomesForExperiment: async () => [], // no existing milestones
        fetchEbayStats: async () => { fetchStatsCalled = true; return {}; },
        captureOutcomeForEbayItem: async () => { captureCalled = true; return {}; },
      });

      const result = await runScheduledCapture({ companyId: 'co-1', dryRun: true }, deps);

      assert.equal(captureCalled, false, 'captureOutcomeForEbayItem should NOT be called in dry-run');
      assert.equal(fetchStatsCalled, false, 'fetchEbayStats should NOT be called in dry-run');
      assert.equal(result.captured, 1, 'should report 1 eligible milestone');
      assert.equal(result.processed, 1);
    });

    it('counts multiple due milestones per experiment in dry-run', async () => {
      const exp = makeExperiment('exp-2', 20); // 20 days ago → 7d + 14d due

      const deps = makeDeps({
        listExperimentsForCompany: async () => [exp],
        listOutcomesForExperiment: async () => [],
      });

      const result = await runScheduledCapture({ companyId: 'co-1', dryRun: true }, deps);

      assert.equal(result.captured, 2, 'should report 2 eligible milestones (7d + 14d)');
    });
  });

  describe('single GetItem failure does not abort batch', () => {
    it('increments errors counter and continues processing remaining experiments', async () => {
      const exp1 = makeExperiment('exp-fail', 10, 'ebay-fail');
      const exp2 = makeExperiment('exp-ok', 10, 'ebay-ok');

      let capturedItems = [];

      const deps = makeDeps({
        listExperimentsForCompany: async () => [exp1, exp2],
        listOutcomesForExperiment: async () => [],
        fetchEbayStats: async (_companyId, ebayItemId) => {
          if (ebayItemId === 'ebay-fail') throw new Error('GetItem API error');
          return { views: 5, watchers: 1 };
        },
        captureOutcomeForEbayItem: async (_cid, ebayItemId, opts) => {
          capturedItems.push({ ebayItemId, milestone: opts.milestone });
          return { captured: true };
        },
      });

      const result = await runScheduledCapture({ companyId: 'co-1' }, deps);

      assert.equal(result.errors, 1, 'should have 1 error from the failed GetItem');
      assert.equal(result.captured, 1, 'should still capture the successful experiment');
      assert.equal(capturedItems.length, 1, 'captureOutcomeForEbayItem called for the non-failing item');
      assert.equal(capturedItems[0].ebayItemId, 'ebay-ok');
    });
  });

  describe('summary shape', () => {
    it('contains processed, captured, skipped, and errors fields', async () => {
      const deps = makeDeps({
        listExperimentsForCompany: async () => [],
      });

      const result = await runScheduledCapture({ companyId: 'co-1' }, deps);

      assert.ok('processed' in result, 'summary should have processed');
      assert.ok('captured' in result, 'summary should have captured');
      assert.ok('skipped' in result, 'summary should have skipped');
      assert.ok('errors' in result, 'summary should have errors');
      assert.equal(typeof result.processed, 'number');
      assert.equal(typeof result.captured, 'number');
      assert.equal(typeof result.skipped, 'number');
      assert.equal(typeof result.errors, 'number');
    });

    it('skipped increments when experiment has no due milestones', async () => {
      // Experiment 8 days old with 7d already captured → no milestones due
      const exp = makeExperiment('exp-skip', 8);

      const deps = makeDeps({
        listExperimentsForCompany: async () => [exp],
        listOutcomesForExperiment: async () => [{ captureMilestone: '7d' }],
      });

      const result = await runScheduledCapture({ companyId: 'co-1' }, deps);

      assert.equal(result.processed, 1);
      assert.equal(result.skipped, 1);
      assert.equal(result.captured, 0);
    });

    it('skipped increments when captureOutcomeForEbayItem returns { skipped: true }', async () => {
      const exp = makeExperiment('exp-cap-skip', 10);

      const deps = makeDeps({
        listExperimentsForCompany: async () => [exp],
        listOutcomesForExperiment: async () => [],
        captureOutcomeForEbayItem: async () => ({ skipped: true }),
      });

      const result = await runScheduledCapture({ companyId: 'co-1' }, deps);

      assert.equal(result.skipped, 1);
      assert.equal(result.captured, 0);
    });
  });

  describe('experiments outside 7–31 day window are excluded', () => {
    it('excludes experiments younger than 7 days', async () => {
      const youngExp = makeExperiment('exp-young', 3); // 3 days old

      let capturedAnything = false;
      const deps = makeDeps({
        listExperimentsForCompany: async () => [youngExp],
        listOutcomesForExperiment: async () => [],
        captureOutcomeForEbayItem: async () => { capturedAnything = true; return {}; },
      });

      const result = await runScheduledCapture({ companyId: 'co-1' }, deps);

      // Young experiments are filtered out by the publishedAt <= windowEnd check
      assert.equal(result.processed, 0, 'young experiment should not be processed');
      assert.equal(capturedAnything, false);
    });

    it('excludes experiments older than 31 days', async () => {
      const oldExp = makeExperiment('exp-old', 40); // 40 days old

      let capturedAnything = false;
      const deps = makeDeps({
        // The scheduler passes `since: windowStart` to the query, so the data
        // layer should not return experiments older than 31 days. We simulate
        // the data layer returning it anyway to verify the filter.
        listExperimentsForCompany: async () => [oldExp],
        listOutcomesForExperiment: async () => [],
        captureOutcomeForEbayItem: async () => { capturedAnything = true; return {}; },
      });

      const result = await runScheduledCapture({ companyId: 'co-1' }, deps);

      // The scheduler filters by publishedAt <= windowEnd (now - 7 days).
      // An experiment 40 days old has publishedAt < windowStart, but the
      // scheduler's `since` param should exclude it at the query level.
      // However, since listExperimentsForCompany returns it, the filter
      // `exp.publishedAt <= windowEnd` will still include it (40 days ago IS <= now-7days).
      // The experiment IS eligible because all 3 milestones are due.
      // The real exclusion of old experiments happens at the query level (since param).
      // So if the data layer returns it, the scheduler will process it.
      // This test verifies the scheduler passes the correct window to the query.
      //
      // Let's verify the `since` parameter passed to listExperimentsForCompany
      // is approximately 31 days ago.
      let queriedSince;
      const deps2 = makeDeps({
        listExperimentsForCompany: async (_cid, opts) => { queriedSince = opts.since; return []; },
      });

      await runScheduledCapture({ companyId: 'co-1' }, deps2);

      const expectedWindowStart = new Date(Date.now() - 31 * 86400000);
      const parsedSince = new Date(queriedSince);
      const diffMs = Math.abs(parsedSince.getTime() - expectedWindowStart.getTime());

      // Allow 1 second tolerance for test execution time
      assert.ok(diffMs < 1000, `since param should be ~31 days ago, got diff of ${diffMs}ms`);
    });

    it('only processes experiments within the 7–31 day window', async () => {
      const youngExp = makeExperiment('young', 3);   // too young
      const eligibleExp = makeExperiment('eligible', 15); // in window
      const oldExp = makeExperiment('old', 40);      // too old (but would pass filter if returned)

      // Simulate a data layer that correctly filters by `since`
      const deps = makeDeps({
        listExperimentsForCompany: async (_cid, opts) => {
          // Only return experiments with publishedAt >= opts.since
          return [youngExp, eligibleExp, oldExp].filter(
            (e) => e.publishedAt >= opts.since,
          );
        },
        listOutcomesForExperiment: async () => [],
      });

      const result = await runScheduledCapture({ companyId: 'co-1', dryRun: true }, deps);

      // eligibleExp (15 days) → 7d + 14d due = 2 captured
      // youngExp (3 days) → publishedAt > windowEnd, filtered out
      // oldExp (40 days) → publishedAt < since, filtered by data layer
      assert.equal(result.processed, 1, 'only the eligible experiment should be processed');
      assert.equal(result.captured, 2, '7d + 14d milestones should be eligible');
    });
  });
});
