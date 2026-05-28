// UX-002 follow-through — focus trap for modals. Keeps keyboard focus
// inside the modal's container while it's open: Tab from the last focusable
// element wraps to the first, Shift+Tab from the first wraps to the last.
// On mount, focus moves to the first focusable element (or the container
// itself as a fallback) so Tab has a starting point. On unmount, focus
// returns to whatever was focused before the modal opened.
//
// Usage:
//   const ref = useRef<HTMLDivElement>(null);
//   useFocusTrap(ref, /* enabled */ true);
//   return <div ref={ref} role="dialog" aria-modal>...</div>;

import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]:not([disabled])',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
}

export function useFocusTrap<T extends HTMLElement>(ref: RefObject<T | null>, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the modal on mount so Tab has a starting point.
    const els = focusableElements(root);
    if (els.length > 0) {
      els[0].focus();
    } else if (root.tabIndex < 0) {
      // Make the root itself focusable as a fallback so keyboard users
      // aren't left without a focus anchor.
      root.setAttribute('tabindex', '-1');
      root.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusableElements(root);
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !root.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Restore focus to the originally-focused element on unmount, unless
      // it was inside the modal (in which case it's about to be removed).
      if (previouslyFocused && document.contains(previouslyFocused) && !root.contains(previouslyFocused)) {
        try { previouslyFocused.focus(); } catch { /* element no longer focusable */ }
      }
    };
  }, [ref, enabled]);
}
