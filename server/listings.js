const { getDb } = require('./db');

function settingsDocId(companyId) { return `${companyId}_settings`; }
function tokenUsageDocId(companyId) { return `${companyId}_token_usage`; }
function dailyTokenUsageDocId(companyId, day) { return `${companyId}_token_usage_${day}`; }

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function tokenUsageDayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function nextUtcMidnightIso(day) {
  const start = new Date(`${day}T00:00:00.000Z`).getTime();
  return new Date(start + 24 * 60 * 60 * 1000).toISOString();
}

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
  const total = p + c;
  const day = tokenUsageDayKey();
  await Promise.all([
    db.collection('config').updateOne(
      { _id: tokenUsageDocId(companyId) },
      { $inc: { promptTokens: p, completionTokens: c, totalTokens: total, callCount: 1 } },
      { upsert: true }
    ),
    db.collection('config').updateOne(
      { _id: dailyTokenUsageDocId(companyId, day) },
      {
        $setOnInsert: {
          companyId,
          day,
          createdAt: new Date().toISOString(),
          resetAt: nextUtcMidnightIso(day),
        },
        $set: { updatedAt: new Date().toISOString() },
        $inc: { promptTokens: p, completionTokens: c, totalTokens: total, callCount: 1 },
      },
      { upsert: true }
    ),
  ]);
}

async function getAiDailyQuotaStatus(companyId) {
  const db = await getDb();
  const day = tokenUsageDayKey();
  const [settings, doc] = await Promise.all([
    getSettings(companyId).catch(() => ({})),
    db.collection('config').findOne({ _id: dailyTokenUsageDocId(companyId, day) }),
  ]);
  const envLimit = parsePositiveInt(process.env.AI_DAILY_TOKEN_LIMIT, 100000);
  const limit = parsePositiveInt(settings.aiDailyTokenLimit ?? settings.aiDailyTokenQuota, envLimit);
  const promptTokens = doc?.promptTokens || 0;
  const completionTokens = doc?.completionTokens || 0;
  const totalTokens = doc?.totalTokens || 0;
  const callCount = doc?.callCount || 0;
  return {
    day,
    limit,
    promptTokens,
    completionTokens,
    totalTokens,
    callCount,
    remainingTokens: Math.max(0, limit - totalTokens),
    resetAt: nextUtcMidnightIso(day),
  };
}

async function getTokenUsage(companyId) {
  const db = await getDb();
  const [doc, daily] = await Promise.all([
    db.collection('config').findOne({ _id: tokenUsageDocId(companyId) }),
    getAiDailyQuotaStatus(companyId),
  ]);
  const { _id, ...rest } = doc || {};
  return {
    promptTokens: rest.promptTokens || 0,
    completionTokens: rest.completionTokens || 0,
    totalTokens: rest.totalTokens || 0,
    callCount: rest.callCount || 0,
    daily,
    quota: {
      dailyTokenLimit: daily.limit,
      remainingTokens: daily.remainingTokens,
      resetAt: daily.resetAt,
    },
  };
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
  incrementTokenUsage, getTokenUsage, getAiDailyQuotaStatus,
};
