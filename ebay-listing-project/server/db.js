const { MongoClient } = require('mongodb');

let client;
let db;

async function getDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  if (!client) {
    // Fail fast (default server selection is 30s) and don't leave a
    // half-initialized client behind if the first connect fails — otherwise
    // every later call returns an undefined db instead of retrying.
    const candidate = new MongoClient(uri, { serverSelectionTimeoutMS: 7000 });
    try {
      await candidate.connect();
    } catch (e) {
      await candidate.close().catch(() => {});
      throw e;
    }
    client = candidate;
    db = client.db('ebay_lister');
  }
  return db;
}

module.exports = { getDb };
