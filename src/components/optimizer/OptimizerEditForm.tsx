// FE-003 — the right column of the optimizer edit phase. Stateless:
// parent owns every editable value + setter. The HTML/Preview tab and
// the description view mode also live on the parent so the form is
// trivially testable.

import { AlertTriangle, ArrowRight, CheckCircle, Loader, Zap } from 'lucide-react';
import AiSuggestionBox from './AiSuggestionBox';
import type { AISuggestions, FetchedListing, SpecificRow } from './types';

export type DescView = 'html' | 'preview';

export interface OptimizerEditFormProps {
  listing: FetchedListing;
  aiSuggestions: AISuggestions | null;

  editTitle: string;
  onEditTitleChange: (value: string) => void;
  acceptTitle: boolean | null;
  onAcceptAiTitle: () => void;
  onRejectAiTitle: () => void;

  editPrice: string;
  onEditPriceChange: (value: string) => void;

  editDescription: string;
  onEditDescriptionChange: (value: string) => void;
  descView: DescView;
  onDescViewChange: (view: DescView) => void;
  acceptDesc: boolean | null;
  onAcceptAiDesc: () => void;
  onRejectAiDesc: () => void;

  editSpecifics: SpecificRow[];
  onUpdateSpecific: (i: number, field: 'name' | 'value', val: string) => void;
  onRemoveSpecific: (i: number) => void;
  onAddSpecific: () => void;
  acceptSpecifics: boolean | null;
  onAcceptAiSpecifics: () => void;
  onRejectAiSpecifics: () => void;

  aiLoading: boolean;
  onAiOptimize: () => void;
  onReviewPush: () => void;

  error: string;
  pushSuccess: boolean;
}

export default function OptimizerEditForm({
  listing, aiSuggestions,
  editTitle, onEditTitleChange, acceptTitle, onAcceptAiTitle, onRejectAiTitle,
  editPrice, onEditPriceChange,
  editDescription, onEditDescriptionChange, descView, onDescViewChange,
  acceptDesc, onAcceptAiDesc, onRejectAiDesc,
  editSpecifics, onUpdateSpecific, onRemoveSpecific, onAddSpecific,
  acceptSpecifics, onAcceptAiSpecifics, onRejectAiSpecifics,
  aiLoading, onAiOptimize, onReviewPush,
  error, pushSuccess,
}: OptimizerEditFormProps) {
  const titleLenColor = editTitle.length > 80 ? '#ef4444' : editTitle.length >= 75 ? '#10b981' : 'var(--text-secondary)';

  const renderSuggestedPriceButton = () => {
    if (!aiSuggestions) return null;
    const recNum = parseFloat(String(aiSuggestions.priceRecommendation).replace(/[^0-9.]/g, ''));
    if (!recNum || recNum <= 0) return null;
    const recStr = recNum.toFixed(2);
    const applied = parseFloat(editPrice) === recNum;
    return (
      <div style={{ marginBottom: '6px' }}>
        <button
          onClick={() => listing.isOwner && onEditPriceChange(recStr)}
          disabled={!listing.isOwner || applied}
          title={applied ? 'Recommended price applied' : 'Click to set the price to this recommendation'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 10px',
            borderRadius: '6px',
            background: applied ? 'rgba(16,185,129,0.15)' : 'rgba(139,92,246,0.15)',
            border: `1px solid ${applied ? 'rgba(16,185,129,0.4)' : 'rgba(139,92,246,0.4)'}`,
            color: applied ? '#86efac' : '#c4b5fd',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: (!listing.isOwner || applied) ? 'default' : 'pointer',
          }}
        >
          {applied
            ? <><CheckCircle size={13} /> Suggested price applied: ${recStr}</>
            : <><Zap size={13} /> Suggested: ${recStr} — click to apply</>}
        </button>
        {aiSuggestions.priceRationale && (
          <div style={{ marginTop: '4px', fontSize: '0.73rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            {aiSuggestions.priceRationale}
          </div>
        )}
      </div>
    );
  };

  return (
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
            <span style={{ marginLeft: '8px', fontWeight: 400, color: titleLenColor }}>
              {editTitle.length}/80
            </span>
          </label>
          <input
            type="text"
            className="input-base"
            aria-label="Listing title"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value.substring(0, 80))}
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
              onAccept={onAcceptAiTitle}
              onReject={onRejectAiTitle}
            />
          )}
        </div>

        {/* Price */}
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Price (USD)</label>
          {renderSuggestedPriceButton()}
          <input
            type="number"
            className="input-base"
            aria-label="Listing price in USD"
            value={editPrice}
            onChange={(e) => onEditPriceChange(e.target.value)}
            min="0"
            step="0.01"
            disabled={!listing.isOwner}
            style={{ maxWidth: '180px' }}
          />
        </div>

        {/* Description */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Description {descView === 'html' ? '(HTML)' : '(Preview)'}
              <span style={{ marginLeft: '8px', fontWeight: 400, fontSize: '0.75rem' }}>
                {editDescription.replace(/<[^>]+>/g, '').length} plain chars
              </span>
            </label>
            <div role="tablist" style={{ display: 'inline-flex', border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden' }}>
              <button
                role="tab"
                aria-selected={descView === 'html'}
                onClick={() => onDescViewChange('html')}
                style={{ padding: '4px 10px', fontSize: '0.75rem', background: descView === 'html' ? 'var(--glass-bg)' : 'transparent', color: descView === 'html' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
              >
                HTML
              </button>
              <button
                role="tab"
                aria-selected={descView === 'preview'}
                onClick={() => onDescViewChange('preview')}
                style={{ padding: '4px 10px', fontSize: '0.75rem', background: descView === 'preview' ? 'var(--glass-bg)' : 'transparent', color: descView === 'preview' ? 'var(--text-primary)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', borderLeft: '1px solid var(--border-color)' }}
              >
                Preview
              </button>
            </div>
          </div>
          {descView === 'html' ? (
            <textarea
              className="input-base"
              aria-label="Listing description (HTML)"
              value={editDescription}
              onChange={(e) => onEditDescriptionChange(e.target.value)}
              disabled={!listing.isOwner}
              rows={8}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.8rem' }}
            />
          ) : (
            <div
              className="input-base"
              style={{ minHeight: '200px', maxHeight: '480px', overflowY: 'auto', padding: '12px 14px', fontSize: '0.9rem', lineHeight: 1.5, background: 'var(--glass-bg)' }}
              dangerouslySetInnerHTML={{ __html: editDescription || '<em style="color: var(--text-secondary)">No description</em>' }}
            />
          )}
          {aiSuggestions && (
            <AiSuggestionBox
              label="Description"
              original={listing.description.replace(/<[^>]+>/g, ' ').substring(0, 80) + '...'}
              suggested={aiSuggestions.description.replace(/<[^>]+>/g, ' ').substring(0, 120) + '...'}
              rationale={aiSuggestions.descriptionRationale}
              accepted={acceptDesc}
              onAccept={onAcceptAiDesc}
              onReject={onRejectAiDesc}
            />
          )}
        </div>

        {/* Item Specifics */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Item Specifics ({editSpecifics.filter((s) => s.name && s.value).length})
            </label>
            {listing.isOwner && (
              <button className="btn-icon" onClick={onAddSpecific} style={{ fontSize: '0.75rem', padding: '4px 10px' }}>
                + Add
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '280px', overflowY: 'auto' }}>
            {editSpecifics.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', alignItems: 'center' }}>
                <input
                  className="input-base"
                  aria-label={`Item specific name row ${i + 1}`}
                  value={s.name}
                  onChange={(e) => onUpdateSpecific(i, 'name', e.target.value)}
                  placeholder="Name"
                  disabled={!listing.isOwner}
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                />
                <input
                  className="input-base"
                  aria-label={`Item specific value row ${i + 1}`}
                  value={s.value}
                  onChange={(e) => onUpdateSpecific(i, 'value', e.target.value)}
                  placeholder="Value"
                  disabled={!listing.isOwner}
                  style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                />
                {listing.isOwner && (
                  <button
                    className="btn-icon"
                    onClick={() => onRemoveSpecific(i)}
                    aria-label={`Remove item specific row ${i + 1}`}
                    style={{ color: '#ef4444', padding: '4px 8px' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          {aiSuggestions && (
            <AiSuggestionBox
              label="Item Specifics"
              original={`${Object.keys(listing.itemSpecifics).length} fields`}
              suggested={`${Object.keys(aiSuggestions.itemSpecifics).length} fields (${Object.keys(aiSuggestions.itemSpecifics).filter((k) => !listing.itemSpecifics[k]).length} new)`}
              rationale={aiSuggestions.itemSpecificsRationale}
              accepted={acceptSpecifics}
              onAccept={onAcceptAiSpecifics}
              onReject={onRejectAiSpecifics}
            />
          )}
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={13} /> {error}
          </div>
        )}

        {pushSuccess && (
          <div style={{ color: '#10b981', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px' }}>
            <CheckCircle size={15} /> Changes pushed to eBay successfully!
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {!aiSuggestions && (
            <button
              className="btn-icon"
              onClick={onAiOptimize}
              disabled={aiLoading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {aiLoading ? <><Loader size={14} className="spin" /> Optimizing…</> : <><Zap size={14} /> Get AI Suggestions</>}
            </button>
          )}
          {listing.isOwner && (
            <button
              className="btn-primary"
              onClick={onReviewPush}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <ArrowRight size={15} /> Review & Push to eBay
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
