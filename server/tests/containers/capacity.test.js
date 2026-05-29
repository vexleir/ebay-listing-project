// Feature: inventory-container-management, Property 14: Fullness percentage calculation

const assert = require('node:assert/strict');
const test = require('node:test');
const fc = require('fast-check');

const { calculateFullnessPercentage } = require('../../services/containers/capacity');

// ── Property 14: Fullness percentage calculation ──
// **Validates: Requirements 14.3, 14.4**
//
// Strategy:
// 1. Generate positive estimatedCapacity and non-negative currentItemCount,
//    verify result equals Math.round((currentItemCount / estimatedCapacity) * 100).
// 2. Generate cases where estimatedCapacity is 0, null, or undefined,
//    verify result is null.

test('Property 14: fullness percentage equals round((currentItemCount / estimatedCapacity) * 100) for positive capacity', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 999999 }),   // currentItemCount (non-negative)
      fc.integer({ min: 1, max: 999999 }),   // estimatedCapacity (positive)
      (currentItemCount, estimatedCapacity) => {
        const result = calculateFullnessPercentage(currentItemCount, estimatedCapacity);
        const expected = Math.round((currentItemCount / estimatedCapacity) * 100);

        assert.equal(typeof result, 'number', 'Result should be a number when capacity is positive');
        assert.equal(result, expected,
          `Expected ${expected} for count=${currentItemCount}, capacity=${estimatedCapacity}, got ${result}`
        );
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 14: fullness percentage is null when estimatedCapacity is zero', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 999999 }),   // currentItemCount (non-negative)
      (currentItemCount) => {
        const result = calculateFullnessPercentage(currentItemCount, 0);
        assert.equal(result, null,
          `Expected null when capacity is 0, got ${result} for count=${currentItemCount}`
        );
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 14: fullness percentage is null when estimatedCapacity is null', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 999999 }),   // currentItemCount (non-negative)
      (currentItemCount) => {
        const result = calculateFullnessPercentage(currentItemCount, null);
        assert.equal(result, null,
          `Expected null when capacity is null, got ${result} for count=${currentItemCount}`
        );
      }
    ),
    { numRuns: 100 }
  );
});

test('Property 14: fullness percentage is null when estimatedCapacity is undefined', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 999999 }),   // currentItemCount (non-negative)
      (currentItemCount) => {
        const result = calculateFullnessPercentage(currentItemCount, undefined);
        assert.equal(result, null,
          `Expected null when capacity is undefined, got ${result} for count=${currentItemCount}`
        );
      }
    ),
    { numRuns: 100 }
  );
});
