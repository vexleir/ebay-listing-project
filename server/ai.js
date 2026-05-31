// @google/genai is ESM-only; load it lazily so this CJS module can require it.
let _GoogleGenAI = null;
async function loadGenAI() {
  if (!_GoogleGenAI) {
    const mod = await import('@google/genai');
    _GoogleGenAI = mod.GoogleGenAI;
  }
  return _GoogleGenAI;
}

// Disable Gemini 2.5 "thinking" — we just need structured listing output.
const GENERATION_CONFIG = { thinkingConfig: { thinkingBudget: 0 } };

// AI-001 prompt registry + AI-002 telemetry — see services/ai/prompts.js
// and services/ai/telemetry.js for rationale.
const {
  listingAnalysisPrompt,
  listingTitleEnrichPrompt,
  listingFinalPrompt,
  LISTING_ANALYSIS_VERSION,
  LISTING_TITLE_ENRICH_VERSION,
  LISTING_FINAL_VERSION,
} = require('./services/ai/prompts');

// P1.6 — shared Gemini model discovery + preference ordering.
const { getPreferredGeminiModels } = require('./services/ai/modelSelect');

async function generateListing(imageParts, instructions, apiKey) {
  const GoogleGenAI = await loadGenAI();
  const ai = new GoogleGenAI({ apiKey });

  const runWithModel = async (modelName) => {
    const generate = async (label, contents) => {
      try {
        return await ai.models.generateContent({
          model: modelName,
          contents,
          config: GENERATION_CONFIG,
        });
      } catch (e) {
        console.error(`[generateListing/${label}] failure on model ${modelName}:`, e);
        const wrapped = new Error(`[${label}] ${(e && e.message) || String(e)}`);
        wrapped.cause = e;
        wrapped.stack = `${wrapped.message}\nCaused by: ${e && e.stack ? e.stack : ''}`;
        throw wrapped;
      }
    };

    // 1. Analyze product and get base title & details (prompt registry)
    const analysisPrompt = listingAnalysisPrompt({ instructions });

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    let result = await generate('analysis', [analysisPrompt, ...imageParts]);
    const usage1 = result.usageMetadata;
    if (usage1) { totalPromptTokens += usage1.promptTokenCount || 0; totalCompletionTokens += usage1.candidatesTokenCount || 0; }
    let text = (result.text || '').replace(/```json/g, '').replace(/```/g, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse initial JSON", text);
      analysis = {
        identifiedProductDetails: "Details could not be perfectly identified.",
        title: text.substring(0, 80).trim()
      };
    }

    let title = analysis.title;

    // 2. Validate and enrich title if it's too short (prompt registry)
    if (title.length < 70) {
      const enrichPrompt = listingTitleEnrichPrompt({ title, identifiedProductDetails: analysis.identifiedProductDetails });
      const enrichResult = await generate('enrich', enrichPrompt);
      const usage2 = enrichResult.usageMetadata;
      if (usage2) { totalPromptTokens += usage2.promptTokenCount || 0; totalCompletionTokens += usage2.candidatesTokenCount || 0; }
      const newTitle = (enrichResult.text || '').trim().replace(/^["']|["']$/g, '');
      if (newTitle.length <= 80 && newTitle.length > title.length) {
        title = newTitle;
      }
    }

    if (title.length > 80) {
      title = title.substring(0, 80).trim();
    }

    // 3. Generate Description, Condition, Item Specifics, Category, Pricing, Shipping (prompt registry)
    const descConditionPrompt = listingFinalPrompt({
      identifiedProductDetails: analysis.identifiedProductDetails,
      title,
      instructions,
    });

    const finalResult = await generate('final', [descConditionPrompt, ...imageParts]);
    const usage3 = finalResult.usageMetadata;
    if (usage3) { totalPromptTokens += usage3.promptTokenCount || 0; totalCompletionTokens += usage3.candidatesTokenCount || 0; }
    let finalText = (finalResult.text || '')
      .replace(/```json/g, '').replace(/```html/g, '').replace(/```/g, '').trim();
    
    let parsedFinal;
    try {
      parsedFinal = JSON.parse(finalText);
    } catch (e) {
      console.error("Failed to parse final JSON", finalText);
      throw new Error("AI returned malformed data. Please try again.");
    }

    let finalShipping = parsedFinal.shippingEstimate || "Unknown";
    if (typeof finalShipping === 'object') {
      try {
        finalShipping = Object.entries(finalShipping)
          .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}`)
          .join('\n');
      } catch (e) {
        finalShipping = JSON.stringify(finalShipping, null, 2);
      }
    }

    return {
      title: title,
      condition: parsedFinal.condition,
      description: parsedFinal.description,
      itemSpecifics: parsedFinal.itemSpecifics || {},
      category: parsedFinal.category || "Unknown",
      priceRecommendation: parsedFinal.priceRecommendation || "0.00",
      priceJustification: parsedFinal.priceJustification || "",
      shippingEstimate: finalShipping,
      tags: Array.isArray(parsedFinal.tags) ? parsedFinal.tags : [],
      seoKeywords: parsedFinal.seoKeywords || "",
      tokenUsage: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
        model: modelName,
        // Three-pass call uses three prompts; record the final pass version as the
        // canonical one (it's the one Phase 4 experiments will compare against).
        promptVersion: LISTING_FINAL_VERSION,
        promptStages: {
          analysis: LISTING_ANALYSIS_VERSION,
          titleEnrich: LISTING_TITLE_ENRICH_VERSION,
          final: LISTING_FINAL_VERSION,
        },
      }
    };
  };

  let modelsToTry = await getPreferredGeminiModels(apiKey);

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Trying model: ${modelName}`);
      return await runWithModel(modelName);
    } catch (error) {
      // Log the full error with stack so Render logs show the real call site,
      // not just "a is not defined" detached from its origin.
      console.error(`Model ${modelName} failed:`, error);
      lastError = error;
      const msg = (error && error.message) || String(error);
      // Fail immediately for auth errors — cycling through models won't help
      if (msg.includes('API_KEY_INVALID') ||
          msg.includes('API key not found') ||
          msg.includes('API Key not found') ||
          msg.includes('Please pass a valid API key')) {
        throw new Error(`Invalid Gemini API key. Please check the GEMINI_API_KEY environment variable on Render.com.`);
      }
      // Only continue to next model for 404/model-not-found errors
      if (!msg.includes('404 ') && !msg.includes('not found')) {
        const wrapped = new Error(`Error with ${modelName}: ${msg}`);
        wrapped.cause = error;
        wrapped.stack = `${wrapped.message}\nCaused by: ${error && error.stack ? error.stack : msg}`;
        throw wrapped;
      }
    }
  }

  throw new Error(lastError ? lastError.message : "Failed to communicate with AI.");
}

async function generateListingFromUrls(imageUrls, instructions, apiKey) {
  const axios = require('axios');
  const imageParts = await Promise.all((imageUrls || []).map(async url => {
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(resp.data).toString('base64');
    const mimeType = (resp.headers['content-type'] || 'image/jpeg').split(';')[0];
    return { inlineData: { data: base64, mimeType } };
  }));
  return generateListing(imageParts, instructions, apiKey);
}

module.exports = { generateListing, generateListingFromUrls };
