// Normalization engine for container names.
// Pure functions with no database dependencies.

const MAX_LENGTH = 128;

/**
 * Normalizes a raw SKU string into a canonical container name.
 * Steps:
 *   1. Remove all characters except letters, digits, spaces
 *   2. Insert spaces at letter↔digit and camelCase boundaries
 *   3. Strip leading zeros from numeric tokens
 *   4. Collapse whitespace, trim, title-case
 *   5. Truncate to 128 characters
 *
 * @param {string} raw - The raw SKU or container name input
 * @returns {{ canonical: string, valid: boolean, error?: string }}
 */
function normalizeContainerName(raw) {
  // Handle non-string input
  if (typeof raw !== 'string') {
    return { canonical: '', valid: false, error: 'SKU must be a string' };
  }

  // Step 1: Remove all characters except letters, digits, spaces
  let cleaned = raw.replace(/[^a-zA-Z0-9 ]/g, ' ');

  // Step 2: Insert spaces at letter↔digit and camelCase boundaries
  // Insert space between a lowercase letter and an uppercase letter (camelCase)
  cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2');
  // Insert space between an uppercase letter followed by uppercase+lowercase (e.g., "ABin" → "A Bin")
  cleaned = cleaned.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  // Insert space between a letter and a digit
  cleaned = cleaned.replace(/([a-zA-Z])(\d)/g, '$1 $2');
  // Insert space between a digit and a letter
  cleaned = cleaned.replace(/(\d)([a-zA-Z])/g, '$1 $2');

  // Step 3: Collapse whitespace and split into tokens
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  // Check if there's at least one alphanumeric character
  const hasAlphanumeric = tokens.some((token) => /[a-zA-Z0-9]/.test(token));
  if (!hasAlphanumeric) {
    return {
      canonical: '',
      valid: false,
      error: 'SKU must contain at least one letter or digit',
    };
  }

  // Step 3 (continued): Strip leading zeros from numeric tokens
  const processedTokens = tokens.map((token) => {
    if (/^\d+$/.test(token)) {
      // Pure numeric token — strip leading zeros
      const stripped = token.replace(/^0+/, '');
      return stripped || '0'; // Keep at least "0" if all zeros
    }
    return token;
  });

  // Step 4: Title-case each token
  const titleCased = processedTokens.map(
    (token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
  );

  // Join with single spaces and trim
  let canonical = titleCased.join(' ').trim();

  // Step 5: Truncate to 128 characters
  if (canonical.length > MAX_LENGTH) {
    canonical = canonical.slice(0, MAX_LENGTH).trimEnd();
  }

  return { canonical, valid: true };
}

/**
 * Computes a confidence score (0–100) for how likely two raw SKU values
 * refer to the same physical container.
 *
 * Scoring rules:
 *   - Identical canonical forms → 100
 *   - Differ only in punctuation/spacing/case → 90–99
 *   - Same alpha prefix, different numeric suffix → 0–30
 *   - Different alpha prefix → 0–20
 *   - Partial token overlap → 50–89 (review range)
 *
 * @param {string} rawA
 * @param {string} rawB
 * @returns {number} confidence score 0–100
 */
function computeConfidence(rawA, rawB) {
  const resultA = normalizeContainerName(rawA);
  const resultB = normalizeContainerName(rawB);

  // If either input is invalid, no meaningful comparison can be made
  if (!resultA.valid || !resultB.valid) {
    return 0;
  }

  const canonA = resultA.canonical;
  const canonB = resultB.canonical;

  // Identical canonical forms → 100
  if (canonA === canonB) {
    return 100;
  }

  // Extract tokens from canonical forms (already title-cased, space-separated)
  const tokensA = canonA.split(' ');
  const tokensB = canonB.split(' ');

  // Separate alpha and numeric tokens
  const alphaA = tokensA.filter((t) => /^[a-zA-Z]+$/i.test(t));
  const alphaB = tokensB.filter((t) => /^[a-zA-Z]+$/i.test(t));
  const numA = tokensA.filter((t) => /^\d+$/.test(t));
  const numB = tokensB.filter((t) => /^\d+$/.test(t));

  // Get the alpha prefix (first alpha tokens joined) for comparison
  const prefixA = alphaA.join(' ').toLowerCase();
  const prefixB = alphaB.join(' ').toLowerCase();

  // Different alpha prefix → 0–20
  if (prefixA && prefixB && prefixA !== prefixB) {
    // Score based on character-level similarity of the prefixes
    const maxLen = Math.max(prefixA.length, prefixB.length);
    let commonChars = 0;
    for (let i = 0; i < Math.min(prefixA.length, prefixB.length); i++) {
      if (prefixA[i] === prefixB[i]) {
        commonChars++;
      } else {
        break;
      }
    }
    const similarity = commonChars / maxLen;
    return Math.min(20, Math.round(similarity * 20));
  }

  // Same alpha prefix, different numeric suffix → 0–30
  if (prefixA === prefixB && numA.length > 0 && numB.length > 0) {
    const numStrA = numA.join(' ');
    const numStrB = numB.join(' ');
    if (numStrA !== numStrB) {
      // Score based on how close the numbers are
      const lastNumA = parseInt(numA[numA.length - 1], 10);
      const lastNumB = parseInt(numB[numB.length - 1], 10);
      const diff = Math.abs(lastNumA - lastNumB);
      // Closer numbers get a slightly higher score, but still capped at 30
      if (diff <= 1) return 30;
      if (diff <= 5) return 20;
      if (diff <= 10) return 15;
      return 10;
    }
  }

  // Check if the difference is only in punctuation/spacing/case
  // (raw inputs differ but canonical forms are different — check if the
  // raw inputs would have the same canonical if we ignore minor differences)
  // Since canonical forms are already different at this point, check token overlap
  // for partial matches

  // Partial token overlap → 50–89 (review range)
  const setA = new Set(tokensA.map((t) => t.toLowerCase()));
  const setB = new Set(tokensB.map((t) => t.toLowerCase()));
  const union = new Set([...setA, ...setB]);
  const intersection = [...setA].filter((t) => setB.has(t));

  if (intersection.length > 0 && union.size > 0) {
    // Jaccard similarity scaled to 50–89 range
    const jaccard = intersection.length / union.size;
    const score = Math.round(50 + jaccard * 39);
    return Math.min(89, Math.max(50, score));
  }

  // No overlap at all
  return 0;
}

module.exports = { normalizeContainerName, computeConfidence };
