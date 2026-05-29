// INV-002 — integration tests for the sold-sync inventory wiring in
// PUT /api/listings/:id. Confirms the route loads the existing listing,
// detects the sold transition, applies the update, and (when crossing the
// sold boundary) fires the inventory counter sync. Non-fatal: a counter
// failure does not break the listing update.

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-sold-sync';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

// ── module fakes ───────────────────────────────────────────────────────────

const Module = require('module');
const originalRequire = Module.prototype.require;

let storedListings = new Map(); // key: `${companyId}::${id}` → doc

const fakeListings = {
  getListings: async () => [],
  getListing: async (companyId, id) => {
    return storedListings.get(`${companyId}::${id}`) || null;
  },
  createListing: async () => {},
  updateListing: async (companyId, id, updates) => {
    const key = `${companyId}::${id}`;
    const existing = storedListings.get(key) || {};
    storedListings.set(key, { ...existing, ...updates });
  },
  deleteListing: async () => {},
  getAllListingsMeta: async () => [],
};

let bootstrapCalls = [];
let counterCalls = [];
let counterThrow = null;
const fakeInventory = {
  ensureInventoryItemForSku: async (companyId, sku) => {
    bootstrapCalls.push({ companyId, sku });
    return { item: {}, created: true };
  },
  incrementInventoryCounters: async (companyId, sku, deltas) => {
    counterCalls.push({ companyId, sku, deltas });
    if (counterThrow) throw counterThrow;
    return null;
  },
};

const fakeDb = { getDb: async () => ({ collection: () => ({ updateOne: async () => ({ matchedCount: 0 }) }) }) };

Module.prototype.require = function patched(name) {
  if (name === '../listings') return fakeListings;
  if (name === '../inventory') return fakeInventory;
  if (name === '../db') return fakeDb;
  return originalRequire.apply(this, arguments);
};

const listingsRouter = require('../routes/listings');
Module.prototype.require = originalRequire;

// ── test harness ───────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/', authMiddleware);
  app.use('/api/listings', listingsRouter);
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

function seed(companyId, id, doc) {
  storedListings.set(`${companyId}::${id}`, { id, companyId, ...doc });
}

test.beforeEach(() => {
  storedListings = new Map();
  bootstrapCalls = [];
  counterCalls = [];
  counterThrow = null;
});

// ── tests ───────────────────────────────────────────────────────────────────

test('PUT /api/listings/:id increments sold and decrements listed on the mark-sold transition', async () => {
  seed('co1', 'L1', { sku: 'WIDGET-1', soldAt: null });
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'PUT', '/api/listings/L1', {
      updates: { archived: true, soldAt: 1700000000000, soldPrice: '15.00' },
    });
    assert.equal(res.status, 200);
    assert.equal(counterCalls.length, 1);
    assert.equal(counterCalls[0].sku, 'WIDGET-1');
    assert.deepEqual(counterCalls[0].deltas, { quantitySold: 1, quantityListed: -1 });
  } finally {
    server.close();
  }
});

test('PUT /api/listings/:id decrements sold and increments listed on the unmark-sold transition', async () => {
  seed('co1', 'L1', { sku: 'WIDGET-1', soldAt: 1700000000000 });
  const server = await startServer(buildApp());
  try {
    await request(server, 'PUT', '/api/listings/L1', {
      updates: { archived: false, soldAt: null },
    });
    assert.equal(counterCalls.length, 1);
    assert.deepEqual(counterCalls[0].deltas, { quantitySold: -1, quantityListed: 1 });
  } finally {
    server.close();
  }
});

test('PUT /api/listings/:id does NOT touch counters when updates do not mention soldAt', async () => {
  seed('co1', 'L1', { sku: 'WIDGET-1', soldAt: null });
  const server = await startServer(buildApp());
  try {
    await request(server, 'PUT', '/api/listings/L1', {
      updates: { priceRecommendation: '20.00' },
    });
    assert.equal(counterCalls.length, 0);
  } finally {
    server.close();
  }
});

test('PUT /api/listings/:id does NOT touch counters when soldAt is in payload but state is unchanged', async () => {
  seed('co1', 'L1', { sku: 'WIDGET-1', soldAt: 1700000000000 });
  const server = await startServer(buildApp());
  try {
    // Update the sale date but stay sold.
    await request(server, 'PUT', '/api/listings/L1', {
      updates: { soldAt: 1700000000001, soldPrice: '20.00' },
    });
    assert.equal(counterCalls.length, 0);
  } finally {
    server.close();
  }
});

test('PUT /api/listings/:id does NOT touch counters when the existing listing has no SKU', async () => {
  seed('co1', 'L1', { soldAt: null });
  const server = await startServer(buildApp());
  try {
    await request(server, 'PUT', '/api/listings/L1', {
      updates: { soldAt: 1700000000000 },
    });
    assert.equal(counterCalls.length, 0);
  } finally {
    server.close();
  }
});

test('PUT /api/listings/:id still returns 200 when the counter sync throws (non-fatal)', async () => {
  counterThrow = new Error('mongo down');
  seed('co1', 'L1', { sku: 'WIDGET-1', soldAt: null });
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'PUT', '/api/listings/L1', {
      updates: { soldAt: 1700000000000 },
    });
    assert.equal(res.status, 200);
    assert.equal(counterCalls.length, 1);
  } finally {
    server.close();
  }
});

test('PUT /api/listings/:id passes the company id through to the inventory call', async () => {
  seed('co_99', 'L1', { sku: 'TENANT-1', soldAt: null });
  const server = await startServer(buildApp());
  try {
    await request(server, 'PUT', '/api/listings/L1', {
      updates: { soldAt: 1700000000000 },
    }, tokenFor('co_99'));
    assert.equal(counterCalls[0].companyId, 'co_99');
  } finally {
    server.close();
  }
});
