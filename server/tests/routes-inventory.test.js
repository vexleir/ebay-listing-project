// INV-001 — integration tests for the /api/inventory router. Patches the
// `../inventory` module with an in-memory fake so we cover the HTTP shape
// (status codes, validation, tenant isolation through req.companyId)
// without re-exercising the CRUD module's own unit tests.

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-routes-inventory';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

// ── in-memory fake inventory module ─────────────────────────────────────────

const Module = require('module');
const originalRequire = Module.prototype.require;

function makeFakeInventory() {
  // Keyed by `${companyId}::${id}`.
  const store = new Map();

  function indexFor(companyId, id) { return `${companyId}::${id}`; }

  function findBySku(companyId, sku) {
    if (!sku) return null;
    const normalized = String(sku).trim().toLowerCase();
    for (const doc of store.values()) {
      if (doc.companyId === companyId && doc.sku === normalized) return doc;
    }
    return null;
  }

  return {
    __store: store,
    createInventoryItem: async (companyId, input) => {
      if (!companyId) throw Object.assign(new Error('companyId required'), { status: 400 });
      if (!input || !input.id) throw Object.assign(new Error('id is required'), { status: 400 });
      if (!input.sku || !String(input.sku).trim()) throw Object.assign(new Error('sku is required'), { status: 400 });
      const sku = String(input.sku).trim().toLowerCase();
      if (findBySku(companyId, sku)) {
        throw Object.assign(new Error(`SKU "${input.sku}" already exists in inventory`), { status: 409 });
      }
      const now = new Date().toISOString();
      const doc = {
        id: String(input.id), companyId, sku,
        displayedSku: String(input.sku).trim(),
        quantityOnHand: Number(input.quantityOnHand) || 0,
        quantityListed: 0, quantitySold: 0,
        costBasis: input.costBasis || '',
        sourceTag: input.sourceTag || '',
        sourceEvent: input.sourceEvent || '',
        createdAt: now, updatedAt: now,
      };
      store.set(indexFor(companyId, doc.id), doc);
      return { ...doc };
    },
    getInventoryItem: async (companyId, id) => {
      const doc = store.get(indexFor(companyId, id));
      return doc ? { ...doc } : null;
    },
    getInventoryItemBySku: async (companyId, sku) => {
      const doc = findBySku(companyId, sku);
      return doc ? { ...doc } : null;
    },
    listInventoryItems: async (companyId, opts = {}) => {
      const out = [];
      for (const doc of store.values()) {
        if (doc.companyId !== companyId) continue;
        if (opts.sourceTag && doc.sourceTag !== opts.sourceTag) continue;
        if (opts.skuPrefix && !doc.sku.startsWith(String(opts.skuPrefix).toLowerCase())) continue;
        out.push({ ...doc });
      }
      return out;
    },
    updateInventoryItem: async (companyId, id, updates) => {
      const doc = store.get(indexFor(companyId, id));
      if (!doc) return null;
      if (updates && updates.sku) {
        const normalized = String(updates.sku).trim().toLowerCase();
        const other = findBySku(companyId, normalized);
        if (other && other.id !== id) {
          throw Object.assign(new Error(`SKU "${updates.sku}" already exists in inventory`), { status: 409 });
        }
        doc.sku = normalized;
        doc.displayedSku = String(updates.sku).trim();
      }
      for (const k of ['quantityOnHand', 'quantityListed', 'quantitySold']) {
        if (updates && updates[k] !== undefined) doc[k] = Number(updates[k]) || 0;
      }
      if (updates && updates.costBasis !== undefined) doc.costBasis = updates.costBasis;
      doc.updatedAt = new Date().toISOString();
      return { ...doc };
    },
    deleteInventoryItem: async (companyId, id) => {
      const key = indexFor(companyId, id);
      if (!store.has(key)) return { deleted: 0 };
      store.delete(key);
      return { deleted: 1 };
    },
    __reset: () => store.clear(),
  };
}

const fakeInventory = makeFakeInventory();

Module.prototype.require = function patched(name) {
  if (name === '../inventory') return fakeInventory;
  return originalRequire.apply(this, arguments);
};

const inventoryRouter = require('../routes/inventory');
Module.prototype.require = originalRequire;

// ── test harness ───────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/', authMiddleware);
  app.use('/api/inventory', inventoryRouter);
  return app;
}

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
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

test.beforeEach(() => fakeInventory.__reset());

// ── tests ───────────────────────────────────────────────────────────────────

test('GET /api/inventory requires auth (401 without token)', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'GET', '/api/inventory', null, 'bogus-token');
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('GET /api/inventory returns empty when no items exist', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'GET', '/api/inventory');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { items: [], total: 0 });
  } finally {
    server.close();
  }
});

test('POST /api/inventory creates an item and returns 201 with the canonical doc', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/inventory', {
      item: { id: 'inv1', sku: 'ABC-001', quantityOnHand: 3 },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.id, 'inv1');
    assert.equal(res.body.sku, 'abc-001');
    assert.equal(res.body.displayedSku, 'ABC-001');
    assert.equal(res.body.quantityOnHand, 3);
    assert.ok(res.body.createdAt);
  } finally {
    server.close();
  }
});

test('POST /api/inventory auto-generates an id when omitted', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/inventory', { item: { sku: 'X' } });
    assert.equal(res.status, 201);
    assert.ok(typeof res.body.id === 'string' && res.body.id.length > 0);
  } finally {
    server.close();
  }
});

test('POST /api/inventory returns 400 when body.item is missing', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/inventory', {});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /item required/);
  } finally {
    server.close();
  }
});

test('POST /api/inventory returns 400 when SKU is blank', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/inventory', { item: { sku: '' } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /sku is required/);
  } finally {
    server.close();
  }
});

test('POST /api/inventory returns 409 when the SKU already exists for the company', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/inventory', { item: { id: 'a', sku: 'DUPE' } });
    const res = await request(server, 'POST', '/api/inventory', { item: { id: 'b', sku: 'dupe' } });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already exists/);
  } finally {
    server.close();
  }
});

test('GET /api/inventory/:id returns 404 when not found', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'GET', '/api/inventory/missing');
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('GET /api/inventory/by-sku/:sku returns the canonical doc', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/inventory', { item: { id: 'a', sku: 'WIDGET-2' } });
    const res = await request(server, 'GET', '/api/inventory/by-sku/widget-2');
    assert.equal(res.status, 200);
    assert.equal(res.body.id, 'a');
    assert.equal(res.body.displayedSku, 'WIDGET-2');
  } finally {
    server.close();
  }
});

test('GET /api/inventory does not return items from other companies', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/inventory', { item: { id: 'a', sku: 'X' } }, tokenFor('co1'));
    await request(server, 'POST', '/api/inventory', { item: { id: 'b', sku: 'Y' } }, tokenFor('co2'));
    const res = await request(server, 'GET', '/api/inventory', null, tokenFor('co1'));
    assert.equal(res.status, 200);
    assert.equal(res.body.total, 1);
    assert.equal(res.body.items[0].id, 'a');
  } finally {
    server.close();
  }
});

test('PUT /api/inventory/:id updates fields and returns the new doc', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/inventory', { item: { id: 'a', sku: 'X', quantityOnHand: 1 } });
    const res = await request(server, 'PUT', '/api/inventory/a', { updates: { quantityOnHand: 5 } });
    assert.equal(res.status, 200);
    assert.equal(res.body.quantityOnHand, 5);
  } finally {
    server.close();
  }
});

test('PUT /api/inventory/:id returns 400 when updates is missing', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/inventory', { item: { id: 'a', sku: 'X' } });
    const res = await request(server, 'PUT', '/api/inventory/a', {});
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('PUT /api/inventory/:id returns 404 when the item does not exist', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'PUT', '/api/inventory/missing', { updates: { quantityOnHand: 1 } });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('PUT /api/inventory/:id returns 409 when renaming SKU into a collision', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/inventory', { item: { id: 'a', sku: 'KEEP' } });
    await request(server, 'POST', '/api/inventory', { item: { id: 'b', sku: 'OTHER' } });
    const res = await request(server, 'PUT', '/api/inventory/b', { updates: { sku: 'KEEP' } });
    assert.equal(res.status, 409);
  } finally {
    server.close();
  }
});

test('DELETE /api/inventory/:id removes the item', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/inventory', { item: { id: 'a', sku: 'X' } });
    const del = await request(server, 'DELETE', '/api/inventory/a');
    assert.equal(del.status, 200);
    const get = await request(server, 'GET', '/api/inventory/a');
    assert.equal(get.status, 404);
  } finally {
    server.close();
  }
});

test('DELETE /api/inventory/:id returns 404 when missing', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'DELETE', '/api/inventory/missing');
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
