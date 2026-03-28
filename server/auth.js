const jwt = require('jsonwebtoken');

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET not set in environment');
  return s;
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: '30d' });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    req.user = payload;
    req.companyId = payload.companyId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Forbidden: superadmin only' });
  }
  next();
}

module.exports = { signToken, verifyToken, authMiddleware, requireSuperAdmin };
