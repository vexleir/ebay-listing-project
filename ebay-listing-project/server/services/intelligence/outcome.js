// INTEL-002 — pure outcome builder. Given an experiment + the latest eBay
// stats for the matching live item, returns the canonical `listing_outcomes`
// row. Schema is split off from snapshot.js so the two domains (publish-
// time content vs runtime outcomes) can evolve independently.
//
// Schema:
//   id                — composite "<experimentId>:<milestone>" so repeat
//                       captures at the same milestone overwrite each other
//                       rather than duplicate rows.
//   companyId         — tenant key.
//   experimentId      — FK to listing_experiments.id.
//   listingId         — FK to the local listing.
//   ebayItemId        — eBay's item id (cleaner than scanning experiments).
//   captureMilestone  — 'publish' | '7d' | '14d' | '30d' | 'sold' | 'end'.
//   capturedAt        — ISO timestamp of the capture.
//   ageDays           — integer days since publishedAt; null when publishedAt
//                       is missing/invalid.
//   viewCount         — integer or null.
//   watcherCount      — integer or null.
//   quantitySold      — integer or null.
//   soldAt            — ISO timestamp of the sale, or null.
//   finalSalePrice    — currency string, or null.
//   activePrice       — currency string, or null.
//   status            — listing status (eBay-side or local), e.g.
//                       'active' / 'completed' / 'ended'.

const VALID_MILESTONES = Object.freeze(['publish', '7d', '14d', '30d', 'sold', 'end']);

function normalizeMilestone(m) {
  if (typeof m !== 'string') return null;
  const lower = m.trim().toLowerCase();
  return VALID_MILESTONES.includes(lower) ? lower : null;
}

function toIntOrNull(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== 'string') return null;
  const stripped = value.trim().replace(/^\$/, '').trim();
  if (!stripped) return null;
  const num = Number(stripped);
  return Number.isFinite(num) ? String(num) : null;
}

function cleanString(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s || null;
}

function daysSince(publishedAt, capturedAtIso) {
  if (!publishedAt) return null;
  const pub = new Date(publishedAt).getTime();
  if (!Number.isFinite(pub)) return null;
  const now = new Date(capturedAtIso).getTime();
  if (!Number.isFinite(now)) return null;
  const ms = Math.max(0, now - pub);
  return Math.floor(ms / 86400000);
}

// Build an outcome doc from an experiment + the latest eBay stats. The
// experiment is required so the row inherits the tenant + experimentId +
// publishedAt anchor; stats is whatever the latest GetItem-style fetch
// returned (free shape — we read the optional fields we care about).
function buildOutcomeSnapshot({
  experiment,
  milestone,
  stats = {},
  status,
  now = () => new Date().toISOString(),
} = {}) {
  if (!experiment || typeof experiment !== 'object') throw new Error('experiment required');
  if (!experiment.id) throw new Error('experiment.id required');
  if (!experiment.companyId) throw new Error('experiment.companyId required');
  const m = normalizeMilestone(milestone);
  if (!m) throw new Error(`milestone required (one of: ${VALID_MILESTONES.join(', ')})`);

  const capturedAt = now();

  return {
    id: `${experiment.id}:${m}`,
    companyId: String(experiment.companyId),
    experimentId: String(experiment.id),
    listingId: experiment.listingId ? String(experiment.listingId) : null,
    ebayItemId: experiment.ebayItemId ? String(experiment.ebayItemId) : null,
    captureMilestone: m,
    capturedAt,
    ageDays: daysSince(experiment.publishedAt, capturedAt),
    viewCount: toIntOrNull(stats.viewCount),
    watcherCount: toIntOrNull(stats.watcherCount),
    quantitySold: toIntOrNull(stats.quantitySold),
    soldAt: cleanString(stats.soldAt),
    finalSalePrice: normalizePrice(stats.finalSalePrice),
    activePrice: normalizePrice(stats.activePrice),
    status: cleanString(status),
  };
}

module.exports = {
  buildOutcomeSnapshot,
  normalizeMilestone,
  normalizePrice,
  toIntOrNull,
  daysSince,
  VALID_MILESTONES,
};
