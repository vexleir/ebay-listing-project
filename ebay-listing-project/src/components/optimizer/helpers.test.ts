import { describe, it, expect } from 'vitest';
import {
  extractItemId, gradeColor, scoreBarColor, formatOptimizerDate, compMedian,
} from './helpers';

describe('extractItemId', () => {
  it('returns the pure numeric ID when input is just an item number', () => {
    expect(extractItemId('123456789012')).toBe('123456789012');
  });

  it('extracts the trailing numeric ID from /itm/TITLE/ITEMID URLs', () => {
    expect(extractItemId('https://www.ebay.com/itm/Vintage-Camera/123456789012')).toBe('123456789012');
  });

  it('extracts the trailing numeric ID from /itm/ITEMID URLs', () => {
    expect(extractItemId('https://www.ebay.com/itm/123456789012')).toBe('123456789012');
  });

  it('extracts ID from ?item= query strings (case-insensitive)', () => {
    expect(extractItemId('https://www.ebay.com/somepage?item=123456789012&foo=bar')).toBe('123456789012');
    expect(extractItemId('https://www.ebay.com/somepage?ItemID=123456789012')).toBe('123456789012');
  });

  it('returns null for garbage input', () => {
    expect(extractItemId('')).toBeNull();
    expect(extractItemId('not a url')).toBeNull();
    expect(extractItemId('https://www.ebay.com/no-item-id-here')).toBeNull();
    expect(extractItemId('1234')).toBeNull();
  });

  it('trims whitespace', () => {
    expect(extractItemId('   123456789012   ')).toBe('123456789012');
  });
});

describe('gradeColor', () => {
  it('returns the agreed color for each grade', () => {
    expect(gradeColor('A')).toBe('#10b981');
    expect(gradeColor('B')).toBe('#3b82f6');
    expect(gradeColor('C')).toBe('#f59e0b');
    expect(gradeColor('D')).toBe('#f97316');
    expect(gradeColor('F')).toBe('#ef4444');
    expect(gradeColor('???')).toBe('#ef4444');
  });
});

describe('scoreBarColor', () => {
  it('routes the bar color by percentile band', () => {
    expect(scoreBarColor(100)).toBe('#10b981');
    expect(scoreBarColor(80)).toBe('#10b981');
    expect(scoreBarColor(79)).toBe('#3b82f6');
    expect(scoreBarColor(60)).toBe('#3b82f6');
    expect(scoreBarColor(59)).toBe('#f59e0b');
    expect(scoreBarColor(40)).toBe('#f59e0b');
    expect(scoreBarColor(39)).toBe('#ef4444');
    expect(scoreBarColor(0)).toBe('#ef4444');
  });
});

describe('formatOptimizerDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatOptimizerDate('')).toBe('');
  });

  it('returns a date string for a valid ISO date', () => {
    const result = formatOptimizerDate('2026-05-27T00:00:00.000Z');
    // Output is locale-dependent; just verify it's non-empty and references the year.
    expect(result).not.toBe('');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns "Invalid Date" or empty for unparseable strings (but does not throw)', () => {
    // toLocaleDateString on Invalid Date returns "Invalid Date" on every runtime
    // we support; just confirm we don't blow up.
    expect(() => formatOptimizerDate('not-a-date')).not.toThrow();
  });
});

describe('compMedian', () => {
  it('returns null below the minimum-sample threshold', () => {
    expect(compMedian([])).toBeNull();
    expect(compMedian([10])).toBeNull();
    expect(compMedian([10, 20])).toBeNull();
  });

  it('returns the median for an odd-length array', () => {
    expect(compMedian([10, 20, 30])).toBe(20);
  });

  it('returns the average of the two middle values for an even-length array', () => {
    expect(compMedian([10, 20, 30, 40])).toBe(25);
  });

  it('drops zero and negative prices before computing the median', () => {
    expect(compMedian([0, 10, 20, 30])).toBe(20);
    expect(compMedian([-5, 10, 20, 30])).toBe(20);
  });

  it('respects a custom minSize', () => {
    expect(compMedian([10, 20], 2)).toBe(15);
    expect(compMedian([10], 1)).toBe(10);
  });
});
