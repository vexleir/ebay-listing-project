import { describe, it, expect } from 'vitest';
import {
  normalizeSku,
  isActiveListing,
  buildActiveSkuMap,
  findConflictingListings,
  hasSkuConflict,
  isLiveListing,
  findLiveListingConflicts,
} from './duplicateSku';
import type { StagedListing } from '../types';

function listing(overrides: Partial<StagedListing> = {}): StagedListing {
  return {
    id: 'l1',
    title: 'Test',
    description: '',
    condition: 'Used',
    itemSpecifics: {},
    category: 'Cameras',
    priceRecommendation: '10',
    shippingEstimate: '',
    images: [],
    createdAt: 0,
    status: 'staged',
    ...overrides,
  };
}

describe('normalizeSku', () => {
  it('lowercases and trims', () => {
    expect(normalizeSku('  ABC-001 ')).toBe('abc-001');
  });

  it('returns empty string for falsy input', () => {
    expect(normalizeSku('')).toBe('');
    expect(normalizeSku(undefined)).toBe('');
    expect(normalizeSku(null)).toBe('');
  });
});

describe('isActiveListing', () => {
  it('is true for a staged listing with a SKU', () => {
    expect(isActiveListing(listing({ sku: 'A1' }))).toBe(true);
  });

  it('is true for a listed (live) listing with a SKU and no sold date', () => {
    expect(isActiveListing(listing({ sku: 'A1', status: 'listed' }))).toBe(true);
  });

  it('is false when there is no SKU', () => {
    expect(isActiveListing(listing({ sku: undefined }))).toBe(false);
    expect(isActiveListing(listing({ sku: '' }))).toBe(false);
    expect(isActiveListing(listing({ sku: '   ' }))).toBe(false);
  });

  it('is false when the listing has been marked sold', () => {
    expect(isActiveListing(listing({ sku: 'A1', soldAt: 123 }))).toBe(false);
  });
});

describe('buildActiveSkuMap', () => {
  it('groups active listings by normalized SKU', () => {
    const a = listing({ id: 'a', sku: 'WIDGET-1' });
    const b = listing({ id: 'b', sku: 'widget-1' }); // case difference; should collide
    const c = listing({ id: 'c', sku: 'OTHER' });
    const map = buildActiveSkuMap([a, b, c]);
    expect(map.get('widget-1')!.map((l) => l.id).sort()).toEqual(['a', 'b']);
    expect(map.get('other')!.map((l) => l.id)).toEqual(['c']);
  });

  it('skips inactive listings (sold or no-SKU)', () => {
    const sold = listing({ id: 's', sku: 'X', soldAt: 99 });
    const noSku = listing({ id: 'n', sku: '' });
    const ok = listing({ id: 'o', sku: 'X' });
    const map = buildActiveSkuMap([sold, noSku, ok]);
    expect(map.size).toBe(1);
    expect(map.get('x')!.map((l) => l.id)).toEqual(['o']);
  });
});

describe('findConflictingListings', () => {
  it('returns empty for an empty / undefined SKU', () => {
    const a = listing({ id: 'a', sku: 'X' });
    expect(findConflictingListings('', [a])).toEqual([]);
    expect(findConflictingListings(undefined, [a])).toEqual([]);
  });

  it('returns other listings holding the same normalized SKU', () => {
    const a = listing({ id: 'a', sku: 'X-1' });
    const b = listing({ id: 'b', sku: 'x-1' });
    const c = listing({ id: 'c', sku: 'Y-1' });
    expect(findConflictingListings('X-1', [a, b, c]).map((l) => l.id).sort()).toEqual(['a', 'b']);
  });

  it('excludes the currentListingId from results (editing yourself is fine)', () => {
    const a = listing({ id: 'a', sku: 'X' });
    const b = listing({ id: 'b', sku: 'X' });
    expect(findConflictingListings('X', [a, b], 'a').map((l) => l.id)).toEqual(['b']);
    expect(findConflictingListings('X', [a, b], 'b').map((l) => l.id)).toEqual(['a']);
  });

  it('ignores sold listings — they freed their SKU', () => {
    const sold = listing({ id: 's', sku: 'REUSED', soldAt: 1 });
    const live = listing({ id: 'l', sku: 'REUSED' });
    expect(findConflictingListings('REUSED', [sold, live]).map((l) => l.id)).toEqual(['l']);
  });
});

describe('hasSkuConflict', () => {
  it('returns true when at least one other active listing holds the SKU', () => {
    const a = listing({ id: 'a', sku: 'X' });
    const b = listing({ id: 'b', sku: 'X' });
    expect(hasSkuConflict('X', [a, b])).toBe(true);
  });

  it('returns false when only your own listing holds the SKU', () => {
    const me = listing({ id: 'me', sku: 'X' });
    expect(hasSkuConflict('X', [me], 'me')).toBe(false);
  });
});

describe('isLiveListing', () => {
  it('is true for a listed item with a SKU that is not sold', () => {
    expect(isLiveListing(listing({ sku: 'X', status: 'listed' }))).toBe(true);
  });

  it('is false for staged items even when they have a SKU', () => {
    expect(isLiveListing(listing({ sku: 'X', status: 'staged' }))).toBe(false);
  });

  it('is false for a listed item that has been marked sold', () => {
    expect(isLiveListing(listing({ sku: 'X', status: 'listed', soldAt: 1 }))).toBe(false);
  });

  it('is false when SKU is blank', () => {
    expect(isLiveListing(listing({ sku: '', status: 'listed' }))).toBe(false);
    expect(isLiveListing(listing({ sku: '   ', status: 'listed' }))).toBe(false);
  });
});

describe('findLiveListingConflicts', () => {
  it('returns the live listings that share the SKU, excluding the current id', () => {
    const live = listing({ id: 'live1', sku: 'WIDGET', status: 'listed' });
    const stagedDup = listing({ id: 'stage1', sku: 'WIDGET', status: 'staged' });
    const otherSku = listing({ id: 'other', sku: 'GADGET', status: 'listed' });
    const conflicts = findLiveListingConflicts('WIDGET', [live, stagedDup, otherSku]);
    expect(conflicts.map((l) => l.id)).toEqual(['live1']);
  });

  it('does NOT flag staged listings as conflicts (push converts staged → listed)', () => {
    const stagedA = listing({ id: 'a', sku: 'X', status: 'staged' });
    const stagedB = listing({ id: 'b', sku: 'X', status: 'staged' });
    expect(findLiveListingConflicts('X', [stagedA, stagedB])).toEqual([]);
  });

  it('does NOT flag a listed item that has been marked sold', () => {
    const sold = listing({ id: 'sold', sku: 'REUSED', status: 'listed', soldAt: 1 });
    const live = listing({ id: 'live', sku: 'REUSED', status: 'listed' });
    expect(findLiveListingConflicts('REUSED', [sold, live]).map((l) => l.id)).toEqual(['live']);
  });

  it('excludes the listing whose id matches currentListingId', () => {
    const a = listing({ id: 'a', sku: 'X', status: 'listed' });
    const b = listing({ id: 'b', sku: 'X', status: 'listed' });
    expect(findLiveListingConflicts('X', [a, b], 'a').map((l) => l.id)).toEqual(['b']);
  });

  it('is case-insensitive', () => {
    const a = listing({ id: 'a', sku: 'Widget-1', status: 'listed' });
    expect(findLiveListingConflicts('widget-1', [a]).map((l) => l.id)).toEqual(['a']);
  });

  it('returns empty for blank or undefined SKU', () => {
    const a = listing({ id: 'a', sku: 'X', status: 'listed' });
    expect(findLiveListingConflicts('', [a])).toEqual([]);
    expect(findLiveListingConflicts(undefined, [a])).toEqual([]);
  });
});
