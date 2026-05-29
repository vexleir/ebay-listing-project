// End-to-end integration tests for the container management system.
// Tests the full workflow: generate → review → merge → location update → audit trail
// Tests backward compatibility with existing inventory/listing operations
// Tests reporting queries across multiple dimensions within 2 seconds
//
// Validates: Requirements 4.7, 17.6, 17.7

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-integration';

const express = require('express');
const { signToken, authMiddleware } = require('../../auth');

// ── in-memory fake DB ───────────────────────────────────────────────────────

const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

/**
 * Creates an in-memory fake MongoDB-like database for testing.
 * Supports $set, $addToSet, $regex, $ne, $in, $exists, sort, project.
 */
function makeFakeDb() {
  const collections = {};

  function getCollection(name) {
    if (!collections[name]) {
      collections[name] = [];
    }
    const docs = collections[name];
    return {
      find(filter, options) {
        const results = filterDocs(docs, filter);
        let sortSpec = null;
        let projectionSpec = options?.projection || null;
        return {
          sort(spec) { sortSpec = spec; return this; },
          skip() { return this; },
          limit() { return this; },
          project(spec) { projectionSpec = spec; return this; },
          toArray() {
            let sorted = results.map(d => ({ ...d }));
            if (sortSpec) {
              const keys = Object.keys(sortSpec);
              sorted.sort((a, b) => {
                for (const key of keys) {
                  const dir = sortSpec[key];
                  if (a[key] < b[key]) return -1 * dir;
                  if (a[key] > b[key]) return 1 * dir;
                }
                return 0;
              });
            }
            if (projectionSpec) {
              sorted = sorted.map(d => {
                const projected = {};
                for (const [key, include] of Object.entries(projectionSpec)) {
                  if (include) projected[key] = d[key];
                }
                // Always include _id unless explicitly excluded
                if (projectionSpec._id !== 0) projected._id = d._id;
                return projected;
              });
            }
            return Promise.resolve(sorted);
          },
        };
      },
      findOne(filter) {
        const results = filterDocs(docs, filter);
        return Promise.resolve(results[0] ? { ...results[0] } : null);
      },
      insertOne(doc) {
        const copy = { ...doc, _id: `_id_${Math.random().toString(36).slice(2)}` };
        docs.push(copy);
        doc._id = copy._id;
        return Promise.resolve({ insertedId: copy._id });
      },
      deleteOne(filter) {
        const idx = docs.findIndex((d) => matchesFilter(d, filter));
        if (idx >= 0) {
          docs.splice(idx, 1);
          return Promise.resolve({ deletedCount: 1 });
        }
        return Promise.resolve({ deletedCount: 0 });
      },
      deleteMany(filter) {
        const matching = docs.filter((d) => matchesFilter(d, filter));
        for (const m of matching) {
          const idx = docs.indexOf(m);
          if (idx >= 0) docs.splice(idx, 1);
        }
        return Promise.resolve({ deletedCount: matching.length });
      },
      countDocuments(filter) {
        return Promise.resolve(filterDocs(docs, filter).length);
      },
      updateOne(filter, update) {
        const doc = docs.find((d) => matchesFilter(d, filter));
        if (doc) {
          if (update.$set) {
            Object.assign(doc, update.$set);
          }
          if (update.$addToSet) {
            for (const [key, val] of Object.entries(update.$addToSet)) {
              if (!Array.isArray(doc[key])) {
                doc[key] = [];
              }
              if (!doc[key].includes(val)) {
                doc[key].push(val);
              }
            }
          }
        }
        return Promise.resolve({ matchedCount: doc ? 1 : 0 });
      },
      updateMany(filter, update) {
        const matching = docs.filter((d) => matchesFilter(d, filter));
        for (const doc of matching) {
          if (update.$set) Object.assign(doc, update.$set);
          if (update.$addToSet) {
            for (const [key, val] of Object.entries(update.$addToSet)) {
              if (!Array.isArray(doc[key])) {
                doc[key] = [];
              }
              if (!doc[key].includes(val)) {
                doc[key].push(val);
              }
            }
          }
        }
        return Promise.resolve({ matchedCount: matching.length, modifiedCount: matching.length });
      },
    };
  }

  function filterDocs(docs, filter) {
    return docs.filter((d) => matchesFilter(d, filter));
  }

  function matchesFilter(doc, filter) {
    for (const [key, val] of Object.entries(filter)) {
      if (key === '_id') {
        if (doc._id !== val) return false;
        continue;
      }
      if (val && typeof val === 'object' && val.$regex) {
        const regex = val.$regex instanceof RegExp ? val.$regex : new RegExp(val.$regex, val.$options || '');
        if (!regex.test(doc[key] || '')) return false;
      } else if (val && typeof val === 'object' && val.$ne !== undefined) {
        if (val.$exists !== undefined) {
          // Combined $exists + $ne
          const exists = doc[key] !== undefined && doc[key] !== null;
          if (val.$exists && !exists) return false;
          if (!val.$exists && exists) return false;
          if (exists && doc[key] === val.$ne) return false;
        } else {
          if (doc[key] === val.$ne) return false;
        }
      } else if (val && typeof val === 'object' && val.$in) {
        if (!val.$in.includes(doc[key])) return false;
      } else if (val && typeof val === 'object' && val.$exists !== undefined) {
        const exists = doc[key] !== undefined && doc[key] !== null;
        if (val.$exists && !exists) return false;
        if (!val.$exists && exists) return false;
        if (val.$ne !== undefined && doc[key] === val.$ne) return false;
      } else {
        if (doc[key] !== val) return false;
      }
    }
    return true;
  }

  return {
    collection: getCollection,
    __collections: collections,
    __reset() {
      for (const key of Object.keys(collections)) {
        collections[key].length = 0;
      }
    },
  };
}

const fakeDb = makeFakeDb();

// Create a fake db module
const fakeDbModule = { getDb: async () => fakeDb };

// Resolve the real path to db.js so we can intercept it
const dbModulePath = path.resolve(__dirname, '..', '..', 'db.js');

// Clear all cached modules that might have loaded the real db
for (const key of Object.keys(require.cache)) {
  if (key.includes('containers') || key.includes('routes') || key.includes('listings')) {
    delete require.cache[key];
  }
}

// Intercept resolution of db.js
Module._resolveFilename = function (request, parent, ...rest) {
  const resolved = originalResolveFilename.call(this, request, parent, ...rest);
  if (resolved === dbModulePath) {
    return '__fake_db_integration__';
  }
  return resolved;
};

// Pre-populate the cache with our fake
require.cache['__fake_db_integration__'] = {
  id: '__fake_db_integration__',
  filename: '__fake_db_integration__',
  loaded: true,
  exports: fakeDbModule,
};

const containerRouter = require('../../routes/containers');

// Restore original resolution
Module._resolveFilename = originalResolveFilename;

// ── test harness ───────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/', authMiddleware);
  app.use('/api/containers', containerRouter);
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

function request(server, method, urlPath, body, token = tokenFor()) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost', port, path: urlPath, method,
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

/**
 * Seeds listings into the fake DB for container generation tests.
 */
function seedListings(listings) {
  const col = fakeDb.collection('listings');
  for (const listing of listings) {
    col.insertOne({ companyId: 'co1', ...listing });
  }
}

test.beforeEach(() => fakeDb.__reset());

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Full workflow — generate → review → merge → location update → audit
// ═══════════════════════════════════════════════════════════════════════════

test('Full workflow: generate → review queue → accept → location update → audit trail', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Step 1: Seed listings with various SKUs
    seedListings([
      { id: 'listing-1', sku: 'Tote 1', title: 'Widget A', price: 9.99, description: 'A widget', status: 'staged' },
      { id: 'listing-2', sku: 'Tote-1', title: 'Widget B', price: 14.99, description: 'B widget', status: 'staged' },
      { id: 'listing-3', sku: 'Shelf Bin 2', title: 'Gadget C', price: 24.99, description: 'C gadget', status: 'listed' },
      { id: 'listing-4', sku: 'ShelfBin2', title: 'Gadget D', price: 19.99, description: 'D gadget', status: 'listed' },
      { id: 'listing-5', sku: 'Long Box 3', title: 'Item E', price: 5.00, description: 'E item', status: 'staged' },
    ]);

    // Step 2: POST /api/containers/generate → creates containers and aliases
    const genRes = await request(server, 'POST', '/api/containers/generate');
    assert.equal(genRes.status, 200);
    assert.ok(genRes.body.containersCreated >= 1, 'Should create at least one container');
    assert.ok(genRes.body.aliasesMapped >= 1, 'Should map at least one alias');

    // Step 3: Verify containers were created
    const listRes = await request(server, 'GET', '/api/containers');
    assert.equal(listRes.status, 200);
    assert.ok(listRes.body.containers.length >= 1, 'Should have containers after generation');

    // Step 4: GET /api/containers/review-queue → check for entries
    const reviewRes = await request(server, 'GET', '/api/containers/review-queue');
    assert.equal(reviewRes.status, 200);
    // Review queue may or may not have entries depending on confidence scoring
    // (SKUs that normalize identically get auto-merged, not queued)
    assert.ok(Array.isArray(reviewRes.body.entries), 'Review queue should return an array');

    // Step 5: If there are review queue entries, accept one
    if (reviewRes.body.entries.length > 0) {
      const entry = reviewRes.body.entries[0];
      const acceptRes = await request(server, 'POST', `/api/containers/review-queue/${entry.id}/accept`);
      assert.equal(acceptRes.status, 200);
      assert.equal(acceptRes.body.success, true);
    }

    // Step 6: Find an active container and update its location
    const activeContainers = listRes.body.containers.filter(c => c.status === 'Active');
    assert.ok(activeContainers.length > 0, 'Should have at least one active container');
    const targetContainer = activeContainers[0];

    const updateRes = await request(server, 'PUT', `/api/containers/${targetContainer.id}`, {
      building: 'Home',
      room: 'Garage',
      shelf: 'A',
      shelfRow: '2',
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.building, 'Home');
    assert.equal(updateRes.body.room, 'Garage');
    assert.equal(updateRes.body.shelf, 'A');
    assert.equal(updateRes.body.shelfRow, '2');

    // Step 7: Verify audit trail has entries for all operations
    const auditDocs = fakeDb.collection('container_audit');
    const allAudit = await auditDocs.find({ companyId: 'co1' }).toArray();
    assert.ok(allAudit.length >= 2, 'Should have audit entries for create and location update');

    // Verify we have a create audit entry
    const createAudits = allAudit.filter(e => e.actionType === 'create');
    assert.ok(createAudits.length >= 1, 'Should have at least one create audit entry');

    // Verify we have a location_change audit entry
    const locationAudits = allAudit.filter(e => e.actionType === 'location_change');
    assert.ok(locationAudits.length >= 1, 'Should have at least one location_change audit entry');
  } finally {
    server.close();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Backward compatibility — existing listings preserved after generation
// ═══════════════════════════════════════════════════════════════════════════

test('Backward compatibility: container generation preserves existing listing data', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Step 1: Seed a listing with full data
    const originalListing = {
      id: 'listing-compat-1',
      sku: 'Tote 5',
      title: 'Vintage Baseball Card Collection',
      price: 149.99,
      description: 'A rare collection of 1990s baseball cards in mint condition.',
      status: 'listed',
      images: ['http://example.com/img1.jpg'],
      itemSpecifics: { brand: 'Topps', year: '1992' },
    };
    seedListings([originalListing]);

    // Step 2: Run container generation
    const genRes = await request(server, 'POST', '/api/containers/generate');
    assert.equal(genRes.status, 200);
    assert.ok(genRes.body.containersCreated >= 1);

    // Step 3: Verify the listing is unchanged (title, price, description, SKU all preserved)
    const listingDoc = await fakeDb.collection('listings').findOne({
      companyId: 'co1',
      id: 'listing-compat-1',
    });
    assert.ok(listingDoc, 'Listing should still exist');
    assert.equal(listingDoc.title, originalListing.title, 'Title should be preserved');
    assert.equal(listingDoc.price, originalListing.price, 'Price should be preserved');
    assert.equal(listingDoc.description, originalListing.description, 'Description should be preserved');
    assert.equal(listingDoc.sku, originalListing.sku, 'SKU should be preserved byte-for-byte');
    assert.equal(listingDoc.status, originalListing.status, 'Status should be preserved');

    // Step 4: Verify existing container CRUD still works after generation
    // Create a new container manually
    const createRes = await request(server, 'POST', '/api/containers', {
      name: 'Manual Container',
      containerType: 'Tote',
    });
    assert.equal(createRes.status, 201);
    const manualId = createRes.body.id;

    // GET the container
    const getRes = await request(server, 'GET', `/api/containers/${manualId}`);
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.name, 'Manual Container');

    // PUT update the container
    const putRes = await request(server, 'PUT', `/api/containers/${manualId}`, {
      notes: 'Updated after generation',
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.notes, 'Updated after generation');
  } finally {
    server.close();
  }
});

test('Backward compatibility: idempotent generation does not create duplicates', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed listings
    seedListings([
      { id: 'listing-idem-1', sku: 'Box A', title: 'Item 1', price: 10, description: 'Desc', status: 'staged' },
      { id: 'listing-idem-2', sku: 'Box B', title: 'Item 2', price: 20, description: 'Desc', status: 'staged' },
    ]);

    // First generation
    const gen1 = await request(server, 'POST', '/api/containers/generate');
    assert.equal(gen1.status, 200);
    const firstCount = gen1.body.containersCreated;
    assert.ok(firstCount >= 2, 'Should create containers on first run');

    // Second generation — should be idempotent
    const gen2 = await request(server, 'POST', '/api/containers/generate');
    assert.equal(gen2.status, 200);
    assert.equal(gen2.body.containersCreated, 0, 'Second run should not create new containers');
    assert.equal(gen2.body.aliasesMapped, 0, 'Second run should not create new aliases');
  } finally {
    server.close();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: Reporting readiness — filtering by multiple dimensions within 2s
// ═══════════════════════════════════════════════════════════════════════════

test('Reporting: filter containers by status and type in a single query', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Create multiple containers with different statuses and types
    await request(server, 'POST', '/api/containers', {
      name: 'Active Tote 1',
      containerType: 'Tote',
    });
    await request(server, 'POST', '/api/containers', {
      name: 'Active Tote 2',
      containerType: 'Tote',
    });
    await request(server, 'POST', '/api/containers', {
      name: 'Active Bin 1',
      containerType: 'Shelf Bin',
    });
    const archiveTarget = await request(server, 'POST', '/api/containers', {
      name: 'Archived Tote',
      containerType: 'Tote',
    });
    // Archive one
    await request(server, 'DELETE', `/api/containers/${archiveTarget.body.id}`);

    // Filter by status=Active and type=Tote
    const start = Date.now();
    const res = await request(server, 'GET', '/api/containers?status=Active&type=Tote');
    const elapsed = Date.now() - start;

    assert.equal(res.status, 200);
    assert.equal(res.body.containers.length, 2, 'Should return only active totes');
    assert.ok(res.body.containers.every(c => c.status === 'Active'), 'All should be Active');
    assert.ok(res.body.containers.every(c => c.containerType === 'Tote'), 'All should be Tote');
    assert.ok(elapsed < 2000, `Query should complete within 2 seconds (took ${elapsed}ms)`);
  } finally {
    server.close();
  }
});

test('Reporting: filter containers by location fields (building + room)', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Create containers with different locations
    await request(server, 'POST', '/api/containers', {
      name: 'Garage Tote A',
      containerType: 'Tote',
      building: 'Home',
      room: 'Garage',
    });
    await request(server, 'POST', '/api/containers', {
      name: 'Garage Bin B',
      containerType: 'Shelf Bin',
      building: 'Home',
      room: 'Garage',
    });
    await request(server, 'POST', '/api/containers', {
      name: 'Office Tote C',
      containerType: 'Tote',
      building: 'Home',
      room: 'Office',
    });
    await request(server, 'POST', '/api/containers', {
      name: 'Warehouse Box D',
      containerType: 'Long Box',
      building: 'Warehouse',
      room: 'Section A',
    });

    // Filter by building=Home and room=Garage
    const start = Date.now();
    const res = await request(server, 'GET', '/api/containers?building=Home&room=Garage');
    const elapsed = Date.now() - start;

    assert.equal(res.status, 200);
    assert.equal(res.body.containers.length, 2, 'Should return only Home/Garage containers');
    assert.ok(res.body.containers.every(c => c.building === 'Home'), 'All should be in Home');
    assert.ok(res.body.containers.every(c => c.room === 'Garage'), 'All should be in Garage');
    assert.ok(elapsed < 2000, `Query should complete within 2 seconds (took ${elapsed}ms)`);

    // Filter by building only
    const buildingRes = await request(server, 'GET', '/api/containers?building=Home');
    assert.equal(buildingRes.status, 200);
    assert.equal(buildingRes.body.containers.length, 3, 'Should return all Home containers');

    // Filter by building=Warehouse
    const warehouseRes = await request(server, 'GET', '/api/containers?building=Warehouse');
    assert.equal(warehouseRes.status, 200);
    assert.equal(warehouseRes.body.containers.length, 1);
    assert.equal(warehouseRes.body.containers[0].name, 'Warehouse Box D');
  } finally {
    server.close();
  }
});

test('Reporting: multi-dimensional query combines status, type, and location', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Create a variety of containers
    await request(server, 'POST', '/api/containers', {
      name: 'Target Container',
      containerType: 'Tote',
      building: 'Home',
      room: 'Garage',
    });
    await request(server, 'POST', '/api/containers', {
      name: 'Non-Target Type',
      containerType: 'Shelf Bin',
      building: 'Home',
      room: 'Garage',
    });
    await request(server, 'POST', '/api/containers', {
      name: 'Non-Target Room',
      containerType: 'Tote',
      building: 'Home',
      room: 'Office',
    });
    const toArchive = await request(server, 'POST', '/api/containers', {
      name: 'Archived Garage Tote',
      containerType: 'Tote',
      building: 'Home',
      room: 'Garage',
    });
    await request(server, 'DELETE', `/api/containers/${toArchive.body.id}`);

    // Query: Active + Tote + Home + Garage — should return exactly 1
    const start = Date.now();
    const res = await request(server, 'GET', '/api/containers?status=Active&type=Tote&building=Home&room=Garage');
    const elapsed = Date.now() - start;

    assert.equal(res.status, 200);
    assert.equal(res.body.containers.length, 1, 'Should return exactly one matching container');
    assert.equal(res.body.containers[0].name, 'Target Container');
    assert.ok(elapsed < 2000, `Multi-dimensional query should complete within 2 seconds (took ${elapsed}ms)`);
  } finally {
    server.close();
  }
});
