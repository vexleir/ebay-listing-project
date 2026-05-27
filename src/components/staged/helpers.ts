// FE-001a — pure helpers extracted from StagedListings.tsx. Kept free of
// React/DOM imports so they're trivially testable and reusable from any
// component (the optimizer also wants computeHealthScore down the line).

import type { StagedListing } from '../../types';

export interface HealthScore {
  score: number;
  issues: string[];
}

// Computes a 0–100 listing health score plus the list of issues that
// dragged the score down. Scoring is intentionally simple and additive so
// the contract is easy to read; each branch's points are documented inline.
export function computeHealthScore(listing: StagedListing): HealthScore {
  const issues: string[] = [];
  let score = 0;

  // Title length — eBay's Cassini algo rewards keyword-rich titles, so
  // grade harshly for short titles.
  const titleLen = listing.title?.length || 0;
  if (titleLen >= 70) score += 20;
  else if (titleLen >= 50) { score += 10; issues.push(`Title short: ${titleLen}/80 chars`); }
  else { issues.push(`Title very short: ${titleLen}/80 chars`); }

  // Image count — 3+ images correlates with higher conversion.
  const imgCount = (listing.images || []).length;
  if (imgCount >= 3) score += 20;
  else if (imgCount >= 1) { score += 10; issues.push(`Only ${imgCount} image — add 3+ for best visibility`); }
  else { issues.push('No images attached'); }

  // Cloud-uploaded images — local data: URIs won't push to eBay.
  const hasCloudImages = (listing.images || []).some((img) => img.startsWith('http'));
  if (hasCloudImages) score += 10;
  else if (imgCount > 0) issues.push('Images not uploaded to cloud — push may fail');

  // Description length — 300+ chars is the rough threshold for "good".
  const descLen = listing.description?.length || 0;
  if (descLen > 300) score += 15;
  else if (descLen > 80) { score += 8; issues.push('Description is short'); }
  else { issues.push('Description missing or very short'); }

  // Category — anything but "Unknown" counts; specificity is checked separately.
  const cat = listing.category || '';
  if (cat && cat !== 'Unknown') score += 15;
  else issues.push('Category not set');

  // Price — any positive number counts; reasonableness is checked elsewhere.
  const price = parseFloat((listing.priceRecommendation || '').replace(/[^0-9.]/g, ''));
  if (price > 0) score += 10;
  else issues.push('Price not set');

  // Item specifics — 5+ aspects unlocks many search filters.
  const specificsCount = Object.keys(listing.itemSpecifics || {}).length;
  if (specificsCount >= 5) score += 10;
  else if (specificsCount >= 2) { score += 5; issues.push(`Only ${specificsCount} item specifics`); }
  else { issues.push('Item specifics missing'); }

  return { score, issues };
}

// Maps a free-form condition string ("Like New", "Used - Good") to the
// numeric eBay ConditionID expected by AddFixedPriceItem. Mirrors the
// server-side getConditionId in server/services/ebay/conditions.js — keep
// the two in sync when adding new conditions.
export function autoConditionId(conditionStr: string): string {
  const s = (conditionStr || '').toLowerCase();
  if (s.includes('for parts') || s.includes('not working')) return '7000';
  if (s.includes('acceptable') || s.includes('heavy wear')) return '6000';
  if (s.includes('good') && !s.includes('very good') && !s.includes('like new')) return '5000';
  if (s.includes('very good')) return '4000';
  if (s.includes('like new') || s.includes('mint') || s.includes('open box')) return '2500';
  if (s.includes('refurbished') || s.includes('refurb')) return '2500';
  if (s.includes('new other')) return '1500';
  if (s.includes('new') && !s.includes('like')) return '1000';
  return '3000';
}

// Formats a millisecond timestamp as "just now" / "5m ago" / "2h ago" / "3d ago".
export function timeAgo(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Formats a Date as "YYYY-MM-DDTHH:mm" in Arizona time (UTC-7, no DST).
// Used to seed the schedule-time input in the Push-to-eBay modal.
export function toArizonaLocalISO(date: Date): string {
  const az = new Date(date.getTime() - 7 * 60 * 60 * 1000);
  return az.toISOString().slice(0, 16);
}

// Standard eBay condition options for the push-modal dropdown. Lives here
// so the modal and any future test fixtures share the same list.
export const EBAY_CONDITIONS = [
  { id: '1000', label: 'New' },
  { id: '1500', label: 'New Other (open box)' },
  { id: '2000', label: 'Certified Refurbished' },
  { id: '2500', label: 'Seller Refurbished' },
  { id: '3000', label: 'Used' },
  { id: '4000', label: 'Very Good' },
  { id: '5000', label: 'Good' },
  { id: '6000', label: 'Acceptable' },
  { id: '7000', label: 'For Parts / Not Working' },
] as const;

export type SortOption = 'date-desc' | 'date-asc' | 'price-asc' | 'price-desc' | 'title-asc' | 'health-asc';

// Sort comparator for staged listings. Centralizes the score-aware
// 'health-asc' branch so the hook + future tests can share it.
export function compareStaged(a: StagedListing, b: StagedListing, sortBy: SortOption): number {
  if (sortBy === 'date-asc') return a.createdAt - b.createdAt;
  if (sortBy === 'date-desc') return b.createdAt - a.createdAt;
  if (sortBy === 'price-asc') return parseFloat(a.priceRecommendation || '0') - parseFloat(b.priceRecommendation || '0');
  if (sortBy === 'price-desc') return parseFloat(b.priceRecommendation || '0') - parseFloat(a.priceRecommendation || '0');
  if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
  if (sortBy === 'health-asc') return computeHealthScore(a).score - computeHealthScore(b).score;
  return 0;
}

// Standard search predicate for staged listings: matches title, SKU, or category.
export function matchesStagedQuery(listing: StagedListing, q: string): boolean {
  if (!q) return true;
  if (listing.title.toLowerCase().includes(q)) return true;
  if ((listing.sku || '').toLowerCase().includes(q)) return true;
  if ((listing.category || '').toLowerCase().includes(q)) return true;
  return false;
}
