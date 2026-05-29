// INTEL-001 — integration tests for server/intelligence.js. Patches `./db`
// to inject an in-memory fake collection so the CRUD path runs without
// booting Mongo.

const assert = require('node:assert/strict');
const test = require('node:test');

const Module = require('module');
const originalRequire = Module.prototype.require;

let store; // Map<docId, doc>
function makeFakeDb() {
  store = new Map();
  return {
    collection: () => ({
      insertOne: async (doc) => {
        const key = `${doc.companyId}::${doc.id}`;
        store.set(key, { ...doc });
        return { insertedId: key };
      },
      updateOne: async (query, update, options = {}) => {
        for (const [key, doc] of store) {
          if (matchesQuery(doc, query)) {
            store.set(key, { ...doc, ...(update.$set || {}) });
            return { matchedCount: 1, modifiedCount: 1 };
          }
        }
        if (options.upsert) {
          const docToInsert = { ...(update.$set || {}), ...query };
          const key = `${docToInsert.companyId}::${docToInsert.id}`;
          store.set(key, docToInsert);
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: key };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      },
      findOne: async (query) => {
        for (const doc of store.values()) {
          if (matchesQuery(doc, query)) return { ...doc };
        }
        return null;
      },
      find: (query) => {
        const cursor = {
          _docs: Array.from(store.values()).filter((d) => matchesQuery(d, query)),
          sort(spec) {
            const [field, dir] = Object.entries(spec)[0];
            this._docs = this._docs.slice().sort((a, b) => {
              const av = a[field];
              const bv = b[field];
              if (av === bv) return 0;
              return (av < bv ? -1 : 1) * (dir < 0 ? -1 : 1);
            });
            return this;
          },
          limit(n) {
            this._docs = this._docs.slice(0, n);
            return this;
          },
          toArray: async () => cursor._docs,
        };
        return cursor;
      },
    }),
  };
}

function matchesQuery(doc, query) {
  for (const [k, v] of Object.entries(query)) {
    if (v && typeof v === 'object' && '$gte' in v) {
      if (!(doc[k] >= v.$gte)) return false;
    } else if (doc[k] !== v) {
      return false;
    }
  }
  return true;
}

const fakeDbModule = {
  getDb: async () => makeFakeDb._cached || (makeFakeDb._cached = makeFakeDb()),
};

Module.prototype.require = function patched(name) {
  if (name === './db' || name.endsWith('/db')) return fakeDbModule;
  return originalRequire.apply(this, arguments);
};

delete require.cache[require.resolve('../intelligence')];
const intelligence = require('../intelligence');

Module.prototype.require = originalRequire;

function resetStore() {
  if (!store) makeFakeDb();
  store.clear();
}

test.beforeEach(() => resetStore());

function exampleDoc(overrides = {}) {
  return {
    id: 'exp1',
    companyId: 'co1',
    listingId: 'L1',
    ebayItemId: '123',
    source: 'push',
    createdAt: '2026-05-29T10:00:00.000Z',
    publishedAt: '2026-05-29T10:00:00.000Z',
    promptVersion: 'v1',
    optimizerVersion: null,
    listingScoreAtPublish: 80,
    titleLength: 14,
    categoryId: '15230',
    categoryName: 'Cameras',
    priceAtPublish: '249.99',
    shippingPolicyId: 'pol-A',
    bestOfferEnabled: true,
    itemSpecificsCount: 2,
    imageCount: 3,
    tags: ['vintage', 'camera'],
    ...overrides,
  };
}

// ── createExperiment ────────────────────────────────────────────────────────

test('createExperiment persists the doc and returns it without _id', async () => {
  const out = await intelligence.createExperiment('co1', exampleDoc());
  assert.equal(out.id, 'exp1');
  assert.equal(out.companyId, 'co1');
  assert.equal(out.ebayItemId, '123');
  assert.equal(out._id, undefined);
});

test('createExperiment rejects missing companyId', async () => {
  await assert.rejects(
    () => intelligence.createExperiment('', exampleDoc()),
    /companyId required/,
  );
});

test('createExperiment rejects missing doc.id', async () => {
  await assert.rejects(
    () => intelligence.createExperiment('co1', { ...exampleDoc(), id: '' }),
    /experiment doc with id required/,
  );
});

test('createExperiment rejects a companyId mismatch on the doc', async () => {
  await assert.rejects(
    () => intelligence.createExperiment('co1', exampleDoc({ companyId: 'co2' })),
    /companyId mismatch/,
  );
});

test('createExperiment stamps companyId when the doc has none', async () => {
  const out = await intelligence.createExperiment('co1', { ...exampleDoc(), companyId: undefined });
  assert.equal(out.companyId, 'co1');
});

// ── getExperiment ──────────────────────────────────────────────────────────

test('getExperiment returns the stored doc', async () => {
  await intelligence.createExperiment('co1', exampleDoc());
  const out = await intelligence.getExperiment('co1', 'exp1');
  assert.equal(out.id, 'exp1');
});

test('getExperiment returns null when missing', async () => {
  assert.equal(await intelligence.getExperiment('co1', 'nope'), null);
});

test('getExperiment does not cross tenants', async () => {
  await intelligence.createExperiment('co1', exampleDoc());
  assert.equal(await intelligence.getExperiment('co2', 'exp1'), null);
});

// ── getLatestExperimentForListing ──────────────────────────────────────────

test('getLatestExperimentForListing returns the most-recent push for the listing', async () => {
  await intelligence.createExperiment('co1', exampleDoc({ id: 'a', publishedAt: '2026-01-01T00:00:00.000Z' }));
  await intelligence.createExperiment('co1', exampleDoc({ id: 'b', publishedAt: '2026-04-01T00:00:00.000Z' }));
  await intelligence.createExperiment('co1', exampleDoc({ id: 'c', publishedAt: '2026-03-01T00:00:00.000Z' }));
  const latest = await intelligence.getLatestExperimentForListing('co1', 'L1');
  assert.equal(latest.id, 'b');
});

test('getLatestExperimentForListing returns null when no rows exist', async () => {
  assert.equal(await intelligence.getLatestExperimentForListing('co1', 'L1'), null);
});

test('getLatestExperimentForListing does not cross tenants', async () => {
  await intelligence.createExperiment('co1', exampleDoc());
  assert.equal(await intelligence.getLatestExperimentForListing('co2', 'L1'), null);
});

// ── getExperimentByEbayItemId ──────────────────────────────────────────────

test('getExperimentByEbayItemId finds the doc by item id', async () => {
  await intelligence.createExperiment('co1', exampleDoc());
  const out = await intelligence.getExperimentByEbayItemId('co1', '123');
  assert.equal(out.id, 'exp1');
});

test('getExperimentByEbayItemId stringifies the lookup value', async () => {
  await intelligence.createExperiment('co1', exampleDoc({ ebayItemId: '99' }));
  const out = await intelligence.getExperimentByEbayItemId('co1', 99);
  assert.equal(out.id, 'exp1');
});

// ── listExperimentsForCompany ──────────────────────────────────────────────

test('listExperimentsForCompany returns rows sorted by publishedAt desc', async () => {
  await intelligence.createExperiment('co1', exampleDoc({ id: 'a', publishedAt: '2026-01-01T00:00:00.000Z' }));
  await intelligence.createExperiment('co1', exampleDoc({ id: 'b', publishedAt: '2026-03-01T00:00:00.000Z' }));
  await intelligence.createExperiment('co1', exampleDoc({ id: 'c', publishedAt: '2026-02-01T00:00:00.000Z' }));
  const out = await intelligence.listExperimentsForCompany('co1');
  assert.deepEqual(out.map((d) => d.id), ['b', 'c', 'a']);
});

test('listExperimentsForCompany honors the limit', async () => {
  for (let i = 0; i < 5; i += 1) {
    await intelligence.createExperiment('co1', exampleDoc({
      id: `e${i}`,
      publishedAt: `2026-05-0${i + 1}T00:00:00.000Z`,
    }));
  }
  const out = await intelligence.listExperimentsForCompany('co1', { limit: 2 });
  assert.equal(out.length, 2);
});

test('listExperimentsForCompany filters by `since`', async () => {
  await intelligence.createExperiment('co1', exampleDoc({ id: 'old', publishedAt: '2026-01-01T00:00:00.000Z' }));
  await intelligence.createExperiment('co1', exampleDoc({ id: 'new', publishedAt: '2026-05-01T00:00:00.000Z' }));
  const out = await intelligence.listExperimentsForCompany('co1', { since: '2026-03-01T00:00:00.000Z' });
  assert.deepEqual(out.map((d) => d.id), ['new']);
});

test('listExperimentsForCompany returns empty for missing companyId', async () => {
  assert.deepEqual(await intelligence.listExperimentsForCompany(''), []);
});

test('listExperimentsForCompany does not cross tenants', async () => {
  await intelligence.createExperiment('co1', exampleDoc({ id: 'a' }));
  await intelligence.createExperiment('co2', exampleDoc({ id: 'b', companyId: 'co2' }));
  const out = await intelligence.listExperimentsForCompany('co1');
  assert.deepEqual(out.map((d) => d.id), ['a']);
});

// ── INTEL-002 outcomes ─────────────────────────────────────────────────────

function exampleOutcome(overrides = {}) {
  return {
    id: 'exp1:7d',
    companyId: 'co1',
    experimentId: 'exp1',
    listingId: 'L1',
    ebayItemId: '999',
    captureMilestone: '7d',
    capturedAt: '2026-05-27T12:00:00.000Z',
    ageDays: 7,
    viewCount: 100, watcherCount: 5, quantitySold: 0,
    soldAt: null, finalSalePrice: null, activePrice: '24.99',
    status: 'active',
    ...overrides,
  };
}

test('upsertOutcome inserts a fresh row', async () => {
  const out = await intelligence.upsertOutcome('co1', exampleOutcome());
  assert.equal(out.id, 'exp1:7d');
  assert.equal(out.companyId, 'co1');
  assert.equal(out._id, undefined);
});

test('upsertOutcome overwrites at the same composite id (idempotent)', async () => {
  await intelligence.upsertOutcome('co1', exampleOutcome({ viewCount: 50 }));
  await intelligence.upsertOutcome('co1', exampleOutcome({ viewCount: 200 }));
  const docs = await intelligence.listOutcomesForExperiment('co1', 'exp1');
  assert.equal(docs.length, 1);
  assert.equal(docs[0].viewCount, 200);
});

test('upsertOutcome stamps companyId when missing', async () => {
  const out = await intelligence.upsertOutcome('co1', { ...exampleOutcome(), companyId: undefined });
  assert.equal(out.companyId, 'co1');
});

test('upsertOutcome rejects companyId mismatch', async () => {
  await assert.rejects(
    () => intelligence.upsertOutcome('co1', exampleOutcome({ companyId: 'co2' })),
    /companyId mismatch/,
  );
});

test('upsertOutcome rejects missing id', async () => {
  await assert.rejects(
    () => intelligence.upsertOutcome('co1', { ...exampleOutcome(), id: '' }),
    /outcome doc with id required/,
  );
});

test('getOutcome returns the stored doc', async () => {
  await intelligence.upsertOutcome('co1', exampleOutcome());
  const out = await intelligence.getOutcome('co1', 'exp1:7d');
  assert.equal(out.viewCount, 100);
});

test('getOutcome returns null when missing', async () => {
  assert.equal(await intelligence.getOutcome('co1', 'nope:7d'), null);
});

test('getOutcome does not cross tenants', async () => {
  await intelligence.upsertOutcome('co1', exampleOutcome());
  assert.equal(await intelligence.getOutcome('co2', 'exp1:7d'), null);
});

test('listOutcomesForExperiment returns all milestones for a given experiment, sorted asc', async () => {
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'exp1:publish', captureMilestone: 'publish', capturedAt: '2026-05-20T00:00:00.000Z' }));
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'exp1:7d',  captureMilestone: '7d',  capturedAt: '2026-05-27T00:00:00.000Z' }));
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'exp1:14d', captureMilestone: '14d', capturedAt: '2026-06-03T00:00:00.000Z' }));
  const out = await intelligence.listOutcomesForExperiment('co1', 'exp1');
  assert.deepEqual(out.map((d) => d.captureMilestone), ['publish', '7d', '14d']);
});

test('listOutcomesForExperiment returns empty for unknown experiment', async () => {
  await intelligence.upsertOutcome('co1', exampleOutcome());
  assert.deepEqual(await intelligence.listOutcomesForExperiment('co1', 'nope'), []);
});

test('listOutcomesForExperiment does not cross tenants', async () => {
  await intelligence.upsertOutcome('co1', exampleOutcome());
  assert.deepEqual(await intelligence.listOutcomesForExperiment('co2', 'exp1'), []);
});

test('listOutcomesForCompany returns rows sorted by capturedAt desc', async () => {
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'a:7d',  capturedAt: '2026-05-01T00:00:00.000Z' }));
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'b:7d',  capturedAt: '2026-05-15T00:00:00.000Z' }));
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'c:7d',  capturedAt: '2026-05-08T00:00:00.000Z' }));
  const out = await intelligence.listOutcomesForCompany('co1');
  assert.deepEqual(out.map((d) => d.id), ['b:7d', 'c:7d', 'a:7d']);
});

test('listOutcomesForCompany filters by milestone', async () => {
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'a:publish', captureMilestone: 'publish' }));
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'b:sold',    captureMilestone: 'sold' }));
  const out = await intelligence.listOutcomesForCompany('co1', { milestone: 'sold' });
  assert.deepEqual(out.map((d) => d.id), ['b:sold']);
});

test('listOutcomesForCompany filters by since', async () => {
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'old', capturedAt: '2026-01-01T00:00:00.000Z' }));
  await intelligence.upsertOutcome('co1', exampleOutcome({ id: 'new', capturedAt: '2026-05-01T00:00:00.000Z' }));
  const out = await intelligence.listOutcomesForCompany('co1', { since: '2026-03-01T00:00:00.000Z' });
  assert.deepEqual(out.map((d) => d.id), ['new']);
});

test('listOutcomesForCompany honors the limit', async () => {
  for (let i = 0; i < 5; i += 1) {
    await intelligence.upsertOutcome('co1', exampleOutcome({
      id: `e${i}:7d`, capturedAt: `2026-05-0${i + 1}T00:00:00.000Z`,
    }));
  }
  const out = await intelligence.listOutcomesForCompany('co1', { limit: 2 });
  assert.equal(out.length, 2);
});

// ── INTEL-003 optimizer actions CRUD ───────────────────────────────────────

function exampleOptimizerAction(overrides = {}) {
  return {
    id: 'oa1',
    companyId: 'co1',
    listingId: 'L1',
    ebayItemId: '123',
    actionType: 'revise',
    appliedAt: '2026-06-01T10:00:00.000Z',
    createdAt: '2026-06-01T10:00:00.000Z',
    beforeSnapshot: { title: 'Old Title', price: '19.99', descriptionLength: 100, itemSpecificsCount: 2, imageCount: 3 },
    afterSnapshot: { title: 'New Title', price: '24.99', descriptionLength: 150, itemSpecificsCount: 4, imageCount: 5 },
    reasonCodes: ['title_changed', 'price_changed'],
    expectedImpact: { scoreChange: 12, priceChange: 5 },
    ...overrides,
  };
}

// ── createOptimizerAction ──────────────────────────────────────────────────

test('createOptimizerAction persists the doc and returns it without _id', async () => {
  const out = await intelligence.createOptimizerAction('co1', exampleOptimizerAction());
  assert.equal(out.id, 'oa1');
  assert.equal(out.companyId, 'co1');
  assert.equal(out.actionType, 'revise');
  assert.equal(out._id, undefined);
});

test('createOptimizerAction rejects missing companyId', async () => {
  await assert.rejects(
    () => intelligence.createOptimizerAction('', exampleOptimizerAction()),
    /companyId required/,
  );
});

test('createOptimizerAction rejects missing doc.id', async () => {
  await assert.rejects(
    () => intelligence.createOptimizerAction('co1', { ...exampleOptimizerAction(), id: '' }),
    /optimizer action doc with id required/,
  );
});

test('createOptimizerAction rejects a companyId mismatch on the doc', async () => {
  await assert.rejects(
    () => intelligence.createOptimizerAction('co1', exampleOptimizerAction({ companyId: 'co2' })),
    /companyId mismatch/,
  );
});

test('createOptimizerAction stamps companyId when the doc has none', async () => {
  const out = await intelligence.createOptimizerAction('co1', { ...exampleOptimizerAction(), companyId: undefined });
  assert.equal(out.companyId, 'co1');
});

// ── listOptimizerActionsForCompany ─────────────────────────────────────────

test('listOptimizerActionsForCompany returns rows sorted by appliedAt desc', async () => {
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'a', appliedAt: '2026-01-01T00:00:00.000Z' }));
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'b', appliedAt: '2026-03-01T00:00:00.000Z' }));
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'c', appliedAt: '2026-02-01T00:00:00.000Z' }));
  const out = await intelligence.listOptimizerActionsForCompany('co1');
  assert.deepEqual(out.map((d) => d.id), ['b', 'c', 'a']);
});

test('listOptimizerActionsForCompany honors the limit', async () => {
  for (let i = 0; i < 5; i += 1) {
    await intelligence.createOptimizerAction('co1', exampleOptimizerAction({
      id: `oa${i}`,
      appliedAt: `2026-06-0${i + 1}T00:00:00.000Z`,
    }));
  }
  const out = await intelligence.listOptimizerActionsForCompany('co1', { limit: 2 });
  assert.equal(out.length, 2);
});

test('listOptimizerActionsForCompany filters by since', async () => {
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'old', appliedAt: '2026-01-01T00:00:00.000Z' }));
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'new', appliedAt: '2026-05-01T00:00:00.000Z' }));
  const out = await intelligence.listOptimizerActionsForCompany('co1', { since: '2026-03-01T00:00:00.000Z' });
  assert.deepEqual(out.map((d) => d.id), ['new']);
});

test('listOptimizerActionsForCompany returns empty for missing companyId', async () => {
  assert.deepEqual(await intelligence.listOptimizerActionsForCompany(''), []);
});

test('listOptimizerActionsForCompany does not cross tenants', async () => {
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'a' }));
  await intelligence.createOptimizerAction('co2', exampleOptimizerAction({ id: 'b', companyId: 'co2' }));
  const out = await intelligence.listOptimizerActionsForCompany('co1');
  assert.deepEqual(out.map((d) => d.id), ['a']);
});

// ── listOptimizerActionsForListing ─────────────────────────────────────────

test('listOptimizerActionsForListing returns actions for a specific listing', async () => {
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'a', listingId: 'L1', appliedAt: '2026-01-01T00:00:00.000Z' }));
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'b', listingId: 'L2', appliedAt: '2026-02-01T00:00:00.000Z' }));
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'c', listingId: 'L1', appliedAt: '2026-03-01T00:00:00.000Z' }));
  const out = await intelligence.listOptimizerActionsForListing('co1', 'L1');
  assert.deepEqual(out.map((d) => d.id), ['c', 'a']);
});

test('listOptimizerActionsForListing returns empty for missing args', async () => {
  assert.deepEqual(await intelligence.listOptimizerActionsForListing('', 'L1'), []);
  assert.deepEqual(await intelligence.listOptimizerActionsForListing('co1', ''), []);
});

// ── getOptimizerActionStats ────────────────────────────────────────────────

test('getOptimizerActionStats returns correct aggregate shape', async () => {
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'a', actionType: 'revise', listingId: 'L1' }));
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'b', actionType: 'relist', listingId: 'L2' }));
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'c', actionType: 'revise', listingId: 'L1' }));
  const stats = await intelligence.getOptimizerActionStats('co1');
  assert.equal(stats.totalActions, 3);
  assert.equal(stats.actionsByType.revise, 2);
  assert.equal(stats.actionsByType.relist, 1);
  assert.equal(stats.uniqueListings, 2);
});

test('getOptimizerActionStats returns zeroed shape for missing companyId', async () => {
  const stats = await intelligence.getOptimizerActionStats('');
  assert.deepEqual(stats, { totalActions: 0, actionsByType: { revise: 0, relist: 0 }, uniqueListings: 0 });
});

test('getOptimizerActionStats filters by since', async () => {
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'old', appliedAt: '2026-01-01T00:00:00.000Z', listingId: 'L1' }));
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'new', appliedAt: '2026-05-01T00:00:00.000Z', listingId: 'L2' }));
  const stats = await intelligence.getOptimizerActionStats('co1', { since: '2026-03-01T00:00:00.000Z' });
  assert.equal(stats.totalActions, 1);
  assert.equal(stats.uniqueListings, 1);
});

test('getOptimizerActionStats does not cross tenants', async () => {
  await intelligence.createOptimizerAction('co1', exampleOptimizerAction({ id: 'a' }));
  await intelligence.createOptimizerAction('co2', exampleOptimizerAction({ id: 'b', companyId: 'co2' }));
  const stats = await intelligence.getOptimizerActionStats('co1');
  assert.equal(stats.totalActions, 1);
});
