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

async function createListing(listing) {
  const database = await getDb();
  const { _id, ...doc } = listing;
  await database.collection('listings').insertOne(doc);
}

async function updateListing(id, updates) {
  const database = await getDb();
  const { _id, ...safeUpdates } = updates;
  await database.collection('listings').updateOne({ id }, { $set: safeUpdates });
}

async function deleteListing(id) {
  const database = await getDb();
  await database.collection('listings').deleteOne({ id });
}

module.exports = { getListings, createListing, updateListing, deleteListing, getAllListingsMeta };
