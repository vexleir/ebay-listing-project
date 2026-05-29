// REL-001/002 — tests for the sold-sync lookback resolver and the
// allowed-value set. Pagination behavior is covered indirectly by the
// existing routes tests; this file locks the small pure helper.
// INTEL-002 — tests for the sold-sync auto-fire hook that captures
// outcomes for sold items matching experiments.

const assert = require('node:assert/strict');
const { describe, it, beforeEach } = require('node:test');
const test = require('node:test');
const http = require('node:http');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-sold-sync';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

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


// ── INTEL-002: Sold-sync auto-fire hook tests ──────────────────────────────
// These tests exercise the outcome capture loop that fires after the
// sold-items pagination. We mock the eBay Trading API, ebayAuth, listings,
// intelligence module, and captureOutcome service using Module.prototype.require
// patching, then hit the GET /sold-items endpoint via HTTP.

const Module = require('module');
const originalRequire = Module.prototype.require;

// ── module fakes for the sold-sync hook ────────────────────────────────────

let captureCalls = [];
let captureResults = new Map(); // itemId → result or Error
let tradingApiResponses = [];
let savedSettings = {};

const fakeEbayAuth = {
  getValidAccessToken: async () => 'fake-token',
  getAuthUrl: () => '',
  hasValidSession: async () => true,
  getTokenExpiry: async () => ({ refresh_token_expires_at: 1700000000000 }),
  exchangeCodeForToken: async () => {},
};

const fakeListings = {
  saveSettings: async (companyId, settings) => {
    savedSettings = { companyId, ...settings };
  },
  getSettings: async () => ({}),
  getListings: async () => [],
  createListing: async () => {},
  updateListing: async () => {},
  deleteListing: async () => {},
  getAllListingsMeta: async () => [],
  getActiveListings: async () => [],
  getTokenUsage: async () => ({}),
  incrementTokenUsage: async () => {},
  getAiDailyQuotaStatus: async () => ({ limit: 100, totalTokens: 0, remainingTokens: 100, resetAt: '', day: '' }),
};

const fakeDb = {
  getDb: async () => ({
    collection: () => ({
      find: () => ({ toArray: async () => [] }),
      bulkWrite: async () => {},
      insertOne: async () => {},
      updateOne: async () => ({ matchedCount: 0 }),
    }),
  }),
};

const fakeTradingApiCall = async ({ callName }) => {
  if (tradingApiResponses.length > 0) {
    return tradingApiResponses.shift();
  }
  // Default: empty sold list
  return { data: '<GetMyeBaySellingResponse><SoldList><PaginationResult><TotalNumberOfEntries>0</TotalNumberOfEntries><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult></SoldList></GetMyeBaySellingResponse>' };
};

const fakeEbayClient = {
  tradingApiCall: fakeTradingApiCall,
};

const fakeCaptureOutcome = {
  captureOutcomeForEbayItem: async (companyId, ebayItemId, opts, deps) => {
    captureCalls.push({ companyId, ebayItemId, opts, deps });
    if (captureResults.has(ebayItemId)) {
      const result = captureResults.get(ebayItemId);
      if (result instanceof Error) throw result;
      return result;
    }
    return { skipped: false, outcome: {}, experimentId: 'exp-1' };
  },
};

const fakeIntelligence = {
  getExperimentByEbayItemId: async () => null,
  upsertOutcome: async () => ({}),
};

// Patch modules and load the sync router with fakes
function loadSyncRouterWithFakes() {
  Module.prototype.require = function patched(name) {
    if (typeof name === 'string') {
      if (name.includes('ebayAuth')) return fakeEbayAuth;
      if (name.includes('services/ebay/client')) return fakeEbayClient;
      if (name.includes('services/intelligence/captureOutcome')) return fakeCaptureOutcome;
      if (name.match(/\/intelligence$/)) return fakeIntelligence;
      if (name.match(/\/listings$/)) return fakeListings;
      if (name.match(/\/db$/)) return fakeDb;
      if (name.includes('middleware/rateLimit')) {
        return {
          createDefaultRateLimiters: () => ({
            ebayReadRateLimit: (req, res, next) => next(),
          }),
        };
      }
    }
    return originalRequire.apply(this, arguments);
  };

  // Clear the module cache for sync.js so it picks up our fakes
  const syncPath = require.resolve('../routes/ebay/sync');
  delete require.cache[syncPath];
  const router = require('../routes/ebay/sync');

  Module.prototype.require = originalRequire;
  return router;
}

const mockedSyncRouter = loadSyncRouterWithFakes();

// ── test harness ───────────────────────────────────────────────────────────

function buildSoldSyncApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/', authMiddleware);
  app.use('/api/ebay', mockedSyncRouter);
  return app;
}

function startServer(app) {
  return new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
}

function tokenFor(companyId = 'co1') {
  return signToken({ id: 'u1', companyId, role: 'user', email: 'x@x', name: 'X' });
}

function httpGet(server, path, token = tokenFor()) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({
      hostname: 'localhost', port, path, method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }, (res) => {
      let chunks = '';
      res.on('data', (c) => { chunks += c; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = chunks ? JSON.parse(chunks) : null; } catch { parsed = chunks; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Helper to build a fake eBay sold-items XML response with given items
function buildSoldItemsXml(items) {
  const itemBlocks = items.map((item) => `
    <Item>
      <ItemID>${item.itemId}</ItemID>
      <Title>${item.title || 'Test Item'}</Title>
      <CurrentPrice>${item.soldPrice || '19.99'}</CurrentPrice>
      <LastModifiedTime>${item.soldDate || '2026-06-01T12:00:00.000Z'}</LastModifiedTime>
      <QuantitySold>${item.quantitySold || '1'}</QuantitySold>
    </Item>`).join('');

  return {
    data: `<GetMyeBaySellingResponse>
      <SoldList>
        <PaginationResult>
          <TotalNumberOfEntries>${items.length}</TotalNumberOfEntries>
          <TotalNumberOfPages>1</TotalNumberOfPages>
        </PaginationResult>
        ${itemBlocks}
      </SoldList>
    </GetMyeBaySellingResponse>`,
  };
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('sold-sync auto-fire hook (INTEL-002)', () => {
  beforeEach(() => {
    captureCalls = [];
    captureResults = new Map();
    tradingApiResponses = [];
    savedSettings = {};
  });

  it('fires captureOutcomeForEbayItem with milestone=sold and correct stats for matching items', async () => {
    tradingApiResponses.push(buildSoldItemsXml([
      { itemId: '111', soldPrice: '29.99', soldDate: '2026-06-01T10:00:00.000Z', quantitySold: '2' },
      { itemId: '222', soldPrice: '49.50', soldDate: '2026-06-02T14:30:00.000Z', quantitySold: '1' },
    ]));

    const server = await startServer(buildSoldSyncApp());
    try {
      const res = await httpGet(server, '/api/ebay/sold-items');
      assert.equal(res.status, 200);

      // Both items should have triggered captureOutcomeForEbayItem
      assert.equal(captureCalls.length, 2);

      // First item
      assert.equal(captureCalls[0].companyId, 'co1');
      assert.equal(captureCalls[0].ebayItemId, '111');
      assert.equal(captureCalls[0].opts.milestone, 'sold');
      assert.equal(captureCalls[0].opts.stats.finalSalePrice, '29.99');
      assert.equal(captureCalls[0].opts.stats.soldAt, '2026-06-01T10:00:00.000Z');
      assert.equal(captureCalls[0].opts.stats.quantitySold, '2');
      assert.equal(captureCalls[0].opts.status, 'completed');

      // Second item
      assert.equal(captureCalls[1].companyId, 'co1');
      assert.equal(captureCalls[1].ebayItemId, '222');
      assert.equal(captureCalls[1].opts.milestone, 'sold');
      assert.equal(captureCalls[1].opts.stats.finalSalePrice, '49.50');
      assert.equal(captureCalls[1].opts.stats.soldAt, '2026-06-02T14:30:00.000Z');
      assert.equal(captureCalls[1].opts.stats.quantitySold, '1');
      assert.equal(captureCalls[1].opts.status, 'completed');
    } finally {
      server.close();
    }
  });

  it('skips non-matching items (captureOutcomeForEbayItem returns { skipped: true })', async () => {
    // Item 111 matches an experiment, item 222 does not
    captureResults.set('111', { skipped: false, outcome: {}, experimentId: 'exp-1' });
    captureResults.set('222', { skipped: true, reason: 'no-experiment' });

    tradingApiResponses.push(buildSoldItemsXml([
      { itemId: '111', soldPrice: '10.00', soldDate: '2026-06-01T00:00:00.000Z', quantitySold: '1' },
      { itemId: '222', soldPrice: '20.00', soldDate: '2026-06-02T00:00:00.000Z', quantitySold: '1' },
    ]));

    const server = await startServer(buildSoldSyncApp());
    try {
      const res = await httpGet(server, '/api/ebay/sold-items');
      assert.equal(res.status, 200);

      // Both items were attempted
      assert.equal(captureCalls.length, 2);

      // Only the non-skipped item counts toward capturedOutcomes
      assert.equal(res.body.capturedOutcomes, 1);
    } finally {
      server.close();
    }
  });

  it('single capture failure does not abort sync — remaining items still processed', async () => {
    // Item 111 throws, items 222 and 333 succeed
    captureResults.set('111', new Error('DB connection lost'));
    captureResults.set('222', { skipped: false, outcome: {}, experimentId: 'exp-2' });
    captureResults.set('333', { skipped: false, outcome: {}, experimentId: 'exp-3' });

    tradingApiResponses.push(buildSoldItemsXml([
      { itemId: '111', soldPrice: '5.00', soldDate: '2026-06-01T00:00:00.000Z', quantitySold: '1' },
      { itemId: '222', soldPrice: '15.00', soldDate: '2026-06-02T00:00:00.000Z', quantitySold: '1' },
      { itemId: '333', soldPrice: '25.00', soldDate: '2026-06-03T00:00:00.000Z', quantitySold: '1' },
    ]));

    const server = await startServer(buildSoldSyncApp());
    try {
      const res = await httpGet(server, '/api/ebay/sold-items');
      assert.equal(res.status, 200);

      // All three items were attempted despite the first one throwing
      assert.equal(captureCalls.length, 3);

      // Only the two successful non-skipped captures count
      assert.equal(res.body.capturedOutcomes, 2);

      // The response still includes all items (sync not aborted)
      assert.equal(res.body.items.length, 3);
    } finally {
      server.close();
    }
  });

  it('response includes capturedOutcomes count in the JSON body', async () => {
    tradingApiResponses.push(buildSoldItemsXml([
      { itemId: '444', soldPrice: '99.99', soldDate: '2026-06-05T00:00:00.000Z', quantitySold: '3' },
    ]));

    const server = await startServer(buildSoldSyncApp());
    try {
      const res = await httpGet(server, '/api/ebay/sold-items');
      assert.equal(res.status, 200);

      // capturedOutcomes field is present and is a number
      assert.equal(typeof res.body.capturedOutcomes, 'number');
      assert.equal(res.body.capturedOutcomes, 1);

      // Other response fields are still present (contract preserved)
      assert.ok(Array.isArray(res.body.items));
      assert.equal(typeof res.body.lookbackDays, 'number');
      assert.equal(typeof res.body.pagesFetched, 'number');
      assert.equal(typeof res.body.totalEntries, 'number');
      assert.ok(res.body.syncedAt);
    } finally {
      server.close();
    }
  });

  it('capturedOutcomes is 0 when no items are returned', async () => {
    tradingApiResponses.push(buildSoldItemsXml([]));

    const server = await startServer(buildSoldSyncApp());
    try {
      const res = await httpGet(server, '/api/ebay/sold-items');
      assert.equal(res.status, 200);
      assert.equal(res.body.capturedOutcomes, 0);
      assert.equal(captureCalls.length, 0);
    } finally {
      server.close();
    }
  });
});
