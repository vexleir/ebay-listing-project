// Unit tests for the container audit service.
// Uses an in-memory mock of the MongoDB collection to test logic without a real database.

const assert = require('node:assert/strict');
const test = require('node:test');

// ── In-memory mock for MongoDB ──────────────────────────────────────────────

let auditStore = [];

const fakeCollection = {
  insertOne: async (doc) => {
    auditStore.push(doc);
    return { insertedId: doc.id };
  },
  find: (query) => {
    let results = auditStore.filter((doc) => {
      if (query.companyId && doc.companyId !== query.companyId) return false;
      if (query.actionType && doc.actionType !== query.actionType) return false;
      if (query.relatedEntities) {
        if (!doc.relatedEntities || !doc.relatedEntities.includes(query.relatedEntities)) {
          return false;
        }
      }
      if (query.entityId && query.entityId.$in) {
        if (!query.entityId.$in.includes(doc.entityId)) return false;
      } else if (query.entityId && typeof query.entityId === 'string') {
        if (doc.entityId !== query.entityId) return false;
      }
      return true;
    });

    return {
      sort: (sortSpec) => {
        if (sortSpec.timestamp === -1) {
          results = [...results].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        }
        return {
          skip: (n) => {
            const skipped = results.slice(n);
            return {
              limit: (m) => ({
                toArray: async () => skipped.slice(0, m),
              }),
            };
          },
        };
      },
      toArray: async () => results,
    };
  },
};

const fakeDb = {
  collection: (name) => {
    if (name === 'container_audit') return fakeCollection;
    throw new Error(`Unexpected collection: ${name}`);
  },
};

// ── Mock the db module via require cache manipulation ────────────────────────

const path = require('path');
const Module = require('module');

// Resolve the path that audit.js will use when requiring '../../db'
const auditFilePath = path.resolve(__dirname, '../services/containers/audit.js');
const dbModulePath = path.resolve(__dirname, '../db.js');

// Pre-populate require cache with our fake db module
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: { getDb: async () => fakeDb },
};

// Now require audit.js - it will get our mocked db
const { recordAuditEntry, getAuditHistory } = require('../services/containers/audit');

// ── Test setup ──────────────────────────────────────────────────────────────

test.beforeEach(() => {
  auditStore = [];
});

// ── recordAuditEntry ────────────────────────────────────────────────────────

test('recordAuditEntry inserts a record with all required fields', async () => {
  await recordAuditEntry('company1', {
    actionType: 'create',
    entityId: 'container-1',
    entityType: 'container',
    previousValue: null,
    newValue: { name: 'Tote 1' },
    relatedEntities: [],
    userId: 'user-1',
  });

  assert.equal(auditStore.length, 1);
  const record = auditStore[0];
  assert.equal(record.companyId, 'company1');
  assert.equal(record.actionType, 'create');
  assert.equal(record.entityId, 'container-1');
  assert.equal(record.entityType, 'container');
  assert.equal(record.userId, 'user-1');
  assert.deepEqual(record.newValue, { name: 'Tote 1' });
  assert.equal(record.previousValue, null);
  assert.deepEqual(record.relatedEntities, []);
  // Has a UUID id
  assert.match(record.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  // Has a timestamp in ISO format
  assert.match(record.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  // Milliseconds should be 000 (second precision)
  assert.ok(record.timestamp.endsWith('000Z'), 'Timestamp should have zero milliseconds');
});

test('recordAuditEntry defaults previousValue and newValue to null', async () => {
  await recordAuditEntry('company1', {
    actionType: 'archive',
    entityId: 'container-2',
    entityType: 'container',
    userId: 'user-2',
  });

  const record = auditStore[0];
  assert.equal(record.previousValue, null);
  assert.equal(record.newValue, null);
  assert.deepEqual(record.relatedEntities, []);
});

test('recordAuditEntry stores relatedEntities for merge operations', async () => {
  await recordAuditEntry('company1', {
    actionType: 'merge',
    entityId: 'source-container',
    entityType: 'container',
    previousValue: { name: 'Source Tote' },
    newValue: { status: 'Archived' },
    relatedEntities: ['source-container', 'target-container'],
    userId: 'user-1',
  });

  const record = auditStore[0];
  assert.deepEqual(record.relatedEntities, ['source-container', 'target-container']);
});

test('recordAuditEntry generates unique IDs for each entry', async () => {
  await recordAuditEntry('c1', { actionType: 'create', entityId: 'ct-1', entityType: 'container', userId: 'u1' });
  await recordAuditEntry('c1', { actionType: 'rename', entityId: 'ct-1', entityType: 'container', userId: 'u1' });

  assert.notEqual(auditStore[0].id, auditStore[1].id);
});

// ── getAuditHistory ─────────────────────────────────────────────────────────

test('getAuditHistory returns entries in reverse chronological order', async () => {
  auditStore.push(
    { id: '1', companyId: 'c1', actionType: 'create', entityId: 'ct-1', entityType: 'container', previousValue: null, newValue: { name: 'Tote 1' }, relatedEntities: [], userId: 'u1', timestamp: '2024-01-01T10:00:00.000Z' },
    { id: '2', companyId: 'c1', actionType: 'rename', entityId: 'ct-1', entityType: 'container', previousValue: { name: 'Tote 1' }, newValue: { name: 'Tote A' }, relatedEntities: [], userId: 'u1', timestamp: '2024-01-02T10:00:00.000Z' },
    { id: '3', companyId: 'c1', actionType: 'location_change', entityId: 'ct-1', entityType: 'container', previousValue: null, newValue: { building: 'Warehouse' }, relatedEntities: [], userId: 'u1', timestamp: '2024-01-03T10:00:00.000Z' }
  );

  const entries = await getAuditHistory('c1', 'ct-1', {});
  assert.equal(entries.length, 3);
  assert.equal(entries[0].id, '3'); // Most recent first
  assert.equal(entries[1].id, '2');
  assert.equal(entries[2].id, '1');
});

test('getAuditHistory supports pagination with limit and offset', async () => {
  auditStore.push(
    { id: '1', companyId: 'c1', entityId: 'ct-1', entityType: 'container', actionType: 'create', relatedEntities: [], userId: 'u1', timestamp: '2024-01-01T00:00:00.000Z' },
    { id: '2', companyId: 'c1', entityId: 'ct-1', entityType: 'container', actionType: 'rename', relatedEntities: [], userId: 'u1', timestamp: '2024-01-02T00:00:00.000Z' },
    { id: '3', companyId: 'c1', entityId: 'ct-1', entityType: 'container', actionType: 'archive', relatedEntities: [], userId: 'u1', timestamp: '2024-01-03T00:00:00.000Z' },
    { id: '4', companyId: 'c1', entityId: 'ct-1', entityType: 'container', actionType: 'restore', relatedEntities: [], userId: 'u1', timestamp: '2024-01-04T00:00:00.000Z' }
  );

  const page1 = await getAuditHistory('c1', 'ct-1', { limit: 2, offset: 0 });
  assert.equal(page1.length, 2);
  assert.equal(page1[0].id, '4');
  assert.equal(page1[1].id, '3');

  const page2 = await getAuditHistory('c1', 'ct-1', { limit: 2, offset: 2 });
  assert.equal(page2.length, 2);
  assert.equal(page2[0].id, '2');
  assert.equal(page2[1].id, '1');
});

test('getAuditHistory includes inherited merge history from source containers', async () => {
  // Source container had some history before being merged
  auditStore.push(
    { id: '1', companyId: 'c1', entityId: 'source-ct', entityType: 'container', actionType: 'create', relatedEntities: [], userId: 'u1', timestamp: '2024-01-01T00:00:00.000Z' },
    { id: '2', companyId: 'c1', entityId: 'source-ct', entityType: 'container', actionType: 'rename', relatedEntities: [], userId: 'u1', timestamp: '2024-01-02T00:00:00.000Z' }
  );

  // Target container has its own history
  auditStore.push(
    { id: '3', companyId: 'c1', entityId: 'target-ct', entityType: 'container', actionType: 'create', relatedEntities: [], userId: 'u1', timestamp: '2024-01-03T00:00:00.000Z' }
  );

  // Merge entry: source merged into target (entityId is source, relatedEntities has target)
  auditStore.push(
    { id: '4', companyId: 'c1', entityId: 'source-ct', entityType: 'container', actionType: 'merge', relatedEntities: ['source-ct', 'target-ct'], userId: 'u1', timestamp: '2024-01-04T00:00:00.000Z' }
  );

  // Query target container - should include source container's history
  const entries = await getAuditHistory('c1', 'target-ct', {});
  assert.equal(entries.length, 4);
  // Should be in reverse chronological order
  assert.equal(entries[0].id, '4'); // merge
  assert.equal(entries[1].id, '3'); // target create
  assert.equal(entries[2].id, '2'); // source rename (inherited)
  assert.equal(entries[3].id, '1'); // source create (inherited)
});

test('getAuditHistory isolates by companyId', async () => {
  auditStore.push(
    { id: '1', companyId: 'c1', entityId: 'ct-1', entityType: 'container', actionType: 'create', relatedEntities: [], userId: 'u1', timestamp: '2024-01-01T00:00:00.000Z' },
    { id: '2', companyId: 'c2', entityId: 'ct-1', entityType: 'container', actionType: 'create', relatedEntities: [], userId: 'u2', timestamp: '2024-01-02T00:00:00.000Z' }
  );

  const entries = await getAuditHistory('c1', 'ct-1', {});
  assert.equal(entries.length, 1);
  assert.equal(entries[0].companyId, 'c1');
});

test('getAuditHistory defaults to limit 50 and offset 0', async () => {
  for (let i = 0; i < 60; i++) {
    const day = String(i + 1).padStart(2, '0');
    const month = String(Math.floor(i / 28) + 1).padStart(2, '0');
    const dayOfMonth = String((i % 28) + 1).padStart(2, '0');
    auditStore.push({
      id: `entry-${i}`,
      companyId: 'c1',
      entityId: 'ct-1',
      entityType: 'container',
      actionType: 'create',
      relatedEntities: [],
      userId: 'u1',
      timestamp: `2024-${month}-${dayOfMonth}T${String(i).padStart(2, '0')}:00:00.000Z`,
    });
  }

  const entries = await getAuditHistory('c1', 'ct-1');
  assert.equal(entries.length, 50);
});

test('getAuditHistory handles multiple merged source containers', async () => {
  // Two source containers merged into one target
  auditStore.push(
    { id: '1', companyId: 'c1', entityId: 'src-1', entityType: 'container', actionType: 'create', relatedEntities: [], userId: 'u1', timestamp: '2024-01-01T00:00:00.000Z' },
    { id: '2', companyId: 'c1', entityId: 'src-2', entityType: 'container', actionType: 'create', relatedEntities: [], userId: 'u1', timestamp: '2024-01-02T00:00:00.000Z' },
    { id: '3', companyId: 'c1', entityId: 'target', entityType: 'container', actionType: 'create', relatedEntities: [], userId: 'u1', timestamp: '2024-01-03T00:00:00.000Z' },
    { id: '4', companyId: 'c1', entityId: 'src-1', entityType: 'container', actionType: 'merge', relatedEntities: ['src-1', 'target'], userId: 'u1', timestamp: '2024-01-04T00:00:00.000Z' },
    { id: '5', companyId: 'c1', entityId: 'src-2', entityType: 'container', actionType: 'merge', relatedEntities: ['src-2', 'target'], userId: 'u1', timestamp: '2024-01-05T00:00:00.000Z' }
  );

  const entries = await getAuditHistory('c1', 'target', {});
  assert.equal(entries.length, 5); // All entries from both sources + target
});
