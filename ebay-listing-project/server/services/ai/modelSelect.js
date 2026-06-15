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

// Models that satisfy the generateContent filter but are NOT general-purpose
// stable text models we want for listing generation: image/audio generation,
// TTS, vision/embedding, robotics & computer-use, plus any non-GA (preview /
// experimental) or reduced-capability (lite) variants. The model list now
// returns many of these (e.g. gemini-2.5-flash-image, gemini-2.5-flash-preview-tts),
// and without this guard a newer image model could outrank gemini-*-flash and
// get used for text generation.
const EXCLUDED_MODEL = /image|tts|audio|vision|embed|computer-use|robotics|preview|experimental|lite/i;

// Numeric version parsed from a model name; HIGHER = newer = preferred.
// "gemini-2.5-flash" -> 2.5, "gemini-3-flash" -> 3, "gemini-3.1-pro" -> 3.1.
// Names without a parseable version (e.g. the "gemini-flash-latest" aliases)
// rank lowest so an explicitly-versioned stable model wins when available.
function versionScore(name) {
  const m = /gemini-(\d+(?:\.\d+)?)/.exec(name);
  return m ? parseFloat(m[1]) : -1;
}

// Sort in place-safe manner: flash variants first, then newest version first.
function sortGeminiModels(names) {
  return [...names].sort((a, b) => {
    const aFlash = a.includes('flash');
    const bFlash = b.includes('flash');
    if (aFlash !== bFlash) return aFlash ? -1 : 1;
    return versionScore(b) - versionScore(a);
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
          m.name.includes('gemini') &&
          !EXCLUDED_MODEL.test(m.name),
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
