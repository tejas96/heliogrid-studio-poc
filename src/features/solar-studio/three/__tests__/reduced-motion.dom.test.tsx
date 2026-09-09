// @vitest-environment jsdom
// ─── The 3D scene has to obey prefers-reduced-motion too ─────────────────────
// The repo's three reduced-motion blocks are all CSS, and CSS cannot reach a
// `useFrame` callback that writes to `Object3D.rotation`. So every animation in
// the scene ran regardless of the setting. CLAUDE.md keeps this rule binding
// here ("`prefers-reduced-motion` ... still bind"), so the hook is the gate and
// this is what pins it.
//
// It is tested here rather than in the browser because the Browser pane has no
// way to set that media query — mocking `matchMedia` is the only honest check.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { useReducedMotion } from '../useReducedMotion';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** a matchMedia whose value we control, and whose listener we can fire */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        listeners.delete(fn),
    })),
  );
  return {
    fire(next: boolean) {
      for (const fn of listeners) fn({ matches: next } as MediaQueryListEvent);
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

describe('useReducedMotion', () => {
  it('reports false when the user has not asked to reduce motion', () => {
    stubMatchMedia(false);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('reports true when they have', () => {
    stubMatchMedia(true);
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it('follows a change made while the studio is open — no reload needed', () => {
    const mq = stubMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => mq.fire(true));
    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount, so a closed scene leaves nothing behind', () => {
    const mq = stubMatchMedia(false);
    const { unmount } = renderHook(() => useReducedMotion());
    expect(mq.listenerCount).toBe(1);
    unmount();
    expect(mq.listenerCount).toBe(0);
  });

  it('survives a server render, where matchMedia does not exist', () => {
    // Next renders these components on the server; a bare call would throw and
    // take the whole scene down before it ever reached the browser
    vi.stubGlobal('matchMedia', undefined);
    expect(() => renderHook(() => useReducedMotion())).not.toThrow();
  });
});
