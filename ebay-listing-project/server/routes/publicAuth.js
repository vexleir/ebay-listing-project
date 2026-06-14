// Public routes that must run BEFORE the global authMiddleware:
//   POST /api/auth/login    — issues a JWT
//   GET  /api/ebay/callback — eBay OAuth redirect target (browser, no JWT)
//
// Extracted from server/app.js. Wired in app.js immediately after the
// global rate limiter and BEFORE app.use('/api/', authMiddleware).

const express = require('express');
const { signToken } = require('../auth');
const { verifyPassword } = require('../users');
const { exchangeCodeForToken } = require('../ebayAuth');

const router = express.Router();

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const user = await verifyPassword(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const token = signToken({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
      email: user.email,
      name: user.name,
    });
    res.json({
      token,
      user: {
        id: user.id,
        companyId: user.companyId,
        role: user.role,
        email: user.email,
        name: user.name,
      },
    });
  } catch (e) {
    console.error('[login] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/ebay/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('No authorization code provided.');
  try {
    const companyId = state ? Buffer.from(state, 'base64').toString('utf8') : 'default';
    console.log(`[oauth-callback] exchanging code for company=${companyId}`);
    await exchangeCodeForToken(code, companyId);
    console.log(`[oauth-callback] success for company=${companyId}`);
    res.send(`<!DOCTYPE html><html><head><title>eBay Connected</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;}
      .box{text-align:center;padding:2rem;background:#1e293b;border-radius:12px;max-width:400px;}
      h2{color:#22c55e;margin-bottom:0.5rem;} p{color:#94a3b8;margin-bottom:1.5rem;}
      a{display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;}</style></head>
      <body><div class="box"><h2>✓ eBay Connected!</h2>
      <p>Your eBay account was linked successfully for <strong>${companyId}</strong>.</p>
      <a href="/">Return to App</a></div></body></html>`);
  } catch (error) {
    const errData = error.response?.data || error.message;
    console.error('OAuth Callback Error:', errData);
    res.send(`<!DOCTYPE html><html><head><title>eBay Connection Failed</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;}
      .box{text-align:center;padding:2rem;background:#1e293b;border-radius:12px;max-width:500px;}
      h2{color:#ef4444;margin-bottom:0.5rem;} pre{color:#fca5a5;background:#450a0a;padding:1rem;border-radius:8px;text-align:left;overflow:auto;font-size:0.8rem;white-space:pre-wrap;}
      a{display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;margin-top:1rem;}</style></head>
      <body><div class="box"><h2>✗ eBay Connection Failed</h2>
      <pre>${JSON.stringify(errData, null, 2)}</pre>
      <a href="/">Return to App</a></div></body></html>`);
  }
});

module.exports = router;
