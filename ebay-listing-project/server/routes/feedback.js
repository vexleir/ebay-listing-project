// Feedback (internal forum) routes extracted from server/app.js.
// Posts are global across companies — feedback goes to the superadmin/developer.
// Any authenticated user can post and reply; only superadmin changes status or
// deletes any post; authors can delete their own posts/replies.
//
// This router assumes the auth middleware has already populated req.user and
// req.companyId — it is mounted under /api/feedback below the global
// authMiddleware in app.js.

const crypto = require('crypto');
const express = require('express');
const feedbackStore = require('../feedback');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const posts = await feedbackStore.listPosts();
    res.json(posts);
  } catch (e) {
    console.error('[feedback] GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { title, message, images } = req.body || {};
    if (!title || !title.trim()) return res.status(400).json({ error: 'title required' });
    if (!message || !message.trim()) return res.status(400).json({ error: 'message required' });
    const now = Date.now();
    const post = {
      id: crypto.randomUUID(),
      title: String(title).trim().substring(0, 200),
      message: String(message).trim(),
      images: Array.isArray(images) ? images : [],
      status: 'not_started',
      authorId: req.user.userId,
      authorName: req.user.name || req.user.email,
      authorEmail: req.user.email,
      authorCompanyId: req.companyId,
      replies: [],
      createdAt: now,
      updatedAt: now,
    };
    await feedbackStore.createPost(post);
    res.json({ post });
  } catch (e) {
    console.error('[feedback] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const post = await feedbackStore.getPost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const updates = req.body.updates || {};
    const isAuthor = post.authorId === req.user.userId;
    const isAdmin = req.user.role === 'superadmin';
    // Only superadmin can change status; only author or admin can edit content
    if (updates.status !== undefined && !isAdmin) {
      return res.status(403).json({ error: 'Only admin can change status' });
    }
    if ((updates.title !== undefined || updates.message !== undefined || updates.images !== undefined) && !isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Only author or admin can edit content' });
    }
    updates.updatedAt = Date.now();
    await feedbackStore.updatePost(req.params.id, updates);
    res.json({ success: true });
  } catch (e) {
    console.error('[feedback] PUT error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const post = await feedbackStore.getPost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const isAuthor = post.authorId === req.user.userId;
    const isAdmin = req.user.role === 'superadmin';
    if (!isAuthor && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
    await feedbackStore.deletePost(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/replies', async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message || !message.trim()) return res.status(400).json({ error: 'message required' });
    const reply = {
      id: crypto.randomUUID(),
      message: String(message).trim(),
      authorId: req.user.userId,
      authorName: req.user.name || req.user.email,
      isAdmin: req.user.role === 'superadmin',
      createdAt: Date.now(),
    };
    await feedbackStore.addReply(req.params.id, reply);
    res.json({ reply });
  } catch (e) {
    console.error('[feedback] reply error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id/replies/:replyId', async (req, res) => {
  try {
    const post = await feedbackStore.getPost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const reply = (post.replies || []).find((r) => r.id === req.params.replyId);
    if (!reply) return res.status(404).json({ error: 'Reply not found' });
    const isAuthor = reply.authorId === req.user.userId;
    const isAdmin = req.user.role === 'superadmin';
    if (!isAuthor && !isAdmin) return res.status(403).json({ error: 'Forbidden' });
    await feedbackStore.deleteReply(req.params.id, req.params.replyId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
