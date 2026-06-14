// INTEL-001 — integration tests for the push success → experiment snapshot
// hook in routes/ebay/lifecycle.js (both POST /draft and POST /relist).
//
// Uses Module.prototype.require patching to inject fakes for the
// listingLifecycle service (so no real eBay XML / HTTP), the inventory
// module (so the INV-002 hook is a silent no-op here), and the intelligence
// module (so we can assert what was written).

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-intel-push';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

// ── module fakes ───────────────────────────────────────────────────────────

const Module = require('module');
const originalRequire = Module.prototype.require;

let pushResult = { draftId: 'ebay-99', conditionFallback: false, warnings: [] };
let pushThrow = null;

const fakeLifecycle = {
  buildItemSpecificsXml: () => '',
  buildPictureDetailsXml: () => '',
  pushListingToEbay: async () => {
    if (pushThrow) throw pushThrow;
    return pushResult;
  },
  sendEbayPushError: (res, e) => res.status(500).json({ error: e.message }),
  uploadImagesToEps: async () => [],
};

const fakeReviseImages = { resolveReviseImageUrls: async () => [] };

// Make /relist's GetItem return an Ack-Success XML with no specifics so the
// Step 0 block doesn't blow up.
const fakeClient = {
  tradingApiCall: async ({ callName }) => {
    if (callName === 'GetItem') return { data: '<Ack>Success</Ack>' };
    if (callName === 'EndFixedPriceItem') return { data: '<Ack>Success</Ack>' };
    return { data: '<Ack>Success</Ack>' };
  },
};
const fakeErrors = { translateEbayError: () => null };
const fakeRateLimit = {
  createDefaultRateLimiters: () => ({
    ebayWriteRateLimit: (req, res, next) => next(),
  }),
};

const fakeInventory = { incrementInventoryCounters: async () => null };

let experimentCalls = [];
let createThrow = null;
const fakeIntelligence = {
  createExperiment: async (companyId, doc) => {
    experimentCalls.push({ companyId, doc });
    if (createThrow) throw createThrow;
    return doc;
  },
};

const fakeEbayAuth = { getValidAccessToken: async () => 'tok' };
const fakeListings = { updateListing: async () => {}, getSettings: async () => ({}) };

Module.prototype.require = function patched(name) {
  if (name === '../../ebayAuth') return fakeEbayAuth;
  if (name === '../../listings') return fakeListings;
  if (name === '../../middleware/rateLimit') return fakeRateLimit;
  if (name === '../../services/ebay/client') return fakeClient;
  if (name === '../../services/ebay/errors') return fakeErrors;
  if (name === '../../services/ebay/listingLifecycle') return fakeLifecycle;
  if (name === '../../services/ebay/reviseImages') return fakeReviseImages;
  if (name === '../../inventory') return fakeInventory;
  if (name === '../../intelligence') return fakeIntelligence;
  return originalRequire.apply(this, arguments);
};

const { resetSharedRateLimiters } = require('../middleware/rateLimit');
resetSharedRateLimiters();

delete require.cache[require.resolve('../routes/ebay/lifecycle')];
const lifecycleRouter = require('../routes/ebay/lifecycle');
Module.prototype.require = originalRequire;

// ── test harness ───────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/', authMiddleware);
  app.use('/api/ebay', lifecycleRouter);
  return app;
}

function startServer(app) {
  return new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
}

function tokenFor(companyId = 'co1') {
  return signToken({ id: 'u1', companyId, role: 'user', email: 'x@x', name: 'X' });
}

function request(server, method, path, body, token = tokenFor()) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost', port, path, method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
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
    if (data) req.write(data);
    req.end();
  });
}

test.beforeEach(() => {
  experimentCalls = [];
  createThrow = null;
  pushResult = { draftId: 'ebay-99', conditionFallback: false, warnings: [] };
  pushThrow = null;
});

// ── /draft hook ────────────────────────────────────────────────────────────

test('POST /api/ebay/draft writes an experiment snapshot on success', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/draft', {
      listing: {
        id: 'L1',
        title: 'Vintage Camera',
        priceRecommendation: '$249.99',
        categoryId: '15230',
        category: 'Cameras',
        images: ['a.jpg', 'b.jpg'],
        itemSpecifics: { Brand: 'Leica' },
        tokenUsage: { promptVersion: 'listing.final/v2' },
        healthScore: 84,
      },
      overrideCategoryId: '15999',
      overrideFulfillmentPolicyId: 'pol-A',
      bestOffer: { enabled: true },
    });
    assert.equal(res.status, 200);
    assert.equal(experimentCalls.length, 1);
    const { companyId, doc } = experimentCalls[0];
    assert.equal(companyId, 'co1');
    assert.equal(doc.source, 'push');
    assert.equal(doc.listingId, 'L1');
    assert.equal(doc.ebayItemId, 'ebay-99');
    assert.equal(doc.titleLength, 'Vintage Camera'.length);
    // pushContext.categoryId overrides listing.categoryId
    assert.equal(doc.categoryId, '15999');
    assert.equal(doc.categoryName, 'Cameras');
    assert.equal(doc.priceAtPublish, '249.99');
    assert.equal(doc.shippingPolicyId, 'pol-A');
    assert.equal(doc.bestOfferEnabled, true);
    assert.equal(doc.itemSpecificsCount, 1);
    assert.equal(doc.imageCount, 2);
    assert.equal(doc.promptVersion, 'listing.final/v2');
    assert.equal(doc.listingScoreAtPublish, 84);
    assert.match(doc.id, /^exp-/);
    assert.ok(doc.createdAt);
  } finally {
    server.close();
  }
});

test('POST /api/ebay/draft does NOT write an experiment when the push throws', async () => {
  pushThrow = new Error('eBay rejected the request');
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/draft', {
      listing: { id: 'L', title: 'X' },
    });
    assert.equal(res.status, 500);
    assert.equal(experimentCalls.length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/ebay/draft still returns 200 when the experiment write throws (non-fatal)', async () => {
  createThrow = new Error('mongo down');
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/draft', {
      listing: { id: 'L', title: 'X' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(experimentCalls.length, 1);
  } finally {
    server.close();
  }
});

test('POST /api/ebay/draft tolerates a missing listing payload', async () => {
  const server = await startServer(buildApp());
  try {
    // No `listing` field — the snapshot builder will throw on listing
    // requirement, but the hook is wrapped in try/catch so the push still
    // succeeds and the response is 200.
    const res = await request(server, 'POST', '/api/ebay/draft', { listing: {} });
    assert.equal(res.status, 200);
    // The snapshot still gets built (listing={} → titleLength=0 etc.) because
    // the builder only requires id/companyId/listing/ebayItemId, and the
    // route passes `{}` for the listing.
    assert.equal(experimentCalls.length, 1);
    assert.equal(experimentCalls[0].doc.titleLength, 0);
  } finally {
    server.close();
  }
});

test('POST /api/ebay/draft passes the company id from the JWT through to the experiment write', async () => {
  const server = await startServer(buildApp());
  try {
    await request(server, 'POST', '/api/ebay/draft', {
      listing: { id: 'L', title: 'X' },
    }, tokenFor('co_77'));
    assert.equal(experimentCalls[0].companyId, 'co_77');
  } finally {
    server.close();
  }
});

// ── /relist hook ───────────────────────────────────────────────────────────

test('POST /api/ebay/relist writes an experiment with source="relist" on success', async () => {
  const server = await startServer(buildApp());
  try {
    pushResult = { draftId: 'ebay-relisted-77', conditionFallback: false, warnings: [] };
    const res = await request(server, 'POST', '/api/ebay/relist', {
      oldItemId: '111',
      listingId: 'L1',
      listing: { id: 'L1', title: 'Relisted', categoryId: '15230' },
    });
    assert.equal(res.status, 200);
    assert.equal(experimentCalls.length, 1);
    const { doc } = experimentCalls[0];
    assert.equal(doc.source, 'relist');
    assert.equal(doc.ebayItemId, 'ebay-relisted-77');
    assert.equal(doc.listingId, 'L1');
  } finally {
    server.close();
  }
});

test('POST /api/ebay/relist still returns 200 when the experiment write throws (non-fatal)', async () => {
  createThrow = new Error('mongo down');
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/relist', {
      oldItemId: '111',
      listingId: 'L1',
      listing: { id: 'L1', title: 'X' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(experimentCalls.length, 1);
  } finally {
    server.close();
  }
});
