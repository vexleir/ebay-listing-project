const { getDb } = require('./db');

// Feedback posts are global (not scoped to company) — they're reports about the
// app itself going to the developer/superadmin.
const COLLECTION = 'feedback';

const VALID_STATUSES = new Set([
  'not_started', 'under_review', 'pending', 'implemented', 'cancelled',
]);

function stripBase64Images(images) {
  if (!Array.isArray(images)) return [];
  return images.filter(img => typeof img === 'string' && img.startsWith('http'));
}

async function listPosts() {
  const db = await getDb();
  return db.collection(COLLECTION).find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
}

async function getPost(id) {
  const db = await getDb();
  return db.collection(COLLECTION).findOne({ id }, { projection: { _id: 0 } });
}

async function createPost(post) {
  const db = await getDb();
  const { _id, ...doc } = post;
  doc.images = stripBase64Images(post.images);
  doc.replies = Array.isArray(post.replies) ? post.replies : [];
  if (!VALID_STATUSES.has(doc.status)) doc.status = 'not_started';
  await db.collection(COLLECTION).insertOne(doc);
}

async function updatePost(id, updates) {
  const db = await getDb();
  const { _id, replies, ...safeUpdates } = updates;
  if (safeUpdates.status && !VALID_STATUSES.has(safeUpdates.status)) {
    throw new Error(`Invalid status: ${safeUpdates.status}`);
  }
  if (safeUpdates.images !== undefined) {
    safeUpdates.images = stripBase64Images(safeUpdates.images);
  }
  await db.collection(COLLECTION).updateOne({ id }, { $set: safeUpdates });
}

async function deletePost(id) {
  const db = await getDb();
  await db.collection(COLLECTION).deleteOne({ id });
}

async function addReply(id, reply) {
  const db = await getDb();
  await db.collection(COLLECTION).updateOne(
    { id },
    { $push: { replies: reply }, $set: { updatedAt: Date.now() } }
  );
}

async function deleteReply(id, replyId) {
  const db = await getDb();
  await db.collection(COLLECTION).updateOne(
    { id },
    { $pull: { replies: { id: replyId } }, $set: { updatedAt: Date.now() } }
  );
}

module.exports = {
  VALID_STATUSES,
  listPosts, getPost, createPost, updatePost, deletePost,
  addReply, deleteReply,
};
