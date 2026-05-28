// UX-001 — small confirm dialog. Used by the Disconnect-from-eBay flow and
// any future destructive actions (delete listing, end listing, etc.).
//
// Renders nothing when `open` is false so the parent can keep it mounted.
// Closes on Escape and on backdrop click. Confirm/cancel handlers are
// fire-and-forget — the parent decides whether to await an async response
// or close immediately.

import { useEffect, useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      if (e.key === 'Enter' && !busy) onConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel, onConfirm]);

  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        // Only close on backdrop click — clicks on the card itself should not bubble.
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div ref={dialogRef} className="modal-card" style={{ maxWidth: 460 }}>
        <h3 id="confirm-dialog-title" style={{ marginBottom: 'var(--space-3)' }}>{title}</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={busy} type="button">
            {cancelLabel}
          </button>
          <button
            className={destructive ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={busy}
            type="button"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
