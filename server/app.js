// Express app wiring. Bootstrap (env, DB indexes, migrations, admin seed)
// lives in ./bootstrap.js; process startup (app.listen) lives in ./index.js.
//
// Every route handler is in a router module under ./routes; cross-cutting
// concerns (rate limiting, quota, debug-endpoint gating) live in ./middleware;
// eBay XML/lifecycle logic lives in ./services/ebay.
//
// Middleware order matters here. Public routes (login, OAuth callback) must
// be mounted BEFORE the global authMiddleware. Everything below the auth
// mount requires a JWT.

const express = require('express');
const cors = require('cors');
const path = require('path');

const { authMiddleware } = require('./auth');
const { createDefaultRateLimiters } = require('./middleware/rateLimit');

const feedbackRoutes = require('./routes/feedback');
const adminRoutes = require('./routes/admin');
const settingsRoutes = require('./routes/settings');
const listingsRoutes = require('./routes/listings');
const imagesRoutes = require('./routes/images');
const aiRoutes = require('./routes/ai');
const optimizerRoutes = require('./routes/optimizer');
const inventoryRoutes = require('./routes/inventory');
const ebayAuthRoutes = require('./routes/ebay/auth');
const ebayReadOnlyRoutes = require('./routes/ebay/readonly');
const ebayCompsRoutes = require('./routes/ebay/comps');
const ebayLifecycleRoutes = require('./routes/ebay/lifecycle');
const ebaySyncRoutes = require('./routes/ebay/sync');
const barcodeRoutes = require('./routes/barcode');
const publicAuthRoutes = require('./routes/publicAuth');
const meRoutes = require('./routes/me');

const { bootstrap } = require('./bootstrap');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const { globalApiRateLimit, authenticatedApiRateLimit } = createDefaultRateLimiters();

app.use('/api/', globalApiRateLimit);

// ─── Public routes (no JWT required) ────────────────────────────────────
// POST /api/auth/login + GET /api/ebay/callback must be mounted BEFORE the
// auth middleware so login can issue tokens and eBay can redirect buyers
// back without a token.
app.use('/api', publicAuthRoutes);

// ─── Authenticated routes ────────────────────────────────────────────────
// Every router mounted below this line requires a valid JWT.
app.use('/api/', authMiddleware);
app.use('/api/', authenticatedApiRateLimit);

app.use('/api/auth', meRoutes);
app.use('/api', settingsRoutes);
app.use('/api/listings', listingsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/images', imagesRoutes);
app.use('/api', aiRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/optimizer', optimizerRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/admin', adminRoutes);

// eBay routers — split by concern (auth / read-only / comps / lifecycle / sync)
app.use('/api/ebay', ebayAuthRoutes);
app.use('/api/ebay', ebayReadOnlyRoutes);
app.use('/api', ebayCompsRoutes);
app.use('/api/ebay', ebayLifecycleRoutes);
app.use('/api/ebay', ebaySyncRoutes);

// ─── SPA catch-all ──────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

module.exports = { app, bootstrap };
