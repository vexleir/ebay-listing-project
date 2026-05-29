// INTEL-001 — Mongo CRUD for `listing_experiments`. One document per push
// or relist, capturing the listing's shape at publish time so we can later
// correlate it with the outcome (view count, sold price, time-to-sale) and
// answer questions like "do longer titles sell faster?" or "did the
// optimizer's most recent run actually move the needle?".
//
// Schema rules live in services/intelligence/snapshot.js so the doc shape
// is testable without booting Mongo. The CRUD here is intentionally thin:
// create, get-by-id, get-by-listingId, list-for-company. Outcome data is
// later merged in via INTEL-002.

const { getDb } = require('./db');

const COLLECTION = 'listing_experiments';
const OUTCOMES_COLLECTION = 'listing_outcomes';

async function createExperiment(companyId, doc) {
  if (!companyId) throw Object.assign(new Error('companyId required'), { status: 400 });
  if (!doc || !doc.id) throw Object.assign(new Error('experiment doc with id required'), { status: 400 });
  // Tenant safety: the doc.companyId must match the caller's tenant. The
  // snapshot builder stamps it, but a defensive check guards against
  // forged inputs reaching the route handler.
  if (doc.companyId && doc.companyId !== companyId) {
    throw Object.assign(new Error('experiment companyId mismatch'), { status: 400 });
  }
  const stamped = { ...doc, companyId };
  const db = await getDb();
  await db.collection(COLLECTION).insertOne(stamped);
  const { _id, ...rest } = stamped;
  return rest;
}

async function getExperiment(companyId, id) {
  if (!companyId || !id) return null;
  const db = await getDb();
  const found = await db.collection(COLLECTION).findOne({ companyId, id });
  if (!found) return null;
  const { _id, ...rest } = found;
  return rest;
}

// Returns the most recent experiment for the listing — sellers can push
// the same listing multiple times (e.g. relist after end), and INTEL-002
// outcome attribution should target the latest publish.
async function getLatestExperimentForListing(companyId, listingId) {
  if (!companyId || !listingId) return null;
  const db = await getDb();
  const docs = await db.collection(COLLECTION)
    .find({ companyId, listingId })
    .sort({ publishedAt: -1 })
    .toArray();
  if (!docs.length) return null;
  const { _id, ...rest } = docs[0];
  return rest;
}

async function getExperimentByEbayItemId(companyId, ebayItemId) {
  if (!companyId || !ebayItemId) return null;
  const db = await getDb();
  const found = await db.collection(COLLECTION).findOne({ companyId, ebayItemId: String(ebayItemId) });
  if (!found) return null;
  const { _id, ...rest } = found;
  return rest;
}

async function listExperimentsForCompany(companyId, { limit = 100, since } = {}) {
  if (!companyId) return [];
  const db = await getDb();
  const query = { companyId };
  if (since) query.publishedAt = { $gte: since };
  const docs = await db.collection(COLLECTION)
    .find(query)
    .sort({ publishedAt: -1 })
    .limit(Math.max(1, Math.min(500, limit)))
    .toArray();
  return docs.map(({ _id, ...rest }) => rest);
}

// INTEL-002 — outcome upsert. Idempotent at the (experimentId, milestone)
// composite id: re-capturing the same milestone overwrites the previous
// row instead of duplicating it. That way a daily polling task can call
// "capture 7d for everything published 6–8 days ago" without dedup logic.
async function upsertOutcome(companyId, doc) {
  if (!companyId) throw Object.assign(new Error('companyId required'), { status: 400 });
  if (!doc || !doc.id) throw Object.assign(new Error('outcome doc with id required'), { status: 400 });
  if (doc.companyId && doc.companyId !== companyId) {
    throw Object.assign(new Error('outcome companyId mismatch'), { status: 400 });
  }
  const stamped = { ...doc, companyId };
  const db = await getDb();
  await db.collection(OUTCOMES_COLLECTION).updateOne(
    { companyId, id: stamped.id },
    { $set: stamped },
    { upsert: true },
  );
  const { _id, ...rest } = stamped;
  return rest;
}

async function getOutcome(companyId, id) {
  if (!companyId || !id) return null;
  const db = await getDb();
  const doc = await db.collection(OUTCOMES_COLLECTION).findOne({ companyId, id });
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return rest;
}

async function listOutcomesForExperiment(companyId, experimentId) {
  if (!companyId || !experimentId) return [];
  const db = await getDb();
  const docs = await db.collection(OUTCOMES_COLLECTION)
    .find({ companyId, experimentId })
    .sort({ capturedAt: 1 })
    .toArray();
  return docs.map(({ _id, ...rest }) => rest);
}

async function listOutcomesForCompany(companyId, { milestone, limit = 100, since } = {}) {
  if (!companyId) return [];
  const db = await getDb();
  const query = { companyId };
  if (milestone) query.captureMilestone = milestone;
  if (since) query.capturedAt = { $gte: since };
  const docs = await db.collection(OUTCOMES_COLLECTION)
    .find(query)
    .sort({ capturedAt: -1 })
    .limit(Math.max(1, Math.min(500, limit)))
    .toArray();
  return docs.map(({ _id, ...rest }) => rest);
}

module.exports = {
  COLLECTION,
  OUTCOMES_COLLECTION,
  createExperiment,
  getExperiment,
  getLatestExperimentForListing,
  getExperimentByEbayItemId,
  listExperimentsForCompany,
  upsertOutcome,
  getOutcome,
  listOutcomesForExperiment,
  listOutcomesForCompany,
};
