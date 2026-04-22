import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  Telescope, CheckCircle2, AlertTriangle, XCircle, ArrowRight, ArrowLeft,
  TrendingUp, DollarSign, Bell, Copy, Check, ExternalLink, PlusCircle,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  getStrVerdict, getSupplyDemand, calcCostBasis, buildSearchQuery,
  TIER_COLORS, EBAY_FEE_PCT, SHIPPING_COST,
} from '../utils/sourcingUtils';
import type { StrTier } from '../utils/sourcingUtils';

interface SourcingResearchProps {
  onBuildListing: (itemName: string) => void;
}

interface ItemInfo {
  name: string;
  category: string;
  notes: string;
}

interface TerapeakData {
  strPct: string;
  avgSoldPrice: string;
  totalSold: string;
  activeListings: string;
}

type Platform = 'ebay' | 'mercari' | 'goodwill';

const STEP_LABELS = ['Item Info', 'Terapeak Data', 'STR Verdict', 'Cost Basis'];

const TIER_ICON: Record<StrTier, ReactElement> = {
  green:  <CheckCircle2 size={28} />,
  yellow: <AlertTriangle size={28} />,
  red:    <XCircle size={28} />,
};

function parseNum(s: string): number {
  const n = parseFloat((s || '').replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

export default function SourcingResearch({ onBuildListing }: SourcingResearchProps) {
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [item, setItem] = useState<ItemInfo>({ name: '', category: '', notes: '' });
  const [tp, setTp] = useState<TerapeakData>({ strPct: '', avgSoldPrice: '', totalSold: '', activeListings: '' });
  const [maxBuy, setMaxBuy] = useState('');

  const [showAlerts, setShowAlerts] = useState(false);
  const [alertsSetUp, setAlertsSetUp] = useState<Record<Platform, boolean>>({ ebay: false, mercari: false, goodwill: false });
  const [copied, setCopied] = useState<Platform | null>(null);

  const str = parseNum(tp.strPct);
  const avgSold = parseNum(tp.avgSoldPrice);
  const sold30 = parseNum(tp.totalSold);
  const active = parseNum(tp.activeListings);
  const maxBuyNum = parseNum(maxBuy);

  const verdict = useMemo(() => getStrVerdict(str), [str]);
  const supply = useMemo(() => getSupplyDemand(sold30, active), [sold30, active]);
  const cost = useMemo(() => calcCostBasis(avgSold, maxBuyNum), [avgSold, maxBuyNum]);

  const canAdvance = (from: number): boolean => {
    if (from === 1) return item.name.trim().length > 0;
    if (from === 2) return tp.strPct !== '' && tp.avgSoldPrice !== '';
    return true;
  };

  const query = buildSearchQuery(item.name, item.notes);

  const copyQuery = async (platform: Platform) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopied(platform);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast('Copy failed — select the text manually.', 'error');
    }
  };

  const goNext = () => {
    if (!canAdvance(step)) {
      toast('Fill in the required fields before continuing.', 'error');
      return;
    }
    setStep(s => Math.min(4, s + 1));
  };
  const goBack = () => setStep(s => Math.max(1, s - 1));

  const resetWorkflow = () => {
    setStep(1);
    setItem({ name: '', category: '', notes: '' });
    setTp({ strPct: '', avgSoldPrice: '', totalSold: '', activeListings: '' });
    setMaxBuy('');
    setShowAlerts(false);
    setAlertsSetUp({ ebay: false, mercari: false, goodwill: false });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      <div>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Telescope size={24} className="text-gradient" /> Sourcing Research
        </h2>
        <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          Feed Terapeak numbers into a four-step STR workflow, then generate saved-search alerts across eBay, Mercari, and GoodwillFinds.
        </p>
      </div>

      {/* Stepper */}
      <div className="glass-panel" style={{ padding: '0.9rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {STEP_LABELS.map((label, idx) => {
          const n = idx + 1;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <button
                onClick={() => { if (done) setStep(n); }}
                disabled={!done && !active}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: active ? 'var(--accent-color)' : done ? 'rgba(16,185,129,0.15)' : 'transparent',
                  color: active ? 'white' : done ? 'var(--success)' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--accent-color)' : done ? 'rgba(16,185,129,0.4)' : 'var(--border-color)'}`,
                  padding: '6px 12px', borderRadius: '999px',
                  fontSize: '0.82rem', fontWeight: 600,
                  cursor: done ? 'pointer' : 'default',
                }}
              >
                <span style={{
                  width: '20px', height: '20px', borderRadius: '50%',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? 'rgba(255,255,255,0.2)' : done ? 'var(--success)' : 'var(--border-color)',
                  color: active || done ? 'white' : 'var(--text-secondary)',
                  fontSize: '0.72rem', fontWeight: 700,
                }}>{done ? <Check size={12} /> : n}</span>
                {label}
              </button>
              {n < STEP_LABELS.length && (
                <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>›</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1 — Item Info */}
      {step === 1 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ margin: 0 }}>Step 1 — Item Info</h3>
          <Field label="Item name / keyword" required>
            <input
              className="input-base"
              value={item.name}
              onChange={e => setItem({ ...item, name: e.target.value })}
              placeholder="e.g. Nike Air Max 90 size 10"
            />
          </Field>
          <Field label="eBay category">
            <input
              className="input-base"
              value={item.category}
              onChange={e => setItem({ ...item, category: e.target.value })}
              placeholder="e.g. Athletic Shoes > Men's Sneakers"
            />
          </Field>
          <Field label="Notes (condition, variant, etc.)">
            <textarea
              className="input-base"
              value={item.notes}
              onChange={e => setItem({ ...item, notes: e.target.value })}
              placeholder="e.g. Pre-owned, no box, size 10"
              rows={3}
            />
          </Field>
        </div>
      )}

      {/* Step 2 — Terapeak Data */}
      {step === 2 && (
        <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Step 2 — Terapeak Data</h3>
            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Open Terapeak in your eBay Seller Hub and enter the values you see for this item below.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Sell-Through Rate — from Terapeak" suffix="%" required>
              <input
                className="input-base"
                type="number"
                inputMode="decimal"
                value={tp.strPct}
                onChange={e => setTp({ ...tp, strPct: e.target.value })}
                placeholder="e.g. 65"
              />
            </Field>
            <Field label="Average sold price" prefix="$" required>
              <input
                className="input-base"
                type="number"
                inputMode="decimal"
                value={tp.avgSoldPrice}
                onChange={e => setTp({ ...tp, avgSoldPrice: e.target.value })}
                placeholder="e.g. 85.00"
              />
            </Field>
            <Field label="Total sold (last 30 days)">
              <input
                className="input-base"
                type="number"
                inputMode="numeric"
                value={tp.totalSold}
                onChange={e => setTp({ ...tp, totalSold: e.target.value })}
                placeholder="e.g. 42"
              />
            </Field>
            <Field label="Active listings count">
              <input
                className="input-base"
                type="number"
                inputMode="numeric"
                value={tp.activeListings}
                onChange={e => setTp({ ...tp, activeListings: e.target.value })}
                placeholder="e.g. 30"
              />
            </Field>
          </div>
        </div>
      )}

      {/* Step 3 — STR Verdict */}
      {step === 3 && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <VerdictBanner tier={verdict.tier} label={verdict.label} headline={verdict.headline} strPct={str} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <TrendingUp size={15} /> Velocity
              </h4>
              <Row label="STR" value={`${str.toFixed(1)}%`} />
              <Row label="Est. sell time" value={verdict.estTurnoverDays} />
              <Row label="Avg sold price" value={avgSold > 0 ? `$${avgSold.toFixed(2)}` : '—'} />
            </div>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <DollarSign size={15} /> Supply / Demand
              </h4>
              <Row label="Sold (30d)" value={sold30.toString()} />
              <Row label="Active" value={active.toString()} />
              <Row
                label="Sold / active"
                value={supply.ratio !== null ? supply.ratio.toFixed(2) : '∞'}
                valueColor={supply.pressure === 'supply-constrained' ? 'var(--success)' : supply.pressure === 'oversupplied' ? '#ef4444' : undefined}
              />
              <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {supply.note}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Step 4 — Cost Basis */}
      {step === 4 && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0 }}>Step 4 — Cost Basis</h3>
            <Field label="Your max buy price" prefix="$">
              <input
                className="input-base"
                type="number"
                inputMode="decimal"
                value={maxBuy}
                onChange={e => setMaxBuy(e.target.value)}
                placeholder="e.g. 25.00"
              />
            </Field>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>Per-Unit Margin</h4>
              <Row label="Avg sold price" value={avgSold > 0 ? `$${avgSold.toFixed(2)}` : '—'} />
              <Row label="Max buy" value={maxBuyNum > 0 ? `-$${maxBuyNum.toFixed(2)}` : '—'} />
              <Row label="Gross margin" value={maxBuyNum > 0 ? `$${cost.grossMargin.toFixed(2)}` : '—'} valueColor="var(--success)" bold />
            </div>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem' }}>After Fees + Shipping</h4>
              <Row label={`eBay fees (~${Math.round(EBAY_FEE_PCT * 100)}%)`} value={avgSold > 0 ? `-$${(avgSold * EBAY_FEE_PCT).toFixed(2)}` : '—'} valueColor="#f59e0b" />
              <Row label="Shipping" value={`-$${SHIPPING_COST.toFixed(2)}`} valueColor="#f59e0b" />
              <Row label="Net margin" value={maxBuyNum > 0 ? `$${cost.netMargin.toFixed(2)}` : '—'} valueColor={cost.netMargin >= 0 ? 'var(--success)' : '#ef4444'} bold />
              {cost.netMarginPct !== null && maxBuyNum > 0 && (
                <Row label="Net margin %" value={`${cost.netMarginPct.toFixed(1)}%`} valueColor={TIER_COLORS[cost.tier].fg} bold />
              )}
            </div>
          </div>

          {maxBuyNum > 0 && avgSold > 0 && (
            <div style={{
              padding: '0.9rem 1.25rem',
              background: TIER_COLORS[cost.tier].bg,
              border: `1px solid ${TIER_COLORS[cost.tier].border}`,
              borderRadius: '10px',
              color: TIER_COLORS[cost.tier].fg,
              fontWeight: 600,
              fontSize: '0.9rem',
              display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              {TIER_ICON[cost.tier]}
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                {cost.tier === 'green' && 'Healthy margin — source at or below your max buy.'}
                {cost.tier === 'yellow' && 'Thin margin — only source if you can negotiate the buy price down.'}
                {cost.tier === 'red' && 'Unhealthy margin — you will lose money at this buy price.'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Step nav */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <button className="btn-secondary" onClick={goBack} disabled={step === 1}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: step === 1 ? 0.5 : 1 }}>
          <ArrowLeft size={15} /> Back
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {step === 4 ? (
            <button className="btn-secondary" onClick={resetWorkflow}>Start over</button>
          ) : null}
          {step < 4 && (
            <button className="btn-primary" onClick={goNext} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              Next <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Alert generator */}
      {step === 4 && (
        <>
          <div style={{ marginTop: '1rem' }}>
            {!showAlerts ? (
              <button
                className="btn-primary"
                onClick={() => {
                  if (!query) { toast('Add an item name first (Step 1).', 'error'); return; }
                  setShowAlerts(true);
                }}
                style={{ width: '100%', padding: '14px', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <Bell size={18} /> Generate Sourcing Alerts
              </button>
            ) : (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bell size={20} className="text-gradient" /> Saved-Search Setup
                </h3>

                <PlatformPanel
                  platform="ebay"
                  title="eBay"
                  query={query}
                  copied={copied === 'ebay'}
                  onCopy={() => copyQuery('ebay')}
                  done={alertsSetUp.ebay}
                  onToggle={() => setAlertsSetUp(s => ({ ...s, ebay: !s.ebay }))}
                  externalUrl={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&_sop=10&LH_BIN=1`}
                  externalLabel="Open eBay search"
                  steps={[
                    `Go to the eBay search results for "${query}".`,
                    'Under Buying Format, check Buy It Now and enable Best Offer.',
                    item.notes ? `Apply the condition filter matching your notes ("${item.notes}").` : 'Apply the condition filter that matches your target.',
                    maxBuyNum > 0 ? `Set a max price filter around $${(maxBuyNum * 3).toFixed(2)} (~3× max buy).` : 'Set a max price filter at ~3× your max buy as a ceiling.',
                    'Sort by Newly Listed.',
                    'Click "Save this search" and set notifications to Daily or Immediately.',
                    'eBay will email or notify you when new matches are listed.',
                  ]}
                />

                <PlatformPanel
                  platform="mercari"
                  title="Mercari"
                  query={query}
                  copied={copied === 'mercari'}
                  onCopy={() => copyQuery('mercari')}
                  done={alertsSetUp.mercari}
                  onToggle={() => setAlertsSetUp(s => ({ ...s, mercari: !s.mercari }))}
                  externalUrl={`https://www.mercari.com/search/?keyword=${encodeURIComponent(query)}&sortBy=2&itemStatuses=1`}
                  externalLabel="Open Mercari search"
                  steps={[
                    `Search "${query}" on Mercari.`,
                    'Apply Item Status: On Sale.',
                    'Leave the condition filter broad — Mercari sellers often mislabel conditions.',
                    maxBuyNum > 0 ? `Set a max price around $${(maxBuyNum * 2.5).toFixed(2)} (~2.5× max buy).` : 'Set a max price filter at ~2.5× your max buy.',
                    'Sort by Just Listed.',
                    'Tap the bookmark / heart icon to save — Mercari sends push notifications for new listings.',
                    'Check saved searches daily; Mercari moves fast.',
                  ]}
                />

                <PlatformPanel
                  platform="goodwill"
                  title="GoodwillFinds"
                  query={query}
                  copied={copied === 'goodwill'}
                  onCopy={() => copyQuery('goodwill')}
                  done={alertsSetUp.goodwill}
                  onToggle={() => setAlertsSetUp(s => ({ ...s, goodwill: !s.goodwill }))}
                  externalUrl={`https://www.goodwillfinds.com/search/?q=${encodeURIComponent(query)}`}
                  externalLabel="Open GoodwillFinds search"
                  steps={[
                    `Search "${query}" on goodwillfinds.com.`,
                    item.category ? `Filter by category if available (closest to "${item.category}").` : 'Filter by category if available.',
                    maxBuyNum > 0 ? `Set a max price around $${(maxBuyNum * 1.5).toFixed(2)} (~1.5× max buy — pricing is inconsistent).` : 'Set a max price at ~1.5× your max buy — Goodwill pricing is inconsistent.',
                    'Sort by Newly Listed.',
                    'Create a free account and save the search, or bookmark the filtered URL.',
                    'Check 2–3× per week manually — no reliable push alerts.',
                    'Watch for lots — Goodwill bundles items without knowing individual values; condition descriptions are inconsistent.',
                  ]}
                />
              </div>
            )}
          </div>

          {/* Hand-off CTA */}
          <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>Sourced this one?</p>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Jump to the listing generator with the item name pre-filled.
              </p>
            </div>
            <button
              className="btn-primary"
              onClick={() => {
                if (!item.name.trim()) { toast('Enter an item name first (Step 1).', 'error'); return; }
                onBuildListing(item.name.trim());
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 18px', whiteSpace: 'nowrap' }}
            >
              <PlusCircle size={16} /> I sourced this item — build the listing
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- small presentational helpers ----------

function Field({
  label, required, prefix, suffix, children,
}: { label: string; required?: boolean; prefix?: string; suffix?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {prefix && <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{prefix}</span>}
        <div style={{ flex: 1 }}>{children}</div>
        {suffix && <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{suffix}</span>}
      </div>
    </label>
  );
}

function Row({
  label, value, valueColor, bold,
}: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '3px 0' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <strong style={{ color: valueColor || 'var(--text-primary)', fontWeight: bold ? 700 : 500 }}>{value}</strong>
    </div>
  );
}

function VerdictBanner({ tier, label, headline, strPct }: { tier: StrTier; label: string; headline: string; strPct: number }) {
  const c = TIER_COLORS[tier];
  return (
    <div style={{
      padding: '1.25rem 1.5rem',
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: '12px',
      display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: c.fg, flexShrink: 0 }}>
        {TIER_ICON[tier]}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1 }}>{label.toUpperCase()}</span>
          <span style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '2px' }}>STR {strPct.toFixed(1)}%</span>
        </div>
      </div>
      <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-primary)', flex: 1 }}>{headline}</p>
    </div>
  );
}

function PlatformPanel({
  title, query, steps, done, onToggle, onCopy, copied, externalUrl, externalLabel,
}: {
  platform: Platform;
  title: string;
  query: string;
  steps: string[];
  done: boolean;
  onToggle: () => void;
  onCopy: () => void;
  copied: boolean;
  externalUrl: string;
  externalLabel: string;
}) {
  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.25rem',
        borderLeft: done ? '3px solid var(--success)' : '3px solid var(--border-color)',
        opacity: done ? 0.85 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h4 style={{ margin: 0, fontSize: '1rem' }}>{title}</h4>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: done ? 'var(--success)' : 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={done} onChange={onToggle} style={{ accentColor: 'var(--success)' }} />
          Mark as set up
        </label>
      </div>

      {/* Query + copy */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <code style={{
          flex: 1, minWidth: '180px',
          padding: '6px 10px', background: 'rgba(0,0,0,0.25)',
          border: '1px solid var(--border-color)', borderRadius: '6px',
          fontSize: '0.82rem', color: 'var(--text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{query || '(enter an item name in Step 1)'}</code>
        <button
          className="btn-secondary"
          onClick={onCopy}
          disabled={!query}
          title="Copy query"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.82rem' }}
        >
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
        </button>
        <a
          href={externalUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', fontSize: '0.82rem', textDecoration: 'none' }}
        >
          <ExternalLink size={14} /> {externalLabel}
        </a>
      </div>

      {/* Steps */}
      <ol style={{ margin: '0.85rem 0 0 0', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
        {steps.map((s, i) => (<li key={i}>{s}</li>))}
      </ol>
    </div>
  );
}
