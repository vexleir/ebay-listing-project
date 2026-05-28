// FE-003 — the "Confirm changes before push" modal shown in the optimizer
// edit phase. Pure: parent owns the listing + the proposed edits; this
// component just renders the diff and proxies confirm/close.

import { createPortal } from 'react-dom';
import { ArrowRight, CheckCircle, Loader } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import type { FetchedListing, SpecificRow } from './types';

export interface OptimizerPushDiffModalProps {
  listing: FetchedListing;
  editTitle: string;
  editPrice: string;
  editDescription: string;
  editSpecifics: SpecificRow[];
  onConfirm: () => void;
  onClose: () => void;
  pushing: boolean;
}

function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Computes the field-level diff that the modal renders. Exported so tests
// can lock in the comparison rules without going through the DOM.
export function computePushDiff(
  listing: FetchedListing,
  editTitle: string,
  editPrice: string,
  editDescription: string,
  editSpecifics: SpecificRow[],
): Array<{ field: string; before: string; after: string }> {
  const changes: Array<{ field: string; before: string; after: string }> = [];

  if (editTitle !== listing.title) {
    changes.push({ field: 'Title', before: listing.title, after: editTitle });
  }
  if (editPrice !== String(listing.price)) {
    changes.push({ field: 'Price', before: `$${listing.price}`, after: `$${editPrice}` });
  }
  if (editDescription !== listing.description) {
    const before = stripHtml(listing.description).substring(0, 120);
    const after = stripHtml(editDescription).substring(0, 120);
    changes.push({ field: 'Description', before: before + '...', after: after + '...' });
  }
  const originalSpecificsFlat = Object.entries(listing.itemSpecifics).map(([k, v]) => `${k}: ${v}`).join(', ');
  const newSpecificsFlat = editSpecifics.filter((s) => s.name && s.value).map((s) => `${s.name}: ${s.value}`).join(', ');
  if (originalSpecificsFlat !== newSpecificsFlat) {
    changes.push({ field: 'Item Specifics', before: originalSpecificsFlat || '(none)', after: newSpecificsFlat || '(none)' });
  }
  return changes;
}

export default function OptimizerPushDiffModal({
  listing, editTitle, editPrice, editDescription, editSpecifics, onConfirm, onClose, pushing,
}: OptimizerPushDiffModalProps) {
  useEscapeKey(onClose, !pushing);
  const changes = computePushDiff(listing, editTitle, editPrice, editDescription, editSpecifics);

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={pushing ? undefined : onClose}
    >
      <div
        className="glass-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm changes before pushing to eBay"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '700px', maxHeight: '85vh', overflow: 'auto', padding: '1.5rem' }}
      >
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
        <div className="modal-sticky-actions" style={{ justifyContent: 'flex-end' }}>
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
    document.body,
  );
}
