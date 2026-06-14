// Integration tests for bulk operation endpoints:
// POST /bulk/move-items, POST /bulk/move-location, POST /bulk/rename,
// POST /bulk/assign-shelves, POST /bulk/merge-aliases

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-bulk-ops';

const express = require('express');
const { signToken, authMiddleware } = require('../../auth');

// ── in-memory fake DB ───────────────────────────────────────────────────────

const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

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
      countDocuments(filter) {
        return Promise.resolve(filterDocs(docs, filter).length);
      },
      updateOne(filter, update) {
        const doc = docs.find((d) => matchesFilter(d, filter));
        if (doc && update.$set) {
          Object.assign(doc, update.$set);
        }
        if (doc && update.$addToSet) {
          for (const [key, val] of Object.entries(update.$addToSet)) {
            if (!Array.isArray(doc[key])) doc[key] = [];
            if (!doc[key].includes(val)) doc[key].push(val);
          }
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
        const exists = doc[key] !== undefined && doc[key] !== null;
        if (val.$exists && !exists) return false;
        if (!val.$exists && exists) return false;
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
const fakeDbModule = { getDb: async () => fakeDb };
const dbModulePath = path.resolve(__dirname, '..', '..', 'db.js');

// Clear cached modules
for (const key of Object.keys(require.cache)) {
  if (key.includes('containers') || key.includes('routes')) {
    delete require.cache[key];
  }
}

Module._resolveFilename = function (request, parent, ...rest) {
  const resolved = originalResolveFilename.call(this, request, parent, ...rest);
  if (resolved === dbModulePath) {
    return '__fake_db_bulk__';
  }
  return resolved;
};

require.cache['__fake_db_bulk__'] = {
  id: '__fake_db_bulk__',
  filename: '__fake_db_bulk__',
  loaded: true,
  exports: fakeDbModule,
};

const containerRouter = require('../../routes/containers');

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

// Helper to seed a container directly in the fake DB
function seedContainer(overrides = {}) {
  const now = new Date().toISOString();
  const container = {
    id: `c-${Math.random().toString(36).slice(2)}`,
    companyId: 'co1',
    name: `Container ${Math.random().toString(36).slice(2)}`,
    containerType: 'Tote',
    status: 'Active',
    active: true,
    currentItemCount: 0,
    createdAt: now,
    updatedAt: now,
    building: null,
    room: null,
    shelf: null,
    shelfRow: null,
    ...overrides,
  };
  fakeDb.collection('containers').insertOne(container);
  return container;
}

// Helper to seed an item assignment
function seedAssignment(containerId, itemId) {
  const assignment = {
    id: `a-${Math.random().toString(36).slice(2)}`,
    companyId: 'co1',
    containerId,
    itemId,
    itemType: 'inventory',
    assignedAt: new Date().toISOString(),
    assignedBy: 'u1',
    updatedAt: new Date().toISOString(),
  };
  fakeDb.collection('container_item_assignments').insertOne(assignment);
  return assignment;
}

// Helper to seed an alias
function seedAlias(containerId, aliasValue) {
  const alias = {
    id: `alias-${Math.random().toString(36).slice(2)}`,
    companyId: 'co1',
    containerId,
    aliasValue,
    normalizedValue: aliasValue,
    confidenceScore: 100,
    source: 'test',
    mergeHistory: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  fakeDb.collection('container_aliases').insertOne(alias);
  return alias;
}

test.beforeEach(() => fakeDb.__reset());

// ── POST /bulk/move-items ────────────────────────────────────────────────────

test('POST /bulk/move-items moves all items from source to target', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const source = seedContainer({ name: 'Source' });
    const target = seedContainer({ name: 'Target' });
    seedAssignment(source.id, 'item-1');
    seedAssignment(source.id, 'item-2');
    seedAssignment(source.id, 'item-3');

    const res = await request(server, 'POST', '/api/containers/bulk/move-items', {
      sourceContainerId: source.id,
      targetContainerId: target.id,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.processed, 3);
    assert.equal(res.body.failed, 0);
    assert.deepEqual(res.body.failures, []);
  } finally {
    server.close();
  }
});

test('POST /bulk/move-items returns 400 when target is archived', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const source = seedContainer({ name: 'Source' });
    const target = seedContainer({ name: 'Archived Target', status: 'Archived' });

    const res = await request(server, 'POST', '/api/containers/bulk/move-items', {
      sourceContainerId: source.id,
      targetContainerId: target.id,
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /archived/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/move-items returns 400 when source equals target', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const container = seedContainer({ name: 'Same' });

    const res = await request(server, 'POST', '/api/containers/bulk/move-items', {
      sourceContainerId: container.id,
      targetContainerId: container.id,
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /different/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/move-items returns 404 when source not found', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const target = seedContainer({ name: 'Target' });

    const res = await request(server, 'POST', '/api/containers/bulk/move-items', {
      sourceContainerId: 'non-existent',
      targetContainerId: target.id,
    });

    assert.equal(res.status, 404);
    assert.match(res.body.error, /source.*not found/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/move-items records audit entries for each item', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const source = seedContainer({ name: 'Source' });
    const target = seedContainer({ name: 'Target' });
    seedAssignment(source.id, 'item-1');
    seedAssignment(source.id, 'item-2');

    await request(server, 'POST', '/api/containers/bulk/move-items', {
      sourceContainerId: source.id,
      targetContainerId: target.id,
    });

    const auditEntries = await fakeDb.collection('container_audit')
      .find({ companyId: 'co1', actionType: 'item_move' }).toArray();
    assert.equal(auditEntries.length, 2);
  } finally {
    server.close();
  }
});

// ── POST /bulk/move-location ─────────────────────────────────────────────────

test('POST /bulk/move-location moves containers at a location level', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    seedContainer({ name: 'C1', room: 'Garage' });
    seedContainer({ name: 'C2', room: 'Garage' });
    seedContainer({ name: 'C3', room: 'Office' });

    const res = await request(server, 'POST', '/api/containers/bulk/move-location', {
      level: 'room',
      currentValue: 'Garage',
      newValue: 'Workshop',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.processed, 2);
    assert.equal(res.body.failed, 0);
  } finally {
    server.close();
  }
});

test('POST /bulk/move-location skips archived containers and reports them as failures', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    seedContainer({ name: 'Active', room: 'Garage' });
    seedContainer({ name: 'Archived', room: 'Garage', status: 'Archived' });

    const res = await request(server, 'POST', '/api/containers/bulk/move-location', {
      level: 'room',
      currentValue: 'Garage',
      newValue: 'Workshop',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 1);
    assert.equal(res.body.failed, 1);
    assert.match(res.body.failures[0].error, /archived/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/move-location returns 400 for invalid level', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/containers/bulk/move-location', {
      level: 'invalid',
      currentValue: 'Garage',
      newValue: 'Workshop',
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /level must be one of/i);
  } finally {
    server.close();
  }
});

// ── POST /bulk/rename ────────────────────────────────────────────────────────

test('POST /bulk/rename renames multiple containers', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const c1 = seedContainer({ name: 'Old Name 1' });
    const c2 = seedContainer({ name: 'Old Name 2' });

    const res = await request(server, 'POST', '/api/containers/bulk/rename', {
      renames: [
        { containerId: c1.id, newName: 'New Name 1' },
        { containerId: c2.id, newName: 'New Name 2' },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.processed, 2);
    assert.equal(res.body.failed, 0);
  } finally {
    server.close();
  }
});

test('POST /bulk/rename reports failures for non-existent containers', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const c1 = seedContainer({ name: 'Exists' });

    const res = await request(server, 'POST', '/api/containers/bulk/rename', {
      renames: [
        { containerId: c1.id, newName: 'Renamed' },
        { containerId: 'non-existent', newName: 'Wont Work' },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 1);
    assert.equal(res.body.failed, 1);
    assert.match(res.body.failures[0].error, /not found/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/rename rejects archived containers', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const c1 = seedContainer({ name: 'Archived', status: 'Archived' });

    const res = await request(server, 'POST', '/api/containers/bulk/rename', {
      renames: [
        { containerId: c1.id, newName: 'New Name' },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 0);
    assert.equal(res.body.failed, 1);
    assert.match(res.body.failures[0].error, /archived/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/rename returns 400 when exceeding 500 limit', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const renames = Array.from({ length: 501 }, (_, i) => ({
      containerId: `c-${i}`,
      newName: `Name ${i}`,
    }));

    const res = await request(server, 'POST', '/api/containers/bulk/rename', { renames });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /500/);
  } finally {
    server.close();
  }
});

test('POST /bulk/rename records audit entries for each rename', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const c1 = seedContainer({ name: 'Before 1' });
    const c2 = seedContainer({ name: 'Before 2' });

    await request(server, 'POST', '/api/containers/bulk/rename', {
      renames: [
        { containerId: c1.id, newName: 'After 1' },
        { containerId: c2.id, newName: 'After 2' },
      ],
    });

    const auditEntries = await fakeDb.collection('container_audit')
      .find({ companyId: 'co1', actionType: 'rename' }).toArray();
    assert.equal(auditEntries.length, 2);
  } finally {
    server.close();
  }
});

// ── POST /bulk/assign-shelves ────────────────────────────────────────────────

test('POST /bulk/assign-shelves assigns shelf locations to containers', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const c1 = seedContainer({ name: 'C1' });
    const c2 = seedContainer({ name: 'C2' });

    const res = await request(server, 'POST', '/api/containers/bulk/assign-shelves', {
      assignments: [
        { containerId: c1.id, shelf: 'A', shelfRow: '1' },
        { containerId: c2.id, shelf: 'B', shelfRow: '2' },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.processed, 2);
    assert.equal(res.body.failed, 0);
  } finally {
    server.close();
  }
});

test('POST /bulk/assign-shelves rejects archived containers', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const c1 = seedContainer({ name: 'Archived', status: 'Archived' });

    const res = await request(server, 'POST', '/api/containers/bulk/assign-shelves', {
      assignments: [
        { containerId: c1.id, shelf: 'A' },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 0);
    assert.equal(res.body.failed, 1);
    assert.match(res.body.failures[0].error, /archived/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/assign-shelves returns 400 when exceeding 500 limit', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const assignments = Array.from({ length: 501 }, (_, i) => ({
      containerId: `c-${i}`,
      shelf: `S${i}`,
    }));

    const res = await request(server, 'POST', '/api/containers/bulk/assign-shelves', { assignments });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /500/);
  } finally {
    server.close();
  }
});

test('POST /bulk/assign-shelves reports failure when neither shelf nor shelfRow provided', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const c1 = seedContainer({ name: 'C1' });

    const res = await request(server, 'POST', '/api/containers/bulk/assign-shelves', {
      assignments: [
        { containerId: c1.id },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 0);
    assert.equal(res.body.failed, 1);
    assert.match(res.body.failures[0].error, /shelf or shelfRow/i);
  } finally {
    server.close();
  }
});

// ── POST /bulk/merge-aliases ─────────────────────────────────────────────────

test('POST /bulk/merge-aliases merges aliases into target container', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const source = seedContainer({ name: 'Source' });
    const target = seedContainer({ name: 'Target' });
    const alias1 = seedAlias(source.id, 'SKU-001');
    const alias2 = seedAlias(source.id, 'SKU-002');

    const res = await request(server, 'POST', '/api/containers/bulk/merge-aliases', {
      aliasIds: [alias1.id, alias2.id],
      targetContainerId: target.id,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.processed, 2);
    assert.equal(res.body.failed, 0);
  } finally {
    server.close();
  }
});

test('POST /bulk/merge-aliases returns 400 when target is archived', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const target = seedContainer({ name: 'Archived Target', status: 'Archived' });

    const res = await request(server, 'POST', '/api/containers/bulk/merge-aliases', {
      aliasIds: ['alias-1'],
      targetContainerId: target.id,
    });

    assert.equal(res.status, 400);
    assert.match(res.body.error, /archived/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/merge-aliases returns 404 when target not found', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const res = await request(server, 'POST', '/api/containers/bulk/merge-aliases', {
      aliasIds: ['alias-1'],
      targetContainerId: 'non-existent',
    });

    assert.equal(res.status, 404);
    assert.match(res.body.error, /not found/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/merge-aliases reports failures for non-existent aliases', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const target = seedContainer({ name: 'Target' });
    const source = seedContainer({ name: 'Source' });
    const alias1 = seedAlias(source.id, 'SKU-001');

    const res = await request(server, 'POST', '/api/containers/bulk/merge-aliases', {
      aliasIds: [alias1.id, 'non-existent-alias'],
      targetContainerId: target.id,
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.processed, 1);
    assert.equal(res.body.failed, 1);
    assert.match(res.body.failures[0].error, /not found/i);
  } finally {
    server.close();
  }
});

test('POST /bulk/merge-aliases records audit entries for each merge', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const source = seedContainer({ name: 'Source' });
    const target = seedContainer({ name: 'Target' });
    const alias1 = seedAlias(source.id, 'SKU-001');
    const alias2 = seedAlias(source.id, 'SKU-002');

    await request(server, 'POST', '/api/containers/bulk/merge-aliases', {
      aliasIds: [alias1.id, alias2.id],
      targetContainerId: target.id,
    });

    const auditEntries = await fakeDb.collection('container_audit')
      .find({ companyId: 'co1', actionType: 'merge' }).toArray();
    assert.equal(auditEntries.length, 2);
  } finally {
    server.close();
  }
});

// ── Partial failure semantics ────────────────────────────────────────────────

test('Bulk rename commits successes even when some items fail', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    const c1 = seedContainer({ name: 'Good Container' });

    const res = await request(server, 'POST', '/api/containers/bulk/rename', {
      renames: [
        { containerId: c1.id, newName: 'Renamed Good' },
        { containerId: 'non-existent', newName: 'Will Fail' },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.processed, 1);
    assert.equal(res.body.failed, 1);

    // Verify the successful rename was committed
    const container = await fakeDb.collection('containers')
      .findOne({ companyId: 'co1', id: c1.id });
    assert.equal(container.name, 'Renamed Good');
  } finally {
    server.close();
  }
});
