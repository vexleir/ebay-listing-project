// FE-003 — orchestration shell for the Listing Optimizer. Owns the
// fetch / analyze / edit phase state machine and threads value+setter
// pairs into the extracted subcomponents under src/components/optimizer/.

import { useState, useCallback } from 'react';
import { ChevronUp, Eye, Loader, Star, Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { computeOptimizerScore, type ListingScore } from '../utils/listingScore';

import OptimizerInputCard from './optimizer/OptimizerInputCard';
import OptimizerListingHeader from './optimizer/OptimizerListingHeader';
import ScoreGrid from './optimizer/ScoreGrid';
import OverallScore from './optimizer/OverallScore';
import SoldCompsPanel from './optimizer/SoldCompsPanel';
import SeoAnalysisPanel from './optimizer/SeoAnalysisPanel';
import OptimizerEditForm, { type DescView } from './optimizer/OptimizerEditForm';
import OptimizerPushDiffModal from './optimizer/OptimizerPushDiffModal';
import { extractItemId } from './optimizer/helpers';
import type { AISuggestions, FetchedListing, SoldComp, SpecificRow } from './optimizer/types';

interface Props {
  appPassword: string;
}

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
  const [descView, setDescView] = useState<DescView>('html');
  const [editSpecifics, setEditSpecifics] = useState<SpecificRow[]>([]);

  // AI accept state (null = pending, true = accepted, false = rejected)
  const [acceptTitle, setAcceptTitle] = useState<boolean | null>(null);
  const [acceptDesc, setAcceptDesc] = useState<boolean | null>(null);
  const [acceptSpecifics, setAcceptSpecifics] = useState<boolean | null>(null);

  // Push state
  const [showDiff, setShowDiff] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);

  const apiHeaders = (token: string) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
  const bearerHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

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

      setCompsLoading(true);
      const keywords = data.title.split(/\s+/).slice(0, 6).join(' ');
      fetch(`/api/optimizer/comps?query=${encodeURIComponent(keywords)}&categoryId=${data.categoryId}`, { headers: bearerHeaders(appPassword) })
        .then((r) => r.json())
        .then((d) => {
          const comps: SoldComp[] = d.comps || [];
          setSoldComps(comps);
          if (comps.length >= 3) {
            const compPrices = comps.map((c) => c.price).filter((p) => p > 0);
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

  const enterEditMode = useCallback(() => {
    if (!listing) return;
    setEditTitle(listing.title);
    setEditPrice(String(listing.price));
    setEditDescription(listing.description);
    setEditSpecifics(Object.entries(listing.itemSpecifics).map(([name, value]) => ({ name, value })));
    setAcceptTitle(null);
    setAcceptDesc(null);
    setAcceptSpecifics(null);
    setPhase('edit');
  }, [listing]);

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
      if (phase !== 'edit') enterEditMode();
    } catch (e: any) {
      setAiError(e.message || 'AI optimization failed');
    } finally {
      setAiLoading(false);
    }
  };

  const acceptAiTitle = () => {
    if (aiSuggestions) { setEditTitle(aiSuggestions.title); setAcceptTitle(true); }
  };
  const rejectAiTitle = () => { setAcceptTitle(false); if (listing) setEditTitle(listing.title); };

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

  const liveScore = (listing && phase === 'edit')
    ? computeOptimizerScore(
      editTitle,
      editDescription,
      listing.images,
      Object.fromEntries(editSpecifics.filter((s) => s.name && s.value).map((s) => [s.name, s.value])),
      parseFloat(editPrice) || listing.price,
      listing.shippingType,
      listing.shippingServiceCost,
      listing.categorySpecifics,
      soldComps.length >= 3 ? soldComps.map((c) => c.price).filter((p) => p > 0) : undefined,
    )
    : score;

  const handlePush = async () => {
    if (!listing) return;
    setPushing(true);
    try {
      const specificsArray = editSpecifics.filter((s) => s.name && s.value).map((s) => ({ name: s.name, value: s.value }));
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
      setListing((prev) => prev ? {
        ...prev,
        title: editTitle,
        price: parseFloat(editPrice) || prev.price,
        description: editDescription,
        itemSpecifics: Object.fromEntries(editSpecifics.filter((s) => s.name && s.value).map((s) => [s.name, s.value])),
      } : prev);
    } catch (e: any) {
      setError(e.message || 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  const updateSpecific = (i: number, field: 'name' | 'value', val: string) =>
    setEditSpecifics((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));
  const removeSpecific = (i: number) =>
    setEditSpecifics((prev) => prev.filter((_, idx) => idx !== i));
  const addSpecific = () =>
    setEditSpecifics((prev) => [...prev, { name: '', value: '' }]);

  const toggleExpanded = (key: string) => setExpandedCat(expandedCat === key ? null : key);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (phase === 'input' || phase === 'loading') {
    return (
      <OptimizerInputCard
        url={url}
        onUrlChange={setUrl}
        onSubmit={handleFetch}
        loading={phase === 'loading'}
        error={error}
      />
    );
  }

  if (phase === 'analyze' && listing && liveScore) {
    return (
      <div>
        {showDiff && (
          <OptimizerPushDiffModal
            listing={listing}
            editTitle={editTitle}
            editPrice={editPrice}
            editDescription={editDescription}
            editSpecifics={editSpecifics}
            onConfirm={handlePush}
            onClose={() => setShowDiff(false)}
            pushing={pushing}
          />
        )}

        <OptimizerListingHeader
          listing={listing}
          score={liveScore}
          pushSuccess={pushSuccess}
          onNewAnalysis={() => { setPhase('input'); setUrl(''); }}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.25rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>Health Breakdown</h3>
              <ScoreGrid score={liveScore} expandedKey={expandedCat} onToggle={toggleExpanded} />
            </div>

            <SeoAnalysisPanel
              title={listing.title}
              titleSeo={liveScore.categories.titleSeo}
              aiSeoIssues={aiSuggestions?.seoIssues}
              aiSeoKeywords={aiSuggestions?.seoKeywords}
            />

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

          <SoldCompsPanel comps={soldComps} loading={compsLoading} />
        </div>
      </div>
    );
  }

  if (phase === 'edit' && listing && liveScore) {
    return (
      <div>
        {showDiff && (
          <OptimizerPushDiffModal
            listing={listing}
            editTitle={editTitle}
            editPrice={editPrice}
            editDescription={editDescription}
            editSpecifics={editSpecifics}
            onConfirm={handlePush}
            onClose={() => setShowDiff(false)}
            pushing={pushing}
          />
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.25rem', alignItems: 'start' }}>
          <div style={{ position: 'sticky', top: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="glass-panel" style={{ padding: '1.25rem' }}>
              <OverallScore score={liveScore} compact pushSuccess={pushSuccess} />
              <div style={{ marginTop: '1rem' }}>
                <ScoreGrid score={liveScore} expandedKey={expandedCat} onToggle={toggleExpanded} />
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

          <OptimizerEditForm
            listing={listing}
            aiSuggestions={aiSuggestions}
            editTitle={editTitle}
            onEditTitleChange={setEditTitle}
            acceptTitle={acceptTitle}
            onAcceptAiTitle={acceptAiTitle}
            onRejectAiTitle={rejectAiTitle}
            editPrice={editPrice}
            onEditPriceChange={setEditPrice}
            editDescription={editDescription}
            onEditDescriptionChange={setEditDescription}
            descView={descView}
            onDescViewChange={setDescView}
            acceptDesc={acceptDesc}
            onAcceptAiDesc={acceptAiDesc}
            onRejectAiDesc={rejectAiDesc}
            editSpecifics={editSpecifics}
            onUpdateSpecific={updateSpecific}
            onRemoveSpecific={removeSpecific}
            onAddSpecific={addSpecific}
            acceptSpecifics={acceptSpecifics}
            onAcceptAiSpecifics={acceptAiSpecifics}
            onRejectAiSpecifics={rejectAiSpecifics}
            aiLoading={aiLoading}
            onAiOptimize={handleAiOptimize}
            onReviewPush={() => setShowDiff(true)}
            error={error}
            pushSuccess={pushSuccess}
          />
        </div>
      </div>
    );
  }

  return null;
}
