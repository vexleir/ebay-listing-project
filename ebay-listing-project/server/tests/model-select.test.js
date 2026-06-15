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

test('versionScore is higher for newer versions and generalizes past 2.5', () => {
  // Higher = newer = preferred.
  assert.ok(versionScore('gemini-2.5-flash') > versionScore('gemini-2.0-flash'));
  assert.ok(versionScore('gemini-2.0-flash') > versionScore('gemini-1.5-flash'));
  // Newer major/minor versions outrank 2.5 (the old hardcoded scoring buried these).
  assert.ok(versionScore('gemini-3-flash') > versionScore('gemini-2.5-flash'));
  assert.ok(versionScore('gemini-3.1-pro') > versionScore('gemini-3-pro'));
  // Unversioned aliases rank lowest.
  assert.equal(versionScore('gemini-flash-latest'), -1);
});

test('sortGeminiModels puts flash variants first, then newest version', () => {
  const sorted = sortGeminiModels([
    'gemini-1.5-pro',
    'gemini-2.0-flash',
    'gemini-3-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash',
  ]);
  // Newest flash wins.
  assert.equal(sorted[0], 'gemini-3-flash');
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

test('listGeminiModels excludes non-text and non-GA model variants', async () => {
  // All of these support generateContent and contain "gemini" but must not be
  // picked for text listing generation.
  const fetchImpl = fakeFetch([
    { name: 'gemini-2.5-flash' },
    { name: 'gemini-2.5-flash-image' },
    { name: 'gemini-3.1-flash-image-preview' },
    { name: 'gemini-2.5-flash-preview-tts' },
    { name: 'gemini-3-flash-preview' },
    { name: 'gemini-2.5-flash-lite' },
    { name: 'gemini-2.5-computer-use-preview' },
    { name: 'gemini-robotics-er-1.5-preview' },
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
