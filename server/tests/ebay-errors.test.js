// Tests for the eBay error translator (services/ebay/errors.js).
// Adding a translation rule? Append the matching case here so the rule
// is locked against regression.

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  translateEbayError,
  translateEbayErrorBatch,
  buildErrorBody,
} = require('../services/ebay/errors');

// ─── translateEbayError ───────────────────────────────────────────────────

test('translateEbayError returns null for empty / null / non-string input', () => {
  assert.equal(translateEbayError(''), null);
  assert.equal(translateEbayError(null), null);
  assert.equal(translateEbayError(undefined), null);
  assert.equal(translateEbayError(12345), null);
  assert.equal(translateEbayError('   '), null);
});

test('translateEbayError returns null when no rule matches (caller decides fallback)', () => {
  assert.equal(translateEbayError('Some weird eBay error nobody planned for'), null);
});

test('translateEbayError classifies missing-required-specific and surfaces the aspect name', () => {
  const out = translateEbayError('Item specific Size is required for this category.');
  assert.equal(out.code, 'EBAY_MISSING_REQUIRED_SPECIFIC');
  assert.match(out.message, /"Size"/);
  assert.match(out.fix, /Add "Size"/);
  assert.equal(out.rawMessage, 'Item specific Size is required for this category.');
});

test('translateEbayError classifies invalid-condition-for-category', () => {
  const a = translateEbayError('Condition is not valid for this category.');
  assert.equal(a?.code, 'EBAY_INVALID_CONDITION_FOR_CATEGORY');
  const b = translateEbayError('The category does not accept this condition.');
  assert.equal(b?.code, 'EBAY_INVALID_CONDITION_FOR_CATEGORY');
});

test('translateEbayError classifies price-blocked-by-sale variants', () => {
  const a = translateEbayError('The price cannot be updated since it is a part of a sale.');
  assert.equal(a?.code, 'EBAY_PRICE_BLOCKED_BY_SALE');
  const b = translateEbayError('This item is part of a sale.');
  assert.equal(b?.code, 'EBAY_PRICE_BLOCKED_BY_SALE');
});

test('translateEbayError classifies expired-token variants', () => {
  for (const msg of [
    'Auth token is invalid.',
    'IAF token expired.',
    'The token has expired.',
    'Invalid token',
  ]) {
    assert.equal(translateEbayError(msg)?.code, 'EBAY_TOKEN_EXPIRED', `expected EBAY_TOKEN_EXPIRED for: ${msg}`);
  }
});

test('translateEbayError classifies listing-ended variants', () => {
  for (const msg of [
    'This listing has ended.',
    'Item is no longer active.',
    'The auction has closed.',
    'Listing has already been ended.',
  ]) {
    assert.equal(translateEbayError(msg)?.code, 'EBAY_LISTING_ENDED', `expected EBAY_LISTING_ENDED for: ${msg}`);
  }
});

test('translateEbayError classifies policy-missing-or-invalid variants', () => {
  for (const msg of [
    'Shipping policy is required.',
    'Payment policy is required.',
    'Return policy is required.',
    'The fulfillment policy is invalid.',
    'The selected policy was not found.',
  ]) {
    assert.equal(translateEbayError(msg)?.code, 'EBAY_POLICY_MISSING_OR_INVALID', `expected for: ${msg}`);
  }
});

test('translateEbayError classifies image-rejected variants', () => {
  for (const msg of [
    'The picture is too small.',
    'Image was rejected — unsupported format.',
    'Picture URL is invalid.',
  ]) {
    assert.equal(translateEbayError(msg)?.code, 'EBAY_IMAGE_REJECTED', `expected for: ${msg}`);
  }
});

test('translateEbayError classifies title-too-long', () => {
  const a = translateEbayError('Title exceeds the maximum number of characters.');
  assert.equal(a?.code, 'EBAY_TITLE_TOO_LONG');
  const b = translateEbayError('Title is too long.');
  assert.equal(b?.code, 'EBAY_TITLE_TOO_LONG');
});

test('translateEbayError classifies shipping-package-invalid variants', () => {
  for (const msg of [
    'Package weight is required for this shipping policy.',
    'Invalid package dimensions.',
    'Package weight is invalid.',
    'Shipping calculation requires package size.',
  ]) {
    assert.equal(translateEbayError(msg)?.code, 'EBAY_SHIPPING_PACKAGE_INVALID', `expected for: ${msg}`);
  }
});

// ─── translateEbayErrorBatch ──────────────────────────────────────────────

test('translateEbayErrorBatch enriches matched messages and keeps unmatched ones as EBAY_UNCLASSIFIED', () => {
  const out = translateEbayErrorBatch({
    errors: ['Title is too long.', 'A totally novel error.'],
    warnings: ['Item specific Brand is required.'],
  });
  assert.equal(out.errors.length, 2);
  assert.equal(out.errors[0].code, 'EBAY_TITLE_TOO_LONG');
  assert.equal(out.errors[1].code, 'EBAY_UNCLASSIFIED');
  assert.equal(out.errors[1].fix, null);
  assert.equal(out.warnings.length, 1);
  assert.equal(out.warnings[0].code, 'EBAY_MISSING_REQUIRED_SPECIFIC');
});

test('translateEbayErrorBatch tolerates missing errors/warnings arrays', () => {
  const out = translateEbayErrorBatch({});
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.warnings, []);
});

// ─── buildErrorBody ───────────────────────────────────────────────────────

test('buildErrorBody returns the structured shape from Section 8 of the plan for matched errors', () => {
  const body = buildErrorBody('Item specific Color is required.');
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'EBAY_MISSING_REQUIRED_SPECIFIC');
  assert.match(body.error.message, /"Color"/);
  assert.match(body.error.fix, /"Color"/);
  assert.equal(body.error.details.rawMessage, 'Item specific Color is required.');
});

test('buildErrorBody returns EBAY_UNCLASSIFIED for unmatched errors but preserves the raw text', () => {
  const body = buildErrorBody('Something brand-new from eBay');
  assert.equal(body.error.code, 'EBAY_UNCLASSIFIED');
  assert.equal(body.error.message, 'Something brand-new from eBay');
  assert.equal(body.error.details.rawMessage, 'Something brand-new from eBay');
  assert.equal(body.error.fix, null);
});

test('buildErrorBody uses the supplied fallback code and gracefully handles missing input', () => {
  const body = buildErrorBody(null, 'UNEXPECTED_FAILURE');
  assert.equal(body.error.code, 'UNEXPECTED_FAILURE');
  assert.equal(body.error.message, 'Unknown eBay API error');
  assert.equal(body.error.details.rawMessage, null);
});
