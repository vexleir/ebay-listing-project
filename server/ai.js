const { GoogleGenerativeAI } = require('@google/generative-ai');

const DEFAULT_COLLECTIONS_FOR_AI = 'OT999:Other, TY100:Toys, TY200:Vintage Toys, TY300:Retro Toys, TY400:Modern Toys, TY500:Collectible Toys, TC100:Trading Cards, TC200:TCG Non-Sports, PK200:Pokémon Cards, YG200:Yu-Gi-Oh Cards, MT200:Magic The Gathering, OP200:One Piece Cards, DB200:Dragon Ball Cards, DG200:Digimon Cards, SC100:Sports Cards, BB200:Baseball Cards, BK200:Basketball Cards, FB200:Football Cards, HK200:Hockey Cards, SC300:Soccer Cards, BX100:Sealed Products, BX200:Booster Boxes/Packs, SL100:Slabbed/Graded Items, FX100:Funko Pops, AC100:Action Figures, ST100:Statues & Figures, PL100:Plush, BD100:Board Games, VG100:Video Games, VG200:Retro Video Games, VG300:Modern Video Games, VC100:Video Game Consoles, CM100:Comics, BK100:Books, GN100:Graphic Novels, MG100:Magazines, AN100:Anime Merchandise, MN100:Manga, MV100:Movies DVD/Blu-ray, MS100:Music Physical Media, RC100:Vinyl Records, CS100:Cassettes, EL100:Electronics, CL100:Clothing, HT100:Hats, SH100:Shoes, JW100:Jewelry, WD100:Watches, HG100:Home Goods, DC100:Home Decor, AR100:Art, PT100:Posters & Prints, SG100:Signed/Autographed, PR100:Promotional Items, EV100:Event Exclusives, LM100:Limited Editions, CH100:Chase/Variant Items, RC200:Rare Items, UL100:High-End/Premium, BU100:Bundles/Lots, CL200:Clearance, NW100:New Arrivals, FT100:Featured Items, TR100:Trending Items, DS100:Discounted Items, VI100:Vintage Items, RT100:Retro Items';

async function generateListing(imageParts, instructions, apiKey, collectionsForAi) {
  const COLLECTIONS_FOR_AI = collectionsForAi || DEFAULT_COLLECTIONS_FOR_AI;
  const genAI = new GoogleGenerativeAI(apiKey);

  const runWithModel = async (modelName) => {
    const model = genAI.getGenerativeModel({ model: modelName });
    
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

    let result = await model.generateContent([analysisPrompt, ...imageParts]);
    const usage1 = result.response.usageMetadata;
    if (usage1) { totalPromptTokens += usage1.promptTokenCount || 0; totalCompletionTokens += usage1.candidatesTokenCount || 0; }
    let text = result.response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

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
      const enrichResult = await model.generateContent([enrichPrompt]);
      const usage2 = enrichResult.response.usageMetadata;
      if (usage2) { totalPromptTokens += usage2.promptTokenCount || 0; totalCompletionTokens += usage2.candidatesTokenCount || 0; }
      const newTitle = enrichResult.response.text().trim().replace(/^["']|["']$/g, '');
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
      2. "description": An HTML description optimized to maximize purchase likelihood. Include a clear Call To Action. The styling must be inline CSS with a color scheme matching the product. Look premium and trustworthy. Do NOT wrap this field value in markdown.
      3. "itemSpecifics": A JSON object containing key/value pairs of relevant eBay Item Specifics (e.g. "Brand": "Nike", "MPN": "Does Not Apply"). IMPORTANT RULES: (a) ALWAYS include a "Type" field describing what kind of item this is (e.g. "T-Shirt", "Action Figure", "Trading Card", "Necklace"). (b) ALWAYS include "Age Group" using one of: adult, infant, kids, newborn, toddler, unisex — choose the most accurate value based on the product (default "adult" for general products). (c) ALWAYS include "Gender" using one of: male, female, unisex — choose the most accurate value (default "unisex" if not gender-specific). (d) Include "MPN" if a model or part number is visible or identifiable; otherwise use "Does Not Apply". (e) NEVER include "Condition", "ConditionID", "Price", "Currency", or "Listing Type" — eBay handles these separately. (f) Fill in "Does Not Apply" if a value is truly unknown, not "Unable to determine".
      4. "category": The most accurate suggested eBay category path (e.g. "Collectibles > Historical Memorabilia").
      5. "priceRecommendation": A single recommended sell price as a plain decimal number string only (e.g. "49.99"). No currency symbols, no ranges, no text — just the number.
      6. "priceJustification": A brief explanation of why that price was chosen (comparable sold listings, condition, rarity, etc.). This is for the seller's reference only.
      7. "shippingEstimate": A detailed shipping estimate including estimated weight, dimensions, recommended service, packaging, and cost.
      8. "tags": An array of 6-10 concise, lowercase product tags for Shopify/Google Shopping (e.g. ["vintage", "action-figure", "1990s", "anime", "collectible"]). These will be used as Shopify product tags and for SEO/campaign targeting.
      9. "seoKeywords": A comma-separated string of 5-8 high-value Google Shopping SEO keywords relevant to the product (e.g. "vintage dragonball z figure, collectible anime toy, 90s action figure"). These will populate the Shopify SEO Keywords metafield.
      10. "collectionCodes": An array of 1-4 codes (strings) from the list below that best categorize this item for Shopify collection sorting. Choose the most specific applicable codes. Available codes: ${COLLECTIONS_FOR_AI}

      Respond ONLY with the raw JSON object matching the keys: condition, description, itemSpecifics, category, priceRecommendation, priceJustification, shippingEstimate, tags, seoKeywords, collectionCodes. Do not include markdown code block wrappers.
    `;

    const finalResult = await model.generateContent([descConditionPrompt, ...imageParts]);
    const usage3 = finalResult.response.usageMetadata;
    if (usage3) { totalPromptTokens += usage3.promptTokenCount || 0; totalCompletionTokens += usage3.candidatesTokenCount || 0; }
    let finalText = finalResult.response.text();
    finalText = finalText.replace(/```json/g, '').replace(/```html/g, '').replace(/```/g, '').trim();
    
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
      collectionCodes: Array.isArray(parsedFinal.collectionCodes) ? parsedFinal.collectionCodes : [],
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
    : ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro-vision-latest', 'gemini-pro-vision'];

  if (availableModels.length > 0) {
    modelsToTry.sort((a, b) => {
      if (a.includes('flash') && !b.includes('flash')) return -1;
      if (!a.includes('flash') && b.includes('flash')) return 1;
      return 0;
    });
  }

  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Trying model: ${modelName}`);
      return await runWithModel(modelName);
    } catch (error) {
      console.warn(`Model ${modelName} failed:`, error.message);
      lastError = error;
      // Fail immediately for auth errors — cycling through models won't help
      if (error.message.includes('API_KEY_INVALID') ||
          error.message.includes('API key not found') ||
          error.message.includes('API Key not found') ||
          error.message.includes('Please pass a valid API key')) {
        throw new Error(`Invalid Gemini API key. Please check the GEMINI_API_KEY environment variable on Render.com.`);
      }
      // Only continue to next model for 404/model-not-found errors
      if (!error.message.includes('404 ') && !error.message.includes('not found')) {
        throw new Error(`Error with ${modelName}: ${error.message}`);
      }
    }
  }

  throw new Error(lastError ? lastError.message : "Failed to communicate with AI.");
}

async function generateListingFromUrls(imageUrls, instructions, apiKey, collectionsForAi) {
  const axios = require('axios');
  const imageParts = await Promise.all((imageUrls || []).map(async url => {
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(resp.data).toString('base64');
    const mimeType = (resp.headers['content-type'] || 'image/jpeg').split(';')[0];
    return { inlineData: { data: base64, mimeType } };
  }));
  return generateListing(imageParts, instructions, apiKey, collectionsForAi);
}

module.exports = { generateListing, generateListingFromUrls };
