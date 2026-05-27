// eBay listing write/lifecycle routes extracted from server/app.js.
// Mounted under /api/ebay below the global authMiddleware.
//
// Routes:
//   POST /revise      — ReviseFixedPriceItem with sale-active and condition-error retry
//   POST /end-listing — EndFixedPriceItem
//   POST /draft       — push a staged listing live (delegates to pushListingToEbay)
//   POST /relist      — end an existing listing then push a fresh one (preserves
//                       live SKU, business policies, category, condition, package
//                       dimensions, item specifics — see Step 0 of /relist)
//
// All eBay HTTP calls go through tradingApiCall from services/ebay/client.js.

const express = require('express');
const { getValidAccessToken } = require('../../ebayAuth');
const { updateListing, getSettings } = require('../../listings');
const { createDefaultRateLimiters } = require('../../middleware/rateLimit');
const { tradingApiCall } = require('../../services/ebay/client');
const { translateEbayError } = require('../../services/ebay/errors');
const {
  buildItemSpecificsXml,
  pushListingToEbay,
  sendEbayPushError,
} = require('../../services/ebay/listingLifecycle');

// Helper: respond with the legacy { error } string AND the new errorDetails
// shape from the translator when a rule matches. Frontend can opt into
// reading errorDetails to show a user-friendly message + fix.
function respondWithEbayError(res, status, rawMessage) {
  const body = { error: rawMessage };
  const t = translateEbayError(rawMessage);
  if (t) body.errorDetails = { code: t.code, message: t.message, fix: t.fix, rawMessage: t.rawMessage };
  return res.status(status).json(body);
}

const { ebayWriteRateLimit } = createDefaultRateLimiters();

const router = express.Router();

// Common dependency object for pushListingToEbay so route handlers don't
// have to repeat it. Lets tests substitute fakes by re-requiring the route
// module under a Module.prototype.require patch (see routes-ebay tests).
const pushDeps = { getSettings, getValidAccessToken };

router.post('/revise', ebayWriteRateLimit, async (req, res) => {
  const { itemId, newPrice, newTitle, description, conditionId, itemSpecifics, quantity } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    const token = await getValidAccessToken(req.companyId);
    const priceXml = newPrice ? `<StartPrice currencyID="USD">${parseFloat(newPrice).toFixed(2)}</StartPrice>` : '';
    const titleXml = newTitle ? `<Title><![CDATA[${String(newTitle).substring(0, 80)}]]></Title>` : '';
    const descXml = description ? `<Description><![CDATA[${description}]]></Description>` : '';
    const condXml = conditionId ? `<ConditionID>${conditionId}</ConditionID>` : '';
    const qtyNum = quantity != null ? Math.max(1, parseInt(quantity, 10) || 1) : null;
    const qtyXml = qtyNum != null ? `<Quantity>${qtyNum}</Quantity>` : '';

    // ReviseFixedPriceItem treats <ItemSpecifics> as a full replacement, so
    // pushing the (possibly partial) local specifics would wipe any aspect
    // the local DB record never captured — causing failures like "item
    // specific Size is missing". Mirror the relist merge: fetch the live
    // specifics and layer the local edits on top so missing category-
    // required aspects are preserved. Only do this when we're actually
    // sending specifics.
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
        const getItemRes = await tradingApiCall({ callName: 'GetItem', xmlBody: getItemXml, token });
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
            const values = [...nvl.matchAll(/<Value>([\s\S]*?)<\/Value>/g)].map((v) => stripCdata(v[1]));
            if (name && values.length > 0) liveItemSpecifics[name] = values.length === 1 ? values[0] : values.join('; ');
          }
        }
        // Normalize the client payload (array of {name,value}) to an object,
        // then merge: live underneath, local edits on top.
        const localSpecifics = Array.isArray(itemSpecifics)
          ? Object.fromEntries(itemSpecifics.filter((s) => s && s.name).map((s) => [s.name, s.value]))
          : itemSpecifics;
        mergedSpecifics = { ...liveItemSpecifics, ...localSpecifics };
        console.log(`[revise] GetItem(${itemId}) merged specifics — live=${Object.keys(liveItemSpecifics).length} (${Object.keys(liveItemSpecifics).join(',')}), local=${Object.keys(localSpecifics).length}, merged=${Object.keys(mergedSpecifics).length}`);
      } catch (e) {
        console.warn(`[revise] could not fetch live specifics for ${itemId} — pushing local only: ${e.message}`);
      }
    }
    const specificsXml = buildItemSpecificsXml(mergedSpecifics);
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

    const resp = await tradingApiCall({ callName: 'ReviseFixedPriceItem', xmlBody: buildRevise(), token });

    if (resp.data.includes('<Ack>Failure</Ack>')) {
      const err = resp.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Unknown error';
      const errLower = err.toLowerCase();

      // Condition invalid for this category → retry without conditionId.
      const isConditionError = errLower.includes('condition') && (errLower.includes('invalid') || errLower.includes('not valid'));
      if (isConditionError && condXml) {
        console.log(`[revise] conditionId ${conditionId} invalid for this listing's category — retrying without it`);
        const resp2 = await tradingApiCall({
          callName: 'ReviseFixedPriceItem',
          xmlBody: buildRevise({ withCondition: false }),
          token,
        });
        if (resp2.data.includes('<Ack>Failure</Ack>')) {
          const err2 = resp2.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Unknown error';
          return respondWithEbayError(res, 400, err2);
        }
        return res.json({ success: true, warning: 'Condition was not updated — the chosen condition is not valid for this listing’s eBay category. The existing condition on the listing was kept.' });
      }

      // Price blocked by an active sale → retry without the price field.
      if (errLower.includes('part of a sale') || errLower.includes('cannot be updated since it is a part of a sale')) {
        console.log('[revise] price blocked by sale — retrying without price');
        const resp2 = await tradingApiCall({
          callName: 'ReviseFixedPriceItem',
          xmlBody: buildRevise({ withPrice: false }),
          token,
        });
        if (resp2.data.includes('<Ack>Failure</Ack>')) {
          const err2 = resp2.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Unknown error';
          return respondWithEbayError(res, 400, err2);
        }
        return res.json({ success: true, warning: 'Price was not updated because this item is currently part of a sale.' });
      }

      return respondWithEbayError(res, 400, err);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[revise] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/end-listing', ebayWriteRateLimit, async (req, res) => {
  const { itemId, reason } = req.body;
  if (!itemId) return res.status(400).json({ error: 'itemId required' });
  try {
    const token = await getValidAccessToken(req.companyId);
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${itemId}</ItemID>
  <EndingReason>${reason || 'NotAvailable'}</EndingReason>
</EndFixedPriceItemRequest>`;
    const resp = await tradingApiCall({ callName: 'EndFixedPriceItem', xmlBody: xml, token });
    if (resp.data.includes('<Ack>Failure</Ack>')) {
      const err = resp.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || 'Unknown error';
      return respondWithEbayError(res, 400, err);
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[end-listing] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/draft', ebayWriteRateLimit, async (req, res) => {
  try {
    const result = await pushListingToEbay({ ...req.body, companyId: req.companyId }, pushDeps);
    res.json({ success: true, ...result });
  } catch (error) {
    sendEbayPushError(res, error);
  }
});

// Delist + relist: ends the current eBay listing and immediately pushes a
// fresh one (no scheduleDate). Used by the Optimize modal's "Delist &
// Relist" action and by the per-listing "Delist & Relist" button on the
// Listings tab.
router.post('/relist', ebayWriteRateLimit, async (req, res) => {
  const { oldItemId, listingId, listing } = req.body;
  if (!oldItemId) return res.status(400).json({ error: 'oldItemId required' });
  if (!listing) return res.status(400).json({ error: 'listing required' });
  try {
    const token = await getValidAccessToken(req.companyId);

    // Step 0 — fetch live SKU/policies/category/condition/package/specifics
    // from eBay BEFORE delisting so the relist preserves the exact profile
    // the seller had on the original listing. Falls back silently to caller
    // overrides / user defaults if GetItem fails or the listing doesn't use
    // Business Policies.
    let liveSku = '';
    const livePolicies = { shipping: null, return: null, payment: null };
    let liveCategoryId = null;
    let liveConditionId = null;
    const livePackage = { length: null, width: null, depth: null, lbs: null, oz: null };
    const liveItemSpecifics = {};
    try {
      const getItemXml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${oldItemId}</ItemID>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
</GetItemRequest>`;
      const getItemRes = await tradingApiCall({ callName: 'GetItem', xmlBody: getItemXml, token });
      const xml = getItemRes.data;
      // First <SKU> is the Item-level SKU (variations come after). Strip CDATA.
      const skuMatch = /<SKU[^>]*>([\s\S]*?)<\/SKU>/.exec(xml);
      let raw = skuMatch ? skuMatch[1].trim() : '';
      const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(raw);
      if (cdata) raw = cdata[1];
      liveSku = raw;
      const profilesBlock = /<SellerProfiles>([\s\S]*?)<\/SellerProfiles>/.exec(xml)?.[1] || '';
      livePolicies.shipping = /<ShippingProfileID>(.*?)<\/ShippingProfileID>/.exec(profilesBlock)?.[1] || null;
      livePolicies.return = /<ReturnProfileID>(.*?)<\/ReturnProfileID>/.exec(profilesBlock)?.[1] || null;
      livePolicies.payment = /<PaymentProfileID>(.*?)<\/PaymentProfileID>/.exec(profilesBlock)?.[1] || null;
      const primaryCatBlock = /<PrimaryCategory>([\s\S]*?)<\/PrimaryCategory>/.exec(xml)?.[1] || '';
      liveCategoryId = /<CategoryID>(.*?)<\/CategoryID>/.exec(primaryCatBlock)?.[1] || null;
      // ConditionID — preserve the exact condition the original used. The
      // local text maps through getConditionId() to a generic ID that some
      // categories (e.g. Comics) reject; the live ID is known-valid.
      liveConditionId = /<ConditionID>(\d+)<\/ConditionID>/.exec(xml)?.[1] || null;
      const pkgBlock = /<ShippingPackageDetails>([\s\S]*?)<\/ShippingPackageDetails>/.exec(xml)?.[1] || '';
      if (pkgBlock) {
        livePackage.length = /<PackageLength[^>]*>(.*?)<\/PackageLength>/.exec(pkgBlock)?.[1] || null;
        livePackage.width = /<PackageWidth[^>]*>(.*?)<\/PackageWidth>/.exec(pkgBlock)?.[1] || null;
        livePackage.depth = /<PackageDepth[^>]*>(.*?)<\/PackageDepth>/.exec(pkgBlock)?.[1] || null;
        livePackage.lbs = /<WeightMajor[^>]*>(.*?)<\/WeightMajor>/.exec(pkgBlock)?.[1] || null;
        livePackage.oz = /<WeightMinor[^>]*>(.*?)<\/WeightMinor>/.exec(pkgBlock)?.[1] || null;
      }
      // ItemSpecifics — preserve whatever was live (e.g. Size, Color, Department)
      // so the relist can't drop a category-required aspect.
      const specificsBlock = /<ItemSpecifics>([\s\S]*?)<\/ItemSpecifics>/.exec(xml)?.[1] || '';
      if (specificsBlock) {
        const stripCdata = (s) => {
          const m = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(s.trim());
          return m ? m[1] : s.trim();
        };
        for (const m of specificsBlock.matchAll(/<NameValueList>([\s\S]*?)<\/NameValueList>/g)) {
          const nvl = m[1];
          const name = stripCdata(/<Name>([\s\S]*?)<\/Name>/.exec(nvl)?.[1] || '');
          const values = [...nvl.matchAll(/<Value>([\s\S]*?)<\/Value>/g)].map((v) => stripCdata(v[1]));
          if (name && values.length > 0) liveItemSpecifics[name] = values.length === 1 ? values[0] : values.join('; ');
        }
      }
      const ack = /<Ack>([^<]+)<\/Ack>/.exec(xml)?.[1] || '?';
      console.log(`[relist] GetItem(${oldItemId}) Ack=${ack} — SKU="${liveSku}" (DB="${listing.sku || ''}"), category=${liveCategoryId}, condition=${liveConditionId}, policies: shipping=${livePolicies.shipping}, return=${livePolicies.return}, payment=${livePolicies.payment}, package: ${livePackage.length}x${livePackage.width}x${livePackage.depth} ${livePackage.lbs}lb ${livePackage.oz}oz, liveSpecifics=${Object.keys(liveItemSpecifics).length} (${Object.keys(liveItemSpecifics).join(',')})`);
    } catch (e) {
      console.warn(`[relist] could not fetch live SKU/policies for ${oldItemId}: ${e.message}`);
    }
    const finalSku = liveSku || listing.sku || '';
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

    // Step 1 — end the current listing.
    const endXml = `<?xml version="1.0" encoding="utf-8"?>
<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ItemID>${oldItemId}</ItemID>
  <EndingReason>NotAvailable</EndingReason>
</EndFixedPriceItemRequest>`;
    const endRes = await tradingApiCall({ callName: 'EndFixedPriceItem', xmlBody: endXml, token });
    // Treat "already ended/closed/inactive" as non-fatal so partial relists
    // can recover (the seller's intent is "end + relist"; if already ended,
    // just proceed to the relist step).
    if (endRes.data.includes('<Ack>Failure</Ack>')) {
      const longMsg = endRes.data.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || '';
      const recoverable = /already (?:ended|closed|been ended|been closed)|not active|no longer active|cannot be ended|auction.*closed|listing.*ended/i.test(longMsg);
      if (!recoverable) {
        return res.status(400).json({ error: 'End listing failed: ' + (longMsg || 'Unknown error') });
      }
      console.warn(`[relist] EndFixedPriceItem returned recoverable failure (${oldItemId}): ${longMsg}`);
    }

    // Step 2 — push a fresh listing immediately. Live policies from Step 0
    // take precedence over caller-supplied overrides; if Step 0 returned
    // nothing, the caller's overrides (or user defaults) win.
    const result = await pushListingToEbay(
      {
        listing: listingWithSku,
        overrideCategoryId: liveCategoryId || req.body.overrideCategoryId || listing.categoryId,
        overrideConditionId: liveConditionId || req.body.overrideConditionId,
        overrideFulfillmentPolicyId: livePolicies.shipping || req.body.overrideFulfillmentPolicyId,
        overrideReturnPolicyId: livePolicies.return || req.body.overrideReturnPolicyId,
        overridePaymentPolicyId: livePolicies.payment || req.body.overridePaymentPolicyId,
        bestOffer: req.body.bestOffer,
        companyId: req.companyId,
      },
      pushDeps,
    );

    // Step 3 — sync the local DB record with the new eBay item ID.
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

module.exports = router;
