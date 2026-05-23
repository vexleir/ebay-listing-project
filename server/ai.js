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

    // 1. Analyze product and get base title & details
    const analysisPrompt = `
      You are an expert eBay seller and SEO master. Please analyze these images of a product.
      Additional instructions from the user: "${instructions}"

      Identify the product, model, brand, and key features.
      Then, generate a Cassini SEO optimized eBay title. 
      - It MUST have the most important keywords towards the beginning.
      - It MUST be exactly 80 characters or slightly less (never more than 80).
      - Try to use as close to 80 characters as possible to maximize search keywords.
      
      Respond with ONLY a JSON object in this format:
      {
        "identifiedProductDetails": "brief summary of what the product is",
        "title": "the optimized title"
      }
    `;

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

    // 2. Validate and enrich title if it's too short
    if (title.length < 70) {
      const enrichPrompt = `
        The current eBay title is: "${title}" (Length: ${title.length}/80).
        Based on the product: "${analysis.identifiedProductDetails}", see if you can add 1 or 2 more relevant SEO keywords to make the title closer to 80 characters without exceeding 80 characters.
        Return ONLY the new title as plain text, nothing else. If you can't add any good keywords, just return the exact same title.
      `;
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

    // 3. Generate Description, Condition, Item Specifics, Category, Pricing, and Shipping
    const descConditionPrompt = `
      You are an expert eBay seller and copywriter. I am listing the following product:
      Product details: "${analysis.identifiedProductDetails}"
      Title: "${title}"
      User instructions: "${instructions}"

      Based on these details and the images provided, output a JSON object containing the following exact fields:
      
      1. "condition": A concise condition report based purely on visual evidence and instructions.
      2. "description": An HTML description optimized to maximize purchase likelihood. Include a clear Call To Action. The styling must be inline CSS with a color scheme matching the product. Look premium and trustworthy. Do NOT wrap this field value in markdown. CTA RULES: the call to action must be styled text only (e.g. a bold, colored sentence or a short emphasized line) — NEVER render it as a button, pill, or any element styled to look clickable. eBay strips links and interactive elements from listings, so a button-shaped CTA looks broken. Do not use anchor tags, button tags, or button-like CSS (border-radius blocks with solid background fills, padded "click here" boxes, etc.).
      3. "itemSpecifics": A JSON object containing key/value pairs of relevant eBay Item Specifics (e.g. "Brand": "Nike", "MPN": "Does Not Apply"). IMPORTANT RULES: (a) ALWAYS include a "Type" field describing what kind of item this is (e.g. "T-Shirt", "Action Figure", "Trading Card", "Necklace"). (b) ALWAYS include "Age Group" using one of: adult, infant, kids, newborn, toddler, unisex — choose the most accurate value based on the product (default "adult" for general products). (c) ALWAYS include "Gender" using one of: male, female, unisex — choose the most accurate value (default "unisex" if not gender-specific). (d) Include "MPN" if a model or part number is visible or identifiable; otherwise use "Does Not Apply". (e) NEVER include "Condition", "ConditionID", "Price", "Currency", or "Listing Type" — eBay handles these separately. (f) Fill in "Does Not Apply" if a value is truly unknown, not "Unable to determine".
      4. "category": The most accurate suggested eBay category path (e.g. "Collectibles > Historical Memorabilia").
      5. "priceRecommendation": A single recommended sell price as a plain decimal number string only (e.g. "49.99"). No currency symbols, no ranges, no text — just the number.
      6. "priceJustification": A brief explanation of why that price was chosen (comparable sold listings, condition, rarity, etc.). This is for the seller's reference only.
      7. "shippingEstimate": A detailed shipping estimate including estimated weight, dimensions, recommended service, packaging, and cost.
      8. "tags": An array of 6-10 concise, lowercase product tags relevant to this item (e.g. ["vintage", "action-figure", "1990s", "anime", "collectible"]). Used for SEO and category targeting.
      9. "seoKeywords": A comma-separated string of 5-8 high-value SEO keywords relevant to the product (e.g. "vintage dragonball z figure, collectible anime toy, 90s action figure").

      Respond ONLY with the raw JSON object matching the keys: condition, description, itemSpecifics, category, priceRecommendation, priceJustification, shippingEstimate, tags, seoKeywords. Do not include markdown code block wrappers.
    `;

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
      tokenUsage: { promptTokens: totalPromptTokens, completionTokens: totalCompletionTokens, totalTokens: totalPromptTokens + totalCompletionTokens, model: modelName }
    };
  };

  let availableModels = [];
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (response.ok) {
      const data = await response.json();
      availableModels = data.models
        .filter(m => m.supportedGenerationMethods.includes('generateContent') && m.name.includes('gemini'))
        .map(m => m.name.replace('models/', ''));
    }
  } catch (e) {
    console.warn("Could not fetch model list directly:", e);
  }

  let modelsToTry = availableModels.length > 0
    ? availableModels
    : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];

  if (availableModels.length > 0) {
    // Prefer flash variants and newer versions (2.5 → 2.0 → 1.5)
    const versionScore = (name) => {
      if (name.includes('2.5')) return 0;
      if (name.includes('2.0')) return 1;
      if (name.includes('1.5')) return 2;
      return 3;
    };
    modelsToTry.sort((a, b) => {
      const aFlash = a.includes('flash'), bFlash = b.includes('flash');
      if (aFlash !== bFlash) return aFlash ? -1 : 1;
      return versionScore(a) - versionScore(b);
    });
  }

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
