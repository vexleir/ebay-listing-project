// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVED — Shopify routes extracted verbatim from server/index.js.
//
// This file is NOT loaded or executed. It is a reference snapshot of the four
// Shopify-related regions that previously lived inside server/index.js. The
// original line ranges (in the pre-strip file) are noted on each block.
//
// To re-enable Shopify, paste these blocks back into server/index.js at the
// noted insertion points and restore:
//   - require('./shopifyAuth') at the top
//   - the raw-body middleware (BLOCK A) before app.use(express.json())
//   - the public-route blocks (BLOCK B + C) before authMiddleware
//   - the authenticated routes block (BLOCK D) anywhere after authMiddleware
//   - the auto-crosslist call (BLOCK E) inside the AddFixedPriceItem handler
//
// Helpers used by these blocks: shopifyAuth (./shopifyAuth.js), getDb,
// getValidAccessToken, getSettings, catalog.getCollectionsForAI, axios,
// crypto. They were all already imported in server/index.js.
// ─────────────────────────────────────────────────────────────────────────────


// ═════════════════════════════════════════════════════════════════════════════
// BLOCK A — Raw-body capture for HMAC verification (originally lines 25-35)
// Insert before app.use(express.json(...))
// ═════════════════════════════════════════════════════════════════════════════

// Capture raw body for Shopify webhook HMAC verification before JSON parsing
app.use((req, res, next) => {
  if (req.path === '/api/shopify/webhooks/orders') {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => { req.rawBody = raw; next(); });
  } else {
    next();
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// BLOCK B — Public OAuth callback (originally lines 178-206)
// Insert in the "Public routes (no auth required)" section, before the auth
// middleware is applied.
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/shopify/callback — exempt from auth; Shopify redirects here after OAuth
app.get('/api/shopify/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('No authorization code provided.');
  try {
    const companyId = state ? Buffer.from(state, 'base64').toString('utf8') : 'default';
    console.log(`[shopify-callback] exchanging code for company=${companyId}`);
    await shopifyAuth.exchangeCodeForToken(code, companyId);
    console.log(`[shopify-callback] success for company=${companyId}`);
    res.send(`<!DOCTYPE html><html><head><title>Shopify Connected</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;}
      .box{text-align:center;padding:2rem;background:#1e293b;border-radius:12px;max-width:400px;}
      h2{color:#22c55e;margin-bottom:0.5rem;} p{color:#94a3b8;margin-bottom:1.5rem;}
      a{display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;}</style></head>
      <body><div class="box"><h2>✓ Shopify Connected!</h2>
      <p>Your Shopify store was linked successfully.</p>
      <a href="/">Return to App</a></div></body></html>`);
  } catch (error) {
    console.error('[shopify-callback] error:', error.message);
    res.send(`<!DOCTYPE html><html><head><title>Shopify Connection Failed</title>
      <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#fff;}
      .box{text-align:center;padding:2rem;background:#1e293b;border-radius:12px;max-width:500px;}
      h2{color:#ef4444;margin-bottom:0.5rem;} pre{color:#fca5a5;background:#450a0a;padding:1rem;border-radius:8px;text-align:left;overflow:auto;font-size:0.8rem;white-space:pre-wrap;}
      a{display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;margin-top:1rem;}</style></head>
      <body><div class="box"><h2>✗ Shopify Connection Failed</h2>
      <pre>${error.message}</pre>
      <a href="/">Return to App</a></div></body></html>`);
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// BLOCK C — Public webhook handler (originally lines 208-290)
// Insert just after BLOCK B, still in the public-route section.
//
// NOTE: the original code referenced `now` on line 242 before declaring it on
// line 247. Preserving verbatim — fix this if re-enabling.
// ═════════════════════════════════════════════════════════════════════════════

// POST /api/shopify/webhooks/orders — receives Shopify orders/create webhook
// Public: Shopify calls this directly (no JWT). HMAC-verified instead.
app.post('/api/shopify/webhooks/orders', async (req, res) => {
  // Respond 200 immediately — Shopify retries if we take >5s
  res.sendStatus(200);

  try {
    const hmacHeader = req.headers['x-shopify-hmac-sha256'];
    const secret = process.env.SHOPIFY_CLIENT_SECRET;
    if (secret && hmacHeader && req.rawBody) {
      const computed = crypto.createHmac('sha256', secret).update(req.rawBody, 'utf8').digest('base64');
      if (computed !== hmacHeader) {
        console.warn('[shopify-webhook] HMAC mismatch — ignoring request');
        return;
      }
    }

    const order = req.body;
    const lineItems = order?.line_items || [];
    if (lineItems.length === 0) return;

    const db = await getDb();

    for (const item of lineItems) {
      if (!item.product_id) continue;
      const shopifyProductId = `gid://shopify/Product/${item.product_id}`;

      const listing = await db.collection('listings').findOne({ shopifyProductId });
      if (!listing) continue;
      if (listing.soldAt) continue; // already marked sold

      // Stamp last webhook received time on the company's Shopify config
      await db.collection('config').updateOne(
        { _id: `${listing.companyId}_shopify` },
        { $set: { webhookLastReceivedAt: now } },
        { upsert: true }
      );

      const soldPrice = item.price || '0.00';
      const now = Date.now();

      // Mark listing as sold
      await db.collection('listings').updateOne(
        { _id: listing._id },
        { $set: {
          archived: true,
          soldAt: now,
          soldPrice,
          soldPlatform: 'shopify',
          shopifyStatus: 'unlisted',
          updatedAt: now,
        }}
      );
      console.log(`[shopify-webhook] Marked sold: "${listing.title}" at $${soldPrice}`);

      // Auto-end eBay listing if cross-listed
      if (listing.ebayDraftId) {
        try {
          const token = await getValidAccessToken(listing.companyId);
          const xml = `<?xml version="1.0" encoding="utf-8"?>
<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${listing.ebayDraftId}</ItemID>
  <EndingReason>NotAvailable</EndingReason>
</EndFixedPriceItemRequest>`;
          await axios.post('https://api.ebay.com/ws/api.dll', xml, {
            headers: {
              'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
              'X-EBAY-API-CALL-NAME': 'EndFixedPriceItem',
              'X-EBAY-API-SITEID': '0',
              'X-EBAY-API-IAF-TOKEN': token,
              'Content-Type': 'text/xml',
            }
          });
          console.log(`[shopify-webhook] Auto-ended eBay listing ${listing.ebayDraftId}`);
        } catch (ebayErr) {
          console.error(`[shopify-webhook] Failed to end eBay listing ${listing.ebayDraftId}:`, ebayErr.message);
        }
      }
    }
  } catch (e) {
    console.error('[shopify-webhook] error:', e.message);
  }
});


// ═════════════════════════════════════════════════════════════════════════════
// BLOCK D — Authenticated Shopify routes + helpers (originally lines 481-1477)
// Insert after authMiddleware, anywhere among the other authenticated routes.
// ═════════════════════════════════════════════════════════════════════════════

// ─── Shopify Auth ─────────────────────────────────────────────────────────────

app.get('/api/shopify/auth-status', async (req, res) => {
  try {
    const connected = await shopifyAuth.hasShopifySession(req.companyId);
    if (connected) {
      const config = await shopifyAuth.getShopifyConfig(req.companyId);
      res.json({ connected: true, shop: config.shop, locationId: config.locationId || null });
    } else {
      res.json({ connected: false });
    }
  } catch (e) {
    res.json({ connected: false });
  }
});

app.get('/api/shopify/auth-url', (req, res) => {
  try {
    const url = shopifyAuth.getAuthUrl(req.companyId);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/shopify/tokens', async (req, res) => {
  try {
    await shopifyAuth.clearShopifyConfig(req.companyId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/shopify/webhook-status', async (req, res) => {
  try {
    const config = await shopifyAuth.getShopifyConfig(req.companyId);
    res.json({ lastReceivedAt: config?.webhookLastReceivedAt || null });
  } catch (e) {
    res.json({ lastReceivedAt: null });
  }
});

// POST /api/shopify/push — create a product in Shopify from a listing
app.post('/api/shopify/push', async (req, res) => {
  try {
    const { listing } = req.body;
    if (!listing || !listing.id) return res.status(400).json({ error: 'listing required' });

    let config = await shopifyAuth.getShopifyConfig(req.companyId);
    if (!config || !config.access_token) return res.status(400).json({ error: 'Shopify not connected' });

    // Fetch and store locationId on the fly if it wasn't captured during OAuth
    if (!config.locationId) {
      console.log('[shopify/push] locationId missing, fetching now...');
      const locResult = await shopifyAuth.shopifyGraphQL(req.companyId, `{ locations(first: 1) { edges { node { id name } } } }`);
      const locationId = locResult?.locations?.edges?.[0]?.node?.id;
      if (!locationId) return res.status(400).json({ error: 'Could not find a location in your Shopify store. Please check Shopify Admin → Settings → Locations.' });
      const db = await getDb();
      await db.collection('config').updateOne(
        { _id: `${req.companyId}_shopify` },
        { $set: { locationId } },
        { upsert: true }
      );
      config = { ...config, locationId };
      console.log('[shopify/push] locationId stored:', locationId);
    }

    const price = listing.priceRecommendation
      ? parseFloat(listing.priceRecommendation.replace(/[^0-9.]/g, '')).toFixed(2)
      : '0.00';

    // Build images array from Cloudinary URLs (classic ProductInput format)
    const imageUrls = (listing.images || [])
      .filter(url => typeof url === 'string' && url.startsWith('http'))
      .slice(0, 10);

    const productInput = {
      title: listing.title || 'Untitled',
      descriptionHtml: listing.description || '',
      vendor: 'Flip Side Collectibles',
      productType: listing.category || '',
      tags: [...(listing.tags || []), ...(listing.collectionCodes || [])],
    };

    // Create the product (images added separately via productCreateMedia — required in API 2024-01+)
    const createResult = await shopifyAuth.shopifyGraphQL(req.companyId, `
      mutation productCreate($input: ProductInput!) {
        productCreate(input: $input) {
          product {
            id
            handle
            variants(first: 1) { edges { node { id inventoryItem { id } } } }
          }
          userErrors { field message }
        }
      }
    `, { input: productInput });

    const userErrors = createResult?.productCreate?.userErrors || [];
    if (userErrors.length > 0) throw new Error(userErrors.map(e => e.message).join(', '));

    const product = createResult?.productCreate?.product;
    if (!product) throw new Error('No product returned from Shopify');

    const variantNode = product.variants?.edges?.[0]?.node;
    const inventoryItemId = variantNode?.inventoryItem?.id;
    const variantId = variantNode?.id;

    // Attach images via productCreateMedia (required in Shopify API 2024-01+;
    // ProductInput.images was removed — media must be added after product creation)
    if (imageUrls.length > 0) {
      const mediaResult = await shopifyAuth.shopifyGraphQL(req.companyId, `
        mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            media { ... on MediaImage { id image { url } } }
            userErrors { field message }
          }
        }
      `, {
        productId: product.id,
        media: imageUrls.map(src => ({ originalSource: src, mediaContentType: 'IMAGE' })),
      });
      const mediaErrors = mediaResult?.productCreateMedia?.userErrors || [];
      if (mediaErrors.length > 0) {
        console.warn('[shopify/push] media upload warnings:', mediaErrors.map(e => e.message).join(', '));
      }
    }

    // Set price via productVariantsBulkUpdate
    if (variantId && price !== '0.00') {
      await shopifyAuth.shopifyGraphQL(req.companyId, `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { field message }
          }
        }
      `, { productId: product.id, variants: [{ id: variantId, price }] });
    }

    // Set inventory to 1
    if (inventoryItemId && config.locationId) {
      await shopifyAuth.shopifyGraphQL(req.companyId, `
        mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            userErrors { field message }
          }
        }
      `, {
        input: {
          name: 'available',
          quantities: [{ inventoryItemId, locationId: config.locationId, quantity: 1 }],
          reason: 'correction',
        }
      });
    }

    // Set Google Shopping metafields + SEO keywords
    const metafieldResult = await applyShopifyMetafields(req.companyId, product.id, variantId, listing).catch(e => {
      console.error('[shopify/push] metafields exception:', e.message);
      return { set: [], errors: [{ message: e.message }] };
    });

    // Resolve collection codes to Shopify collection IDs, then apply
    const collectionWarnings = [];
    if (Array.isArray(listing.collectionCodes) && listing.collectionCodes.length > 0) {
      try {
        const { resolved, warnings: resolveWarnings } = await resolveCollectionCodesToIds(req.companyId, listing.collectionCodes);
        collectionWarnings.push(...resolveWarnings);
        if (resolved.length > 0) {
          const colResult = await applyShopifyCollections(req.companyId, product.id, resolved).catch(e => {
            console.error('[shopify/push] collections exception:', e.message);
            return [e.message];
          });
          if (Array.isArray(colResult)) collectionWarnings.push(...colResult);
        }
      } catch (e) {
        console.error('[shopify/push] collection resolution exception:', e.message);
        collectionWarnings.push(`Collection resolution failed: ${e.message}`);
      }
    }

    // Persist shopifyProductId back to the listing in DB
    const db = await getDb();
    await db.collection('listings').updateOne(
      { id: listing.id, companyId: req.companyId },
      { $set: { shopifyProductId: product.id, shopifyStatus: 'listed', shopifyListedAt: Date.now(), updatedAt: Date.now() } }
    );

    res.json({
      success: true,
      shopifyProductId: product.id,
      shopifyUrl: `https://${config.shop}/products/${product.handle}`,
      metafieldsSet: metafieldResult?.set || [],
      metafieldErrors: (metafieldResult?.errors || []).map(e => e.message),
      collectionWarnings,
    });
  } catch (e) {
    console.error('[shopify/push] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/shopify/update/:listingId — update an existing Shopify product's title/description/price/tags
app.post('/api/shopify/update/:listingId', async (req, res) => {
  try {
    const db = await getDb();
    const existing = await db.collection('listings').findOne({ id: req.params.listingId, companyId: req.companyId });
    if (!existing || !existing.shopifyProductId) return res.status(400).json({ error: 'Listing not found or not on Shopify' });

    const listing = req.body;
    const price = listing.priceRecommendation
      ? parseFloat(String(listing.priceRecommendation).replace(/[^0-9.]/g, '')).toFixed(2)
      : null;

    // Update title, description, productType, tags
    const updateResult = await shopifyAuth.shopifyGraphQL(req.companyId, `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id
            variants(first: 1) { edges { node { id } } }
          }
          userErrors { field message }
        }
      }
    `, {
      input: {
        id: existing.shopifyProductId,
        title: listing.title || existing.title,
        descriptionHtml: listing.description || '',
        productType: listing.category || '',
        tags: [...(listing.tags || []), ...(listing.collectionCodes || [])],
      }
    });

    const userErrors = updateResult?.productUpdate?.userErrors || [];
    if (userErrors.length > 0) throw new Error(userErrors.map(e => e.message).join(', '));

    const variantId = updateResult?.productUpdate?.product?.variants?.edges?.[0]?.node?.id;

    // Update price if provided
    if (price && price !== '0.00' && variantId) {
      await shopifyAuth.shopifyGraphQL(req.companyId, `
        mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { field message }
          }
        }
      `, { productId: existing.shopifyProductId, variants: [{ id: variantId, price }] });
    }

    // Update Google Shopping metafields + SEO keywords
    const mfResult = await applyShopifyMetafields(req.companyId, existing.shopifyProductId, variantId, listing).catch(e => {
      console.error('[shopify/update] metafields exception:', e.message);
      return { set: [], errors: [{ message: e.message }] };
    });
    if (mfResult?.errors?.length > 0) console.error('[shopify/update] metafield errors:', mfResult.errors);

    // Sync collections if changed — resolve codes to Shopify IDs first
    if (Array.isArray(listing.collectionCodes) && listing.collectionCodes.length > 0) {
      try {
        const { resolved } = await resolveCollectionCodesToIds(req.companyId, listing.collectionCodes);
        if (resolved.length > 0) await applyShopifyCollections(req.companyId, existing.shopifyProductId, resolved);
      } catch (e) { console.error('[shopify/update] collections exception:', e.message); }
    }

    // Persist changes to DB
    const { _id, ...listingFields } = listing;
    await db.collection('listings').updateOne(
      { id: req.params.listingId, companyId: req.companyId },
      { $set: { ...listingFields, updatedAt: Date.now() } }
    );

    res.json({ success: true });
  } catch (e) {
    console.error('[shopify/update] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/shopify/delist/:listingId — unpublish a Shopify product (reversible)
app.post('/api/shopify/delist/:listingId', async (req, res) => {
  try {
    const db = await getDb();
    const listing = await db.collection('listings').findOne({ id: req.params.listingId, companyId: req.companyId });
    if (!listing || !listing.shopifyProductId) return res.status(400).json({ error: 'Listing not found or not on Shopify' });

    // Set inventory to 0 — simpler and more reliable than unpublish for single-item stores
    const config = await shopifyAuth.getShopifyConfig(req.companyId);

    // Get the inventory item ID via GraphQL
    const productData = await shopifyAuth.shopifyGraphQL(req.companyId, `
      query getVariant($id: ID!) {
        product(id: $id) {
          variants(first: 1) { edges { node { inventoryItem { id } } } }
        }
      }
    `, { id: listing.shopifyProductId });

    const inventoryItemId = productData?.product?.variants?.edges?.[0]?.node?.inventoryItem?.id;
    if (inventoryItemId && config.locationId) {
      await shopifyAuth.shopifyGraphQL(req.companyId, `
        mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            userErrors { field message }
          }
        }
      `, {
        input: {
          name: 'available',
          quantities: [{ inventoryItemId, locationId: config.locationId, quantity: 0 }],
          reason: 'correction',
        }
      });
    }

    await db.collection('listings').updateOne(
      { id: req.params.listingId, companyId: req.companyId },
      { $set: { shopifyStatus: 'unlisted', updatedAt: Date.now() } }
    );

    res.json({ success: true });
  } catch (e) {
    console.error('[shopify/delist] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Shopify helpers ──────────────────────────────────────────────────────────

function mapGoogleCondition(conditionStr) {
  const s = (conditionStr || '').toLowerCase();
  if (s.includes('new') && !s.includes('like new') && !s.includes('open box')) return 'new';
  if (s.includes('refurbished') || s.includes('refurb') || s.includes('certified')) return 'refurbished';
  return 'used';
}

function mapGoogleGender(genderStr) {
  const s = (genderStr || '').toLowerCase();
  if (s.includes('female') || s.includes('women') || s.includes('woman') || s.includes('girl')) return 'female';
  if (s.includes('male') || s.includes('men') || s.includes('man') || s.includes('boy')) return 'male';
  return 'unisex';
}

function mapGoogleAgeGroup(ageStr) {
  const s = (ageStr || '').toLowerCase();
  if (s.includes('infant')) return 'infant';
  if (s.includes('newborn') || s.includes('new born')) return 'newborn';
  if (s.includes('toddler')) return 'toddler';
  if (s.includes('kid') || s.includes('child') || s.includes('youth') || s.includes('junior')) return 'kids';
  return 'adult';
}

// Look up a value from itemSpecifics using multiple possible key names
function pickSpecific(specifics, ...keys) {
  if (!specifics) return null;
  for (const key of keys) {
    const val = specifics[key];
    if (val && val !== 'Does Not Apply' && val !== 'N/A' && val !== 'Does not apply') return val;
  }
  return null;
}

// Fetch the store's existing metafield definitions so we can use the right type for each key
async function fetchMetafieldDefinitions(companyId) {
  const result = await shopifyAuth.shopifyGraphQL(companyId, `
    query getMetafieldDefs {
      metafieldDefinitions(first: 250, ownerType: PRODUCT) {
        edges { node { namespace key type { name } } }
      }
      variantDefs: metafieldDefinitions(first: 250, ownerType: PRODUCTVARIANT) {
        edges { node { namespace key type { name } } }
      }
    }
  `);
  const productDefs = {};
  for (const e of result?.metafieldDefinitions?.edges || []) {
    productDefs[`${e.node.namespace}.${e.node.key}`] = e.node.type.name;
  }
  const variantDefs = {};
  for (const e of result?.variantDefs?.edges || []) {
    variantDefs[`${e.node.namespace}.${e.node.key}`] = e.node.type.name;
  }
  return { productDefs, variantDefs };
}

async function applyShopifyMetafields(companyId, productId, variantId, listing) {
  const specs = listing.itemSpecifics || {};
  const googleCondition = mapGoogleCondition(listing.condition);

  const mpn         = pickSpecific(specs, 'MPN', 'Model Number', 'Part Number', 'Item Number', 'UPC', 'EAN');
  const ageGroupRaw = pickSpecific(specs, 'Age Group', 'Target Audience', 'Intended Age Group', 'Age Range', 'Recommended Age Group') || 'adult';
  const genderRaw   = pickSpecific(specs, 'Gender', 'Target Gender', 'Department') || 'unisex';
  const ageGroup    = mapGoogleAgeGroup(ageGroupRaw);
  const gender      = mapGoogleGender(genderRaw);

  // seo.keywords is list.single_line_text_field — value must be a JSON array string
  let seoKeywordsArr = null;
  if (listing.seoKeywords && typeof listing.seoKeywords === 'string' && listing.seoKeywords.trim()) {
    seoKeywordsArr = listing.seoKeywords.split(',').map(k => k.trim()).filter(Boolean);
  } else if (Array.isArray(listing.tags) && listing.tags.length > 0) {
    seoKeywordsArr = listing.tags;
  }
  const seoKeywordsValue = seoKeywordsArr ? JSON.stringify(seoKeywordsArr) : null;

  const productMeta = [];
  // seo.keywords — list.single_line_text_field
  if (seoKeywordsValue) productMeta.push({ ownerId: productId, namespace: 'seo', key: 'keywords', value: seoKeywordsValue, type: 'list.single_line_text_field' });
  // google.* — product-level Google Shopping channel metafields
  productMeta.push({ ownerId: productId, namespace: 'google', key: 'condition', value: googleCondition, type: 'single_line_text_field' });
  if (mpn)      productMeta.push({ ownerId: productId, namespace: 'google', key: 'mpn',       value: mpn,                    type: 'single_line_text_field' });
  if (ageGroup) productMeta.push({ ownerId: productId, namespace: 'google', key: 'age_group', value: ageGroup, type: 'single_line_text_field' });
  if (gender)   productMeta.push({ ownerId: productId, namespace: 'google', key: 'gender',    value: gender,   type: 'single_line_text_field' });

  // Variant-level metafields use mm-google-shopping namespace (Metafields Manager app)
  const variantMeta = variantId ? [
    { ownerId: variantId, namespace: 'mm-google-shopping', key: 'condition', value: googleCondition, type: 'single_line_text_field' },
    ...(mpn      ? [{ ownerId: variantId, namespace: 'mm-google-shopping', key: 'mpn',       value: mpn,                    type: 'single_line_text_field' }] : []),
    ...(ageGroup ? [{ ownerId: variantId, namespace: 'mm-google-shopping', key: 'age_group', value: ageGroup.toLowerCase(), type: 'single_line_text_field' }] : []),
    ...(gender   ? [{ ownerId: variantId, namespace: 'mm-google-shopping', key: 'gender',    value: gender.toLowerCase(),   type: 'single_line_text_field' }] : []),
  ] : [];

  const allMetafields = [...productMeta, ...variantMeta];
  console.log(`[shopify metafields] attempting to set ${allMetafields.length} metafields:`, allMetafields.map(m => `${m.namespace}.${m.key}=${m.value}(${m.type})`));

  const result = await shopifyAuth.shopifyGraphQL(companyId, `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key namespace }
        userErrors { field message elementIndex }
      }
    }
  `, { metafields: allMetafields });

  const metafieldErrors = result?.metafieldsSet?.userErrors || [];
  const metafieldSet    = result?.metafieldsSet?.metafields || [];

  console.log(`[shopify metafields] set ${metafieldSet.length} OK, ${metafieldErrors.length} errors`);
  if (metafieldErrors.length > 0) {
    console.error('[shopify metafields] errors:', JSON.stringify(metafieldErrors));
  }

  // Return a summary so callers can include it in their response
  return { set: metafieldSet.map(m => `${m.namespace}.${m.key}`), errors: metafieldErrors };
}

// Collection code → name map (mirrors src/data/collections.ts)
const COLLECTION_CODE_MAP = {
  OT999: 'Other (Catch-All)', TY100: 'Toys', TY200: 'Vintage Toys', TY300: 'Retro Toys', TY400: 'Modern Toys', TY500: 'Collectible Toys',
  TC100: 'Trading Cards (General)', TC200: 'TCG (Non-Sports Cards)', PK200: 'Pokémon Cards', YG200: 'Yu-Gi-Oh Cards', MT200: 'Magic: The Gathering',
  OP200: 'One Piece Cards', DB200: 'Dragon Ball Cards', DG200: 'Digimon Cards', SC100: 'Sports Cards (General)', BB200: 'Baseball Cards',
  BK200: 'Basketball Cards', FB200: 'Football Cards', HK200: 'Hockey Cards', SC300: 'Soccer Cards', BX100: 'Sealed Products',
  BX200: 'Booster Boxes / Packs', SL100: 'Slabbed / Graded Items', FX100: 'Funko Pops', AC100: 'Action Figures', ST100: 'Statues & Figures',
  PL100: 'Plush', BD100: 'Board Games', VG100: 'Video Games', VG200: 'Retro Video Games', VG300: 'Modern Video Games', VC100: 'Video Game Consoles',
  CM100: 'Comics', BK100: 'Books', GN100: 'Graphic Novels', MG100: 'Magazines', AN100: 'Anime Merchandise', MM100: 'Media & Movies',
  MU100: 'Music & Vinyl', EL100: 'Electronics', EL200: 'Vintage Electronics', CL100: 'Clothing', CL200: 'Vintage Clothing',
  SH100: 'Shoes', AT100: 'Art', HW100: 'Hot Wheels / Diecast', LG100: 'LEGO', CW100: 'Coins & Currency', JW100: 'Jewelry',
  WT100: 'Watches', HD100: 'Home Decor', KT100: 'Kitchen & Dining', SP100: 'Sporting Goods', OD100: 'Outdoor & Camping',
  TL100: 'Tools & Hardware', AU100: 'Automotive', CR100: 'Crafts & Sewing', PT100: 'Pet Supplies', BB100: 'Baby & Kids',
  HB100: 'Health & Beauty', OF100: 'Office Supplies', GD100: 'Garden & Patio', PN100: 'Pins & Buttons', KC100: 'Keychains & Lanyards',
  SV100: 'Souvenirs & Travel', HM100: 'Holiday & Seasonal', PR100: 'Premium / High Value', CK100: 'Costume & Cosplay',
  DP100: 'Disney Parks', FP100: 'Funko Pop Exclusives', GP100: 'Graphic Novels Premium', AR100: 'Art Prints',
  HC100: 'Hats & Headwear', BG100: 'Bags & Backpacks', FG100: 'Football Cards (Graded)', SC200: 'Sports Cards (Vintage)',
};

/**
 * Resolve collection codes (e.g. ['TY100', 'PK200']) to Shopify collection GIDs
 * by matching the code's name against Shopify collection titles.
 */
async function resolveCollectionCodesToIds(companyId, codes) {
  if (!Array.isArray(codes) || codes.length === 0) return [];
  // Fetch all Shopify collections
  const result = await shopifyAuth.shopifyGraphQL(companyId, `
    query getCollections {
      collections(first: 250, sortKey: TITLE) {
        edges { node { id title } }
      }
    }
  `);
  const shopifyCollections = (result?.collections?.edges || []).map(e => e.node);
  // Build a lowercase title → id map for matching
  const titleToId = {};
  for (const col of shopifyCollections) {
    titleToId[col.title.toLowerCase().trim()] = col.id;
  }
  const resolved = [];
  const warnings = [];
  for (const code of codes) {
    const name = COLLECTION_CODE_MAP[code];
    if (!name) { warnings.push(`Unknown collection code: ${code}`); continue; }
    const id = titleToId[name.toLowerCase().trim()];
    if (id) {
      resolved.push(id);
    } else {
      warnings.push(`No Shopify collection found matching "${name}" (code: ${code})`);
    }
  }
  return { resolved, warnings };
}

async function applyShopifyCollections(companyId, productId, collectionIds) {
  if (!Array.isArray(collectionIds) || collectionIds.length === 0) return [];
  console.log(`[shopify collections] adding product ${productId} to collections:`, collectionIds);
  const warnings = [];
  for (const collectionId of collectionIds) {
    try {
      const result = await shopifyAuth.shopifyGraphQL(companyId, `
        mutation collectionAddProducts($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) {
            collection { id title }
            userErrors { field message }
          }
        }
      `, { id: collectionId, productIds: [productId] });
      const errs = result?.collectionAddProducts?.userErrors || [];
      if (errs.length > 0) {
        const msg = `Collection ${collectionId}: ${errs.map(e => e.message).join(', ')}`;
        console.error('[shopify collections]', msg);
        warnings.push(msg);
      } else {
        console.log('[shopify collections] added to:', result?.collectionAddProducts?.collection?.title || collectionId);
      }
    } catch (e) {
      console.error('[shopify/collections] exception for', collectionId, e.message);
      warnings.push(`Collection ${collectionId}: ${e.message}`);
    }
  }
  return warnings;
}

// GET /api/shopify/metafield-defs — returns all metafield definitions so we can verify types
app.get('/api/shopify/metafield-defs', async (req, res) => {
  try {
    const { productDefs, variantDefs } = await fetchMetafieldDefinitions(req.companyId);
    res.json({ productDefs, variantDefs });
  } catch (e) {
    console.error('[shopify/metafield-defs] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shopify/collections — list all collections in the connected Shopify store
app.get('/api/shopify/collections', async (req, res) => {
  try {
    const result = await shopifyAuth.shopifyGraphQL(req.companyId, `
      query getCollections {
        collections(first: 250, sortKey: TITLE) {
          edges {
            node { id title handle }
          }
        }
      }
    `);
    const collections = (result?.collections?.edges || []).map(e => e.node);
    res.json({ collections });
  } catch (e) {
    console.error('[shopify/collections] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Shopify SEO Optimizer ────────────────────────────────────────────────────

// GET /api/shopify/products?after=<cursor> — paginate Shopify products with SEO-relevant fields
app.get('/api/shopify/products', async (req, res) => {
  try {
    const connected = await shopifyAuth.hasShopifySession(req.companyId);
    if (!connected) return res.status(400).json({ error: 'Shopify not connected' });

    const after = req.query.after && req.query.after !== 'null' ? req.query.after : null;
    const first = Math.min(parseInt(req.query.first) || 20, 50);

    const result = await shopifyAuth.shopifyGraphQL(req.companyId, `
      query getProducts($first: Int!, $after: String) {
        products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              descriptionHtml
              productType
              vendor
              tags
              updatedAt
              seo { title description }
              images(first: 5) { edges { node { url altText } } }
            }
          }
        }
      }
    `, { first, after });

    const products = (result?.products?.edges || []).map(e => ({
      id: e.node.id,
      title: e.node.title || '',
      descriptionHtml: e.node.descriptionHtml || '',
      productType: e.node.productType || '',
      vendor: e.node.vendor || '',
      tags: e.node.tags || [],
      updatedAt: e.node.updatedAt,
      seo: {
        title: e.node.seo?.title || '',
        description: e.node.seo?.description || '',
      },
      images: (e.node.images?.edges || []).map(ie => ({
        url: ie.node.url,
        altText: ie.node.altText || null,
      })),
    }));

    res.json({
      products,
      pageInfo: result?.products?.pageInfo || { hasNextPage: false, endCursor: null },
    });
  } catch (e) {
    console.error('[shopify/products] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/shopify/seo-optimize — run Gemini on a batch of Shopify products and return before/after suggestions
app.post('/api/shopify/seo-optimize', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'YOUR_GEMINI_KEY_HERE') {
      return res.status(500).json({ error: 'Server missing GEMINI_API_KEY' });
    }
    const products = Array.isArray(req.body?.products) ? req.body.products : [];
    if (!products.length) return res.status(400).json({ error: 'products array required' });

    const collectionsForAi = await catalog.getCollectionsForAI(req.companyId);

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

    // Pick best available model — prefer flash, then newer versions
    let modelName = 'gemini-2.5-flash';
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (resp.ok) {
        const data = await resp.json();
        const versionScore = (name) => {
          if (name.includes('2.5')) return 0;
          if (name.includes('2.0')) return 1;
          if (name.includes('1.5')) return 2;
          return 3;
        };
        const models = (data.models || [])
          .filter(m => m.supportedGenerationMethods?.includes('generateContent') && m.name?.includes('gemini'))
          .map(m => m.name.replace('models/', ''));
        models.sort((a, b) => {
          const aFlash = a.includes('flash'), bFlash = b.includes('flash');
          if (aFlash !== bFlash) return aFlash ? -1 : 1;
          return versionScore(a) - versionScore(b);
        });
        if (models.length > 0) modelName = models[0];
      }
    } catch (e) { /* fall through */ }

    const mimeFromUrl = (url) => {
      const u = (url || '').toLowerCase().split('?')[0];
      if (u.endsWith('.png')) return 'image/png';
      if (u.endsWith('.webp')) return 'image/webp';
      if (u.endsWith('.gif')) return 'image/gif';
      return 'image/jpeg';
    };

    const fetchImagePart = async (url) => {
      try {
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 10000 });
        const b64 = Buffer.from(resp.data).toString('base64');
        return { inlineData: { data: b64, mimeType: mimeFromUrl(url) } };
      } catch (e) {
        return null;
      }
    };

    const callGemini = async (parts) => {
      const result = await ai.models.generateContent({
        model: modelName,
        contents: parts,
        config: { thinkingConfig: { thinkingBudget: 0 } },
      });
      let text = (result.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) text = text.substring(jsonStart, jsonEnd + 1);
      return { parsed: JSON.parse(text), usage: result.usageMetadata };
    };

    const suggestions = [];
    const errors = [];

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      try {
        const descPlain = (p.descriptionHtml || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const descExcerpt = descPlain.substring(0, 600);

        const imageParts = [];
        const imageUrls = (p.images || []).slice(0, 3).map(img => img.url).filter(Boolean);
        for (const url of imageUrls) {
          const part = await fetchImagePart(url);
          if (part) imageParts.push(part);
        }

        const tagsStr = Array.isArray(p.tags) ? p.tags.join(', ') : '';
        const prompt = `You are a Shopify SEO expert. Optimize this product for Shopify search and Google Shopping.

CURRENT DATA:
Title: "${p.title || ''}"
Description (plaintext excerpt, first 600 chars): "${descExcerpt}"
SEO Meta Title: "${p.seo?.title || '(not set)'}"
SEO Meta Description: "${p.seo?.description || '(not set)'}"
Tags: ${tagsStr || '(none)'}
Product Type: "${p.productType || '(not set)'}"
Vendor: "${p.vendor || '(not set)'}"

RULES:
1. Title: 50-70 chars, front-load keywords (brand + product type + key feature), no filler words ("amazing", "look", "great deal")
2. Description HTML: 300+ plain chars, simple inline-CSS HTML, short intro + bullet list + clear CTA, preserve factual product details
3. SEO Meta Title: 50-60 chars, differs from product title, targets Google search intent (brand + product type + 1 key differentiator)
4. SEO Meta Description: 140-160 chars, benefit statement + CTA, naturally includes top 1-2 keywords
5. Tags: 5-10 lowercase hyphenated tags, keep useful existing ones, add high-value missing ones (category, brand, feature, era/style, use case). CRITICAL catalog code rule: catalog codes are two uppercase letters followed by three digits, e.g. "TC200". A single product often belongs to MULTIPLE catalogs and should carry MULTIPLE catalog codes — for example a Barbie doll should have BOTH a Fashion Dolls code AND a Toys code; a vintage baseball card should have BOTH a Trading Cards code AND a Vintage code if those exist. Process: (a) keep ALL catalog codes already present in the input tags verbatim, (b) from this available list, add EVERY additional code that genuinely fits the product (typically 1-3 codes total, occasionally more): \${collectionsForAi}. Be generous but accurate — include a code whenever the product plausibly fits that category. Never invent codes that aren't in the input or in that list.
6. Product Type: Title Case, max 50 chars, accurate category (e.g. "Action Figure", "Trading Card")
7. Vendor: Brand/manufacturer name, Title Case, max 50 chars

Respond ONLY with a valid JSON object (no markdown wrappers):
{
  "title": "...", "titleRationale": "...",
  "descriptionHtml": "...", "descriptionRationale": "...",
  "seoTitle": "...", "seoTitleRationale": "...",
  "seoDescription": "...", "seoDescriptionRationale": "...",
  "tags": ["tag1","tag2"], "tagsRationale": "...",
  "productType": "...", "productTypeRationale": "...",
  "vendor": "...", "vendorRationale": "..."
}`;

        const parts = [...imageParts, prompt];
        let result;
        try {
          result = await callGemini(parts);
        } catch (err) {
          const msg = String(err?.message || err);
          if (msg.includes('429') || msg.toLowerCase().includes('rate')) {
            await new Promise(r => setTimeout(r, 5000));
            result = await callGemini(parts);
          } else {
            throw err;
          }
        }

        const ai = result.parsed || {};
        const beforeTagsArr = p.tags || [];
        const beforeTags = beforeTagsArr.join(', ');
        let afterTagsArr = Array.isArray(ai.tags) ? ai.tags : [];

        // Safety net: preserve catalog codes (e.g. TC200, TY100) that AI may have dropped
        const CATALOG_CODE_RE = /^[A-Z]{2}\d{3}$/;
        const preservedCodes = beforeTagsArr.filter(t => CATALOG_CODE_RE.test(String(t).trim()));
        if (preservedCodes.length > 0) {
          const existingUpper = new Set(afterTagsArr.map(t => String(t).trim().toUpperCase()));
          for (const code of preservedCodes) {
            if (!existingUpper.has(code.toUpperCase())) afterTagsArr.push(code);
          }
        }
        const afterTags = afterTagsArr.join(', ');

        const fields = [
          { field: 'title', before: p.title || '', after: ai.title || '', rationale: ai.titleRationale || '', accepted: null },
          { field: 'descriptionHtml', before: p.descriptionHtml || '', after: ai.descriptionHtml || '', rationale: ai.descriptionRationale || '', accepted: null },
          { field: 'seoTitle', before: p.seo?.title || '', after: ai.seoTitle || '', rationale: ai.seoTitleRationale || '', accepted: null },
          { field: 'seoDescription', before: p.seo?.description || '', after: ai.seoDescription || '', rationale: ai.seoDescriptionRationale || '', accepted: null },
          { field: 'tags', before: beforeTags, after: afterTags, rationale: ai.tagsRationale || '', accepted: null },
          { field: 'productType', before: p.productType || '', after: ai.productType || '', rationale: ai.productTypeRationale || '', accepted: null },
          { field: 'vendor', before: p.vendor || '', after: ai.vendor || '', rationale: ai.vendorRationale || '', accepted: null },
        ];

        suggestions.push({
          productId: p.id,
          productTitle: p.title || '',
          fields,
          tokenUsage: {
            totalTokens: (result.usage?.promptTokenCount || 0) + (result.usage?.candidatesTokenCount || 0),
            model: modelName,
          },
        });
      } catch (err) {
        console.error(`[shopify/seo-optimize] product ${p.id} error:`, err.message);
        errors.push(`${p.title || p.id}: ${err.message}`);
      }

      // Delay between products to avoid rate limits
      if (i < products.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    res.json({ suggestions, errors });
  } catch (e) {
    console.error('[shopify/seo-optimize] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/shopify/products/:shopifyProductId — update a Shopify product with approved SEO changes
app.put('/api/shopify/products/:shopifyProductId', async (req, res) => {
  try {
    const connected = await shopifyAuth.hasShopifySession(req.companyId);
    if (!connected) return res.status(400).json({ error: 'Shopify not connected' });

    const rawId = req.params.shopifyProductId || '';
    const numericId = rawId.includes('/') ? rawId.split('/').pop() : rawId;
    const gid = `gid://shopify/Product/${numericId}`;

    const body = req.body || {};
    const input = { id: gid, status: 'ACTIVE' };

    if (typeof body.title === 'string') input.title = body.title;
    if (typeof body.descriptionHtml === 'string') input.descriptionHtml = body.descriptionHtml;
    if (typeof body.productType === 'string') input.productType = body.productType.substring(0, 50);
    if (typeof body.vendor === 'string') input.vendor = body.vendor.substring(0, 50);
    if (Array.isArray(body.tags)) input.tags = body.tags;

    if (typeof body.seoTitle === 'string' || typeof body.seoDescription === 'string') {
      input.seo = {};
      if (typeof body.seoTitle === 'string') input.seo.title = body.seoTitle.substring(0, 70);
      if (typeof body.seoDescription === 'string') input.seo.description = body.seoDescription.substring(0, 320);
    }

    const result = await shopifyAuth.shopifyGraphQL(req.companyId, `
      mutation productUpdate($input: ProductInput!) {
        productUpdate(input: $input) {
          product {
            id title descriptionHtml productType vendor tags status
            seo { title description }
          }
          userErrors { field message }
        }
      }
    `, { input });

    const userErrors = result?.productUpdate?.userErrors || [];
    if (userErrors.length > 0) {
      return res.status(400).json({ error: userErrors.map(e => e.message).join(', ') });
    }

    const product = result?.productUpdate?.product;
    if (!product) return res.status(500).json({ error: 'No product returned from Shopify' });

    // Publish to default sales channels: Online Store, YouTube, Facebook, TikTok
    const channelStatuses = await publishToDefaultChannels(req.companyId, gid);

    res.json({ success: true, product, channels: channelStatuses });
  } catch (e) {
    console.error('[shopify/products PUT] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shopify/diagnose-publications — list all publications on the shop and show the current stored scope
app.get('/api/shopify/diagnose-publications', async (req, res) => {
  try {
    const connected = await shopifyAuth.hasShopifySession(req.companyId);
    if (!connected) return res.status(400).json({ error: 'Shopify not connected' });

    const config = await shopifyAuth.getShopifyConfig(req.companyId);
    const currentScope = config?.scope || '(unknown)';
    const hasPublicationScope =
      String(currentScope).includes('read_publications') &&
      String(currentScope).includes('write_publications');

    let publications = [];
    let queryError = null;
    try {
      const pubResult = await shopifyAuth.shopifyGraphQL(req.companyId, `
        query publications {
          publications(first: 25) {
            edges { node { id name } }
          }
        }
      `, {});
      publications = (pubResult?.publications?.edges || []).map(e => e.node);
    } catch (e) {
      queryError = e.message;
    }

    const channelMatches = DEFAULT_PUBLISH_CHANNELS.map(channel => {
      const match = publications.find(pub => {
        const n = String(pub.name || '').toLowerCase();
        return channel.matches.some(m => n.includes(m));
      });
      return {
        channel: channel.key,
        matched: !!match,
        matchedName: match?.name || null,
      };
    });

    res.json({
      currentScope,
      hasPublicationScope,
      needsReconnect: !hasPublicationScope,
      publications: publications.map(p => ({ id: p.id, name: p.name })),
      channelMatches,
      queryError,
    });
  } catch (e) {
    console.error('[shopify/diagnose-publications] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Match substrings (case-insensitive) against Shopify publication names.
// Shopify surfaces sales channels as publications; actual names vary by install
// (e.g. "Facebook & Instagram", "Google & YouTube", "TikTok Shop") so we match
// on keywords rather than exact names.
const DEFAULT_PUBLISH_CHANNELS = [
  { key: 'Online Store', matches: ['online store'] },
  { key: 'YouTube', matches: ['youtube', 'google & youtube', 'google and youtube'] },
  { key: 'Facebook', matches: ['facebook', 'meta', 'instagram'] },
  { key: 'TikTok', matches: ['tiktok', 'tik tok'] },
];

async function publishToDefaultChannels(companyId, productGid) {
  const statuses = DEFAULT_PUBLISH_CHANNELS.map(c => ({ channel: c.key, status: 'pending' }));
  try {
    const pubResult = await shopifyAuth.shopifyGraphQL(companyId, `
      query publications {
        publications(first: 25) {
          edges { node { id name } }
        }
      }
    `, {});
    const publications = (pubResult?.publications?.edges || []).map(e => e.node);
    console.log(`[publishToDefaultChannels] Found ${publications.length} publications on shop:`,
      publications.map(p => p.name).join(' | ') || '(none)');

    const targetIds = [];
    for (let i = 0; i < DEFAULT_PUBLISH_CHANNELS.length; i++) {
      const channel = DEFAULT_PUBLISH_CHANNELS[i];
      const match = publications.find(pub => {
        const n = String(pub.name || '').toLowerCase();
        return channel.matches.some(m => n.includes(m));
      });
      if (match) {
        targetIds.push({ publicationId: match.id });
        statuses[i].status = 'queued';
        statuses[i].matchedName = match.name;
      } else {
        statuses[i].status = 'not-installed';
      }
    }
    console.log(`[publishToDefaultChannels] Channel match result:`,
      statuses.map(s => `${s.channel}=${s.status}${s.matchedName ? ` (${s.matchedName})` : ''}`).join(' | '));

    if (targetIds.length === 0) {
      console.warn('[publishToDefaultChannels] No matching publications found — skipping publishablePublish');
      return statuses;
    }

    const publishResult = await shopifyAuth.shopifyGraphQL(companyId, `
      mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }
    `, { id: productGid, input: targetIds });

    const errs = publishResult?.publishablePublish?.userErrors || [];
    if (errs.length > 0) {
      const errMsg = errs.map(e => e.message).join('; ');
      console.error('[publishToDefaultChannels] publishablePublish userErrors:', errMsg);
      for (const s of statuses) {
        if (s.status === 'queued') { s.status = 'error'; s.error = errMsg; }
      }
    } else {
      for (const s of statuses) {
        if (s.status === 'queued') s.status = 'published';
      }
      console.log(`[publishToDefaultChannels] Published ${productGid} to ${targetIds.length} channel(s)`);
    }
  } catch (e) {
    const msg = e?.message || String(e);
    console.error('[publishToDefaultChannels] error:', msg);
    if (msg.toLowerCase().includes('access denied') || msg.toLowerCase().includes('scope')) {
      console.error('[publishToDefaultChannels] Likely missing read_publications/write_publications scope. Reconnect Shopify from Settings.');
    }
    for (const s of statuses) {
      if (s.status === 'pending' || s.status === 'queued') { s.status = 'error'; s.error = msg; }
    }
  }
  return statuses;
}


// ═════════════════════════════════════════════════════════════════════════════
// BLOCK E — Auto-crosslist on eBay push (originally lines 2566-2609)
// Insert inside the AddFixedPriceItem (POST /api/ebay/draft) handler, just
// after `console.log('Successfully pushed to eBay! ...')` and before
// `res.json({ success: true, draftId })`.
// ═════════════════════════════════════════════════════════════════════════════

    // Auto cross-list to Shopify if setting enabled
    const userSettings2 = await getSettings(req.companyId).catch(() => ({}));
    if (userSettings2.autoShopifyCrosslist) {
      try {
        const shopifyConnected = await shopifyAuth.hasShopifySession(req.companyId);
        if (shopifyConnected && listing) {
          // Run async — don't block eBay response
          setImmediate(async () => {
            try {
              const shopifyConfig = await shopifyAuth.getShopifyConfig(req.companyId);
              const price2 = listing.priceRecommendation
                ? parseFloat(listing.priceRecommendation.replace(/[^0-9.]/g, '')).toFixed(2)
                : '0.00';
              const imageUrls2 = (listing.images || []).filter(u => typeof u === 'string' && u.startsWith('http')).slice(0, 10);
              const createResult2 = await shopifyAuth.shopifyGraphQL(req.companyId, `
                mutation productCreate($input: ProductInput!) {
                  productCreate(input: $input) {
                    product { id handle variants(first: 1) { edges { node { id inventoryItem { id } } } } }
                    userErrors { field message }
                  }
                }
              `, { input: { title: listing.title || 'Untitled', descriptionHtml: listing.description || '', vendor: 'Flip Side Collectibles', productType: listing.category || '', tags: listing.tags || [], ...(imageUrls2.length > 0 ? { images: imageUrls2.map(src => ({ src })) } : {}) } });
              const product2 = createResult2?.productCreate?.product;
              if (product2) {
                const vNode2 = product2.variants?.edges?.[0]?.node;
                if (vNode2?.id && price2 !== '0.00') {
                  await shopifyAuth.shopifyGraphQL(req.companyId, `mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } } }`, { productId: product2.id, variants: [{ id: vNode2.id, price: price2 }] });
                }
                if (vNode2?.inventoryItem?.id && shopifyConfig?.locationId) {
                  await shopifyAuth.shopifyGraphQL(req.companyId, `mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $input) { userErrors { field message } } }`, { input: { name: 'available', quantities: [{ inventoryItemId: vNode2.inventoryItem.id, locationId: shopifyConfig.locationId, quantity: 1 }], reason: 'correction' } });
                }
                const db2 = await getDb();
                await db2.collection('listings').updateOne({ id: listing.id, companyId: req.companyId }, { $set: { shopifyProductId: product2.id, shopifyStatus: 'listed', shopifyListedAt: Date.now(), updatedAt: Date.now() } });
                console.log(`[auto-crosslist] Shopify product created: ${product2.id} for "${listing.title}"`);
              }
            } catch (shopifyErr) {
              console.error('[auto-crosslist] Shopify push failed:', shopifyErr.message);
            }
          });
        }
      } catch (checkErr) {
        console.error('[auto-crosslist] check failed:', checkErr.message);
      }
    }
