// Integration tests for the listings / images / ai / optimizer routers.
// Uses the same Module.prototype.require patching strategy as routes.test.js
// so we can load the routers without booting Mongo or hitting Cloudinary /
// Gemini / remove.bg / eBay.

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-routes-extra';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

// ─── module fakes ─────────────────────────────────────────────────────────

const Module = require('module');
const originalRequire = Module.prototype.require;

const fakeListings = {
  getListings: async (companyId, status) => [{ id: 'L1', companyId, status }],
  createListing: async () => {},
  updateListing: async () => {},
  deleteListing: async () => {},
  getAllListingsMeta: async () => [],
  getSettings: async () => ({}),
  saveSettings: async () => {},
  getTokenUsage: async () => ({ totalTokens: 0 }),
  getActiveListings: async () => [],
  incrementTokenUsage: async () => {},
  getAiDailyQuotaStatus: async () => ({ limit: 100, totalTokens: 0, remainingTokens: 100, resetAt: '', day: '' }),
};

let dbCalls = [];
const fakeDb = {
  getDb: async () => ({
    collection: () => ({
      updateOne: async (filter, update) => {
        dbCalls.push({ filter, update });
        return { matchedCount: filter.ebayDraftId === 'known' ? 1 : 0 };
      },
    }),
  }),
};

const fakeCloudinary = { uploadImage: async () => 'https://cdn.example.com/img.jpg' };

const fakeAi = {
  generateListing: async () => ({ result: 'ok', tokenUsage: { promptTokens: 1, completionTokens: 1 } }),
  generateListingFromUrls: async () => ({ result: 'ok', tokenUsage: { promptTokens: 1, completionTokens: 1 } }),
};

const fakeOptimizer = {
  fetchListingForOptimizer: async () => ({ fetched: true }),
  fetchSoldComps: async () => [],
  aiOptimizeListing: async () => ({ result: 'ok', tokenUsage: { promptTokens: 1, completionTokens: 1 } }),
};

Module.prototype.require = function patched(name) {
  if (name === '../listings') return fakeListings;
  if (name === '../db') return fakeDb;
  if (name === '../cloudinary') return fakeCloudinary;
  if (name === '../ai') return fakeAi;
  if (name === '../optimizer') return fakeOptimizer;
  return originalRequire.apply(this, arguments);
};

// Force-reset the shared rate-limiter singleton so each route module re-
// initializes against the (possibly already-loaded) modules cleanly.
const { resetSharedRateLimiters } = require('../middleware/rateLimit');
resetSharedRateLimiters();

const listingsRouter = require('../routes/listings');
const imagesRouter = require('../routes/images');
const aiRouter = require('../routes/ai');
const optimizerRouter = require('../routes/optimizer');

Module.prototype.require = originalRequire;

// ─── test harness ────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/', authMiddleware);
  app.use('/api/listings', listingsRouter);
  app.use('/api/images', imagesRouter);
  app.use('/api', aiRouter);
  app.use('/api/optimizer', optimizerRouter);
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

const userToken = () => signToken({ userId: 'u1', companyId: 'c1', role: 'user', email: 'u1@x.com', name: 'User' });

// ─── listings router ─────────────────────────────────────────────────────

test('GET /api/listings returns listings for the authenticated company', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/listings?status=staged', { token: userToken() });
    assert.equal(res.status, 200);
    assert.equal(res.body[0].companyId, 'c1');
    assert.equal(res.body[0].status, 'staged');
  } finally { await stopServer(server); }
});

test('POST /api/listings succeeds with a listing payload', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/listings', {
      token: userToken(),
      body: { listing: { id: 'L1', title: 'Test' } },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
  } finally { await stopServer(server); }
});

test('PATCH /api/listings/by-ebay-id/:itemId requires updates body', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'PATCH', '/api/listings/by-ebay-id/known', {
      token: userToken(),
      body: {},
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /updates required/);
  } finally { await stopServer(server); }
});

test('PATCH /api/listings/by-ebay-id/:itemId returns notFound when no listing matches', async () => {
  dbCalls = [];
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'PATCH', '/api/listings/by-ebay-id/unknown-id', {
      token: userToken(),
      body: { updates: { sku: 'X' } },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.success, false);
    assert.equal(res.body.notFound, true);
  } finally { await stopServer(server); }
});

// ─── images router ───────────────────────────────────────────────────────

test('POST /api/images/upload returns 400 when no images are provided', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/images/upload', {
      token: userToken(),
      body: { images: [] },
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /No images provided/);
  } finally { await stopServer(server); }
});

test('POST /api/images/upload returns 500 when CLOUDINARY_CLOUD_NAME is not set', async () => {
  const prev = process.env.CLOUDINARY_CLOUD_NAME;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/images/upload', {
      token: userToken(),
      body: { images: ['data:image/png;base64,xxx'] },
    });
    assert.equal(res.status, 500);
    assert.match(res.body.error, /Cloudinary not configured/);
  } finally {
    await stopServer(server);
    if (prev !== undefined) process.env.CLOUDINARY_CLOUD_NAME = prev;
  }
});

test('POST /api/images/remove-bg returns 400 when imageBase64 is missing', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/images/remove-bg', {
      token: userToken(),
      body: {},
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /imageBase64 required/);
  } finally { await stopServer(server); }
});

test('POST /api/images/remove-bg returns 501 when REMOVEBG_API_KEY is not configured', async () => {
  const prev = process.env.REMOVEBG_API_KEY;
  delete process.env.REMOVEBG_API_KEY;
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/images/remove-bg', {
      token: userToken(),
      body: { imageBase64: 'xxx' },
    });
    assert.equal(res.status, 501);
    assert.match(res.body.error, /REMOVEBG_API_KEY not configured/);
  } finally {
    await stopServer(server);
    if (prev !== undefined) process.env.REMOVEBG_API_KEY = prev;
  }
});

// ─── ai router ───────────────────────────────────────────────────────────

test('POST /api/generate returns 500 when GEMINI_API_KEY is not set', async () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/generate', {
      token: userToken(),
      body: { imageParts: [], instructions: 'X' },
    });
    assert.equal(res.status, 500);
    assert.match(res.body.error, /GEMINI_API_KEY/);
  } finally {
    await stopServer(server);
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
  }
});

test('POST /api/generate returns 500 when GEMINI_API_KEY is the placeholder', async () => {
  const prev = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'YOUR_GEMINI_KEY_HERE';
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/generate', {
      token: userToken(),
      body: { imageParts: [], instructions: 'X' },
    });
    assert.equal(res.status, 500);
    assert.match(res.body.error, /GEMINI_API_KEY/);
  } finally {
    await stopServer(server);
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
    else delete process.env.GEMINI_API_KEY;
  }
});

test('POST /api/generate-from-urls returns 500 when GEMINI_API_KEY is not set', async () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/generate-from-urls', {
      token: userToken(),
      body: { imageUrls: [], instructions: '' },
    });
    assert.equal(res.status, 500);
  } finally {
    await stopServer(server);
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
  }
});

// ─── optimizer router ────────────────────────────────────────────────────

test('GET /api/optimizer/fetch returns 400 without itemId', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/optimizer/fetch', { token: userToken() });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /itemId required/);
  } finally { await stopServer(server); }
});

test('GET /api/optimizer/fetch returns the fetched listing data when itemId is present', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/optimizer/fetch?itemId=12345', { token: userToken() });
    assert.equal(res.status, 200);
    assert.equal(res.body.fetched, true);
  } finally { await stopServer(server); }
});

test('GET /api/optimizer/comps returns 400 without query', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/optimizer/comps', { token: userToken() });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /query required/);
  } finally { await stopServer(server); }
});

test('POST /api/optimizer/ai-optimize returns 400 without listingData', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/optimizer/ai-optimize', {
      token: userToken(),
      body: {},
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /listingData required/);
  } finally { await stopServer(server); }
});

test('POST /api/optimizer/ai-optimize returns 500 when GEMINI_API_KEY is not set', async () => {
  const prev = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/optimizer/ai-optimize', {
      token: userToken(),
      body: { listingData: { title: 'x' } },
    });
    assert.equal(res.status, 500);
    assert.match(res.body.error, /GEMINI_API_KEY/);
  } finally {
    await stopServer(server);
    if (prev !== undefined) process.env.GEMINI_API_KEY = prev;
  }
});
