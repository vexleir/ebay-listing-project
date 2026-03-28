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

module.exports = {
  getListings, createListing, updateListing, deleteListing,
  getAllListingsMeta, getActiveListings,
  getSettings, saveSettings,
  incrementTokenUsage, getTokenUsage,
};
