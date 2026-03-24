import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Part } from '@google/generative-ai';

// Convert File object to base64
async function fileToGenerativePart(file: File): Promise<Part> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64str = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64str,
          mimeType: file.type
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function generateListing(images: File[], instructions: string, apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  const imageParts = await Promise.all(images.map(fileToGenerativePart));

  const runWithModel = async (modelName: string) => {
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

    let result = await model.generateContent([analysisPrompt, ...imageParts]);
    let text = result.response.text();
    // Clean JSON markdown if attached
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let analysis;
    try {
      analysis = JSON.parse(text);
    } catch (e) {
      // fallback parsing
      console.error("Failed to parse initial JSON", text);
      analysis = {
        identifiedProductDetails: "Details could not be perfectly identified.",
        title: text.substring(0, 80).trim()
      };
    }

    let title = analysis.title as string;

    // 2. Validate and enrich title if it's too short (e.g. less than 70 chars)
    if (title.length < 70) {
      const enrichPrompt = `
        The current eBay title is: "${title}" (Length: ${title.length}/80).
        Based on the product: "${analysis.identifiedProductDetails}", see if you can add 1 or 2 more relevant SEO keywords to make the title closer to 80 characters without exceeding 80 characters.
        Return ONLY the new title as plain text, nothing else. If you can't add any good keywords, just return the exact same title.
      `;
      const enrichResult = await model.generateContent([enrichPrompt]);
      const newTitle = enrichResult.response.text().trim().replace(/^["']|["']$/g, '');
      if (newTitle.length <= 80 && newTitle.length > title.length) {
        title = newTitle;
      }
    }
    
    // Ensure hard limit just in case
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
      3. "itemSpecifics": A JSON object containing key/value pairs of relevant eBay Item Specifics (e.g. "Brand": "Nike", "MPN": "Does Not Apply"). Fill in "Unable to determine" if unknown.
      4. "category": The most accurate suggested eBay category path (e.g. "Collectibles > Historical Memorabilia").
      5. "priceRecommendation": A recommended historical or estimated price range based on similar items.
      6. "shippingEstimate": A detailed shipping estimate including estimated weight, dimensions, recommended service, packaging, and cost.

      Respond ONLY with the raw JSON object matching the keys: condition, description, itemSpecifics, category, priceRecommendation, shippingEstimate. Do not include markdown code block wrappers.
    `;

    const finalResult = await model.generateContent([descConditionPrompt, ...imageParts]);
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
      priceRecommendation: parsedFinal.priceRecommendation || "Unknown",
      shippingEstimate: finalShipping
    };
  };

  // Dynamically fetch available models to guarantee we use one the API key has access to
  let availableModels: string[] = [];
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (response.ok) {
      const data = await response.json();
      // Filter for models that support generateContent and are gemini models
      availableModels = data.models
        .filter((m: any) => m.supportedGenerationMethods.includes('generateContent') && m.name.includes('gemini'))
        .map((m: any) => m.name.replace('models/', ''));
    }
  } catch (e) {
    console.warn("Could not fetch model list directly:", e);
  }

  // Pre-defined fallback list if fetch fails, but prioritize the ones we actually discovered
  let modelsToTry = availableModels.length > 0 
    ? availableModels 
    : ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-1.0-pro-vision-latest', 'gemini-pro-vision'];

  // Sort discovered models to prefer 1.5 flash, then 1.5 pro
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
    } catch (error: any) {
      console.warn(`Model ${modelName} failed:`, error.message);
      lastError = error;
      // If it's a 404, try the next model. Otherwise, throw.
      if (!error.message.includes('404 ') && !error.message.includes('not found')) {
        throw new Error(`Error with ${modelName}: ${error.message}`);
      }
    }
  }

  throw new Error(lastError?.message || "Failed to communicate with AI. Your API key might not have access to the necessary models.");
}
