// Read-only eBay helper routes extracted from server/app.js. These all
// require an authenticated tenant (mounted under /api/ebay below the global
// authMiddleware) and a valid stored eBay session.
//
// Routes:
//   GET /policies            — list configured fulfillment/payment/return policies
//   GET /category-conditions — eBay-accepted condition IDs for a category
//   GET /categories          — top GetSuggestedCategories matches for a query
//   GET /settings            — auto-fetch the first policy + location ids
//
// XML-shaped Trading API calls go through tradingApiCall from services/ebay/client.js
// (ARCH-003b migration); REST policy calls still use axios directly because
// they aren't covered by the Trading wrapper.

const express = require('express');
const axios = require('axios');
const { getValidAccessToken } = require('../../ebayAuth');
const { tradingApiCall } = require('../../services/ebay/client');
const { buildGetCategoryFeaturesXml } = require('../../services/ebay/categories');
const { createDefaultRateLimiters } = require('../../middleware/rateLimit');

const EBAY_API_BASE = 'https://api.ebay.com';
const { ebayReadRateLimit } = createDefaultRateLimiters();

const router = express.Router();

router.get('/policies', ebayReadRateLimit, async (req, res) => {
  try {
    const token = await getValidAccessToken(req.companyId);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Language': 'en-US' };
    const params = { marketplace_id: 'EBAY_US' };
    const [fulfillRes, payRes, retRes] = await Promise.all([
      axios.get(`${EBAY_API_BASE}/sell/account/v1/fulfillment_policy`, { headers, params }).catch((e) => { console.error('[policies] fulfillment:', e.response?.data || e.message); return { data: {} }; }),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/payment_policy`, { headers, params }).catch((e) => { console.error('[policies] payment:', e.response?.data || e.message); return { data: {} }; }),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/return_policy`, { headers, params }).catch((e) => { console.error('[policies] return:', e.response?.data || e.message); return { data: {} }; }),
    ]);
    res.json({
      fulfillmentPolicies: (fulfillRes.data?.fulfillmentPolicies || []).map((p) => ({ id: p.fulfillmentPolicyId, name: p.name })),
      paymentPolicies: (payRes.data?.paymentPolicies || []).map((p) => ({ id: p.paymentPolicyId, name: p.name })),
      returnPolicies: (retRes.data?.returnPolicies || []).map((p) => ({ id: p.returnPolicyId, name: p.name })),
    });
  } catch (e) {
    console.error('[policies] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Returns the valid ConditionIDs for a given category (varies by category type)
router.get('/category-conditions', ebayReadRateLimit, async (req, res) => {
  const { categoryId } = req.query;
  if (!categoryId) return res.status(400).json({ error: 'categoryId required' });
  try {
    const token = await getValidAccessToken(req.companyId);
    const resp = await tradingApiCall({
      callName: 'GetCategoryFeatures',
      xmlBody: buildGetCategoryFeaturesXml(categoryId),
      token,
    });
    const conditions = [...resp.data.matchAll(/<Condition>\s*<ID>(\d+)<\/ID>\s*<DisplayName>(.*?)<\/DisplayName>/g)]
      .map((m) => ({ id: m[1], label: m[2] }));
    res.json({ conditions });
  } catch (e) {
    console.error('[category-conditions] error:', e.message);
    res.json({ conditions: [] }); // empty = client falls back to full list
  }
});

router.get('/categories', ebayReadRateLimit, async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    if (!query) return res.json([]);
    const token = await getValidAccessToken(req.companyId);
    const xmlBody = `<?xml version="1.0" encoding="utf-8"?><GetSuggestedCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents"><Query><![CDATA[${query}]]></Query></GetSuggestedCategoriesRequest>`;
    const resp = await tradingApiCall({
      callName: 'GetSuggestedCategories',
      xmlBody,
      token,
    });
    const matches = [...resp.data.matchAll(/<CategoryID>(\d+)<\/CategoryID>[\s\S]*?<CategoryName>(.*?)<\/CategoryName>/g)];
    res.json(matches.slice(0, 8).map((m) => ({ id: m[1], name: m[2] })));
  } catch (e) {
    console.error('[categories] error:', e.message);
    res.json([]);
  }
});

router.get('/settings', ebayReadRateLimit, async (req, res) => {
  try {
    const token = await getValidAccessToken(req.companyId);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Language': 'en-US' };
    const [fulfillmentRes, paymentRes, returnRes, locationRes] = await Promise.all([
      axios.get(`${EBAY_API_BASE}/sell/account/v1/fulfillment_policy`, { headers }).catch((e) => e.response || e),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/payment_policy`, { headers }).catch((e) => e.response || e),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/return_policy`, { headers }).catch((e) => e.response || e),
      axios.get(`${EBAY_API_BASE}/sell/inventory/v1/location`, { headers }).catch((e) => e.response || e),
    ]);
    if (fulfillmentRes.status !== 200 || paymentRes.status !== 200 || returnRes.status !== 200) {
      return res.status(400).json({ error: `eBay APIs rejected the request. Status: ${fulfillmentRes.status}` });
    }
    res.json({
      fulfillmentPolicy: fulfillmentRes.data?.fulfillmentPolicies?.[0]?.fulfillmentPolicyId || '',
      paymentPolicy: paymentRes.data?.paymentPolicies?.[0]?.paymentPolicyId || '',
      returnPolicy: returnRes.data?.returnPolicies?.[0]?.returnPolicyId || '',
      merchantLocation: locationRes.data?.locations?.[0]?.merchantLocationKey || '',
    });
  } catch (error) {
    console.error('Error fetching eBay settings:', error.message);
    res.status(500).json({ error: 'Failed to auto-fetch settings from eBay APIs' });
  }
});

module.exports = router;
