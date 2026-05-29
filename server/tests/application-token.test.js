// Unit tests for server/services/ebay/applicationToken.js. The `transport`
// injection seam lets us drive the OAuth token call without real HTTP.
// Reset the cache before each test so prior tokens don't leak.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  getApplicationToken,
  __resetApplicationTokenCache,
} = require('../services/ebay/applicationToken');
const { OAUTH_TOKEN_URL } = require('../services/ebay/client');

// Capture the environment we found so we can restore it after each test.
let envSnapshot;

function makeTransport({ token = 'tok_abc', expiresIn = 7200, postSpy = null } = {}) {
  return {
    post: async (url, body, opts) => {
      if (postSpy) postSpy({ url, body, opts });
      return { data: { access_token: token, expires_in: expiresIn } };
    },
  };
}

test.beforeEach(() => {
  __resetApplicationTokenCache();
  envSnapshot = { id: process.env.EBAY_CLIENT_ID, secret: process.env.EBAY_CLIENT_SECRET };
  process.env.EBAY_CLIENT_ID = 'test-client-id';
  process.env.EBAY_CLIENT_SECRET = 'test-client-secret';
});

test.afterEach(() => {
  if (envSnapshot.id === undefined) delete process.env.EBAY_CLIENT_ID;
  else process.env.EBAY_CLIENT_ID = envSnapshot.id;
  if (envSnapshot.secret === undefined) delete process.env.EBAY_CLIENT_SECRET;
  else process.env.EBAY_CLIENT_SECRET = envSnapshot.secret;
});

test('throws when EBAY_CLIENT_ID is missing', async () => {
  delete process.env.EBAY_CLIENT_ID;
  await assert.rejects(
    () => getApplicationToken({ transport: makeTransport() }),
    /EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not set/,
  );
});

test('throws when EBAY_CLIENT_SECRET is missing', async () => {
  delete process.env.EBAY_CLIENT_SECRET;
  await assert.rejects(
    () => getApplicationToken({ transport: makeTransport() }),
    /EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not set/,
  );
});

test('fetches a fresh token on the first call', async () => {
  const seen = [];
  const transport = makeTransport({ token: 'first-token', postSpy: (call) => seen.push(call) });
  const out = await getApplicationToken({ transport });
  assert.equal(out, 'first-token');
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, OAUTH_TOKEN_URL);
});

test('POSTs grant_type=client_credentials and the api_scope scope', async () => {
  const seen = [];
  await getApplicationToken({ transport: makeTransport({ postSpy: (call) => seen.push(call) }) });
  const body = seen[0].body;
  assert.match(body, /grant_type=client_credentials/);
  // The scope value is URL-encoded — the colon in https:// becomes %3A.
  assert.match(body, /scope=https%3A%2F%2Fapi\.ebay\.com%2Foauth%2Fapi_scope/);
});

test('sends Basic Authorization header with base64(client_id:client_secret)', async () => {
  const seen = [];
  await getApplicationToken({ transport: makeTransport({ postSpy: (call) => seen.push(call) }) });
  const expected = 'Basic ' + Buffer.from('test-client-id:test-client-secret').toString('base64');
  assert.equal(seen[0].opts.headers.Authorization, expected);
  assert.equal(seen[0].opts.headers['Content-Type'], 'application/x-www-form-urlencoded');
});

test('reuses the cached token on subsequent calls inside the validity window', async () => {
  let calls = 0;
  const transport = {
    post: async () => {
      calls += 1;
      return { data: { access_token: 'cached-token', expires_in: 7200 } };
    },
  };
  const a = await getApplicationToken({ transport });
  const b = await getApplicationToken({ transport });
  const c = await getApplicationToken({ transport });
  assert.equal(a, 'cached-token');
  assert.equal(b, 'cached-token');
  assert.equal(c, 'cached-token');
  assert.equal(calls, 1);
});

test('refreshes after the cache expires', async () => {
  // First fetch: expires_in is tiny so the 60s safety margin already
  // pushes the cache into "expired" territory and the next call refetches.
  let label = 'first';
  const transport = {
    post: async () => ({ data: { access_token: label, expires_in: 30 } }),
  };
  const a = await getApplicationToken({ transport });
  label = 'second';
  const b = await getApplicationToken({ transport });
  assert.equal(a, 'first');
  assert.equal(b, 'second');
});

test('caches the token with a 60s safety margin against the eBay-reported expiry', async () => {
  // We can't easily inspect cachedExpiry directly, but we can verify that
  // expires_in=120 results in the cache being kept (since 120 - 60 = 60s > 0).
  let calls = 0;
  const transport = {
    post: async () => {
      calls += 1;
      return { data: { access_token: 'safe-token', expires_in: 120 } };
    },
  };
  await getApplicationToken({ transport });
  await getApplicationToken({ transport });
  assert.equal(calls, 1);
});

test('__resetApplicationTokenCache forces a refetch on the next call', async () => {
  let calls = 0;
  const transport = {
    post: async () => {
      calls += 1;
      return { data: { access_token: `tok-${calls}`, expires_in: 7200 } };
    },
  };
  const a = await getApplicationToken({ transport });
  __resetApplicationTokenCache();
  const b = await getApplicationToken({ transport });
  assert.equal(a, 'tok-1');
  assert.equal(b, 'tok-2');
  assert.equal(calls, 2);
});

test('propagates transport errors', async () => {
  const transport = { post: async () => { throw new Error('eBay returned 401'); } };
  await assert.rejects(() => getApplicationToken({ transport }), /eBay returned 401/);
});
