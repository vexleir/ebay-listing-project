// INV-001 — integration tests for server/inventory.js. Patches the `./db`
// module to inject an in-memory fake collection so we cover the full
// create/get/list/update/delete path including the SKU-collision guard
// without booting Mongo.

const assert = require('node:assert/strict');
const test = require('node:test');

const Module = require('module');
const originalRequire = Module.prototype.require;

// ── in-memory fake `inventory_items` collection ─────────────────────────────

let store; // Map<docId, doc>
function makeFakeDb() {
  store = new Map();
  return {
    collection: () => ({
      insertOne: async (doc) => {
        const key = `${doc.companyId}::${doc.id}`;
        store.set(key, { ...doc });
        return { insertedId: key };
      },
      findOne: async (query) => {
        for (const doc of store.values()) {
          if (matchesQuery(doc, query)) return { ...doc };
        }
        return null;
      },
      find: (query) => ({
        sort: () => ({
          toArray: async () => Array.from(store.values()).filter((d) => matchesQuery(d, query)),
        }),
      }),
      updateOne: async (query, update) => {
        for (const [key, doc] of store) {
          if (matchesQuery(doc, query)) {
            store.set(key, { ...doc, ...(update.$set || {}) });
            return { modifiedCount: 1 };
          }
        }
        return { modifiedCount: 0 };
      },
      deleteOne: async (query) => {
        for (const [key, doc] of store) {
          if (matchesQuery(doc, query)) {
            store.delete(key);
            return { deletedCount: 1 };
          }
        }
        return { deletedCount: 0 };
      },
    }),
  };
}

function matchesQuery(doc, query) {
  for (const [k, v] of Object.entries(query)) {
    if (v && typeof v === 'object' && '$regex' in v) {
      if (!new RegExp(v.$regex).test(doc[k] || '')) return false;
    } else if (doc[k] !== v) {
      return false;
    }
  }
  return true;
}

const fakeDbModule = {
  getDb: async () => makeFakeDb._cached || (makeFakeDb._cached = makeFakeDb()),
};

// ── Module.prototype.require patch ──────────────────────────────────────────

Module.prototype.require = function patched(name) {
  if (name === './db' || name.endsWith('/db')) return fakeDbModule;
  return originalRequire.apply(this, arguments);
};

// Reset cached module so inventory.js picks up the fake db on require.
delete require.cache[require.resolve('../inventory')];
const inventory = require('../inventory');

Module.prototype.require = originalRequire;

// ── helpers ─────────────────────────────────────────────────────────────────

function resetStore() {
  // The fake db's `getDb` memoizes the collection but stores into the same
  // `store` map; we just clear the map.
  if (!store) makeFakeDb();
  store.clear();
}

test.beforeEach(() => resetStore());

// ── createInventoryItem ─────────────────────────────────────────────────────

test('createInventoryItem persists a valid item and returns the canonical doc', async () => {
  const out = await inventory.createInventoryItem('co1', { id: 'inv1', sku: 'ABC-001', quantityOnHand: 3, costBasis: '$5.00' });
  assert.equal(out.id, 'inv1');
  assert.equal(out.sku, 'abc-001');
  assert.equal(out.displayedSku, 'ABC-001');
  assert.equal(out.quantityOnHand, 3);
  assert.equal(out.costBasis, '5.00');
  assert.ok(out.createdAt);
  assert.ok(out.updatedAt);
});

test('createInventoryItem rejects missing companyId', async () => {
  await assert.rejects(
    () => inventory.createInventoryItem('', { id: 'i', sku: 'X' }),
    /companyId required/,
  );
});

test('createInventoryItem rejects missing SKU', async () => {
  await assert.rejects(
    () => inventory.createInventoryItem('co1', { id: 'i' }),
    /inventory item invalid: sku is required/,
  );
});

test('createInventoryItem rejects negative quantity', async () => {
  await assert.rejects(
    () => inventory.createInventoryItem('co1', { id: 'i', sku: 'X', quantityOnHand: -1 }),
    /quantityOnHand must be a non-negative integer/,
  );
});

test('createInventoryItem rejects duplicate SKU within the same company (409)', async () => {
  await inventory.createInventoryItem('co1', { id: 'first', sku: 'ABC' });
  let caught;
  try {
    await inventory.createInventoryItem('co1', { id: 'second', sku: 'abc' }); // case-insensitive collision
  } catch (e) { caught = e; }
  assert.ok(caught);
  assert.equal(caught.status, 409);
  assert.match(caught.message, /already exists/);
});

test('createInventoryItem allows the same SKU across different companies', async () => {
  await inventory.createInventoryItem('co1', { id: 'a', sku: 'ABC' });
  await inventory.createInventoryItem('co2', { id: 'b', sku: 'ABC' });
  const a = await inventory.getInventoryItem('co1', 'a');
  const b = await inventory.getInventoryItem('co2', 'b');
  assert.equal(a.id, 'a');
  assert.equal(b.id, 'b');
});

// ── getInventoryItem / getInventoryItemBySku ───────────────────────────────

test('getInventoryItem returns null when no match', async () => {
  assert.equal(await inventory.getInventoryItem('co1', 'missing'), null);
});

test('getInventoryItemBySku finds the item case-insensitively', async () => {
  await inventory.createInventoryItem('co1', { id: 'inv1', sku: 'WIDGET-2' });
  const found = await inventory.getInventoryItemBySku('co1', 'widget-2');
  assert.ok(found);
  assert.equal(found.id, 'inv1');
});

test('getInventoryItemBySku does not cross tenants', async () => {
  await inventory.createInventoryItem('co1', { id: 'a', sku: 'X' });
  const found = await inventory.getInventoryItemBySku('co2', 'X');
  assert.equal(found, null);
});

test('getInventoryItemBySku returns null for blank SKU', async () => {
  assert.equal(await inventory.getInventoryItemBySku('co1', ''), null);
  assert.equal(await inventory.getInventoryItemBySku('co1', undefined), null);
});

// ── listInventoryItems ─────────────────────────────────────────────────────

test('listInventoryItems returns only the requested company', async () => {
  await inventory.createInventoryItem('co1', { id: 'a', sku: 'X' });
  await inventory.createInventoryItem('co1', { id: 'b', sku: 'Y' });
  await inventory.createInventoryItem('co2', { id: 'c', sku: 'Z' });
  const list = await inventory.listInventoryItems('co1');
  const ids = list.map((d) => d.id).sort();
  assert.deepEqual(ids, ['a', 'b']);
});

test('listInventoryItems filters by SKU prefix', async () => {
  await inventory.createInventoryItem('co1', { id: 'a', sku: 'WIDGET-1' });
  await inventory.createInventoryItem('co1', { id: 'b', sku: 'WIDGET-2' });
  await inventory.createInventoryItem('co1', { id: 'c', sku: 'GADGET-1' });
  const list = await inventory.listInventoryItems('co1', { skuPrefix: 'WIDGET' });
  const ids = list.map((d) => d.id).sort();
  assert.deepEqual(ids, ['a', 'b']);
});

test('listInventoryItems returns empty for missing companyId', async () => {
  assert.deepEqual(await inventory.listInventoryItems(''), []);
});

// ── updateInventoryItem ────────────────────────────────────────────────────

test('updateInventoryItem applies partial updates and refreshes updatedAt', async () => {
  const before = await inventory.createInventoryItem('co1', { id: 'i', sku: 'X', quantityOnHand: 5 });
  // Tiny pause so the timestamp ticks at least 1ms in case the clock skips.
  await new Promise((r) => setTimeout(r, 5));
  const after = await inventory.updateInventoryItem('co1', 'i', { quantityListed: 2 });
  assert.equal(after.quantityListed, 2);
  assert.equal(after.quantityOnHand, 5); // untouched
  assert.notEqual(after.updatedAt, before.updatedAt);
});

test('updateInventoryItem normalizes the SKU change', async () => {
  await inventory.createInventoryItem('co1', { id: 'i', sku: 'X' });
  const after = await inventory.updateInventoryItem('co1', 'i', { sku: 'NEW-2 ' });
  assert.equal(after.sku, 'new-2');
  assert.equal(after.displayedSku, 'NEW-2');
});

test('updateInventoryItem rejects SKU change that collides with another item', async () => {
  await inventory.createInventoryItem('co1', { id: 'a', sku: 'KEEP' });
  await inventory.createInventoryItem('co1', { id: 'b', sku: 'CHANGE-ME' });
  let caught;
  try {
    await inventory.updateInventoryItem('co1', 'b', { sku: 'KEEP' });
  } catch (e) { caught = e; }
  assert.ok(caught);
  assert.equal(caught.status, 409);
});

test('updateInventoryItem allows renaming to the same canonical SKU (no-op rename)', async () => {
  await inventory.createInventoryItem('co1', { id: 'i', sku: 'KEEP' });
  const after = await inventory.updateInventoryItem('co1', 'i', { sku: 'keep' }); // same when normalized
  assert.equal(after.sku, 'keep');
  assert.equal(after.id, 'i');
});

test('updateInventoryItem with no changes returns the existing item', async () => {
  await inventory.createInventoryItem('co1', { id: 'i', sku: 'X' });
  const out = await inventory.updateInventoryItem('co1', 'i', {});
  assert.equal(out.id, 'i');
});

// ── deleteInventoryItem ───────────────────────────────────────────────────

test('deleteInventoryItem removes the matching item', async () => {
  await inventory.createInventoryItem('co1', { id: 'i', sku: 'X' });
  const out = await inventory.deleteInventoryItem('co1', 'i');
  assert.equal(out.deleted, 1);
  assert.equal(await inventory.getInventoryItem('co1', 'i'), null);
});

test('deleteInventoryItem returns 0 when nothing matches', async () => {
  const out = await inventory.deleteInventoryItem('co1', 'missing');
  assert.equal(out.deleted, 0);
});

test('deleteInventoryItem does not cross tenants', async () => {
  await inventory.createInventoryItem('co1', { id: 'i', sku: 'X' });
  const out = await inventory.deleteInventoryItem('co2', 'i');
  assert.equal(out.deleted, 0);
  assert.ok(await inventory.getInventoryItem('co1', 'i'));
});

// ── ensureInventoryItemForSku ──────────────────────────────────────────────

test('ensureInventoryItemForSku creates a new item when none exists', async () => {
  const { item, created } = await inventory.ensureInventoryItemForSku('co1', 'NEW-1');
  assert.equal(created, true);
  assert.equal(item.sku, 'new-1');
  assert.equal(item.displayedSku, 'NEW-1');
  assert.equal(item.quantityOnHand, 1);
  assert.equal(item.quantityListed, 0);
  assert.equal(item.quantitySold, 0);
});

test('ensureInventoryItemForSku returns the existing item without modifying it', async () => {
  await inventory.createInventoryItem('co1', { id: 'inv1', sku: 'EXISTING', quantityOnHand: 5 });
  const { item, created } = await inventory.ensureInventoryItemForSku('co1', 'EXISTING');
  assert.equal(created, false);
  assert.equal(item.id, 'inv1');
  assert.equal(item.quantityOnHand, 5); // not changed back to 1
});

test('ensureInventoryItemForSku is case-insensitive against existing items', async () => {
  await inventory.createInventoryItem('co1', { id: 'i', sku: 'WIDGET-1' });
  const { item, created } = await inventory.ensureInventoryItemForSku('co1', 'widget-1');
  assert.equal(created, false);
  assert.equal(item.id, 'i');
});

test('ensureInventoryItemForSku honors caller-supplied defaults on new items', async () => {
  const { item, created } = await inventory.ensureInventoryItemForSku('co1', 'BACKSTOCK', {
    quantityOnHand: 12,
    costBasis: '$3.50',
    sourceTag: 'estate-sale',
  });
  assert.equal(created, true);
  assert.equal(item.quantityOnHand, 12);
  assert.equal(item.costBasis, '3.50');
  assert.equal(item.sourceTag, 'estate-sale');
});

test('ensureInventoryItemForSku does not cross tenants', async () => {
  await inventory.createInventoryItem('co1', { id: 'a', sku: 'X' });
  // co2 has no record for X yet; ensure should create a fresh one.
  const { item, created } = await inventory.ensureInventoryItemForSku('co2', 'X');
  assert.equal(created, true);
  assert.equal(item.companyId, 'co2');
});

test('ensureInventoryItemForSku throws on missing companyId', async () => {
  await assert.rejects(() => inventory.ensureInventoryItemForSku('', 'X'), /companyId required/);
});
