require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { generateListing, generateListingFromUrls } = require('./ai');
const { getAuthUrl, exchangeCodeForToken, getValidAccessToken, hasValidSession, getTokenExpiry } = require('./ebayAuth');
const { getListings, createListing, updateListing, deleteListing, getAllListingsMeta } = require('./listings');
const { uploadImage } = require('./cloudinary');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static React files
app.use(express.static(path.join(__dirname, 'public')));

// Global Security Middleware (v4)
app.use((req, res, next) => {
  // Exempt the eBay OAuth callback from the password gate because the 
  // browser redirects here directly from eBay without custom headers
  if (req.path === '/api/ebay/callback') {
    return next();
  }
  if (req.path.startsWith('/api/') && req.headers['x-app-password'] !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized: Invalid App Password" });
  }
  next();
});

const PORT = process.env.PORT || 3001;
const EBAY_API_BASE = 'https://api.ebay.com';

// GET /api/verify-password
// Simple endpoint to let the frontend know if their password was valid under the global middleware
app.get('/api/verify-password', (req, res) => {
  res.json({ success: true });
});

// GET /api/ebay/token-info
app.get('/api/ebay/token-info', async (req, res) => {
  try {
    res.json(await getTokenExpiry());
  } catch (e) {
    res.json({ refresh_token_expires_at: null });
  }
});

// GET /api/ebay/auth-status
app.get('/api/ebay/auth-status', async (req, res) => {
  try {
    const connected = await hasValidSession();
    console.log('[auth-status] hasValidSession =', connected);
    res.json({ connected });
  } catch (error) {
    console.error('[auth-status] error:', error.message);
    res.json({ connected: false });
  }
});

// GET /api/ebay/auth-url
app.get('/api/ebay/auth-url', (req, res) => {
  try {
    const url = getAuthUrl();
    res.json({ url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ebay/callback
app.get('/api/ebay/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('No authorization code provided.');
  }
  
  try {
    await exchangeCodeForToken(code);
    res.redirect('/');
  } catch (error) {
    console.error('OAuth Callback Error:', error.message);
    res.status(500).send('Failed to authenticate with eBay.');
  }
});

// GET /api/listings?status=staged|listed
app.get('/api/listings', async (req, res) => {
  try {
    const status = req.query.status || 'staged';
    const listings = await getListings(status);
    console.log(`[listings] GET status=${status} -> ${listings.length} results`);
    res.json(listings);
  } catch (e) {
    console.error('[listings] GET error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/listings
app.post('/api/listings', async (req, res) => {
  try {
    const listing = req.body.listing;
    console.log(`[listings] POST id=${listing?.id} status=${listing?.status} title=${listing?.title?.substring(0, 40)}`);
    await createListing(listing);
    console.log(`[listings] POST saved ok`);
    res.json({ success: true });
  } catch (e) {
    console.error('[listings] POST error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/listings/:id
app.put('/api/listings/:id', async (req, res) => {
  try {
    await updateListing(req.params.id, req.body.updates);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/listings/debug — shows everything in the collection without status filter
app.get('/api/listings/debug', async (req, res) => {
  try {
    const all = await getAllListingsMeta();
    res.json({ total: all.length, items: all });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/listings/:id
app.delete('/api/listings/:id', async (req, res) => {
  try {
    await deleteListing(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/images/upload
app.post('/api/images/upload', async (req, res) => {
  try {
    const { images } = req.body; // array of base64 data URLs
    if (!Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'No images provided' });
    }
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ error: 'Cloudinary not configured on server' });
    }
    console.log(`[images/upload] Uploading ${images.length} image(s) to Cloudinary...`);
    const urls = await Promise.all(images.map(img => uploadImage(img)));
    console.log(`[images/upload] Done. URLs:`, urls);
    res.json({ urls });
  } catch (e) {
    console.error('[images/upload] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/generate-from-urls  — re-analyze an existing listing using Cloudinary image URLs
app.post('/api/generate-from-urls', async (req, res) => {
  try {
    const { imageUrls, instructions } = req.body;
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
    const result = await generateListingFromUrls(imageUrls || [], instructions || '', process.env.GEMINI_API_KEY);
    res.json(result);
  } catch (e) {
    console.error('[generate-from-urls] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ebay/categories?query=  — Trading API category suggestions
app.get('/api/ebay/categories', async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    if (!query) return res.json([]);
    const token = await getValidAccessToken();
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

// In-memory cache for the application-level OAuth token (Client Credentials flow)
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
  _appTokenExpiry = Date.now() + (resp.data.expires_in * 1000) - 60000; // 1 min buffer
  console.log('[app-token] fetched new application token');
  return _appToken;
}

// GET /api/ebay/sold-comps?query=  — eBay Browse API current listings for price research
// (The deprecated Finding API was rate-limited; Browse API is the modern replacement)
app.get('/api/ebay/sold-comps', async (req, res) => {
  try {
    const query = (req.query.query || '').trim();
    if (!query) return res.json({ items: [], error: null });

    console.log(`[sold-comps] Browse API query="${query}"`);
    const token = await getApplicationToken();

    const resp = await axios.get('https://api.ebay.com/buy/browse/v1/item_summary/search', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
        'Content-Type': 'application/json'
      },
      params: {
        q: query,
        limit: 6,
        filter: 'buyingOptions:{FIXED_PRICE}',
        sort: 'price'
      }
    });

    const summaries = resp.data?.itemSummaries || [];
    console.log(`[sold-comps] Browse API returned ${summaries.length} items`);
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
    if (e.response?.data) console.error('[sold-comps] body:', JSON.stringify(e.response.data).substring(0, 400));
    res.json({ items: [], error: e.message + detail });
  }
});

// POST /api/generate (Moved from Frontend)
app.post('/api/generate', async (req, res) => {
  try {
    const { imageParts, instructions } = req.body;
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'YOUR_GEMINI_KEY_HERE') {
      return res.status(500).json({ error: "Server missing GEMINI_API_KEY. Please configure the .env file." });
    }
    const result = await generateListing(imageParts, instructions, process.env.GEMINI_API_KEY);
    res.json(result);
  } catch (error) {
    console.error("AI Generation Error:", error.message);
    res.status(500).json({ error: error.message || "Failed to generate AI listing" });
  }
});

// GET /api/ebay/settings
// Automatically fetches the first available policy IDs and merchant location
app.get('/api/ebay/settings', async (req, res) => {
  try {
    const token = await getValidAccessToken();
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Language': 'en-US'
    };

    const [fulfillmentRes, paymentRes, returnRes, locationRes] = await Promise.all([
      axios.get(`${EBAY_API_BASE}/sell/account/v1/fulfillment_policy`, { headers }).catch(e => e.response || e),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/payment_policy`, { headers }).catch(e => e.response || e),
      axios.get(`${EBAY_API_BASE}/sell/account/v1/return_policy`, { headers }).catch(e => e.response || e),
      axios.get(`${EBAY_API_BASE}/sell/inventory/v1/location`, { headers }).catch(e => e.response || e)
    ]);

    if (fulfillmentRes.status !== 200 || paymentRes.status !== 200 || returnRes.status !== 200) {
      console.error("eBay API Error Data:", fulfillmentRes.data || fulfillmentRes);
      return res.status(400).json({ error: `eBay APIs rejected the request. Does your token have 'sell.account.readonly' and 'sell.inventory.readonly' scopes? Status: ${fulfillmentRes.status}` });
    }

    const fulfillmentPolicy = fulfillmentRes.data?.fulfillmentPolicies?.[0]?.fulfillmentPolicyId || '';
    const paymentPolicy = paymentRes.data?.paymentPolicies?.[0]?.paymentPolicyId || '';
    const returnPolicy = returnRes.data?.returnPolicies?.[0]?.returnPolicyId || '';
    const merchantLocation = locationRes.data?.locations?.[0]?.merchantLocationKey || '';

    res.json({
      fulfillmentPolicy,
      paymentPolicy,
      returnPolicy,
      merchantLocation
    });

  } catch (error) {
    console.error('Error fetching settings:', error.message);
    res.status(500).json({ error: 'Failed to auto-fetch settings from eBay APIs' });
  }
});

// GET /api/ebay/listing-stats?itemId=  — fetch view count and watcher count via GetItem Trading API
app.get('/api/ebay/listing-stats', async (req, res) => {
  const { itemId } = req.query;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    const token = await getValidAccessToken();
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <IncludeWatchCount>true</IncludeWatchCount>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;
    const resp = await axios.post('https://api.ebay.com/ws/api.dll', xml, {
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
        'X-EBAY-API-CALL-NAME': 'GetItem',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': 'text/xml'
      }
    });
    const body = resp.data;
    const get = (tag) => { const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`); const x = r.exec(body); return x ? x[1].trim() : null; };
    res.json({
      watchCount: get('WatchCount') || '0',
      hitCount: get('HitCount') || '0',
      viewCount: get('ViewItemURLForNaturalSearch') ? get('HitCount') : '0',
      timeLeft: get('TimeLeft') || '',
      quantity: get('Quantity') || '',
      quantitySold: get('QuantitySold') || '0',
    });
  } catch (e) {
    console.error('[listing-stats] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ebay/sold-items  — fetch recently sold items from GetMyeBaySelling Trading API
app.get('/api/ebay/sold-items', async (req, res) => {
  try {
    const token = await getValidAccessToken();
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
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': 'text/xml'
      }
    });
    const body = resp.data;
    // Parse sold items from XML
    const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
    const items = [];
    let m;
    while ((m = itemRegex.exec(body)) !== null) {
      const block = m[1];
      const get = (tag) => { const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`); const x = r.exec(block); return x ? x[1].trim() : ''; };
      items.push({
        itemId: get('ItemID'),
        title: get('Title'),
        soldPrice: get('CurrentPrice') || get('SalePrice') || '',
        soldDate: get('LastModifiedTime') || '',
        quantitySold: get('QuantitySold') || '1',
      });
    }
    res.json({ items });
  } catch (e) {
    console.error('[sold-items] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ebay/draft
// Rewritten for V4: Uses eBay XML Trading API to support EPS Image Uploads and Scheduled Drafts
app.post('/api/ebay/draft', async (req, res) => {
  const { listing } = req.body;

  const config = {
    fulfillmentPolicy: process.env.EBAY_FULFILLMENT_POLICY_ID,
    paymentPolicy: process.env.EBAY_PAYMENT_POLICY_ID,
    returnPolicy: process.env.EBAY_RETURN_POLICY_ID,
    categoryId: process.env.EBAY_DEFAULT_CATEGORY_ID || "261068"
  };

  try {
    const token = await getValidAccessToken();
    console.log(`--- Initiating XML Trading API push to eBay for: ${listing.title} ---`);
    const TRADING_URL = 'https://api.ebay.com/ws/api.dll';

    // 1. Upload Images to EPS (eBay Picture Services)
    const uploadedPictureUrls = [];
    if (listing.images && listing.images.length > 0) {
      console.log(`Uploading ${listing.images.length} images to eBay EPS...`);
      for (let i = 0; i < listing.images.length; i++) {
        let imageBytes;
        let format = 'jpeg';

        if (listing.images[i].startsWith('http')) {
          // Cloudinary or other URL — download the bytes
          console.log(`Downloading image ${i + 1} from URL: ${listing.images[i].substring(0, 60)}...`);
          const urlPath = listing.images[i].split('?')[0];
          const ext = urlPath.split('.').pop()?.toLowerCase();
          if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) format = ext === 'jpg' ? 'jpeg' : ext;
          const imgRes = await axios.get(listing.images[i], { responseType: 'arraybuffer' });
          imageBytes = Buffer.from(imgRes.data);
        } else {
          // Base64 data URL
          const headerMatch = listing.images[i].match(/^data:image\/([a-zA-Z0-9]+);base64,/);
          if (headerMatch) format = headerMatch[1];
          const base64Data = listing.images[i].split(',')[1] || listing.images[i];
          if (!base64Data) continue;
          imageBytes = Buffer.from(base64Data, 'base64');
        }

        console.log(`Uploading image ${i + 1} of format: ${format}`);
        // eBay EPS is highly prone to "File has corrupt image data" errors when sending Base64 purely inside XML.
        // The safest and only officially fully-supported method is MIME multipart/form-data.
        const xmlPayload = `<?xml version="1.0" encoding="utf-8"?>
<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <PictureName>image_${i}.${format}</PictureName>
  <PictureSet>Standard</PictureSet>
  <ExtensionInDays>30</ExtensionInDays>
</UploadSiteHostedPicturesRequest>`;

        const boundary = '----eBayEpsBoundary12345' + Date.now() + i;
        const part1 = Buffer.from(
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="XML Payload"\r\n` +
          `Content-Type: text/xml\r\n\r\n` +
          xmlPayload + `\r\n` +
          `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="dummy"; filename="image_${i}.${format}"\r\n` +
          `Content-Type: application/octet-stream\r\n\r\n`
        );
        const part3 = Buffer.from(`\r\n--${boundary}--\r\n`);
        const finalPayload = Buffer.concat([part1, imageBytes, part3]);

        const picRes = await axios.post(TRADING_URL, finalPayload, {
          headers: {
            'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
            'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
            'X-EBAY-API-SITEID': '0',
            'X-EBAY-API-IAF-TOKEN': token,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
          }
        });
        
        const match = picRes.data.match(/<FullURL>(.*?)<\/FullURL>/);
        if (match && match[1]) {
          uploadedPictureUrls.push(match[1]);
        } else {
          console.warn('Failed to upload image. XML Response:', picRes.data);
          const errMsg = picRes.data.match(/<LongMessage>(.*?)<\/LongMessage>/);
          return res.status(400).json({ error: 'eBay EPS Image Upload Failed: ' + (errMsg ? errMsg[1] : 'Unknown error') });
        }
      }
    }

    if (listing.images && listing.images.length > 0 && uploadedPictureUrls.length === 0) {
      return res.status(400).json({ error: 'All image uploads to eBay failed. Check server console for details.' });
    }

    // Parse numeric price
    const rawPrice = (listing.priceRecommendation || '').replace(/[^0-9.]/g, '');
    const validPrice = rawPrice && !isNaN(parseFloat(rawPrice)) ? parseFloat(rawPrice).toFixed(2) : "50.00";
    
    // Condition mapping: Assume 3000 (Used) unless condition string specifically indicates New exclusively
    const isNew = listing.condition.toLowerCase().includes('new') && !listing.condition.toLowerCase().includes('like new');
    const conditionId = isNew ? "1000" : "3000";

    // Set ScheduleTime 21 days in the future to keep it as an editable draft
    const scheduleDate = new Date();
    scheduleDate.setDate(scheduleDate.getDate() + 21);
    const scheduleTimeStr = scheduleDate.toISOString();

    // Construct PictureDetails XML
    let pictureDetailsXml = '';
    if (uploadedPictureUrls.length > 0) {
      pictureDetailsXml = '<PictureDetails>\n';
      uploadedPictureUrls.forEach(url => {
        pictureDetailsXml += `<PictureURL>${url}</PictureURL>\n`;
      });
      pictureDetailsXml += '</PictureDetails>';
    }

    // Construct ItemSpecifics XML dynamically from AI dictionary
    let itemSpecificsXml = '';
    if (listing.itemSpecifics && Object.keys(listing.itemSpecifics).length > 0) {
      itemSpecificsXml = '<ItemSpecifics>\n' + Object.entries(listing.itemSpecifics).map(([name, val]) => `
        <NameValueList>
          <Name><![CDATA[${name}]]></Name>
          <Value><![CDATA[${val}]]></Value>
        </NameValueList>`).join('\n') + '\n</ItemSpecifics>';
    }

    // 2. Create the Scheduled Listing (Draft)
    console.log('Pushing AddFixedPriceItem Schedule payload...');
    const addItemXml = `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title><![CDATA[${listing.title.substring(0, 80)}]]></Title>
    ${listing.sku ? `<SKU><![CDATA[${listing.sku}]]></SKU>` : ''}
    <Description><![CDATA[${listing.description}]]></Description>
    <PrimaryCategory>
      <CategoryID>${config.categoryId}</CategoryID>
    </PrimaryCategory>
    <StartPrice currencyID="USD">${validPrice}</StartPrice>
    <ConditionID>${conditionId}</ConditionID>
    <Country>US</Country>
    <Currency>USD</Currency>
    <DispatchTimeMax>3</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    ${pictureDetailsXml}
    ${itemSpecificsXml}
    <PostalCode>90210</PostalCode>
    <Location><![CDATA[United States]]></Location>
    <SellerProfiles>
      <SellerPaymentProfile>
        <PaymentProfileID>${config.paymentPolicy}</PaymentProfileID>
      </SellerPaymentProfile>
      <SellerReturnProfile>
        <ReturnProfileID>${config.returnPolicy}</ReturnProfileID>
      </SellerReturnProfile>
      <SellerShippingProfile>
        <ShippingProfileID>${config.fulfillmentPolicy}</ShippingProfileID>
      </SellerShippingProfile>
    </SellerProfiles>
    <ScheduleTime>${scheduleTimeStr}</ScheduleTime>
  </Item>
</AddFixedPriceItemRequest>`;

    const addRes = await axios.post(TRADING_URL, addItemXml, {
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
        'X-EBAY-API-CALL-NAME': 'AddFixedPriceItem',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': 'text/xml'
      }
    });

    if (addRes.data.includes('<Ack>Failure</Ack>') || addRes.data.includes('<Ack>Error</Ack>')) {
      const errorMatches = [...addRes.data.matchAll(/<LongMessage>(.*?)<\/LongMessage>/g)];
      const errorMsg = errorMatches.length > 0 ? errorMatches.map(m => m[1]).join(' | ') : 'Unknown Trading API Error';
      console.error("eBay Trading API Error:", errorMsg);
      // Try to dump full text if it's super vague
      console.log(addRes.data);
      return res.status(400).json({ error: 'eBay API Error: ' + errorMsg });
    }

    const itemIdMatch = addRes.data.match(/<ItemID>(.*?)<\/ItemID>/);
    const draftId = itemIdMatch ? itemIdMatch[1] : 'Unknown ID';
    
    console.log(`Successfully pushed to eBay! Scheduled Item ID: ${draftId}`);
    res.json({ success: true, draftId: draftId });
    
  } catch (error) {
    console.error('Node Error:', error.message);
    if (error.response) console.error('Response:', error.response.data);
    res.status(500).json({ error: 'Failed to push scheduled draft to eBay via XML' });
  }
});

// Catch-all to send React SPA for non-api routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// POST /api/images/remove-bg  — remove background from a base64 image using remove.bg API
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

// GET /api/barcode?upc=  — look up product info by UPC/EAN barcode
app.get('/api/barcode', async (req, res) => {
  const { upc } = req.query;
  if (!upc) return res.status(400).json({ error: 'upc query param required' });
  console.log(`[barcode] looking up UPC: ${upc}`);
  try {
    // Try Open Food Facts first (free, no key)
    const offResp = await axios.get(`https://world.openfoodfacts.org/api/v0/product/${upc}.json`, { timeout: 5000 });
    if (offResp.data?.status === 1 && offResp.data?.product) {
      const p = offResp.data.product;
      return res.json({
        title: p.product_name_en || p.product_name || '',
        brand: p.brands || '',
        category: p.categories_tags?.[0]?.replace('en:', '') || '',
        description: p.generic_name_en || p.generic_name || '',
        source: 'Open Food Facts'
      });
    }
    // Fallback: UPC Item DB (free tier)
    const upcResp = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`, { timeout: 5000 });
    const item = upcResp.data?.items?.[0];
    if (item) {
      return res.json({
        title: item.title || '',
        brand: item.brand || '',
        category: item.category || '',
        description: item.description || '',
        source: 'UPC Item DB'
      });
    }
    res.json({ title: '', brand: '', category: '', description: '', source: null });
  } catch (e) {
    console.error('[barcode] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`eBay Proxy Server running locally on http://localhost:${PORT}`);
  const key = process.env.GEMINI_API_KEY;
  if (key) {
    console.log(`GEMINI_API_KEY loaded: ${key.substring(0, 8)}... (length: ${key.length})`);
  } else {
    console.log(`GEMINI_API_KEY: NOT SET`);
  }
});
