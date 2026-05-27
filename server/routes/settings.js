// Settings + token-usage routes extracted from server/app.js.
// Mounted under /api in app.js below the global authMiddleware, so every
// route here can rely on req.companyId being set.
//
// /token-usage is grouped with /settings here (rather than under
// /api/settings/token-usage) because the original API path was /api/token-usage
// and we are preserving response shape per the plan's "stable contracts" rule.

const express = require('express');
const { getSettings, saveSettings, getTokenUsage } = require('../listings');

const router = express.Router();

router.get('/token-usage', async (req, res) => {
  try {
    res.json(await getTokenUsage(req.companyId));
  } catch (e) {
    res.json({ promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 });
  }
});

router.get('/settings', async (req, res) => {
  try {
    res.json(await getSettings(req.companyId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/settings', async (req, res) => {
  try {
    await saveSettings(req.companyId, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
