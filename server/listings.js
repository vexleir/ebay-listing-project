const { MongoClient } = require('mongodb');

let client;
let db;

async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  if (!client) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db('ebay_lister');
  }
  return db;
}

async function getListings(status) {
  const database = await getDb();
  return database.collection('listings').find({ status }).sort({ createdAt: -1 }).toArray();
}

async function getAllListingsMeta() {
  const database = await getDb();
  const all = await database.collection('listings').find({}, { projection: { _id: 0, id: 1, status: 1, title: 1, createdAt: 1 } }).toArray();
  return all;
}

function stripBase64Images(images) {
  if (!Array.isArray(images)) return [];
  // Keep URL images (Cloudinary/https), strip base64 data URLs (too large for MongoDB)
  return images.filter(img => typeof img === 'string' && img.startsWith('http'));
}

async function createListing(listing) {
  const database = await getDb();
  const { _id, ...doc } = listing;
  doc.images = stripBase64Images(listing.images);
  await database.collection('listings').insertOne(doc);
}

async function updateListing(id, updates) {
  const database = await getDb();
  const { _id, ...safeUpdates } = updates;
  if (safeUpdates.images !== undefined) {
    safeUpdates.images = stripBase64Images(safeUpdates.images);
  }
  await database.collection('listings').updateOne({ id }, { $set: safeUpdates });
}

async function deleteListing(id) {
  const database = await getDb();
  await database.collection('listings').deleteOne({ id });
}

async function getSettings() {
  const database = await getDb();
  const doc = await database.collection('config').findOne({ _id: 'user_settings' });
  const { _id, ...rest } = doc || {};
  return rest;
}

async function saveSettings(updates) {
  const database = await getDb();
  const { _id, ...safeUpdates } = updates;
  await database.collection('config').updateOne(
    { _id: 'user_settings' },
    { $set: safeUpdates },
    { upsert: true }
  );
}

async function incrementTokenUsage(promptTokens, completionTokens) {
  const database = await getDb();
  const p = promptTokens || 0;
  const c = completionTokens || 0;
  await database.collection('config').updateOne(
    { _id: 'token_usage' },
    { $inc: { promptTokens: p, completionTokens: c, totalTokens: p + c, callCount: 1 } },
    { upsert: true }
  );
}

async function getTokenUsage() {
  const database = await getDb();
  const doc = await database.collection('config').findOne({ _id: 'token_usage' });
  if (!doc) return { promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 };
  const { _id, ...rest } = doc;
  return rest;
}

async function getActiveListings() {
  const database = await getDb();
  const all = await database.collection('listings').find(
    { status: 'listed', archived: { $ne: true } },
    { projection: { _id: 0, id: 1, ebayDraftId: 1, title: 1, priceRecommendation: 1, images: 1, createdAt: 1 } }
  ).toArray();
  return all;
}

module.exports = { getListings, createListing, updateListing, deleteListing, getAllListingsMeta, getActiveListings, getSettings, saveSettings, incrementTokenUsage, getTokenUsage };
