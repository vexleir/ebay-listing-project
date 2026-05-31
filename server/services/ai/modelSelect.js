// Shared Gemini model discovery + preference ordering.
//
// Both server/ai.js (listing generation) and server/optimizer.js (listing
// optimization) need to pick a Gemini model: query the available models for
// the key, prefer `flash` variants, and prefer newer versions (2.5 → 2.0 →
// 1.5). This logic used to be copy-pasted in both files; P1.6 de-duplicates
// it here.
//
// `fetchImpl` is injectable so unit tests can stub the model-list endpoint
// without a network call or a real API key.

// Fallback list used when the model-list endpoint is unavailable.
const DEFAULT_MODELS = Object.freeze([
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
]);

const DEFAULT_BEST_MODEL = 'gemini-2.5-flash';

// Lower score = higher preference.
function versionScore(name) {
  if (name.includes('2.5')) return 0;
  if (name.includes('2.0')) return 1;
  if (name.includes('1.5')) return 2;
  return 3;
}

// Sort in place-safe manner: flash variants first, then newer versions.
function sortGeminiModels(names) {
  return [...names].sort((a, b) => {
    const aFlash = a.includes('flash');
    const bFlash = b.includes('flash');
    if (aFlash !== bFlash) return aFlash ? -1 : 1;
    return versionScore(a) - versionScore(b);
  });
}

// Query the Generative Language API for models that support generateContent.
// Returns a sorted array (best-first) or [] when the call fails / returns
// nothing usable.
async function listGeminiModels(apiKey, { fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    if (!response || !response.ok) return [];
    const data = await response.json();
    const models = (data.models || [])
      .filter(
        (m) =>
          m.supportedGenerationMethods &&
          m.supportedGenerationMethods.includes('generateContent') &&
          m.name &&
          m.name.includes('gemini'),
      )
      .map((m) => m.name.replace('models/', ''));
    return sortGeminiModels(models);
  } catch (e) {
    console.warn('[modelSelect] Could not fetch model list:', e.message || e);
    return [];
  }
}

// Ordered list of models to try, falling back to DEFAULT_MODELS.
async function getPreferredGeminiModels(apiKey, { fetchImpl = fetch } = {}) {
  const available = await listGeminiModels(apiKey, { fetchImpl });
  return available.length > 0 ? available : [...DEFAULT_MODELS];
}

// Single best model (first of the preferred list, or the hardcoded default).
async function getBestGeminiModel(apiKey, { fetchImpl = fetch } = {}) {
  const available = await listGeminiModels(apiKey, { fetchImpl });
  return available.length > 0 ? available[0] : DEFAULT_BEST_MODEL;
}

module.exports = {
  DEFAULT_MODELS,
  DEFAULT_BEST_MODEL,
  versionScore,
  sortGeminiModels,
  listGeminiModels,
  getPreferredGeminiModels,
  getBestGeminiModel,
};
