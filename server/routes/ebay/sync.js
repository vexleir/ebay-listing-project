// eBay sync/read routes extracted from server/app.js. Mounted under
// /api/ebay below the global authMiddleware.
//
// Routes:
//   GET  /listing-stats        — single-item WatchCount/HitCount/QuantitySold
//   GET  /sold-items           — last 30 days of sold listings (GetMyeBaySelling)
//   GET  /active-listings      — paginated active listings (GetSellerList)
//   POST /refresh-listings     — sync one page of active listings into the DB
//   POST /import-listings      — bulk insert selected active listings
//   POST /refresh-images/:id   — pull full PictureDetails for a single listing
//
// All Trading API HTTP calls go through tradingApiCall from
// services/ebay/client.js.

const crypto = require('crypto');
const express = require('express');
const { getValidAccessToken } = require('../../ebayAuth');
const { getDb } = require('../../db');
const { createDefaultRateLimiters } = require('../../middleware/rateLimit');
const { tradingApiCall } = require('../../services/ebay/client');

const { ebayReadRateLimit } = createDefaultRateLimiters();

const router = express.Router();

router.get('/listing-stats', ebayReadRateLimit, async (req, res) => {
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
    const resp = await tradingApiCall({ callName: 'GetItem', xmlBody: xml, token });
    const body = resp.data;
    const get = (tag) => {
      const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
      const x = r.exec(body);
      return x ? x[1].trim() : null;
    };
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

router.get('/sold-items', ebayReadRateLimit, async (req, res) => {
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
    const resp = await tradingApiCall({ callName: 'GetMyeBaySelling', xmlBody: xml, token });
    const body = resp.data;
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

// GET /api/ebay/active-listings?page=N
// Fetches one page of active eBay listings (max 200/page). Frontend calls
// repeatedly to paginate through all listings.
router.get('/active-listings', ebayReadRateLimit, async (req, res) => {
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
    const resp = await tradingApiCall({ callName: 'GetSellerList', xmlBody: xml, token });
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
      // Collect all PictureURL values; fall back to GalleryURL when only the
      // gallery thumbnail is returned (common for older/bulk-uploaded items).
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
// Processes one page (200 items) of active eBay listings per call. Updates
// existing DB records (images/title/price/condition) and inserts any not
// yet imported. Frontend calls this repeatedly per page.
router.post('/refresh-listings', ebayReadRateLimit, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const token = await getValidAccessToken(req.companyId);
    const db = await getDb();

    const allImported = await db.collection('listings').find(
      { companyId: req.companyId, ebayDraftId: { $exists: true, $ne: null } },
      { projection: { _id: 1, ebayDraftId: 1 } },
    ).toArray();
    const byEbayId = new Map(allImported.map((l) => [l.ebayDraftId, l]));

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
    const resp = await tradingApiCall({ callName: 'GetSellerList', xmlBody: xml, token });
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
      ...insertOps.map((doc) => ({ insertOne: { document: doc } })),
    ];
    if (ops.length > 0) await db.collection('listings').bulkWrite(ops);

    res.json({ refreshed: updateOps.length, imported: insertOps.length, totalPages, page });
  } catch (e) {
    console.error('[refresh-listings] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/ebay/import-listings
// Saves selected eBay active listings into the DB as status='listed'. Skips
// any whose ebayDraftId already exists in the company's listings.
router.post('/import-listings', ebayReadRateLimit, async (req, res) => {
  try {
    const { listings } = req.body;
    if (!Array.isArray(listings) || listings.length === 0) {
      return res.status(400).json({ error: 'listings array required' });
    }
    const db = await getDb();
    const existing = await db.collection('listings').find(
      { companyId: req.companyId, ebayDraftId: { $exists: true, $ne: null } },
      { projection: { ebayDraftId: 1 } },
    ).toArray();
    const existingIds = new Set(existing.map((e) => e.ebayDraftId));

    const now = Date.now();
    let imported = 0;
    const importedListings = [];

    for (const item of listings) {
      if (!item.ebayItemId) continue;
      if (existingIds.has(item.ebayItemId)) continue;

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
// Pulls the full PictureDetails for a single listing via GetItem (more
// reliable than GetSellerList) and writes the image URLs back to the DB.
router.post('/refresh-images/:id', ebayReadRateLimit, async (req, res) => {
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
    const resp = await tradingApiCall({ callName: 'GetItem', xmlBody: xml, token });
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
      { $set: { images, updatedAt: now } },
    );
    res.json({ images, updatedAt: now });
  } catch (e) {
    console.error('[refresh-images] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
