// GET /api/auth/me — returns the authenticated user payload from the JWT.
// Mounted under /api/auth in app.js below the global authMiddleware.

const express = require('express');

const router = express.Router();

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
