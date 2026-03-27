// eBay final value fee rates by category keyword (as of 2024)
// Source: https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees
const FEE_RULES: { keywords: string[]; rate: number }[] = [
  { keywords: ['clothing', 'shoes', 'apparel', 'fashion', 'dress', 'shirt', 'pants', 'jacket', 'coat', 'sneaker', 'boot', 'hat', 'bag', 'purse', 'handbag', 'accessories'], rate: 0.15 },
  { keywords: ['book', 'dvd', 'blu-ray', 'blu ray', 'music', 'vinyl', 'record', 'movie', 'video game', 'game'], rate: 0.1495 },
  { keywords: ['coin', 'stamp', 'currency', 'paper money', 'bullion', 'collectible currency'], rate: 0.065 },
  { keywords: ['guitar', 'piano', 'instrument', 'keyboard', 'drum', 'bass', 'violin', 'trumpet', 'musical'], rate: 0.075 },
  { keywords: ['auto part', 'motor part', 'car part', 'truck part', 'motorcycle part', 'vehicle part', 'ebay motors'], rate: 0.12 },
];

const DEFAULT_RATE = 0.1325; // most eBay categories
const TRANSACTION_FEE = 0.30;  // per-order fixed fee

export function getEbayFeeRate(category: string): number {
  const lower = (category || '').toLowerCase();
  for (const { keywords, rate } of FEE_RULES) {
    if (keywords.some(kw => lower.includes(kw))) return rate;
  }
  return DEFAULT_RATE;
}

export interface NetProfitResult {
  salePrice: number;
  costBasis: number;
  ebayFee: number;
  transactionFee: number;
  shippingCost: number;
  promotedFee: number;
  totalFees: number;
  grossProfit: number;
  netProfit: number;
  netMarginPct: number | null; // null if no cost basis
  feeRate: number;
}

function parseAmt(val: string | undefined): number {
  if (!val) return 0;
  const m = val.replace(/[^0-9.]/g, '');
  return m ? parseFloat(m) : 0;
}

export function calculateNetProfit(
  priceStr: string | undefined,
  costBasisStr: string | undefined,
  category: string,
  shippingLabelCostStr: string | undefined,
  promotedPct = 0
): NetProfitResult {
  const salePrice = parseAmt(priceStr);
  const costBasis = parseAmt(costBasisStr);
  const shippingCost = parseAmt(shippingLabelCostStr);

  const feeRate = getEbayFeeRate(category);
  const ebayFee = salePrice * feeRate;
  const transactionFee = salePrice > 0 ? TRANSACTION_FEE : 0;
  const promotedFee = salePrice * (promotedPct / 100);
  const totalFees = ebayFee + transactionFee + promotedFee + shippingCost;

  const grossProfit = salePrice - costBasis;
  const netProfit = salePrice - costBasis - totalFees;
  const netMarginPct = costBasis > 0 ? (netProfit / costBasis) * 100 : null;

  return {
    salePrice, costBasis, ebayFee, transactionFee,
    shippingCost, promotedFee, totalFees,
    grossProfit, netProfit, netMarginPct, feeRate,
  };
}
