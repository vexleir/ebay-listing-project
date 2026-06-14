// Integration tests for container generation endpoint:
// POST /api/containers/generate
//
// Validates:
// - Property 1: One container per unique canonical name
// - Property 2: Idempotency — running twice produces no duplicates
// - Property 10: Existing data preservation
// - Property 11: Container name uniqueness
// - Property 12: ID stability across renames
// - SKU values preserved byte-for-byte in alias records
// - Empty/invalid SKUs are skipped

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-generation';

const express = require('express');
const { signToken, authMiddleware } = require('../../auth');

// ── in-memory fake DB ───────────────────────────────────────────────────────

const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

/**
 * Creates an in-memory fake MongoDB-like database for testing.
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
        return {
          sort() { return this; },
          skip() { return this; },
          limit() { return this; },
          project() { return this; },
          toArray() { return Promise.resolve(results.map(d => ({ ...d }))); },
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
        if (doc && update.$set) {
          Object.assign(doc, update.$set);
        }
        return Promise.resolve({ matchedCount: doc ? 1 : 0 });
      },
      updateMany(filter, update) {
        const matching = docs.filter((d) => matchesFilter(d, filter));
        for (const doc of matching) {
          if (update.$set) Object.assign(doc, update.$set);
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
        if (doc[key] === val.$ne) return false;
      } else if (val && typeof val === 'object' && val.$in) {
        if (!val.$in.includes(doc[key])) return false;
      } else if (val && typeof val === 'object' && val.$exists !== undefined) {
        const exists = doc[key] !== undefined;
        if (val.$exists && !exists) return false;
        if (!val.$exists && exists) return false;
        // Also handle combined $exists + $ne
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
  if (key.includes('containers') || key.includes('routes')) {
    delete require.cache[key];
  }
}

// Intercept resolution of db.js
Module._resolveFilename = function (request, parent, ...rest) {
  const resolved = originalResolveFilename.call(this, request, parent, ...rest);
  if (resolved === dbModulePath) {
    return '__fake_db_generation__';
  }
  return resolved;
};

// Pre-populate the cache with our fake
require.cache['__fake_db_generation__'] = {
  id: '__fake_db_generation__',
  filename: '__fake_db_generation__',
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
 * Seeds listing documents with the given SKU values into the fake DB.
 */
function seedListings(skus, companyId = 'co1') {
  const listingsCol = fakeDb.collection('listings');
  for (const sku of skus) {
    listingsCol.insertOne({
      id: `listing-${Math.random().toString(36).slice(2)}`,
      companyId,
      sku,
      title: `Item with SKU ${sku}`,
      price: 9.99,
      description: 'Test listing',
    });
  }
}

test.beforeEach(() => fakeDb.__reset());

// ── Property 1: One container per unique canonical name ─────────────────────

test('POST /api/containers/generate creates one container per unique canonical name (Property 1)', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // "Tote 1", "tote-1", "TOTE_1" all normalize to "Tote 1"
    seedListings(['Tote 1', 'tote-1', 'TOTE_1']);

    const res = await request(server, 'POST', '/api/containers/generate');
    assert.equal(res.status, 200);
    assert.equal(res.body.containersCreated, 1, 'Should create exactly 1 container');
    assert.equal(res.body.aliasesMapped, 3, 'Should create 3 alias records');

    // Verify only one container exists
    const containers = fakeDb.collection('containers')
      .find({ companyId: 'co1' });
    const containerDocs = await containers.toArray();
    // Filter out only active generated containers (not container_types)
    const generatedContainers = containerDocs.filter(c => c.id && c.name);
    assert.equal(generatedContainers.length, 1);
    assert.equal(generatedContainers[0].name, 'Tote 1');
  } finally {
    server.close();
  }
});

test('POST /api/containers/generate creates separate containers for distinct canonical names', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // "Tote 1" and "Shelf 1" normalize to different canonical names
    seedListings(['Tote 1', 'Shelf 1']);

    const res = await request(server, 'POST', '/api/containers/generate');
    assert.equal(res.status, 200);
    assert.equal(res.body.containersCreated, 2, 'Should create 2 containers');
    assert.equal(res.body.aliasesMapped, 2, 'Should create 2 alias records');

    // Verify two containers exist
    const containers = fakeDb.collection('containers')
      .find({ companyId: 'co1' });
    const containerDocs = await containers.toArray();
    const names = containerDocs.map(c => c.name).sort();
    assert.ok(names.includes('Shelf 1'));
    assert.ok(names.includes('Tote 1'));
  } finally {
    server.close();
  }
});

// ── Property 2: Idempotency — running twice produces no duplicates ──────────

test('POST /api/containers/generate is idempotent — second run creates nothing (Property 2)', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    seedListings(['Tote 1', 'Shelf 1']);

    // First run
    const res1 = await request(server, 'POST', '/api/containers/generate');
    assert.equal(res1.status, 200);
    assert.equal(res1.body.containersCreated, 2);
    assert.equal(res1.body.aliasesMapped, 2);

    // Second run — should produce no new containers or aliases
    const res2 = await request(server, 'POST', '/api/containers/generate');
    assert.equal(res2.status, 200);
    assert.equal(res2.body.containersCreated, 0, 'Second run should create 0 containers');
    assert.equal(res2.body.aliasesMapped, 0, 'Second run should map 0 aliases');
  } finally {
    server.close();
  }
});

// ── Property 10: Existing data preservation ─────────────────────────────────

test('POST /api/containers/generate preserves existing listing records (Property 10)', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed listings with specific data
    const listingsCol = fakeDb.collection('listings');
    await listingsCol.insertOne({
      id: 'listing-preserve-1',
      companyId: 'co1',
      sku: 'Tote 1',
      title: 'My Special Item',
      price: 29.99,
      description: 'A detailed description',
      images: ['img1.jpg', 'img2.jpg'],
      shippingDetails: { weight: 2.5 },
    });
    await listingsCol.insertOne({
      id: 'listing-preserve-2',
      companyId: 'co1',
      sku: 'Shelf 2',
      title: 'Another Item',
      price: 14.50,
      description: 'Another description',
    });

    // Snapshot listings before generation
    const beforeDocs = await listingsCol.find({ companyId: 'co1' }).toArray();

    // Run generation
    const res = await request(server, 'POST', '/api/containers/generate');
    assert.equal(res.status, 200);

    // Verify listings are unchanged after generation
    const afterDocs = await listingsCol.find({ companyId: 'co1' }).toArray();
    assert.equal(afterDocs.length, beforeDocs.length, 'Listing count should not change');

    for (const before of beforeDocs) {
      const after = afterDocs.find(d => d.id === before.id);
      assert.ok(after, `Listing ${before.id} should still exist`);
      assert.equal(after.sku, before.sku, 'SKU should be unchanged');
      assert.equal(after.title, before.title, 'Title should be unchanged');
      assert.equal(after.price, before.price, 'Price should be unchanged');
      assert.equal(after.description, before.description, 'Description should be unchanged');
    }
  } finally {
    server.close();
  }
});

// ── Property 11: Container name uniqueness ──────────────────────────────────

test('POST /api/containers/generate enforces container name uniqueness (Property 11)', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed multiple SKUs that normalize to the same canonical name
    seedListings(['Tote 1', 'tote-1', 'TOTE_1', 'tote 1', 'Tote-1']);

    const res = await request(server, 'POST', '/api/containers/generate');
    assert.equal(res.status, 200);
    assert.equal(res.body.containersCreated, 1, 'Should create only 1 container despite 5 SKUs');

    // Verify no duplicate container names exist
    const containers = await fakeDb.collection('containers')
      .find({ companyId: 'co1' }).toArray();
    const names = containers.map(c => c.name?.toLowerCase()).filter(Boolean);
    const uniqueNames = new Set(names);
    assert.equal(names.length, uniqueNames.size, 'All container names should be unique');
  } finally {
    server.close();
  }
});

// ── Property 12: ID stability across renames ────────────────────────────────

test('Container ID remains stable after rename (Property 12)', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Generate a container
    seedListings(['Tote 1']);
    const genRes = await request(server, 'POST', '/api/containers/generate');
    assert.equal(genRes.status, 200);
    assert.equal(genRes.body.containersCreated, 1);

    // Get the generated container
    const containers = await fakeDb.collection('containers')
      .find({ companyId: 'co1' }).toArray();
    const container = containers.find(c => c.name === 'Tote 1');
    assert.ok(container, 'Container should exist');
    const originalId = container.id;

    // Get alias records pointing to this container
    const aliasesBefore = await fakeDb.collection('container_aliases')
      .find({ companyId: 'co1', containerId: originalId }).toArray();
    assert.ok(aliasesBefore.length > 0, 'Should have alias records');

    // Rename the container via PUT endpoint
    const renameRes = await request(server, 'PUT', `/api/containers/${originalId}`, {
      name: 'Renamed Tote',
    });
    assert.equal(renameRes.status, 200);
    assert.equal(renameRes.body.name, 'Renamed Tote');
    assert.equal(renameRes.body.id, originalId, 'ID should not change after rename');

    // Verify alias records still reference the same container ID
    const aliasesAfter = await fakeDb.collection('container_aliases')
      .find({ companyId: 'co1', containerId: originalId }).toArray();
    assert.equal(aliasesAfter.length, aliasesBefore.length, 'Alias count should not change');
    for (const alias of aliasesAfter) {
      assert.equal(alias.containerId, originalId, 'Alias should still reference original container ID');
    }
  } finally {
    server.close();
  }
});

// ── SKU values preserved byte-for-byte ──────────────────────────────────────

test('POST /api/containers/generate preserves SKU values byte-for-byte in alias records', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Use SKUs with various punctuation, casing, and spacing
    const originalSkus = ['Tote 1', 'tote-1', 'TOTE_1', 'Shelf #2', 'shelf--2'];
    seedListings(originalSkus);

    const res = await request(server, 'POST', '/api/containers/generate');
    assert.equal(res.status, 200);

    // Verify each original SKU appears byte-for-byte in an alias record
    const aliases = await fakeDb.collection('container_aliases')
      .find({ companyId: 'co1' }).toArray();

    const aliasValues = aliases.map(a => a.aliasValue);
    for (const sku of originalSkus) {
      assert.ok(
        aliasValues.includes(sku),
        `Alias record should contain exact SKU value "${sku}"`
      );
    }
  } finally {
    server.close();
  }
});

// ── Empty/invalid SKUs are skipped ──────────────────────────────────────────

test('POST /api/containers/generate skips empty, null, and whitespace-only SKUs', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed listings with a mix of valid and invalid SKUs
    const listingsCol = fakeDb.collection('listings');
    await listingsCol.insertOne({ id: 'l1', companyId: 'co1', sku: 'Tote 1', title: 'Valid' });
    await listingsCol.insertOne({ id: 'l2', companyId: 'co1', sku: '', title: 'Empty' });
    await listingsCol.insertOne({ id: 'l3', companyId: 'co1', sku: '   ', title: 'Whitespace' });
    await listingsCol.insertOne({ id: 'l4', companyId: 'co1', sku: null, title: 'Null' });
    await listingsCol.insertOne({ id: 'l5', companyId: 'co1', sku: '---', title: 'Punctuation only' });
    await listingsCol.insertOne({ id: 'l6', companyId: 'co1', sku: 'Shelf 1', title: 'Valid 2' });

    const res = await request(server, 'POST', '/api/containers/generate');
    assert.equal(res.status, 200);

    // Only "Tote 1" and "Shelf 1" should produce containers
    assert.equal(res.body.containersCreated, 2, 'Should create 2 containers from valid SKUs');
    assert.equal(res.body.aliasesMapped, 2, 'Should map 2 aliases from valid SKUs');

    // Verify no containers were created for invalid SKUs
    const containers = await fakeDb.collection('containers')
      .find({ companyId: 'co1' }).toArray();
    const names = containers.map(c => c.name);
    assert.ok(!names.includes(''), 'No container with empty name');
    assert.ok(!names.includes('   '), 'No container with whitespace name');
  } finally {
    server.close();
  }
});
