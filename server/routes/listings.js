// Listings CRUD routes extracted from server/app.js. Mounted under
// /api/listings in app.js below the global authMiddleware so every route
// here can rely on req.companyId.
//
// The /debug route remains superadmin + ENABLE_DEBUG_ENDPOINTS gated.
// The /by-ebay-id/:itemId PATCH route reaches directly into Mongo to update
// by `ebayDraftId` because the listings module doesn't expose that path;
// callers (the optimizer) save collection codes against the eBay item id.

const express = require('express');
const { requireSuperAdmin } = require('../auth');
const { createRequireDebugEndpointsEnabled } = require('../middleware/requireDebugEndpoints');
const {
  getListings,
  createListing,
  updateListing,
  deleteListing,
  getAllListingsMeta,
} = require('../listings');
const { getDb } = require('../db');

const router = express.Router();
const requireDebugEndpointsEnabled = createRequireDebugEndpointsEnabled();

router.get('/', async (req, res) => {
  try {
    const status = req.query.status || 'staged';
    const listings = await getListings(req.companyId, status);
    console.log(`[listings] GET company=${req.companyId} status=${status} -> ${listings.length} results`);
    res.json(listings);
  } catch (e) {
    console.error('[listings] GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const listing = req.body.listing;
    console.log(`[listings] POST company=${req.companyId} id=${listing?.id} title=${listing?.title?.substring(0, 40)}`);
    await createListing(req.companyId, listing);
    res.json({ success: true });
  } catch (e) {
    console.error('[listings] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await updateListing(req.companyId, req.params.id, req.body.updates);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update a listing by its eBay item ID (used by the optimizer to save collection codes)
router.patch('/by-ebay-id/:itemId', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates) return res.status(400).json({ error: 'updates required' });
    const db = await getDb();
    const result = await db.collection('listings').updateOne(
      { ebayDraftId: req.params.itemId, companyId: req.companyId },
      { $set: { ...updates, updatedAt: Date.now() } },
    );
    if (result.matchedCount === 0) return res.json({ success: false, notFound: true });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/debug', requireSuperAdmin, requireDebugEndpointsEnabled, async (req, res) => {
  try {
    const all = await getAllListingsMeta(req.companyId);
    res.json({ total: all.length, items: all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await deleteListing(req.companyId, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
