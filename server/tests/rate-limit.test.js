const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parsePositiveIntEnv,
  rateLimitKey,
  createRateLimiter,
} = require('../middleware/rateLimit');

function mockRes() {
  const headers = {};
  const res = {
    statusCode: null,
    body: null,
    setHeader(name, value) { headers[name] = value; },
    getHeader(name) { return headers[name]; },
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; return res; },
  };
  return res;
}

test('parsePositiveIntEnv returns the env value when it is a positive integer', () => {
  process.env.__RL_TEST_VAL = '42';
  assert.equal(parsePositiveIntEnv('__RL_TEST_VAL', 99), 42);
  delete process.env.__RL_TEST_VAL;
});

test('parsePositiveIntEnv falls back when the env value is missing, zero, negative, or non-numeric', () => {
  delete process.env.__RL_TEST_VAL;
  assert.equal(parsePositiveIntEnv('__RL_TEST_VAL', 5), 5);
  process.env.__RL_TEST_VAL = '0';
  assert.equal(parsePositiveIntEnv('__RL_TEST_VAL', 5), 5);
  process.env.__RL_TEST_VAL = '-3';
  assert.equal(parsePositiveIntEnv('__RL_TEST_VAL', 5), 5);
  process.env.__RL_TEST_VAL = 'abc';
  assert.equal(parsePositiveIntEnv('__RL_TEST_VAL', 5), 5);
  delete process.env.__RL_TEST_VAL;
});

test('rateLimitKey prefers companyId, then user.companyId, then user.userId, then ip', () => {
  assert.equal(rateLimitKey({ companyId: 'c1', user: { companyId: 'cX', userId: 'u1' }, ip: '1.1.1.1' }), 'c1');
  assert.equal(rateLimitKey({ user: { companyId: 'cX', userId: 'u1' }, ip: '1.1.1.1' }), 'cX');
  assert.equal(rateLimitKey({ user: { userId: 'u1' }, ip: '1.1.1.1' }), 'u1');
  assert.equal(rateLimitKey({ ip: '1.1.1.1' }), '1.1.1.1');
  assert.equal(rateLimitKey({}), 'unknown');
});

test('rateLimitKey falls back to x-forwarded-for header when no ip is available', () => {
  assert.equal(rateLimitKey({ headers: { 'x-forwarded-for': '10.0.0.1' } }), '10.0.0.1');
});

test('createRateLimiter allows requests up to the max and rejects further requests in the same window', () => {
  const limiter = createRateLimiter({ name: 't', windowMs: 60_000, max: 3, message: 'too many' });
  const req = { companyId: 'cA' };

  for (let i = 0; i < 3; i++) {
    const res = mockRes();
    let called = false;
    limiter(req, res, () => { called = true; });
    assert.equal(called, true, `request ${i + 1} should pass`);
    assert.equal(res.statusCode, null);
  }

  const res = mockRes();
  let called = false;
  limiter(req, res, () => { called = true; });
  assert.equal(called, false);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.code, 'RATE_LIMITED');
  assert.equal(res.body.error, 'too many');
  assert.ok(res.body.retryAfterSeconds >= 1);
  assert.ok(res.getHeader('Retry-After'));
});

test('createRateLimiter sets RateLimit-* headers on successful requests', () => {
  const limiter = createRateLimiter({ name: 'h', windowMs: 60_000, max: 5, message: 'x' });
  const res = mockRes();
  limiter({ companyId: 'cB' }, res, () => {});
  assert.equal(res.getHeader('RateLimit-Limit'), '5');
  assert.equal(res.getHeader('RateLimit-Remaining'), '4');
  assert.ok(res.getHeader('RateLimit-Reset'));
});

test('createRateLimiter isolates buckets per key (one company cannot starve another)', () => {
  const limiter = createRateLimiter({ name: 'iso', windowMs: 60_000, max: 2, message: 'x' });

  // Use up cA's quota.
  for (let i = 0; i < 2; i++) {
    const res = mockRes();
    limiter({ companyId: 'cA' }, res, () => {});
  }
  const overA = mockRes();
  limiter({ companyId: 'cA' }, overA, () => {});
  assert.equal(overA.statusCode, 429);

  // cB should still be allowed.
  const resB = mockRes();
  let calledB = false;
  limiter({ companyId: 'cB' }, resB, () => { calledB = true; });
  assert.equal(calledB, true);
  assert.equal(resB.statusCode, null);
});

test('createRateLimiter isolates buckets per limiter name (different limiters do not share state)', () => {
  const a = createRateLimiter({ name: 'a', windowMs: 60_000, max: 1, message: 'x' });
  const b = createRateLimiter({ name: 'b', windowMs: 60_000, max: 1, message: 'x' });

  const r1 = mockRes(); a({ companyId: 'c' }, r1, () => {});
  const r2 = mockRes(); a({ companyId: 'c' }, r2, () => {});
  assert.equal(r2.statusCode, 429, 'limiter a should be exhausted after 1 call');

  const r3 = mockRes();
  let called = false;
  b({ companyId: 'c' }, r3, () => { called = true; });
  assert.equal(called, true, 'limiter b should be independent');
});

test('createRateLimiter resets the bucket after the window elapses', () => {
  const limiter = createRateLimiter({ name: 'reset', windowMs: 10, max: 1, message: 'x' });
  const req = { companyId: 'cR' };

  const r1 = mockRes();
  limiter(req, r1, () => {});
  const r2 = mockRes();
  limiter(req, r2, () => {});
  assert.equal(r2.statusCode, 429);

  // Wait for the window to elapse, then try again — should pass.
  return new Promise((resolve) => {
    setTimeout(() => {
      const r3 = mockRes();
      let called = false;
      limiter(req, r3, () => { called = true; });
      assert.equal(called, true);
      assert.equal(r3.statusCode, null);
      resolve();
    }, 20);
  });
});
