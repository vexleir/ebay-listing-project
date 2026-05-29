// INTEL-001 — read-only routes for the listing_experiments collection.
// Writes happen via the push success hook in routes/ebay/lifecycle.js, not
// the REST API — the snapshot is derived from the listing state at the
// moment of publish and shouldn't be hand-crafted by clients.
//
// Mounted under /api/intelligence below the global authMiddleware.

const express = require('express');
const {
  getExperiment,
  getLatestExperimentForListing,
  getExperimentByEbayItemId,
  listExperimentsForCompany,
  upsertOutcome,
  getOutcome,
  listOutcomesForExperiment,
  listOutcomesForCompany,
} = require('../intelligence');
const { captureOutcomeForEbayItem } = require('../services/intelligence/captureOutcome');

const router = express.Router();

function handleError(res, e, context) {
  if (e && typeof e.status === 'number' && e.status >= 400 && e.status < 600) {
    res.status(e.status).json({ error: e.message });
  } else {
    console.error(`[intelligence] ${context}:`, e?.message || e);
    res.status(500).json({ error: e?.message || 'internal error' });
  }
}

// GET /api/intelligence/experiments — list-for-company, newest first.
// Query: ?limit=50&since=2026-01-01T00:00:00.000Z
router.get('/experiments', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 100));
    const since = req.query.since || undefined;
    const items = await listExperimentsForCompany(req.companyId, { limit, since });
    res.json({ items, total: items.length });
  } catch (e) {
    handleError(res, e, 'list');
  }
});

// GET /api/intelligence/experiments/by-listing/:listingId — the latest
// experiment for a given listing. Used by the optimizer-impact UI to find
// "what was the listing's shape at the most recent publish?".
router.get('/experiments/by-listing/:listingId', async (req, res) => {
  try {
    const doc = await getLatestExperimentForListing(req.companyId, req.params.listingId);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (e) {
    handleError(res, e, 'getByListing');
  }
});

// GET /api/intelligence/experiments/by-ebay-item/:ebayItemId — used by the
// INTEL-002 outcome capture path so eBay's webhook can find the matching
// experiment without knowing the local listingId.
router.get('/experiments/by-ebay-item/:ebayItemId', async (req, res) => {
  try {
    const doc = await getExperimentByEbayItemId(req.companyId, req.params.ebayItemId);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (e) {
    handleError(res, e, 'getByEbayItem');
  }
});

// GET /api/intelligence/experiments/:id — single-doc fetch for debugging /
// linkbacks.
router.get('/experiments/:id', async (req, res) => {
  try {
    const doc = await getExperiment(req.companyId, req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (e) {
    handleError(res, e, 'get');
  }
});

// ── outcomes ─────────────────────────────────────────────────────────────

// GET /api/intelligence/outcomes — list-for-company, newest first.
// Query: ?milestone=sold&limit=50&since=2026-01-01T00:00:00.000Z
router.get('/outcomes', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 100));
    const milestone = req.query.milestone || undefined;
    const since = req.query.since || undefined;
    const items = await listOutcomesForCompany(req.companyId, { limit, milestone, since });
    res.json({ items, total: items.length });
  } catch (e) {
    handleError(res, e, 'listOutcomes');
  }
});

// GET /api/intelligence/outcomes/by-experiment/:experimentId — every
// milestone row for a single experiment, sorted asc by capturedAt. Used by
// the Optimizer impact panel (INTEL-004) to walk a listing's journey.
router.get('/outcomes/by-experiment/:experimentId', async (req, res) => {
  try {
    const items = await listOutcomesForExperiment(req.companyId, req.params.experimentId);
    res.json({ items, total: items.length });
  } catch (e) {
    handleError(res, e, 'listOutcomesForExperiment');
  }
});

// GET /api/intelligence/outcomes/:id — single-doc fetch by composite id
// (`<experimentId>:<milestone>`).
router.get('/outcomes/:id', async (req, res) => {
  try {
    const doc = await getOutcome(req.companyId, req.params.id);
    if (!doc) return res.status(404).json({ error: 'not found' });
    res.json(doc);
  } catch (e) {
    handleError(res, e, 'getOutcome');
  }
});

// POST /api/intelligence/outcomes/capture — record a milestone capture
// for a known eBay item id. Body: { ebayItemId, milestone, stats, status }.
// Returns 201 on a new write, 200 on an idempotent overwrite, 204 when no
// experiment exists for the item (so the caller can ignore the response
// without treating absence as an error).
router.post('/outcomes/capture', async (req, res) => {
  try {
    const { ebayItemId, milestone, stats, status } = req.body || {};
    if (!ebayItemId || typeof ebayItemId !== 'string') {
      return res.status(400).json({ error: 'ebayItemId required' });
    }
    if (!milestone || typeof milestone !== 'string') {
      return res.status(400).json({ error: 'milestone required' });
    }
    const result = await captureOutcomeForEbayItem(req.companyId, ebayItemId, {
      milestone, stats, status,
    }, { getExperimentByEbayItemId, upsertOutcome });
    if (result.skipped) return res.status(204).end();
    res.status(201).json(result.outcome);
  } catch (e) {
    handleError(res, e, 'captureOutcome');
  }
});

module.exports = router;
