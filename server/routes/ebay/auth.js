// eBay connection/auth routes extracted from server/app.js. Mounted under
// /api/ebay below the global authMiddleware so every route here can rely on
// req.companyId being set.
//
// Routes:
//   GET    /auth-url    — return the eBay OAuth consent URL for this company
//   GET    /auth-status — boolean "do we have a valid session?"
//   GET    /token-info  — refresh-token expiry for the connection UI
//   DELETE /tokens      — clear stored tokens so the seller can re-authenticate
//   GET    /debug-auth  — superadmin + ENABLE_DEBUG_ENDPOINTS only
//
// The public OAuth callback (GET /api/ebay/callback) lives in
// server/routes/publicAuth.js because it must be mounted BEFORE the global
// auth middleware (eBay redirects buyers' browsers there without a JWT).

const express = require('express');
const { requireSuperAdmin } = require('../../auth');
const { createRequireDebugEndpointsEnabled } = require('../../middleware/requireDebugEndpoints');
const { getAuthUrl, hasValidSession, getTokenExpiry } = require('../../ebayAuth');
const { getDb } = require('../../db');

const router = express.Router();
const requireDebugEndpointsEnabled = createRequireDebugEndpointsEnabled();

router.get('/auth-url', (req, res) => {
  try {
    const url = getAuthUrl(req.companyId);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/auth-status', async (req, res) => {
  try {
    const connected = await hasValidSession(req.companyId);
    res.json({ connected });
  } catch (error) {
    console.error('[auth-status] error:', error.message);
    res.json({ connected: false });
  }
});

router.get('/token-info', async (req, res) => {
  try {
    res.json(await getTokenExpiry(req.companyId));
  } catch (e) {
    res.json({ refresh_token_expires_at: null });
  }
});

router.delete('/tokens', async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('tokens').deleteOne({ _id: `${req.companyId}_tokens` });
    console.log(`[ebay-tokens] cleared tokens for company=${req.companyId}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/debug-auth', requireSuperAdmin, requireDebugEndpointsEnabled, async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection('tokens').findOne({ _id: `${req.companyId}_tokens` });
    const accessTokenExpired = doc?.expires_at ? Date.now() >= new Date(doc.expires_at).getTime() : null;
    const refreshTokenExpired = doc?.refresh_token_expires_at ? Date.now() >= new Date(doc.refresh_token_expires_at).getTime() : null;
    res.json({
      companyId: req.companyId,
      hasClientId: !!process.env.EBAY_CLIENT_ID,
      hasClientSecret: !!(process.env.EBAY_CLIENT_SECRET),
      hasRuName: !!process.env.EBAY_RU_NAME,
      tokenDocExists: !!doc,
      hasRefreshToken: !!doc?.refresh_token,
      hasAccessToken: !!doc?.access_token,
      accessTokenExpired,
      refreshTokenExpired,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
