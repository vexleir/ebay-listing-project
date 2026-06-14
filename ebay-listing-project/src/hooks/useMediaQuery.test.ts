import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery, useIsMobile, BREAKPOINT_MOBILE_MAX } from './useMediaQuery';

type Listener = (ev?: MediaQueryListEvent) => void;

interface FakeMql {
  matches: boolean;
  media: string;
  addEventListener: (event: 'change', cb: Listener) => void;
  removeEventListener: (event: 'change', cb: Listener) => void;
  // addListener/removeListener intentionally omitted to exercise the modern path.
  _trigger: (next: boolean) => void;
}

function makeFakeMql(initial: boolean, media: string): FakeMql {
  const listeners = new Set<Listener>();
  return {
    matches: initial,
    media,
    addEventListener: (_event, cb) => { listeners.add(cb); },
    removeEventListener: (_event, cb) => { listeners.delete(cb); },
    _trigger(next: boolean) {
      this.matches = next;
      listeners.forEach((cb) => cb({ matches: next, media } as MediaQueryListEvent));
    },
  };
}

describe('useMediaQuery', () => {
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let fake: FakeMql;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    fake = makeFakeMql(false, '(max-width: 767px)');
    window.matchMedia = vi.fn().mockImplementation((q: string) => {
      fake.media = q;
      return fake as unknown as MediaQueryList;
    }) as typeof window.matchMedia;
  });

  afterEach(() => {
    if (originalMatchMedia) window.matchMedia = originalMatchMedia;
    else delete (window as any).matchMedia;
  });

  it('returns the initial match value from window.matchMedia', () => {
    fake.matches = true;
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(true);
  });

  it('returns false when matchMedia is unavailable', () => {
    delete (window as any).matchMedia;
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(false);
  });

  it('updates when the underlying MediaQueryList fires a change event', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    expect(result.current).toBe(false);
    act(() => { fake._trigger(true); });
    expect(result.current).toBe(true);
    act(() => { fake._trigger(false); });
    expect(result.current).toBe(false);
  });

  it('detaches its listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'));
    const removeSpy = vi.spyOn(fake, 'removeEventListener');
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('useIsMobile binds to the mobile-max breakpoint constant', () => {
    fake.matches = true;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    // Sanity: the constant the hook uses is the one we expect downstream consumers to match.
    expect(BREAKPOINT_MOBILE_MAX).toBe('(max-width: 767px)');
  });
});
