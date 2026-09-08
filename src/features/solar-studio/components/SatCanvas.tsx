// ─── SatCanvas v2: static-satellite canvas + SVG overlay in meter coords ────
// Professional editor viewport: wheel-zoom at cursor, inertia-free precise
// panning (middle-drag or pan mode), scale bar, north badge, zoom readout.
// On a phone the same viewport is driven by fingers: one-finger pan, pinch to
// zoom about the midpoint. Nothing here needs a wheel or a middle button —
// the EPC on the roof has neither (DESIGN-SYSTEM §7.2).
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useEffect } from 'react';
import { Plus, Minus, Maximize2 } from 'lucide-react';
import type { XY } from '../types';
import { SAT_ZOOM, metersPerStaticMap, pickScaleBar, staticSatelliteUrl, zoomCovering } from '../lib/maps';

/** static-map request size. scale=2 returns 1280 px of imagery for the SAME
 *  ground — twice the detail under a fingertip, one quota line either way. */
const TILE_PX = 640;
const TILE_SCALE = 2;
/** the widest tile the canvas will step back to (zoomCovering's own floor is
 *  14 — a whole town, which no site needs and no key should pay for) */
const MIN_TILE_ZOOM = 16;
/** View-zoom limits, stated for a zoom-20 tile. A wider tile scales them by
 *  the same factor, so "fit" and "as close as the imagery goes" keep meaning
 *  the same amount of ground on screen whatever tile the site needed. */
const MIN_VIEW_ZOOM = 0.55;
const FIT_VIEW_ZOOM = 1.5;
const MAX_VIEW_ZOOM = 5;
/** device px per image px above which hard pixel edges read better than the
 *  browser's blur — the old `zoom > 2.2` for a 640 px tile in the 1000 px box */
const PIXELATE_ABOVE = 3.44;
/** travel before a finger is treated as a drag rather than a tap. Under it the
 *  gesture is still allowed to become a pinch, which is the whole point. */
const TOUCH_SLOP_PX = 8;

export interface CanvasFrame {
  /** meters covered edge-to-edge by the base image */
  spanM: number;
  /** logical canvas px (square) */
  sizePx: number;
  toPx(p: XY): XY;
  toM(px: XY): XY;
  zoom: number;
  /** px-per-meter at current zoom — for hit-testing tolerances */
  pxPerM: number;
}

const FrameCtx = createContext<CanvasFrame | null>(null);
export function useCanvasFrame(): CanvasFrame {
  const f = useContext(FrameCtx);
  if (!f) throw new Error('useCanvasFrame outside SatCanvas');
  return f;
}

/** Imperative controls exposed to the parent (e.g. centre the view on a point). */
export interface SatCanvasHandle {
  /** Pan (and optionally zoom) so world point `p` sits at the viewport centre. */
  centerOn(p: XY, targetZoom?: number): void;
}

export const SatCanvas = forwardRef<
  SatCanvasHandle,
  {
    lat: number;
    lng: number;
    children: ReactNode;
    onCanvasClick?: (m: XY, e: ReactPointerEvent) => void;
    onCanvasMove?: (m: XY, e: ReactPointerEvent) => void;
    onCanvasUp?: (m: XY, e: ReactPointerEvent) => void;
    /** return true to capture the drag (disables panning for this gesture) */
    onCanvasDown?: (m: XY, e: ReactPointerEvent) => boolean | void;
    cursor?: string;
    panEnabled?: boolean;
    dim?: boolean;
    /** extra overlay chrome rendered above the canvas (rails, pills) */
    hud?: ReactNode;
    /** site calibration: image span correction (project.calibration.scaleFactor) */
    scaleFactor?: number;
    /** site calibration: degrees true north lies CW of image-up (rotates the N badge) */
    northOffsetDeg?: number;
    /**
     * Ground the imagery must cover, in world metres — the site's bounding box
     * plus a working margin. The canvas steps the satellite zoom back until one
     * tile spans at least this much, because imagery the site does not fit
     * inside cannot be traced at all: a zoom-20 tile is ~90 m across, narrower
     * than a C&I shed and a rounding error next to a ground-mount field.
     * Omitted ⇒ one step wider than SAT_ZOOM, which at scale 2 is free — half
     * the zoom, twice the pixels, the same metres per pixel as before.
     */
    coverM?: number;
  }
>(function SatCanvas(
  {
    lat,
    lng,
    children,
    onCanvasClick,
    onCanvasMove,
    onCanvasUp,
    onCanvasDown,
    cursor = 'default',
    panEnabled = true,
    dim = false,
    hud,
    scaleFactor = 1,
    northOffsetDeg = 0,
    coverM,
  },
  ref,
) {
  const outerRef = useRef<HTMLDivElement>(null);
  // wheel over the canvas zooms the map; it must never scroll the page. Only a
  // NON-passive native listener may cancel a wheel — React's onWheel cannot.
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const cancel = (e: WheelEvent) => e.preventDefault();
    el.addEventListener('wheel', cancel, { passive: false });
    return () => el.removeEventListener('wheel', cancel);
  }, []);
  const sizePx = 1000;
  // Tile zoom follows the SITE, not a constant: step back until one tile holds
  // what the caller has to cover. `coverM` is world metres, so the calibration
  // factor divides out before asking the imagery for raw ground.
  const tileZoom = coverM
    ? zoomCovering(lat, coverM / scaleFactor, TILE_PX, SAT_ZOOM, MIN_TILE_ZOOM)
    : SAT_ZOOM - 1;
  // calibrated span: the same tile covers spanM × scaleFactor world meters
  // after a known-distance calibration, keeping geometry and imagery aligned
  const spanM = metersPerStaticMap(lat, tileZoom, TILE_PX) * scaleFactor;
  // Each zoom step doubles the ground, so the view zoom doubles with it: a
  // roof drawn last year renders at exactly the size it always did, and the
  // deepest zoom still resolves the same centimetres per screen pixel.
  const tileStep = 2 ** (SAT_ZOOM - tileZoom);
  const maxZoom = MAX_VIEW_ZOOM * tileStep;
  const fitZoom = Math.min(maxZoom, FIT_VIEW_ZOOM * tileStep);
  const clampZoom = (z: number) => Math.min(maxZoom, Math.max(MIN_VIEW_ZOOM, z));

  const [zoom, setZoom] = useState(fitZoom);
  const [pan, setPan] = useState<XY>({ x: 0, y: 0 });
  // A handler that runs before the next render (a finger lifting out of a
  // pinch) must not read the render closure's stale pan, so every write goes
  // through here and leaves the current value in a ref.
  const panRef = useRef(pan);
  panRef.current = pan;
  const applyPan = useCallback((p: XY) => {
    panRef.current = p;
    setPan(p);
  }, []);
  const dragRef = useRef<{
    /** 'pending' is a touch whose down has not been offered to the screen yet */
    mode: 'pan' | 'custom' | 'pending' | null;
    start: XY;
    startPan: XY;
    moved: boolean;
  }>({ mode: null, start: { x: 0, y: 0 }, startPan: { x: 0, y: 0 }, moved: false });
  /** every pointer currently down on the canvas, in client px — a pinch needs two */
  const ptsRef = useRef(new Map<number, XY>());
  /** the pointer that owns the drawing/pan gesture; a second finger never reaches the screens */
  const primaryRef = useRef<number | null>(null);
  /** two-finger gesture, anchored once when the second finger lands */
  const pinchRef = useRef<{
    ids: [number, number];
    startDist: number;
    startZoom: number;
    /** the point the fingers grabbed, in content px — it stays under the midpoint */
    anchor: XY;
  } | null>(null);

  const frame: CanvasFrame = {
    spanM,
    sizePx,
    zoom,
    pxPerM: (sizePx / spanM) * zoom,
    toPx: (p) => ({
      x: (p.x / spanM + 0.5) * sizePx,
      y: (0.5 - p.y / spanM) * sizePx,
    }),
    toM: (px) => ({
      x: (px.x / sizePx - 0.5) * spanM,
      y: (0.5 - px.y / sizePx) * spanM,
    }),
  };

  // Centre the viewport on a world point: content is centre-anchored then
  // translate(pan)·scale(zoom), so pan = -(basePx - sizePx/2)·zoom lands it dead
  // centre. Exact for any zoom.
  const centerOn = useCallback(
    (p: XY, targetZoom?: number) => {
      const z =
        targetZoom === undefined
          ? zoom
          : Math.min(maxZoom, Math.max(MIN_VIEW_ZOOM, targetZoom));
      const bx = (p.x / spanM + 0.5) * sizePx;
      const by = (0.5 - p.y / spanM) * sizePx;
      if (targetZoom !== undefined) setZoom(z);
      applyPan({ x: -(bx - sizePx / 2) * z, y: -(by - sizePx / 2) * z });
    },
    [zoom, spanM, maxZoom, applyPan],
  );
  useImperativeHandle(ref, () => ({ centerOn }), [centerOn]);

  function eventToMeters(e: { clientX: number; clientY: number; currentTarget: EventTarget }): XY {
    const svg = (e.currentTarget as HTMLElement).querySelector('svg');
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * sizePx;
    const py = ((e.clientY - r.top) / r.height) * sizePx;
    return frame.toM({ x: px, y: py });
  }

  /** the content's centre on screen, before the pan translate */
  function viewCentre(): XY | null {
    const outer = outerRef.current;
    if (!outer) return null;
    const r = outer.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** both fingers of the live pinch, or null once either has gone */
  function pinchPoints(): [XY, XY] | null {
    const p = pinchRef.current;
    if (!p) return null;
    const a = ptsRef.current.get(p.ids[0]);
    const b = ptsRef.current.get(p.ids[1]);
    return a && b ? [a, b] : null;
  }

  /**
   * Anchor a two-finger gesture. The ground under the midpoint is what the
   * hand is holding, so it is recorded once in content coords and every frame
   * afterwards solves for the pan that keeps it there — which makes the same
   * gesture pinch-zoom and pan at the same time, as a map should.
   */
  function beginPinch(ids: [number, number]) {
    const c = viewCentre();
    const a = ptsRef.current.get(ids[0]);
    const b = ptsRef.current.get(ids[1]);
    if (!c || !a || !b) return;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pinchRef.current = {
      ids,
      // two fingers can land on the same pixel — never divide by zero
      startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      startZoom: zoom,
      // panRef, not the render closure: the first finger may have panned since
      // the last render, and anchoring to a stale pan jumps the picture
      anchor: {
        x: (mid.x - c.x - panRef.current.x) / zoom,
        y: (mid.y - c.y - panRef.current.y) / zoom,
      },
    };
  }

  function down(e: ReactPointerEvent) {
    const pts = ptsRef.current;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    // A second finger is a pinch, never a second drawing gesture. The first
    // finger's tap is cancelled here (moved = true), which is why pinching
    // over a half-drawn roof does not drop a vertex between the fingers.
    if (pts.size === 2 && dragRef.current.mode !== 'custom') {
      beginPinch([...pts.keys()] as [number, number]);
      dragRef.current = { ...dragRef.current, mode: null, moved: true };
      return;
    }
    // a third finger, or one landing mid-drag while the screen owns the
    // gesture (a vertex under the other thumb): tracked, but inert
    if (pts.size > 1) return;

    primaryRef.current = e.pointerId;
    const start = { x: e.clientX, y: e.clientY };

    // A finger's down is HELD until the gesture proves it is one finger: the
    // second finger of a pinch lands tens of ms after the first, and a draw
    // tool that had already captured that first finger would rubber-band a
    // table across the roof and commit it on release. Nothing is lost by
    // waiting — the down is replayed at this exact point on the first real
    // travel or on release, so drags and taps behave as they do with a mouse.
    // A mouse or stylus is single-pointer and takes the original path.
    if (e.pointerType === 'touch') {
      dragRef.current = { mode: 'pending', start, startPan: panRef.current, moved: false };
      return;
    }

    const m = eventToMeters(e);
    const middle = e.button === 1;
    const captured = !middle && onCanvasDown?.(m, e);
    dragRef.current = {
      mode: captured ? 'custom' : middle || panEnabled ? 'pan' : null,
      start,
      startPan: panRef.current,
      moved: false,
    };
  }

  /** Hand the screen the down it has been waiting for, at the point the finger
   *  actually landed. The screens read the world point from a down and not the
   *  event, so replaying it later costs nothing. */
  function resolvePending(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (d.mode !== 'pending' || e.pointerId !== primaryRef.current) return;
    const at = eventToMeters({
      clientX: d.start.x,
      clientY: d.start.y,
      currentTarget: e.currentTarget,
    });
    d.mode = onCanvasDown?.(at, e) ? 'custom' : panEnabled ? 'pan' : null;
  }

  function move(e: ReactPointerEvent) {
    const pts = ptsRef.current;
    // "ours" = a pointer whose down reached this canvas. A vertex handle or an
    // obstruction stops propagation on the down and captures the pointer to
    // itself, so its moves and its up arrive here having never been seen going
    // down — and the screens rely on both.
    const ours = pts.has(e.pointerId);
    if (ours) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pinch = pinchRef.current;
    const two = pinchPoints();
    if (pinch && two) {
      const c = viewCentre();
      if (!c) return;
      const [a, b] = two;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const nz = clampZoom((pinch.startZoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.startDist);
      // one update for both: the anchor stays under the midpoint at the new
      // zoom, so the picture never shears between frames
      setZoom(nz);
      applyPan({ x: mid.x - c.x - pinch.anchor.x * nz, y: mid.y - c.y - pinch.anchor.y * nz });
      return;
    }

    // A second finger of our own gesture never drives the drawing. Anything
    // else still does: a mouse hovering with nothing down (the draft
    // rubber-band and the snap guides ride on those moves), and a pointer a
    // child grabbed on its way past.
    if (ours && e.pointerId !== primaryRef.current) return;

    const d = dragRef.current;
    // past the slop this finger is a drag, not a tap on its way to a pinch
    if (d.mode === 'pending' && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) >= TOUCH_SLOP_PX)
      resolvePending(e);
    const m = eventToMeters(e);
    if (d.mode === 'pan' && e.buttons > 0) {
      const dx = e.clientX - d.start.x;
      const dy = e.clientY - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      applyPan({ x: d.startPan.x + dx, y: d.startPan.y + dy });
    }
    onCanvasMove?.(m, e);
  }

  function up(e: ReactPointerEvent) {
    const pts = ptsRef.current;
    const ours = pts.delete(e.pointerId); // false ⇒ a child captured this pointer

    if (pinchRef.current?.ids.includes(e.pointerId)) {
      pinchRef.current = null;
      // the hand has not left yet: whichever finger is still down carries on
      // panning, from where it is now and from the pan the pinch just wrote.
      // It can no longer click — `moved` was set when the pinch began.
      const rest = [...pts.keys()][0];
      const at = rest === undefined ? undefined : pts.get(rest);
      primaryRef.current = rest ?? null;
      if (at) dragRef.current = { mode: 'pan', start: at, startPan: panRef.current, moved: true };
      return; // a pinch never clicks and never ends a screen-owned drag
    }
    // A spare finger of our own gesture must not fire a second onCanvasUp and
    // commit twice. A pointer we never saw go down still ends here: Step 2's
    // endVertexDrag and Step 3's setDrag(null) hang off this up, and their
    // handles swallowed the down before it ever reached us.
    if (ours && e.pointerId !== primaryRef.current) return;
    resolvePending(e); // a tap still owes the screen its down, then its up
    if (e.pointerId === primaryRef.current) primaryRef.current = null;

    const d = dragRef.current;
    const m = eventToMeters(e);
    if (!d.moved && d.mode !== 'custom' && e.button === 0) onCanvasClick?.(m, e);
    onCanvasUp?.(m, e);
    dragRef.current = { ...d, mode: null, moved: false };
  }

  /** The browser took the gesture away (a system edge-swipe, a stylus lifted
   *  out of range). Bookkeeping only — no click, and no callback a screen
   *  would read as a committed drag. */
  function cancel(e: ReactPointerEvent) {
    ptsRef.current.delete(e.pointerId);
    if (pinchRef.current?.ids.includes(e.pointerId)) pinchRef.current = null;
    if (e.pointerId === primaryRef.current) {
      primaryRef.current = null;
      dragRef.current = { ...dragRef.current, mode: null, moved: false };
    }
  }

  /** wheel-zoom keeping the point under the cursor fixed */
  function wheel(e: ReactWheelEvent) {
    // no preventDefault here: React registers onWheel as PASSIVE, so calling
    // it logged "Unable to preventDefault inside passive event listener" on
    // every notch. The native non-passive listener below stops the page scroll.
    const c = viewCentre();
    if (!c) return;
    const px = e.clientX - (c.x + pan.x);
    const py = e.clientY - (c.y + pan.y);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nz = clampZoom(zoom * factor);
    const applied = nz / zoom;
    setZoom(nz);
    applyPan({ x: pan.x + px - px * applied, y: pan.y + py - py * applied });
  }

  // scale bar: same px-per-meter the frame uses for hit-testing — the content
  // div is CSS-scaled by `zoom`, so screen px/m is (sizePx/spanM)·zoom exactly
  // (no viewport-size factor; the old one drew the bar ~20% short)
  const scaleBar = pickScaleBar(frame.pxPerM);

  return (
    <FrameCtx.Provider value={frame}>
      <div
        ref={outerRef}
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--editor-bg)',
        }}
        role="application"
        aria-label="Satellite roof drawing canvas"
      >
        <div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={cancel}
          // a pointer whose up never arrives would otherwise sit in the map
          // and make the next single tap look like a pinch
          onLostPointerCapture={cancel}
          onWheel={wheel}
          style={{
            width: sizePx,
            height: sizePx,
            flex: 'none',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center',
            cursor,
            position: 'relative',
            touchAction: 'none',
          }}
        >
          <img
            src={staticSatelliteUrl(lat, lng, tileZoom, TILE_PX, TILE_SCALE)}
            alt=""
            aria-hidden
            draggable={false}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              filter: dim ? 'brightness(0.6) saturate(0.9)' : 'brightness(0.94)',
              userSelect: 'none',
              imageRendering:
                (zoom * sizePx) / (TILE_PX * TILE_SCALE) > PIXELATE_ABOVE ? 'pixelated' : 'auto',
            }}
          />
          <svg
            viewBox={`0 0 ${sizePx} ${sizePx}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            {children}
          </svg>
        </div>

        {/* zoom cluster */}
        <div
          className="tool-rail dark"
          style={{ right: 14, bottom: 14 }}
          role="group"
          aria-label="Zoom controls"
        >
          <button
            className="tool-btn"
            data-tip={'Zoom in\n(scroll wheel or pinch)'}
            data-tip-left=""
            aria-label="Zoom in"
            onClick={() => setZoom((z) => clampZoom(+(z * 1.25).toFixed(2)))}
          >
            <Plus />
          </button>
          <div
            style={{
              textAlign: 'center',
              fontSize: 10,
              color: 'var(--editor-ink-2)',
              fontVariantNumeric: 'tabular-nums',
              padding: '1px 0',
            }}
          >
            {/* read against the reference zoom-20 tile, so a site that needed a
                wider picture still reports the magnification the user sees */}
            {Math.round((zoom / tileStep) * 100)}%
          </div>
          <button
            className="tool-btn"
            data-tip="Zoom out"
            data-tip-left=""
            aria-label="Zoom out"
            onClick={() => setZoom((z) => clampZoom(+(z / 1.25).toFixed(2)))}
          >
            <Minus />
          </button>
          <button
            className="tool-btn"
            data-tip="Fit view"
            data-tip-left=""
            aria-label="Fit view"
            onClick={() => {
              setZoom(fitZoom);
              applyPan({ x: 0, y: 0 });
            }}
          >
            <Maximize2 />
          </button>
        </div>

        {/* north + scale */}
        <div
          style={{
            position: 'absolute',
            left: 14,
            bottom: 14,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            alignItems: 'flex-start',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              background: 'rgba(20,24,30,0.88)',
              border: '1px solid var(--editor-line)',
              borderRadius: 8,
              color: 'var(--editor-ink)',
              padding: '5px 9px',
              fontSize: 10.5,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg
              width="12"
              height="14"
              viewBox="0 0 12 14"
              fill="none"
              aria-hidden
              // calibration: arrow points at TRUE north (rotated off image-up)
              style={{ transform: `rotate(${northOffsetDeg}deg)` }}
            >
              <path d="M6 0 L10 12 L6 9.4 L2 12 Z" fill="#fff" />
            </svg>
            N
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div
              style={{
                width: scaleBar.px,
                height: 4,
                borderLeft: '2px solid #fff',
                borderRight: '2px solid #fff',
                borderBottom: '2px solid #fff',
                opacity: 0.85,
              }}
            />
            <span style={{ fontSize: 10, color: '#e6e8eb', textShadow: '0 1px 2px #000' }}>
              {scaleBar.m} m
            </span>
          </div>
        </div>

        {hud}
      </div>
    </FrameCtx.Provider>
  );
});

/** Polygon → SVG path in px coords. */
export function polyPath(frame: CanvasFrame, poly: XY[], close = true): string {
  if (poly.length === 0) return '';
  const pts = poly.map((p) => frame.toPx(p));
  return (
    `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} ` +
    pts.slice(1).map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
    (close ? ' Z' : '')
  );
}
