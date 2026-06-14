// UX-002 — small hook for the "close on Escape" pattern. Modals and
// lightboxes adopt this so keyboard-only users can dismiss them without
// reaching for the mouse.
//
// Usage:
//   useEscapeKey(onClose, /* enabled */ true);
//
// Pass `enabled: false` to temporarily disable (e.g. while a confirm
// dialog is mid-flight and the user shouldn't accidentally bail).

import { useEffect } from 'react';

export function useEscapeKey(handler: () => void, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handler, enabled]);
}
