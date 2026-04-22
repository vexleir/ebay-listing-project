// Pure STR / margin math for the Sourcing Research workflow.
// No React here — keep JSX in the component and the logic testable.

export type StrTier = 'green' | 'yellow' | 'red';

export interface StrVerdict {
  tier: StrTier;
  label: string;         // "Source it" / "Proceed with caution" / "Avoid"
  headline: string;      // one-line explanation
  estTurnoverDays: string; // rough range, e.g. "~3–5 days avg turnover"
}

// STR tiers per the sourcing playbook: 50%+ is a clear buy, 25–49% needs margin,
// below 25% is a capital trap.
export function getStrVerdict(strPct: number): StrVerdict {
  if (!isFinite(strPct) || strPct < 0) {
    return { tier: 'red', label: 'Avoid', headline: 'Invalid STR.', estTurnoverDays: '—' };
  }
  if (strPct >= 50) {
    return {
      tier: 'green',
      label: 'Source it',
      headline: 'High velocity — strong demand, safe to buy at target price.',
      estTurnoverDays: strPct >= 75 ? '~2–4 days avg turnover' : '~3–7 days avg turnover',
    };
  }
  if (strPct >= 25) {
    return {
      tier: 'yellow',
      label: 'Proceed with caution',
      headline: 'Moderate velocity — only move forward with a strong margin.',
      estTurnoverDays: '~2–4 weeks avg turnover',
    };
  }
  return {
    tier: 'red',
    label: 'Avoid',
    headline: 'Slow mover — capital risk, pass unless the margin is exceptional.',
    estTurnoverDays: '1+ month avg turnover',
  };
}

export type SupplyPressure = 'supply-constrained' | 'balanced' | 'oversupplied';

export interface SupplyDemand {
  ratio: number | null;     // sold / active
  pressure: SupplyPressure;
  note: string;
}

// Sold (last 30d) vs active listings. sold > active => supply-constrained / buying opportunity.
export function getSupplyDemand(sold: number, active: number): SupplyDemand {
  if (active <= 0) {
    return {
      ratio: null,
      pressure: 'supply-constrained',
      note: 'No active listings — demand with no supply. Strong buying opportunity if it sells elsewhere.',
    };
  }
  const ratio = sold / active;
  if (ratio >= 1) {
    return {
      ratio,
      pressure: 'supply-constrained',
      note: 'Sold > active — supply-constrained. Buying opportunity: new listings get absorbed fast.',
    };
  }
  if (ratio >= 0.5) {
    return { ratio, pressure: 'balanced', note: 'Healthy balance between sold and active listings.' };
  }
  return { ratio, pressure: 'oversupplied', note: 'Oversupplied — many listings chasing few buyers. Expect price pressure.' };
}

export const EBAY_FEE_PCT = 0.13;      // simplified FVF used for the research estimate
export const SHIPPING_COST = 4;        // flat $4 label estimate

export interface CostBasisResult {
  grossMargin: number;        // avg sold - max buy
  netMargin: number;          // after fees + shipping
  netMarginPct: number | null; // relative to avg sold price
  tier: StrTier;              // green / yellow / red health indicator
}

// ~13% fees + $4 shipping per task spec. Tier thresholds based on net margin %:
// >=35% net = green, 15–35% = yellow, <15% = red.
export function calcCostBasis(avgSoldPrice: number, maxBuyPrice: number): CostBasisResult {
  const grossMargin = avgSoldPrice - maxBuyPrice;
  const fees = avgSoldPrice * EBAY_FEE_PCT;
  const netMargin = grossMargin - fees - SHIPPING_COST;
  const netMarginPct = avgSoldPrice > 0 ? (netMargin / avgSoldPrice) * 100 : null;

  let tier: StrTier = 'red';
  if (netMarginPct !== null) {
    if (netMarginPct >= 35) tier = 'green';
    else if (netMarginPct >= 15) tier = 'yellow';
  }
  return { grossMargin, netMargin, netMarginPct, tier };
}

// Build a saved-search query string from the item name + optional condition.
// Keep it minimal — extra filters are applied per-platform inside the instructions.
export function buildSearchQuery(itemName: string, condition?: string): string {
  const base = itemName.trim();
  if (!base) return '';
  const c = (condition || '').trim();
  return c ? `${base} ${c}` : base;
}

export const TIER_COLORS: Record<StrTier, { fg: string; bg: string; border: string }> = {
  green:  { fg: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)' },
  yellow: { fg: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' },
  red:    { fg: '#ef4444', bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.4)' },
};
