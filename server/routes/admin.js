// Admin (superadmin-only) routes extracted from server/app.js.
// Mounted under /api/admin in app.js below the global authMiddleware.
// requireSuperAdmin is applied at the router level so every route inherits it.

const express = require('express');
const { requireSuperAdmin } = require('../auth');
const {
  createCompany,
  getCompanies,
  updateCompany,
  deleteCompany,
  createUser,
  getUserByEmail,
  getUsers,
  updateUser,
  deleteUser,
} = require('../users');

const router = express.Router();

router.use(requireSuperAdmin);

// ─── Companies ────────────────────────────────────────────────────────────

router.get('/companies', async (req, res) => {
  try {
    res.json(await getCompanies());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/companies', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    res.json(await createCompany(name));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/companies/:id', async (req, res) => {
  try {
    await updateCompany(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/companies/:id', async (req, res) => {
  try {
    await deleteCompany(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Users ────────────────────────────────────────────────────────────────

router.get('/users', async (req, res) => {
  try {
    const { companyId } = req.query;
    res.json(await getUsers(companyId || null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    const { companyId, email, password, name, role } = req.body;
    if (!companyId || !email || !password || !name) {
      return res.status(400).json({ error: 'companyId, email, password, name required' });
    }
    const existing = await getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    res.json(await createUser({ companyId, email, password, name, role }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/users/:id', async (req, res) => {
  try {
    await updateUser(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/users/:id', async (req, res) => {
  try {
    await deleteUser(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
