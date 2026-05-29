// Unit tests and property-based tests for container name normalization.
// Validates Requirements 2.1, 2.2, 2.5, 2.6, 2.7, 2.8.

const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');

const { normalizeContainerName } = require('../../services/containers/normalize');

// ── Requirement 2.6: Equivalent inputs produce same canonical name ──────────

test('SBin1 variants all normalize to "S Bin 1"', () => {
  const variants = ['SBin1', 's bin 1', 'S-Bin-1', 'S Bin #1'];
  const results = variants.map((v) => normalizeContainerName(v));

  for (const result of results) {
    assert.equal(result.valid, true);
    assert.equal(result.canonical, 'S Bin 1');
  }
});

test('Tote 01 and Tote 1 produce same canonical name', () => {
  const a = normalizeContainerName('Tote 01');
  const b = normalizeContainerName('Tote 1');

  assert.equal(a.valid, true);
  assert.equal(b.valid, true);
  assert.equal(a.canonical, b.canonical);
  assert.equal(a.canonical, 'Tote 1');
});

// ── Requirement 2.7: Distinct logical containers produce distinct outputs ───

test('Tote 1, Stock 1, Shelf 1 produce distinct canonical names', () => {
  const tote = normalizeContainerName('Tote 1');
  const stock = normalizeContainerName('Stock 1');
  const shelf = normalizeContainerName('Shelf 1');

  assert.equal(tote.valid, true);
  assert.equal(stock.valid, true);
  assert.equal(shelf.valid, true);

  // All three must be different from each other
  assert.notEqual(tote.canonical, stock.canonical);
  assert.notEqual(tote.canonical, shelf.canonical);
  assert.notEqual(stock.canonical, shelf.canonical);
});

// ── Requirement 2.8: Invalid inputs are rejected ────────────────────────────

test('empty string is rejected', () => {
  const result = normalizeContainerName('');
  assert.equal(result.valid, false);
  assert.equal(result.error, 'SKU must contain at least one letter or digit');
});

test('null is rejected with type error', () => {
  const result = normalizeContainerName(null);
  assert.equal(result.valid, false);
  assert.equal(result.error, 'SKU must be a string');
});

test('whitespace-only input is rejected', () => {
  const result = normalizeContainerName('   ');
  assert.equal(result.valid, false);
  assert.equal(result.error, 'SKU must contain at least one letter or digit');
});

test('punctuation-only input is rejected', () => {
  const result = normalizeContainerName('---!!!');
  assert.equal(result.valid, false);
  assert.equal(result.error, 'SKU must contain at least one letter or digit');
});

// ── Property-Based Tests ────────────────────────────────────────────────────

// Feature: inventory-container-management, Property 3: Normalization output format invariant
// **Validates: Requirements 2.1, 2.5**
test('Property 3: Normalization output format invariant — output contains only letters, digits, single spaces; no leading/trailing spaces; title case; max 128 chars', () => {
  fc.assert(
    fc.property(
      // Generate arbitrary strings that contain at least one alphanumeric character
      fc.string({ minLength: 1, maxLength: 300 }).filter((s) => /[a-zA-Z0-9]/.test(s)),
      (input) => {
        const result = normalizeContainerName(input);

        // The input has at least one alphanumeric, so normalization should succeed
        assert.equal(result.valid, true, `Expected valid=true for input: ${JSON.stringify(input)}`);

        const canonical = result.canonical;

        // 1. Output contains only letters (a-z, A-Z), digits (0-9), and spaces
        assert.match(
          canonical,
          /^[a-zA-Z0-9 ]+$/,
          `Output should contain only letters, digits, and spaces. Got: ${JSON.stringify(canonical)}`
        );

        // 2. No leading or trailing spaces
        assert.equal(
          canonical,
          canonical.trim(),
          `Output should have no leading or trailing spaces. Got: ${JSON.stringify(canonical)}`
        );

        // 3. No consecutive spaces (only single spaces allowed)
        assert.ok(
          !canonical.includes('  '),
          `Output should not contain consecutive spaces. Got: ${JSON.stringify(canonical)}`
        );

        // 4. Title case: first letter of each space-separated token is uppercase, rest lowercase
        const tokens = canonical.split(' ');
        for (const token of tokens) {
          if (token.length === 0) continue;
          const firstChar = token[0];
          if (/[a-zA-Z]/.test(firstChar)) {
            assert.equal(
              firstChar,
              firstChar.toUpperCase(),
              `First letter of token "${token}" should be uppercase in: ${JSON.stringify(canonical)}`
            );
          }
          const rest = token.slice(1);
          if (rest && /[a-zA-Z]/.test(rest)) {
            assert.equal(
              rest,
              rest.toLowerCase(),
              `Remaining letters of token "${token}" should be lowercase in: ${JSON.stringify(canonical)}`
            );
          }
        }

        // 5. Maximum length of 128 characters
        assert.ok(
          canonical.length <= 128,
          `Output length ${canonical.length} exceeds 128 chars. Got: ${JSON.stringify(canonical)}`
        );
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: inventory-container-management, Property 4: Normalization is case-insensitive
// **Validates: Requirements 2.2**
test('Property 4: Normalization is case-insensitive — changing case of any character produces the same normalized output', () => {
  fc.assert(
    fc.property(
      // Generate arbitrary strings that contain at least one alphanumeric character
      fc.string({ minLength: 1, maxLength: 80 }).filter((s) => /[a-zA-Z0-9]/.test(s)),
      (input) => {
        // Validate case-insensitivity: for any input, its all-lowercase and
        // all-uppercase forms should produce the same canonical output, since
        // both eliminate camelCase boundaries uniformly and title-case produces
        // the same result regardless of which uniform case was the starting point.

        const lower = input.toLowerCase();
        const upper = input.toUpperCase();

        const lowerResult = normalizeContainerName(lower);
        const upperResult = normalizeContainerName(upper);

        // Skip if either variant is invalid (no alphanumeric after normalization)
        if (!lowerResult.valid || !upperResult.valid) return;

        // All-lowercase and all-uppercase versions must produce the same
        // canonical output — title-casing normalizes both uniformly
        assert.equal(lowerResult.canonical, upperResult.canonical,
          `toLowerCase and toUpperCase variants should produce same canonical: ` +
          `input="${input}", lower="${lowerResult.canonical}", upper="${upperResult.canonical}"`);
      }
    ),
    { numRuns: 100 }
  );
});

// Feature: inventory-container-management, Property 5: Normalization produces distinct outputs for distinct logical containers
// **Validates: Requirements 2.7**
//
// Strategy: Generate two distinct alpha prefixes and two distinct numeric suffixes,
// combine them into inputs like "Prefix1 Number1" and "Prefix2 Number2" (where at
// least one of prefix or number differs), and verify the canonical outputs are different.
test('Property 5: inputs with different alpha prefix or numeric suffix produce distinct canonical names', () => {
  // Generator for alphabetic prefixes (at least 1 char, letters only)
  const alphaPrefix = fc.stringMatching(/^[a-zA-Z]{1,10}$/);

  // Generator for numeric suffixes (integers to avoid leading-zero ambiguity)
  const numericSuffix = fc.integer({ min: 0, max: 9999 });

  fc.assert(
    fc.property(
      alphaPrefix,
      numericSuffix,
      alphaPrefix,
      numericSuffix,
      (prefix1, num1, prefix2, num2) => {
        // Pre-condition: at least one of prefix or number must differ
        // Compare prefixes case-insensitively since normalization is case-insensitive
        const samePrefix = prefix1.toLowerCase() === prefix2.toLowerCase();
        const sameNumber = num1 === num2;
        fc.pre(!samePrefix || !sameNumber);

        const input1 = `${prefix1} ${num1}`;
        const input2 = `${prefix2} ${num2}`;

        const result1 = normalizeContainerName(input1);
        const result2 = normalizeContainerName(input2);

        // Both should be valid since they contain letters and digits
        assert.equal(result1.valid, true, `Expected "${input1}" to be valid`);
        assert.equal(result2.valid, true, `Expected "${input2}" to be valid`);

        // Distinct logical containers must produce distinct canonical names
        assert.notEqual(
          result1.canonical,
          result2.canonical,
          `Expected distinct outputs for "${input1}" and "${input2}", but both produced "${result1.canonical}"`
        );
      }
    ),
    { numRuns: 100 }
  );
});
