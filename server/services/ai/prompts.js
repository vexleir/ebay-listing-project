// AI-001 — prompt registry. Each prompt has a stable `name` + `version`
// so AI-002 telemetry can tag generations and so prompt changes ship in
// focused diffs separately from the call-site code.
//
// CONVENTIONS:
//   - One exported function per prompt. Inputs are the dynamic parts only.
//   - Bump `version` to a new MAJOR.MINOR string whenever the prompt body
//     changes the model's expected response shape or rules. The string is
//     stored alongside generated listings so future Listing Intelligence
//     work (Phase 4) can compare outcomes across prompt versions.
//   - Keep the registry pure — no IO, no env reads.

// ─── Listing generation (three-pass: analysis → enrich → final) ──────────

const LISTING_ANALYSIS_VERSION = '2026-05-25.1';
function listingAnalysisPrompt({ instructions }) {
  return `
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
}

const LISTING_TITLE_ENRICH_VERSION = '2026-05-25.1';
function listingTitleEnrichPrompt({ title, identifiedProductDetails }) {
  return `
        The current eBay title is: "${title}" (Length: ${title.length}/80).
        Based on the product: "${identifiedProductDetails}", see if you can add 1 or 2 more relevant SEO keywords to make the title closer to 80 characters without exceeding 80 characters.
        Return ONLY the new title as plain text, nothing else. If you can't add any good keywords, just return the exact same title.
      `;
}

const LISTING_FINAL_VERSION = '2026-05-25.1';
function listingFinalPrompt({ identifiedProductDetails, title, instructions }) {
  return `
      You are an expert eBay seller and copywriter. I am listing the following product:
      Product details: "${identifiedProductDetails}"
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
}

// ─── Optimizer (single-pass) ─────────────────────────────────────────────

const OPTIMIZER_VERSION = '2026-05-25.1';
function optimizerPrompt({ title, categoryName, price, conditionName, descPlain, currentSpecifics, required = [], recommended = [] }) {
  return `You are an expert eBay seller, SEO specialist, and Cassini algorithm expert. Optimize the following existing eBay listing.

CURRENT LISTING:
Title (${title.length}/80 chars): "${title}"
Category: "${categoryName}"
Price: $${price}
Condition: ${conditionName}
Description (excerpt): "${descPlain}"
Current Item Specifics:
${currentSpecifics}
${required.length ? `Required Category Specifics (MUST include all): ${required.join(', ')}` : ''}
${recommended.length ? `Recommended Category Specifics: ${recommended.join(', ')}` : ''}

OPTIMIZATION RULES:
- Title must use all 80 characters if possible, NEVER exceed 80
- Front-load most important keywords (brand, model, key feature first)
- Remove filler/spam words: "look", "l@@k", "wow", "nice", "great", "check", "hot", "fast ship", "free ship", "must see", "see pics"
- Description: keep the core content but enhance formatting, add call to action, make scannable with HTML. The CTA must be styled text only (bold/colored emphasized line) — NEVER a button, pill, or clickable-looking element. eBay strips links and interactive elements, so do not use anchor or button tags or button-style CSS (solid-filled rounded boxes, padded "click here" blocks, etc.).
- Item specifics: include ALL required fields, fill in as many recommended fields as possible using context from the listing
- Price suggestion: based on the listing condition and category, suggest a competitive price

Respond ONLY with a valid JSON object (no markdown wrappers):
{
  "title": "optimized title, max 80 chars",
  "titleRationale": "brief explanation of changes",
  "description": "improved HTML description with inline CSS, headers, bullets, CTA",
  "descriptionRationale": "what was improved",
  "itemSpecifics": { "SpecificName": "Value" },
  "itemSpecificsRationale": "what was added or corrected",
  "priceRecommendation": "suggested price as decimal number string e.g. 49.99",
  "priceRationale": "why this price",
  "seoKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "seoIssues": ["issue 1 found in original title/listing", "issue 2"],
  "overallTips": ["actionable tip 1", "actionable tip 2", "actionable tip 3"]
}`;
}

// ─── Registry table (used by AI-002 telemetry) ───────────────────────────

const PROMPTS = {
  'listing.analysis': { build: listingAnalysisPrompt, version: LISTING_ANALYSIS_VERSION },
  'listing.titleEnrich': { build: listingTitleEnrichPrompt, version: LISTING_TITLE_ENRICH_VERSION },
  'listing.final': { build: listingFinalPrompt, version: LISTING_FINAL_VERSION },
  'optimizer.optimize': { build: optimizerPrompt, version: OPTIMIZER_VERSION },
};

module.exports = {
  PROMPTS,
  // Direct exports for ergonomic call sites.
  listingAnalysisPrompt,
  listingTitleEnrichPrompt,
  listingFinalPrompt,
  optimizerPrompt,
  // Version constants — useful for tagging telemetry rows.
  LISTING_ANALYSIS_VERSION,
  LISTING_TITLE_ENRICH_VERSION,
  LISTING_FINAL_VERSION,
  OPTIMIZER_VERSION,
};
