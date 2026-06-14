const axios = require('axios');
const { getValidAccessToken } = require('./ebayAuth');
const { getApplicationToken } = require('./services/ebay/applicationToken');
const { BROWSE_API_URL } = require('./services/ebay/client');

// @google/genai is ESM-only; load it lazily so this CJS module can require it.
let _GoogleGenAI = null;
async function loadGenAI() {
  if (!_GoogleGenAI) {
    const mod = await import('@google/genai');
    _GoogleGenAI = mod.GoogleGenAI;
  }
  return _GoogleGenAI;
}

// Disable Gemini 2.5 "thinking" — we just need structured listing output.
const GENERATION_CONFIG = { thinkingConfig: { thinkingBudget: 0 } };

// AI-001 prompt registry — see services/ai/prompts.js.
const { optimizerPrompt, OPTIMIZER_VERSION } = require('./services/ai/prompts');
// P1.6 — shared Gemini model discovery + preference ordering.
const { getBestGeminiModel } = require('./services/ai/modelSelect');

// ─── XML Helpers ──────────────────────────────────────────────────────────────

function extractTag(xml, tag) {
  const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = r.exec(xml);
  if (!m) return null;
  return m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
}

function extractAllBlocks(xml, tag) {
  const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'g');
  const results = [];
  let m;
  while ((m = r.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

// ─── Fetch listing via GetItem ────────────────────────────────────────────────

async function fetchListingForOptimizer(itemId, companyId) {
  const token = await getValidAccessToken(companyId);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeWatchCount>true</IncludeWatchCount>
</GetItemRequest>`;

  const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
    headers: {
      'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
      'X-EBAY-API-CALL-NAME': 'GetItem',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-IAF-TOKEN': token,
      'Content-Type': 'text/xml',
    },
  });

  const body = resp.data;
  if (body.includes('<Ack>Failure</Ack>')) {
    const err = body.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Failed to fetch listing';
    throw new Error(err);
  }

  // Ownership check — compare seller UserID against authenticated account
  const sellerBlock = extractTag(body, 'Seller');
  const sellerUserId = sellerBlock ? extractTag(sellerBlock, 'UserID') : null;

  let myUserId = null;
  try {
    const meXml = `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
</GetUserRequest>`;
    const meResp = await axios.post('https://api.ebay.com/ws/api.dll', meXml, {
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
        'X-EBAY-API-CALL-NAME': 'GetUser',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': 'text/xml',
      },
    });
    const userBlock = extractTag(meResp.data, 'User');
    myUserId = userBlock ? extractTag(userBlock, 'UserID') : extractTag(meResp.data, 'UserID');
  } catch (e) {
    console.warn('[optimizer] Could not verify seller identity:', e.message);
  }

  const isOwner = !!(myUserId && sellerUserId && myUserId.toLowerCase() === sellerUserId.toLowerCase());

  // Basic fields
  const itemBlock = extractTag(body, 'Item');
  const title = (itemBlock ? extractTag(itemBlock, 'Title') : null) || extractTag(body, 'Title') || '';

  // Category
  const primaryCatBlock = extractTag(body, 'PrimaryCategory');
  const categoryId = primaryCatBlock ? extractTag(primaryCatBlock, 'CategoryID') : null;
  const categoryName = primaryCatBlock ? extractTag(primaryCatBlock, 'CategoryName') : null;

  // Price
  const sellingStatusBlock = extractTag(body, 'SellingStatus');
  const currentPrice = sellingStatusBlock
    ? extractTag(sellingStatusBlock, 'CurrentPrice') || extractTag(sellingStatusBlock, 'ConvertedCurrentPrice')
    : null;
  const startPrice = extractTag(body, 'StartPrice') || '0';
  const price = parseFloat((currentPrice || startPrice || '0').replace(/[^0-9.]/g, '') || '0');

  // Condition
  const conditionId = extractTag(body, 'ConditionID') || '';
  const conditionName = extractTag(body, 'ConditionDisplayName') || '';

  // Description (may be very long HTML)
  const description = extractTag(body, 'Description') || '';

  // Stats
  const watchCount = parseInt(extractTag(body, 'WatchCount') || '0', 10);
  const hitCount = parseInt(extractTag(body, 'HitCount') || '0', 10);
  const listingStatus = extractTag(body, 'ListingStatus') || '';
  const timeLeft = extractTag(body, 'TimeLeft') || '';
  const quantity = parseInt(extractTag(body, 'Quantity') || '1', 10);
  const quantitySold = parseInt(extractTag(body, 'QuantitySold') || '0', 10);
  const sku = extractTag(body, 'SKU') || '';

  // Shipping
  const shippingBlock = extractTag(body, 'ShippingDetails');
  const shippingType = shippingBlock ? extractTag(shippingBlock, 'ShippingType') : '';
  const shippingServiceCost = shippingBlock
    ? extractTag(shippingBlock, 'ShippingServiceCost') || ''
    : '';

  // Item specifics
  const itemSpecifics = {};
  const nvlBlocks = extractAllBlocks(body, 'NameValueList');
  nvlBlocks.forEach(block => {
    const name = extractTag(block, 'Name');
    const value = extractTag(block, 'Value');
    if (name && value) itemSpecifics[name] = value;
  });

  // Images
  const pictureBlock = extractTag(body, 'PictureDetails');
  const images = pictureBlock
    ? extractAllBlocks(pictureBlock, 'PictureURL').filter(u => u.startsWith('http'))
    : [];

  // Category specifics (required/recommended fields)
  let categorySpecifics = [];
  if (categoryId) {
    try {
      const catXml = `<?xml version="1.0" encoding="utf-8"?>
<GetCategorySpecificsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <CategoryID>${categoryId}</CategoryID>
</GetCategorySpecificsRequest>`;
      const catResp = await axios.post('https://api.ebay.com/ws/api.dll', catXml, {
        headers: {
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
          'X-EBAY-API-CALL-NAME': 'GetCategorySpecifics',
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-IAF-TOKEN': token,
          'Content-Type': 'text/xml',
        },
      });
      const nameRecBlocks = extractAllBlocks(catResp.data, 'NameRecommendation');
      nameRecBlocks.forEach(block => {
        const name = extractTag(block, 'Name');
        if (!name) return;
        const validationBlock = extractTag(block, 'ValidationRules');
        const usage = validationBlock ? extractTag(validationBlock, 'UsageConstraint') : null;
        categorySpecifics.push({
          name,
          required: usage === 'Required',
          recommended: usage === 'Recommended',
        });
      });
    } catch (e) {
      console.warn('[optimizer] GetCategorySpecifics error:', e.message);
    }
  }

  return {
    itemId,
    isOwner,
    sellerUserId: sellerUserId || '',
    myUserId: myUserId || '',
    title,
    categoryId: categoryId || '',
    categoryName: categoryName || '',
    price,
    conditionId,
    conditionName,
    description,
    watchCount,
    hitCount,
    listingStatus,
    timeLeft,
    quantity,
    quantitySold,
    sku,
    shippingType: shippingType || '',
    shippingServiceCost,
    itemSpecifics,
    images,
    categorySpecifics,
  };
}

// ─── Fetch market comps via the Browse API ───────────────────────────────────
//
// P0.1 — this used to call eBay's Finding API `findCompletedItems` for *sold*
// comps. eBay has deprecated the Finding API and restricted the sold/completed
// search, so that path returned errors/empty in production. We now use the
// Browse API (the same supported source the Repricing Advisor already uses),
// which returns *active* listings — NOT sold data. Callers / UI must label
// these as "active market comps", not "sold comps".
//
// If/when Marketplace Insights API access is granted, swap this implementation
// to pull true sold data; the return shape is kept stable so callers don't
// need to change.
async function fetchActiveComps(keywords, categoryId) {
  const token = await getApplicationToken();

  const params = {
    q: keywords,
    limit: 12,
    filter: 'buyingOptions:{FIXED_PRICE}',
    sort: 'price',
  };
  if (categoryId) params.category_ids = String(categoryId);

  const resp = await axios.get(BROWSE_API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      'Content-Type': 'application/json',
    },
    params,
  });

  const summaries = resp.data?.itemSummaries || [];
  return summaries.map((item) => ({
    title: item.title || '',
    price: parseFloat(item.price?.value || '0'),
    currency: item.price?.currency || 'USD',
    condition: item.condition || '',
    // Browse returns active listings — there is no sold/end date. Kept in the
    // shape for backward compatibility with the existing frontend type.
    endDate: '',
    url: item.itemWebUrl || '',
    image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || '',
  }));
}

// Backward-compatible alias. The route + tests still import `fetchSoldComps`;
// it now resolves to active market comps via the Browse API.
const fetchSoldComps = fetchActiveComps;

// ─── AI Optimize ─────────────────────────────────────────────────────────────

async function aiOptimizeListing(listingData, apiKey) {
  const GoogleGenAI = await loadGenAI();
  const ai = new GoogleGenAI({ apiKey });

  // Pick best available model — prefer flash, then newer versions (P1.6).
  const modelName = await getBestGeminiModel(apiKey);

  const { title, description, itemSpecifics, price, categoryName, conditionName, categorySpecifics } = listingData;

  const required = (categorySpecifics || []).filter(s => s.required).map(s => s.name);
  const recommended = (categorySpecifics || []).filter(s => s.recommended).map(s => s.name);

  const descPlain = (description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 800);
  const currentSpecifics = JSON.stringify(itemSpecifics || {}, null, 2);

  const prompt = optimizerPrompt({
    title,
    categoryName,
    price,
    conditionName,
    descPlain,
    currentSpecifics,
    required,
    recommended,
  });

  const result = await ai.models.generateContent({
    model: modelName,
    contents: prompt,
    config: GENERATION_CONFIG,
  });
  const usage = result.usageMetadata;
  let text = (result.text || '').replace(/```json/g, '').replace(/```/g, '').trim();

  // Handle JSON embedded in extra text
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd !== -1) text = text.substring(jsonStart, jsonEnd + 1);

  const parsed = JSON.parse(text);

  // Enforce 80-char title limit
  if (parsed.title && parsed.title.length > 80) {
    parsed.title = parsed.title.substring(0, 80).trim();
  }

  return {
    ...parsed,
    tokenUsage: {
      promptTokens: usage?.promptTokenCount || 0,
      completionTokens: usage?.candidatesTokenCount || 0,
      totalTokens: (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0),
      model: modelName,
      promptVersion: OPTIMIZER_VERSION,
    },
  };
}

module.exports = { fetchListingForOptimizer, fetchActiveComps, fetchSoldComps, aiOptimizeListing };
