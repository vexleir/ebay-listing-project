const { getDb } = require('./db');

function settingsDocId(companyId) { return `${companyId}_settings`; }
function tokenUsageDocId(companyId) { return `${companyId}_token_usage`; }

function stripBase64Images(images) {
  if (!Array.isArray(images)) return [];
  return images.filter(img => typeof img === 'string' && img.startsWith('http'));
}

async function getListings(companyId, status) {
  const db = await getDb();
  return db.collection('listings').find({ companyId, status }).sort({ createdAt: -1 }).toArray();
}

async function getAllListingsMeta(companyId) {
  const db = await getDb();
  return db.collection('listings').find(
    { companyId },
    { projection: { _id: 0, id: 1, status: 1, title: 1, createdAt: 1 } }
  ).toArray();
}

async function createListing(companyId, listing) {
  const db = await getDb();
  const { _id, ...doc } = listing;
  doc.companyId = companyId;
  doc.images = stripBase64Images(listing.images);
  await db.collection('listings').insertOne(doc);
}

async function updateListing(companyId, id, updates) {
  const db = await getDb();
  const { _id, ...safeUpdates } = updates;
  if (safeUpdates.images !== undefined) {
    safeUpdates.images = stripBase64Images(safeUpdates.images);
  }
  await db.collection('listings').updateOne({ companyId, id }, { $set: safeUpdates });
}

async function deleteListing(companyId, id) {
  const db = await getDb();
  await db.collection('listings').deleteOne({ companyId, id });
}

async function getSettings(companyId) {
  const db = await getDb();
  const doc = await db.collection('config').findOne({ _id: settingsDocId(companyId) });
  const { _id, ...rest } = doc || {};
  return rest;
}

async function saveSettings(companyId, updates) {
  const db = await getDb();
  const { _id, ...safeUpdates } = updates;
  await db.collection('config').updateOne(
    { _id: settingsDocId(companyId) },
    { $set: safeUpdates },
    { upsert: true }
  );
}

async function incrementTokenUsage(companyId, promptTokens, completionTokens) {
  const db = await getDb();
  const p = promptTokens || 0;
  const c = completionTokens || 0;
  await db.collection('config').updateOne(
    { _id: tokenUsageDocId(companyId) },
    { $inc: { promptTokens: p, completionTokens: c, totalTokens: p + c, callCount: 1 } },
    { upsert: true }
  );
}

async function getTokenUsage(companyId) {
  const db = await getDb();
  const doc = await db.collection('config').findOne({ _id: tokenUsageDocId(companyId) });
  if (!doc) return { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
  const { _id, ...rest } = doc;
  return rest;
}

async function getActiveListings(companyId) {
  const db = await getDb();
  return db.collection('listings').find(
    { companyId, status: 'listed', archived: { $ne: true } },
    { projection: { _id: 0, id: 1, ebayDraftId: 1, title: 1, priceRecommendation: 1, images: 1, createdAt: 1 } }
  ).toArray();
}

// ─── Consignors ─────────────────────────────────────────────────────────────

async function getConsignors(companyId) {
  const db = await getDb();
  return db.collection('consignors').find({ companyId }).sort({ name: 1 }).toArray();
}

async function createConsignor(companyId, consignor) {
  const db = await getDb();
  const { _id, ...doc } = consignor;
  doc.companyId = companyId;
  await db.collection('consignors').insertOne(doc);
}

async function updateConsignor(companyId, id, updates) {
  const db = await getDb();
  const { _id, ...safeUpdates } = updates;
  await db.collection('consignors').updateOne({ companyId, id }, { $set: safeUpdates });
}

async function deleteConsignor(companyId, id) {
  const db = await getDb();
  await db.collection('consignors').deleteOne({ companyId, id });
}

// ─── Containers (inventory) ─────────────────────────────────────────────────

async function getContainers(companyId) {
  const db = await getDb();
  return db.collection('containers').find({ companyId }).sort({ name: 1 }).toArray();
}

async function getContainerById(companyId, id) {
  const db = await getDb();
  return db.collection('containers').findOne({ companyId, id });
}

async function createContainer(companyId, container) {
  const db = await getDb();
  const { _id, ...doc } = container;
  doc.companyId = companyId;
  await db.collection('containers').insertOne(doc);
}

async function updateContainer(companyId, id, updates) {
  const db = await getDb();
  const { _id, ...safeUpdates } = updates;
  await db.collection('containers').updateOne({ companyId, id }, { $set: safeUpdates });
}

async function deleteContainer(companyId, id) {
  const db = await getDb();
  await db.collection('containers').deleteOne({ companyId, id });
  // Cascade-unlink: clear containerId from any listings that pointed at it
  await db.collection('listings').updateMany(
    { companyId, containerId: id },
    { $unset: { containerId: '' } }
  );
}

async function getListingsInContainer(companyId, containerId) {
  const db = await getDb();
  return db.collection('listings').find(
    { companyId, containerId },
    { projection: { _id: 0, id: 1, title: 1, sku: 1, priceRecommendation: 1, images: 1, status: 1, ebayDraftId: 1, shopifyProductId: 1, containerId: 1 } }
  ).sort({ title: 1 }).toArray();
}

async function addLooseItem(companyId, containerId, item) {
  const db = await getDb();
  await db.collection('containers').updateOne(
    { companyId, id: containerId },
    { $push: { looseItems: item } }
  );
}

async function removeLooseItem(companyId, containerId, itemId) {
  const db = await getDb();
  await db.collection('containers').updateOne(
    { companyId, id: containerId },
    { $pull: { looseItems: { id: itemId } } }
  );
}

module.exports = {
  getListings, createListing, updateListing, deleteListing,
  getAllListingsMeta, getActiveListings,
  getSettings, saveSettings,
  incrementTokenUsage, getTokenUsage,
  getConsignors, createConsignor, updateConsignor, deleteConsignor,
  getContainers, getContainerById, createContainer, updateContainer, deleteContainer,
  getListingsInContainer, addLooseItem, removeLooseItem,
};
