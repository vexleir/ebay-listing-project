import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Search, Zap, CheckCircle, XCircle, AlertTriangle, Info,
  ExternalLink, RefreshCw, ChevronDown, ChevronUp, Eye,
  ArrowRight, Loader, Tag, Image, FileText, DollarSign, Truck, Star,
} from 'lucide-react';
import { computeOptimizerScore, type ListingScore, type CategorySpecific } from '../utils/listingScore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FetchedListing {
  itemId: string;
  isOwner: boolean;
  sellerUserId: string;
  title: string;
  categoryId: string;
  categoryName: string;
  price: number;
  conditionId: string;
  conditionName: string;
  description: string;
  watchCount: number;
  hitCount: number;
  listingStatus: string;
  timeLeft: string;
  quantity: number;
  quantitySold: number;
  sku: string;
  shippingType: string;
  shippingServiceCost: string;
  itemSpecifics: Record<string, string>;
  images: string[];
  categorySpecifics: CategorySpecific[];
}

interface SoldComp {
  title: string;
  price: number;
  currency: string;
  condition: string;
  endDate: string;
  url: string;
  image: string;
}

interface AISuggestions {
  title: string;
  titleRationale: string;
  description: string;
  descriptionRationale: string;
  itemSpecifics: Record<string, string>;
  itemSpecificsRationale: string;
  priceRecommendation: string;
  priceRationale: string;
  seoKeywords: string[];
  seoIssues: string[];
  overallTips: string[];
}

interface SpecificRow { name: string; value: string; }

interface Props {
  appPassword: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractItemId(url: string): string | null {
  const trimmed = url.trim();
  // Pure numeric ID
  if (/^\d{12,}$/.test(trimmed)) return trimmed;
  // eBay URL: /itm/TITLE/ITEMID  or  /itm/ITEMID
  const m = trimmed.match(/\/itm\/(?:[^/]+\/)?(\d{12,})/);
  if (m) return m[1];
  // ebay.com?item=xxx or ?_trkparms
  const p = trimmed.match(/[?&](?:item|ItemID)=(\d{12,})/i);
  if (p) return p[1];
  return null;
}

function gradeColor(grade: string): string {
  if (grade === 'A') return '#10b981';
  if (grade === 'B') return '#3b82f6';
  if (grade === 'C') return '#f59e0b';
  if (grade === 'D') return '#f97316';
  return '#ef4444';
}

function scoreBarColor(pct: number): string {
  if (pct >= 80) return '#10b981';
  if (pct >= 60) return '#3b82f6';
  if (pct >= 40) return '#f59e0b';
  return '#ef4444';
}

function formatDate(iso: string): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
}

const categoryIcon = (key: string) => {
  if (key === 'titleSeo') return <Tag size={16} />;
  if (key === 'itemSpecifics') return <FileText size={16} />;
  if (key === 'images') return <Image size={16} />;
  if (key === 'description') return <FileText size={16} />;
  if (key === 'pricing') return <DollarSign size={16} />;
  if (key === 'shipping') return <Truck size={16} />;
  return <Info size={16} />;
};

// ─── Score Card ───────────────────────────────────────────────────────────────

function ScoreCard({
  catKey, cat, expanded, onToggle,
}: {
  catKey: string;
  cat: ListingScore['categories'][keyof ListingScore['categories']];
  expanded: boolean;
  onToggle: () => void;
}) {
  const allFeedback = [...cat.issues, ...cat.tips];
  return (
    <div
      style={{
        background: 'var(--glass-bg)',
        border: `1px solid ${cat.issues.length > 0 ? 'rgba(239,68,68,0.3)' : 'var(--glass-border)'}`,
        borderRadius: '10px',
        overflow: 'hidden',
        cursor: allFeedback.length > 0 ? 'pointer' : 'default',
      }}
      onClick={allFeedback.length > 0 ? onToggle : undefined}
    >
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {categoryIcon(catKey)}
            {cat.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '1rem', fontWeight: 700, color: scoreBarColor(cat.pct) }}>
              {cat.pct}%
            </span>
            {allFeedback.length > 0 && (
              expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />
            )}
          </div>
        </div>
        {/* Score bar */}
        <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${cat.pct}%`, background: scoreBarColor(cat.pct), borderRadius: '3px', transition: 'width 0.6s ease' }} />
        </div>
        {cat.issues.length > 0 && !expanded && (
          <div style={{ marginTop: '6px', fontSize: '0.72rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle size={11} /> {cat.issues.length} issue{cat.issues.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
      {expanded && allFeedback.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-color)', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {cat.issues.map((issue, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.78rem', color: '#fca5a5' }}>
              <XCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {issue}
            </div>
          ))}
          {cat.tips.map((tip, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.78rem', color: '#93c5fd' }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {tip}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AI Field Suggestion ──────────────────────────────────────────────────────

function AiSuggestionBox({
  label, original, suggested, rationale, accepted,
  onAccept, onReject,
}: {
  label: string;
  original: string;
  suggested: string;
  rationale: string;
  accepted: boolean | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  if (accepted === true) {
    return (
      <div style={{ fontSize: '0.75rem', color: '#86efac', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
        <CheckCircle size={12} /> AI suggestion accepted
        <button onClick={onReject} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 6px' }}>Undo</button>
      </div>
    );
  }
  if (accepted === false) {
    return (
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
        <XCircle size={12} /> AI suggestion rejected
        <button onClick={onAccept} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem', padding: '2px 6px' }}>Undo</button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: '8px', padding: '10px 12px', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', fontSize: '0.8rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', color: '#c4b5fd', fontWeight: 600, fontSize: '0.75rem' }}>
        <Zap size={12} /> AI SUGGESTION for {label}
      </div>
      <div style={{ color: 'var(--text-primary)', marginBottom: '6px', lineHeight: 1.4 }}>{suggested}</div>
      {rationale && (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.73rem', fontStyle: 'italic', marginBottom: '8px' }}>{rationale}</div>
      )}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={onAccept} className="btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <CheckCircle size={12} /> Accept
        </button>
        <button onClick={onReject} className="btn-icon" style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#ef4444' }}>
          <XCircle size={12} /> Reject
        </button>
        <button onClick={() => setShowOriginal(s => !s)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.72rem', textDecoration: 'underline', padding: 0 }}>
          {showOriginal ? 'Hide' : 'Show'} original
        </button>
      </div>
      {showOriginal && (
        <div style={{ marginTop: '6px', padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', color: 'var(--text-secondary)', fontSize: '0.73rem' }}>
          Original: {original}
        </div>
      )}
    </div>
  );
}

// ─── Push Diff Modal ──────────────────────────────────────────────────────────

function PushDiffModal({
  listing, editTitle, editPrice, editDescription, editSpecifics, onConfirm, onClose, pushing,
}: {
  listing: FetchedListing;
  editTitle: string;
  editPrice: string;
  editDescription: string;
  editSpecifics: SpecificRow[];
  onConfirm: () => void;
  onClose: () => void;
  pushing: boolean;
}) {
  const changes: Array<{ field: string; before: string; after: string }> = [];

  if (editTitle !== listing.title) {
    changes.push({ field: 'Title', before: listing.title, after: editTitle });
  }
  if (editPrice !== String(listing.price)) {
    changes.push({ field: 'Price', before: `$${listing.price}`, after: `$${editPrice}` });
  }
  const descPlain = (listing.description || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120);
  const newDescPlain = (editDescription || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120);
  if (editDescription !== listing.description) {
    changes.push({ field: 'Description', before: descPlain + '...', after: newDescPlain + '...' });
  }
  // Specifics diff
  const originalSpecificsFlat = Object.entries(listing.itemSpecifics).map(([k, v]) => `${k}: ${v}`).join(', ');
  const newSpecificsFlat = editSpecifics.filter(s => s.name && s.value).map(s => `${s.name}: ${s.value}`).join(', ');
  if (originalSpecificsFlat !== newSpecificsFlat) {
    changes.push({ field: 'Item Specifics', before: originalSpecificsFlat || '(none)', after: newSpecificsFlat || '(none)' });
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '700px', maxHeight: '85vh', overflow: 'auto', padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Confirm Changes — Push to eBay</h3>
        {changes.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>No changes detected.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            {changes.map((c, i) => (
              <div key={i}>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.field}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', alignItems: 'start' }}>
                  <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', fontSize: '0.82rem', color: '#fca5a5', wordBreak: 'break-word' }}>{c.before}</div>
                  <div style={{ display: 'flex', alignItems: 'center', paddingTop: '8px' }}><ArrowRight size={16} style={{ color: 'var(--text-secondary)' }} /></div>
                  <div style={{ padding: '8px 10px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', fontSize: '0.82rem', color: '#86efac', wordBreak: 'break-word' }}>{c.after}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button className="btn-icon" onClick={onClose} disabled={pushing}>Cancel</button>
          <button
            className="btn-primary"
            onClick={onConfirm}
            disabled={pushing || changes.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {pushing ? <><Loader size={14} className="spin" /> Pushing…</> : <><CheckCircle size={14} /> Confirm & Push to eBay</>}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ListingOptimizer({ appPassword }: Props) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<'input' | 'loading' | 'analyze' | 'edit'>('input');
  const [error, setError] = useState('');
  const [listing, setListing] = useState<FetchedListing | null>(null);
  const [score, setScore] = useState<ListingScore | null>(null);
  const [soldComps, setSoldComps] = useState<SoldComp[]>([]);
  const [compsLoading, setCompsLoading] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null);
  const [aiError, setAiError] = useState('');

  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSpecifics, setEditSpecifics] = useState<SpecificRow[]>([]);

  // AI accept state (null = pending, true = accepted, false = rejected)
  const [acceptTitle, setAcceptTitle] = useState<boolean | null>(null);
  const [acceptPrice, setAcceptPrice] = useState<boolean | null>(null);
  const [acceptDesc, setAcceptDesc] = useState<boolean | null>(null);
  const [acceptSpecifics, setAcceptSpecifics] = useState<boolean | null>(null);

  // Push state
  const [showDiff, setShowDiff] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  const apiHeaders = (token: string) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` });
  const bearerHeaders = (token: string) => ({ 'Authorization': `Bearer ${token}` });

  // ── Fetch & analyze ─────────────────────────────────────────────────────────

  const handleFetch = async () => {
    const itemId = extractItemId(url);
    if (!itemId) {
      setError('Could not parse item ID from the URL. Please paste a full eBay listing URL or item number.');
      return;
    }
    setError('');
    setPhase('loading');
    setPushSuccess(false);
    try {
      const resp = await fetch(`/api/optimizer/fetch?itemId=${itemId}`, { headers: bearerHeaders(appPassword) });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Failed to fetch listing');

      setListing(data as FetchedListing);
      const initialScore = computeOptimizerScore(
        data.title, data.description, data.images, data.itemSpecifics,
        data.price, data.shippingType, data.shippingServiceCost, data.categorySpecifics,
      );
      setScore(initialScore);
      setSoldComps([]);
      setAiSuggestions(null);
      setAiError('');
      setPhase('analyze');

      // Fetch sold comps in background
      setCompsLoading(true);
      const keywords = data.title.split(/\s+/).slice(0, 6).join(' ');
      fetch(`/api/optimizer/comps?query=${encodeURIComponent(keywords)}&categoryId=${data.categoryId}`, { headers: bearerHeaders(appPassword) })
        .then(r => r.json())
        .then(d => {
          const comps: SoldComp[] = d.comps || [];
          setSoldComps(comps);
          // Re-score pricing with comp data
          if (comps.length >= 3) {
            const compPrices = comps.map(c => c.price).filter(p => p > 0);
            const rescored = computeOptimizerScore(
              data.title, data.description, data.images, data.itemSpecifics,
              data.price, data.shippingType, data.shippingServiceCost, data.categorySpecifics,
              compPrices,
            );
            setScore(rescored);
          }
        })
        .catch(() => {})
        .finally(() => setCompsLoading(false));
    } catch (e: any) {
      setError(e.message || 'Failed to fetch listing');
      setPhase('input');
    }
  };

  // ── Enter edit mode ──────────────────────────────────────────────────────────

  const enterEditMode = useCallback(() => {
    if (!listing) return;
    setEditTitle(listing.title);
    setEditPrice(String(listing.price));
    setEditDescription(listing.description);
    setEditSpecifics(
      Object.entries(listing.itemSpecifics).map(([name, value]) => ({ name, value }))
    );
    setAcceptTitle(null);
    setAcceptPrice(null);
    setAcceptDesc(null);
    setAcceptSpecifics(null);
    setPhase('edit');
  }, [listing]);

  // ── AI Optimize ──────────────────────────────────────────────────────────────

  const handleAiOptimize = async () => {
    if (!listing) return;
    setAiLoading(true);
    setAiError('');
    try {
      const resp = await fetch('/api/optimizer/ai-optimize', {
        method: 'POST',
        headers: apiHeaders(appPassword),
        body: JSON.stringify({ listingData: listing }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'AI optimization failed');
      setAiSuggestions(data as AISuggestions);
      // Enter edit mode if not already there
      if (phase !== 'edit') enterEditMode();
    } catch (e: any) {
      setAiError(e.message || 'AI optimization failed');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Accept/reject AI suggestions ────────────────────────────────────────────

  const acceptAiTitle = () => {
    if (aiSuggestions) { setEditTitle(aiSuggestions.title); setAcceptTitle(true); }
  };
  const rejectAiTitle = () => { setAcceptTitle(false); if (listing) setEditTitle(listing.title); };

  const acceptAiPrice = () => {
    if (aiSuggestions) { setEditPrice(aiSuggestions.priceRecommendation); setAcceptPrice(true); }
  };
  const rejectAiPrice = () => { setAcceptPrice(false); if (listing) setEditPrice(String(listing.price)); };

  const acceptAiDesc = () => {
    if (aiSuggestions) { setEditDescription(aiSuggestions.description); setAcceptDesc(true); }
  };
  const rejectAiDesc = () => { setAcceptDesc(false); if (listing) setEditDescription(listing.description); };

  const acceptAiSpecifics = () => {
    if (aiSuggestions) {
      setEditSpecifics(Object.entries(aiSuggestions.itemSpecifics).map(([name, value]) => ({ name, value: String(value) })));
      setAcceptSpecifics(true);
    }
  };
  const rejectAiSpecifics = () => {
    setAcceptSpecifics(false);
    if (listing) setEditSpecifics(Object.entries(listing.itemSpecifics).map(([name, value]) => ({ name, value })));
  };

  // ── Live score recompute during edit ────────────────────────────────────────

  const liveScore = (listing && phase === 'edit')
    ? computeOptimizerScore(
        editTitle,
        editDescription,
        listing.images,
        Object.fromEntries(editSpecifics.filter(s => s.name && s.value).map(s => [s.name, s.value])),
        parseFloat(editPrice) || listing.price,
        listing.shippingType,
        listing.shippingServiceCost,
        listing.categorySpecifics,
        soldComps.length >= 3 ? soldComps.map(c => c.price).filter(p => p > 0) : undefined,
      )
    : score;

  // ── Push to eBay ────────────────────────────────────────────────────────────

  const handlePush = async () => {
    if (!listing) return;
    setPushing(true);
    try {
      const specificsArray = editSpecifics.filter(s => s.name && s.value).map(s => ({ name: s.name, value: s.value }));
      const resp = await fetch('/api/ebay/revise', {
        method: 'POST',
        headers: apiHeaders(appPassword),
        body: JSON.stringify({
          itemId: listing.itemId,
          newTitle: editTitle !== listing.title ? editTitle : undefined,
          newPrice: editPrice !== String(listing.price) ? editPrice : undefined,
          description: editDescription !== listing.description ? editDescription : undefined,
          itemSpecifics: specificsArray,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) throw new Error(data.error || 'Push failed');
      setPushSuccess(true);
      setShowDiff(false);
      // Update local listing state to reflect pushed values
      setListing(prev => prev ? {
        ...prev,
        title: editTitle,
        price: parseFloat(editPrice) || prev.price,
        description: editDescription,
        itemSpecifics: Object.fromEntries(editSpecifics.filter(s => s.name && s.value).map(s => [s.name, s.value])),
      } : prev);
    } catch (e: any) {
      setError(e.message || 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  // ── Specifics editor helpers ─────────────────────────────────────────────────

  const updateSpecific = (i: number, field: 'name' | 'value', val: string) => {
    setEditSpecifics(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
  };
  const removeSpecific = (i: number) => setEditSpecifics(prev => prev.filter((_, idx) => idx !== i));
  const addSpecific = () => setEditSpecifics(prev => [...prev, { name: '', value: '' }]);

  // ── Render helpers ───────────────────────────────────────────────────────────

  const renderScoreGrid = (s: ListingScore) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
      {(Object.entries(s.categories) as [string, ListingScore['categories'][keyof ListingScore['categories']]][]).map(([key, cat]) => (
        <ScoreCard
          key={key} catKey={key} cat={cat}
          expanded={expandedCat === key}
          onToggle={() => setExpandedCat(expandedCat === key ? null : key)}
        />
      ))}
    </div>
  );

  const renderOverallScore = (s: ListingScore, compact = false) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '12px' : '20px' }}>
      <div style={{
        width: compact ? '56px' : '80px', height: compact ? '56px' : '80px',
        borderRadius: '50%',
        border: `${compact ? 4 : 6}px solid ${gradeColor(s.grade)}`,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: compact ? '1.1rem' : '1.5rem', fontWeight: 800, color: gradeColor(s.grade), lineHeight: 1 }}>{s.total}</span>
        <span style={{ fontSize: compact ? '0.6rem' : '0.72rem', color: 'var(--text-secondary)' }}>/100</span>
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: compact ? '1.1rem' : '1.4rem', fontWeight: 800, color: gradeColor(s.grade) }}>Grade {s.grade}</span>
          {pushSuccess && <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle size={12} /> Pushed to eBay</span>}
        </div>
        <span style={{ fontSize: compact ? '0.75rem' : '0.82rem', color: 'var(--text-secondary)' }}>Listing Health Score</span>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE: input
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'input' || phase === 'loading') {
    return (
      <div style={{ maxWidth: '620px', margin: '4rem auto', padding: '0 1rem' }}>
        <div className="glass-panel" style={{ padding: '2.5rem', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
            <Zap size={28} color="#fff" />
          </div>
          <h2 style={{ marginBottom: '0.5rem', fontSize: '1.4rem' }}>Listing Optimizer</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.75rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Enter any eBay listing URL to get a health score, SEO analysis, and AI-powered improvement suggestions.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
            <input
              type="text"
              className="input-base"
              placeholder="https://www.ebay.com/itm/123456789012 or item ID"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && url.trim() && phase === 'input' && handleFetch()}
              style={{ textAlign: 'left' }}
            />
            {error && (
              <div style={{ color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AlertTriangle size={13} /> {error}
              </div>
            )}
            <button
              className="btn-primary"
              onClick={handleFetch}
              disabled={!url.trim() || phase === 'loading'}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
            >
              {phase === 'loading' ? (
                <><Loader size={16} className="spin" /> Fetching listing…</>
              ) : (
                <><Search size={16} /> Analyze Listing</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE: analyze
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'analyze' && listing && liveScore) {
    const compPricesArr = soldComps.map(c => c.price).filter(p => p > 0);
    const compMedian = compPricesArr.length >= 3
      ? (() => {
          const s = [...compPricesArr].sort((a, b) => a - b);
          const m = Math.floor(s.length / 2);
          return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
        })()
      : null;

    return (
      <div>
        {showDiff && listing && (
          <PushDiffModal
            listing={listing} editTitle={editTitle} editPrice={editPrice}
            editDescription={editDescription} editSpecifics={editSpecifics}
            onConfirm={handlePush} onClose={() => setShowDiff(false)} pushing={pushing}
          />
        )}

        {/* Header */}
        <div className="glass-panel" style={{ padding: '1.25rem 1.5rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {renderOverallScore(liveScore)}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '2px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {listing.title}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span>{listing.categoryName}</span>
                <span>·</span>
                <span>${listing.price.toFixed(2)}</span>
                {listing.conditionName && <><span>·</span><span>{listing.conditionName}</span></>}
                {!listing.isOwner && (
                  <span style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <AlertTriangle size={11} /> Not your listing — analysis only
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0, flexWrap: 'wrap' }}>
              <a
                href={`https://www.ebay.com/itm/${listing.itemId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-icon"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 12px', textDecoration: 'none' }}
              >
                <ExternalLink size={14} /> View on eBay
              </a>
              <button
                className="btn-icon"
                onClick={() => { setPhase('input'); setUrl(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 12px' }}
              >
                <RefreshCw size={14} /> New Analysis
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
            {[
              { label: 'Watch Count', value: listing.watchCount },
              { label: 'Views', value: listing.hitCount },
              { label: 'Qty Sold', value: listing.quantitySold },
              { label: 'Status', value: listing.listingStatus },
              { label: 'Images', value: listing.images.length },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>{s.value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.25rem', alignItems: 'start' }}>
          {/* Left: scores + SEO */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Score grid */}
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Health Breakdown</h3>
              {renderScoreGrid(liveScore)}
            </div>

            {/* SEO Analysis */}
            {(liveScore.categories.titleSeo.issues.length > 0 || aiSuggestions?.seoIssues?.length) && (
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Search size={15} /> SEO Analysis
                </h3>
                {/* Title breakdown */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Title: <strong style={{ color: 'var(--text-primary)' }}>{listing.title.length}/80 characters</strong>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(listing.title.length / 80) * 100}%`, background: listing.title.length >= 75 ? '#10b981' : listing.title.length >= 55 ? '#f59e0b' : '#ef4444', borderRadius: '4px' }} />
                  </div>
                </div>
                {/* Title issues */}
                {liveScore.categories.titleSeo.issues.map((issue, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', marginBottom: '6px', color: '#fca5a5' }}>
                    <XCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {issue}
                  </div>
                ))}
                {liveScore.categories.titleSeo.tips.map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', marginBottom: '6px', color: '#93c5fd' }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {tip}
                  </div>
                ))}
                {/* AI SEO issues */}
                {aiSuggestions?.seoIssues?.map((issue, i) => (
                  <div key={`ai-${i}`} style={{ display: 'flex', gap: '8px', fontSize: '0.8rem', marginBottom: '6px', color: '#c4b5fd' }}>
                    <Zap size={13} style={{ flexShrink: 0, marginTop: '1px' }} /> {issue}
                  </div>
                ))}
                {/* AI keywords */}
                {(aiSuggestions?.seoKeywords?.length ?? 0) > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Top target keywords:</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {aiSuggestions!.seoKeywords.map((kw, i) => (
                        <span key={i} style={{ fontSize: '0.73rem', padding: '2px 8px', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px', color: '#c4b5fd' }}>{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI overall tips */}
            {(aiSuggestions?.overallTips?.length ?? 0) > 0 && (
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <h3 style={{ marginBottom: '0.75rem', fontSize: '0.95rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Star size={15} /> Optimization Tips
                </h3>
                {aiSuggestions!.overallTips.map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '0.82rem', marginBottom: '8px' }}>
                    <CheckCircle size={13} style={{ flexShrink: 0, marginTop: '2px', color: '#10b981' }} /> {tip}
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {aiError && (
                <div style={{ width: '100%', fontSize: '0.82rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={13} /> {aiError}
                </div>
              )}
              <button
                className="btn-primary"
                onClick={handleAiOptimize}
                disabled={aiLoading}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {aiLoading ? <><Loader size={15} className="spin" /> Optimizing with AI…</> : <><Zap size={15} /> Optimize with AI</>}
              </button>
              <button
                className="btn-icon"
                onClick={enterEditMode}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
              >
                <Eye size={15} /> Edit Manually
              </button>
            </div>
          </div>

          {/* Right: sold comps */}
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              Sold Comps {compsLoading && <Loader size={12} className="spin" style={{ display: 'inline', marginLeft: '6px' }} />}
            </h3>
            {compMedian !== null && (
              <div style={{ marginBottom: '1rem', padding: '8px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sold Median Price</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>${compMedian.toFixed(2)}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>from {soldComps.length} recent sales</div>
              </div>
            )}
            {soldComps.length === 0 && !compsLoading && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>No sold comps found.</div>
            )}
            {soldComps.slice(0, 8).map((comp, i) => (
              <a
                key={i}
                href={comp.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', gap: '8px', marginBottom: '8px', textDecoration: 'none', alignItems: 'center' }}
              >
                {comp.image ? (
                  <img src={comp.image} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comp.title}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{comp.condition} · {formatDate(comp.endDate)}</div>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#10b981', flexShrink: 0 }}>${comp.price.toFixed(2)}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PHASE: edit
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'edit' && listing && liveScore) {
    return (
      <div>
        {showDiff && (
          <PushDiffModal
            listing={listing} editTitle={editTitle} editPrice={editPrice}
            editDescription={editDescription} editSpecifics={editSpecifics}
            onConfirm={handlePush} onClose={() => setShowDiff(false)} pushing={pushing}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.25rem', alignItems: 'start' }}>
          {/* Left sidebar: live score */}
          <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              {renderOverallScore(liveScore, true)}
              <div style={{ marginTop: '1rem' }}>
                {renderScoreGrid(liveScore)}
              </div>
            </div>
            <button
              className="btn-icon"
              onClick={() => setPhase('analyze')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '8px 12px' }}
            >
              <ChevronUp size={14} /> Back to Analysis
            </button>
          </div>

          {/* Right: edit form */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>
                {listing.isOwner ? 'Edit & Optimize' : 'Preview Optimizations'}
                {!listing.isOwner && (
                  <span style={{ marginLeft: '8px', fontSize: '0.75rem', color: '#f59e0b', fontWeight: 400 }}>
                    (Read-only — not your listing)
                  </span>
                )}
              </h3>
              {aiSuggestions && (
                <span style={{ fontSize: '0.75rem', color: '#c4b5fd', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={12} /> AI suggestions available
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Title */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Title
                  <span style={{ marginLeft: '8px', fontWeight: 400, color: editTitle.length > 80 ? '#ef4444' : editTitle.length >= 75 ? '#10b981' : 'var(--text-secondary)' }}>
                    {editTitle.length}/80
                  </span>
                </label>
                <input
                  type="text"
                  className="input-base"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value.substring(0, 80))}
                  maxLength={80}
                  disabled={!listing.isOwner}
                />
                {aiSuggestions && (
                  <AiSuggestionBox
                    label="Title"
                    original={listing.title}
                    suggested={aiSuggestions.title}
                    rationale={aiSuggestions.titleRationale}
                    accepted={acceptTitle}
                    onAccept={acceptAiTitle}
                    onReject={rejectAiTitle}
                  />
                )}
              </div>

              {/* Price */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Price (USD)</label>
                <input
                  type="number"
                  className="input-base"
                  value={editPrice}
                  onChange={e => setEditPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  disabled={!listing.isOwner}
                  style={{ maxWidth: '180px' }}
                />
                {aiSuggestions && (
                  <AiSuggestionBox
                    label="Price"
                    original={`$${listing.price}`}
                    suggested={`$${aiSuggestions.priceRecommendation}`}
                    rationale={aiSuggestions.priceRationale}
                    accepted={acceptPrice}
                    onAccept={acceptAiPrice}
                    onReject={rejectAiPrice}
                  />
                )}
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Description (HTML)
                  <span style={{ marginLeft: '8px', fontWeight: 400, fontSize: '0.75rem' }}>
                    {editDescription.replace(/<[^>]+>/g, '').length} plain chars
                  </span>
                </label>
                <textarea
                  className="input-base"
                  value={editDescription}
                  onChange={e => setEditDescription(e.target.value)}
                  disabled={!listing.isOwner}
                  rows={8}
                  style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
                {aiSuggestions && (
                  <AiSuggestionBox
                    label="Description"
                    original={listing.description.replace(/<[^>]+>/g, ' ').substring(0, 80) + '...'}
                    suggested={aiSuggestions.description.replace(/<[^>]+>/g, ' ').substring(0, 120) + '...'}
                    rationale={aiSuggestions.descriptionRationale}
                    accepted={acceptDesc}
                    onAccept={acceptAiDesc}
                    onReject={rejectAiDesc}
                  />
                )}
              </div>

              {/* Item Specifics */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    Item Specifics ({editSpecifics.filter(s => s.name && s.value).length})
                  </label>
                  {listing.isOwner && (
                    <button className="btn-icon" onClick={addSpecific} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>+ Add</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
                  {editSpecifics.map((s, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', alignItems: 'center' }}>
                      <input
                        className="input-base"
                        value={s.name}
                        onChange={e => updateSpecific(i, 'name', e.target.value)}
                        placeholder="Name"
                        disabled={!listing.isOwner}
                        style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                      />
                      <input
                        className="input-base"
                        value={s.value}
                        onChange={e => updateSpecific(i, 'value', e.target.value)}
                        placeholder="Value"
                        disabled={!listing.isOwner}
                        style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                      />
                      {listing.isOwner && (
                        <button className="btn-icon" onClick={() => removeSpecific(i)} style={{ color: '#ef4444', padding: '4px 8px' }}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                {aiSuggestions && (
                  <AiSuggestionBox
                    label="Item Specifics"
                    original={`${Object.keys(listing.itemSpecifics).length} fields`}
                    suggested={`${Object.keys(aiSuggestions.itemSpecifics).length} fields (${Object.keys(aiSuggestions.itemSpecifics).filter(k => !listing.itemSpecifics[k]).length} new)`}
                    rationale={aiSuggestions.itemSpecificsRationale}
                    accepted={acceptSpecifics}
                    onAccept={acceptAiSpecifics}
                    onReject={rejectAiSpecifics}
                  />
                )}
              </div>

              {/* Error */}
              {error && (
                <div style={{ color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={13} /> {error}
                </div>
              )}

              {/* Push success */}
              {pushSuccess && (
                <div style={{ color: '#10b981', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px' }}>
                  <CheckCircle size={15} /> Changes pushed to eBay successfully!
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {!aiSuggestions && (
                  <button
                    className="btn-icon"
                    onClick={handleAiOptimize}
                    disabled={aiLoading}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    {aiLoading ? <><Loader size={14} className="spin" /> Optimizing…</> : <><Zap size={14} /> Get AI Suggestions</>}
                  </button>
                )}
                {listing.isOwner && (
                  <button
                    className="btn-primary"
                    onClick={() => setShowDiff(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                    <ArrowRight size={15} /> Review & Push to eBay
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
