import type { StagedListing } from '../../types';
import { downloadCsv, buildCsv } from '../../utils/csv';
import { computeHealthScore } from '../listings/shared/helpers';

export type ListedSortOption = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc' | 'price-asc' | 'price-desc' | 'health-asc' | 'health-desc';
export type ListedViewMode = 'grid' | 'list';
export type ListedStatusFilter = 'all' | 'active' | 'ended';

export interface ListingStats {
  watchCount: string;
  hitCount: string;
  quantitySold: string;
}

export function parsePrice(val: string): number {
  const normalized = val.replace(/[^0-9.]/g, '');
  return normalized ? parseFloat(normalized) : 0;
}

export function compareListed(a: StagedListing, b: StagedListing, sort: ListedSortOption): number {
  switch (sort) {
    case 'date-asc': return a.createdAt - b.createdAt;
    case 'date-desc': return b.createdAt - a.createdAt;
    case 'title-asc': return a.title.localeCompare(b.title);
    case 'title-desc': return b.title.localeCompare(a.title);
    case 'price-asc': return parsePrice(a.priceRecommendation) - parsePrice(b.priceRecommendation);
    case 'price-desc': return parsePrice(b.priceRecommendation) - parsePrice(a.priceRecommendation);
    case 'health-asc': return computeHealthScore(a).score - computeHealthScore(b).score;
    case 'health-desc': return computeHealthScore(b).score - computeHealthScore(a).score;
    default: return 0;
  }
}

export function matchesListedQuery(listing: StagedListing, q: string): boolean {
  if (!q) return true;
  if (listing.title.toLowerCase().includes(q)) return true;
  if ((listing.sku || '').toLowerCase().includes(q)) return true;
  if ((listing.category || '').toLowerCase().includes(q)) return true;
  return false;
}

export function exportListedCsv(listings: StagedListing[]): void {
  const headers = ['Title', 'SKU', 'Price', 'Category', 'eBay ID', 'Status', 'Date Created', 'Last Updated'];
  const rows = listings.map((listing) => [
    listing.title || '',
    listing.sku || '',
    listing.priceRecommendation || '',
    listing.category || '',
    listing.ebayDraftId || '',
    listing.archived ? 'Archived' : 'Active',
    new Date(listing.createdAt).toLocaleDateString(),
    listing.updatedAt ? new Date(listing.updatedAt).toLocaleDateString() : '',
  ]);

  downloadCsv(`listed-products-${new Date().toISOString().split('T')[0]}.csv`, buildCsv(headers, rows));
}
