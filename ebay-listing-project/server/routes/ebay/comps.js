// Comparable-sales lookup and repricing-suggestion routes extracted from
// server/app.js. Mounted under /api (not /api/ebay) because one route is
// /api/reprice/suggestions; the other is /api/ebay/sold-comps.
//
// Both routes hit the eBay Browse API with an application-level OAuth
// token (Client Credentials flow) — see services/ebay/applicationToken.js.

const express = require('express');
const axios = require('axios');
const { getActiveListings } = require('../../listings');
const { getApplicationToken } = require('../../services/ebay/applicationToken');
const { BROWSE_API_URL } = require('../../services/ebay/client');
const { createDefaultRateLimiters } = require('../../middleware/rateLimit');

const { compsRateLimit } = createDefaultRateLimiters();

const router = express.Router();

router.get('/ebay/sold-comps', compsRateLimit, async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    if (!query) return res.json({ items: [], error: null });
    const token = await getApplicationToken();
    const resp = await axios.get(BROWSE_API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json',
      },
      params: { q: query, limit: 6, filter: 'buyingOptions:{FIXED_PRICE}', sort: 'price' },
    });
    const summaries = resp.data?.itemSummaries || [];
    res.json({
      items: summaries.map((item) => ({
        title: item.title || '',
        price: parseFloat(item.price?.value || '0').toFixed(2),
        currency: item.price?.currency || 'USD',
        condition: item.condition || '',
        url: item.itemWebUrl || '',
      })),
      error: null,
    });
  } catch (e) {
    const detail = e.response ? ` (HTTP ${e.response.status})` : '';
    console.error('[sold-comps] error:', e.message + detail);
    res.json({ items: [], error: e.message + detail });
  }
});

router.get('/reprice/suggestions', compsRateLimit, async (req, res) => {
  try {
    const token = await getApplicationToken();
    const active = await getActiveListings(req.companyId);
    if (active.length === 0) return res.json({ suggestions: [], analyzedCount: 0, flaggedCount: 0 });

    const now = Date.now();
    const suggestions = [];

    for (const listing of active) {
      try {
        const currentPrice = parseFloat((listing.priceRecommendation || '0').replace(/[^0-9.]/g, ''));
        if (!currentPrice || currentPrice <= 0) continue;
        const query = (listing.title || '').split(/\s+/).slice(0, 6).join(' ');
        if (!query) continue;
        const resp = await axios.get(BROWSE_API_URL, {
          headers: { Authorization: `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
          params: { q: query, limit: 10, filter: 'buyingOptions:{FIXED_PRICE}', sort: 'price' },
        });
        const prices = (resp.data?.itemSummaries || [])
          .map((s) => parseFloat(s.price?.value || '0'))
          .filter((p) => p > 0)
          .sort((a, b) => a - b);
        if (prices.length < 2) continue;
        const mid = Math.floor(prices.length / 2);
        const compMedian = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
        const compAvg = prices.reduce((s, p) => s + p, 0) / prices.length;
        const daysListed = Math.floor((now - (listing.createdAt || now)) / 86400000);
        const pctAboveMarket = ((currentPrice - compMedian) / compMedian) * 100;
        if (pctAboveMarket < 10) continue;
        const suggestedPrice = parseFloat((compMedian * 0.95).toFixed(2));
        let priority;
        if ((pctAboveMarket > 20 && daysListed > 30) || pctAboveMarket > 40) priority = 'high';
        else if ((pctAboveMarket > 10 && daysListed > 14) || pctAboveMarket > 20) priority = 'medium';
        else priority = 'low';
        const reason = `${prices.length} active comps — median $${compMedian.toFixed(2)}, avg $${compAvg.toFixed(2)}. Your price is ${pctAboveMarket.toFixed(0)}% above market median.`;
        suggestions.push({
          id: listing.id,
          ebayDraftId: listing.ebayDraftId || null,
          title: listing.title,
          image: (listing.images || [])[0] || null,
          currentPrice,
          suggestedPrice,
          compAvg: parseFloat(compAvg.toFixed(2)),
          compMedian: parseFloat(compMedian.toFixed(2)),
          compCount: prices.length,
          daysListed,
          priority,
          pctAboveMarket: parseFloat(pctAboveMarket.toFixed(1)),
          reason,
        });
      } catch { /* skip individual listing errors */ }
    }

    const order = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => order[a.priority] - order[b.priority] || b.pctAboveMarket - a.pctAboveMarket);
    res.json({ suggestions, analyzedCount: active.length, flaggedCount: suggestions.length });
  } catch (e) {
    console.error('[reprice] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
