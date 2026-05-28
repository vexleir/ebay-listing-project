import { useRef, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, RotateCcw, Wand2, X } from 'lucide-react';
import type { StagedListing } from '../../types';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import HealthBadge from '../listings/shared/HealthBadge';

export interface OptimizeDimensions {
  packageLength: string;
  packageWidth: string;
  packageDepth: string;
  packageWeightLbs: string;
  packageWeightOz: string;
}

export interface OptimizeResult {
  title?: string;
  description?: string;
  priceRecommendation?: string;
  aiSuggestedPrice?: string;
  category?: string;
  condition?: string;
  itemSpecifics?: Record<string, unknown>;
  tags?: string[] | string;
  seoKeywords?: string;
}

export interface OptimizeListingModalProps {
  listing: StagedListing;
  result: OptimizeResult | null;
  instructions: string;
  descView: 'html' | 'preview';
  optimizing: boolean;
  saving: boolean;
  dimensions: OptimizeDimensions;
  allowOffers: boolean;
  canDelistRelist: boolean;
  onClose: () => void;
  onInstructionsChange: (instructions: string) => void;
  onDescViewChange: (view: 'html' | 'preview') => void;
  onGenerate: () => void;
  onResultChange: Dispatch<SetStateAction<OptimizeResult | null>>;
  onDimensionsChange: Dispatch<SetStateAction<OptimizeDimensions>>;
  onAllowOffersChange: (allowOffers: boolean) => void;
  onSave: (pushEbay: boolean, delistAndRelist?: boolean) => void;
}

export default function OptimizeListingModal({
  listing,
  result,
  instructions,
  descView,
  optimizing,
  saving,
  dimensions,
  allowOffers,
  canDelistRelist,
  onClose,
  onInstructionsChange,
  onDescViewChange,
  onGenerate,
  onResultChange,
  onDimensionsChange,
  onAllowOffersChange,
  onSave,
}: OptimizeListingModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
      <div
        ref={dialogRef}
        className="glass-panel"
        role="dialog"
        aria-modal="true"
        aria-label="AI optimize listing"
        style={{ width: '100%', maxWidth: '700px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
          <Wand2 size={20} style={{ color: '#a78bfa' }} />
          <h3 style={{ margin: 0, flex: 1 }}>AI Optimize Listing</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '1.25rem', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
          {listing.images?.[0] && <img src={listing.images[0]} alt="" style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 4px 0', fontWeight: 500, fontSize: '0.9rem' }}>{listing.title}</p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>${listing.priceRecommendation}</span>
              <HealthBadge listing={listing} />
              {listing.ebayDraftId && <span style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '1px 7px', borderRadius: '4px' }}>eBay listed</span>}
              {listing.sku
                ? <span title="SKU stored locally - will be applied to the relisted item" style={{ fontSize: '0.72rem', background: 'rgba(34,197,94,0.18)', color: '#86efac', padding: '1px 7px', borderRadius: '4px', fontFamily: 'monospace' }}>SKU: {listing.sku}</span>
                : listing.ebayDraftId
                  ? <span title="No SKU saved locally. On Delist & Relist, the server will fetch the live SKU from eBay (via GetItem) and apply it to the new listing." style={{ fontSize: '0.72rem', background: 'rgba(245,158,11,0.18)', color: '#fcd34d', padding: '1px 7px', borderRadius: '4px' }}>SKU: (will pull from eBay)</span>
                  : null}
            </div>
          </div>
        </div>

        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Optimization Instructions (optional)</label>
        <textarea
          className="input-base"
          rows={3}
          placeholder="e.g. 'Focus on collectible value', 'Target vintage buyers', 'Improve condition description'..."
          value={instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          style={{ marginBottom: '1rem', resize: 'vertical', width: '100%' }}
        />

        {!result ? (
          <button className="btn-primary" onClick={onGenerate} disabled={optimizing} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center', padding: '10px' }}>
            {optimizing ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Analyzing images & generating...</> : <><Wand2 size={15} /> Generate Optimized Listing</>}
          </button>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--success)', fontWeight: 600 }}>Optimization ready</span>
              <button onClick={onGenerate} disabled={optimizing} style={{ fontSize: '0.75rem', padding: '3px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer' }}>
                {optimizing ? 'Re-generating...' : 'Regenerate'}
              </button>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Title ({(result.title || '').length}/80)</label>
              <input className="input-base" value={result.title || ''} onChange={(e) => onResultChange((r) => ({ ...(r ?? {}), title: e.target.value }))} style={{ width: '100%' }} />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Price</label>
                {(() => {
                  const recNum = parseFloat(String(result.aiSuggestedPrice || '').replace(/[^0-9.]/g, ''));
                  if (!recNum || recNum <= 0) return null;
                  const recStr = recNum.toFixed(2);
                  const applied = parseFloat(String(result.priceRecommendation || '')) === recNum;
                  return (
                    <button
                      onClick={() => onResultChange((r) => ({ ...(r ?? {}), priceRecommendation: recStr }))}
                      disabled={applied}
                      title={applied ? 'AI suggested price applied' : 'Click to apply the AI suggested price'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        marginBottom: '5px', padding: '4px 9px', borderRadius: '6px',
                        background: applied ? 'rgba(16,185,129,0.15)' : 'rgba(139,92,246,0.15)',
                        border: `1px solid ${applied ? 'rgba(16,185,129,0.4)' : 'rgba(139,92,246,0.4)'}`,
                        color: applied ? '#86efac' : '#c4b5fd',
                        fontSize: '0.75rem', fontWeight: 600,
                        cursor: applied ? 'default' : 'pointer',
                      }}
                    >
                      {applied ? `AI price applied: $${recStr}` : `AI suggests $${recStr} - click to apply`}
                    </button>
                  );
                })()}
                <input className="input-base" value={result.priceRecommendation || ''} onChange={(e) => onResultChange((r) => ({ ...(r ?? {}), priceRecommendation: e.target.value }))} style={{ width: '100%' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>Condition</label>
                <input className="input-base" value={result.condition || ''} onChange={(e) => onResultChange((r) => ({ ...(r ?? {}), condition: e.target.value }))} style={{ width: '100%' }} />
              </div>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Description {descView === 'html' ? '(HTML)' : '(Preview)'}
                </label>
                <div role="tablist" style={{ display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
                  <button role="tab" aria-selected={descView === 'html'} onClick={() => onDescViewChange('html')} style={{ padding: '3px 10px', fontSize: '0.72rem', background: descView === 'html' ? 'var(--glass-bg)' : 'transparent', color: descView === 'html' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}>HTML</button>
                  <button role="tab" aria-selected={descView === 'preview'} onClick={() => onDescViewChange('preview')} style={{ padding: '3px 10px', fontSize: '0.72rem', background: descView === 'preview' ? 'var(--glass-bg)' : 'transparent', color: descView === 'preview' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', borderLeft: '1px solid var(--border-color)' }}>Preview</button>
                </div>
              </div>
              {descView === 'html' ? (
                <textarea className="input-base" rows={5} value={result.description || ''} onChange={(e) => onResultChange((r) => ({ ...(r ?? {}), description: e.target.value }))} style={{ width: '100%', resize: 'vertical' }} />
              ) : (
                <div className="input-base" style={{ minHeight: '140px', maxHeight: '420px', overflowY: 'auto', padding: '10px 12px', fontSize: '0.88rem', lineHeight: 1.5, background: 'var(--glass-bg)', width: '100%' }} dangerouslySetInnerHTML={{ __html: result.description || '<em style="color: var(--text-secondary)">No description</em>' }} />
              )}
            </div>

            {result.itemSpecifics && Object.keys(result.itemSpecifics).length > 0 && (
              <div style={{ marginBottom: '0.75rem', padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
                <p style={{ margin: '0 0 6px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Item Specifics</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {Object.entries(result.itemSpecifics).map(([key, value]) => (
                    <span key={key} style={{ fontSize: '0.75rem', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '4px' }}>{key}: {String(value)}</span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                Tags <span style={{ opacity: 0.6 }}>(comma-separated)</span>
              </label>
              <input
                className="input-base"
                value={Array.isArray(result.tags) ? result.tags.join(', ') : (result.tags || '')}
                onChange={(e) => onResultChange((r) => ({ ...(r ?? {}), tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) }))}
                style={{ width: '100%' }}
                placeholder="vintage, collectible, action-figure..."
              />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '3px' }}>
                SEO Keywords <span style={{ opacity: 0.6 }}>(comma-separated)</span>
              </label>
              <input
                className="input-base"
                value={result.seoKeywords || ''}
                onChange={(e) => onResultChange((r) => ({ ...(r ?? {}), seoKeywords: e.target.value }))}
                style={{ width: '100%' }}
                placeholder="vintage figure, collectible anime toy, 90s action figure..."
              />
            </div>

            <div style={{ marginBottom: '1rem', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 500 }}>
                Package Dimensions <span style={{ opacity: 0.6, fontWeight: 400 }}>(required by some shipping policies)</span>
              </label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Length (in)</label>
                  <input className="input-base" type="number" min={0} step="0.1" value={dimensions.packageLength} onChange={(e) => onDimensionsChange(d => ({ ...d, packageLength: e.target.value }))} style={{ width: '100%' }} placeholder="0" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Width (in)</label>
                  <input className="input-base" type="number" min={0} step="0.1" value={dimensions.packageWidth} onChange={(e) => onDimensionsChange(d => ({ ...d, packageWidth: e.target.value }))} style={{ width: '100%' }} placeholder="0" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Depth (in)</label>
                  <input className="input-base" type="number" min={0} step="0.1" value={dimensions.packageDepth} onChange={(e) => onDimensionsChange(d => ({ ...d, packageDepth: e.target.value }))} style={{ width: '100%' }} placeholder="0" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Weight - lbs</label>
                  <input className="input-base" type="number" min={0} step="1" value={dimensions.packageWeightLbs} onChange={(e) => onDimensionsChange(d => ({ ...d, packageWeightLbs: e.target.value }))} style={{ width: '100%' }} placeholder="0" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Weight - oz</label>
                  <input className="input-base" type="number" min={0} step="0.1" value={dimensions.packageWeightOz} onChange={(e) => onDimensionsChange(d => ({ ...d, packageWeightOz: e.target.value }))} style={{ width: '100%' }} placeholder="0" />
                </div>
                <div style={{ flex: 1 }} />
              </div>
            </div>

            {listing.ebayDraftId && canDelistRelist && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={allowOffers} onChange={(e) => onAllowOffersChange(e.target.checked)} style={{ cursor: 'pointer' }} />
                Allow offers on relisted item (Best Offer enabled)
              </label>
            )}

            <div className="modal-sticky-actions" style={{ flexWrap: 'wrap' }}>
              <button className="btn-secondary" style={{ flex: '1 1 140px' }} disabled={saving} onClick={() => onSave(false)}>
                {saving ? 'Saving...' : 'Save Only'}
              </button>
              {listing.ebayDraftId && (
                <button className="btn-primary" style={{ flex: '1 1 140px', background: 'rgba(99,102,241,0.25)', borderColor: 'rgba(99,102,241,0.5)' }} disabled={saving} onClick={() => onSave(true)}>
                  {saving ? 'Saving...' : 'Save + Revise eBay'}
                </button>
              )}
              {listing.ebayDraftId && canDelistRelist && (
                <button
                  className="btn-primary"
                  style={{ flex: '1 1 140px', background: 'rgba(245,158,11,0.22)', borderColor: 'rgba(245,158,11,0.5)', color: '#f59e0b' }}
                  disabled={saving}
                  title="Save changes, end the live eBay listing, and immediately push it back as a fresh listing (no scheduling)"
                  onClick={() => onSave(false, true)}
                >
                  {saving ? 'Working...' : <><RotateCcw size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />Save + Delist & Relist</>}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
