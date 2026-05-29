// Image upload + background-removal routes extracted from server/app.js.
// Mounted under /api/images in app.js below the global authMiddleware.

const express = require('express');
const axios = require('axios');
const { uploadImage } = require('../cloudinary');
const { createDefaultRateLimiters } = require('../middleware/rateLimit');

const { imageRateLimit } = createDefaultRateLimiters();

const router = express.Router();

router.post('/upload', imageRateLimit, async (req, res) => {
  try {
    const { images } = req.body;
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ error: 'Cloudinary not configured on server' });
    }
    console.log(`[images/upload] Uploading ${images.length} image(s) to Cloudinary...`);
    const urls = await Promise.all(images.map((img) => uploadImage(img)));
    res.json({ urls });
  } catch (e) {
    // Cloudinary errors sometimes arrive without a `.message` (e.g.
    // `e.http_code` / `e.error` on the SDK error shape). Build a usable
    // string so the client never sees `{ error: undefined }` → "{}".
    const detail =
      (e && e.message)
      || (e && e.error && (e.error.message || (typeof e.error === 'string' ? e.error : null)))
      || (e && e.http_code ? `Cloudinary HTTP ${e.http_code}` : null)
      || 'Image upload failed (no detail returned)';
    console.error('[images/upload] error:', detail, e);
    res.status(500).json({ error: detail });
  }
});

router.post('/remove-bg', imageRateLimit, async (req, res) => {
  const { imageBase64 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) return res.status(501).json({ error: 'REMOVEBG_API_KEY not configured on server' });
  try {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('image_file_b64', imageBase64);
    form.append('size', 'auto');
    const response = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
      headers: { ...form.getHeaders(), 'X-Api-Key': apiKey },
      responseType: 'arraybuffer',
      timeout: 30000,
    });
    const resultBase64 = Buffer.from(response.data).toString('base64');
    res.json({ imageBase64: `data:image/png;base64,${resultBase64}` });
  } catch (e) {
    const detail = e.response?.data ? Buffer.from(e.response.data).toString('utf8') : e.message;
    console.error('[remove-bg] error:', detail);
    res.status(500).json({ error: detail || e.message });
  }
});

module.exports = router;
