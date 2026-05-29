// INV-001 — Mongo CRUD for inventory items. All operations are tenant-
// scoped by companyId. The pure validation / normalization rules live
// in services/inventory/validate.js so the schema contract is testable
// without booting Mongo.
//
// One document per physical SKU per company. Sellers should call
// `getInventoryItemBySku` before staging or pushing to detect collisions;
// the duplicate-SKU detection in INV-002 can later read from this
// collection instead of scanning the listings array.

const { getDb } = require('./db');
const {
  normalizeInventorySku,
  validateInventoryItem,
  buildInventoryItemDoc,
  buildInventoryItemUpdates,
} = require('./services/inventory/validate');

const COLLECTION = 'inventory_items';

// Throws on validation failure with a 400-shaped message. Caller is
// expected to surface the error string to the client.
async function createInventoryItem(companyId, input) {
  if (!companyId) throw Object.assign(new Error('companyId required'), { status: 400 });
  const validation = validateInventoryItem(input);
  if (!validation.valid) {
    throw Object.assign(new Error(`inventory item invalid: ${validation.errors.join(', ')}`), { status: 400 });
  }
  const doc = buildInventoryItemDoc(companyId, input);

  // Enforce single-active-item-per-SKU at the application level. The
  // unique index would be the durable answer but we don't own a schema
  // migration here yet — this guard at least catches the obvious case.
  const existing = await getInventoryItemBySku(companyId, doc.sku);
  if (existing) {
    throw Object.assign(
      new Error(`SKU "${doc.displayedSku || doc.sku}" already exists in inventory`),
      { status: 409 },
    );
  }

  const db = await getDb();
  await db.collection(COLLECTION).insertOne(doc);
  return doc;
}

async function getInventoryItem(companyId, id) {
  if (!companyId || !id) return null;
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ companyId, id });
  if (!doc) return null;
  // Drop the Mongo-internal _id so the returned shape is clean.
  const { _id, ...rest } = doc;
  return rest;
}

async function getInventoryItemBySku(companyId, sku) {
  const normalized = normalizeInventorySku(sku);
  if (!companyId || !normalized) return null;
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ companyId, sku: normalized });
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

async function listInventoryItems(companyId, { skuPrefix, sourceTag } = {}) {
  if (!companyId) return [];
  const db = await getDb();
  const query = { companyId };
  if (skuPrefix) {
    const normalized = normalizeInventorySku(skuPrefix);
    if (normalized) query.sku = { $regex: `^${escapeRegex(normalized)}` };
  }
  if (sourceTag) query.sourceTag = sourceTag;
  const docs = await db.collection(COLLECTION)
    .find(query)
    .sort({ updatedAt: -1 })
    .toArray();
  return docs.map(({ _id, ...rest }) => rest);
}

async function updateInventoryItem(companyId, id, updates) {
  if (!companyId || !id) throw Object.assign(new Error('companyId and id required'), { status: 400 });
  const safeUpdates = buildInventoryItemUpdates(updates);
  if (!safeUpdates || Object.keys(safeUpdates).length === 1 /* only updatedAt */) {
    // No real changes to persist. Return the existing doc unchanged.
    return getInventoryItem(companyId, id);
  }

  // If SKU is changing, guard against collisions with another active item.
  if (safeUpdates.sku) {
    const collide = await getInventoryItemBySku(companyId, safeUpdates.sku);
    if (collide && collide.id !== id) {
      throw Object.assign(
        new Error(`SKU "${safeUpdates.displayedSku || safeUpdates.sku}" already exists in inventory`),
        { status: 409 },
      );
    }
  }

  const db = await getDb();
  await db.collection(COLLECTION).updateOne({ companyId, id }, { $set: safeUpdates });
  return getInventoryItem(companyId, id);
}

async function deleteInventoryItem(companyId, id) {
  if (!companyId || !id) return { deleted: 0 };
  const db = await getDb();
  const result = await db.collection(COLLECTION).deleteOne({ companyId, id });
  return { deleted: result.deletedCount || 0 };
}

// INV-002 push counter sync — atomic increment / decrement on the three
// quantity columns. Used by the push and sold-sync hooks so the inventory
// truth reflects what's actually live on eBay.
//
// `deltas` is `{ quantityOnHand?, quantityListed?, quantitySold? }`. Any
// omitted field is left untouched. Returns the updated doc, or null when
// no matching SKU is found (the caller is then responsible for deciding
// whether to bootstrap an inventory row first).
async function incrementInventoryCounters(companyId, sku, deltas = {}) {
  if (!companyId) throw Object.assign(new Error('companyId required'), { status: 400 });
  const normalized = normalizeInventorySku(sku);
  if (!normalized) throw Object.assign(new Error('sku required'), { status: 400 });

  const incFields = {};
  for (const field of ['quantityOnHand', 'quantityListed', 'quantitySold']) {
    if (typeof deltas[field] === 'number' && Number.isFinite(deltas[field])) {
      incFields[field] = Math.trunc(deltas[field]);
    }
  }
  if (Object.keys(incFields).length === 0) {
    return getInventoryItemBySku(companyId, normalized);
  }

  const db = await getDb();
  const updateResult = await db.collection(COLLECTION).updateOne(
    { companyId, sku: normalized },
    { $inc: incFields, $set: { updatedAt: new Date().toISOString() } },
  );
  if (!updateResult.matchedCount) return null;

  // Re-read so the caller sees the post-increment counters; $inc is atomic
  // but doesn't return the modified doc on older drivers.
  return getInventoryItemBySku(companyId, normalized);
}

// INV-002 auto-bootstrap — when a listing is staged with a SKU, the route
// handler calls this to ensure the inventory truth catches up automatically.
// Idempotent: returns the existing item when one already has this SKU; only
// inserts when no record exists yet.
//
// Defaults assume a single physical unit per stage (the lite first-slice
// model). Callers can override `defaults` to seed cost basis / source tag /
// quantity-on-hand from the listing payload when available.
async function ensureInventoryItemForSku(companyId, sku, defaults = {}) {
  if (!companyId) throw Object.assign(new Error('companyId required'), { status: 400 });
  const existing = await getInventoryItemBySku(companyId, sku);
  if (existing) return { item: existing, created: false };
  const id = defaults.id || generateId();
  const created = await createInventoryItem(companyId, {
    id,
    sku,
    quantityOnHand: defaults.quantityOnHand ?? 1,
    quantityListed: defaults.quantityListed ?? 0,
    quantitySold: defaults.quantitySold ?? 0,
    costBasis: defaults.costBasis,
    sourceTag: defaults.sourceTag,
    sourceEvent: defaults.sourceEvent,
  });
  return { item: created, created: true };
}

// Tiny UUID-ish id generator so the module doesn't pull in a crypto import
// at module load (the route handler already uses crypto.randomUUID()).
function generateId() {
  return `inv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

module.exports = {
  COLLECTION,
  createInventoryItem,
  getInventoryItem,
  getInventoryItemBySku,
  listInventoryItems,
  updateInventoryItem,
  deleteInventoryItem,
  ensureInventoryItemForSku,
  incrementInventoryCounters,
};
