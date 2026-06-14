// UPC barcode lookup — proxies Open Food Facts then UPCItemDB (free tier).
// Extracted from server/app.js. Authenticated tenant required.

const express = require('express');
const axios = require('axios');

const router = express.Router();

router.get('/', async (req, res) => {
  const { upc } = req.query;
  if (!upc) return res.status(400).json({ error: 'upc query param required' });
  try {
    const offResp = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${upc}.json`, { timeout: 5000 });
    if (offResp.data?.status === 1 && offResp.data?.product) {
      const p = offResp.data.product;
      return res.json({
        title: p.product_name_en || p.product_name || '',
        brand: p.brands || '',
        category: p.categories_tags?.[0]?.replace('en:', '') || '',
        description: p.generic_name_en || p.generic_name || '',
        source: 'Open Food Facts',
      });
    }
    const upcResp = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, { timeout: 5000 });
    const item = upcResp.data?.items?.[0];
    if (item) {
      return res.json({
        title: item.title || '',
        brand: item.brand || '',
        category: item.category || '',
        description: item.description || '',
        source: 'UPC Item DB',
      });
    }
    res.json({ title: '', brand: '', category: '', description: '', source: null });
  } catch (e) {
    console.error('[barcode] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
