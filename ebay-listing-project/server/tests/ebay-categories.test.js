const assert = require('node:assert/strict');
const test = require('node:test');

const {
  tradingApiCall,
  TRADING_API_URL,
  DEFAULT_COMPATIBILITY_LEVEL,
  DEFAULT_SITE_ID,
} = require('../services/ebay/client');
const {
  buildGetCategoryFeaturesXml,
  parseConditionIds,
  getValidConditionIdsForCategory,
} = require('../services/ebay/categories');

// ─── client.tradingApiCall ─────────────────────────────────────────────────

test('tradingApiCall sends the expected headers and URL to the transport', async () => {
  const calls = [];
  const transport = {
    post: async (url, body, config) => {
      calls.push({ url, body, config });
      return { data: '<ok/>' };
    },
  };

  const res = await tradingApiCall({
    callName: 'GetCategoryFeatures',
    xmlBody: '<req/>',
    token: 'tok-abc',
    transport,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TRADING_API_URL);
  assert.equal(calls[0].body, '<req/>');
  assert.equal(calls[0].config.headers['X-EBAY-API-CALL-NAME'], 'GetCategoryFeatures');
  assert.equal(calls[0].config.headers['X-EBAY-API-COMPATIBILITY-LEVEL'], DEFAULT_COMPATIBILITY_LEVEL);
  assert.equal(calls[0].config.headers['X-EBAY-API-SITEID'], DEFAULT_SITE_ID);
  assert.equal(calls[0].config.headers['X-EBAY-API-IAF-TOKEN'], 'tok-abc');
  assert.equal(calls[0].config.headers['Content-Type'], 'text/xml');
  assert.equal(res.data, '<ok/>');
});

test('tradingApiCall honors siteId and compatibilityLevel overrides', async () => {
  let captured;
  const transport = { post: async (url, body, config) => { captured = config; return { data: '' }; } };

  await tradingApiCall({
    callName: 'X',
    xmlBody: '<x/>',
    token: 't',
    siteId: '3',
    compatibilityLevel: '1235',
    transport,
  });

  assert.equal(captured.headers['X-EBAY-API-SITEID'], '3');
  assert.equal(captured.headers['X-EBAY-API-COMPATIBILITY-LEVEL'], '1235');
});

test('tradingApiCall throws when required fields are missing', async () => {
  const noop = { post: async () => ({ data: '' }) };
  await assert.rejects(
    () => tradingApiCall({ xmlBody: '<x/>', token: 't', transport: noop }),
    /callName/,
  );
  await assert.rejects(
    () => tradingApiCall({ callName: 'X', token: 't', transport: noop }),
    /xmlBody/,
  );
  await assert.rejects(
    () => tradingApiCall({ callName: 'X', xmlBody: '<x/>', transport: noop }),
    /token/,
  );
});

// ─── categories.buildGetCategoryFeaturesXml ───────────────────────────────

test('buildGetCategoryFeaturesXml includes DetailLevel=ReturnAll (required for ConditionValues)', () => {
  const xml = buildGetCategoryFeaturesXml('259104');
  assert.match(xml, /<CategoryID>259104<\/CategoryID>/);
  assert.match(xml, /<DetailLevel>ReturnAll<\/DetailLevel>/);
  assert.match(xml, /<FeatureID>ConditionValues<\/FeatureID>/);
  assert.match(xml, /<ViewAllNodes>true<\/ViewAllNodes>/);
});

// ─── categories.parseConditionIds ─────────────────────────────────────────

test('parseConditionIds extracts every <Condition><ID> in a response body', () => {
  const xml = `<GetCategoryFeaturesResponse>
    <Category>
      <ConditionValues>
        <Condition><ID>1000</ID><DisplayName>New</DisplayName></Condition>
        <Condition><ID>2750</ID><DisplayName>Like New</DisplayName></Condition>
        <Condition><ID>4000</ID><DisplayName>Very Good</DisplayName></Condition>
        <Condition><ID>5000</ID><DisplayName>Good</DisplayName></Condition>
        <Condition><ID>6000</ID><DisplayName>Acceptable</DisplayName></Condition>
      </ConditionValues>
    </Category>
  </GetCategoryFeaturesResponse>`;
  assert.deepEqual(parseConditionIds(xml), ['1000', '2750', '4000', '5000', '6000']);
});

test('parseConditionIds returns [] for empty, null, or non-string input', () => {
  assert.deepEqual(parseConditionIds(''), []);
  assert.deepEqual(parseConditionIds(null), []);
  assert.deepEqual(parseConditionIds(undefined), []);
  assert.deepEqual(parseConditionIds(12345), []);
  assert.deepEqual(parseConditionIds('<no-conditions/>'), []);
});

test('parseConditionIds tolerates whitespace between tags', () => {
  const xml = `<Condition>
    <ID>3000</ID>
  </Condition>`;
  assert.deepEqual(parseConditionIds(xml), ['3000']);
});

// ─── categories.getValidConditionIdsForCategory ───────────────────────────

test('getValidConditionIdsForCategory returns parsed IDs on a successful call', async () => {
  const transport = {
    post: async () => ({ data: '<Condition><ID>1000</ID></Condition><Condition><ID>4000</ID></Condition>' }),
  };
  const ids = await getValidConditionIdsForCategory('259104', 'tok', { transport });
  assert.deepEqual(ids, ['1000', '4000']);
});

test('getValidConditionIdsForCategory returns [] when the transport throws (swallows network failure)', async () => {
  const transport = {
    post: async () => { throw new Error('network down'); },
  };
  const ids = await getValidConditionIdsForCategory('259104', 'tok', { transport });
  assert.deepEqual(ids, []);
});

test('getValidConditionIdsForCategory passes the right callName and category through to the transport', async () => {
  let captured;
  const transport = {
    post: async (url, body, config) => { captured = { url, body, config }; return { data: '' }; },
  };
  await getValidConditionIdsForCategory('11116', 'tok-xyz', { transport });
  assert.equal(captured.config.headers['X-EBAY-API-CALL-NAME'], 'GetCategoryFeatures');
  assert.equal(captured.config.headers['X-EBAY-API-IAF-TOKEN'], 'tok-xyz');
  assert.match(captured.body, /<CategoryID>11116<\/CategoryID>/);
});
