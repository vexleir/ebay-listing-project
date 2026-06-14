// Integration tests for container type management endpoints:
// GET /types, POST /types, DELETE /types/:name

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-container-types';

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
      find(filter) {
        const results = filterDocs(docs, filter);
        return {
          sort() { return this; },
          toArray() { return Promise.resolve([...results]); },
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
      } else {
        if (doc[key] !== val) return false;
      }
    }
    return true;
  }

  return {
    collection: getCollection,
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
// db.js is at server/db.js, __dirname is server/tests/containers/
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
    return '__fake_db__';
  }
  return resolved;
};

// Pre-populate the cache with our fake
require.cache['__fake_db__'] = {
  id: '__fake_db__',
  filename: '__fake_db__',
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

test.beforeEach(() => fakeDb.__reset());

// ── GET /types tests ────────────────────────────────────────────────────────

test('GET /api/containers/types returns default types after seeding', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'GET', '/api/containers/types');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.types));
    assert.ok(res.body.types.length >= 11, 'Should have at least 11 default types');

    const names = res.body.types.map((t) => t.name);
    assert.ok(names.includes('Tote'));
    assert.ok(names.includes('Shelf Bin'));
    assert.ok(names.includes('Card Box'));
    assert.ok(names.includes('Other'));
  } finally {
    server.close();
  }
});

test('GET /api/containers/types requires auth', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'GET', '/api/containers/types', null, 'bad-token');
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

// ── POST /types tests ───────────────────────────────────────────────────────

test('POST /api/containers/types creates a custom type', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/containers/types', { name: 'Custom Bin' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'Custom Bin');
    assert.equal(res.body.isDefault, false);
    assert.ok(res.body.createdAt);
  } finally {
    server.close();
  }
});

test('POST /api/containers/types returns 400 when name is missing', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/containers/types', {});
    assert.equal(res.status, 400);
    assert.match(res.body.error, /name is required/);
  } finally {
    server.close();
  }
});

test('POST /api/containers/types returns 400 when name is empty string', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/containers/types', { name: '   ' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /between 1 and 50 characters/);
  } finally {
    server.close();
  }
});

test('POST /api/containers/types returns 400 when name exceeds 50 characters', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const longName = 'A'.repeat(51);
    const res = await request(server, 'POST', '/api/containers/types', { name: longName });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /between 1 and 50 characters/);
  } finally {
    server.close();
  }
});

test('POST /api/containers/types returns 409 on case-insensitive duplicate', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/containers/types', { name: 'My Type' });
    const res = await request(server, 'POST', '/api/containers/types', { name: 'my type' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already exists/);
  } finally {
    server.close();
  }
});

test('POST /api/containers/types returns 409 when duplicating a default type', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed defaults first
    await request(server, 'GET', '/api/containers/types');
    // Try to create a type with same name as default
    const res = await request(server, 'POST', '/api/containers/types', { name: 'tote' });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already exists/);
  } finally {
    server.close();
  }
});

test('POST /api/containers/types accepts name at exactly 50 characters', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const name50 = 'A'.repeat(50);
    const res = await request(server, 'POST', '/api/containers/types', { name: name50 });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, name50);
  } finally {
    server.close();
  }
});

test('POST /api/containers/types accepts name at exactly 1 character', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/containers/types', { name: 'X' });
    assert.equal(res.status, 201);
    assert.equal(res.body.name, 'X');
  } finally {
    server.close();
  }
});

// ── DELETE /types/:name tests ───────────────────────────────────────────────

test('DELETE /api/containers/types/:name deletes a custom type', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/containers/types', { name: 'Deletable' });
    const res = await request(server, 'DELETE', '/api/containers/types/Deletable');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);

    // Verify it's gone
    const list = await request(server, 'GET', '/api/containers/types');
    const names = list.body.types.map((t) => t.name);
    assert.ok(!names.includes('Deletable'));
  } finally {
    server.close();
  }
});

test('DELETE /api/containers/types/:name returns 400 for default type', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed defaults
    await request(server, 'GET', '/api/containers/types');
    const res = await request(server, 'DELETE', '/api/containers/types/Tote');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Cannot delete default container type/);
  } finally {
    server.close();
  }
});

test('DELETE /api/containers/types/:name returns 404 for non-existent type', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'DELETE', '/api/containers/types/NonExistent');
    assert.equal(res.status, 404);
    assert.match(res.body.error, /not found/i);
  } finally {
    server.close();
  }
});

test('DELETE /api/containers/types/:name returns 409 when type is in use', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Create a custom type
    await request(server, 'POST', '/api/containers/types', { name: 'InUseType' });

    // Create a container using that type
    await request(server, 'POST', '/api/containers', {
      name: 'Test Container',
      containerType: 'InUseType',
    });

    // Try to delete the type
    const res = await request(server, 'DELETE', '/api/containers/types/InUseType');
    assert.equal(res.status, 409);
    assert.match(res.body.error, /Container type in use by 1 containers/);
  } finally {
    server.close();
  }
});

test('DELETE /api/containers/types/:name is case-insensitive', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/containers/types', { name: 'MyCustom' });
    const res = await request(server, 'DELETE', '/api/containers/types/mycustom');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  } finally {
    server.close();
  }
});

test('DELETE /api/containers/types/:name handles URL-encoded names', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    await request(server, 'POST', '/api/containers/types', { name: 'My Type' });
    const res = await request(server, 'DELETE', '/api/containers/types/My%20Type');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  } finally {
    server.close();
  }
});
