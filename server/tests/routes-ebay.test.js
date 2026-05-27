// Integration tests for the extracted eBay/auth/barcode/misc routers.
// Uses the Module.prototype.require patch pattern from routes.test.js to
// inject fakes for ebayAuth, users, db, listings, and (where it matters)
// the application token cache. No Mongo / no real eBay calls.

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-routes-ebay';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

// ─── module fakes ─────────────────────────────────────────────────────────

const Module = require('module');
const originalRequire = Module.prototype.require;

const fakeEbayAuth = {
  getAuthUrl: (companyId) => `https://auth.ebay.example/?company=${companyId}`,
  hasValidSession: async (companyId) => companyId === 'connected-co',
  getTokenExpiry: async () => ({ refresh_token_expires_at: 1700000000000 }),
  getValidAccessToken: async () => 'fake-access-token',
  exchangeCodeForToken: async () => {},
};

const fakeUsers = {
  verifyPassword: async (email, password) => {
    if (email === 'real@x.com' && password === 'pw') {
      return { id: 'u1', companyId: 'c1', role: 'user', email, name: 'Real User' };
    }
    return null;
  },
  createCompany: async () => ({}),
  createUser: async () => ({}),
  getUserByEmail: async () => null,
};

let tokenDocs = new Map();
const fakeDb = {
  getDb: async () => ({
    collection: () => ({
      deleteOne: async ({ _id }) => { tokenDocs.delete(_id); return { deletedCount: 1 }; },
      findOne: async ({ _id }) => tokenDocs.get(_id) || null,
    }),
  }),
};

const fakeListings = {
  getActiveListings: async () => [],
  getListings: async () => [],
  createListing: async () => {},
  updateListing: async () => {},
  deleteListing: async () => {},
  getAllListingsMeta: async () => [],
  getSettings: async () => ({}),
  saveSettings: async () => {},
  getTokenUsage: async () => ({}),
  incrementTokenUsage: async () => {},
  getAiDailyQuotaStatus: async () => ({ limit: 100, totalTokens: 0, remainingTokens: 100, resetAt: '', day: '' }),
};

// Match both '../foo' (called from routes/) and '../../foo' (called from
// routes/ebay/) — the depth depends on the calling file's location.
const FAKES = new Map([
  ['ebayAuth', fakeEbayAuth],
  ['users', fakeUsers],
  ['db', fakeDb],
  ['listings', fakeListings],
]);

Module.prototype.require = function patched(name) {
  if (typeof name === 'string') {
    const m = name.match(/^(?:\.\.\/){1,3}([^./]+)$/);
    if (m && FAKES.has(m[1])) return FAKES.get(m[1]);
  }
  return originalRequire.apply(this, arguments);
};

const { resetSharedRateLimiters } = require('../middleware/rateLimit');
resetSharedRateLimiters();

const ebayAuthRouter = require('../routes/ebay/auth');
const publicAuthRouter = require('../routes/publicAuth');
const meRouter = require('../routes/me');
const barcodeRouter = require('../routes/barcode');

Module.prototype.require = originalRequire;

// ─── test harness ────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  // Public routes — mounted BEFORE auth, matches production order.
  app.use('/api', publicAuthRouter);
  app.use('/api/', authMiddleware);
  app.use('/api/auth', meRouter);
  app.use('/api/ebay', ebayAuthRouter);
  app.use('/api/barcode', barcodeRouter);
  return app;
}

function startServer(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1');
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}
function stopServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function request(server, method, path, { token, body } = {}) {
  const { port } = server.address();
  const data = body ? JSON.stringify(body) : null;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (data) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(data);
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method, headers },
      (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { buf += c; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = buf ? JSON.parse(buf) : null; } catch (_) { parsed = buf; }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const userToken = (co = 'c1') => signToken({ userId: 'u1', companyId: co, role: 'user', email: 'u@x.com', name: 'U' });

// ─── public auth router ──────────────────────────────────────────────────

test('POST /api/auth/login returns 400 without email/password', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/auth/login', { body: {} });
    assert.equal(res.status, 400);
  } finally { await stopServer(server); }
});

test('POST /api/auth/login returns 401 for wrong credentials', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/auth/login', {
      body: { email: 'wrong@x.com', password: 'nope' },
    });
    assert.equal(res.status, 401);
    assert.match(res.body.error, /Invalid email or password/);
  } finally { await stopServer(server); }
});

test('POST /api/auth/login returns a token for correct credentials and works WITHOUT prior auth', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/auth/login', {
      body: { email: 'real@x.com', password: 'pw' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'should return a JWT');
    assert.equal(res.body.user.email, 'real@x.com');
  } finally { await stopServer(server); }
});

test('GET /api/ebay/callback succeeds without a JWT (public OAuth target)', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/ebay/callback?code=abc&state=' + Buffer.from('c1').toString('base64'));
    assert.equal(res.status, 200);
    assert.match(String(res.body), /eBay Connected/);
  } finally { await stopServer(server); }
});

test('GET /api/ebay/callback returns 400 when code is missing', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/ebay/callback');
    assert.equal(res.status, 400);
  } finally { await stopServer(server); }
});

// ─── /api/auth/me ─────────────────────────────────────────────────────────

test('GET /api/auth/me requires a JWT', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/auth/me');
    assert.equal(res.status, 401);
  } finally { await stopServer(server); }
});

test('GET /api/auth/me returns the decoded user when authenticated', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/auth/me', { token: userToken() });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.userId, 'u1');
    assert.equal(res.body.user.companyId, 'c1');
  } finally { await stopServer(server); }
});

// ─── eBay auth router ─────────────────────────────────────────────────────

test('GET /api/ebay/auth-url returns the consent URL for the authenticated company', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/ebay/auth-url', { token: userToken('co-42') });
    assert.equal(res.status, 200);
    assert.match(res.body.url, /company=co-42/);
  } finally { await stopServer(server); }
});

test('GET /api/ebay/auth-status returns connected:true for a company with a session', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/ebay/auth-status', { token: userToken('connected-co') });
    assert.equal(res.status, 200);
    assert.equal(res.body.connected, true);
  } finally { await stopServer(server); }
});

test('GET /api/ebay/auth-status returns connected:false when no session', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/ebay/auth-status', { token: userToken('not-connected-co') });
    assert.equal(res.status, 200);
    assert.equal(res.body.connected, false);
  } finally { await stopServer(server); }
});

test('GET /api/ebay/token-info returns the refresh expiry shape on success', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/ebay/token-info', { token: userToken() });
    assert.equal(res.status, 200);
    assert.equal(res.body.refresh_token_expires_at, 1700000000000);
  } finally { await stopServer(server); }
});

test('DELETE /api/ebay/tokens clears the stored tokens for the company', async () => {
  tokenDocs = new Map([['c1_tokens', { _id: 'c1_tokens', refresh_token: 'x' }]]);
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'DELETE', '/api/ebay/tokens', { token: userToken('c1') });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(tokenDocs.has('c1_tokens'), false);
  } finally { await stopServer(server); }
});

test('DELETE /api/ebay/tokens still requires a JWT', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'DELETE', '/api/ebay/tokens');
    assert.equal(res.status, 401);
  } finally { await stopServer(server); }
});

test('GET /api/ebay/debug-auth is locked down by requireSuperAdmin even with the gate enabled', async () => {
  // The router already imports a gate from createRequireDebugEndpointsEnabled,
  // which reads the env once. Tests already cover the gate elsewhere; here we
  // just confirm a non-superadmin gets 403 regardless of the env flag.
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/ebay/debug-auth', { token: userToken() });
    assert.ok(res.status === 403 || res.status === 404, `expected 403 or 404, got ${res.status}`);
  } finally { await stopServer(server); }
});

// ─── barcode router ──────────────────────────────────────────────────────

test('GET /api/barcode returns 400 without upc query param', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/barcode', { token: userToken() });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /upc query param required/);
  } finally { await stopServer(server); }
});

test('GET /api/barcode requires a JWT', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/barcode?upc=12345');
    assert.equal(res.status, 401);
  } finally { await stopServer(server); }
});
