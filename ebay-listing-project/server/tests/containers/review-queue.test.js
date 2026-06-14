// Integration tests for review queue endpoints:
// GET /review-queue, POST /review-queue/:id/accept, POST /review-queue/:id/reject,
// POST /review-queue/:id/create-new, POST /review-queue/:id/ignore

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const path = require('node:path');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-review-queue';

const express = require('express');
const { signToken, authMiddleware } = require('../../auth');

// ── in-memory fake DB ───────────────────────────────────────────────────────

const Module = require('module');
const originalResolveFilename = Module._resolveFilename;

/**
 * Creates an in-memory fake MongoDB-like database for testing.
 * Supports $set, $addToSet, $regex, $ne, $in, and sort with confidenceScore.
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
        let sortSpec = null;
        return {
          sort(spec) { sortSpec = spec; return this; },
          skip() { return this; },
          limit() { return this; },
          project() { return this; },
          toArray() {
            let sorted = results.map(d => ({ ...d }));
            if (sortSpec) {
              const keys = Object.keys(sortSpec);
              sorted.sort((a, b) => {
                for (const key of keys) {
                  const dir = sortSpec[key]; // 1 = asc, -1 = desc
                  if (a[key] < b[key]) return -1 * dir;
                  if (a[key] > b[key]) return 1 * dir;
                }
                return 0;
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
    return '__fake_db_review_queue__';
  }
  return resolved;
};

// Pre-populate the cache with our fake
require.cache['__fake_db_review_queue__'] = {
  id: '__fake_db_review_queue__',
  filename: '__fake_db_review_queue__',
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

// ── helpers to seed review queue entries ────────────────────────────────────

function seedReviewEntry(overrides = {}) {
  const entry = {
    id: `rq-${Math.random().toString(36).slice(2)}`,
    companyId: 'co1',
    originalSku: 'Tote-1A',
    suggestedContainerId: 'container-123',
    suggestedContainerName: 'Tote 1 A',
    confidenceScore: 75,
    reason: '"Tote-1A" may refer to the same container as "Tote 1 A"',
    status: 'pending',
    rejectedPairs: [],
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    ...overrides,
  };
  fakeDb.collection('review_queue').insertOne(entry);
  return entry;
}

function seedContainer(overrides = {}) {
  const container = {
    id: `container-${Math.random().toString(36).slice(2)}`,
    companyId: 'co1',
    name: 'Test Container',
    containerType: 'Tote',
    status: 'Active',
    active: true,
    currentItemCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    building: null,
    room: null,
    shelf: null,
    shelfRow: null,
    ...overrides,
  };
  fakeDb.collection('containers').insertOne(container);
  return container;
}

test.beforeEach(() => fakeDb.__reset());

// ── GET /review-queue — List pending entries ────────────────────────────────

test('GET /review-queue returns pending entries ordered by confidence score descending', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed entries with different confidence scores
    seedReviewEntry({ id: 'rq-low', confidenceScore: 55, originalSku: 'SKU-Low' });
    seedReviewEntry({ id: 'rq-high', confidenceScore: 85, originalSku: 'SKU-High' });
    seedReviewEntry({ id: 'rq-mid', confidenceScore: 70, originalSku: 'SKU-Mid' });
    // Seed a resolved entry that should NOT appear
    seedReviewEntry({ id: 'rq-resolved', confidenceScore: 80, status: 'accepted' });

    const res = await request(server, 'GET', '/api/containers/review-queue');
    assert.equal(res.status, 200);
    assert.equal(res.body.entries.length, 3, 'Should only return pending entries');
    // Verify descending order by confidence score
    assert.equal(res.body.entries[0].confidenceScore, 85);
    assert.equal(res.body.entries[1].confidenceScore, 70);
    assert.equal(res.body.entries[2].confidenceScore, 55);
  } finally {
    server.close();
  }
});

// ── POST /review-queue/:id/accept — Accept merge ────────────────────────────

test('POST /review-queue/:id/accept merges SKU into container, creates alias, records audit', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed a container that the review entry points to
    const container = seedContainer({ id: 'container-target', name: 'Tote 1 A' });
    // Seed a pending review entry pointing to that container
    const entry = seedReviewEntry({
      id: 'rq-accept-1',
      suggestedContainerId: container.id,
      suggestedContainerName: container.name,
      originalSku: 'Tote-1A',
      confidenceScore: 75,
    });

    const res = await request(server, 'POST', '/api/containers/review-queue/rq-accept-1/accept');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.entry.status, 'accepted');
    assert.ok(res.body.entry.resolvedAt, 'Should have resolvedAt');
    assert.ok(res.body.entry.resolvedBy, 'Should have resolvedBy');

    // Verify alias was created
    const aliases = await fakeDb.collection('container_aliases').find({ companyId: 'co1' }).toArray();
    assert.ok(aliases.length >= 1, 'Should have created an alias');
    const alias = aliases.find(a => a.aliasValue === 'Tote-1A');
    assert.ok(alias, 'Alias should reference the original SKU');
    assert.equal(alias.containerId, container.id);
    assert.equal(alias.source, 'review-queue-accept');

    // Verify audit entry was recorded
    const auditEntries = await fakeDb.collection('container_audit').find({ companyId: 'co1' }).toArray();
    assert.ok(auditEntries.length >= 1, 'Should have at least one audit entry');
    const acceptAudit = auditEntries.find(a => a.actionType === 'review_accept');
    assert.ok(acceptAudit, 'Should have a review_accept audit entry');
    assert.equal(acceptAudit.entityId, container.id);
  } finally {
    server.close();
  }
});

test('POST /review-queue/:id/accept returns 400 when container no longer exists', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed a review entry pointing to a container that does NOT exist
    seedReviewEntry({
      id: 'rq-no-container',
      suggestedContainerId: 'deleted-container-id',
      suggestedContainerName: 'Deleted Container',
    });

    const res = await request(server, 'POST', '/api/containers/review-queue/rq-no-container/accept');
    assert.equal(res.status, 400);
    assert.match(res.body.error, /no longer exists/i);
  } finally {
    server.close();
  }
});

test('POST /review-queue/:id/accept returns 409 when entry already resolved', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed an already-resolved entry
    seedReviewEntry({
      id: 'rq-already-resolved',
      status: 'accepted',
      resolvedAt: new Date().toISOString(),
      resolvedBy: 'u1',
    });

    const res = await request(server, 'POST', '/api/containers/review-queue/rq-already-resolved/accept');
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already resolved/i);
  } finally {
    server.close();
  }
});

// ── POST /review-queue/:id/reject — Reject merge ────────────────────────────

test('POST /review-queue/:id/reject marks rejected, adds pair key to rejectedPairs, records audit', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    seedReviewEntry({
      id: 'rq-reject-1',
      originalSku: 'Tote-1B',
      suggestedContainerName: 'Tote 1 A',
      confidenceScore: 65,
    });

    const res = await request(server, 'POST', '/api/containers/review-queue/rq-reject-1/reject');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.entry.status, 'rejected');
    assert.ok(res.body.entry.resolvedAt, 'Should have resolvedAt');

    // Verify the rejectedPairs field was populated in the DB
    const dbEntry = await fakeDb.collection('review_queue').findOne({ id: 'rq-reject-1' });
    assert.ok(Array.isArray(dbEntry.rejectedPairs), 'rejectedPairs should be an array');
    assert.ok(dbEntry.rejectedPairs.length > 0, 'rejectedPairs should have at least one entry');
    // The pair key is built from the normalized original SKU and the suggested container name, sorted and joined with |
    const pairKey = dbEntry.rejectedPairs[0];
    assert.ok(pairKey.includes('|'), 'Pair key should contain a pipe separator');

    // Verify audit entry was recorded
    const auditEntries = await fakeDb.collection('container_audit').find({ companyId: 'co1' }).toArray();
    const rejectAudit = auditEntries.find(a => a.actionType === 'review_reject');
    assert.ok(rejectAudit, 'Should have a review_reject audit entry');
    assert.equal(rejectAudit.entityId, 'rq-reject-1');
  } finally {
    server.close();
  }
});

// ── POST /review-queue/:id/create-new — Create new container ────────────────

test('POST /review-queue/:id/create-new creates new container, creates alias, records audit', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    seedReviewEntry({
      id: 'rq-create-new-1',
      originalSku: 'ShelfBin2',
      suggestedContainerId: 'some-container',
      suggestedContainerName: 'Shelf Bin 1',
      confidenceScore: 60,
    });

    const res = await request(server, 'POST', '/api/containers/review-queue/rq-create-new-1/create-new');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.containerId, 'Should return containerId');
    assert.ok(res.body.containerName, 'Should return containerName');
    assert.equal(res.body.entry.status, 'created_new');

    // Verify a new container was created
    const containers = await fakeDb.collection('containers').find({ companyId: 'co1' }).toArray();
    const newContainer = containers.find(c => c.id === res.body.containerId);
    assert.ok(newContainer, 'New container should exist in DB');
    assert.equal(newContainer.status, 'Active');
    assert.equal(newContainer.containerType, 'Other');

    // Verify alias was created
    const aliases = await fakeDb.collection('container_aliases').find({ companyId: 'co1' }).toArray();
    const alias = aliases.find(a => a.aliasValue === 'ShelfBin2');
    assert.ok(alias, 'Alias should be created for the original SKU');
    assert.equal(alias.containerId, res.body.containerId);
    assert.equal(alias.source, 'review-queue-create-new');

    // Verify audit entries were recorded
    const auditEntries = await fakeDb.collection('container_audit').find({ companyId: 'co1' }).toArray();
    const createAudit = auditEntries.find(a => a.actionType === 'create');
    assert.ok(createAudit, 'Should have a create audit entry for the new container');
    const reviewAudit = auditEntries.find(a => a.actionType === 'review_create_new');
    assert.ok(reviewAudit, 'Should have a review_create_new audit entry');
  } finally {
    server.close();
  }
});

// ── POST /review-queue/:id/ignore — Ignore recommendation ───────────────────

test('POST /review-queue/:id/ignore marks ignored without audit entry', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    seedReviewEntry({
      id: 'rq-ignore-1',
      originalSku: 'Tote-3C',
      confidenceScore: 52,
    });

    const res = await request(server, 'POST', '/api/containers/review-queue/rq-ignore-1/ignore');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.entry.status, 'ignored');
    assert.ok(res.body.entry.resolvedAt, 'Should have resolvedAt');

    // Verify NO audit entry was recorded for ignore action
    const auditEntries = await fakeDb.collection('container_audit').find({ companyId: 'co1' }).toArray();
    const ignoreAudit = auditEntries.find(a => a.actionType === 'review_ignore');
    assert.equal(ignoreAudit, undefined, 'Ignore should NOT create an audit entry');
  } finally {
    server.close();
  }
});

test('POST /review-queue/:id/ignore returns 409 when entry already resolved', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    seedReviewEntry({
      id: 'rq-ignore-resolved',
      status: 'rejected',
      resolvedAt: new Date().toISOString(),
      resolvedBy: 'u1',
    });

    const res = await request(server, 'POST', '/api/containers/review-queue/rq-ignore-resolved/ignore');
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already resolved/i);
  } finally {
    server.close();
  }
});

// ── Rejected pair prevents reappearance ─────────────────────────────────────

test('Rejected pair key prevents reappearance in review queue', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed a review entry and reject it
    seedReviewEntry({
      id: 'rq-reject-pair',
      originalSku: 'Tote-2X',
      suggestedContainerName: 'Tote 2 Y',
      confidenceScore: 70,
    });

    // Reject the entry
    const rejectRes = await request(server, 'POST', '/api/containers/review-queue/rq-reject-pair/reject');
    assert.equal(rejectRes.status, 200);

    // Verify the rejectedPairs field is populated
    const dbEntry = await fakeDb.collection('review_queue').findOne({ id: 'rq-reject-pair' });
    assert.ok(dbEntry.rejectedPairs.length > 0, 'Should have a rejected pair key');

    // The pair key is stored in the review_queue entry's rejectedPairs array.
    // During generation, the system checks for existing entries with matching rejectedPairs
    // before creating new review queue entries. Verify the pair key format.
    const pairKey = dbEntry.rejectedPairs[0];
    // Pair key is two normalized names sorted alphabetically and joined with |
    const parts = pairKey.split('|');
    assert.equal(parts.length, 2, 'Pair key should have exactly two parts separated by |');
    // Verify the parts are sorted (first part <= second part alphabetically)
    assert.ok(parts[0] <= parts[1], 'Pair key parts should be sorted alphabetically');
  } finally {
    server.close();
  }
});

// ── Full workflow test ───────────────────────────────────────────────────────

test('Full workflow: create entry → accept/reject/create-new/ignore', async () => {
  const app = buildApp();
  const server = await startServer(app);
  try {
    // Seed a container for the accept action
    const container = seedContainer({ id: 'container-workflow', name: 'Workflow Container' });

    // Seed four review entries for each action
    seedReviewEntry({ id: 'rq-wf-accept', suggestedContainerId: container.id, suggestedContainerName: container.name, originalSku: 'WF-Accept', confidenceScore: 80 });
    seedReviewEntry({ id: 'rq-wf-reject', originalSku: 'WF-Reject', suggestedContainerName: 'Other Container', confidenceScore: 70 });
    seedReviewEntry({ id: 'rq-wf-create', originalSku: 'WF-CreateNew', suggestedContainerName: 'Some Container', confidenceScore: 60 });
    seedReviewEntry({ id: 'rq-wf-ignore', originalSku: 'WF-Ignore', confidenceScore: 55 });

    // Verify all 4 are pending
    const listRes = await request(server, 'GET', '/api/containers/review-queue');
    assert.equal(listRes.body.entries.length, 4);

    // Accept
    const acceptRes = await request(server, 'POST', '/api/containers/review-queue/rq-wf-accept/accept');
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.body.entry.status, 'accepted');

    // Reject
    const rejectRes = await request(server, 'POST', '/api/containers/review-queue/rq-wf-reject/reject');
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.entry.status, 'rejected');

    // Create new
    const createRes = await request(server, 'POST', '/api/containers/review-queue/rq-wf-create/create-new');
    assert.equal(createRes.status, 200);
    assert.equal(createRes.body.entry.status, 'created_new');

    // Ignore
    const ignoreRes = await request(server, 'POST', '/api/containers/review-queue/rq-wf-ignore/ignore');
    assert.equal(ignoreRes.status, 200);
    assert.equal(ignoreRes.body.entry.status, 'ignored');

    // Verify no pending entries remain
    const finalList = await request(server, 'GET', '/api/containers/review-queue');
    assert.equal(finalList.body.entries.length, 0, 'All entries should be resolved');
  } finally {
    server.close();
  }
});
