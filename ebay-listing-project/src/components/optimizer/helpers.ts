// FE-003 — pure helpers extracted from ListingOptimizer.tsx. Kept free of
// React/DOM imports so they're trivially testable and reusable from any
// optimizer subcomponent.

export function extractItemId(url: string): string | null {
  const trimmed = url.trim();
  if (/^\d{12,}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/\/itm\/(?:[^/]+\/)?(\d{12,})/);
  if (m) return m[1];
  const p = trimmed.match(/[?&](?:item|ItemID)=(\d{12,})/i);
  if (p) return p[1];
  return null;
}

export function gradeColor(grade: string): string {
  if (grade === 'A') return '#10b981';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#f59e0b';
  if (grade === 'D') return '#f97316';
  return '#ef4444';
}

export function scoreBarColor(pct: number): string {
  if (pct >= 80) return '#10b981';
  if (pct >= 60) return '#3b82f6';
  if (pct >= 40) return '#f59e0b';
  return '#ef4444';
}

export function formatOptimizerDate(iso: string): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}

// Median of a numeric array. Returns null for arrays smaller than `minSize`
// so the caller can decide whether to surface the price hint at all.
export function compMedian(prices: number[], minSize = 3): number | null {
  const arr = prices.filter((p) => p > 0);
  if (arr.length < minSize) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}
