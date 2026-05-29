// INTEL-003 — unit tests for the optimizer action capture hooks in
// routes/ebay/lifecycle.js (POST /revise and POST /relist).
//
// Verifies:
//   - Revise with optimizerApplied=true + originalListing → createOptimizerAction called
//   - Revise WITHOUT optimizerApplied → createOptimizerAction NOT called
//   - Relist with optimizerApplied=true → createOptimizerAction called with actionType='relist'
//   - createOptimizerAction throwing does NOT break the revise/relist response
//
// Uses Module.prototype.require patching (same pattern as ebay-push-experiment.test.js).

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-optimizer-hooks';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

// ── module fakes ───────────────────────────────────────────────────────────

const Module = require('module');
const originalRequire = Module.prototype.require;

let pushResult = { draftId: 'ebay-200', conditionFallback: false, warnings: [] };

const fakeLifecycle = {
  buildItemSpecificsXml: () => '',
  buildPictureDetailsXml: () => '',
  pushListingToEbay: async () => pushResult,
  sendEbayPushError: (res, e) => res.status(500).json({ error: e.message }),
  uploadImagesToEps: async () => [],
};

const fakeReviseImages = { resolveReviseImageUrls: async () => [] };

// tradingApiCall: return success XML for GetItem, EndFixedPriceItem, and ReviseFixedPriceItem
const fakeClient = {
  tradingApiCall: async ({ callName }) => {
    if (callName === 'ReviseFixedPriceItem') return { data: '<Ack>Success</Ack>' };
    if (callName === 'GetItem') return { data: '<Ack>Success</Ack>' };
    if (callName === 'EndFixedPriceItem') return { data: '<Ack>Success</Ack>' };
    return { data: '<Ack>Success</Ack>' };
  },
};

const fakeErrors = { translateEbayError: () => null };
const fakeRateLimit = {
  createDefaultRateLimiters: () => ({
    ebayWriteRateLimit: (_req, _res, next) => next(),
  }),
};

const fakeEbayAuth = { getValidAccessToken: async () => 'tok' };
const fakeListings = { updateListing: async () => {}, getSettings: async () => ({}) };
const fakeInventory = { incrementInventoryCounters: async () => null };

// Track createOptimizerAction calls
let optimizerActionCalls = [];
let optimizerActionThrow = null;

// Track createExperiment calls (relist also fires experiment snapshot)
let experimentCalls = [];

const fakeIntelligence = {
  createExperiment: async (companyId, doc) => {
    experimentCalls.push({ companyId, doc });
    return doc;
  },
  createOptimizerAction: async (companyId, doc) => {
    if (optimizerActionThrow) throw optimizerActionThrow;
    optimizerActionCalls.push({ companyId, doc });
    return doc;
  },
};

// Let the real optimizerAction module load (it's pure functions)
// We do NOT mock ../../services/intelligence/optimizerAction

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
  optimizerActionCalls = [];
  optimizerActionThrow = null;
  experimentCalls = [];
  pushResult = { draftId: 'ebay-200', conditionFallback: false, warnings: [] };
});

// ── POST /revise with optimizer context ────────────────────────────────────

test('POST /api/ebay/revise with optimizerApplied=true creates an optimizer action', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/revise', {
      itemId: 'EBAY-123',
      newTitle: 'Improved Vintage Camera',
      newPrice: '299.99',
      listingId: 'L1',
      optimizerApplied: true,
      originalListing: {
        id: 'L1',
        title: 'Vintage Camera',
        price: '$249.99',
        description: 'A nice camera',
        itemSpecifics: { Brand: 'Leica' },
        images: ['a.jpg', 'b.jpg'],
      },
      optimizerResult: {
        expectedImpact: { scoreChange: 12, priceChange: 50 },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // createOptimizerAction should have been called once
    assert.equal(optimizerActionCalls.length, 1);
    const { companyId, doc } = optimizerActionCalls[0];
    assert.equal(companyId, 'co1');
    assert.equal(doc.actionType, 'revise');
    assert.equal(doc.ebayItemId, 'EBAY-123');
    assert.equal(doc.listingId, 'L1');
    assert.equal(doc.companyId, 'co1');
    assert.ok(doc.id, 'doc should have an id');
    assert.ok(doc.beforeSnapshot, 'doc should have beforeSnapshot');
    assert.ok(doc.afterSnapshot, 'doc should have afterSnapshot');
    assert.ok(Array.isArray(doc.reasonCodes), 'reasonCodes should be an array');
    assert.equal(doc.expectedImpact.scoreChange, 12);
    assert.equal(doc.expectedImpact.priceChange, 50);
  } finally {
    server.close();
  }
});

// ── POST /revise WITHOUT optimizer context ─────────────────────────────────

test('POST /api/ebay/revise without optimizerApplied does NOT create an optimizer action', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/revise', {
      itemId: 'EBAY-456',
      newTitle: 'Manual Title Edit',
      newPrice: '199.99',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // createOptimizerAction should NOT have been called
    assert.equal(optimizerActionCalls.length, 0);
  } finally {
    server.close();
  }
});

// ── POST /relist with optimizer context ────────────────────────────────────

test('POST /api/ebay/relist with optimizerApplied=true creates an optimizer action with actionType=relist', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/relist', {
      oldItemId: 'EBAY-OLD-1',
      listingId: 'L2',
      listing: {
        id: 'L2',
        title: 'Optimized Relist Title',
        price: '$349.99',
        description: 'Better description for relist',
        itemSpecifics: { Brand: 'Canon', Model: 'AE-1' },
        images: ['img1.jpg', 'img2.jpg', 'img3.jpg'],
      },
      optimizerApplied: true,
      originalListing: {
        id: 'L2',
        title: 'Old Relist Title',
        price: '$299.99',
        description: 'Short desc',
        itemSpecifics: { Brand: 'Canon' },
        images: ['img1.jpg'],
      },
      optimizerResult: {
        expectedImpact: { scoreChange: 8 },
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // createOptimizerAction should have been called once with actionType='relist'
    assert.equal(optimizerActionCalls.length, 1);
    const { companyId, doc } = optimizerActionCalls[0];
    assert.equal(companyId, 'co1');
    assert.equal(doc.actionType, 'relist');
    assert.equal(doc.listingId, 'L2');
    assert.ok(doc.beforeSnapshot, 'doc should have beforeSnapshot');
    assert.ok(doc.afterSnapshot, 'doc should have afterSnapshot');
    assert.ok(Array.isArray(doc.reasonCodes), 'reasonCodes should be an array');
    assert.equal(doc.expectedImpact.scoreChange, 8);
  } finally {
    server.close();
  }
});

// ── Capture failure does NOT break the response ────────────────────────────

test('POST /api/ebay/revise still returns 200 when createOptimizerAction throws', async () => {
  optimizerActionThrow = new Error('Mongo connection lost');
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/revise', {
      itemId: 'EBAY-789',
      newTitle: 'Title After Optimizer',
      listingId: 'L3',
      optimizerApplied: true,
      originalListing: {
        id: 'L3',
        title: 'Title Before',
        price: '$100',
        description: 'desc',
        itemSpecifics: {},
        images: ['x.jpg'],
      },
      optimizerResult: {
        expectedImpact: { scoreChange: 5 },
      },
    });

    // The revise should still succeed — optimizer action capture is non-fatal
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // createOptimizerAction was called (and threw), but no doc was stored
    assert.equal(optimizerActionCalls.length, 0);
  } finally {
    server.close();
  }
});
