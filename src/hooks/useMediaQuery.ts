// MOB-001a — small hook for reading a CSS media query from React. Used by
// the mobile-aware sidebar so it can auto-close the drawer when the
// viewport grows past the breakpoint.
//
// SSR-safe: returns `false` during the initial server render and updates
// after mount. happy-dom (Vitest env) supports matchMedia, so test
// behavior is identical to the browser.

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    // Sync once on mount in case the initial paint and the matchMedia value diverge.
    onChange();
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange); // Safari < 14 fallback
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

// Common breakpoints in one place so screens don't drift apart.
export const BREAKPOINT_MOBILE_MAX = '(max-width: 767px)';
export const BREAKPOINT_DESKTOP_MIN = '(min-width: 768px)';

export function useIsMobile(): boolean {
  return useMediaQuery(BREAKPOINT_MOBILE_MAX);
}
