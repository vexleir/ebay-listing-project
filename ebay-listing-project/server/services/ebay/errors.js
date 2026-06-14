// REL-003 — eBay Trading API error translator.
//
// Routes that hit eBay have historically forwarded raw LongMessage text to
// the seller (e.g. "Item specific Size is missing for this category"). That
// is technically informative but reads as machinery. This module classifies
// the message into one of a small set of friendly categories and returns
// `{ message, fix, code, rawCode, rawMessage }`. Callers either show the
// rendered shape to the UI or fall back to the raw eBay text when no rule
// matches.
//
// Adding a rule:
//   1. Append a row to RULES with a `match` predicate (regex or function),
//      a stable `code` (UPPER_SNAKE), a short `message`, and a one-sentence
//      `fix`.
//   2. Add a case to errors.test.js so the classification doesn't drift.

const RULES = [
  {
    code: 'EBAY_MISSING_REQUIRED_SPECIFIC',
    match: /item specific\s+(.+?)\s+(is required|is missing|must be provided)/i,
    message: (m) => `eBay requires an item specific named "${m[1]}" for this category.`,
    fix: (m) => `Add "${m[1]}" to Item Specifics, then try again.`,
  },
  {
    code: 'EBAY_INVALID_CONDITION_FOR_CATEGORY',
    match: /condition.*(invalid|not valid|not allowed).*category|category.*(does not accept|does not support).*condition/i,
    message: () => 'The selected condition is not valid for this category.',
    fix: () => 'Pick a different condition (we can auto-fall-back to the closest valid one) or change the category.',
  },
  {
    code: 'EBAY_PRICE_BLOCKED_BY_SALE',
    match: /(part of a sale|cannot be updated.*sale)/i,
    message: () => 'Price cannot be changed while this listing is part of an active sale event.',
    fix: () => 'End the sale event on eBay first, or wait for it to finish before changing the price.',
  },
  {
    code: 'EBAY_TOKEN_EXPIRED',
    match: /(token (?:has )?expired|invalid token|iaf token expired|auth token is invalid)/i,
    message: () => 'Your eBay connection has expired.',
    fix: () => 'Reconnect eBay in Settings, then try again.',
  },
  {
    code: 'EBAY_LISTING_ENDED',
    match: /(listing.*ended|item.*ended|no longer active|auction.*closed|cannot be ended|already (?:ended|closed))/i,
    message: () => 'This listing has already ended on eBay.',
    fix: () => 'Use Delist & Relist to push a fresh listing, or refresh the listings list.',
  },
  {
    code: 'EBAY_POLICY_MISSING_OR_INVALID',
    match: /(policy.*not found|invalid.*policy|policy.*invalid|payment policy.*required|shipping policy.*required|return policy.*required)/i,
    message: () => 'One of your eBay business policies (shipping, payment, or return) is missing or invalid.',
    fix: () => 'Open Settings → eBay Policies and confirm each policy is selected from the live eBay account.',
  },
  {
    code: 'EBAY_IMAGE_REJECTED',
    match: /(picture|image).*(invalid|rejected|too small|too large|unsupported|bad url)/i,
    message: () => 'eBay rejected one of the listing images.',
    fix: () => 'Re-upload the affected image (minimum 500px on the long side, JPG/PNG/GIF/WEBP), then try again.',
  },
  {
    code: 'EBAY_TITLE_TOO_LONG',
    match: /title.*(too long|exceeds.*characters|maximum.*characters)/i,
    message: () => 'The listing title is longer than eBay\'s 80-character limit.',
    fix: () => 'Shorten the title to 80 characters or fewer.',
  },
  {
    code: 'EBAY_SHIPPING_PACKAGE_INVALID',
    match: /(package.*(weight|dimension|size).*invalid|shipping.*calculation.*requires|weight.*required|invalid.*package)/i,
    message: () => 'eBay needs valid package dimensions and weight for this shipping policy.',
    fix: () => 'Open the listing\'s package info and fill in length, width, depth, and weight (lbs + oz).',
  },
];

// Translate a single eBay LongMessage string. Returns `null` when no rule
// matches so the caller can decide whether to forward the raw text or set
// a generic fallback.
function translateEbayError(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') return null;
  const trimmed = rawMessage.trim();
  if (!trimmed) return null;

  for (const rule of RULES) {
    const m = trimmed.match(rule.match);
    if (m) {
      return {
        code: rule.code,
        message: typeof rule.message === 'function' ? rule.message(m) : rule.message,
        fix: typeof rule.fix === 'function' ? rule.fix(m) : rule.fix,
        rawMessage: trimmed,
      };
    }
  }
  return null;
}

// Convenience: given a parsed `{ errors, warnings }` from parseEbayErrors,
// returns the same shape but with each error/warning enriched. Strings that
// don't match any rule are kept as-is so the caller can render them without
// branching.
function translateEbayErrorBatch({ errors = [], warnings = [] }) {
  return {
    errors: errors.map((msg) => translateEbayError(msg) || { code: 'EBAY_UNCLASSIFIED', message: msg, fix: null, rawMessage: msg }),
    warnings: warnings.map((msg) => translateEbayError(msg) || { code: 'EBAY_UNCLASSIFIED', message: msg, fix: null, rawMessage: msg }),
  };
}

// Build the structured error body documented in IMPLEMENTATION_UPDATE_PLAN
// Section 8 ("API Contract Standards"). Use this from route handlers when
// you want to return the new `{ ok: false, error: {...} }` shape. Keep the
// existing `{ error: '...' }` body for backwards compatibility until the
// frontend migrates.
function buildErrorBody(rawMessage, fallbackCode = 'EBAY_UNCLASSIFIED') {
  const translated = translateEbayError(rawMessage);
  if (translated) {
    return {
      ok: false,
      error: {
        code: translated.code,
        message: translated.message,
        fix: translated.fix,
        details: { rawMessage: translated.rawMessage },
      },
    };
  }
  return {
    ok: false,
    error: {
      code: fallbackCode,
      message: rawMessage || 'Unknown eBay API error',
      fix: null,
      details: { rawMessage: rawMessage || null },
    },
  };
}

module.exports = {
  RULES,
  translateEbayError,
  translateEbayErrorBatch,
  buildErrorBody,
};
