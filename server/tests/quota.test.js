// Unit tests for server/middleware/quota.js. Patches Module.prototype.require
// to inject a fake `../listings` so we can drive getAiDailyQuotaStatus and
// incrementTokenUsage from the test without booting Mongo.

const assert = require('node:assert/strict');
const test = require('node:test');

const Module = require('module');
const originalRequire = Module.prototype.require;

// In-memory fake `listings` module that the test can poke.
// Test hooks the fake exposes. quota.js destructures the functions at
// require-time, so the function identities have to stay stable across tests
// — we route through `__quotaSpy` and `__throwOnIncrement` instead of
// reassigning the methods themselves.
const fakeListings = {
  __nextQuota: {
    day: '2026-05-28',
    limit: 100000,
    totalTokens: 0,
    remainingTokens: 100000,
    resetAt: '2026-05-29T00:00:00.000Z',
  },
  __quotaSpy: null,
  __increments: [],
  __throwOnIncrement: false,

  getAiDailyQuotaStatus: async (companyId) => {
    if (fakeListings.__quotaSpy) fakeListings.__quotaSpy(companyId);
    return fakeListings.__nextQuota;
  },
  incrementTokenUsage: async (companyId, prompt, completion) => {
    if (fakeListings.__throwOnIncrement) throw new Error('boom');
    fakeListings.__increments.push({ companyId, prompt, completion });
  },

  __reset() {
    this.__nextQuota = {
      day: '2026-05-28',
      limit: 100000,
      totalTokens: 0,
      remainingTokens: 100000,
      resetAt: '2026-05-29T00:00:00.000Z',
    };
    this.__increments = [];
    this.__throwOnIncrement = false;
    this.__quotaSpy = null;
  },
};

Module.prototype.require = function patched(id) {
  // server/middleware/quota.js does `require('../listings')`, which from that
  // file path resolves to server/listings.js. Match either form to be safe.
  if (id === '../listings' || id.endsWith('/server/listings') || id.endsWith('/listings.js')) {
    return fakeListings;
  }
  return originalRequire.call(this, id);
};

// Require AFTER the patch so the cached `listings` reference in quota.js is the fake.
delete require.cache[require.resolve('../middleware/quota.js')];
const quota = require('../middleware/quota');

// Helper to capture res.status(...).json(...) shape without an HTTP server.
function makeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

test.beforeEach(() => fakeListings.__reset());

// ── enforceAiDailyQuota ─────────────────────────────────────────────────────

test('enforceAiDailyQuota allows the request when reserve fits in remaining', async () => {
  fakeListings.__nextQuota.remainingTokens = 10_000;
  const res = makeRes();
  const ok = await quota.enforceAiDailyQuota({ companyId: 'c1' }, res, 5000);
  assert.equal(ok, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});

test('enforceAiDailyQuota allows the request when reserve exactly equals remaining', async () => {
  fakeListings.__nextQuota.remainingTokens = 5000;
  const res = makeRes();
  const ok = await quota.enforceAiDailyQuota({ companyId: 'c1' }, res, 5000);
  assert.equal(ok, true);
});

test('enforceAiDailyQuota rejects with a 429 when remaining < reserve', async () => {
  fakeListings.__nextQuota = {
    day: '2026-05-28',
    limit: 100000,
    totalTokens: 99000,
    remainingTokens: 1000,
    resetAt: '2026-05-29T00:00:00.000Z',
  };
  const res = makeRes();
  const ok = await quota.enforceAiDailyQuota({ companyId: 'c1' }, res, 5000);
  assert.equal(ok, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, 'AI_QUOTA_EXCEEDED');
  assert.equal(res.body.error, 'Your AI quota for today has been reached.');
  assert.equal(res.body.resetAt, '2026-05-29T00:00:00.000Z');
  assert.deepEqual(res.body.quota, {
    day: '2026-05-28',
    limit: 100000,
    totalTokens: 99000,
    remainingTokens: 1000,
    reserveTokens: 5000,
  });
});

test('enforceAiDailyQuota passes the request company id through to getAiDailyQuotaStatus', async () => {
  const seen = [];
  fakeListings.__quotaSpy = (companyId) => seen.push(companyId);
  await quota.enforceAiDailyQuota({ companyId: 'co_42' }, makeRes(), 1000);
  assert.deepEqual(seen, ['co_42']);
});

test('enforceAiDailyQuota short-circuits to allow when the company has disabled the quota', async () => {
  fakeListings.__nextQuota = {
    day: '2026-05-29',
    limit: 0,            // would normally block every request
    disabled: true,
    totalTokens: 99999,
    remainingTokens: 0,
    resetAt: '2026-05-30T00:00:00.000Z',
  };
  const res = makeRes();
  const ok = await quota.enforceAiDailyQuota({ companyId: 'c1' }, res, 999999);
  assert.equal(ok, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, null);
});

test('enforceAiDailyQuota still enforces when disabled is explicitly false', async () => {
  fakeListings.__nextQuota = {
    day: '2026-05-29',
    limit: 100,
    disabled: false,
    totalTokens: 99,
    remainingTokens: 1,
    resetAt: '2026-05-30T00:00:00.000Z',
  };
  const res = makeRes();
  const ok = await quota.enforceAiDailyQuota({ companyId: 'c1' }, res, 5);
  assert.equal(ok, false);
  assert.equal(res.statusCode, 429);
});

// ── recordTokenUsage ────────────────────────────────────────────────────────

test('recordTokenUsage is a no-op when tokenUsage is falsy', async () => {
  await quota.recordTokenUsage('c1', null);
  await quota.recordTokenUsage('c1', undefined);
  assert.deepEqual(fakeListings.__increments, []);
});

test('recordTokenUsage forwards prompt + completion token counts', async () => {
  await quota.recordTokenUsage('c1', { promptTokens: 42, completionTokens: 17, totalTokens: 59 });
  assert.deepEqual(fakeListings.__increments, [{ companyId: 'c1', prompt: 42, completion: 17 }]);
});

test('recordTokenUsage swallows persistence errors instead of throwing', async () => {
  fakeListings.__throwOnIncrement = true;
  // Silence the expected error log line so the test runner output stays clean.
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    await quota.recordTokenUsage('c1', { promptTokens: 1, completionTokens: 1, totalTokens: 2 });
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 1);
  assert.match(errors[0].join(' '), /\[token-usage\] failed to record usage: boom/);
});

// ── reserve constants ──────────────────────────────────────────────────────

test('reserve constants are positive integers', () => {
  assert.equal(typeof quota.AI_GENERATE_QUOTA_RESERVE_TOKENS, 'number');
  assert.ok(quota.AI_GENERATE_QUOTA_RESERVE_TOKENS > 0);
  assert.equal(typeof quota.AI_OPTIMIZE_QUOTA_RESERVE_TOKENS, 'number');
  assert.ok(quota.AI_OPTIMIZE_QUOTA_RESERVE_TOKENS > 0);
});
