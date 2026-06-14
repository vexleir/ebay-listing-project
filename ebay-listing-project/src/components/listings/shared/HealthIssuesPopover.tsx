// Shared inline-expanded health-issues popover for listing screens. Lives
// in its own file so multiple list views can reuse it without copying the
// portal/dismiss boilerplate.
//
// The trigger button stays with the parent — its styling is bespoke per list
// view. This component owns ONLY the popover layer + the backdrop dismiss.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface HealthIssuesPopoverProps {
  open: boolean;
  score: number;
  issues: string[];
  /** Color for the "Health: N/100" header (matches the trigger badge). */
  color: string;
  onDismiss: () => void;
}

export default function HealthIssuesPopover({ open, score, issues, color, onDismiss }: HealthIssuesPopoverProps) {
  // Escape closes — matches the pattern adopted by ConfirmDialog and the
  // EditListingModal under UX-002.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onDismiss]);

  if (!open || issues.length === 0) return null;
  return createPortal(
    <div
      onClick={onDismiss}
      role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 8500 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="false"
        aria-label={`Health score ${score} of 100 — ${issues.length} issue${issues.length === 1 ? '' : 's'}`}
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--glass-border)',
          borderRadius: '10px',
          padding: '1rem 1.25rem',
          minWidth: '280px',
          maxWidth: '400px',
          zIndex: 8501,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', fontWeight: 600, color }}>
          Health: {score}/100 — {issues.length} issue{issues.length > 1 ? 's' : ''}
        </p>
        {issues.map((issue, i) => (
          <p key={i} style={{ margin: '3px 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>• {issue}</p>
        ))}
      </div>
    </div>,
    document.body,
  );
}
