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

module.exports = { getDb };
