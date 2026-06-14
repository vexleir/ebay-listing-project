// P1.4 — tests for the shared sold-items fetch/parse service and the
// server-side sold reconciler orchestration.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseSoldItemsPage,
  fetchAllSoldItems,
  resolveLookbackDays,
} = require('../services/ebay/soldItems');
const {
  reconcileCompanySoldItems,
  runSoldReconciliation,
} = require('../services/ebay/soldReconciler');

// ── soldItems service ──────────────────────────────────────────────────────

function pageXml(items, { totalEntries, totalPages } = {}) {
  const blocks = items.map((it) => `
    <Item>
      <ItemID>${it.itemId}</ItemID>
      <Title>${it.title || 'Item'}</Title>
      <CurrentPrice>${it.soldPrice || '9.99'}</CurrentPrice>
      <LastModifiedTime>${it.soldDate || '2026-06-01T00:00:00.000Z'}</LastModifiedTime>
      <QuantitySold>${it.quantitySold || '1'}</QuantitySold>
    </Item>`).join('');
  return `<GetMyeBaySellingResponse><SoldList><PaginationResult>
      <TotalNumberOfEntries>${totalEntries ?? items.length}</TotalNumberOfEntries>
      <TotalNumberOfPages>${totalPages ?? 1}</TotalNumberOfPages>
    </PaginationResult>${blocks}</SoldList></GetMyeBaySellingResponse>`;
}

test('parseSoldItemsPage extracts items + pagination', () => {
  const { items, totalEntries, totalPages } = parseSoldItemsPage(
    pageXml([{ itemId: '1', soldPrice: '12.00' }], { totalEntries: 1, totalPages: 1 }),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].itemId, '1');
  assert.equal(items[0].soldPrice, '12.00');
  assert.equal(totalEntries, 1);
  assert.equal(totalPages, 1);
});

test('fetchAllSoldItems paginates and de-duplicates by ItemID', async () => {
  const pages = [
    pageXml([{ itemId: '1' }, { itemId: '2' }], { totalEntries: 3, totalPages: 2 }),
    // Page 2 repeats item 2 (dup) and adds item 3.
    pageXml([{ itemId: '2' }, { itemId: '3' }], { totalEntries: 3, totalPages: 2 }),
  ];
  let call = 0;
  const tradingApiCall = async () => ({ data: pages[call++] });
  const getValidAccessToken = async () => 'tok';

  const { items, pagesFetched, totalEntries } = await fetchAllSoldItems(
    { companyId: 'co1', lookbackDays: 90 },
    { tradingApiCall, getValidAccessToken },
  );
  assert.deepEqual(items.map((i) => i.itemId), ['1', '2', '3']);
  assert.equal(pagesFetched, 2);
  assert.equal(totalEntries, 3);
});

test('fetchAllSoldItems stops on a single page', async () => {
  let calls = 0;
  const tradingApiCall = async () => { calls++; return { data: pageXml([{ itemId: '1' }], { totalPages: 1 }) }; };
  const getValidAccessToken = async () => 'tok';
  await fetchAllSoldItems({ companyId: 'co1', lookbackDays: 30 }, { tradingApiCall, getValidAccessToken });
  assert.equal(calls, 1);
});

test('resolveLookbackDays normalizes to the allowed set', () => {
  assert.equal(resolveLookbackDays('60'), 60);
  assert.equal(resolveLookbackDays('7'), 30);
});

// ── reconcileCompanySoldItems ────────────────────────────────────────────────

function baseDeps(overrides = {}) {
  return {
    fetchAllSoldItems: async () => ({ items: [{ itemId: '1', soldPrice: '10.00', soldDate: 'd', quantitySold: '1' }], pagesFetched: 1, totalEntries: 1 }),
    reconcileSoldListings: async () => 1,
    tradingApiCall: async () => ({ data: '' }),
    getValidAccessToken: async () => 'tok',
    ...overrides,
  };
}

test('reconcileCompanySoldItems returns markedSold from the DB reconciler', async () => {
  const result = await reconcileCompanySoldItems('co1', {}, baseDeps());
  assert.equal(result.markedSold, 1);
  assert.equal(result.itemsFound, 1);
});

test('reconcileCompanySoldItems fires sold outcome capture per item', async () => {
  const calls = [];
  const deps = baseDeps({
    captureOutcomeForEbayItem: async (companyId, ebayItemId, opts) => {
      calls.push({ companyId, ebayItemId, milestone: opts.milestone });
      return { skipped: false };
    },
  });
  const result = await reconcileCompanySoldItems('co1', {}, deps);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].milestone, 'sold');
  assert.equal(result.capturedOutcomes, 1);
});

test('reconcileCompanySoldItems survives an outcome-capture throw', async () => {
  const deps = baseDeps({
    captureOutcomeForEbayItem: async () => { throw new Error('mongo down'); },
  });
  const result = await reconcileCompanySoldItems('co1', {}, deps);
  // Reconciliation still completes; capture count just stays 0.
  assert.equal(result.markedSold, 1);
  assert.equal(result.capturedOutcomes, 0);
});

// ── runSoldReconciliation ────────────────────────────────────────────────────

test('runSoldReconciliation skips companies without a valid eBay session', async () => {
  const processed = [];
  const summary = await runSoldReconciliation({}, {
    getCompanies: async () => [{ id: 'a' }, { id: 'b' }],
    hasValidSession: async (id) => id === 'a',
    fetchAllSoldItems: async ({ companyId }) => { processed.push(companyId); return { items: [], pagesFetched: 1, totalEntries: 0 }; },
    reconcileSoldListings: async () => 0,
  });
  assert.deepEqual(processed, ['a']);
  assert.equal(summary.companiesProcessed, 1);
  assert.equal(summary.companiesSkipped, 1);
});

test('runSoldReconciliation isolates a per-company failure', async () => {
  const summary = await runSoldReconciliation({}, {
    getCompanies: async () => [{ id: 'a' }, { id: 'b' }],
    hasValidSession: async () => true,
    fetchAllSoldItems: async ({ companyId }) => {
      if (companyId === 'a') throw new Error('token expired');
      return { items: [{ itemId: '9', soldPrice: '5', soldDate: 'd', quantitySold: '1' }], pagesFetched: 1, totalEntries: 1 };
    },
    reconcileSoldListings: async () => 1,
  });
  assert.equal(summary.errors, 1);
  assert.equal(summary.companiesProcessed, 1);
  assert.equal(summary.markedSold, 1);
});

test('runSoldReconciliation aggregates markedSold across companies', async () => {
  const summary = await runSoldReconciliation({}, {
    getCompanies: async () => [{ id: 'a' }, { id: 'b' }],
    hasValidSession: async () => true,
    fetchAllSoldItems: async () => ({ items: [{ itemId: '1', soldPrice: '1', soldDate: 'd', quantitySold: '1' }], pagesFetched: 1, totalEntries: 1 }),
    reconcileSoldListings: async () => 2,
  });
  assert.equal(summary.companiesProcessed, 2);
  assert.equal(summary.markedSold, 4);
});
