// AddFixedPriceItem flow extracted from server/app.js.
//
// The MODULE contains two layers:
//   1. Pure XML builders (formatValidPrice, wrap*, build*Xml) — frozen by
//      28 characterization tests in server/tests/listing-xml.test.js.
//   2. Orchestration (uploadImagesToEps, pushListingToEbay, parseEbayErrors,
//      sendEbayPushError) — image uploads, the AddFixedPriceItem POST,
//      condition-error retry, and HTTP response shaping.
//
// IMPORTANT: builders are referentially transparent — do NOT add process.env,
// DB, or HTTP calls to them. Orchestration helpers DO perform IO; they take
// their dependencies (axios transport, getValidAccessToken, getSettings,
// condition helpers) as injected parameters so tests can substitute fakes
// without monkey-patching modules.

const axiosDefault = require('axios');
const { buildItemSpecificsXml } = require('./xml');
const { getConditionId, pickFallbackConditionId } = require('./conditions');
const { getValidConditionIdsForCategory } = require('./categories');
const { tradingApiCall, TRADING_API_URL } = require('./client');

// Parse a free-form price string ("$24.99", "24.99 USD", "24") into the
// fixed-2-decimal string eBay expects. Returns '50.00' as a safety default
// for unusable input — matches production behavior; do not loosen without
// updating tests.
function formatValidPrice(rawPriceString) {
  const cleaned = (rawPriceString || '').replace(/[^0-9.]/g, '');
  if (!cleaned) return '50.00';
  const n = parseFloat(cleaned);
  if (!isFinite(n)) return '50.00';
  return n.toFixed(2);
}

// Header + body + footer concatenation. Null/undefined header or footer are
// treated as empty strings; body is required by upstream code so we don't
// guard against it here.
function wrapDescription(header, body, footer) {
  return (header || '') + body + (footer || '');
}

function buildPictureDetailsXml(uploadedPictureUrls) {
  if (!Array.isArray(uploadedPictureUrls) || uploadedPictureUrls.length === 0) return '';
  return '<PictureDetails>\n' +
    uploadedPictureUrls.map((url) => `<PictureURL>${url}</PictureURL>`).join('\n') +
    '\n</PictureDetails>';
}

// Translates listing.packageLength/Width/Depth/WeightLbs/WeightOz into the
// <ShippingPackageDetails> block. Returns '' when nothing is set so the
// caller can interpolate without conditionals.
function buildShippingPackageDetailsXml(listing) {
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
  if (!(len || wid || dep || lbs || oz)) return '';

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
  return `<ShippingPackageDetails>${parts.join('')}</ShippingPackageDetails>`;
}

// Best Offer block. Returns { bestOfferDetailsXml, listingDetailsXml }.
// Auto-accept/min thresholds are only sent when usable (positive numbers);
// missing or zero/negative values are silently dropped so eBay falls back
// to "no threshold set" behavior.
function buildBestOfferXml(bestOffer) {
  if (!bestOffer || !bestOffer.enabled) {
    return { bestOfferDetailsXml: '', listingDetailsXml: '' };
  }
  const bestOfferDetailsXml = '<BestOfferDetails><BestOfferEnabled>true</BestOfferEnabled></BestOfferDetails>';
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
  const listingDetailsXml = parts.length > 0 ? `<ListingDetails>${parts.join('')}</ListingDetails>` : '';
  return { bestOfferDetailsXml, listingDetailsXml };
}

// ScheduleTime is only set when the request falls inside eBay's 21-day
// window AND at least 5 minutes in the future. Anything else returns '' so
// the listing goes live immediately. `now` is injectable for deterministic
// tests; production callers can omit it.
function buildScheduleTimeXml(scheduleDate, { now = Date.now() } = {}) {
  if (!scheduleDate) return '';
  const scheduleMs = new Date(scheduleDate).getTime();
  if (!Number.isFinite(scheduleMs)) return '';
  const maxMs = now + (21 * 24 * 60 * 60 * 1000);
  const minMs = now + (5 * 60 * 1000);
  if (scheduleMs < minMs || scheduleMs > maxMs) return '';
  return `<ScheduleTime>${new Date(scheduleDate).toISOString()}</ScheduleTime>`;
}

// The full AddFixedPriceItem request body. All optional sub-blocks are
// allowed to be empty strings — the template tolerates blank lines and
// eBay ignores them. Title is truncated to 80 chars per eBay's hard cap.
//
// Required params:
//   listing                     — { title, description, quantity, sku?, itemSpecifics? }
//   config                      — { categoryId, sellerZip, sellerLocation,
//                                   paymentPolicy, returnPolicy, fulfillmentPolicy }
//   conditionId                 — string like '3000'
//   validPrice                  — formatted "24.99"-style string
//   pictureDetailsXml           — output of buildPictureDetailsXml
//   itemSpecificsXml            — output of buildItemSpecificsXml
//   shippingPackageDetailsXml   — output of buildShippingPackageDetailsXml
//   bestOfferDetailsXml         — output of buildBestOfferXml
//   listingDetailsXml           — output of buildBestOfferXml
//   scheduleTimeXml             — output of buildScheduleTimeXml
//   wrappedDescription          — output of wrapDescription
function buildAddFixedPriceItemXml({
  listing,
  config,
  conditionId,
  validPrice,
  pictureDetailsXml,
  itemSpecificsXml,
  shippingPackageDetailsXml,
  bestOfferDetailsXml,
  listingDetailsXml,
  scheduleTimeXml,
  wrappedDescription,
}) {
  return `<?xml version="1.0" encoding="utf-8"?>
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
}

// ─── Orchestration ───────────────────────────────────────────────────────

// Detect the image format from either a URL or a data: URI prefix. Defaults
// to 'jpeg' when nothing identifies the format (matches existing behavior).
function detectImageFormat(input) {
  if (typeof input !== 'string') return 'jpeg';
  if (input.startsWith('http')) {
    const urlPath = input.split('?')[0];
    const ext = urlPath.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return ext === 'jpg' ? 'jpeg' : ext;
    }
    return 'jpeg';
  }
  const headerMatch = input.match(/^data:image\/([a-zA-Z0-9]+);base64,/);
  if (headerMatch) return headerMatch[1];
  return 'jpeg';
}

// Parse eBay <Errors> blocks (one per error/warning) into `{ errors, warnings }`.
// Returns string arrays — the caller decides how to surface them.
function parseEbayErrors(xml) {
  const blocks = [...xml.matchAll(/<Errors>([\s\S]*?)<\/Errors>/g)].map((m) => m[1]);
  const errors = [];
  const warnings = [];
  for (const b of blocks) {
    const severity = b.match(/<SeverityCode>(.*?)<\/SeverityCode>/)?.[1] || 'Error';
    const msg = b.match(/<LongMessage>(.*?)<\/LongMessage>/)?.[1] || '';
    if (!msg) continue;
    if (severity === 'Warning') warnings.push(msg);
    else errors.push(msg);
  }
  return { errors, warnings };
}

// Upload an array of images (URLs or data: URIs) to eBay's EPS. Returns the
// array of <FullURL> values eBay assigned. Throws on per-image failure.
// `axios` is injectable for tests; production callers can omit it.
async function uploadImagesToEps(images, token, { axios = axiosDefault } = {}) {
  const uploaded = [];
  if (!images || images.length === 0) return uploaded;
  console.log(`Uploading ${images.length} images to eBay EPS...`);
  for (let i = 0; i < images.length; i++) {
    const format = detectImageFormat(images[i]);
    let imageBytes;
    if (images[i].startsWith('http')) {
      const imgRes = await axios.get(images[i], { responseType: 'arraybuffer' });
      imageBytes = Buffer.from(imgRes.data);
    } else {
      const base64Data = images[i].split(',')[1] || images[i];
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
    const part1 = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="XML Payload"\r\nContent-Type: text/xml\r\n\r\n${xmlPayload}\r\n--${boundary}\r\nContent-Disposition: form-data; name="dummy"; filename="image_${i}.${format}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    const part3 = Buffer.from(`\r\n--${boundary}--\r\n`);
    const finalPayload = Buffer.concat([part1, imageBytes, part3]);
    const picRes = await axios.post(TRADING_API_URL, finalPayload, {
      headers: {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1331',
        'X-EBAY-API-CALL-NAME': 'UploadSiteHostedPictures',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-IAF-TOKEN': token,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
    });
    const match = picRes.data.match(/<FullURL>(.*?)<\/FullURL>/);
    if (match && match[1]) {
      uploaded.push(match[1]);
    } else {
      const errMsg = picRes.data.match(/<LongMessage>(.*?)<\/LongMessage>/);
      const e = new Error('eBay EPS Image Upload Failed: ' + (errMsg ? errMsg[1] : 'Unknown error'));
      e.status = 400;
      throw e;
    }
  }
  return uploaded;
}

// Resolve the seven config values pushListingToEbay needs (policies +
// category + location). Centralized so the route handler doesn't have to
// know about env defaults. Throws a 400 when any required policy is missing.
function resolveListingConfig({ listing, userSettings, overrides }) {
  const config = {
    fulfillmentPolicy: overrides.fulfillmentPolicy || userSettings.defaultFulfillmentPolicyId || process.env.EBAY_FULFILLMENT_POLICY_ID,
    paymentPolicy: overrides.paymentPolicy || userSettings.defaultPaymentPolicyId || process.env.EBAY_PAYMENT_POLICY_ID,
    returnPolicy: overrides.returnPolicy || userSettings.defaultReturnPolicyId || process.env.EBAY_RETURN_POLICY_ID,
    categoryId: overrides.categoryId || listing.categoryId || process.env.EBAY_DEFAULT_CATEGORY_ID || '261068',
    sellerZip: userSettings.sellerZip || process.env.SELLER_ZIP || '10001',
    sellerLocation: userSettings.sellerLocation || process.env.SELLER_LOCATION || 'United States',
  };
  const missing = [];
  if (!config.fulfillmentPolicy) missing.push('Shipping/Fulfillment Policy');
  if (!config.returnPolicy) missing.push('Return Policy');
  if (!config.paymentPolicy) missing.push('Payment Policy');
  if (missing.length > 0) {
    const err = new Error(
      `eBay listing requires the following policies to be configured in Settings: ${missing.join(', ')}. Go to Settings → eBay Policies to select your saved eBay business policies.`,
    );
    err.status = 400;
    throw err;
  }
  return config;
}

// The full draft/relist flow. Returns { draftId, conditionFallback, warnings }.
// Throws an Error with .status (and optionally .warnings) on failure.
//
// Dependencies are injected: deps.getSettings, deps.getValidAccessToken,
// deps.axios. Defaults are wired so production callers can omit them.
async function pushListingToEbay(
  {
    listing,
    overrideCategoryId,
    overrideConditionId,
    overrideFulfillmentPolicyId,
    overrideReturnPolicyId,
    overridePaymentPolicyId,
    scheduleDate,
    bestOffer,
    companyId,
  },
  deps,
) {
  const {
    getSettings,
    getValidAccessToken,
    axios = axiosDefault,
  } = deps || {};
  if (typeof getSettings !== 'function') throw new Error('pushListingToEbay: deps.getSettings is required');
  if (typeof getValidAccessToken !== 'function') throw new Error('pushListingToEbay: deps.getValidAccessToken is required');

  const userSettings = await getSettings(companyId).catch(() => ({}));
  const config = resolveListingConfig({
    listing,
    userSettings,
    overrides: {
      fulfillmentPolicy: overrideFulfillmentPolicyId,
      paymentPolicy: overridePaymentPolicyId,
      returnPolicy: overrideReturnPolicyId,
      categoryId: overrideCategoryId,
    },
  });

  const token = await getValidAccessToken(companyId);
  console.log(`--- Initiating XML Trading API push for: ${listing.title} ---`);

  const uploadedPictureUrls = await uploadImagesToEps(listing.images, token, { axios });
  if (listing.images && listing.images.length > 0 && uploadedPictureUrls.length === 0) {
    const e = new Error('All image uploads to eBay failed.');
    e.status = 400;
    throw e;
  }

  const validPrice = formatValidPrice(listing.priceRecommendation);
  let conditionId = overrideConditionId || getConditionId(listing.condition);

  // Proactively validate the condition against the category we're ACTUALLY
  // sending. Categories like Comics reject the generic IDs, so correct up
  // front rather than relying solely on the post-failure retry.
  const validConditionIds = await getValidConditionIdsForCategory(config.categoryId, token, { transport: axios });
  if (validConditionIds.length > 0 && !validConditionIds.includes(String(conditionId))) {
    const corrected = pickFallbackConditionId(validConditionIds, conditionId);
    console.warn(`[draft] Condition ${conditionId} not valid for category ${config.categoryId} — using ${corrected} (valid: ${validConditionIds.join(',')})`);
    conditionId = corrected;
  } else {
    console.log(`[draft] Condition ${conditionId} for category ${config.categoryId} (valid: ${validConditionIds.join(',') || 'none returned by GetCategoryFeatures'})`);
  }

  const scheduleTimeXml = buildScheduleTimeXml(scheduleDate);
  if (scheduleDate && !scheduleTimeXml) {
    console.warn(`[draft] scheduleDate ${scheduleDate} out of eBay range — listing immediately`);
  } else if (scheduleTimeXml) {
    console.log(`[draft] Scheduling listing for: ${new Date(scheduleDate).toISOString()}`);
  }

  const pictureDetailsXml = buildPictureDetailsXml(uploadedPictureUrls);
  const itemSpecificsXml = buildItemSpecificsXml(listing.itemSpecifics);
  const wrappedDescription = wrapDescription(userSettings.descriptionHeader, listing.description, userSettings.descriptionFooter);
  const shippingPackageDetailsXml = buildShippingPackageDetailsXml(listing);
  const { bestOfferDetailsXml, listingDetailsXml } = buildBestOfferXml(bestOffer);

  const addItemXml = buildAddFixedPriceItemXml({
    listing,
    config,
    conditionId,
    validPrice,
    pictureDetailsXml,
    itemSpecificsXml,
    shippingPackageDetailsXml,
    bestOfferDetailsXml,
    listingDetailsXml,
    scheduleTimeXml,
    wrappedDescription,
  });

  const addRes = await tradingApiCall({
    callName: 'AddFixedPriceItem',
    xmlBody: addItemXml,
    token,
    transport: axios,
  });

  if (addRes.data.includes('<Ack>Failure</Ack>') || addRes.data.includes('<Ack>Error</Ack>')) {
    const { errors: trueErrors, warnings } = parseEbayErrors(addRes.data);
    if (warnings.length) console.warn('[draft] eBay warnings:', warnings.join(' | '));

    // Auto-retry: if the only blocking error is an invalid condition, fall
    // back to the closest valid one eBay returned (or 3000 as last resort).
    const isConditionError = trueErrors.length > 0 && trueErrors.every((e) =>
      e.toLowerCase().includes('condition') && (e.toLowerCase().includes('invalid') || e.toLowerCase().includes('not valid'))
    );
    if (isConditionError) {
      const validIds = await getValidConditionIdsForCategory(config.categoryId, token, { transport: axios });
      const fallbackId = pickFallbackConditionId(validIds, conditionId) || '3000';
      if (validIds.length > 0 && validIds.includes(String(conditionId))) {
        const errorMsg = trueErrors.join(' | ');
        console.error('[draft] eBay errors (condition reported valid for category):', errorMsg);
        const e = new Error('eBay API Error: ' + errorMsg);
        e.status = 400;
        e.warnings = warnings;
        throw e;
      }
      if (fallbackId === conditionId) {
        const diag = ` [diag: category=${config.categoryId}, tried=${conditionId}, eBay-accepts=${validIds.join(',') || 'NONE (GetCategoryFeatures returned no ConditionValues)'}]`;
        const e = new Error('eBay API Error: ' + trueErrors.join(' | ') + diag);
        e.status = 400;
        e.warnings = warnings;
        throw e;
      }
      console.warn(`[draft] Condition ${conditionId} invalid for category ${config.categoryId} — retrying with ${fallbackId} (valid: ${validIds.join(',') || 'none returned'})`);
      const retryXml = addItemXml.replace(`<ConditionID>${conditionId}</ConditionID>`, `<ConditionID>${fallbackId}</ConditionID>`);
      const retryRes = await tradingApiCall({
        callName: 'AddFixedPriceItem',
        xmlBody: retryXml,
        token,
        transport: axios,
      });
      if (!retryRes.data.includes('<Ack>Failure</Ack>') && !retryRes.data.includes('<Ack>Error</Ack>')) {
        const retryItemId = retryRes.data.match(/<ItemID>(.*?)<\/ItemID>/)?.[1] || 'Unknown ID';
        console.log(`[draft] Retry succeeded with condition ${fallbackId}. Item ID: ${retryItemId}`);
        return { draftId: retryItemId, conditionFallback: true, warnings };
      }
      const { errors: retryErrors, warnings: retryWarnings } = parseEbayErrors(retryRes.data);
      const diag = ` [diag: category=${config.categoryId}, tried=${conditionId}→${fallbackId}, eBay-accepts=${validIds.join(',') || 'NONE (GetCategoryFeatures returned no ConditionValues)'}]`;
      const e = new Error('eBay API Error: ' + retryErrors.join(' | ') + diag);
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

// Translate any error from pushListingToEbay (or related lifecycle calls)
// into an HTTP response on `res`.
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

module.exports = {
  // Pure builders (frozen by characterization tests).
  formatValidPrice,
  wrapDescription,
  buildPictureDetailsXml,
  buildShippingPackageDetailsXml,
  buildBestOfferXml,
  buildScheduleTimeXml,
  buildAddFixedPriceItemXml,
  buildItemSpecificsXml,
  // Orchestration.
  detectImageFormat,
  parseEbayErrors,
  uploadImagesToEps,
  resolveListingConfig,
  pushListingToEbay,
  sendEbayPushError,
};
