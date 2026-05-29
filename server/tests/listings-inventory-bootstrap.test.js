// INV-002 — integration test for the listings → inventory auto-bootstrap.
// Verifies that POST /api/listings calls ensureInventoryItemForSku when the
// listing payload carries a SKU, and that the call is a no-op when the SKU
// is absent or blank.
//
// Uses Module.prototype.require patching to inject fakes for both the
// listings and inventory modules so we exercise the wiring without booting
// Mongo. The existing routes-extra.test.js mocks listings only; this file
// covers the new dependency edge that landed under INV-002.

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-inv-bootstrap';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

// ── module fakes ───────────────────────────────────────────────────────────

const Module = require('module');
const originalRequire = Module.prototype.require;

const fakeListings = {
  getListings: async () => [],
  createListing: async () => {},
  updateListing: async () => {},
  deleteListing: async () => {},
  getAllListingsMeta: async () => [],
};

// Each test seeds these via the helpers below. The fake records every call
// so we can assert the bootstrap fired with the right SKU + defaults.
let bootstrapCalls = [];
let bootstrapThrow = null;

const fakeInventory = {
  ensureInventoryItemForSku: async (companyId, sku, defaults = {}) => {
    bootstrapCalls.push({ companyId, sku, defaults });
    if (bootstrapThrow) throw bootstrapThrow;
    return {
      item: { id: 'inv-fake', companyId, sku: String(sku).toLowerCase(), displayedSku: sku, quantityOnHand: 1 },
      created: true,
    };
  },
};

// Patch — the listings router does `require('../listings')` and
// `require('../inventory')` plus `require('../db')` (for the PATCH by-ebay-id
// route). Match both prefixes to handle either depth.
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

test.beforeEach(() => {
  bootstrapCalls = [];
  bootstrapThrow = null;
});

// ── tests ───────────────────────────────────────────────────────────────────

test('POST /api/listings with a SKU calls ensureInventoryItemForSku', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/listings', {
      listing: { id: 'L1', title: 'Widget', sku: 'WIDGET-1' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(bootstrapCalls.length, 1);
    assert.equal(bootstrapCalls[0].companyId, 'co1');
    assert.equal(bootstrapCalls[0].sku, 'WIDGET-1');
  } finally {
    server.close();
  }
});

test('POST /api/listings forwards costBasis as a default for the inventory bootstrap', async () => {
  const server = await startServer(buildApp());
  try {
    await request(server, 'POST', '/api/listings', {
      listing: { id: 'L2', title: 'Camera', sku: 'CAM-1', costBasis: '$25.00' },
    });
    assert.equal(bootstrapCalls.length, 1);
    assert.equal(bootstrapCalls[0].defaults.costBasis, '$25.00');
  } finally {
    server.close();
  }
});

test('POST /api/listings does NOT call ensureInventoryItemForSku when SKU is absent', async () => {
  const server = await startServer(buildApp());
  try {
    await request(server, 'POST', '/api/listings', { listing: { id: 'L3', title: 'No SKU' } });
    assert.equal(bootstrapCalls.length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/listings does NOT call ensureInventoryItemForSku when SKU is blank or whitespace', async () => {
  const server = await startServer(buildApp());
  try {
    await request(server, 'POST', '/api/listings', { listing: { id: 'a', title: 'A', sku: '' } });
    await request(server, 'POST', '/api/listings', { listing: { id: 'b', title: 'B', sku: '   ' } });
    assert.equal(bootstrapCalls.length, 0);
  } finally {
    server.close();
  }
});

test('POST /api/listings succeeds even when the inventory bootstrap throws (non-fatal)', async () => {
  bootstrapThrow = new Error('mongo down');
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/listings', {
      listing: { id: 'L5', title: 'Resilient', sku: 'RES-1' },
    });
    // The listing was still created successfully; the bootstrap failure
    // only gets a warn-level log.
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(bootstrapCalls.length, 1);
  } finally {
    server.close();
  }
});

test('POST /api/listings passes the request company id through to ensureInventoryItemForSku', async () => {
  const server = await startServer(buildApp());
  try {
    await request(server, 'POST', '/api/listings', {
      listing: { id: 'L6', title: 'Multi-tenant', sku: 'TENANT-1' },
    }, tokenFor('co_42'));
    assert.equal(bootstrapCalls[0].companyId, 'co_42');
  } finally {
    server.close();
  }
});
