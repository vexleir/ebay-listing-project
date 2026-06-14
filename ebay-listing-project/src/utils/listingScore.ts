// ─── Listing health scoring for the Optimizer ────────────────────────────────
// Weighted categories: Title SEO 30%, Item Specifics 25%, Images 20%,
//                      Description 10%, Pricing 10%, Shipping 5%

export interface ScoreCategory {
  name: string;
  score: number;
  maxScore: number;
  pct: number;
  issues: string[];
  tips: string[];
}

export interface ListingScore {
  total: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  categories: {
    titleSeo: ScoreCategory;
    itemSpecifics: ScoreCategory;
    images: ScoreCategory;
    description: ScoreCategory;
    pricing: ScoreCategory;
    shipping: ScoreCategory;
  };
}

export interface CategorySpecific {
  name: string;
  required: boolean;
  recommended: boolean;
}

// Words that waste character space and hurt Cassini SEO
const FILLER_WORDS = [
  'l@@k', 'look!!', 'wow', 'amazing', 'beautiful', 'lovely', 'fantastic',
  'must see', 'must-see', 'check it out', 'check out',
  'nr ', ' nr ', 'no reserve', 'best deal', 'great deal', 'hot item',
  'free shipping', 'fast shipping', 'fast ship', 'free ship',
  'please read', 'read desc', 'see pics', 'see photos', 'see description',
  'as pictured', 'as shown',
];

// ─── Title SEO (30 pts) ───────────────────────────────────────────────────────
function scoreTitleSeo(title: string): ScoreCategory {
  const maxScore = 30;
  const issues: string[] = [];
  const tips: string[] = [];
  let score = 0;

  if (!title || title.trim().length === 0) {
    return { name: 'Title SEO', score: 0, maxScore, pct: 0, issues: ['No title found'], tips: [] };
  }

  const len = title.length;
  const titleLower = title.toLowerCase();

  // Length (0–12 pts)
  if (len >= 75) score += 12;
  else if (len >= 65) score += 10;
  else if (len >= 55) score += 8;
  else if (len >= 40) score += 5;
  else if (len >= 20) score += 2;
  if (len < 55) {
    issues.push(`Title is ${len}/80 characters — you're leaving valuable search keywords unused`);
  } else if (len < 75) {
    tips.push(`Title is ${len}/80 chars — expand to 75–80 to maximize keyword space`);
  }

  // Filler word check (0–6 pts)
  const foundFillers = FILLER_WORDS.filter(w => titleLower.includes(w));
  if (foundFillers.length === 0) {
    score += 6;
  } else if (foundFillers.length === 1) {
    score += 3;
    issues.push(`Filler word detected: "${foundFillers[0]}" — replace with a searchable keyword`);
  } else {
    score += 0;
    issues.push(`Multiple filler words: ${foundFillers.slice(0, 3).map(w => `"${w}"`).join(', ')} — remove and add searchable keywords`);
  }

  // Specificity — numbers, brand/model signals (0–6 pts)
  const words = title.split(/\s+/).filter(w => w.length > 1);
  const uniqueWords = new Set(words.map(w => w.toLowerCase())).size;
  const hasNumbers = /\d/.test(title);
  if (uniqueWords >= 8 && hasNumbers) {
    score += 6;
  } else if (uniqueWords >= 6) {
    score += 4;
    tips.push('Add model numbers, sizes, or other specific identifiers to improve search match');
  } else {
    score += 2;
    issues.push('Title lacks specific details (model number, brand, size, color) — add them to rank higher');
  }

  // Excessive caps check (0–3 pts)
  const letters = title.replace(/[^a-zA-Z]/g, '');
  const capsRatio = letters.length > 0 ? (title.match(/[A-Z]/g) || []).length / letters.length : 0;
  if (capsRatio < 0.5) {
    score += 3;
  } else if (capsRatio < 0.75) {
    score += 1;
    tips.push('Excessive capitalization hurts readability — use Title Case instead');
  } else {
    score += 0;
    issues.push('Title is mostly ALL CAPS — this reduces buyer trust and readability');
  }

  // Front-loading — first word should be a strong keyword, not an article/filler (0–3 pts)
  const firstWord = (words[0] || '').toLowerCase();
  const weakOpeners = ['a', 'an', 'the', 'for', 'with', 'used', 'vintage', 'lot', 'set', 'sale'];
  if (!weakOpeners.includes(firstWord)) {
    score += 3;
  } else {
    issues.push(`Title starts with weak word "${words[0]}" — move your most important keyword (brand/product name) to the front`);
  }

  score = Math.min(score, maxScore);
  return { name: 'Title SEO', score, maxScore, pct: Math.round((score / maxScore) * 100), issues, tips };
}

// ─── Item Specifics (25 pts) ──────────────────────────────────────────────────
function scoreItemSpecifics(
  itemSpecifics: Record<string, string>,
  categorySpecifics: CategorySpecific[],
): ScoreCategory {
  const maxScore = 25;
  const issues: string[] = [];
  const tips: string[] = [];
  let score = 0;

  const keys = Object.keys(itemSpecifics || {});
  const meaningfulKeys = keys.filter(
    k =>
      itemSpecifics[k] &&
      !['Unable to determine', 'Does Not Apply', 'N/A', 'Unknown', 'n/a'].includes(itemSpecifics[k])
  );

  if (keys.length === 0) {
    issues.push('No item specifics — eBay heavily demotes listings that omit this section');
    return { name: 'Item Specifics', score: 0, maxScore, pct: 0, issues, tips };
  }

  // Volume of filled specifics (0–10 pts)
  if (meaningfulKeys.length >= 10) score += 10;
  else if (meaningfulKeys.length >= 7) score += 8;
  else if (meaningfulKeys.length >= 5) score += 6;
  else if (meaningfulKeys.length >= 3) score += 4;
  else score += 2;

  if (meaningfulKeys.length < 5) {
    issues.push(`Only ${meaningfulKeys.length} meaningful item specifics — aim for 7+ to improve search placement`);
  }

  // Required fields (0–10 pts)
  const requiredFields = categorySpecifics.filter(s => s.required);
  if (requiredFields.length > 0) {
    const missing = requiredFields.filter(f => !itemSpecifics[f.name]);
    if (missing.length === 0) {
      score += 10;
    } else {
      const pctFilled = (requiredFields.length - missing.length) / requiredFields.length;
      score += Math.round(pctFilled * 10);
      missing.slice(0, 3).forEach(f => issues.push(`Missing required field: "${f.name}"`));
      if (missing.length > 3) tips.push(`${missing.length - 3} more required field(s) missing`);
    }
  } else {
    // No category data — score on presence of common universals
    const universals = ['Brand', 'Type', 'Model', 'Color', 'Size', 'Material', 'Condition'];
    const filled = universals.filter(k => itemSpecifics[k]);
    score += Math.min(filled.length * 2, 10);
    if (filled.length < 3) {
      tips.push('Add Brand, Model, Color, and Size where applicable');
    }
  }

  // Recommended fields (0–5 pts)
  const recommendedFields = categorySpecifics.filter(s => s.recommended);
  if (recommendedFields.length > 0) {
    const filledRec = recommendedFields.filter(f => itemSpecifics[f.name]);
    const pct = filledRec.length / recommendedFields.length;
    score += Math.round(pct * 5);
    if (pct < 0.5) {
      tips.push(`Fill in recommended specifics to boost rank (${recommendedFields.length - filledRec.length} remaining)`);
    }
  } else {
    score += 3; // no data, partial credit
  }

  score = Math.min(score, maxScore);
  return { name: 'Item Specifics', score, maxScore, pct: Math.round((score / maxScore) * 100), issues, tips };
}

// ─── Images (20 pts) ──────────────────────────────────────────────────────────
function scoreImages(images: string[]): ScoreCategory {
  const maxScore = 20;
  const issues: string[] = [];
  const tips: string[] = [];
  let score = 0;

  const count = (images || []).filter(i => i && i.startsWith('http')).length;

  if (count >= 8) {
    score = 20;
  } else if (count >= 6) {
    score = 17;
    tips.push(`Add ${8 - count} more photos — eBay allows up to 12 free images`);
  } else if (count >= 4) {
    score = 13;
    tips.push(`Only ${count} images — aim for 8+ showing all angles, details, and any flaws`);
  } else if (count >= 2) {
    score = 8;
    issues.push(`Only ${count} images — listings with few photos have significantly lower conversion`);
  } else if (count === 1) {
    score = 4;
    issues.push('Only 1 image — add photos of all angles, details, defects, and included accessories');
  } else {
    score = 0;
    issues.push('No images found — this listing will not get clicks or sales without photos');
  }

  return { name: 'Images', score, maxScore, pct: Math.round((score / maxScore) * 100), issues, tips };
}

// ─── Description (10 pts) ────────────────────────────────────────────────────
function scoreDescription(description: string): ScoreCategory {
  const maxScore = 10;
  const issues: string[] = [];
  const tips: string[] = [];
  let score = 0;

  if (!description || description.trim().length === 0) {
    issues.push('No description — buyers need detail to trust your listing and justify the price');
    return { name: 'Description', score: 0, maxScore, pct: 0, issues, tips };
  }

  const plain = description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const len = plain.length;
  const hasHtml = /<[a-z]/i.test(description);
  const hasCta = /buy|order|purchase|add to cart|don'?t miss|today|contact|message|question/i.test(plain);

  // Length (0–5 pts)
  if (len >= 300) score += 5;
  else if (len >= 150) { score += 3; tips.push('Expand description to 300+ characters for best results'); }
  else { score += 1; issues.push(`Description is too short (${len} chars) — provide condition details, dimensions, what's included`); }

  // HTML formatting (0–3 pts)
  if (hasHtml) score += 3;
  else { score += 1; tips.push('Use HTML formatting (headers, bullet lists, bold) to make description scannable'); }

  // Call to action (0–2 pts)
  if (hasCta) score += 2;
  else tips.push('Add a call to action: "Buy with confidence", "Message with any questions"');

  score = Math.min(score, maxScore);
  return { name: 'Description', score, maxScore, pct: Math.round((score / maxScore) * 100), issues, tips };
}

// ─── Pricing (10 pts) ────────────────────────────────────────────────────────
function scorePricing(price: number, compPrices?: number[]): ScoreCategory {
  const maxScore = 10;
  const issues: string[] = [];
  const tips: string[] = [];
  let score = 0;

  if (!price || price <= 0) {
    issues.push('No price set');
    return { name: 'Pricing', score: 0, maxScore, pct: 0, issues, tips };
  }

  score += 5; // has price

  if (compPrices && compPrices.length >= 3) {
    const sorted = [...compPrices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const pctAbove = ((price - median) / median) * 100;

    if (pctAbove <= 0) {
      score += 5;
      tips.push(`Priced at or below sold comps median ($${median.toFixed(2)}) — good competitive position`);
    } else if (pctAbove <= 15) {
      score += 5;
    } else if (pctAbove <= 35) {
      score += 2;
      issues.push(`Price is ${pctAbove.toFixed(0)}% above sold comps median ($${median.toFixed(2)}) — may be limiting visibility`);
    } else {
      score += 0;
      issues.push(`Price is ${pctAbove.toFixed(0)}% above sold comps median ($${median.toFixed(2)}) — significantly overpriced vs recent sales`);
    }
  } else {
    score += 3;
    tips.push('No sold comp data — verify pricing against recently sold similar items');
  }

  score = Math.min(score, maxScore);
  return { name: 'Pricing', score, maxScore, pct: Math.round((score / maxScore) * 100), issues, tips };
}

// ─── Shipping (5 pts) ────────────────────────────────────────────────────────
function scoreShipping(shippingType: string, shippingServiceCost: string): ScoreCategory {
  const maxScore = 5;
  const issues: string[] = [];
  const tips: string[] = [];
  let score = 0;

  const typeLower = (shippingType || '').toLowerCase();
  const costStr = (shippingServiceCost || '').replace(/[^0-9.]/g, '');
  const cost = parseFloat(costStr);

  if (!shippingType && !shippingServiceCost) {
    issues.push('No shipping information detected');
    return { name: 'Shipping', score: 0, maxScore, pct: 0, issues, tips };
  }

  const isFree = typeLower.includes('free') || cost === 0;
  const isCalculated = typeLower.includes('calculated');
  const isFlat = typeLower.includes('flat') || (!isFree && !isCalculated && cost > 0);

  if (isFree) {
    score = 5;
  } else if (isCalculated) {
    score = 4;
    tips.push('Calculated shipping is good — free shipping gives another boost to Cassini rank');
  } else if (isFlat) {
    score = 3;
    tips.push(`Flat-rate $${cost.toFixed(2)} shipping — consider free shipping to improve search rank and conversion`);
  } else {
    score = 2;
    tips.push('Add a clear shipping option to improve buyer confidence and search placement');
  }

  return { name: 'Shipping', score, maxScore, pct: Math.round((score / maxScore) * 100), issues, tips };
}

// ─── Main exported scorer ────────────────────────────────────────────────────
export function computeOptimizerScore(
  title: string,
  description: string,
  images: string[],
  itemSpecifics: Record<string, string>,
  price: number,
  shippingType: string,
  shippingServiceCost: string,
  categorySpecifics: CategorySpecific[],
  compPrices?: number[],
): ListingScore {
  const titleCat    = scoreTitleSeo(title);
  const specificsCat = scoreItemSpecifics(itemSpecifics, categorySpecifics);
  const imagesCat   = scoreImages(images);
  const descCat     = scoreDescription(description);
  const priceCat    = scorePricing(price, compPrices);
  const shippingCat = scoreShipping(shippingType, shippingServiceCost);

  const total =
    titleCat.score + specificsCat.score + imagesCat.score +
    descCat.score + priceCat.score + shippingCat.score;
  const maxTotal =
    titleCat.maxScore + specificsCat.maxScore + imagesCat.maxScore +
    descCat.maxScore + priceCat.maxScore + shippingCat.maxScore;

  const pct = Math.round((total / maxTotal) * 100);
  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (pct >= 85) grade = 'A';
  else if (pct >= 70) grade = 'B';
  else if (pct >= 55) grade = 'C';
  else if (pct >= 40) grade = 'D';
  else grade = 'F';

  return {
    total: pct,
    grade,
    categories: {
      titleSeo: titleCat,
      itemSpecifics: specificsCat,
      images: imagesCat,
      description: descCat,
      pricing: priceCat,
      shipping: shippingCat,
    },
  };
}
