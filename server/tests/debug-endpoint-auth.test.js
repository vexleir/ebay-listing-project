const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-debug-endpoint-auth';

const express = require('express');
const { signToken, authMiddleware, requireSuperAdmin } = require('../auth');
const {
  createRequireDebugEndpointsEnabled,
  isEnabledFromEnv,
} = require('../middleware/requireDebugEndpoints');

function buildTestApp({ debugEnabled }) {
  const app = express();
  app.use(express.json());
  const debugGate = createRequireDebugEndpointsEnabled({ enabled: debugEnabled });

  app.get(
    '/api/ebay/debug-auth',
    authMiddleware,
    requireSuperAdmin,
    debugGate,
    (req, res) => res.json({ ok: true, companyId: req.companyId, role: req.user.role }),
  );

  app.get(
    '/api/listings/debug',
    authMiddleware,
    requireSuperAdmin,
    debugGate,
    (req, res) => res.json({ ok: true }),
  );

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

function request(server, path, headers = {}) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port, path, method: 'GET', headers },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = body ? JSON.parse(body) : null; } catch (_) { parsed = body; }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const debugRoutes = ['/api/ebay/debug-auth', '/api/listings/debug'];

test('isEnabledFromEnv only returns true for exact string "true"', () => {
  assert.equal(isEnabledFromEnv({ ENABLE_DEBUG_ENDPOINTS: 'true' }), true);
  assert.equal(isEnabledFromEnv({ ENABLE_DEBUG_ENDPOINTS: 'false' }), false);
  assert.equal(isEnabledFromEnv({ ENABLE_DEBUG_ENDPOINTS: '1' }), false);
  assert.equal(isEnabledFromEnv({ ENABLE_DEBUG_ENDPOINTS: 'TRUE' }), false);
  assert.equal(isEnabledFromEnv({}), false);
});

test('requireSuperAdmin rejects non-superadmin users with 403', () => {
  let statusCode = null;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };
  let nextCalled = false;
  requireSuperAdmin({ user: { role: 'user' } }, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
  assert.match(body.error, /superadmin/i);
});

test('requireSuperAdmin allows superadmin users through', () => {
  let nextCalled = false;
  requireSuperAdmin({ user: { role: 'superadmin' } }, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('requireSuperAdmin rejects requests with no user at all', () => {
  let statusCode = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json() { return this; },
  };
  let nextCalled = false;
  requireSuperAdmin({}, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 403);
});

test('createRequireDebugEndpointsEnabled returns 404 when disabled', () => {
  const middleware = createRequireDebugEndpointsEnabled({ enabled: false });
  let statusCode = null;
  let body = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
  };
  let nextCalled = false;
  middleware({}, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(statusCode, 404);
  assert.equal(body.error, 'Not found');
});

test('createRequireDebugEndpointsEnabled calls next when enabled', () => {
  const middleware = createRequireDebugEndpointsEnabled({ enabled: true });
  let nextCalled = false;
  middleware({}, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

for (const route of debugRoutes) {
  test(`${route} returns 401 with no Authorization header`, async () => {
    const app = buildTestApp({ debugEnabled: true });
    const server = await startServer(app);
    try {
      const res = await request(server, route);
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Unauthorized');
    } finally {
      await stopServer(server);
    }
  });

  test(`${route} returns 401 with malformed Authorization header`, async () => {
    const app = buildTestApp({ debugEnabled: true });
    const server = await startServer(app);
    try {
      const res = await request(server, route, { Authorization: 'Token abc123' });
      assert.equal(res.status, 401);
    } finally {
      await stopServer(server);
    }
  });

  test(`${route} returns 401 with invalid bearer token`, async () => {
    const app = buildTestApp({ debugEnabled: true });
    const server = await startServer(app);
    try {
      const res = await request(server, route, { Authorization: 'Bearer not-a-real-token' });
      assert.equal(res.status, 401);
      assert.match(res.body.error, /token/i);
    } finally {
      await stopServer(server);
    }
  });

  test(`${route} returns 403 for a valid non-superadmin token`, async () => {
    const app = buildTestApp({ debugEnabled: true });
    const server = await startServer(app);
    try {
      const token = signToken({ userId: 'u1', companyId: 'c1', role: 'user' });
      const res = await request(server, route, { Authorization: `Bearer ${token}` });
      assert.equal(res.status, 403);
      assert.match(res.body.error, /superadmin/i);
    } finally {
      await stopServer(server);
    }
  });

  test(`${route} returns 403 for a valid admin (non-superadmin) token`, async () => {
    const app = buildTestApp({ debugEnabled: true });
    const server = await startServer(app);
    try {
      const token = signToken({ userId: 'u1', companyId: 'c1', role: 'admin' });
      const res = await request(server, route, { Authorization: `Bearer ${token}` });
      assert.equal(res.status, 403);
    } finally {
      await stopServer(server);
    }
  });

  test(`${route} returns 404 for superadmin when ENABLE_DEBUG_ENDPOINTS is off`, async () => {
    const app = buildTestApp({ debugEnabled: false });
    const server = await startServer(app);
    try {
      const token = signToken({ userId: 'u1', companyId: 'c1', role: 'superadmin' });
      const res = await request(server, route, { Authorization: `Bearer ${token}` });
      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Not found');
    } finally {
      await stopServer(server);
    }
  });

  test(`${route} succeeds for superadmin when ENABLE_DEBUG_ENDPOINTS is on`, async () => {
    const app = buildTestApp({ debugEnabled: true });
    const server = await startServer(app);
    try {
      const token = signToken({ userId: 'u1', companyId: 'c1', role: 'superadmin' });
      const res = await request(server, route, { Authorization: `Bearer ${token}` });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
    } finally {
      await stopServer(server);
    }
  });
}

test('production sources mount debug routes behind requireSuperAdmin and the debug gate', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const serverDir = path.join(__dirname, '..');

  // Walk the server tree and read every .js file. The debug routes may live
  // in app.js or in any of the extracted route modules — we don't want this
  // test to fail every time a route migrates.
  function readAllJs(dir) {
    const out = {};
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'public' || entry.name === 'tests') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) Object.assign(out, readAllJs(full));
      else if (entry.name.endsWith('.js')) out[full] = fs.readFileSync(full, 'utf8');
    }
    return out;
  }
  const sources = readAllJs(serverDir);

  // For each debug route, find at least one file that wires it behind both
  // requireSuperAdmin and the debug gate, regardless of whether it's an
  // app.METHOD or router.METHOD call and regardless of the path prefix.
  for (const route of debugRoutes) {
    // The path inside a router will be the suffix only (e.g. '/debug' for
    // /api/listings/debug). Allow either the full path or any suffix.
    const tail = route.split('/').pop(); // 'debug-auth' or 'debug'
    const pattern = new RegExp(
      `(app|router)\\.(get|post)\\(['"][^'"]*${tail}['"],\\s*requireSuperAdmin,\\s*requireDebugEndpointsEnabled`,
    );
    const hit = Object.entries(sources).find(([, body]) => pattern.test(body));
    assert.ok(
      hit,
      `expected ${route} to be wired with requireSuperAdmin + requireDebugEndpointsEnabled in some server source file`,
    );
  }

  // The unauthenticated public endpoint must not exist anywhere in the tree.
  for (const [file, body] of Object.entries(sources)) {
    assert.doesNotMatch(body, /debug-auth-public/, `${file} must not contain the removed public debug endpoint`);
  }
});
