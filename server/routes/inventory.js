// INV-001 — Inventory CRUD routes. Mounted under /api/inventory below
// the global authMiddleware so every handler can rely on req.companyId.
//
// Tenant isolation is enforced inside the inventory module — every method
// filters by req.companyId — so even a missing/malformed id can't leak
// rows from another company.

const express = require('express');
const crypto = require('crypto');
const {
  createInventoryItem,
  getInventoryItem,
  getInventoryItemBySku,
  listInventoryItems,
  updateInventoryItem,
  deleteInventoryItem,
} = require('../inventory');

const router = express.Router();

// Translates an inventory-module error (which carries `status` on the
// 400/409 paths) into the HTTP shape the client expects. Falls back to a
// 500 with the error message for anything unrecognized.
function handleError(res, e, context) {
  if (e && typeof e.status === 'number' && e.status >= 400 && e.status < 600) {
    res.status(e.status).json({ error: e.message });
  } else {
    console.error(`[inventory] ${context}:`, e?.message || e);
    res.status(500).json({ error: e?.message || 'internal error' });
  }
}

router.get('/', async (req, res) => {
  try {
    const items = await listInventoryItems(req.companyId, {
      skuPrefix: req.query.skuPrefix || undefined,
      sourceTag: req.query.sourceTag || undefined,
    });
    res.json({ items, total: items.length });
  } catch (e) {
    handleError(res, e, 'list');
  }
});

// SKU-based lookup. Useful for the warn-before-staging UX in INV-002 — the
// client posts the SKU and the server returns the canonical record (or
// 404 when none).
router.get('/by-sku/:sku', async (req, res) => {
  try {
    const item = await getInventoryItemBySku(req.companyId, req.params.sku);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (e) {
    handleError(res, e, 'getBySku');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await getInventoryItem(req.companyId, req.params.id);
    if (!item) return res.status(404).json({ error: 'not found' });
    res.json(item);
  } catch (e) {
    handleError(res, e, 'get');
  }
});

router.post('/', async (req, res) => {
  try {
    const input = req.body?.item;
    if (!input || typeof input !== 'object') {
      return res.status(400).json({ error: 'item required' });
    }
    // Allow callers to omit the id — generate one so the client doesn't
    // need crypto on the device. Existing id is honored.
    if (!input.id) input.id = crypto.randomUUID();
    const created = await createInventoryItem(req.companyId, input);
    res.status(201).json(created);
  } catch (e) {
    handleError(res, e, 'create');
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updates = req.body?.updates;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates required' });
    }
    const existing = await getInventoryItem(req.companyId, req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const next = await updateInventoryItem(req.companyId, req.params.id, updates);
    res.json(next);
  } catch (e) {
    handleError(res, e, 'update');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteInventoryItem(req.companyId, req.params.id);
    if (result.deleted === 0) return res.status(404).json({ error: 'not found' });
    res.json({ success: true });
  } catch (e) {
    handleError(res, e, 'delete');
  }
});

module.exports = router;
