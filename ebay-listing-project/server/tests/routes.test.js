// Integration tests for the extracted route modules. These exercise the
// real Express routers against in-memory fakes for the data stores so we
// avoid mongo entirely. The goal is to lock in:
//   - feedback router authorization rules (author vs admin vs other)
//   - admin router superadmin gate
//   - settings router happy-path responses

const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-routes';

const express = require('express');
const { signToken, authMiddleware } = require('../auth');

// ─── in-memory fakes ──────────────────────────────────────────────────────

const Module = require('module');
const originalRequire = Module.prototype.require;

const fakeFeedbackStore = (() => {
  const posts = new Map();
  return {
    listPosts: async () => Array.from(posts.values()),
    getPost: async (id) => posts.get(id) || null,
    createPost: async (post) => { posts.set(post.id, post); return post; },
    updatePost: async (id, updates) => {
      const p = posts.get(id);
      if (p) posts.set(id, { ...p, ...updates });
    },
    deletePost: async (id) => { posts.delete(id); },
    addReply: async (id, reply) => {
      const p = posts.get(id);
      if (p) { p.replies = [...(p.replies || []), reply]; posts.set(id, p); }
    },
    deleteReply: async (id, replyId) => {
      const p = posts.get(id);
      if (p) { p.replies = (p.replies || []).filter((r) => r.id !== replyId); posts.set(id, p); }
    },
    __reset: () => posts.clear(),
  };
})();

const fakeUsersModule = (() => {
  const companies = new Map();
  const users = new Map();
  return {
    createCompany: async (name) => {
      const id = `co_${companies.size + 1}`;
      const c = { id, name };
      companies.set(id, c);
      return c;
    },
    getCompanies: async () => Array.from(companies.values()),
    getCompanyById: async (id) => companies.get(id) || null,
    updateCompany: async (id, updates) => {
      const c = companies.get(id);
      if (c) companies.set(id, { ...c, ...updates });
    },
    deleteCompany: async (id) => { companies.delete(id); },
    createUser: async ({ companyId, email, password, name, role }) => {
      const id = `u_${users.size + 1}`;
      const u = { id, companyId, email, name, role: role || 'user' };
      users.set(id, u);
      return u;
    },
    getUserByEmail: async (email) => Array.from(users.values()).find((u) => u.email === email) || null,
    getUserById: async (id) => users.get(id) || null,
    getUsers: async () => Array.from(users.values()),
    updateUser: async (id, updates) => {
      const u = users.get(id);
      if (u) users.set(id, { ...u, ...updates });
    },
    deleteUser: async (id) => { users.delete(id); },
    verifyPassword: async () => null,
    __reset: () => { companies.clear(); users.clear(); },
  };
})();

const fakeListingsModule = {
  getSettings: async () => ({ sellerZip: '90210' }),
  saveSettings: async () => {},
  getTokenUsage: async () => ({ promptTokens: 1, completionTokens: 2, totalTokens: 3, callCount: 1 }),
  // Unused by these tests but present so require() doesn't fail.
  getListings: async () => [],
  createListing: async () => {},
  updateListing: async () => {},
  deleteListing: async () => {},
  getAllListingsMeta: async () => [],
  getActiveListings: async () => [],
  incrementTokenUsage: async () => {},
  getAiDailyQuotaStatus: async () => ({ limit: 100, totalTokens: 0, remainingTokens: 100, resetAt: '', day: '' }),
};

Module.prototype.require = function patchedRequire(name) {
  if (name === '../feedback') return fakeFeedbackStore;
  if (name === '../users') return fakeUsersModule;
  if (name === '../listings') return fakeListingsModule;
  return originalRequire.apply(this, arguments);
};

// Now load the routers (after the patch is installed)
const feedbackRouter = require('../routes/feedback');
const adminRouter = require('../routes/admin');
const settingsRouter = require('../routes/settings');

Module.prototype.require = originalRequire;

// ─── test harness ────────────────────────────────────────────────────────

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/', authMiddleware);
  app.use('/api/feedback', feedbackRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', settingsRouter);
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

const userToken = () => signToken({ userId: 'u1', companyId: 'c1', role: 'user', email: 'u1@x.com', name: 'User One' });
const otherUserToken = () => signToken({ userId: 'u2', companyId: 'c1', role: 'user', email: 'u2@x.com', name: 'User Two' });
const adminToken = () => signToken({ userId: 'a1', companyId: 'c1', role: 'superadmin', email: 'a@x.com', name: 'Admin' });

// ─── settings router ─────────────────────────────────────────────────────

test('GET /api/settings returns settings for the authenticated company', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/settings', { token: userToken() });
    assert.equal(res.status, 200);
    assert.equal(res.body.sellerZip, '90210');
  } finally { await stopServer(server); }
});

test('GET /api/token-usage returns the usage shape', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/token-usage', { token: userToken() });
    assert.equal(res.status, 200);
    assert.equal(res.body.totalTokens, 3);
  } finally { await stopServer(server); }
});

test('GET /api/settings requires auth', async () => {
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'GET', '/api/settings');
    assert.equal(res.status, 401);
  } finally { await stopServer(server); }
});

// ─── feedback router ─────────────────────────────────────────────────────

test('feedback router: any authenticated user can create a post', async () => {
  fakeFeedbackStore.__reset();
  const server = await startServer(buildApp());
  try {
    const res = await request(server, 'POST', '/api/feedback', {
      token: userToken(),
      body: { title: 'Bug', message: 'Something broke' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.post.title, 'Bug');
    assert.equal(res.body.post.authorId, 'u1');
    assert.equal(res.body.post.status, 'not_started');
  } finally { await stopServer(server); }
});

test('feedback router: only superadmin can change status', async () => {
  fakeFeedbackStore.__reset();
  const server = await startServer(buildApp());
  try {
    const created = await request(server, 'POST', '/api/feedback', {
      token: userToken(),
      body: { title: 'X', message: 'Y' },
    });
    const id = created.body.post.id;

    // Non-admin tries to flip status
    const denied = await request(server, 'PUT', `/api/feedback/${id}`, {
      token: userToken(),
      body: { updates: { status: 'in_progress' } },
    });
    assert.equal(denied.status, 403);
    assert.match(denied.body.error, /admin can change status/i);

    // Admin succeeds
    const allowed = await request(server, 'PUT', `/api/feedback/${id}`, {
      token: adminToken(),
      body: { updates: { status: 'in_progress' } },
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.success, true);
  } finally { await stopServer(server); }
});

test('feedback router: non-author non-admin cannot edit content', async () => {
  fakeFeedbackStore.__reset();
  const server = await startServer(buildApp());
  try {
    const created = await request(server, 'POST', '/api/feedback', {
      token: userToken(),
      body: { title: 'X', message: 'Y' },
    });
    const id = created.body.post.id;

    const res = await request(server, 'PUT', `/api/feedback/${id}`, {
      token: otherUserToken(),
      body: { updates: { title: 'hijacked' } },
    });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /author or admin/i);
  } finally { await stopServer(server); }
});

test('feedback router: missing title or message returns 400', async () => {
  fakeFeedbackStore.__reset();
  const server = await startServer(buildApp());
  try {
    const noTitle = await request(server, 'POST', '/api/feedback', {
      token: userToken(),
      body: { message: 'Y' },
    });
    assert.equal(noTitle.status, 400);

    const noMessage = await request(server, 'POST', '/api/feedback', {
      token: userToken(),
      body: { title: 'X' },
    });
    assert.equal(noMessage.status, 400);
  } finally { await stopServer(server); }
});

test('feedback router: replies are author-or-admin-only to delete', async () => {
  fakeFeedbackStore.__reset();
  const server = await startServer(buildApp());
  try {
    const created = await request(server, 'POST', '/api/feedback', {
      token: userToken(),
      body: { title: 'X', message: 'Y' },
    });
    const postId = created.body.post.id;

    const reply = await request(server, 'POST', `/api/feedback/${postId}/replies`, {
      token: userToken(),
      body: { message: 'I made the reply' },
    });
    assert.equal(reply.status, 200);
    const replyId = reply.body.reply.id;

    // Other user cannot delete the reply
    const denied = await request(server, 'DELETE', `/api/feedback/${postId}/replies/${replyId}`, {
      token: otherUserToken(),
    });
    assert.equal(denied.status, 403);

    // Admin can delete
    const allowed = await request(server, 'DELETE', `/api/feedback/${postId}/replies/${replyId}`, {
      token: adminToken(),
    });
    assert.equal(allowed.status, 200);
  } finally { await stopServer(server); }
});

// ─── admin router ────────────────────────────────────────────────────────

test('admin router: rejects non-superadmin tokens with 403 on every route', async () => {
  fakeUsersModule.__reset();
  const server = await startServer(buildApp());
  try {
    for (const [method, path] of [
      ['GET', '/api/admin/companies'],
      ['POST', '/api/admin/companies'],
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users'],
    ]) {
      const res = await request(server, method, path, { token: userToken(), body: { name: 'x' } });
      assert.equal(res.status, 403, `${method} ${path} should be forbidden for non-superadmin`);
    }
  } finally { await stopServer(server); }
});

test('admin router: superadmin can create and list companies', async () => {
  fakeUsersModule.__reset();
  const server = await startServer(buildApp());
  try {
    const created = await request(server, 'POST', '/api/admin/companies', {
      token: adminToken(),
      body: { name: 'Acme' },
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.name, 'Acme');

    const listed = await request(server, 'GET', '/api/admin/companies', { token: adminToken() });
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].name, 'Acme');
  } finally { await stopServer(server); }
});

test('admin router: POST /admin/users requires the full payload and rejects duplicate emails', async () => {
  fakeUsersModule.__reset();
  const server = await startServer(buildApp());
  try {
    const missing = await request(server, 'POST', '/api/admin/users', {
      token: adminToken(),
      body: { email: 'x@x.com' },
    });
    assert.equal(missing.status, 400);

    const created = await request(server, 'POST', '/api/admin/users', {
      token: adminToken(),
      body: { companyId: 'c1', email: 'dup@x.com', password: 'p', name: 'N' },
    });
    assert.equal(created.status, 200);

    const dup = await request(server, 'POST', '/api/admin/users', {
      token: adminToken(),
      body: { companyId: 'c1', email: 'dup@x.com', password: 'p', name: 'N' },
    });
    assert.equal(dup.status, 409);
  } finally { await stopServer(server); }
});
