const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_MODELS,
  DEFAULT_BEST_MODEL,
  versionScore,
  sortGeminiModels,
  listGeminiModels,
  getPreferredGeminiModels,
  getBestGeminiModel,
} = require('../services/ai/modelSelect');

// Build a fake fetch that returns a model-list payload.
function fakeFetch(models, { ok = true } = {}) {
  return async () => ({
    ok,
    json: async () => ({
      models: models.map((m) => ({
        name: `models/${m.name}`,
        supportedGenerationMethods: m.methods || ['generateContent'],
      })),
    }),
  });
}

test('versionScore prefers 2.5 over 2.0 over 1.5', () => {
  assert.ok(versionScore('gemini-2.5-flash') < versionScore('gemini-2.0-flash'));
  assert.ok(versionScore('gemini-2.0-flash') < versionScore('gemini-1.5-flash'));
  assert.equal(versionScore('gemini-9-experimental'), 3);
});

test('sortGeminiModels puts flash variants first, then newest version', () => {
  const sorted = sortGeminiModels([
    'gemini-1.5-pro',
    'gemini-2.0-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
  ]);
  assert.equal(sorted[0], 'gemini-2.5-flash');
  // All flash variants come before the non-flash pro.
  assert.equal(sorted[sorted.length - 1], 'gemini-1.5-pro');
});

test('listGeminiModels filters non-gemini and non-generateContent models', async () => {
  const fetchImpl = fakeFetch([
    { name: 'gemini-2.5-flash' },
    { name: 'text-bison', methods: ['generateContent'] },
    { name: 'gemini-embed', methods: ['embedContent'] },
  ]);
  const models = await listGeminiModels('key', { fetchImpl });
  assert.deepEqual(models, ['gemini-2.5-flash']);
});

test('listGeminiModels returns [] when the endpoint is not ok', async () => {
  const fetchImpl = fakeFetch([{ name: 'gemini-2.5-flash' }], { ok: false });
  assert.deepEqual(await listGeminiModels('key', { fetchImpl }), []);
});

test('listGeminiModels returns [] when fetch throws', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  assert.deepEqual(await listGeminiModels('key', { fetchImpl }), []);
});

test('getPreferredGeminiModels falls back to DEFAULT_MODELS when none available', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  assert.deepEqual(await getPreferredGeminiModels('key', { fetchImpl }), DEFAULT_MODELS);
});

test('getBestGeminiModel returns the top available model', async () => {
  const fetchImpl = fakeFetch([
    { name: 'gemini-1.5-pro' },
    { name: 'gemini-2.5-flash' },
  ]);
  assert.equal(await getBestGeminiModel('key', { fetchImpl }), 'gemini-2.5-flash');
});

test('getBestGeminiModel falls back to DEFAULT_BEST_MODEL when none available', async () => {
  const fetchImpl = async () => { throw new Error('network down'); };
  assert.equal(await getBestGeminiModel('key', { fetchImpl }), DEFAULT_BEST_MODEL);
});
