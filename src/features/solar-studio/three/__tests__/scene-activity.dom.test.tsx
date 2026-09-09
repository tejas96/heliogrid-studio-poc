// @vitest-environment jsdom
// ─── The gate: the render loop sleeps once nobody has touched the scene ──────
// `frameloop="always"` ran the GPU flat out for as long as the studio was
// open. This pins the two-state loop: awake for SCENE_IDLE_MS after the last
// input, asleep after, awake again on the next input, and no timer at all
// while the scene is parked.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import { SCENE_IDLE_MS, useSceneActivity } from '../useSceneActivity';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useSceneActivity', () => {
  it('opens awake, sleeps SCENE_IDLE_MS after the last input, wakes on the next', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSceneActivity(true));
    expect(result.current.awake).toBe(true);

    // an input two-thirds of the way through restarts the clock
    act(() => vi.advanceTimersByTime(SCENE_IDLE_MS * 0.66));
    act(() => result.current.wake());
    act(() => vi.advanceTimersByTime(SCENE_IDLE_MS * 0.66));
    expect(result.current.awake).toBe(true);

    act(() => vi.advanceTimersByTime(SCENE_IDLE_MS));
    expect(result.current.awake).toBe(false);

    act(() => result.current.wake());
    expect(result.current.awake).toBe(true);
  });

  it('keeps no timer while the scene is parked, and wakes when it is shown again', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ on }) => useSceneActivity(on), {
      initialProps: { on: true },
    });
    act(() => vi.advanceTimersByTime(SCENE_IDLE_MS + 1));
    expect(result.current.awake).toBe(false);

    rerender({ on: false });
    expect(vi.getTimerCount()).toBe(0);

    rerender({ on: true });
    expect(result.current.awake).toBe(true);
    act(() => vi.advanceTimersByTime(SCENE_IDLE_MS + 1));
    expect(result.current.awake).toBe(false);
  });
});
