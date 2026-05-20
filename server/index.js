require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { generateListing, generateListingFromUrls } = require('./ai');
const { getAuthUrl, exchangeCodeForToken, getValidAccessToken, hasValidSession, getTokenExpiry } = require('./ebayAuth');
const { getListings, createListing, updateListing, deleteListing, getAllListingsMeta, getActiveListings, getSettings, saveSettings, incrementTokenUsage, getTokenUsage, getConsignors, createConsignor, updateConsignor, deleteConsignor, getContainers, getContainerById, createContainer, updateContainer, deleteContainer, getListingsInContainer, addLooseItem, removeLooseItem } = require('./listings');
const { fetchListingForOptimizer, fetchSoldComps, aiOptimizeListing } = require('./optimizer');
const feedbackStore = require('./feedback');
const catalog = require('./collections');
const { uploadImage } = require('./cloudinary');
const { getDb } = require('./db');
const { signToken, authMiddleware, requireSuperAdmin } = require('./auth');
const {
  createCompany, getCompanies, getCompanyById, updateCompany, deleteCompany,
  createUser, getUserByEmail, getUserById, getUsers, updateUser, deleteUser, verifyPassword,
} = require('./users');

const crypto = require('crypto');

const app = express();
app.use(cors());

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3001;
const EBAY_API_BASE = 'https://api.ebay.com';

// eBay aspects that must be sent via dedicated XML elements, not ItemSpecifics
const RESERVED_SPECIFICS = new Set([
  'condition', 'conditionid', 'condition id', 'price', 'start price',
  'buy it now price', 'currency', 'listing type', 'listing duration',
]);

// eBay caps individual ItemSpecifics values at 65 chars. Long aspects like
// "Compatible Model" are typically multi-value lists — split them into
// multiple <Value> elements within a single <NameValueList> instead of
// truncating mid-list.
function buildItemSpecificsXml(itemSpecifics) {
  if (!itemSpecifics) return '';
  const entries = Array.isArray(itemSpecifics)
    ? itemSpecifics.map(s => [s && s.name, s && s.value])
    : Object.entries(itemSpecifics);
  const filtered = entries.filter(([name, val]) =>
    name && val != null && val !== '' &&
    !RESERVED_SPECIFICS.has(String(name).toLowerCase().trim()));
  if (filtered.length === 0) return '';

  const splitValues = (raw) => {
    const s = String(raw).trim();
    if (!s) return [];
    if (s.length <= 65) return [s];
    // Try semicolon then comma separators; only accept the split if every
    // piece individually fits within eBay's 65-char limit.
    for (const sep of [/\s*;\s*/, /\s*,\s*/]) {
      const parts = s.split(sep).map(p => p.trim()).filter(Boolean);
      if (parts.length > 1 && parts.every(p => p.length <= 65)) return parts;
    }
    return [s.substring(0, 65)];
  };

  const blocks = filtered.map(([name, val]) => {
    const safeName = String(name).substring(0, 65);
    // eBay caps the number of values per aspect — 30 is a safe ceiling.
    const values = splitValues(val).slice(0, 30);
    if (values.length === 0) return '';
    const valueXml = values.map(v => `<Value><![CDATA[${v}]]></Value>`).join('');
    return `<NameValueList><Name><![CDATA[${safeName}]]></Name>${valueXml}</NameValueList>`;
  }).filter(Boolean);

  if (blocks.length === 0) return '';
  return '<ItemSpecifics>\n' + blocks.join('\n') + '\n</ItemSpecifics>';
}

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
    const companyId = state ? Buffer.from(state, 'base64').toString('utf8') : 'default';
    console.log(`[oauth-callback] exchanging code for company=${companyId}`);
    await exchangeCodeForToken(code, companyId);
    console.log(`[oauth-callback] success for company=${companyId}`);
    res.send(`<!DOCTYPE html><html><head><title>eBay Connected</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;}
      .box{text-align:center;padding:2rem;background:#1e293b;border-radius:12px;max-width:400px;}
      h2{color:#22c55e;margin-bottom:0.5rem;} p{color:#94a3b8;margin-bottom:1.5rem;}
      a{display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;}</style></head>
      <body><div class="box"><h2>✓ eBay Connected!</h2>
      <p>Your eBay account was linked successfully for <strong>${companyId}</strong>.</p>
      <a href="/">Return to App</a></div></body></html>`);
  } catch (error) {
    const errData = error.response?.data || error.message;
    console.error('OAuth Callback Error:', errData);
    res.send(`<!DOCTYPE html><html><head><title>eBay Connection Failed</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;}
      .box{text-align:center;padding:2rem;background:#1e293b;border-radius:12px;max-width:500px;}
      h2{color:#ef4444;margin-bottom:0.5rem;} pre{color:#fca5a5;background:#450a0a;padding:1rem;border-radius:8px;text-align:left;overflow:auto;font-size:0.8rem;white-space:pre-wrap;}
      a{display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;margin-top:1rem;}</style></head>
      <body><div class="box"><h2>✗ eBay Connection Failed</h2>
      <pre>${JSON.stringify(errData, null, 2)}</pre>
      <a href="/">Return to App</a></div></body></html>`);
  }
});

// DELETE /api/ebay/tokens — clear stored tokens so user can do a clean reconnect
app.delete('/api/ebay/tokens', async (req, res) => {
  try {
    const db = await getDb();
    await db.collection('tokens').deleteOne({ _id: `${req.companyId}_tokens` });
    console.log(`[ebay-tokens] cleared tokens for company=${req.companyId}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Temporary public debug endpoint — remove after diagnosing eBay auth issue
app.get('/api/ebay/debug-auth-public', async (req, res) => {
  try {
    const db = await getDb();
    const companies = await db.collection('tokens').find({}).toArray();
    res.json({
      clientIdPrefix: (process.env.EBAY_CLIENT_ID || '(not set)').substring(0, 15) + '...',
      hasClientSecret: !!(process.env.EBAY_CLIENT_SECRET),
      ruName: process.env.EBAY_RU_NAME || '(not set)',
      tokenDocs: companies.map(doc => ({
        id: doc._id,
        refreshTokenPrefix: doc.refresh_token ? doc.refresh_token.substring(0, 10) + '...' : null,
        refreshTokenExpiry: doc.refresh_token_expires_at ? new Date(doc.refresh_token_expires_at).toISOString() : null,
        accessTokenExpiry: doc.expires_at ? new Date(doc.expires_at).toISOString() : null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
  const { itemId, newPrice, newTitle, description, conditionId, itemSpecifics, quantity } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    const token = await getValidAccessToken(req.companyId);
    const priceXml      = newPrice     ? `<StartPrice currencyID="USD">${parseFloat(newPrice).toFixed(2)}</StartPrice>` : '';
    const titleXml      = newTitle     ? `<Title><![CDATA[${String(newTitle).substring(0, 80)}]]></Title>` : '';
    const descXml       = description  ? `<Description><![CDATA[${description}]]></Description>` : '';
    const condXml       = conditionId  ? `<ConditionID>${conditionId}</ConditionID>` : '';
    const qtyNum        = quantity != null ? Math.max(1, parseInt(quantity, 10) || 1) : null;
    const qtyXml        = qtyNum != null ? `<Quantity>${qtyNum}</Quantity>` : '';

    // ReviseFixedPriceItem treats <ItemSpecifics> as a full replacement, so
    // pushing the (possibly partial) local specifics would wipe any aspect the
    // local DB record never captured — causing failures like "item specific
    // Size is missing". Mirror the relist merge: fetch the live specifics and
    // layer the local edits on top so missing category-required aspects are
    // preserved. Only do this when we're actually sending specifics.
    let mergedSpecifics = itemSpecifics;
    const hasLocalSpecifics = Array.isArray(itemSpecifics)
      ? itemSpecifics.length > 0
      : itemSpecifics && Object.keys(itemSpecifics).length > 0;
    if (hasLocalSpecifics) {
      try {
        const getItemXml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`;
        const getItemRes = await axios.post('https://api.ebay.com/ws/api.dll', getItemXml, {
          headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
        });
        const liveItemSpecifics = {};
        const specificsBlock = /<ItemSpecifics>([\s\S]*?)<\/ItemSpecifics>/.exec(getItemRes.data)?.[1] || '';
        if (specificsBlock) {
          const stripCdata = (s) => {
            const m = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(s.trim());
            return m ? m[1] : s.trim();
          };
          for (const m of specificsBlock.matchAll(/<NameValueList>([\s\S]*?)<\/NameValueList>/g)) {
            const nvl = m[1];
            const name = stripCdata(/<Name>([\s\S]*?)<\/Name>/.exec(nvl)?.[1] || '');
            const values = [...nvl.matchAll(/<Value>([\s\S]*?)<\/Value>/g)].map(v => stripCdata(v[1]));
            if (name && values.length > 0) liveItemSpecifics[name] = values.length === 1 ? values[0] : values.join('; ');
          }
        }
        // Normalize the client payload (array of {name,value}) to an object,
        // then merge: live underneath, local edits on top.
        const localSpecifics = Array.isArray(itemSpecifics)
          ? Object.fromEntries(itemSpecifics.filter(s => s && s.name).map(s => [s.name, s.value]))
          : itemSpecifics;
        mergedSpecifics = { ...liveItemSpecifics, ...localSpecifics };
        console.log(`[revise] GetItem(${itemId}) merged specifics — live=${Object.keys(liveItemSpecifics).length} (${Object.keys(liveItemSpecifics).join(',')}), local=${Object.keys(localSpecifics).length}, merged=${Object.keys(mergedSpecifics).length}`);
      } catch (e) {
        console.warn(`[revise] could not fetch live specifics for ${itemId} — pushing local only: ${e.message}`);
      }
    }
    const specificsXml  = buildItemSpecificsXml(mergedSpecifics);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${itemId}</ItemID>
    ${titleXml}
    ${priceXml}
    ${qtyXml}
    ${descXml}
    ${condXml}
    ${specificsXml}
  </Item>
</ReviseFixedPriceItemRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    const reviseHeaders = { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'ReviseFixedPriceItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' };
    const buildRevise = ({ withPrice = true, withCondition = true } = {}) => `<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>${itemId}</ItemID>
    ${titleXml}
    ${withPrice ? priceXml : ''}
    ${qtyXml}
    ${descXml}
    ${withCondition ? condXml : ''}
    ${specificsXml}
  </Item>
</ReviseFixedPriceItemRequest>`;

    if (resp.data.includes('<Ack>Failure</Ack>')) {
      const err = resp.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Unknown error';
      const errLower = err.toLowerCase();

      // Condition invalid for this category → retry without conditionId (keep existing condition)
      const isConditionError = errLower.includes('condition') && (errLower.includes('invalid') || errLower.includes('not valid'));
      if (isConditionError && condXml) {
        console.log(`[revise] conditionId ${conditionId} invalid for this listing's category — retrying without it`);
        const resp2 = await axios.post('https://api.ebay.com/ws/api.dll', buildRevise({ withCondition: false }), { headers: reviseHeaders });
        if (resp2.data.includes('<Ack>Failure</Ack>')) {
          const err2 = resp2.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Unknown error';
          return res.status(400).json({ error: err2 });
        }
        return res.json({ success: true, warning: 'Condition was not updated — the chosen condition is not valid for this listing’s eBay category. The existing condition on the listing was kept.' });
      }

      // Price blocked by an active sale → retry without the price field
      if (errLower.includes('part of a sale') || errLower.includes('cannot be updated since it is a part of a sale')) {
        console.log('[revise] price blocked by sale — retrying without price');
        const resp2 = await axios.post('https://api.ebay.com/ws/api.dll', buildRevise({ withPrice: false }), { headers: reviseHeaders });
        if (resp2.data.includes('<Ack>Failure</Ack>')) {
          const err2 = resp2.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Unknown error';
          return res.status(400).json({ error: err2 });
        }
        return res.json({ success: true, warning: 'Price was not updated because this item is currently part of a sale.' });
      }

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

app.get('/api/ebay/debug-auth', async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection('tokens').findOne({ _id: `${req.companyId}_tokens` });
    res.json({
      companyId: req.companyId,
      clientIdPrefix: (process.env.EBAY_CLIENT_ID || '').substring(0, 12) + '...',
      hasClientSecret: !!(process.env.EBAY_CLIENT_SECRET),
      ruName: process.env.EBAY_RU_NAME || '(not set)',
      tokenDocExists: !!doc,
      refreshTokenPrefix: doc?.refresh_token ? doc.refresh_token.substring(0, 10) + '...' : null,
      accessTokenExpiry: doc?.expires_at ? new Date(doc.expires_at).toISOString() : null,
      refreshTokenExpiry: doc?.refresh_token_expires_at ? new Date(doc.refresh_token_expires_at).toISOString() : null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
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

// ─── Catalog Codes ────────────────────────────────────────────────────────────

app.get('/api/catalog-codes', async (req, res) => {
  try {
    const codes = await catalog.listCollections(req.companyId);
    res.json({ codes });
  } catch (e) {
    console.error('[catalog-codes] GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/catalog-codes', async (req, res) => {
  try {
    const { code, name } = req.body || {};
    const saved = await catalog.addCollection(req.companyId, code, name);
    res.json({ success: true, code: saved });
  } catch (e) {
    console.error('[catalog-codes] POST error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/catalog-codes/:code', async (req, res) => {
  try {
    const { code, name } = req.body || {};
    const saved = await catalog.updateCollection(req.companyId, req.params.code, code, name);
    res.json({ success: true, code: saved });
  } catch (e) {
    console.error('[catalog-codes] PUT error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/catalog-codes/:code', async (req, res) => {
  try {
    await catalog.deleteCollection(req.companyId, req.params.code);
    res.json({ success: true });
  } catch (e) {
    console.error('[catalog-codes] DELETE error:', e.message);
    res.status(400).json({ error: e.message });
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

// Update a listing by its eBay item ID (used by the optimizer to save collection codes)
app.patch('/api/listings/by-ebay-id/:itemId', async (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates) return res.status(400).json({ error: 'updates required' });
    const db = await getDb();
    const result = await db.collection('listings').updateOne(
      { ebayDraftId: req.params.itemId, companyId: req.companyId },
      { $set: { ...updates, updatedAt: Date.now() } }
    );
    if (result.matchedCount === 0) return res.json({ success: false, notFound: true });
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

// ─── Feedback (internal forum) ───────────────────────────────────────────────
// Posts are global across companies — feedback goes to the superadmin/developer.
// Any authenticated user can post and reply; only superadmin changes status or deletes.

app.get('/api/feedback', async (req, res) => {
  try {
    const posts = await feedbackStore.listPosts();
    res.json(posts);
  } catch (e) {
    console.error('[feedback] GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/feedback', async (req, res) => {
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

app.put('/api/feedback/:id', async (req, res) => {
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

app.delete('/api/feedback/:id', async (req, res) => {
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

app.post('/api/feedback/:id/replies', async (req, res) => {
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

app.delete('/api/feedback/:id/replies/:replyId', async (req, res) => {
  try {
    const post = await feedbackStore.getPost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Not found' });
    const reply = (post.replies || []).find(r => r.id === req.params.replyId);
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

// ─── Consignors ───────────────────────────────────────────────────────────────

app.get('/api/consignors', async (req, res) => {
  try {
    const consignors = await getConsignors(req.companyId);
    res.json(consignors);
  } catch (e) {
    console.error('[consignors] GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/consignors', async (req, res) => {
  try {
    const consignor = req.body.consignor;
    if (!consignor?.id || !consignor?.name) {
      return res.status(400).json({ error: 'id and name required' });
    }
    await createConsignor(req.companyId, consignor);
    res.json({ success: true });
  } catch (e) {
    console.error('[consignors] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/consignors/:id', async (req, res) => {
  try {
    await updateConsignor(req.companyId, req.params.id, req.body.updates || {});
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/consignors/:id', async (req, res) => {
  try {
    await deleteConsignor(req.companyId, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Inventory containers ────────────────────────────────────────────────────

const VALID_CONTAINER_TYPES = new Set(['bin', 'box', 'shelf', 'drawer', 'tote', 'pallet', 'other']);

app.get('/api/containers', async (req, res) => {
  try {
    const containers = await getContainers(req.companyId);
    res.json(containers);
  } catch (e) {
    console.error('[containers] GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/containers/:id', async (req, res) => {
  try {
    const container = await getContainerById(req.companyId, req.params.id);
    if (!container) return res.status(404).json({ error: 'Container not found' });
    const listings = await getListingsInContainer(req.companyId, req.params.id);
    res.json({ container, listings });
  } catch (e) {
    console.error('[containers] GET-by-id error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/containers', async (req, res) => {
  try {
    const container = req.body.container;
    if (!container?.id || !container?.name || !container?.type) {
      return res.status(400).json({ error: 'id, name, and type required' });
    }
    if (!VALID_CONTAINER_TYPES.has(container.type)) {
      return res.status(400).json({ error: `type must be one of ${Array.from(VALID_CONTAINER_TYPES).join(', ')}` });
    }
    await createContainer(req.companyId, container);
    res.json({ success: true });
  } catch (e) {
    console.error('[containers] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/containers/:id', async (req, res) => {
  try {
    const updates = req.body.updates || {};
    if (updates.type !== undefined && !VALID_CONTAINER_TYPES.has(updates.type)) {
      return res.status(400).json({ error: `type must be one of ${Array.from(VALID_CONTAINER_TYPES).join(', ')}` });
    }
    await updateContainer(req.companyId, req.params.id, updates);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/containers/:id', async (req, res) => {
  try {
    await deleteContainer(req.companyId, req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/containers/:id/loose-items', async (req, res) => {
  try {
    const { label, notes } = req.body || {};
    if (!label || typeof label !== 'string') {
      return res.status(400).json({ error: 'label required' });
    }
    const item = { id: crypto.randomUUID(), label, notes: notes || '', createdAt: Date.now() };
    await addLooseItem(req.companyId, req.params.id, item);
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/containers/:id/loose-items/:itemId', async (req, res) => {
  try {
    await removeLooseItem(req.companyId, req.params.id, req.params.itemId);
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
    const collectionsForAi = await catalog.getCollectionsForAI(req.companyId);
    const result = await generateListing(imageParts, instructions, process.env.GEMINI_API_KEY, collectionsForAi);
    if (result.tokenUsage) {
      incrementTokenUsage(req.companyId, result.tokenUsage.promptTokens, result.tokenUsage.completionTokens).catch(() => {});
    }
    res.json(result);
  } catch (error) {
    console.error('AI Generation Error:', error);
    res.status(500).json({ error: (error && error.message) || 'Failed to generate AI listing' });
  }
});

app.post('/api/generate-from-urls', async (req, res) => {
  try {
    const { imageUrls, instructions } = req.body;
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
    const collectionsForAi = await catalog.getCollectionsForAI(req.companyId);
    const result = await generateListingFromUrls(imageUrls || [], instructions || '', process.env.GEMINI_API_KEY, collectionsForAi);
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

// Returns the valid ConditionIDs for a given category (varies by category type)
app.get('/api/ebay/category-conditions', async (req, res) => {
  const { categoryId } = req.query;
  if (!categoryId) return res.status(400).json({ error: 'categoryId required' });
  try {
    const token = await getValidAccessToken(req.companyId);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetCategoryFeaturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <CategoryID>${categoryId}</CategoryID>
  <FeatureID>ConditionValues</FeatureID>
  <ViewAllNodes>true</ViewAllNodes>
</GetCategoryFeaturesRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'GetCategoryFeatures', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    const conditions = [...resp.data.matchAll(/<Condition>\s*<ID>(\d+)<\/ID>\s*<DisplayName>(.*?)<\/DisplayName>/g)]
      .map(m => ({ id: m[1], label: m[2] }));
    res.json({ conditions });
  } catch (e) {
    console.error('[category-conditions] error:', e.message);
    res.json({ conditions: [] }); // empty = client falls back to full list
  }
});

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

// ─── eBay Active Listings Import ─────────────────────────────────────────────

// GET /api/ebay/active-listings?page=N
// Fetches one page of active eBay listings from the Trading API (max 200/page).
// The frontend calls this repeatedly to paginate through all listings.
app.get('/api/ebay/active-listings', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const token = await getValidAccessToken(req.companyId);
    // GetSellerList returns ALL active listings including out-of-stock GTC items.
    // EndTimeFrom=now filters to listings that haven't ended yet.
    const listNow = new Date();
    const listEndTimeTo = new Date(listNow.getTime() + 120 * 24 * 60 * 60 * 1000);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <EndTimeFrom>${listNow.toISOString()}</EndTimeFrom>
  <EndTimeTo>${listEndTimeTo.toISOString()}</EndTimeTo>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeSKU>true</IncludeSKU>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>${page}</PageNumber>
  </Pagination>
</GetSellerListRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
        'X-EBAY-API-CALL-NAME': 'GetSellerList',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': 'text/xml',
      },
    });
    const body = resp.data;

    const totalPages = parseInt((/<TotalNumberOfPages>(\d+)<\/TotalNumberOfPages>/.exec(body) || [])[1] || '1');
    const totalEntries = parseInt((/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/.exec(body) || [])[1] || '0');

    const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
    const items = [];
    let m;
    while ((m = itemRegex.exec(body)) !== null) {
      const block = m[1];
      const get = (tag) => {
        const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
        const x = r.exec(block);
        return x ? x[1].trim() : '';
      };
      // Collect all PictureURL values; fall back to GalleryURL when GetSellerList
      // returns only the gallery thumbnail (common for older/bulk-uploaded items).
      const picRegex = /<PictureURL[^>]*>([\s\S]*?)<\/PictureURL>/g;
      const images = [];
      let pm;
      while ((pm = picRegex.exec(block)) !== null) images.push(pm[1].trim());
      if (images.length === 0) {
        const gallery = get('GalleryURL');
        if (gallery) images.push(gallery);
      }

      items.push({
        ebayItemId: get('ItemID'),
        title: get('Title'),
        price: get('CurrentPrice') || get('BuyItNowPrice') || '',
        condition: get('ConditionDisplayName') || '',
        categoryId: get('CategoryID'),
        categoryName: get('CategoryName'),
        sku: get('SKU') || '',
        images,
        endTime: get('EndTime'),
        quantity: get('Quantity') || '1',
        quantitySold: get('QuantitySold') || '0',
      });
    }

    res.json({ items, totalPages, totalEntries, page });
  } catch (e) {
    console.error('[active-listings] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ebay/refresh-listings?page=N
// Processes one page (200 items) of active eBay listings per call.
// Updates existing DB records (images/title/price/condition) and inserts any not yet imported.
// Frontend calls this repeatedly for each page, accumulating counts.
app.post('/api/ebay/refresh-listings', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const token = await getValidAccessToken(req.companyId);
    const db = await getDb();

    // Load all imported listings keyed by ebayDraftId for fast lookup
    const allImported = await db.collection('listings').find(
      { companyId: req.companyId, ebayDraftId: { $exists: true, $ne: null } },
      { projection: { _id: 1, ebayDraftId: 1 } }
    ).toArray();
    const byEbayId = new Map(allImported.map(l => [l.ebayDraftId, l]));

    // GetSellerList returns ALL active listings including out-of-stock GTC items.
    // GetMyeBaySelling/ActiveList skips those, causing a large discrepancy.
    // EndTimeFrom=now ensures we only fetch listings that haven't ended yet.
    const callNow = new Date();
    const endTimeTo = new Date(callNow.getTime() + 120 * 24 * 60 * 60 * 1000);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <EndTimeFrom>${callNow.toISOString()}</EndTimeFrom>
  <EndTimeTo>${endTimeTo.toISOString()}</EndTimeTo>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeSKU>true</IncludeSKU>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>${page}</PageNumber>
  </Pagination>
</GetSellerListRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
        'X-EBAY-API-CALL-NAME': 'GetSellerList',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': 'text/xml',
      },
    });
    const body = resp.data;
    const totalPages = parseInt((/<TotalNumberOfPages>(\d+)<\/TotalNumberOfPages>/.exec(body) || [])[1] || '1');

    const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
    const updateOps = [];
    const insertOps = [];
    const now = Date.now();
    let m;
    while ((m = itemRegex.exec(body)) !== null) {
      const block = m[1];
      const get = (tag) => {
        const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
        const x = r.exec(block);
        return x ? x[1].trim() : '';
      };
      const ebayItemId = get('ItemID');
      if (!ebayItemId) continue;

      const picRegex = /<PictureURL[^>]*>([\s\S]*?)<\/PictureURL>/g;
      const images = [];
      let pm;
      while ((pm = picRegex.exec(block)) !== null) images.push(pm[1].trim());
      if (images.length === 0) {
        const gallery = get('GalleryURL');
        if (gallery) images.push(gallery);
      }

      const title = get('Title');
      const rawPrice = get('CurrentPrice') || get('BuyItNowPrice') || '';
      const priceRecommendation = rawPrice ? `$${parseFloat(rawPrice).toFixed(2)}` : '';
      const condition = get('ConditionDisplayName') || '';
      const categoryName = get('CategoryName') || '';
      const categoryId = get('PrimaryCategoryID') || get('CategoryID') || '';
      const sku = get('SKU') || '';

      if (byEbayId.has(ebayItemId)) {
        const existing = byEbayId.get(ebayItemId);
        const patch = { updatedAt: now };
        if (images.length > 0) patch.images = images;
        if (title) patch.title = title;
        if (priceRecommendation) patch.priceRecommendation = priceRecommendation;
        if (condition) patch.condition = condition;
        if (sku) patch.sku = sku;
        if (categoryId) patch.categoryId = categoryId;
        updateOps.push({ updateOne: { filter: { _id: existing._id }, update: { $set: patch } } });
      } else {
        insertOps.push({
          id: crypto.randomUUID(),
          companyId: req.companyId,
          title,
          description: '',
          condition,
          category: categoryName,
          categoryId,
          priceRecommendation,
          shippingEstimate: '',
          itemSpecifics: {},
          images,
          sku,
          status: 'listed',
          ebayDraftId: ebayItemId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const ops = [
      ...updateOps,
      ...insertOps.map(doc => ({ insertOne: { document: doc } })),
    ];
    if (ops.length > 0) await db.collection('listings').bulkWrite(ops);

    res.json({ refreshed: updateOps.length, imported: insertOps.length, totalPages, page });
  } catch (e) {
    console.error('[refresh-listings] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ebay/import-listings
// Saves selected eBay active listings into the DB as status='listed'.
// Skips any whose ebayDraftId already exists in the company's listings.
app.post('/api/ebay/import-listings', async (req, res) => {
  try {
    const { listings } = req.body;
    if (!Array.isArray(listings) || listings.length === 0) {
      return res.status(400).json({ error: 'listings array required' });
    }
    const db = await getDb();
    // Fetch existing ebayDraftIds for this company to avoid duplicates
    const existing = await db.collection('listings').find(
      { companyId: req.companyId, ebayDraftId: { $exists: true, $ne: null } },
      { projection: { ebayDraftId: 1 } }
    ).toArray();
    const existingIds = new Set(existing.map(e => e.ebayDraftId));

    const now = Date.now();
    let imported = 0;
    const importedListings = [];

    for (const item of listings) {
      if (!item.ebayItemId) continue;
      if (existingIds.has(item.ebayItemId)) continue; // already imported

      const id = crypto.randomUUID();
      const listing = {
        id,
        companyId: req.companyId,
        title: item.title || '',
        description: '',
        condition: item.condition || '',
        category: item.categoryName || '',
        categoryId: item.categoryId || '',
        priceRecommendation: item.price ? `$${parseFloat(item.price).toFixed(2)}` : '',
        shippingEstimate: '',
        itemSpecifics: {},
        images: Array.isArray(item.images) ? item.images : [],
        sku: item.sku || '',
        status: 'listed',
        ebayDraftId: item.ebayItemId,
        createdAt: now,
        updatedAt: now,
      };
      await db.collection('listings').insertOne(listing);
      const { _id, companyId, ...publicListing } = listing;
      importedListings.push(publicListing);
      imported++;
    }

    res.json({ imported, skipped: listings.length - imported, listings: importedListings });
  } catch (e) {
    console.error('[import-listings] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ebay/refresh-images/:id
// Pulls the full PictureDetails for a single listing via GetItem (more reliable
// than GetSellerList) and writes the image URLs back to the DB.
app.post('/api/ebay/refresh-images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const listing = await db.collection('listings').findOne({ companyId: req.companyId, id });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (!listing.ebayDraftId) return res.status(400).json({ error: 'Listing has no eBay item ID' });

    const token = await getValidAccessToken(req.companyId);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${listing.ebayDraftId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>false</IncludeItemSpecifics>
</GetItemRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    const body = resp.data;

    const picRegex = /<PictureURL[^>]*>([\s\S]*?)<\/PictureURL>/g;
    const images = [];
    let pm;
    while ((pm = picRegex.exec(body)) !== null) images.push(pm[1].trim());
    if (images.length === 0) {
      const galleryMatch = /<GalleryURL[^>]*>([\s\S]*?)<\/GalleryURL>/.exec(body);
      if (galleryMatch) images.push(galleryMatch[1].trim());
    }

    if (images.length === 0) {
      return res.status(404).json({ error: 'No images returned by eBay for this item' });
    }

    const now = Date.now();
    await db.collection('listings').updateOne(
      { companyId: req.companyId, id },
      { $set: { images, updatedAt: now } }
    );
    res.json({ images, updatedAt: now });
  } catch (e) {
    console.error('[refresh-images] error:', e.message);
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

// Shared helper used by /api/ebay/draft and /api/ebay/relist. Uploads images,
// builds the AddFixedPriceItem XML, posts it, retries once on a condition
// mismatch, and returns { draftId, conditionFallback, warnings }. Throws an
// Error with .status and (optionally) .warnings on failure.
async function pushListingToEbay({ listing, overrideCategoryId, overrideConditionId, overrideFulfillmentPolicyId, overrideReturnPolicyId, overridePaymentPolicyId, scheduleDate, bestOffer, companyId }) {
  const userSettings = await getSettings(companyId).catch(() => ({}));
  const config = {
    fulfillmentPolicy: overrideFulfillmentPolicyId || userSettings.defaultFulfillmentPolicyId || process.env.EBAY_FULFILLMENT_POLICY_ID,
    paymentPolicy: overridePaymentPolicyId || userSettings.defaultPaymentPolicyId || process.env.EBAY_PAYMENT_POLICY_ID,
    returnPolicy: overrideReturnPolicyId || userSettings.defaultReturnPolicyId || process.env.EBAY_RETURN_POLICY_ID,
    categoryId: overrideCategoryId || listing.categoryId || process.env.EBAY_DEFAULT_CATEGORY_ID || '261068',
    sellerZip: userSettings.sellerZip || process.env.SELLER_ZIP || '10001',
    sellerLocation: userSettings.sellerLocation || process.env.SELLER_LOCATION || 'United States',
  };
  const missingPolicies = [];
  if (!config.fulfillmentPolicy) missingPolicies.push('Shipping/Fulfillment Policy');
  if (!config.returnPolicy) missingPolicies.push('Return Policy');
  if (!config.paymentPolicy) missingPolicies.push('Payment Policy');
  if (missingPolicies.length > 0) {
    const err = new Error(`eBay listing requires the following policies to be configured in Settings: ${missingPolicies.join(', ')}. Go to Settings → eBay Policies to select your saved eBay business policies.`);
    err.status = 400;
    throw err;
  }

  const token = await getValidAccessToken(companyId);
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
          const e = new Error('eBay EPS Image Upload Failed: ' + (errMsg ? errMsg[1] : 'Unknown error'));
          e.status = 400;
          throw e;
        }
      }
    }

    if (listing.images && listing.images.length > 0 && uploadedPictureUrls.length === 0) {
      const e = new Error('All image uploads to eBay failed.');
      e.status = 400;
      throw e;
    }

    const rawPrice = (listing.priceRecommendation || '').replace(/[^0-9.]/g, '');
    const validPrice = rawPrice && !isNaN(parseFloat(rawPrice)) ? parseFloat(rawPrice).toFixed(2) : '50.00';
    const conditionId = overrideConditionId || getConditionId(listing.condition);

    // ScheduleTime — validate within eBay's 21-day window, fall back to immediate if invalid
    let scheduleTimeXml = '';
    if (scheduleDate) {
      const scheduleMs = new Date(scheduleDate).getTime();
      const maxMs = Date.now() + (21 * 24 * 60 * 60 * 1000);
      const minMs = Date.now() + (5 * 60 * 1000); // at least 5 min in the future
      if (scheduleMs >= minMs && scheduleMs <= maxMs) {
        scheduleTimeXml = `<ScheduleTime>${new Date(scheduleDate).toISOString()}</ScheduleTime>`;
        console.log(`[draft] Scheduling listing for: ${new Date(scheduleDate).toISOString()}`);
      } else {
        console.warn(`[draft] scheduleDate ${scheduleDate} out of eBay range — listing immediately`);
      }
    }

    let pictureDetailsXml = '';
    if (uploadedPictureUrls.length > 0) {
      pictureDetailsXml = '<PictureDetails>\n' + uploadedPictureUrls.map(url => `<PictureURL>${url}</PictureURL>`).join('\n') + '\n</PictureDetails>';
    }
    const itemSpecificsXml = buildItemSpecificsXml(listing.itemSpecifics);

    const descHeader = userSettings.descriptionHeader || '';
    const descFooter = userSettings.descriptionFooter || '';
    const wrappedDescription = descHeader + listing.description + descFooter;

    // Best Offer — opt-in via bestOffer.enabled. Auto-accept and minimum prices are
    // only sent when the user filled them in; otherwise eBay leaves those thresholds unset.
    // Shipping package details — emitted only if any dimension/weight is set.
    // Some Business Policies require these per-item even though the policy
    // selects the carrier/service.
    let shippingPackageDetailsXml = '';
    {
      const numOrNull = (v) => {
        if (v == null || v === '') return null;
        const n = parseFloat(String(v));
        return isFinite(n) && n > 0 ? n : null;
      };
      const len = numOrNull(listing.packageLength);
      const wid = numOrNull(listing.packageWidth);
      const dep = numOrNull(listing.packageDepth);
      const lbs = numOrNull(listing.packageWeightLbs);
      const oz = numOrNull(listing.packageWeightOz);
      if (len || wid || dep || lbs || oz) {
        const parts = [];
        if (len) parts.push(`<PackageLength unit="inches">${len}</PackageLength>`);
        if (wid) parts.push(`<PackageWidth unit="inches">${wid}</PackageWidth>`);
        if (dep) parts.push(`<PackageDepth unit="inches">${dep}</PackageDepth>`);
        // WeightMajor = pounds, WeightMinor = ounces. Send 0 for the unset half
        // when only one is provided so eBay doesn't reject the partial weight.
        if (lbs || oz) {
          parts.push(`<WeightMajor unit="lbs">${Math.floor(lbs || 0)}</WeightMajor>`);
          parts.push(`<WeightMinor unit="oz">${oz || 0}</WeightMinor>`);
        }
        shippingPackageDetailsXml = `<ShippingPackageDetails>${parts.join('')}</ShippingPackageDetails>`;
      }
    }

    let bestOfferDetailsXml = '';
    let listingDetailsXml = '';
    if (bestOffer && bestOffer.enabled) {
      bestOfferDetailsXml = '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>';
      const sanitizeMoney = (v) => {
        if (v == null || v === '') return null;
        const num = parseFloat(String(v).replace(/[^0-9.]/g, ''));
        if (!isFinite(num) || num <= 0) return null;
        return num.toFixed(2);
      };
      const auto = sanitizeMoney(bestOffer.autoAcceptPrice);
      const min = sanitizeMoney(bestOffer.minOfferPrice);
      const parts = [];
      if (auto) parts.push(`<BestOfferAutoAcceptPrice currencyID="USD">${auto}</BestOfferAutoAcceptPrice>`);
      if (min) parts.push(`<MinimumBestOfferPrice currencyID="USD">${min}</MinimumBestOfferPrice>`);
      if (parts.length > 0) listingDetailsXml = `<ListingDetails>${parts.join('')}</ListingDetails>`;
    }

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
    <Quantity>${Math.max(1, parseInt(listing.quantity, 10) || 1)}</Quantity>
    <ConditionID>${conditionId}</ConditionID>
    <Country>US</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    ${pictureDetailsXml}
    ${itemSpecificsXml}
    ${shippingPackageDetailsXml}
    ${bestOfferDetailsXml}
    ${listingDetailsXml}
    <PostalCode>${config.sellerZip}</PostalCode>
    <Location><![CDATA[${config.sellerLocation}]]></Location>
    <SellerProfiles>
      <SellerPaymentProfile><PaymentProfileID>${config.paymentPolicy}</PaymentProfileID></SellerPaymentProfile>
      <SellerReturnProfile><ReturnProfileID>${config.returnPolicy}</ReturnProfileID></SellerReturnProfile>
      <SellerShippingProfile><ShippingProfileID>${config.fulfillmentPolicy}</ShippingProfileID></SellerShippingProfile>
    </SellerProfiles>
    ${scheduleTimeXml}
  </Item>
</AddFixedPriceItemRequest>`;

    const addRes = await axios.post(TRADING_URL, addItemXml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    // Parse errors/warnings from the response
    const parseEbayErrors = (xml) => {
      const blocks = [...xml.matchAll(/<Errors>([\s\S]*?)<\/Errors>/g)].map(m => m[1]);
      const errors = [], warnings2 = [];
      blocks.forEach(b => {
        const severity = b.match(/<SeverityCode>(.*?)<\/SeverityCode>/)?.[1] || 'Error';
        const msg = b.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || '';
        if (msg) { severity === 'Warning' ? warnings2.push(msg) : errors.push(msg); }
      });
      return { errors, warnings: warnings2 };
    };

    if (addRes.data.includes('<Ack>Failure</Ack>') || addRes.data.includes('<Ack>Error</Ack>')) {
      const { errors: trueErrors, warnings } = parseEbayErrors(addRes.data);
      if (warnings.length) console.warn('[draft] eBay warnings:', warnings.join(' | '));

      // Auto-retry: if the only blocking error is an invalid condition, fall back to 3000 (Used)
      const isConditionError = trueErrors.length > 0 && trueErrors.every(e =>
        e.toLowerCase().includes('condition') && (e.toLowerCase().includes('invalid') || e.toLowerCase().includes('not valid'))
      );
      if (isConditionError && conditionId !== '3000') {
        console.warn(`[draft] Condition ${conditionId} invalid for category ${config.categoryId} — retrying with 3000 (Used)`);
        const retryXml = addItemXml.replace(`<ConditionID>${conditionId}</ConditionID>`, '<ConditionID>3000</ConditionID>');
        const retryRes = await axios.post(TRADING_URL, retryXml, {
          headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
        });
        if (!retryRes.data.includes('<Ack>Failure</Ack>') && !retryRes.data.includes('<Ack>Error</Ack>')) {
          const retryItemId = retryRes.data.match(/<ItemID>(.*?)<\/ItemID>/)?.[1] || 'Unknown ID';
          console.log(`[draft] Retry succeeded with condition 3000. Item ID: ${retryItemId}`);
          return { draftId: retryItemId, conditionFallback: true, warnings };
        }
        const { errors: retryErrors, warnings: retryWarnings } = parseEbayErrors(retryRes.data);
        const e = new Error('eBay API Error: ' + retryErrors.join(' | '));
        e.status = 400;
        e.warnings = retryWarnings;
        throw e;
      }

      const errorMsg = trueErrors.length > 0 ? trueErrors.join(' | ') : 'Unknown Trading API Error';
      console.error('[draft] eBay errors:', errorMsg);
      const e = new Error('eBay API Error: ' + errorMsg);
      e.status = 400;
      e.warnings = warnings;
      throw e;
    }
    const itemIdMatch = addRes.data.match(/<ItemID>(.*?)<\/ItemID>/);
    const draftId = itemIdMatch ? itemIdMatch[1] : 'Unknown ID';
    console.log(`Successfully pushed to eBay! Item ID: ${draftId}`);

    return { draftId, conditionFallback: false, warnings: [] };
}

// Translate any error from pushListingToEbay into an HTTP response on `res`.
function sendEbayPushError(res, error) {
  let msg = error.message;
  if (error?.response?.data) {
    const d = error.response.data;
    if (typeof d === 'string') {
      const m = d.match(/<LongMessage>(.*?)<\/LongMessage>/);
      msg = m ? m[1] : d.substring(0, 400);
    } else if (typeof d === 'object') {
      msg = JSON.stringify(d).substring(0, 400);
    }
  }
  console.error('Node Error:', msg);
  const status = error.status || 500;
  const payload = { error: status === 500 ? `Push failed: ${msg}` : msg };
  if (error.warnings) payload.warnings = error.warnings;
  res.status(status).json(payload);
}

app.post('/api/ebay/draft', async (req, res) => {
  try {
    const result = await pushListingToEbay({ ...req.body, companyId: req.companyId });
    res.json({ success: true, ...result });
  } catch (error) {
    sendEbayPushError(res, error);
  }
});

// Delist + relist: ends the current eBay listing and immediately pushes a fresh
// one (no scheduleDate). Used by the Optimize modal's "Delist & Relist" action
// and by the per-listing "Delist & Relist" button on the Listings tab.
app.post('/api/ebay/relist', async (req, res) => {
  const { oldItemId, listingId, listing } = req.body;
  if (!oldItemId) return res.status(400).json({ error: 'oldItemId required' });
  if (!listing) return res.status(400).json({ error: 'listing required' });
  try {
    const token = await getValidAccessToken(req.companyId);

    // Step 0 — fetch the live SKU + Business Policies from eBay BEFORE delisting,
    // so the relist preserves the exact shipping/return/payment profiles the
    // seller had on the original listing (and the SKU, if the DB record is
    // missing/stale). Falls back silently to caller overrides / user defaults
    // if GetItem fails or the listing doesn't use Business Policies.
    let liveSku = '';
    let livePolicies = { shipping: null, return: null, payment: null };
    let liveCategoryId = null;
    let livePackage = { length: null, width: null, depth: null, lbs: null, oz: null };
    let liveItemSpecifics = {};
    try {
      const getItemXml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${oldItemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`;
      const getItemRes = await axios.post('https://api.ebay.com/ws/api.dll', getItemXml, {
        headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'GetItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
      });
      const xml = getItemRes.data;
      // The first <SKU> in the body is the Item-level SKU (variations come after).
      // Strip a CDATA wrapper if eBay returned one.
      const skuMatch = /<SKU[^>]*>([\s\S]*?)<\/SKU>/.exec(xml);
      let raw = skuMatch ? skuMatch[1].trim() : '';
      const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
      if (cdata) raw = cdata[1];
      liveSku = raw;
      // SellerProfiles only present when the listing uses Business Policies.
      const profilesBlock = /<SellerProfiles>([\s\S]*?)<\/SellerProfiles>/.exec(xml)?.[1] || '';
      livePolicies.shipping = /<ShippingProfileID>(.*?)<\/ShippingProfileID>/.exec(profilesBlock)?.[1] || null;
      livePolicies.return = /<ReturnProfileID>(.*?)<\/ReturnProfileID>/.exec(profilesBlock)?.[1] || null;
      livePolicies.payment = /<PaymentProfileID>(.*?)<\/PaymentProfileID>/.exec(profilesBlock)?.[1] || null;
      // PrimaryCategory.CategoryID — preserves the original eBay leaf category so
      // the relisted item doesn't fall through to the hardcoded default.
      const primaryCatBlock = /<PrimaryCategory>([\s\S]*?)<\/PrimaryCategory>/.exec(xml)?.[1] || '';
      liveCategoryId = /<CategoryID>(.*?)<\/CategoryID>/.exec(primaryCatBlock)?.[1] || null;
      // ShippingPackageDetails — preserve dimensions/weight so calculated-shipping
      // policies don't reject the relist for missing package info.
      const pkgBlock = /<ShippingPackageDetails>([\s\S]*?)<\/ShippingPackageDetails>/.exec(xml)?.[1] || '';
      if (pkgBlock) {
        livePackage.length = /<PackageLength[^>]*>(.*?)<\/PackageLength>/.exec(pkgBlock)?.[1] || null;
        livePackage.width = /<PackageWidth[^>]*>(.*?)<\/PackageWidth>/.exec(pkgBlock)?.[1] || null;
        livePackage.depth = /<PackageDepth[^>]*>(.*?)<\/PackageDepth>/.exec(pkgBlock)?.[1] || null;
        livePackage.lbs = /<WeightMajor[^>]*>(.*?)<\/WeightMajor>/.exec(pkgBlock)?.[1] || null;
        livePackage.oz = /<WeightMinor[^>]*>(.*?)<\/WeightMinor>/.exec(pkgBlock)?.[1] || null;
      }
      // ItemSpecifics — preserve whatever was on the live listing (e.g. Size,
      // Color, Department) so a relist can't drop a category-required aspect
      // that the local DB record lost (typically because the AI optimizer
      // returned a partial itemSpecifics object).
      const specificsBlock = /<ItemSpecifics>([\s\S]*?)<\/ItemSpecifics>/.exec(xml)?.[1] || '';
      if (specificsBlock) {
        const stripCdata = (s) => {
          const m = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(s.trim());
          return m ? m[1] : s.trim();
        };
        for (const m of specificsBlock.matchAll(/<NameValueList>([\s\S]*?)<\/NameValueList>/g)) {
          const nvl = m[1];
          const name = stripCdata(/<Name>([\s\S]*?)<\/Name>/.exec(nvl)?.[1] || '');
          const values = [...nvl.matchAll(/<Value>([\s\S]*?)<\/Value>/g)].map(v => stripCdata(v[1]));
          if (name && values.length > 0) liveItemSpecifics[name] = values.length === 1 ? values[0] : values.join('; ');
        }
      }
      const ack = /<Ack>([^<]+)<\/Ack>/.exec(xml)?.[1] || '?';
      console.log(`[relist] GetItem(${oldItemId}) Ack=${ack} — SKU="${liveSku}" (DB="${listing.sku || ''}"), category=${liveCategoryId}, policies: shipping=${livePolicies.shipping}, return=${livePolicies.return}, payment=${livePolicies.payment}, package: ${livePackage.length}x${livePackage.width}x${livePackage.depth} ${livePackage.lbs}lb ${livePackage.oz}oz, liveSpecifics=${Object.keys(liveItemSpecifics).length} (${Object.keys(liveItemSpecifics).join(',')})`);
    } catch (e) {
      console.warn(`[relist] could not fetch live SKU/policies for ${oldItemId}: ${e.message}`);
    }
    // Prefer live SKU; fall back to whatever the DB record had. Either way,
    // pushListingToEbay will only emit <SKU> when the value is non-empty.
    const finalSku = liveSku || listing.sku || '';
    // For each package field: prefer what's already on the listing (user-entered
    // in the optimize modal); fall back to whatever eBay had on the original item.
    // Merge specifics: live (from eBay) underneath local (DB) so the local
    // edits/AI optimizations still win, but any category-required aspect that
    // exists live but is missing locally (e.g. Size on a clothing listing)
    // gets restored — preventing relist failures like "item specific Size is missing".
    const localSpecifics = listing.itemSpecifics || {};
    const mergedSpecifics = { ...liveItemSpecifics, ...localSpecifics };
    const listingWithSku = {
      ...listing,
      sku: finalSku,
      itemSpecifics: mergedSpecifics,
      packageLength: listing.packageLength || livePackage.length || '',
      packageWidth: listing.packageWidth || livePackage.width || '',
      packageDepth: listing.packageDepth || livePackage.depth || '',
      packageWeightLbs: listing.packageWeightLbs || livePackage.lbs || '',
      packageWeightOz: listing.packageWeightOz || livePackage.oz || '',
    };
    if (liveSku && listingId && liveSku !== listing.sku) {
      try { await updateListing(req.companyId, listingId, { sku: liveSku }); } catch {}
    }
    if (liveCategoryId && listingId && liveCategoryId !== listing.categoryId) {
      try { await updateListing(req.companyId, listingId, { categoryId: liveCategoryId }); } catch {}
    }
    // Persist any newly-discovered package dimensions back to the DB so future
    // pushes/relists have them locally and the modal pre-populates correctly.
    if (listingId) {
      const pkgPatch = {};
      if (livePackage.length && !listing.packageLength) pkgPatch.packageLength = String(livePackage.length);
      if (livePackage.width && !listing.packageWidth) pkgPatch.packageWidth = String(livePackage.width);
      if (livePackage.depth && !listing.packageDepth) pkgPatch.packageDepth = String(livePackage.depth);
      if (livePackage.lbs && !listing.packageWeightLbs) pkgPatch.packageWeightLbs = String(livePackage.lbs);
      if (livePackage.oz && !listing.packageWeightOz) pkgPatch.packageWeightOz = String(livePackage.oz);
      if (Object.keys(pkgPatch).length > 0) {
        try { await updateListing(req.companyId, listingId, pkgPatch); } catch {}
      }
    }

    // Step 1 — end the current listing
    const endXml = `<?xml version="1.0" encoding="utf-8"?>
<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${oldItemId}</ItemID>
  <EndingReason>NotAvailable</EndingReason>
</EndFixedPriceItemRequest>`;
    const endRes = await axios.post('https://api.ebay.com/ws/api.dll', endXml, {
      headers: { 'X-EBAY-API-COMPATIBILITY-LEVEL': '1331', 'X-EBAY-API-CALL-NAME': 'EndFixedPriceItem', 'X-EBAY-API-SITEID': '0', 'X-EBAY-API-IAF-TOKEN': token, 'Content-Type': 'text/xml' }
    });
    // Treat any "already ended/closed/inactive" variant as non-fatal so partial
    // relists can recover (the seller's intent is "end + relist"; if it's already
    // ended, just proceed to the relist step).
    if (endRes.data.includes('<Ack>Failure</Ack>')) {
      const longMsg = endRes.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || '';
      const recoverable = /already (?:ended|closed|been ended|been closed)|not active|no longer active|cannot be ended|auction.*closed|listing.*ended/i.test(longMsg);
      if (!recoverable) {
        return res.status(400).json({ error: 'End listing failed: ' + (longMsg || 'Unknown error') });
      }
      console.warn(`[relist] EndFixedPriceItem returned recoverable failure (${oldItemId}): ${longMsg}`);
    }

    // Step 2 — push a fresh listing immediately (no scheduleDate). Live policies
    // from Step 0 take precedence over caller-supplied overrides; if Step 0
    // returned nothing, the caller's overrides (or user defaults) win.
    const result = await pushListingToEbay({
      listing: listingWithSku,
      overrideCategoryId: liveCategoryId || req.body.overrideCategoryId || listing.categoryId,
      overrideConditionId: req.body.overrideConditionId,
      overrideFulfillmentPolicyId: livePolicies.shipping || req.body.overrideFulfillmentPolicyId,
      overrideReturnPolicyId: livePolicies.return || req.body.overrideReturnPolicyId,
      overridePaymentPolicyId: livePolicies.payment || req.body.overridePaymentPolicyId,
      bestOffer: req.body.bestOffer,
      companyId: req.companyId,
    });

    // Step 3 — sync the local DB record with the new eBay item ID
    if (listingId) {
      try {
        await updateListing(req.companyId, listingId, { ebayDraftId: result.draftId, updatedAt: Date.now() });
      } catch (e) {
        console.warn(`[relist] failed to update listing ${listingId} with new draftId ${result.draftId}: ${e.message}`);
      }
    }

    res.json({ success: true, ...result, oldItemId });
  } catch (error) {
    sendEbayPushError(res, error);
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

// ─── Listing Optimizer ───────────────────────────────────────────────────────

app.get('/api/optimizer/fetch', async (req, res) => {
  const { itemId } = req.query;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    const data = await fetchListingForOptimizer(itemId.trim(), req.companyId);
    res.json(data);
  } catch (e) {
    console.error('[optimizer/fetch] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/optimizer/comps', async (req, res) => {
  const { query, categoryId } = req.query;
  if (!query) return res.status(400).json({ error: 'query required' });
  try {
    const comps = await fetchSoldComps(query.trim(), categoryId || '');
    res.json({ comps });
  } catch (e) {
    console.error('[optimizer/comps] error:', e.message);
    // Return empty rather than error so UI degrades gracefully
    res.json({ comps: [], error: e.message });
  }
});

app.post('/api/optimizer/ai-optimize', async (req, res) => {
  const { listingData } = req.body;
  if (!listingData) return res.status(400).json({ error: 'listingData required' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
  try {
    const collectionsForAi = await catalog.getCollectionsForAI(req.companyId);
    const result = await aiOptimizeListing(listingData, process.env.GEMINI_API_KEY, collectionsForAi);
    if (result.tokenUsage) {
      incrementTokenUsage(req.companyId, result.tokenUsage.promptTokens, result.tokenUsage.completionTokens).catch(() => {});
    }
    res.json(result);
  } catch (e) {
    console.error('[optimizer/ai-optimize] error:', e.message);
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

    // Remove all eBay-imported listings — keeps only listings created natively in the app.
    const purgeResult = await db.collection('listings').deleteMany({ importedFromEbay: true });
    if (purgeResult.deletedCount > 0) {
      console.log(`[bootstrap] Purged ${purgeResult.deletedCount} imported eBay listings`);
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
