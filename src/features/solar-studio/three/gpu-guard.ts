// ─── The GPU going away, noticed ─────────────────────────────────────────────
// A browser drops a WebGL context when the graphics driver resets, when a tab
// holds more texture memory than the GPU will give it, or when too many
// contexts are open. three.js already handles the mechanics: its own
// `webglcontextlost` listener calls preventDefault() — which is what tells the
// browser it MAY restore the context — and on `webglcontextrestored` it
// rebuilds its GL state. What nobody did was tell the user, or write it down.
//
// So until now a lost context was a black canvas with no message, and if the
// browser did bring the context back, r3f's loop had nothing to say about it
// either. This attaches the two listeners the product needs on top of three's:
// one to put a message up and record the event, one to take the message down
// and record how long it took.
import type * as THREE from 'three';
import { recordDiagnostic } from '../lib/diagnostics';

/** What the GPU is, for the record that goes with every failure. */
export function describeGpu(gl: THREE.WebGLRenderer): Record<string, unknown> {
  try {
    const ctx = gl.getContext();
    // the unmasked strings name the actual adapter ("Apple M2", "Adreno 610");
    // without the extension the browser answers "WebKit WebGL" for everything
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: String(ctx.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : ctx.RENDERER)),
      vendor: String(ctx.getParameter(dbg ? dbg.UNMASKED_VENDOR_WEBGL : ctx.VENDOR)),
      maxTextureSize: gl.capabilities.maxTextureSize,
      dpr: gl.getPixelRatio(),
    };
  } catch {
    return {};
  }
}

/**
 * Whether this browser will hand out a WebGL context right now.
 *
 * Asked BEFORE <Canvas> mounts, because r3f 9 creates the renderer inside an
 * async `configure()` with no catch: a browser that refuses a context (a
 * blocklisted driver, hardware acceleration switched off, a remote desktop)
 * leaves a blank canvas and an unhandled rejection that no error boundary
 * ever sees. The probe context is handed straight back — a page only gets a
 * handful, and the real one still has to be created.
 */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export interface ContextGuardHandlers {
  onLost: () => void;
  onRestored: () => void;
}

/**
 * Watch a canvas for its WebGL context going away and coming back. `facts()`
 * is read at the moment of the event, so the record carries whatever the
 * caller knows then. Returns the detach function.
 */
export function attachContextGuard(
  canvas: HTMLCanvasElement,
  facts: () => Record<string, unknown>,
  h: ContextGuardHandlers,
): () => void {
  let lostAt = 0;
  const onLost = (e: Event) => {
    // three does this too; saying it again keeps the restore possible even
    // if the renderer's own listener is ever gone before ours
    e.preventDefault();
    lostAt = performance.now();
    recordDiagnostic('webgl-context-lost', facts());
    h.onLost();
  };
  const onRestored = () => {
    recordDiagnostic('webgl-context-restored', {
      ...facts(),
      afterMs: Math.round(performance.now() - lostAt),
    });
    h.onRestored();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return () => {
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}
