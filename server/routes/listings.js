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
  getListing,
  createListing,
  updateListing,
  deleteListing,
  getAllListingsMeta,
} = require('../listings');
const { ensureInventoryItemForSku, incrementInventoryCounters } = require('../inventory');
const { detectSoldTransition } = require('../services/inventory/soldTransition');
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

    // INV-002 auto-bootstrap — if the staged listing carries a SKU, make
    // sure the durable inventory record exists. Idempotent on repeat SKUs.
    // Failures here are non-fatal: the listing was already saved and a
    // missing inventory row only suppresses the badge UX, not the workflow.
    if (listing && typeof listing.sku === 'string' && listing.sku.trim()) {
      try {
        await ensureInventoryItemForSku(req.companyId, listing.sku, {
          costBasis: listing.costBasis,
        });
      } catch (e) {
        console.warn(`[listings] inventory bootstrap failed for sku=${listing.sku}: ${e.message}`);
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('[listings] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates = req.body.updates || {};

    // INV-002 sold-sync wiring — load the existing record FIRST so we can
    // tell whether this update flips the sold flag. The detector returns
    // null for any update that doesn't cross the sold boundary so we don't
    // pay for the Mongo round-trip on price-only / image-only edits.
    let soldTransition = null;
    if ('soldAt' in updates) {
      const existing = await getListing(req.companyId, req.params.id);
      soldTransition = detectSoldTransition(existing, updates);
    }

    await updateListing(req.companyId, req.params.id, updates);

    if (soldTransition) {
      try {
        await incrementInventoryCounters(req.companyId, soldTransition.sku, soldTransition.deltas);
      } catch (e) {
        console.warn(`[listings] sold counter update failed for sku=${soldTransition.sku}: ${e.message}`);
      }
    }

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
