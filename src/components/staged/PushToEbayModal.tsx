// FE-001f — the Push-to-eBay confirmation modal. Owned state lives in the
// parent (the modal object + the extra-specifics array). The modal patches
// state through a single `onChange(patch)` callback so the parent doesn't
// have to thread setters per field.

import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, RefreshCw, AlertTriangle, AlertOctagon } from 'lucide-react';
import type { StagedListing, EbayPolicy } from '../../types';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { EBAY_CONDITIONS, toArizonaLocalISO } from './helpers';

export interface PushModalState {
  listing: StagedListing;
  conditionId: string;
  validConditions: { id: string; label: string }[];
  scheduleDate: string; // datetime-local string, empty = list immediately
  fulfillmentPolicyId: string;
  categoryId: string;
  fulfillmentPolicies: EbayPolicy[];
  loading: boolean;
  acceptOffers: boolean;
  autoAcceptPrice: string;
  minOfferPrice: string;
}

export interface ExtraSpecific { name: string; value: string }

export interface PushToEbayModalProps {
  state: PushModalState;
  /** Patch handler — receives a partial update to merge into `state`. */
  onChange: (patch: Partial<PushModalState>) => void;
  extraSpecifics: ExtraSpecific[];
  onExtraSpecificsChange: (next: ExtraSpecific[]) => void;
  onClose: () => void;
  onConfirm: () => void;
  // INV-002 warn-before-push — other listings that already have this SKU
  // live on eBay. Empty / undefined disables the gate. When non-empty, the
  // modal shows a warning panel and gates the Push button behind an
  // acknowledgment checkbox so sellers can't accidentally double-list.
  liveSkuConflicts?: StagedListing[];
}

export default function PushToEbayModal({
  state,
  onChange,
  extraSpecifics,
  onExtraSpecificsChange,
  onClose,
  onConfirm,
  liveSkuConflicts = [],
}: PushToEbayModalProps) {
  // UX-002: Escape dismisses the modal unless the policies/category fetch is
  // still in flight (matches the existing no-action-during-load behavior —
  // backdrop click already works during loading, so Escape can too).
  useEscapeKey(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const conditionOptions = state.validConditions.length > 0 ? state.validConditions : EBAY_CONDITIONS;
  const typeSpecificMissing =
    !Object.keys(state.listing.itemSpecifics || {}).some((k) => k.toLowerCase() === 'type')
    && !extraSpecifics.some((s) => s.name.toLowerCase() === 'type');

  // INV-002 — reset the acknowledgment any time the conflict set itself
  // changes (e.g. the seller closes + reopens the modal, or another tab
  // changes the listings state) so the gate can't silently stay green.
  const [acknowledgedSkuConflict, setAcknowledgedSkuConflict] = useState(false);
  const hasLiveSkuConflict = liveSkuConflicts.length > 0;
  useEffect(() => { setAcknowledgedSkuConflict(false); }, [liveSkuConflicts.length, state.listing.id]);
  const pushBlocked = hasLiveSkuConflict && !acknowledgedSkuConflict;

  return createPortal(
    <div
      onClick={onClose}
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
    >
      <div
        ref={dialogRef}
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm push to eBay"
        style={{ width: '100%', maxWidth: '520px', padding: '2rem', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Confirm Push to eBay</h3>
          <button onClick={onClose} className="btn-icon" aria-label="Close push modal"><X size={18} /></button>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {state.listing.title}
        </p>
        {state.loading ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginRight: '8px', verticalAlign: 'middle' }} />
            Loading policies & category...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Condition */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>eBay Condition</label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>
                AI assessed: "{state.listing.condition?.substring(0, 80)}"
              </p>
              <select
                className="input-base"
                value={state.conditionId}
                onChange={(e) => onChange({ conditionId: e.target.value })}
                aria-label="eBay condition"
              >
                {conditionOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.id} — {c.label}</option>
                ))}
              </select>
              {state.validConditions.length > 0 && state.validConditions.length < EBAY_CONDITIONS.length && (
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Showing {state.validConditions.length} condition{state.validConditions.length !== 1 ? 's' : ''} valid for this category
                </p>
              )}
            </div>

            {/* Shipping policy */}
            {state.fulfillmentPolicies.length > 0 && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>Shipping Policy</label>
                <select
                  className="input-base"
                  value={state.fulfillmentPolicyId}
                  onChange={(e) => onChange({ fulfillmentPolicyId: e.target.value })}
                  aria-label="Shipping policy"
                >
                  <option value="">— Use server default —</option>
                  {state.fulfillmentPolicies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {/* Category */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>eBay Category ID</label>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>
                AI category: "{state.listing.category}"
              </p>
              <input
                className="input-base"
                value={state.categoryId}
                onChange={(e) => onChange({ categoryId: e.target.value })}
                placeholder="Leave blank to use server default"
                aria-label="eBay category ID"
              />
            </div>

            {/* Schedule */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>Schedule Listing</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={!!state.scheduleDate}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const d = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
                        onChange({ scheduleDate: toArizonaLocalISO(d) });
                      } else {
                        onChange({ scheduleDate: '' });
                      }
                    }}
                    style={{ accentColor: 'var(--accent-color)', width: '14px', height: '14px' }}
                  />
                  Schedule for later
                </label>
              </div>
              {state.scheduleDate ? (
                <>
                  <input
                    type="datetime-local"
                    className="input-base"
                    value={state.scheduleDate}
                    min={toArizonaLocalISO(new Date(Date.now() + 5 * 60 * 1000))}
                    max={toArizonaLocalISO(new Date(Date.now() + 21 * 24 * 60 * 60 * 1000))}
                    onChange={(e) => onChange({ scheduleDate: e.target.value })}
                    aria-label="Schedule date"
                  />
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    eBay will make this listing live at the selected time (max 21 days out)
                  </p>
                </>
              ) : (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Listing will go live immediately when pushed</p>
              )}
            </div>

            {/* Best Offer */}
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, marginBottom: '6px' }}>
                <input
                  type="checkbox"
                  checked={state.acceptOffers}
                  onChange={(e) => onChange({ acceptOffers: e.target.checked })}
                  style={{ accentColor: 'var(--accent-color)', width: '14px', height: '14px' }}
                />
                Accept Best Offers
              </label>
              {state.acceptOffers && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Auto-accept at ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="input-base"
                        value={state.autoAcceptPrice}
                        onChange={(e) => onChange({ autoAcceptPrice: e.target.value })}
                        placeholder="(off)"
                        aria-label="Auto-accept price"
                        style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Auto-decline below ($)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="input-base"
                        value={state.minOfferPrice}
                        onChange={(e) => onChange({ minOfferPrice: e.target.value })}
                        placeholder="(off)"
                        aria-label="Auto-decline price"
                        style={{ fontSize: '0.85rem', padding: '6px 10px' }}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Leave blank to review every offer manually. eBay only auto-accepts/declines when a value is set.
                  </p>
                </>
              )}
            </div>

            {/* Item Specifics quick-fix */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                  Item Specifics
                  <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '6px' }}>
                    ({Object.keys(state.listing.itemSpecifics || {}).length} set)
                  </span>
                </label>
                <button
                  className="btn-icon"
                  style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                  onClick={() => onExtraSpecificsChange([...extraSpecifics, { name: '', value: '' }])}
                >+ Add field</button>
              </div>
              {typeSpecificMissing && (
                <div style={{ fontSize: '0.78rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <AlertTriangle size={12} /> "Type" is required for most eBay categories — fill it in below
                </div>
              )}
              {extraSpecifics.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', marginBottom: '6px' }}>
                  <input
                    className="input-base"
                    value={s.name}
                    onChange={(e) => onExtraSpecificsChange(extraSpecifics.map((r, idx) => idx === i ? { ...r, name: e.target.value } : r))}
                    placeholder="Name (e.g. Type)"
                    aria-label={`Extra specific ${i + 1} name`}
                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  />
                  <input
                    className="input-base"
                    value={s.value}
                    onChange={(e) => onExtraSpecificsChange(extraSpecifics.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))}
                    placeholder="Value (e.g. T-Shirt)"
                    aria-label={`Extra specific ${i + 1} value`}
                    style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                  />
                  <button
                    className="btn-icon"
                    style={{ color: '#ef4444', padding: '4px 8px' }}
                    onClick={() => onExtraSpecificsChange(extraSpecifics.filter((_, idx) => idx !== i))}
                    aria-label={`Remove extra specific ${i + 1}`}
                  >✕</button>
                </div>
              ))}
            </div>

            {hasLiveSkuConflict && (
              <div
                role="alert"
                style={{
                  marginTop: '0.75rem', padding: '10px 12px',
                  background: 'rgba(239, 68, 68, 0.10)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                }}
              >
                <AlertOctagon size={16} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#fca5a5' }}>
                    SKU already live on eBay
                  </div>
                  <div style={{ marginTop: '4px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    This SKU is currently on {liveSkuConflicts.length} live listing{liveSkuConflicts.length > 1 ? 's' : ''}. Pushing now will create a duplicate.
                  </div>
                  <ul style={{ margin: '6px 0 0 0', paddingLeft: '1.1rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    {liveSkuConflicts.slice(0, 3).map((l) => (
                      <li key={l.id} style={{ marginBottom: '2px' }}>
                        {l.title.substring(0, 60)}{l.title.length > 60 ? '…' : ''}
                        {l.ebayDraftId && <> — eBay item <span style={{ fontFamily: 'monospace' }}>{l.ebayDraftId}</span></>}
                      </li>
                    ))}
                    {liveSkuConflicts.length > 3 && (
                      <li style={{ fontStyle: 'italic' }}>+{liveSkuConflicts.length - 3} more</li>
                    )}
                  </ul>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={acknowledgedSkuConflict}
                      onChange={(e) => setAcknowledgedSkuConflict(e.target.checked)}
                      aria-label="Acknowledge SKU collision and push anyway"
                    />
                    Push anyway — I understand this will create a duplicate listing
                  </label>
                </div>
              </div>
            )}

            <div className="modal-sticky-actions">
              <button className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button
                className="btn-primary"
                style={{ flex: 2 }}
                onClick={onConfirm}
                disabled={pushBlocked}
                aria-disabled={pushBlocked}
                title={pushBlocked ? 'Acknowledge the SKU conflict before pushing' : undefined}
              >
                Push to eBay
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body,
  );
}
