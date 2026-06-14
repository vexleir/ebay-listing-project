// INV-002 — integration tests for the push success → inventory counter
// sync hook in routes/ebay/lifecycle.js POST /draft.
//
// Uses Module.prototype.require patching to inject fakes for both the
// listingLifecycle service (so we don't run any real eBay XML / HTTP) and
// the inventory module (so we can assert what counters were touched).

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-inv-push';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

// ── module fakes ───────────────────────────────────────────────────────────

const Module = require('module');
const originalRequire = Module.prototype.require;

let pushOutcome = { success: true, ebayDraftId: '12345' };
let pushThrow = null;

const fakeLifecycle = {
  buildItemSpecificsXml: () => '',
  buildPictureDetailsXml: () => '',
  pushListingToEbay: async () => {
    if (pushThrow) throw pushThrow;
    return pushOutcome;
  },
  sendEbayPushError: (res, e) => res.status(500).json({ error: e.message }),
  uploadImagesToEps: async () => [],
};

const fakeReviseImages = { resolveReviseImageUrls: async () => [] };

let counterCalls = [];
let counterThrow = null;
const fakeInventory = {
  incrementInventoryCounters: async (companyId, sku, deltas) => {
    counterCalls.push({ companyId, sku, deltas });
    if (counterThrow) throw counterThrow;
    return { id: 'i', companyId, sku: String(sku).toLowerCase(), quantityListed: 1 };
  },
};

const fakeEbayAuth = { getValidAccessToken: async () => 'tok' };
const fakeListings = { updateListing: async () => {}, getSettings: async () => ({}) };
const fakeClient = { tradingApiCall: async () => ({ data: '' }) };
const fakeErrors = { translateEbayError: () => null };
const fakeRateLimit = {
  createDefaultRateLimiters: () => ({
    ebayWriteRateLimit: (req, res, next) => next(),
  }),
};

Module.prototype.require = function patched(name) {
  if (name === '../../ebayAuth') return fakeEbayAuth;
  if (name === '../../listings') return fakeListings;
  if (name === '../../middleware/rateLimit') return fakeRateLimit;
  if (name === '../../services/ebay/client') return fakeClient;
  if (name === '../../services/ebay/errors') return fakeErrors;
  if (name === '../../services/ebay/listingLifecycle') return fakeLifecycle;
  if (name === '../../services/ebay/reviseImages') return fakeReviseImages;
  if (name === '../../inventory') return fakeInventory;
  return originalRequire.apply(this, arguments);
};

// Force-reset the shared rate-limiter singleton so the lifecycle router
// picks up our fake limiter on require.
const { resetSharedRateLimiters } = require('../middleware/rateLimit');
resetSharedRateLimiters();

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
  counterCalls = [];
  counterThrow = null;
  pushOutcome = { success: true, ebayDraftId: '12345' };
  pushThrow = null;
});

// ── tests ───────────────────────────────────────────────────────────────────

test('POST /api/ebay/draft increments listed and decrements on-hand on success when SKU is set', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/draft', {
      listing: { id: 'L1', title: 'Widget', sku: 'WIDGET-1' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(counterCalls.length, 1);
    assert.equal(counterCalls[0].companyId, 'co1');
    assert.equal(counterCalls[0].sku, 'WIDGET-1');
    assert.deepEqual(counterCalls[0].deltas, { quantityOnHand: -1, quantityListed: 1 });
  } finally {
    server.close();
  }
});

test('POST /api/ebay/draft does NOT touch counters when SKU is absent', async () => {
  const server = await startServer(buildApp());
  try {
    await request(server, 'POST', '/api/ebay/draft', {
      listing: { id: 'L2', title: 'No SKU' },
    });
    assert.equal(counterCalls.length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/ebay/draft does NOT touch counters when SKU is blank or whitespace', async () => {
  const server = await startServer(buildApp());
  try {
    await request(server, 'POST', '/api/ebay/draft', { listing: { id: 'a', sku: '' } });
    await request(server, 'POST', '/api/ebay/draft', { listing: { id: 'b', sku: '   ' } });
    assert.equal(counterCalls.length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/ebay/draft does NOT touch counters when the push throws', async () => {
  pushThrow = new Error('eBay rejected the request');
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/draft', {
      listing: { id: 'L3', sku: 'NOPUSH-1' },
    });
    assert.equal(res.status, 500);
    assert.equal(counterCalls.length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/ebay/draft still returns 200 when the counter update throws (non-fatal)', async () => {
  counterThrow = new Error('mongo down');
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/ebay/draft', {
      listing: { id: 'L4', sku: 'RESILIENT-1' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(counterCalls.length, 1);
  } finally {
    server.close();
  }
});

test('POST /api/ebay/draft passes the company id from the JWT through to the counter call', async () => {
  const server = await startServer(buildApp());
  try {
    await request(server, 'POST', '/api/ebay/draft', {
      listing: { id: 'L5', sku: 'TENANT-1' },
    }, tokenFor('co_99'));
    assert.equal(counterCalls[0].companyId, 'co_99');
  } finally {
    server.close();
  }
});
