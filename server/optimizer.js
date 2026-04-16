const axios = require('axios');
const { getValidAccessToken } = require('./ebayAuth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

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

// ─── Fetch sold comps via Finding API ────────────────────────────────────────

async function fetchSoldComps(keywords, categoryId) {
  const appId = process.env.EBAY_CLIENT_ID;
  if (!appId) throw new Error('EBAY_CLIENT_ID not configured');

  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
    'RESPONSE-DATA-FORMAT': 'JSON',
    'keywords': keywords,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'paginationInput.entriesPerPage': '12',
    'sortOrder': 'EndTimeSoonest',
  });
  if (categoryId) params.set('categoryId', categoryId);

  const resp = await axios.get(
    `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`
  );

  const items =
    resp.data?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];

  return items
    .filter(item => {
      const sold = item.sellingStatus?.[0]?.sellingState?.[0];
      return sold === 'EndedWithSales';
    })
    .map(item => ({
      title: item.title?.[0] || '',
      price: parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || '0'),
      currency: item.sellingStatus?.[0]?.currentPrice?.[0]?.['@currencyId'] || 'USD',
      condition: item.condition?.[0]?.conditionDisplayName?.[0] || '',
      endDate: item.listingInfo?.[0]?.endTime?.[0] || '',
      url: item.viewItemURL?.[0] || '',
      image: item.galleryURL?.[0] || '',
    }));
}

const COLLECTIONS_FOR_AI = 'OT999:Other, TY100:Toys, TY200:Vintage Toys, TY300:Retro Toys, TY400:Modern Toys, TY500:Collectible Toys, TC100:Trading Cards, TC200:TCG Non-Sports, PK200:Pokémon Cards, YG200:Yu-Gi-Oh Cards, MT200:Magic The Gathering, OP200:One Piece Cards, DB200:Dragon Ball Cards, DG200:Digimon Cards, SC100:Sports Cards, BB200:Baseball Cards, BK200:Basketball Cards, FB200:Football Cards, HK200:Hockey Cards, SC300:Soccer Cards, BX100:Sealed Products, BX200:Booster Boxes/Packs, SL100:Slabbed/Graded Items, FX100:Funko Pops, AC100:Action Figures, ST100:Statues & Figures, PL100:Plush, BD100:Board Games, VG100:Video Games, VG200:Retro Video Games, VG300:Modern Video Games, VC100:Video Game Consoles, CM100:Comics, BK100:Books, GN100:Graphic Novels, MG100:Magazines, AN100:Anime Merchandise, MN100:Manga, MV100:Movies DVD/Blu-ray, MS100:Music Physical Media, RC100:Vinyl Records, CS100:Cassettes, EL100:Electronics, CL100:Clothing, HT100:Hats, SH100:Shoes, JW100:Jewelry, WD100:Watches, HG100:Home Goods, DC100:Home Decor, AR100:Art, PT100:Posters & Prints, SG100:Signed/Autographed, PR100:Promotional Items, EV100:Event Exclusives, LM100:Limited Editions, CH100:Chase/Variant Items, RC200:Rare Items, UL100:High-End/Premium, BU100:Bundles/Lots, CL200:Clearance, NW100:New Arrivals, FT100:Featured Items, TR100:Trending Items, DS100:Discounted Items, VI100:Vintage Items, RT100:Retro Items';

// ─── AI Optimize ─────────────────────────────────────────────────────────────

async function aiOptimizeListing(listingData, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);

  // Pick best available model
  let modelName = 'gemini-1.5-flash';
  try {
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (resp.ok) {
      const data = await resp.json();
      const models = data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent') && m.name?.includes('gemini'))
        .map(m => m.name.replace('models/', ''));
      models.sort((a, b) => {
        if (a.includes('flash') && !b.includes('flash')) return -1;
        if (!a.includes('flash') && b.includes('flash')) return 1;
        return 0;
      });
      if (models.length > 0) modelName = models[0];
    }
  } catch (e) {
    // fall through to default
  }

  const model = genAI.getGenerativeModel({ model: modelName });

  const { title, description, itemSpecifics, price, categoryName, conditionName, categorySpecifics } = listingData;

  const required = (categorySpecifics || []).filter(s => s.required).map(s => s.name);
  const recommended = (categorySpecifics || []).filter(s => s.recommended).map(s => s.name);

  const descPlain = (description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 800);
  const currentSpecifics = JSON.stringify(itemSpecifics || {}, null, 2);

  const prompt = `You are an expert eBay seller, SEO specialist, and Cassini algorithm expert. Optimize the following existing eBay listing.

CURRENT LISTING:
Title (${title.length}/80 chars): "${title}"
Category: "${categoryName}"
Price: $${price}
Condition: ${conditionName}
Description (excerpt): "${descPlain}"
Current Item Specifics:
${currentSpecifics}
${required.length ? `Required Category Specifics (MUST include all): ${required.join(', ')}` : ''}
${recommended.length ? `Recommended Category Specifics: ${recommended.join(', ')}` : ''}

OPTIMIZATION RULES:
- Title must use all 80 characters if possible, NEVER exceed 80
- Front-load most important keywords (brand, model, key feature first)
- Remove filler/spam words: "look", "l@@k", "wow", "nice", "great", "check", "hot", "fast ship", "free ship", "must see", "see pics"
- Description: keep the core content but enhance formatting, add call to action, make scannable with HTML
- Item specifics: include ALL required fields, fill in as many recommended fields as possible using context from the listing
- Price suggestion: based on the listing condition and category, suggest a competitive price

Respond ONLY with a valid JSON object (no markdown wrappers):
{
  "title": "optimized title, max 80 chars",
  "titleRationale": "brief explanation of changes",
  "description": "improved HTML description with inline CSS, headers, bullets, CTA",
  "descriptionRationale": "what was improved",
  "itemSpecifics": { "SpecificName": "Value" },
  "itemSpecificsRationale": "what was added or corrected",
  "priceRecommendation": "suggested price as decimal number string e.g. 49.99",
  "priceRationale": "why this price",
  "seoKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "seoIssues": ["issue 1 found in original title/listing", "issue 2"],
  "overallTips": ["actionable tip 1", "actionable tip 2", "actionable tip 3"],
  "suggestedCollectionCodes": ["CODE1", "CODE2"]
}

For "suggestedCollectionCodes", choose 1-4 codes from this list that best categorize the item: ${COLLECTIONS_FOR_AI}`;

  const result = await model.generateContent([prompt]);
  const usage = result.response.usageMetadata;
  let text = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();

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
    },
  };
}

module.exports = { fetchListingForOptimizer, fetchSoldComps, aiOptimizeListing };
