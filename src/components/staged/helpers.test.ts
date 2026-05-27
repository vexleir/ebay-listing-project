import { describe, it, expect } from 'vitest';
import {
  computeHealthScore,
  autoConditionId,
  timeAgo,
  toArizonaLocalISO,
  compareStaged,
  matchesStagedQuery,
} from './helpers';
import type { StagedListing } from '../../types';

function listing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'l1',
    title: 'Test',
    description: '',
    priceRecommendation: '',
    category: '',
    categoryId: '',
    condition: '',
    images: [],
    itemSpecifics: {},
    shippingEstimate: '',
    status: 'staged',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('computeHealthScore', () => {
  it('returns a perfect-ish 100 for a fully populated listing', () => {
    const out = computeHealthScore(listing({
      title: 'A'.repeat(75),
      images: ['https://a.example/1.jpg', 'https://a.example/2.jpg', 'https://a.example/3.jpg'],
      description: 'x'.repeat(400),
      category: 'Collectibles > Comics',
      priceRecommendation: '$24.99',
      itemSpecifics: { Brand: 'X', MPN: 'Y', Type: 'Z', Color: 'Red', Size: 'M' },
    }));
    expect(out.score).toBe(100);
    expect(out.issues).toHaveLength(0);
  });

  it('flags every missing field', () => {
    const out = computeHealthScore(listing());
    expect(out.score).toBeLessThan(40);
    expect(out.issues.some((i) => /No images/.test(i))).toBe(true);
    expect(out.issues.some((i) => /Description/.test(i))).toBe(true);
    expect(out.issues.some((i) => /Category not set/.test(i))).toBe(true);
    expect(out.issues.some((i) => /Price not set/.test(i))).toBe(true);
  });

  it('warns when images are local (data: URIs) rather than cloud-hosted', () => {
    const out = computeHealthScore(listing({
      images: ['data:image/png;base64,xxx'],
      title: 'Some title that is at least 50 chars long for the test',
    }));
    expect(out.issues.some((i) => /Images not uploaded to cloud/.test(i))).toBe(true);
  });
});

describe('autoConditionId', () => {
  it('maps free-form condition text to numeric IDs', () => {
    expect(autoConditionId('New')).toBe('1000');
    expect(autoConditionId('Brand New')).toBe('1000');
    expect(autoConditionId('New Other')).toBe('1500');
    expect(autoConditionId('Like New')).toBe('2500');
    expect(autoConditionId('Open Box')).toBe('2500');
    expect(autoConditionId('Used')).toBe('3000');
    expect(autoConditionId('Very Good')).toBe('4000');
    expect(autoConditionId('Good')).toBe('5000');
    expect(autoConditionId('Acceptable')).toBe('6000');
    expect(autoConditionId('For Parts')).toBe('7000');
    expect(autoConditionId('Not Working')).toBe('7000');
  });

  it('defaults to "Used" (3000) for unknown / empty input', () => {
    expect(autoConditionId('')).toBe('3000');
    expect(autoConditionId('something unrecognized')).toBe('3000');
  });
});

describe('timeAgo', () => {
  it('formats timestamps relative to the given now', () => {
    const now = 1_700_000_000_000;
    expect(timeAgo(now, now)).toBe('just now');
    expect(timeAgo(now - 30 * 1000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m ago');
    expect(timeAgo(now - 3 * 60 * 60_000, now)).toBe('3h ago');
    expect(timeAgo(now - 5 * 24 * 60 * 60_000, now)).toBe('5d ago');
  });
});

describe('toArizonaLocalISO', () => {
  it('returns a 16-character "YYYY-MM-DDTHH:mm" string offset 7h behind UTC', () => {
    const d = new Date(Date.UTC(2026, 4, 26, 19, 30));
    expect(toArizonaLocalISO(d)).toBe('2026-05-26T12:30');
  });
});

describe('compareStaged', () => {
  const a = listing({ id: 'a', title: 'Alpha', priceRecommendation: '10', createdAt: 1 });
  const b = listing({ id: 'b', title: 'Bravo', priceRecommendation: '50', createdAt: 2 });

  it('sorts by date asc/desc', () => {
    expect(compareStaged(a, b, 'date-asc')).toBeLessThan(0);
    expect(compareStaged(a, b, 'date-desc')).toBeGreaterThan(0);
  });
  it('sorts by price asc/desc', () => {
    expect(compareStaged(a, b, 'price-asc')).toBeLessThan(0);
    expect(compareStaged(a, b, 'price-desc')).toBeGreaterThan(0);
  });
  it('sorts by title alphabetically', () => {
    expect(compareStaged(a, b, 'title-asc')).toBeLessThan(0);
  });
});

describe('matchesStagedQuery', () => {
  const l = listing({ title: 'Vintage Camera', sku: 'CAM-001', category: 'Cameras' });
  it('returns true for empty query', () => {
    expect(matchesStagedQuery(l, '')).toBe(true);
  });
  it('matches against title, SKU, and category', () => {
    expect(matchesStagedQuery(l, 'vintage')).toBe(true);
    expect(matchesStagedQuery(l, 'cam-001')).toBe(true);
    expect(matchesStagedQuery(l, 'cameras')).toBe(true);
  });
  it('returns false when no field matches', () => {
    expect(matchesStagedQuery(l, 'electronics')).toBe(false);
  });
});
