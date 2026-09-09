// @vitest-environment jsdom
// ─── The gate: a lost GPU context is noticed, recorded, and let go of ────────
// Before this, `grep webglcontextlost src/` returned nothing: the canvas went
// black with no message, no recovery and no record. This pins the guard —
// both handlers fire, each writes a diagnostic the next session can read,
// the loss keeps the restore possible, and detaching really detaches.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { attachContextGuard, webglAvailable } from '../gpu-guard';
import { DIAGNOSTICS_KEY, readDiagnostics } from '../../lib/diagnostics';

afterEach(() => {
  window.localStorage.removeItem(DIAGNOSTICS_KEY);
  vi.restoreAllMocks();
});

describe('attachContextGuard', () => {
  it('tells the scene on loss and on restore, and writes both down', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const canvas = document.createElement('canvas');
    const onLost = vi.fn();
    const onRestored = vi.fn();
    const detach = attachContextGuard(canvas, () => ({ renderer: 'test gpu' }), { onLost, onRestored });

    const lost = new Event('webglcontextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(onLost).toHaveBeenCalledTimes(1);
    // preventDefault is what lets the browser bring the context back
    expect(lost.defaultPrevented).toBe(true);

    canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(onRestored).toHaveBeenCalledTimes(1);

    const kinds = readDiagnostics().map((d) => d.kind);
    expect(kinds).toEqual(['webgl-context-lost', 'webgl-context-restored']);
    expect(readDiagnostics()[0].detail).toMatchObject({ renderer: 'test gpu' });
    expect(typeof readDiagnostics()[1].detail.afterMs).toBe('number');

    detach();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    expect(onLost).toHaveBeenCalledTimes(1);
  });

  it('a browser with no WebGL is found out before the canvas mounts, without throwing', () => {
    // jsdom has no WebGL: getContext returns null (and logs "not implemented")
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    expect(webglAvailable()).toBe(false);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
      throw new Error('no canvas here');
    });
    expect(webglAvailable()).toBe(false);
  });
});
