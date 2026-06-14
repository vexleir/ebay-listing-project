// Tests for the orchestration half of services/ebay/listingLifecycle.js
// (parseEbayErrors, detectImageFormat, resolveListingConfig, uploadImagesToEps,
// pushListingToEbay). Pure XML builders are covered by listing-xml.test.js.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  parseEbayErrors,
  detectImageFormat,
  resolveListingConfig,
  uploadImagesToEps,
  pushListingToEbay,
} = require('../services/ebay/listingLifecycle');

// ─── parseEbayErrors ──────────────────────────────────────────────────────

test('parseEbayErrors separates Warning vs Error severities', () => {
  const xml = `
    <Errors><SeverityCode>Warning</SeverityCode><LongMessage>Heads up: low fee</LongMessage></Errors>
    <Errors><SeverityCode>Error</SeverityCode><LongMessage>Bad ConditionID</LongMessage></Errors>
    <Errors><LongMessage>Another error (no severity)</LongMessage></Errors>
  `;
  const out = parseEbayErrors(xml);
  assert.deepEqual(out.warnings, ['Heads up: low fee']);
  assert.deepEqual(out.errors, ['Bad ConditionID', 'Another error (no severity)']);
});

test('parseEbayErrors returns empty arrays for input with no Errors blocks', () => {
  assert.deepEqual(parseEbayErrors('<Ack>Success</Ack>'), { errors: [], warnings: [] });
});

test('parseEbayErrors skips blocks without a LongMessage', () => {
  const xml = '<Errors><SeverityCode>Error</SeverityCode></Errors>';
  assert.deepEqual(parseEbayErrors(xml), { errors: [], warnings: [] });
});

// ─── detectImageFormat ────────────────────────────────────────────────────

test('detectImageFormat reads jpg / png / gif / webp from URLs', () => {
  assert.equal(detectImageFormat('https://x.com/a.jpg'), 'jpeg');
  assert.equal(detectImageFormat('https://x.com/a.JPG'), 'jpeg');
  assert.equal(detectImageFormat('https://x.com/a.jpeg'), 'jpeg');
  assert.equal(detectImageFormat('https://x.com/a.png'), 'png');
  assert.equal(detectImageFormat('https://x.com/a.gif'), 'gif');
  assert.equal(detectImageFormat('https://x.com/a.webp'), 'webp');
});

test('detectImageFormat ignores URL query strings when looking at the extension', () => {
  assert.equal(detectImageFormat('https://x.com/a.png?v=1'), 'png');
});

test('detectImageFormat reads the format from a data: URI prefix', () => {
  assert.equal(detectImageFormat('data:image/png;base64,xxx'), 'png');
  assert.equal(detectImageFormat('data:image/webp;base64,xxx'), 'webp');
});

test('detectImageFormat defaults to jpeg for unknown input', () => {
  assert.equal(detectImageFormat('foo'), 'jpeg');
  assert.equal(detectImageFormat(null), 'jpeg');
  assert.equal(detectImageFormat('https://x.com/no-extension'), 'jpeg');
});

// ─── resolveListingConfig ─────────────────────────────────────────────────

const fullSettings = {
  defaultFulfillmentPolicyId: 'f-default',
  defaultPaymentPolicyId: 'p-default',
  defaultReturnPolicyId: 'r-default',
  sellerZip: '94110',
  sellerLocation: 'San Francisco',
};

test('resolveListingConfig applies overrides first, then user settings, then env defaults', () => {
  const prev = {
    EBAY_FULFILLMENT_POLICY_ID: process.env.EBAY_FULFILLMENT_POLICY_ID,
    EBAY_PAYMENT_POLICY_ID: process.env.EBAY_PAYMENT_POLICY_ID,
    EBAY_RETURN_POLICY_ID: process.env.EBAY_RETURN_POLICY_ID,
    EBAY_DEFAULT_CATEGORY_ID: process.env.EBAY_DEFAULT_CATEGORY_ID,
  };
  process.env.EBAY_FULFILLMENT_POLICY_ID = 'f-env';
  process.env.EBAY_PAYMENT_POLICY_ID = 'p-env';
  process.env.EBAY_RETURN_POLICY_ID = 'r-env';
  process.env.EBAY_DEFAULT_CATEGORY_ID = '99999';

  try {
    // Override wins
    const a = resolveListingConfig({
      listing: { categoryId: '111' },
      userSettings: fullSettings,
      overrides: { fulfillmentPolicy: 'f-override' },
    });
    assert.equal(a.fulfillmentPolicy, 'f-override');
    assert.equal(a.paymentPolicy, 'p-default'); // user setting
    assert.equal(a.categoryId, '111'); // listing value (no override)

    // No user settings → env
    const b = resolveListingConfig({
      listing: {},
      userSettings: {},
      overrides: {},
    });
    assert.equal(b.fulfillmentPolicy, 'f-env');
    assert.equal(b.categoryId, '99999');
    assert.equal(b.sellerZip, '10001'); // SELLER_ZIP env not set → hardcoded fallback
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('resolveListingConfig throws a 400 when any required policy is missing', () => {
  const prev = {
    EBAY_FULFILLMENT_POLICY_ID: process.env.EBAY_FULFILLMENT_POLICY_ID,
    EBAY_PAYMENT_POLICY_ID: process.env.EBAY_PAYMENT_POLICY_ID,
    EBAY_RETURN_POLICY_ID: process.env.EBAY_RETURN_POLICY_ID,
  };
  delete process.env.EBAY_FULFILLMENT_POLICY_ID;
  delete process.env.EBAY_PAYMENT_POLICY_ID;
  delete process.env.EBAY_RETURN_POLICY_ID;
  try {
    assert.throws(
      () => resolveListingConfig({ listing: {}, userSettings: {}, overrides: {} }),
      (err) => err.status === 400 && /Shipping\/Fulfillment Policy/.test(err.message),
    );
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

// ─── uploadImagesToEps ────────────────────────────────────────────────────

test('uploadImagesToEps returns [] for empty input without hitting the network', async () => {
  const transport = { post: () => { throw new Error('should not be called'); }, get: () => { throw new Error('should not be called'); } };
  assert.deepEqual(await uploadImagesToEps([], 'token', { axios: transport }), []);
  assert.deepEqual(await uploadImagesToEps(undefined, 'token', { axios: transport }), []);
});

test('uploadImagesToEps decodes data URIs, posts to the Trading API, and collects FullURLs', async () => {
  const calls = [];
  const transport = {
    get: async () => { throw new Error('http image fetch should not be used for data URI input'); },
    post: async (url, body, config) => {
      calls.push({ url, headers: config.headers });
      return { data: '<UploadSiteHostedPicturesResponse><FullURL>https://eps.example/img.jpg</FullURL></UploadSiteHostedPicturesResponse>' };
    },
  };
  const dataUri = 'data:image/png;base64,' + Buffer.from('test-png').toString('base64');
  const out = await uploadImagesToEps([dataUri], 'tok-123', { axios: transport });
  assert.deepEqual(out, ['https://eps.example/img.jpg']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.ebay.com/ws/api.dll');
  assert.equal(calls[0].headers['X-EBAY-API-CALL-NAME'], 'UploadSiteHostedPictures');
  assert.equal(calls[0].headers['X-EBAY-API-IAF-TOKEN'], 'tok-123');
  assert.match(calls[0].headers['Content-Type'], /^multipart\/form-data; boundary=/);
});

test('uploadImagesToEps throws a 400 when eBay reports a LongMessage error', async () => {
  const transport = {
    get: async () => ({ data: Buffer.from('') }),
    post: async () => ({ data: '<UploadSiteHostedPicturesResponse><Errors><LongMessage>image too small</LongMessage></Errors></UploadSiteHostedPicturesResponse>' }),
  };
  await assert.rejects(
    () => uploadImagesToEps(['data:image/png;base64,abc'], 'tok', { axios: transport }),
    (err) => err.status === 400 && /image too small/i.test(err.message),
  );
});

// ─── pushListingToEbay (orchestration) ────────────────────────────────────

function makeAxiosFake(responses) {
  // responses: an ordered array of { url, callName, data, status? } records;
  // every axios.post(...) consumes the next matching response. Useful for
  // sequencing GetCategoryFeatures → AddFixedPriceItem.
  const log = [];
  const queue = [...responses];
  return {
    log,
    transport: {
      get: async () => { throw new Error('axios.get should not be hit by pushListingToEbay for this test'); },
      post: async (url, body, config) => {
        const callName = config.headers['X-EBAY-API-CALL-NAME'];
        log.push({ url, callName });
        const next = queue.shift();
        if (!next) throw new Error(`No more queued responses; received ${callName}`);
        if (next.callName && next.callName !== callName) {
          throw new Error(`Expected callName ${next.callName} but got ${callName}`);
        }
        if (next.error) throw next.error;
        return { data: next.data };
      },
    },
  };
}

test('pushListingToEbay validates required deps', async () => {
  await assert.rejects(
    () => pushListingToEbay({ listing: { title: 't', description: 'd', quantity: 1 }, companyId: 'c' }, {}),
    /deps\.getSettings is required/,
  );
});

test('pushListingToEbay happy path returns { draftId, conditionFallback: false, warnings: [] }', async () => {
  const prev = {
    EBAY_FULFILLMENT_POLICY_ID: process.env.EBAY_FULFILLMENT_POLICY_ID,
    EBAY_PAYMENT_POLICY_ID: process.env.EBAY_PAYMENT_POLICY_ID,
    EBAY_RETURN_POLICY_ID: process.env.EBAY_RETURN_POLICY_ID,
  };
  process.env.EBAY_FULFILLMENT_POLICY_ID = 'f';
  process.env.EBAY_PAYMENT_POLICY_ID = 'p';
  process.env.EBAY_RETURN_POLICY_ID = 'r';

  const { transport } = makeAxiosFake([
    // GetCategoryFeatures — return an empty conditions list so we skip the
    // pre-flight correction branch and go straight to AddFixedPriceItem.
    { callName: 'GetCategoryFeatures', data: '<GetCategoryFeaturesResponse></GetCategoryFeaturesResponse>' },
    // AddFixedPriceItem — succeed.
    { callName: 'AddFixedPriceItem', data: '<AddFixedPriceItemResponse><Ack>Success</Ack><ItemID>12345</ItemID></AddFixedPriceItemResponse>' },
  ]);

  try {
    const result = await pushListingToEbay(
      {
        listing: { title: 'Test', description: 'd', quantity: 1, condition: 'New', images: [] },
        companyId: 'c',
      },
      {
        getSettings: async () => ({}),
        getValidAccessToken: async () => 'tok',
        axios: transport,
      },
    );
    assert.deepEqual(result, { draftId: '12345', conditionFallback: false, warnings: [] });
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('pushListingToEbay surfaces non-condition Failure responses as a 400 Error', async () => {
  const prev = {
    EBAY_FULFILLMENT_POLICY_ID: process.env.EBAY_FULFILLMENT_POLICY_ID,
    EBAY_PAYMENT_POLICY_ID: process.env.EBAY_PAYMENT_POLICY_ID,
    EBAY_RETURN_POLICY_ID: process.env.EBAY_RETURN_POLICY_ID,
  };
  process.env.EBAY_FULFILLMENT_POLICY_ID = 'f';
  process.env.EBAY_PAYMENT_POLICY_ID = 'p';
  process.env.EBAY_RETURN_POLICY_ID = 'r';

  const { transport } = makeAxiosFake([
    { callName: 'GetCategoryFeatures', data: '<GetCategoryFeaturesResponse></GetCategoryFeaturesResponse>' },
    {
      callName: 'AddFixedPriceItem',
      data: '<AddFixedPriceItemResponse><Ack>Failure</Ack><Errors><SeverityCode>Error</SeverityCode><LongMessage>Title is required</LongMessage></Errors></AddFixedPriceItemResponse>',
    },
  ]);

  try {
    await assert.rejects(
      () => pushListingToEbay(
        {
          listing: { title: 'Test', description: 'd', quantity: 1, condition: 'New' },
          companyId: 'c',
        },
        {
          getSettings: async () => ({}),
          getValidAccessToken: async () => 'tok',
          axios: transport,
        },
      ),
      (err) => err.status === 400 && /Title is required/.test(err.message),
    );
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test('pushListingToEbay retries with a fallback condition when eBay rejects the original one', async () => {
  const prev = {
    EBAY_FULFILLMENT_POLICY_ID: process.env.EBAY_FULFILLMENT_POLICY_ID,
    EBAY_PAYMENT_POLICY_ID: process.env.EBAY_PAYMENT_POLICY_ID,
    EBAY_RETURN_POLICY_ID: process.env.EBAY_RETURN_POLICY_ID,
  };
  process.env.EBAY_FULFILLMENT_POLICY_ID = 'f';
  process.env.EBAY_PAYMENT_POLICY_ID = 'p';
  process.env.EBAY_RETURN_POLICY_ID = 'r';

  // Sequence:
  //   1. GetCategoryFeatures (pre-flight) — returns no conditions so we use the local mapping (3000 for "Used").
  //   2. AddFixedPriceItem #1 — fails with "Condition is not valid".
  //   3. GetCategoryFeatures (retry path) — returns valid IDs that don't include 3000.
  //   4. AddFixedPriceItem #2 — succeeds with the fallback ID.
  const { transport } = makeAxiosFake([
    { callName: 'GetCategoryFeatures', data: '<GetCategoryFeaturesResponse></GetCategoryFeaturesResponse>' },
    { callName: 'AddFixedPriceItem', data: '<AddFixedPriceItemResponse><Ack>Failure</Ack><Errors><SeverityCode>Error</SeverityCode><LongMessage>Condition is not valid for this category</LongMessage></Errors></AddFixedPriceItemResponse>' },
    { callName: 'GetCategoryFeatures', data: '<GetCategoryFeaturesResponse><Condition><ID>1000</ID></Condition><Condition><ID>2750</ID></Condition><Condition><ID>4000</ID></Condition></GetCategoryFeaturesResponse>' },
    { callName: 'AddFixedPriceItem', data: '<AddFixedPriceItemResponse><Ack>Success</Ack><ItemID>99999</ItemID></AddFixedPriceItemResponse>' },
  ]);

  try {
    const result = await pushListingToEbay(
      {
        listing: { title: 'Comics', description: 'd', quantity: 1, condition: 'Used', categoryId: '259104' },
        companyId: 'c',
      },
      {
        getSettings: async () => ({}),
        getValidAccessToken: async () => 'tok',
        axios: transport,
      },
    );
    assert.equal(result.draftId, '99999');
    assert.equal(result.conditionFallback, true);
  } finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
