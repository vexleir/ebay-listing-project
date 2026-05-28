// INV-002 (lite) — inline warning chip shown under SKU inputs when the
// entered value collides with an existing active listing. Pure: parent
// runs `findConflictingListings` and passes the resulting array in.

import { AlertTriangle } from 'lucide-react';
import type { StagedListing } from '../types';

export interface DuplicateSkuWarningProps {
  conflicts: StagedListing[];
  // If true, the warning hides itself entirely when there's no conflict.
  // Set false (default) to render nothing — the parent can choose to skip
  // the component instead.
  hideWhenEmpty?: boolean;
}

export default function DuplicateSkuWarning({ conflicts, hideWhenEmpty = true }: DuplicateSkuWarningProps) {
  if (hideWhenEmpty && conflicts.length === 0) return null;
  if (conflicts.length === 0) return null;

  const previewTitles = conflicts.slice(0, 2).map((l) => l.title).join(' · ');
  const extra = conflicts.length > 2 ? ` (+${conflicts.length - 2} more)` : '';

  return (
    <div
      role="alert"
      style={{
        marginTop: '6px',
        padding: '8px 12px',
        background: 'rgba(245, 158, 11, 0.12)',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        borderRadius: '6px',
        fontSize: '0.82rem',
        color: 'var(--warning)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}
    >
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>
          {conflicts.length === 1 ? 'This SKU is already used by another active listing.' : `This SKU is already used by ${conflicts.length} active listings.`}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {previewTitles}{extra}
        </div>
      </div>
    </div>
  );
}
