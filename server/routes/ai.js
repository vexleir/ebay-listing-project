// AI generation routes extracted from server/app.js. Mounted under /api
// in app.js below the global authMiddleware. Both routes enforce the daily
// AI token quota up-front (via enforceAiDailyQuota) and record usage on
// success so the per-company daily limit stays accurate.

const express = require('express');
const { generateListing, generateListingFromUrls } = require('../ai');
const { createDefaultRateLimiters } = require('../middleware/rateLimit');
const {
  AI_GENERATE_QUOTA_RESERVE_TOKENS,
  enforceAiDailyQuota,
  recordTokenUsage,
} = require('../middleware/quota');

const { aiRateLimit } = createDefaultRateLimiters();

const router = express.Router();

router.post('/generate', aiRateLimit, async (req, res) => {
  try {
    const { imageParts, instructions } = req.body;
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_KEY_HERE') {
      return res.status(500).json({ error: 'Server missing GEMINI_API_KEY.' });
    }
    if (!(await enforceAiDailyQuota(req, res, AI_GENERATE_QUOTA_RESERVE_TOKENS))) return;
    const result = await generateListing(imageParts, instructions, process.env.GEMINI_API_KEY);
    await recordTokenUsage(req.companyId, result.tokenUsage);
    res.json(result);
  } catch (error) {
    console.error('AI Generation Error:', error);
    res.status(500).json({ error: (error && error.message) || 'Failed to generate AI listing' });
  }
});

router.post('/generate-from-urls', aiRateLimit, async (req, res) => {
  try {
    const { imageUrls, instructions } = req.body;
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
    if (!(await enforceAiDailyQuota(req, res, AI_GENERATE_QUOTA_RESERVE_TOKENS))) return;
    const result = await generateListingFromUrls(imageUrls || [], instructions || '', process.env.GEMINI_API_KEY);
    await recordTokenUsage(req.companyId, result.tokenUsage);
    res.json(result);
  } catch (e) {
    console.error('[generate-from-urls] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
