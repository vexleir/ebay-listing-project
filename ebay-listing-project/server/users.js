const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getDb } = require('./db');

// ─── Companies ───────────────────────────────────────────────────────────────

async function createCompany(name) {
  const db = await getDb();
  const company = {
    id: crypto.randomUUID(),
    name,
    active: true,
    createdAt: new Date(),
  };
  await db.collection('companies').insertOne(company);
  return company;
}

async function getCompanies() {
  const db = await getDb();
  return db.collection('companies').find({}, { projection: { _id: 0 } }).sort({ createdAt: 1 }).toArray();
}

async function getCompanyById(id) {
  const db = await getDb();
  return db.collection('companies').findOne({ id }, { projection: { _id: 0 } });
}

async function updateCompany(id, updates) {
  const db = await getDb();
  const { id: _id, ...safe } = updates;
  await db.collection('companies').updateOne({ id }, { $set: safe });
}

async function deleteCompany(id) {
  const db = await getDb();
  await db.collection('companies').deleteOne({ id });
}

// ─── Users ────────────────────────────────────────────────────────────────────

async function createUser({ companyId, email, password, name, role = 'user' }) {
  const db = await getDb();
  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: crypto.randomUUID(),
    companyId,
    email: email.toLowerCase().trim(),
    passwordHash,
    name,
    role,
    active: true,
    createdAt: new Date(),
  };
  await db.collection('users').insertOne(user);
  const { passwordHash: _, ...safeUser } = user;
  return safeUser;
}

async function getUserByEmail(email) {
  const db = await getDb();
  return db.collection('users').findOne({ email: email.toLowerCase().trim() });
}

async function getUserById(id) {
  const db = await getDb();
  const user = await db.collection('users').findOne({ id });
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

async function getUsers(companyId) {
  const db = await getDb();
  const query = companyId ? { companyId } : {};
  const users = await db.collection('users').find(query, { projection: { _id: 0, passwordHash: 0 } }).sort({ createdAt: 1 }).toArray();
  return users;
}

async function updateUser(id, updates) {
  const db = await getDb();
  const { id: _id, passwordHash: _ph, ...safe } = updates;
  if (safe.password) {
    safe.passwordHash = await bcrypt.hash(safe.password, 12);
    delete safe.password;
  }
  if (safe.email) safe.email = safe.email.toLowerCase().trim();
  await db.collection('users').updateOne({ id }, { $set: safe });
}

async function deleteUser(id) {
  const db = await getDb();
  await db.collection('users').deleteOne({ id });
}

async function verifyPassword(email, password) {
  const user = await getUserByEmail(email);
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

module.exports = {
  createCompany, getCompanies, getCompanyById, updateCompany, deleteCompany,
  createUser, getUserByEmail, getUserById, getUsers, updateUser, deleteUser, verifyPassword,
};
