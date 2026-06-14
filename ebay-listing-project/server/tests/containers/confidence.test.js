// Feature: inventory-container-management, Property 7: Confidence score range constraint
// Feature: inventory-container-management, Property 8: High confidence for punctuation/spacing/case-only differences
const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');

const { computeConfidence } = require('../../services/containers/normalize');

// ── Property 7: Confidence score range constraint ──
// **Validates: Requirements 3.1**
//
// Strategy:
// Generate arbitrary pairs of strings and pass them to computeConfidence.
// Verify the result is always an integer in the range [0, 100].

test('Property 7: confidence score is always an integer in [0, 100] for any two input strings', () => {
  fc.assert(
    fc.property(
      fc.string(),   // rawA
      fc.string(),   // rawB
      (rawA, rawB) => {
        const score = computeConfidence(rawA, rawB);

        assert.equal(typeof score, 'number',
          `Score should be a number, got ${typeof score} for inputs "${rawA}" and "${rawB}"`
        );
        assert.ok(Number.isInteger(score),
          `Score should be an integer, got ${score} for inputs "${rawA}" and "${rawB}"`
        );
        assert.ok(score >= 0,
          `Score should be >= 0, got ${score} for inputs "${rawA}" and "${rawB}"`
        );
        assert.ok(score <= 100,
          `Score should be <= 100, got ${score} for inputs "${rawA}" and "${rawB}"`
        );
      }
    ),
    { numRuns: 100 }
  );
});

// ── Property 8: High confidence for punctuation/spacing/case-only differences ──
// **Validates: Requirements 3.5**
//
// Strategy:
// Generate a base string containing at least one alphanumeric character, then
// create a variant that differs only in punctuation, spacing, or case.
// Since both variants normalize to the same canonical form, computeConfidence
// should return a score >= 90 (in practice, 100 for identical canonical forms).

test('Property 8: high confidence (>= 90) when inputs differ only in punctuation, spacing, or case', () => {
  // Generator: produce a base string as space-separated tokens (letters-only or digits-only)
  // so that the canonical form is stable across punctuation/case transformations.
  //
  // Key insight: tokens that are already separated by spaces will normalize identically
  // regardless of whether the separator is a space, dash, underscore, or other punctuation.
  // Case changes also don't affect the canonical form since normalization title-cases everything.
  const alphaToken = fc.stringMatching(/^[a-z]{1,8}$/);
  const numericToken = fc.stringMatching(/^[1-9][0-9]{0,3}$/);
  const token = fc.oneof(alphaToken, numericToken);

  // Generate 1-4 tokens joined by spaces to form the base
  const baseArb = fc.array(token, { minLength: 1, maxLength: 4 })
    .map((tokens) => tokens.join(' '));

  // Transformation: create a variant that differs only in punctuation, spacing, or case
  // Note: we avoid mixed-case transforms within a single token because the normalization
  // engine treats camelCase boundaries as structural (e.g., "aA" → "A A"), which means
  // arbitrary case mixing can change the canonical form.
  const transformArb = fc.constantFrom(
    'uppercase', 'lowercase', 'replaceSepWithDash', 'replaceSepWithUnderscore',
    'addExtraSpaces'
  );

  fc.assert(
    fc.property(
      baseArb,
      transformArb,
      (base, transform) => {
        let variant;
        switch (transform) {
          case 'uppercase':
            variant = base.toUpperCase();
            break;
          case 'lowercase':
            variant = base.toLowerCase();
            break;
          case 'replaceSepWithDash':
            variant = base.replace(/ /g, '-');
            break;
          case 'replaceSepWithUnderscore':
            variant = base.replace(/ /g, '_');
            break;
          case 'addExtraSpaces':
            variant = base.replace(/ /g, '   ');
            break;
        }

        const score = computeConfidence(base, variant);

        assert.ok(score >= 90,
          `Score should be >= 90 for trivial differences, got ${score} ` +
          `for base="${base}" and variant="${variant}" (transform: ${transform})`
        );
      }
    ),
    { numRuns: 100 }
  );
});

// ── Property 9: Low confidence for different prefix or suffix ──
// **Validates: Requirements 3.6**
//
// Strategy:
// Generate two inputs that have different alphabetic prefixes (e.g., "Tote 1" vs "Shelf 1")
// or different numeric suffixes (e.g., "Tote 1" vs "Tote 2").
// Verify computeConfidence(inputA, inputB) returns a score < 50.
//
// We use two sub-properties:
//   A) Same prefix, different numeric suffix
//   B) Different alpha prefix, same numeric suffix

test('Property 9a: low confidence when same prefix but different numeric suffix', () => {
  // Generate a letters-only prefix (at least 2 chars) and two distinct positive integers
  const alphaPrefix = fc.stringMatching(/^[a-zA-Z]{2,10}$/);
  const positiveInt = fc.integer({ min: 0, max: 9999 });

  fc.assert(
    fc.property(
      alphaPrefix,
      positiveInt,
      positiveInt,
      (prefix, numA, numB) => {
        // Ensure the two numbers are different
        fc.pre(numA !== numB);

        const inputA = `${prefix} ${numA}`;
        const inputB = `${prefix} ${numB}`;

        const score = computeConfidence(inputA, inputB);

        assert.ok(score < 50,
          `Score should be < 50 for different numeric suffix, got ${score} for "${inputA}" vs "${inputB}"`
        );
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 9b: low confidence when different alphabetic prefix with same suffix', () => {
  // Generate two distinct letters-only prefixes (at least 2 chars) and a shared number
  const alphaPrefix = fc.stringMatching(/^[a-zA-Z]{2,10}$/);
  const positiveInt = fc.integer({ min: 0, max: 9999 });

  fc.assert(
    fc.property(
      alphaPrefix,
      alphaPrefix,
      positiveInt,
      (prefixA, prefixB, num) => {
        // Ensure the two prefixes are different after lowercasing (case-insensitive comparison)
        fc.pre(prefixA.toLowerCase() !== prefixB.toLowerCase());

        const inputA = `${prefixA} ${num}`;
        const inputB = `${prefixB} ${num}`;

        const score = computeConfidence(inputA, inputB);

        assert.ok(score < 50,
          `Score should be < 50 for different alpha prefix, got ${score} for "${inputA}" vs "${inputB}"`
        );
      }
    ),
    { numRuns: 100 }
  );
});
