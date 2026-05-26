// Listing Optimizer routes extracted from server/app.js. Mounted under
// /api/optimizer in app.js below the global authMiddleware. Shares the
// aiRateLimit and compsRateLimit instances with other routes via the
// memoized createDefaultRateLimiters() singleton.

const express = require('express');
const { fetchListingForOptimizer, fetchSoldComps, aiOptimizeListing } = require('../optimizer');
const { createDefaultRateLimiters } = require('../middleware/rateLimit');
const {
  AI_OPTIMIZE_QUOTA_RESERVE_TOKENS,
  enforceAiDailyQuota,
  recordTokenUsage,
} = require('../middleware/quota');

const { aiRateLimit, compsRateLimit } = createDefaultRateLimiters();

const router = express.Router();

router.get('/fetch', async (req, res) => {
  const { itemId } = req.query;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    const data = await fetchListingForOptimizer(itemId.trim(), req.companyId);
    res.json(data);
  } catch (e) {
    console.error('[optimizer/fetch] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/comps', compsRateLimit, async (req, res) => {
  const { query, categoryId } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });
  try {
    const comps = await fetchSoldComps(query.trim(), categoryId || '');
    res.json({ comps });
  } catch (e) {
    console.error('[optimizer/comps] error:', e.message);
    // Return empty rather than error so UI degrades gracefully
    res.json({ comps: [], error: e.message });
  }
});

router.post('/ai-optimize', aiRateLimit, async (req, res) => {
  const { listingData } = req.body;
  if (!listingData) return res.status(400).json({ error: 'listingData required' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
  try {
    if (!(await enforceAiDailyQuota(req, res, AI_OPTIMIZE_QUOTA_RESERVE_TOKENS))) return;
    const result = await aiOptimizeListing(listingData, process.env.GEMINI_API_KEY);
    await recordTokenUsage(req.companyId, result.tokenUsage);
    res.json(result);
  } catch (e) {
    console.error('[optimizer/ai-optimize] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
