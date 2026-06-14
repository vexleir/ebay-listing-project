import { describe, expect, it } from 'vitest';
import type { StagedListing } from '../../types';
import { compareListed, matchesListedQuery, parsePrice } from './helpers';

function makeListing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'listing-1',
    title: 'Vintage Camera',
    description: 'A clean tested camera with leather case and original strap.',
    condition: 'Used',
    itemSpecifics: { Brand: 'Canon', Type: 'Camera', Model: 'AE-1', Color: 'Black', Format: '35mm' },
    category: 'Cameras',
    priceRecommendation: '$45.00',
    shippingEstimate: '$8.00',
    images: ['https://example.com/1.jpg', 'https://example.com/2.jpg', 'https://example.com/3.jpg'],
    createdAt: 100,
    ...overrides,
  };
}

describe('listed helpers', () => {
  it('parses formatted prices for numeric sorting', () => {
    expect(parsePrice('$1,234.56')).toBe(1234.56);
    expect(parsePrice('')).toBe(0);
  });

  it('matches listed search by title, SKU, or category', () => {
    const listing = makeListing({ sku: 'CAM-001' });

    expect(matchesListedQuery(listing, 'camera')).toBe(true);
    expect(matchesListedQuery(listing, 'cam-001')).toBe(true);
    expect(matchesListedQuery(listing, 'cameras')).toBe(true);
    expect(matchesListedQuery(listing, 'comic')).toBe(false);
  });

  it('sorts listed items by date, price, title, and health', () => {
    const strong = makeListing({ title: 'Beta', priceRecommendation: '$50.00', createdAt: 200 });
    const weak = makeListing({
      title: 'Alpha',
      priceRecommendation: '$10.00',
      createdAt: 100,
      description: '',
      images: [],
      itemSpecifics: {},
    });

    expect(compareListed(strong, weak, 'date-desc')).toBeLessThan(0);
    expect(compareListed(strong, weak, 'price-asc')).toBeGreaterThan(0);
    expect(compareListed(strong, weak, 'title-asc')).toBeGreaterThan(0);
    expect(compareListed(strong, weak, 'health-desc')).toBeLessThan(0);
  });
});
