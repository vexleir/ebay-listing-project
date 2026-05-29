// Feature: inventory-container-management, Property 13: Location string format correctness

const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');

const { generateLocationString, MAX_LOCATION_LENGTH } = require('../../services/containers/location');

// ── Property 13: Location string format correctness ──
// **Validates: Requirements 8.1, 8.2, 8.3, 8.4**
//
// Strategy: Generate arbitrary combinations of location fields (some present, some absent)
// and verify the output satisfies all format invariants:
// 1. Result length ≤ 45 characters
// 2. No duplicate separators (" - " never appears consecutively without content between)
// 3. No leading or trailing " - "
// 4. If shelf is populated, it appears as "Shelf X" in the output
// 5. If shelfRow is populated, it appears as "Row Y" in the output
// 6. Fields appear in correct order: building, room, shelf, shelfRow, containerName

// Generator for optional non-empty trimmed strings (simulating location field values)
const optionalField = fc.oneof(
  fc.constant(undefined),
  fc.constant(''),
  fc.constant('  '),
  fc.stringMatching(/^[a-zA-Z0-9 ]{1,10}$/).filter(s => s.trim().length > 0)
);

// Generator for a required non-empty container name
const containerNameArb = fc.stringMatching(/^[a-zA-Z0-9 ]{1,10}$/).filter(s => s.trim().length > 0);

test('Property 13: location string length is at most 45 characters', () => {
  fc.assert(
    fc.property(
      optionalField,
      optionalField,
      optionalField,
      optionalField,
      containerNameArb,
      (building, room, shelf, shelfRow, containerName) => {
        const result = generateLocationString({ building, room, shelf, shelfRow, containerName });
        assert.ok(
          result.length <= MAX_LOCATION_LENGTH,
          `Expected length ≤ ${MAX_LOCATION_LENGTH}, got ${result.length}: "${result}"`
        );
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 13: no duplicate separators in location string', () => {
  fc.assert(
    fc.property(
      optionalField,
      optionalField,
      optionalField,
      optionalField,
      containerNameArb,
      (building, room, shelf, shelfRow, containerName) => {
        const result = generateLocationString({ building, room, shelf, shelfRow, containerName });
        // " - " should never appear back-to-back (i.e., " -  - " or " - - " should not exist)
        assert.ok(
          !result.includes(' -  - '),
          `Found duplicate separators in: "${result}"`
        );
        assert.ok(
          !result.includes(' - - '),
          `Found duplicate separators in: "${result}"`
        );
        // Also verify no empty segment between separators
        const parts = result.split(' - ');
        for (const part of parts) {
          assert.ok(
            part.length > 0,
            `Found empty segment between separators in: "${result}"`
          );
        }
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 13: no leading or trailing separator in location string', () => {
  fc.assert(
    fc.property(
      optionalField,
      optionalField,
      optionalField,
      optionalField,
      containerNameArb,
      (building, room, shelf, shelfRow, containerName) => {
        const result = generateLocationString({ building, room, shelf, shelfRow, containerName });
        assert.ok(
          !result.startsWith(' - '),
          `Location string has leading separator: "${result}"`
        );
        assert.ok(
          !result.startsWith('- '),
          `Location string has leading "- ": "${result}"`
        );
        assert.ok(
          !result.endsWith(' - '),
          `Location string has trailing separator: "${result}"`
        );
        assert.ok(
          !result.endsWith(' -'),
          `Location string has trailing " -": "${result}"`
        );
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 13: shelf value is prefixed with "Shelf " when present', () => {
  // Force shelf to always be a non-empty value for this test
  const nonEmptyShelf = fc.stringMatching(/^[a-zA-Z0-9]{1,6}$/);

  fc.assert(
    fc.property(
      optionalField,
      optionalField,
      nonEmptyShelf,
      optionalField,
      containerNameArb,
      (building, room, shelf, shelfRow, containerName) => {
        const result = generateLocationString({ building, room, shelf, shelfRow, containerName });
        // If the result is not truncated past the shelf portion, it should contain "Shelf "
        // Since truncation may cut it off, we check: either the result contains "Shelf "
        // or the result is exactly MAX_LOCATION_LENGTH (truncated)
        if (result.length < MAX_LOCATION_LENGTH) {
          assert.ok(
            result.includes(`Shelf ${shelf.trim()}`),
            `Expected "Shelf ${shelf.trim()}" in result when shelf="${shelf}": "${result}"`
          );
        } else {
          // Truncated — at minimum "Shelf " should appear if the shelf portion wasn't cut
          // We just verify the invariant holds for non-truncated cases
          assert.ok(result.length === MAX_LOCATION_LENGTH);
        }
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 13: shelfRow value is prefixed with "Row " when present', () => {
  // Force shelfRow to always be a non-empty value for this test
  const nonEmptyRow = fc.stringMatching(/^[a-zA-Z0-9]{1,6}$/);

  fc.assert(
    fc.property(
      optionalField,
      optionalField,
      optionalField,
      nonEmptyRow,
      containerNameArb,
      (building, room, shelf, shelfRow, containerName) => {
        const result = generateLocationString({ building, room, shelf, shelfRow, containerName });
        // If the result is not truncated past the row portion, it should contain "Row "
        if (result.length < MAX_LOCATION_LENGTH) {
          assert.ok(
            result.includes(`Row ${shelfRow.trim()}`),
            `Expected "Row ${shelfRow.trim()}" in result when shelfRow="${shelfRow}": "${result}"`
          );
        } else {
          // Truncated — just verify length constraint holds
          assert.ok(result.length === MAX_LOCATION_LENGTH);
        }
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 13: fields appear in correct order (building, room, shelf, shelfRow, containerName)', () => {
  fc.assert(
    fc.property(
      optionalField,
      optionalField,
      optionalField,
      optionalField,
      containerNameArb,
      (building, room, shelf, shelfRow, containerName) => {
        const result = generateLocationString({ building, room, shelf, shelfRow, containerName });

        // Split by separator and check that populated fields appear in the expected order
        const parts = result.split(' - ');

        // Determine which fields are populated (non-empty after trim)
        const buildingVal = building && building.trim() ? building.trim() : null;
        const roomVal = room && room.trim() ? room.trim() : null;
        const shelfVal = shelf && shelf.trim() ? `Shelf ${shelf.trim()}` : null;
        const shelfRowVal = shelfRow && shelfRow.trim() ? `Row ${shelfRow.trim()}` : null;
        const containerVal = containerName.trim();

        // Build expected order of parts (only populated fields)
        const expectedParts = [buildingVal, roomVal, shelfVal, shelfRowVal, containerVal]
          .filter(v => v !== null);

        // The joined result may be truncated, so we only verify ordering
        // for parts that are fully present in the result
        if (result.length < MAX_LOCATION_LENGTH) {
          // Non-truncated: parts should match expected order exactly
          assert.deepEqual(
            parts,
            expectedParts,
            `Expected parts ${JSON.stringify(expectedParts)} but got ${JSON.stringify(parts)} for result: "${result}"`
          );
        } else {
          // Truncated: verify that the parts we can see are a prefix of the expected order
          const joinedExpected = expectedParts.join(' - ');
          assert.ok(
            joinedExpected.startsWith(result) || joinedExpected.slice(0, MAX_LOCATION_LENGTH) === result,
            `Truncated result "${result}" should be a prefix of expected "${joinedExpected}"`
          );
        }
      }
    ),
    { numRuns: 100 }
  );
});
