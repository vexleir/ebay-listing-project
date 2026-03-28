require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { generateListing, generateListingFromUrls } = require('./ai');
const { getAuthUrl, exchangeCodeForToken, getValidAccessToken, hasValidSession, getTokenExpiry } = require('./ebayAuth');
const { getListings, createListing, updateListing, deleteListing, getAllListingsMeta, getActiveListings, getSettings, saveSettings, incrementTokenUsage, getTokenUsage } = require('./listings');
const { uploadImage } = require('./cloudinary');
const { getDb } = require('./db');
const { signToken, authMiddleware, requireSuperAdmin } = require('./auth');
const {
  createCompany, getCompanies, getCompanyById, updateCompany, deleteCompany,
  createUser, getUserByEmail, getUserById, getUsers, updateUser, deleteUser, verifyPassword,
} = require('./users');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;
const EBAY_API_BASE = 'https://api.ebay.com';

// ─── Public routes (no auth required) ────────────────────────────────────────

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  try {
    const user = await verifyPassword(email, password);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const token = signToken({
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
      email: user.email,
      name: user.name,
    });
    res.json({ token, user: { id: user.id, companyId: user.companyId, role: user.role, email: user.email, name: user.name } });
  } catch (e) {
    console.error('[login] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ebay/callback — exempt from auth because eBay redirects here directly
app.get('/api/ebay/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('No authorization code provided.');
  try {
    // Decode companyId from state param
    const companyId = state ? Buffer.from(state, 'base64').toString('utf8') : 'default';
    await exchangeCodeForToken(code, companyId);
    res.redirect('/');
  } catch (error) {
    console.error('OAuth Callback Error:', error.message);
    res.status(500).send('Failed to authenticate with eBay.');
  }
});

// ─── Auth middleware — all /api/* routes below this require a valid JWT ──────
app.use('/api/', authMiddleware);

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

app.get('/api/token-usage', async (req, res) => {
  try {
    res.json(await getTokenUsage(req.companyId));
  } catch (e) {
    res.json({ promptTokens: 0, completionTokens: 0, totalTokens: 0, callCount: 0 });
  }
});

app.get('/api/settings', async (req, res) => {
  try {
    res.json(await getSettings(req.companyId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    await saveSettings(req.companyId, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── eBay Auth ────────────────────────────────────────────────────────────────

app.get('/api/ebay/policies', async (req, res) => {
  try {
    const token = await getValidAccessToken(req.companyId);
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Language': 'en-US' };
    const params = { marketplace_id: 'EBAY_US' };
    const [fulfillRes, payRes, retRes] = await Promise.all([
      axios.get(`${EBAY_API_BASE}/sell/account/v1/fulfillment_policy`, { headers, params }).catch(e => { console.error('[policies] fulfillment:', e.response?.data || e.message); return { data: {} }; }),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/payment_policy`, { headers, params }).catch(e => { console.error('[policies] payment:', e.response?.data || e.message); return { data: {} }; }),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/return_policy`, { headers, params }).catch(e => { console.error('[policies] return:', e.response?.data || e.message); return { data: {} }; }),
    ]);
    res.json({
      fulfillmentPolicies: (fulfillRes.data?.fulfillmentPolicies || []).map(p => ({ id: p.fulfillmentPolicyId, name: p.name })),
      paymentPolicies: (payRes.data?.paymentPolicies || []).map(p => ({ id: p.paymentPolicyId, name: p.name })),
      returnPolicies: (retRes.data?.returnPolicies || []).map(p => ({ id: p.returnPolicyId, name: p.name })),
    });
  } catch (e) {
    console.error('[policies] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ebay/revise', async (req, res) => {
  const { itemId, newPrice, newTitle } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    const token = await getValidAccessToken(req.companyId);
    const priceXml = newPrice ? `<StartPrice currencyID="USD">${parseFloat(newPrice).toFixed(2)}</StartPrice>` : '';
    const titleXml = newTitle ? `<Title><![CDATA[${String(newTitle).substring(0, 80)}]]></Title>` : '';
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${itemId}</ItemID>
    ${titleXml}
    ${priceXml}
  </Item>
</ReviseFixedPriceItemRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    if (resp.data.includes('<Ack>Failure</Ack>')) {
      const err = resp.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Unknown error';
      return res.status(400).json({ error: err });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[revise] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ebay/end-listing', async (req, res) => {
  const { itemId, reason } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    const token = await getValidAccessToken(req.companyId);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <EndingReason>${reason || 'NotAvailable'}</EndingReason>
</EndFixedPriceItemRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'EndFixedPriceItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    if (resp.data.includes('<Ack>Failure</Ack>')) {
      const err = resp.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Unknown error';
      return res.status(400).json({ error: err });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[end-listing] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ebay/token-info', async (req, res) => {
  try {
    res.json(await getTokenExpiry(req.companyId));
  } catch (e) {
    res.json({ refresh_token_expires_at: null });
  }
});

app.get('/api/ebay/auth-status', async (req, res) => {
  try {
    const connected = await hasValidSession(req.companyId);
    res.json({ connected });
  } catch (error) {
    console.error('[auth-status] error:', error.message);
    res.json({ connected: false });
  }
});

app.get('/api/ebay/auth-url', (req, res) => {
  try {
    const url = getAuthUrl(req.companyId);
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─── Listings ─────────────────────────────────────────────────────────────────

app.get('/api/listings', async (req, res) => {
  try {
    const status = req.query.status || 'staged';
    const listings = await getListings(req.companyId, status);
    console.log(`[listings] GET company=${req.companyId} status=${status} -> ${listings.length} results`);
    res.json(listings);
  } catch (e) {
    console.error('[listings] GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/listings', async (req, res) => {
  try {
    const listing = req.body.listing;
    console.log(`[listings] POST company=${req.companyId} id=${listing?.id} title=${listing?.title?.substring(0, 40)}`);
    await createListing(req.companyId, listing);
    res.json({ success: true });
  } catch (e) {
    console.error('[listings] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/listings/:id', async (req, res) => {
  try {
    await updateListing(req.companyId, req.params.id, req.body.updates);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/listings/debug', async (req, res) => {
  try {
    const all = await getAllListingsMeta(req.companyId);
    res.json({ total: all.length, items: all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/listings/:id', async (req, res) => {
  try {
    await deleteListing(req.companyId, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Images ───────────────────────────────────────────────────────────────────

app.post('/api/images/upload', async (req, res) => {
  try {
    const { images } = req.body;
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ error: 'Cloudinary not configured on server' });
    }
    console.log(`[images/upload] Uploading ${images.length} image(s) to Cloudinary...`);
    const urls = await Promise.all(images.map(img => uploadImage(img)));
    res.json({ urls });
  } catch (e) {
    console.error('[images/upload] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/images/remove-bg', async (req, res) => {
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
      timeout: 30000
    });
    const resultBase64 = Buffer.from(response.data).toString('base64');
    res.json({ imageBase64: `data:image/png;base64,${resultBase64}` });
  } catch (e) {
    const detail = e.response?.data ? Buffer.from(e.response.data).toString('utf8') : e.message;
    console.error('[remove-bg] error:', detail);
    res.status(500).json({ error: detail || e.message });
  }
});

// ─── AI Generation ────────────────────────────────────────────────────────────

app.post('/api/generate', async (req, res) => {
  try {
    const { imageParts, instructions } = req.body;
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_KEY_HERE') {
      return res.status(500).json({ error: 'Server missing GEMINI_API_KEY.' });
    }
    const result = await generateListing(imageParts, instructions, process.env.GEMINI_API_KEY);
    if (result.tokenUsage) {
      incrementTokenUsage(req.companyId, result.tokenUsage.promptTokens, result.tokenUsage.completionTokens).catch(() => {});
    }
    res.json(result);
  } catch (error) {
    console.error('AI Generation Error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to generate AI listing' });
  }
});

app.post('/api/generate-from-urls', async (req, res) => {
  try {
    const { imageUrls, instructions } = req.body;
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
    const result = await generateListingFromUrls(imageUrls || [], instructions || '', process.env.GEMINI_API_KEY);
    if (result.tokenUsage) {
      incrementTokenUsage(req.companyId, result.tokenUsage.promptTokens, result.tokenUsage.completionTokens).catch(() => {});
    }
    res.json(result);
  } catch (e) {
    console.error('[generate-from-urls] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── eBay API helpers ─────────────────────────────────────────────────────────

app.get('/api/ebay/categories', async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    if (!query) return res.json([]);
    const token = await getValidAccessToken(req.companyId);
    const xml = `<?xml version="1.0" encoding="utf-8"?><GetSuggestedCategoriesRequest xmlns="urn:ebay:apis:eBLBaseComponents"><Query><![CDATA[${query}]]></Query></GetSuggestedCategoriesRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'GetSuggestedCategories', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    const matches = [...resp.data.matchAll(/<CategoryID>(\d+)<\/CategoryID>[\s\S]*?<CategoryName>(.*?)<\/CategoryName>/g)];
    res.json(matches.slice(0, 8).map(m => ({ id: m[1], name: m[2] })));
  } catch (e) {
    console.error('[categories] error:', e.message);
    res.json([]);
  }
});

// In-memory cache for application-level OAuth token (Client Credentials flow)
let _appToken = null;
let _appTokenExpiry = 0;

async function getApplicationToken() {
  if (_appToken && Date.now() < _appTokenExpiry) return _appToken;
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not set');
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'https://api.ebay.com/oauth/api_scope');
  const resp = await axios.post('https://api.ebay.com/identity/v1/oauth2/token', params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${authHeader}` }
  });
  _appToken = resp.data.access_token;
  _appTokenExpiry = Date.now() + (resp.data.expires_in * 1000) - 60000;
  return _appToken;
}

app.get('/api/ebay/sold-comps', async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    if (!query) return res.json({ items: [], error: null });
    const token = await getApplicationToken();
    const resp = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
      headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US', 'Content-Type': 'application/json' },
      params: { q: query, limit: 6, filter: 'buyingOptions:{FIXED_PRICE}', sort: 'price' }
    });
    const summaries = resp.data?.itemSummaries || [];
    res.json({
      items: summaries.map(item => ({
        title: item.title || '',
        price: parseFloat(item.price?.value || '0').toFixed(2),
        currency: item.price?.currency || 'USD',
        condition: item.condition || '',
        url: item.itemWebUrl || ''
      })),
      error: null
    });
  } catch (e) {
    const detail = e.response ? ` (HTTP ${e.response.status})` : '';
    console.error('[sold-comps] error:', e.message + detail);
    res.json({ items: [], error: e.message + detail });
  }
});

app.get('/api/reprice/suggestions', async (req, res) => {
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
        const resp = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
          headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
          params: { q: query, limit: 10, filter: 'buyingOptions:{FIXED_PRICE}', sort: 'price' }
        });
        const prices = (resp.data?.itemSummaries || []).map(s => parseFloat(s.price?.value || '0')).filter(p => p > 0).sort((a, b) => a - b);
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
        suggestions.push({ id: listing.id, ebayDraftId: listing.ebayDraftId || null, title: listing.title, image: (listing.images || [])[0] || null, currentPrice, suggestedPrice, compAvg: parseFloat(compAvg.toFixed(2)), compMedian: parseFloat(compMedian.toFixed(2)), compCount: prices.length, daysListed, priority, pctAboveMarket: parseFloat(pctAboveMarket.toFixed(1)), reason });
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

app.get('/api/source/analyze', async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    const askingPrice = parseFloat(req.query.askingPrice || '0');
    if (!query) return res.status(400).json({ error: 'query required' });
    const token = await getApplicationToken();
    const resp = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
      headers: { 'Authorization': `Bearer ${token}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' },
      params: { q: query, limit: 12, filter: 'buyingOptions:{FIXED_PRICE}', sort: 'price' }
    });
    const summaries = resp.data?.itemSummaries || [];
    const prices = summaries.map(s => parseFloat(s.price?.value || '0')).filter(p => p > 0).sort((a, b) => a - b);
    if (prices.length === 0) {
      return res.json({ query, comps: [], stats: null, recommendation: null, reason: 'No active eBay listings found for this search. Try different keywords.', error: null });
    }
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const mid = Math.floor(prices.length / 2);
    const median = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
    const targetSellPrice = median * 0.95;
    const ebayFee = targetSellPrice * 0.1325 + 0.30;
    const netProfit = askingPrice > 0 ? targetSellPrice - askingPrice - ebayFee : null;
    const roi = (netProfit !== null && askingPrice > 0) ? (netProfit / askingPrice) * 100 : null;
    let recommendation = null;
    let reason = 'Enter an asking price to get a buy recommendation.';
    if (netProfit !== null && roi !== null) {
      if (roi >= 100 && netProfit >= 15) { recommendation = 'buy'; reason = `Strong market at $${median.toFixed(2)} median. Est. net $${netProfit.toFixed(2)} after eBay fees — ${roi.toFixed(0)}% ROI. Buy with confidence.`; }
      else if (roi >= 40 && netProfit >= 8) { recommendation = 'consider'; reason = `Decent margin — est. net $${netProfit.toFixed(2)} (${roi.toFixed(0)}% ROI). Verify condition carefully before buying.`; }
      else if (netProfit > 0) { recommendation = 'pass'; reason = `Thin margin after eBay fees — est. net only $${netProfit.toFixed(2)} (${roi.toFixed(0)}% ROI) at this asking price. Negotiate down or skip.`; }
      else { recommendation = 'pass'; reason = `Asking price is too high — would lose $${Math.abs(netProfit).toFixed(2)} after eBay fees at current market prices.`; }
    }
    res.json({ query, comps: summaries.slice(0, 8).map(s => ({ title: s.title || '', price: parseFloat(s.price?.value || '0').toFixed(2), condition: s.condition || '', url: s.itemWebUrl || '' })), stats: { count: prices.length, avg: parseFloat(avg.toFixed(2)), median: parseFloat(median.toFixed(2)), min: parseFloat(prices[0].toFixed(2)), max: parseFloat(prices[prices.length - 1].toFixed(2)) }, askingPrice, targetSellPrice: parseFloat(targetSellPrice.toFixed(2)), ebayFee: parseFloat(ebayFee.toFixed(2)), netProfit: netProfit !== null ? parseFloat(netProfit.toFixed(2)) : null, roi: roi !== null ? parseFloat(roi.toFixed(1)) : null, recommendation, reason, error: null });
  } catch (e) {
    console.error('[source/analyze] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ebay/settings', async (req, res) => {
  try {
    const token = await getValidAccessToken(req.companyId);
    const headers = { 'Authorization': `Bearer ${token}`, 'Content-Language': 'en-US' };
    const [fulfillmentRes, paymentRes, returnRes, locationRes] = await Promise.all([
      axios.get(`${EBAY_API_BASE}/sell/account/v1/fulfillment_policy`, { headers }).catch(e => e.response || e),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/payment_policy`, { headers }).catch(e => e.response || e),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/return_policy`, { headers }).catch(e => e.response || e),
      axios.get(`${EBAY_API_BASE}/sell/inventory/v1/location`, { headers }).catch(e => e.response || e)
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

app.get('/api/ebay/listing-stats', async (req, res) => {
  const { itemId } = req.query;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    const token = await getValidAccessToken(req.companyId);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <IncludeWatchCount>true</IncludeWatchCount>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    const body = resp.data;
    const get = (tag) => { const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`); const x = r.exec(body); return x ? x[1].trim() : null; };
    res.json({ watchCount: get('WatchCount') || '0', hitCount: get('HitCount') || '0', viewCount: get('ViewItemURLForNaturalSearch') ? get('HitCount') : '0', timeLeft: get('TimeLeft') || '', quantity: get('Quantity') || '', quantitySold: get('QuantitySold') || '0' });
  } catch (e) {
    console.error('[listing-stats] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ebay/sold-items', async (req, res) => {
  try {
    const token = await getValidAccessToken(req.companyId);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <SoldList>
    <Include>true</Include>
    <DurationInDays>30</DurationInDays>
    <Pagination><EntriesPerPage>50</EntriesPerPage><PageNumber>1</PageNumber></Pagination>
  </SoldList>
  <HideVariations>true</HideVariations>
</GetMyeBaySellingRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    const body = resp.data;
    const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
    const items = [];
    let m;
    while ((m = itemRegex.exec(body)) !== null) {
      const block = m[1];
      const get = (tag) => { const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`); const x = r.exec(block); return x ? x[1].trim() : ''; };
      items.push({ itemId: get('ItemID'), title: get('Title'), soldPrice: get('CurrentPrice') || get('SalePrice') || '', soldDate: get('LastModifiedTime') || '', quantitySold: get('QuantitySold') || '1' });
    }
    res.json({ items });
  } catch (e) {
    console.error('[sold-items] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

function getConditionId(conditionStr) {
  const s = (conditionStr || '').toLowerCase();
  if (s.includes('for parts') || s.includes('not working') || s.includes('parts only')) return '7000';
  if (s.includes('acceptable') || s.includes('heavily worn') || s.includes('heavy wear')) return '6000';
  if (s.includes('good') && !s.includes('very good') && !s.includes('like new')) return '5000';
  if (s.includes('very good')) return '4000';
  if (s.includes('like new') || s.includes('mint') || s.includes('open box') || s.includes('open-box')) return '2500';
  if (s.includes('seller refurbished') || s.includes('refurbished') || s.includes('refurb')) return '2500';
  if (s.includes('certified refurbished') || s.includes('manufacturer refurbished')) return '2000';
  if (s.includes('new other')) return '1500';
  if (s.includes('new') && !s.includes('like')) return '1000';
  return '3000';
}

app.post('/api/ebay/draft', async (req, res) => {
  const { listing, overrideCategoryId, overrideConditionId, overrideFulfillmentPolicyId } = req.body;
  const userSettings = await getSettings(req.companyId).catch(() => ({}));
  const config = {
    fulfillmentPolicy: overrideFulfillmentPolicyId || userSettings.defaultFulfillmentPolicyId || process.env.EBAY_FULFILLMENT_POLICY_ID,
    paymentPolicy: userSettings.defaultPaymentPolicyId || process.env.EBAY_PAYMENT_POLICY_ID,
    returnPolicy: userSettings.defaultReturnPolicyId || process.env.EBAY_RETURN_POLICY_ID,
    categoryId: overrideCategoryId || process.env.EBAY_DEFAULT_CATEGORY_ID || '261068',
    sellerZip: userSettings.sellerZip || process.env.SELLER_ZIP || '10001',
    sellerLocation: userSettings.sellerLocation || process.env.SELLER_LOCATION || 'United States',
  };
  try {
    const token = await getValidAccessToken(req.companyId);
    console.log(`--- Initiating XML Trading API push for: ${listing.title} ---`);
    const TRADING_URL = 'https://api.ebay.com/ws/api.dll';

    const uploadedPictureUrls = [];
    if (listing.images && listing.images.length > 0) {
      console.log(`Uploading ${listing.images.length} images to eBay EPS...`);
      for (let i = 0; i < listing.images.length; i++) {
        let imageBytes;
        let format = 'jpeg';
        if (listing.images[i].startsWith('http')) {
          const urlPath = listing.images[i].split('?')[0];
          const ext = urlPath.split('.').pop()?.toLowerCase();
          if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) format = ext === 'jpg' ? 'jpeg' : ext;
          const imgRes = await axios.get(listing.images[i], { responseType: 'arraybuffer' });
          imageBytes = Buffer.from(imgRes.data);
        } else {
          const headerMatch = listing.images[i].match(/^data:image\/([a-zA-Z0-9]+);base64,/);
          if (headerMatch) format = headerMatch[1];
          const base64Data = listing.images[i].split(',')[1] || listing.images[i];
          if (!base64Data) continue;
          imageBytes = Buffer.from(base64Data, 'base64');
        }
        const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <PictureName>image_${i}.${format}</PictureName>
  <PictureSet>Standard</PictureSet>
  <ExtensionInDays>30</ExtensionInDays>
</UploadSiteHostedPicturesRequest>`;
        const boundary = '----eBayEpsBoundary12345' + Date.now() + i;
        const part1 = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="XML Payload"\r\nContent-Type: text/xml\r\n\r\n${xmlPayload}\r\n--${boundary}\r\nContent-Disposition: form-data; name="dummy"; filename="image_${i}.${format}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
        const part3 = Buffer.from(`\r\n--${boundary}--\r\n`);
        const finalPayload = Buffer.concat([part1, imageBytes, part3]);
        const picRes = await axios.post(TRADING_URL, finalPayload, {
          headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': `multipart/form-data; boundary=${boundary}` }
        });
        const match = picRes.data.match(/<FullURL>(.*?)<\/FullURL>/);
        if (match && match[1]) {
          uploadedPictureUrls.push(match[1]);
        } else {
          const errMsg = picRes.data.match(/<LongMessage>(.*?)<\/LongMessage>/);
          return res.status(400).json({ error: 'eBay EPS Image Upload Failed: ' + (errMsg ? errMsg[1] : 'Unknown error') });
        }
      }
    }

    if (listing.images && listing.images.length > 0 && uploadedPictureUrls.length === 0) {
      return res.status(400).json({ error: 'All image uploads to eBay failed.' });
    }

    const rawPrice = (listing.priceRecommendation || '').replace(/[^0-9.]/g, '');
    const validPrice = rawPrice && !isNaN(parseFloat(rawPrice)) ? parseFloat(rawPrice).toFixed(2) : '50.00';
    const conditionId = overrideConditionId || getConditionId(listing.condition);
    const scheduleDate = new Date();
    scheduleDate.setDate(scheduleDate.getDate() + 21);
    const scheduleTimeStr = scheduleDate.toISOString();

    let pictureDetailsXml = '';
    if (uploadedPictureUrls.length > 0) {
      pictureDetailsXml = '<PictureDetails>\n' + uploadedPictureUrls.map(url => `<PictureURL>${url}</PictureURL>`).join('\n') + '\n</PictureDetails>';
    }
    let itemSpecificsXml = '';
    if (listing.itemSpecifics && Object.keys(listing.itemSpecifics).length > 0) {
      itemSpecificsXml = '<ItemSpecifics>\n' + Object.entries(listing.itemSpecifics).map(([name, val]) => `<NameValueList><Name><![CDATA[${name}]]></Name><Value><![CDATA[${val}]]></Value></NameValueList>`).join('\n') + '\n</ItemSpecifics>';
    }

    const descHeader = userSettings.descriptionHeader || '';
    const descFooter = userSettings.descriptionFooter || '';
    const wrappedDescription = descHeader + listing.description + descFooter;

    const addItemXml = `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title><![CDATA[${listing.title.substring(0, 80)}]]></Title>
    ${listing.sku ? `<SKU><![CDATA[${listing.sku}]]></SKU>` : ''}
    <Description><![CDATA[${wrappedDescription}]]></Description>
    <PrimaryCategory><CategoryID>${config.categoryId}</CategoryID></PrimaryCategory>
    <StartPrice currencyID="USD">${validPrice}</StartPrice>
    <ConditionID>${conditionId}</ConditionID>
    <Country>US</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    ${pictureDetailsXml}
    ${itemSpecificsXml}
    <PostalCode>${config.sellerZip}</PostalCode>
    <Location><![CDATA[${config.sellerLocation}]]></Location>
    <SellerProfiles>
      <SellerPaymentProfile><PaymentProfileID>${config.paymentPolicy}</PaymentProfileID></SellerPaymentProfile>
      <SellerReturnProfile><ReturnProfileID>${config.returnPolicy}</ReturnProfileID></SellerReturnProfile>
      <SellerShippingProfile><ShippingProfileID>${config.fulfillmentPolicy}</ShippingProfileID></SellerShippingProfile>
    </SellerProfiles>
    <ScheduleTime>${scheduleTimeStr}</ScheduleTime>
  </Item>
</AddFixedPriceItemRequest>`;

    const addRes = await axios.post(TRADING_URL, addItemXml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    if (addRes.data.includes('<Ack>Failure</Ack>') || addRes.data.includes('<Ack>Error</Ack>')) {
      const errorMatches = [...addRes.data.matchAll(/<LongMessage>(.*?)<\/LongMessage>/g)];
      const errorMsg = errorMatches.length > 0 ? errorMatches.map(m => m[1]).join(' | ') : 'Unknown Trading API Error';
      console.error('eBay Trading API Error:', errorMsg);
      return res.status(400).json({ error: 'eBay API Error: ' + errorMsg });
    }
    const itemIdMatch = addRes.data.match(/<ItemID>(.*?)<\/ItemID>/);
    const draftId = itemIdMatch ? itemIdMatch[1] : 'Unknown ID';
    console.log(`Successfully pushed to eBay! Scheduled Item ID: ${draftId}`);
    res.json({ success: true, draftId });
  } catch (error) {
    console.error('Node Error:', error.message);
    res.status(500).json({ error: 'Failed to push scheduled draft to eBay via XML' });
  }
});

app.get('/api/barcode', async (req, res) => {
  const { upc } = req.query;
  if (!upc) return res.status(400).json({ error: 'upc query param required' });
  try {
    const offResp = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${upc}.json`, { timeout: 5000 });
    if (offResp.data?.status === 1 && offResp.data?.product) {
      const p = offResp.data.product;
      return res.json({ title: p.product_name_en || p.product_name || '', brand: p.brands || '', category: p.categories_tags?.[0]?.replace('en:', '') || '', description: p.generic_name_en || p.generic_name || '', source: 'Open Food Facts' });
    }
    const upcResp = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, { timeout: 5000 });
    const item = upcResp.data?.items?.[0];
    if (item) {
      return res.json({ title: item.title || '', brand: item.brand || '', category: item.category || '', description: item.description || '', source: 'UPC Item DB' });
    }
    res.json({ title: '', brand: '', category: '', description: '', source: null });
  } catch (e) {
    console.error('[barcode] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Admin routes (superadmin only) ──────────────────────────────────────────

app.get('/api/admin/companies', requireSuperAdmin, async (req, res) => {
  try {
    res.json(await getCompanies());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/companies', requireSuperAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    res.json(await createCompany(name));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/companies/:id', requireSuperAdmin, async (req, res) => {
  try {
    await updateCompany(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/companies/:id', requireSuperAdmin, async (req, res) => {
  try {
    await deleteCompany(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/users', requireSuperAdmin, async (req, res) => {
  try {
    const { companyId } = req.query;
    res.json(await getUsers(companyId || null));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/users', requireSuperAdmin, async (req, res) => {
  try {
    const { companyId, email, password, name, role } = req.body;
    if (!companyId || !email || !password || !name) return res.status(400).json({ error: 'companyId, email, password, name required' });
    const existing = await getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });
    res.json(await createUser({ companyId, email, password, name, role }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/users/:id', requireSuperAdmin, async (req, res) => {
  try {
    await updateUser(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:id', requireSuperAdmin, async (req, res) => {
  try {
    await deleteUser(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Catch-all SPA ────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ─── Startup: migrate + bootstrap ────────────────────────────────────────────

async function bootstrap() {
  try {
    const db = await getDb();

    // Ensure MongoDB indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ id: 1 }, { unique: true });
    await db.collection('companies').createIndex({ id: 1 }, { unique: true });
    await db.collection('listings').createIndex({ companyId: 1, status: 1 });

    // Find or create FlipSide Collectibles company
    let company = (await db.collection('companies').find({}).toArray()).find(c => c.name === 'FlipSide Collectibles');
    if (!company) {
      company = await createCompany('FlipSide Collectibles');
      console.log('[bootstrap] Created FlipSide Collectibles company, id:', company.id);
    } else {
      console.log('[bootstrap] FlipSide Collectibles exists, id:', company.id);
    }

    // Migrate existing listings (no companyId) → FlipSide Collectibles
    const migrateListingsResult = await db.collection('listings').updateMany(
      { companyId: { $exists: false } },
      { $set: { companyId: company.id } }
    );
    if (migrateListingsResult.modifiedCount > 0) {
      console.log(`[bootstrap] Migrated ${migrateListingsResult.modifiedCount} listings → companyId=${company.id}`);
    }

    // Migrate legacy config docs
    const legacySettings = await db.collection('config').findOne({ _id: 'user_settings' });
    if (legacySettings) {
      const { _id, ...settingsData } = legacySettings;
      await db.collection('config').updateOne({ _id: `${company.id}_settings` }, { $set: settingsData }, { upsert: true });
      await db.collection('config').deleteOne({ _id: 'user_settings' });
      console.log('[bootstrap] Migrated user_settings →', `${company.id}_settings`);
    }
    const legacyTokenUsage = await db.collection('config').findOne({ _id: 'token_usage' });
    if (legacyTokenUsage) {
      const { _id, ...usageData } = legacyTokenUsage;
      await db.collection('config').updateOne({ _id: `${company.id}_token_usage` }, { $set: usageData }, { upsert: true });
      await db.collection('config').deleteOne({ _id: 'token_usage' });
      console.log('[bootstrap] Migrated token_usage →', `${company.id}_token_usage`);
    }

    // Migrate legacy eBay tokens
    const legacyTokens = await db.collection('tokens').findOne({ _id: 'admin_tokens' });
    if (legacyTokens) {
      const { _id, ...tokenData } = legacyTokens;
      await db.collection('tokens').updateOne({ _id: `${company.id}_tokens` }, { $set: tokenData }, { upsert: true });
      await db.collection('tokens').deleteOne({ _id: 'admin_tokens' });
      console.log('[bootstrap] Migrated admin_tokens →', `${company.id}_tokens`);
    }

    // Create superadmin user if not exists
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (adminEmail && adminPassword) {
      const existing = await getUserByEmail(adminEmail);
      if (!existing) {
        await createUser({ companyId: company.id, email: adminEmail, password: adminPassword, name: 'Admin', role: 'superadmin' });
        console.log('[bootstrap] Created superadmin user:', adminEmail);
      } else {
        console.log('[bootstrap] Superadmin already exists:', adminEmail);
      }
    } else {
      console.warn('[bootstrap] ADMIN_EMAIL or ADMIN_PASSWORD not set — skipping admin user creation');
    }

    console.log('[bootstrap] Done.');
  } catch (e) {
    console.error('[bootstrap] Error:', e.message);
  }
}

app.listen(PORT, async () => {
  console.log(`eBay Proxy Server running on http://localhost:${PORT}`);
  const key = process.env.GEMINI_API_KEY;
  if (key) console.log(`GEMINI_API_KEY loaded: ${key.substring(0, 8)}... (length: ${key.length})`);
  else console.log('GEMINI_API_KEY: NOT SET');
  await bootstrap();
});
