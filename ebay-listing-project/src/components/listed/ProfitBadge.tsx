import { calculateNetProfit } from '../../utils/fees';

export interface ProfitBadgeProps {
  price: string;
  costBasis?: string;
  category?: string;
  shippingLabelCost?: string;
}

export default function ProfitBadge({ price, costBasis, category, shippingLabelCost }: ProfitBadgeProps) {
  if (!costBasis) return null;
  const net = calculateNetProfit(price, costBasis, category || '', shippingLabelCost);
  if (!net.salePrice || !net.costBasis) return null;

  const color = net.netProfit >= 0 ? 'var(--success)' : '#ef4444';
  const bg = net.netProfit >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
  const pct = net.netMarginPct !== null ? `${net.netMarginPct.toFixed(0)}%` : '';

  return (
    <span
      title={`Gross: $${net.grossProfit.toFixed(2)} · eBay fees: $${(net.ebayFee + net.transactionFee).toFixed(2)}${net.shippingCost > 0 ? ` · Shipping: $${net.shippingCost.toFixed(2)}` : ''}`}
      style={{ fontSize: '0.78rem', background: bg, color, padding: '2px 8px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'help' }}
    >
      Net {net.netProfit >= 0 ? '+' : ''}${net.netProfit.toFixed(2)}{pct ? ` (${pct})` : ''}
    </span>
  );
}
