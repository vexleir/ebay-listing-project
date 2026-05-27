// DATA-001 — sold-listings CSV builder. Lives in src/utils so both
// SoldListings and Analytics can call it without duplicating the column
// order / fee math.

import type { StagedListing } from '../types';
import { calculateNetProfit } from './fees';
import { buildCsv, type CsvCell } from './csv';

export const SOLD_EXPORT_COLUMNS = [
  'Title',
  'SKU',
  'eBay Item ID',
  'Sold Date',
  'Sold Price (USD)',
  'Cost Basis (USD)',
  'Shipping Label Cost (USD)',
  'Estimated eBay Fees (USD)',
  'Transaction Fee (USD)',
  'Promoted Fee (USD)',
  'Gross Profit (USD)',
  'Net Profit (USD)',
  'Net Margin %',
  'Category',
  'Tags',
] as const;

function isoDate(ts: number | undefined): string {
  if (!ts) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

function money(n: number): string {
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

function pct(n: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return n.toFixed(1);
}

// `promotedPct` is the seller's chosen Promoted Listings ad rate, taken
// from Analytics settings. Defaults to 0 (no promoted listing).
export function buildSoldExportRow(listing: StagedListing, promotedPct = 0): CsvCell[] {
  const np = calculateNetProfit(
    listing.soldPrice || listing.priceRecommendation,
    listing.costBasis,
    listing.category || '',
    listing.shippingLabelCost,
    promotedPct,
  );
  return [
    listing.title || '',
    listing.sku || '',
    listing.ebayDraftId || '',
    isoDate(listing.soldAt),
    money(np.salePrice),
    money(np.costBasis),
    money(np.shippingCost),
    money(np.ebayFee),
    money(np.transactionFee),
    money(np.promotedFee),
    money(np.grossProfit),
    money(np.netProfit),
    pct(np.netMarginPct),
    listing.category || '',
    Array.isArray(listing.tags) ? listing.tags.join('; ') : '',
  ];
}

export function buildSoldExportCsv(listings: StagedListing[], promotedPct = 0): string {
  const rows = listings.map((l) => buildSoldExportRow(l, promotedPct));
  return buildCsv([...SOLD_EXPORT_COLUMNS], rows);
}

// Filename like "sold-items-2026-05-26.csv".
export function buildSoldExportFilename(now = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `sold-items-${yyyy}-${mm}-${dd}.csv`;
}
