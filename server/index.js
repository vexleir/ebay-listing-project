require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { generateListing } = require('./ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static React files
app.use(express.static(path.join(__dirname, 'public')));

// Global Security Middleware (v4)
app.use((req, res, next) => {
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
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing eBay API token' });

  try {
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

// POST /api/ebay/draft
// Note: This relies entirely on environment variables now! No frontend payload needed for config.
app.post('/api/ebay/draft', async (req, res) => {
  const { listing } = req.body;
  const token = process.env.EBAY_OAUTH_TOKEN;

  // We explicitly load the Policy IDs from .env now!
  const config = {
    fulfillmentPolicy: process.env.EBAY_FULFILLMENT_POLICY_ID,
    paymentPolicy: process.env.EBAY_PAYMENT_POLICY_ID,
    returnPolicy: process.env.EBAY_RETURN_POLICY_ID,
    merchantLocation: process.env.EBAY_MERCHANT_LOCATION_KEY,
    categoryId: process.env.EBAY_DEFAULT_CATEGORY_ID || "261068"
  };

  if (!token || token === 'YOUR_EBAY_TOKEN_HERE') {
    return res.status(500).json({ error: 'Server missing EBAY_OAUTH_TOKEN in .env' });
  }
  if (!config.fulfillmentPolicy || !config.paymentPolicy || !config.returnPolicy) {
    return res.status(500).json({ error: 'Server missing Policy IDs in .env' });
  }

  try {
    console.log(`--- Initiating live push to eBay for: ${listing.title} ---`);
    
    // 1. Generate a unique SKU for this item
    const sku = `SKU-${Date.now()}`;
    
    // Parse numeric price from recommendation (assuming format string might have "$100" or similar)
    const rawPrice = listing.priceRecommendation.replace(/[^0-9.]/g, '');
    const validPrice = rawPrice && !isNaN(parseFloat(rawPrice)) ? parseFloat(rawPrice).toFixed(2) : "50.00";

    // 2. Create the Inventory Item (Product Details)
    // Note: We skip `imageUrls` because eBay Inventory API requires public HTTPS links, not base64. 
    // Sending base64 strings directly to this endpoint will result in an error.
    const inventoryPayload = {
      product: {
        title: listing.title,
        description: listing.description,
        aspects: {} // We could map itemSpecifics here, but they require strict exact string matching with eBay catalog.
      },
      condition: "USED_EXCELLENT",
      availability: {
        shipToLocationAvailability: {
          quantity: 1
        }
      }
    };

    console.log('Creating Inventory Item...');
    await axios.put(`${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${sku}`, inventoryPayload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Language': 'en-US',
        'Content-Type': 'application/json'
      }
    });

    // 3. Create the Offer (Unpublished Draft)
    const offerPayload = {
      sku: sku,
      marketplaceId: "EBAY_US",
      format: "FIXED_PRICE",
      categoryId: config.categoryId || "261068",
      availableQuantity: 1,
      pricingSummary: {
        price: {
          value: validPrice,
          currency: "USD"
        }
      },
      listingPolicies: {
        fulfillmentPolicyId: config.fulfillmentPolicy,
        paymentPolicyId: config.paymentPolicy,
        returnPolicyId: config.returnPolicy
      },
      merchantLocationKey: config.merchantLocation
    };

    console.log('Creating Offer...');
    const offerResp = await axios.post(`${EBAY_API_BASE}/sell/inventory/v1/offer`, offerPayload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Language': 'en-US',
        'Content-Type': 'application/json'
      }
    });

    const offerId = offerResp.data.offerId;
    console.log(`Successfully pushed to eBay! Offer ID: ${offerId}`);
    
    res.json({ success: true, draftId: offerId, sku: sku });
    
  } catch (error) {
    if (error.response) {
      console.error('eBay API Error Response:', JSON.stringify(error.response.data, null, 2));
      return res.status(error.response.status).json({ error: 'eBay API Error: ' + JSON.stringify(error.response.data.errors) });
    }
    console.error('Node Error:', error.message);
    res.status(500).json({ error: 'Failed to push draft to eBay' });
  }
});

// Catch-all to send React SPA for non-api routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`eBay Proxy Server running locally on http://localhost:${PORT}`);
});
