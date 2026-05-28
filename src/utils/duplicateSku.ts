// INV-002 (lite) — duplicate-SKU detection that uses the existing
// `sku` field on each listing. No new collection / inventory schema yet
// (that's INV-001's job); this works against the in-memory staged +
// listed arrays already loaded into App state.
//
// "Active" here means the SKU is still occupying inventory: a staged
// draft or a live eBay listing that hasn't been marked sold. Sold rows
// (soldAt is set) free up the SKU again — repeatedly re-using a SKU on
// sold-and-restocked items is a normal seller pattern.

import type { StagedListing } from '../types';

export function normalizeSku(sku: string | undefined | null): string {
  if (!sku) return '';
  return sku.trim().toLowerCase();
}

// True when this listing currently occupies a SKU slot. We treat a
// listing as "active" when it has a SKU and is either staged or is a
// listed item that hasn't been marked sold. Archived-but-unsold listings
// also count — they're still on eBay until they're explicitly removed.
export function isActiveListing(listing: StagedListing): boolean {
  if (!normalizeSku(listing.sku)) return false;
  if (listing.soldAt) return false;
  return true;
}

// Build a map of normalized SKU → listings that currently hold it.
// Multiple entries per key indicate a collision the seller probably
// didn't intend. Callers can ignore single-entry slots.
export function buildActiveSkuMap(listings: StagedListing[]): Map<string, StagedListing[]> {
  const out = new Map<string, StagedListing[]>();
  for (const l of listings) {
    if (!isActiveListing(l)) continue;
    const k = normalizeSku(l.sku);
    const arr = out.get(k);
    if (arr) arr.push(l);
    else out.set(k, [l]);
  }
  return out;
}

// Returns the OTHER active listings that share `sku` with the caller.
// `currentListingId` is excluded so editing an existing record's own
// SKU doesn't flag itself. Empty array means no conflict.
export function findConflictingListings(
  sku: string | undefined | null,
  allListings: StagedListing[],
  currentListingId?: string,
): StagedListing[] {
  const key = normalizeSku(sku);
  if (!key) return [];
  return allListings.filter((l) =>
    isActiveListing(l)
    && normalizeSku(l.sku) === key
    && l.id !== currentListingId,
  );
}

// Convenience predicate for hot paths that only need a boolean.
export function hasSkuConflict(
  sku: string | undefined | null,
  allListings: StagedListing[],
  currentListingId?: string,
): boolean {
  return findConflictingListings(sku, allListings, currentListingId).length > 0;
}
