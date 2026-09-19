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
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { useEffect } from 'react';
import { Plus, Minus, Maximize2, Hand } from 'lucide-react';
import type { XY } from '../types';
import { SAT_ZOOM, metersPerStaticMap, pickScaleBar, staticSatelliteUrl, zoomCovering } from '../lib/maps';
import {
  MIN_TILE_ZOOM,
  MOSAIC_TILE_PX,
  MOSAIC_TILE_SCALE,
  backdropZoom,
  mosaicTiles,
} from '../lib/mosaic';

/** static-map request size. scale=2 returns 1280 px of imagery for the SAME
 *  ground — twice the detail under a fingertip, one quota line either way. */
const TILE_PX = 640;
const TILE_SCALE = 2;
/*
 * The widest PLANE the canvas lays out is MIN_TILE_ZOOM, owned by lib/mosaic —
 * the module that also draws the backdrop which has to cover that plane.
 *
 * It used to be 16 here (1.36 km), on the reasoning that a wider picture was
 * imagery nobody could use. That was sound while the plane WAS the picture: one
 * stretched Static Maps image at zoom 14 is 8.5 m per pixel, and a module row in
 * it is a smudge. With the mosaic the plane and the picture are no longer the
 * same object — detail comes from tiles chosen for the current magnification —
 * so widening the plane costs resolution nowhere. 14 gives a 5.4 km plane,
 * which holds any utility-scale site an Indian EPC will trace.
 */
/**
 * How coarsely the visible rect is quantised before it picks tiles.
 *
 * The tile list must not be rebuilt on every frame of a pan. `mosaicTiles`
 * already quantises its OUTPUT to whole tiles, so the list is stable across
 * small movements — but the memo that calls it would still re-run 60 times a
 * second on the raw rect and re-diff every `<img>`. Rounding the rect out to a
 * 16 m grid means the work happens only when the view has actually travelled
 * far enough to possibly need a different tile.
 */
const VIEW_QUANTUM_M = 16;
/** View-zoom limits, stated for a zoom-20 tile. A wider tile scales them by
 *  the same factor, so "fit" and "as close as the imagery goes" keep meaning
 *  the same amount of ground on screen whatever tile the site needed. */
const MIN_VIEW_ZOOM = 0.55;
const FIT_VIEW_ZOOM = 1.5;
const MAX_VIEW_ZOOM = 5;
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
  /**
   * The world rectangle currently on screen, in the same metres as `spanM`,
   * rounded OUT to a coarse grid so it is stable across small pans.
   *
   * Published because the overlay, not the basemap, is what gets expensive at
   * scale: Step 6 draws one SVG `<path>` per module, and a 36 ha field is
   * 129,024 of them. No browser survives that many nodes, and it is all
   * wasted — a screen shows a few hundred modules at a working zoom. Handing
   * the screens the same rect the mosaic culls with means the overlay can cull
   * with it, and the two can never disagree about what is visible.
   */
  view: { minX: number; maxX: number; minY: number; maxY: number };
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
     *
     * Omitted ⇒ SAT_ZOOM itself, the sharpest imagery Google serves. It used to
     * omit to SAT_ZOOM − 1, on the reasoning that scale=2 paid for the step
     * back. It does not: scale=2 is on at BOTH zooms (TILE_SCALE), so the step
     * simply threw away half the ground resolution — 0.143 m/px instead of
     * 0.071 m/px — and the 2D editors then magnified that loss ~5×. It also
     * left the canvas as the ONE consumer of SAT_ZOOM that did not actually
     * request SAT_ZOOM, which is the sort of quiet disagreement that makes a
     * pixels-to-metres bug impossible to find.
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
  /**
   * The viewport's own size, watched — the mosaic only requests tiles the user
   * can see, so it has to know how much screen there is. Measured rather than
   * assumed: this editor sits in a flex column beside panels that open and
   * close, so a hard-coded size would fetch a screenful of tiles for a pane
   * half that wide (wasted requests) or leave a black band down the side of a
   * wider one.
   */
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      // round to whole px: a sub-pixel flex reflow must not invalidate the
      // mosaic memo, and nothing here resolves finer than a pixel anyway
      setViewport((v) => {
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        return v.w === w && v.h === h ? v : { w, h };
      });
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const sizePx = 1000;
  // Tile zoom follows the SITE, not a constant: step back until one tile holds
  // what the caller has to cover. `coverM` is world metres, so the calibration
  // factor divides out before asking the imagery for raw ground.
  const tileZoom = coverM
    ? zoomCovering(lat, coverM / scaleFactor, TILE_PX, SAT_ZOOM, MIN_TILE_ZOOM)
    : SAT_ZOOM;
  // calibrated span: the same tile covers spanM × scaleFactor world meters
  // after a known-distance calibration, keeping geometry and imagery aligned
  const spanM = metersPerStaticMap(lat, tileZoom, TILE_PX) * scaleFactor;
  // Each zoom step doubles the ground, so the view zoom doubles with it: a
  // roof drawn last year renders at exactly the size it always did, and the
  // deepest zoom still resolves the same centimetres per screen pixel.
  const tileStep = 2 ** (SAT_ZOOM - tileZoom);
  const maxZoom = MAX_VIEW_ZOOM * tileStep;
  /**
   * The opening view — and the "Fit view" button.
   *
   * The legacy rule was `FIT_VIEW_ZOOM × tileStep`: always the same amount of
   * ground on screen, whatever plane the site needed. That was right while no
   * caller passed `coverM`, because the plane was then always one zoom-20 tile.
   * With the plane sized to the SITE it is wrong in the way that matters most
   * here: a ground-mount project opens on a 678 m plane, and 1.5 × 8 = 12×
   * magnification put 68 m of it on screen — the user lands zoomed inside their
   * own plot with no way to tell there is more of it, which is the very
   * complaint this work started from.
   *
   * So fit now means fit: never tighter than the legacy view (residential work
   * opens exactly where it always did), and widened as far as it takes to hold
   * `coverM` across the shorter side of the viewport.
   */
  const legacyFit = Math.min(maxZoom, FIT_VIEW_ZOOM * tileStep);
  const shortSidePx = Math.min(viewport.w, viewport.h);
  const fitZoom =
    coverM && coverM > 0 && shortSidePx > 0
      ? Math.max(MIN_VIEW_ZOOM, Math.min(legacyFit, (shortSidePx * spanM) / (coverM * sizePx)))
      : legacyFit;
  const clampZoom = (z: number) => Math.min(maxZoom, Math.max(MIN_VIEW_ZOOM, z));

  const [zoom, setZoom] = useState(fitZoom);
  /**
   * Hold the picture STILL when the plane resizes underneath it.
   *
   * `spanM` is now a function of the site (`coverM`), so finishing a large
   * field can step the basemap plane to the next zoom — 678 m to 1356 m, say.
   * On-screen scale is `(sizePx / spanM) × zoom`, so a plane that doubles
   * halves everything the user is looking at: the moment they close a boundary,
   * the site jumps to half size. Nothing moved in the model — `spanM` is only
   * the canvas's own ruler — but it reads as the drawing collapsing.
   *
   * Compensating `zoom` by the same ratio keeps metres-per-screen-pixel exactly
   * where it was, so the resize is invisible. `pan` needs no correction: it is
   * in screen pixels about the plane's centre, and the plane stays centred on
   * the site pin whatever its span.
   *
   * Adjusting state DURING render (rather than in an effect) is deliberate and
   * is React's documented pattern for state derived from changing props: React
   * re-runs this component before painting, so there is no frame at the wrong
   * scale. An effect would paint the jump and then correct it — a flicker
   * instead of a jump, which is not an improvement.
   */
  const [spanBasis, setSpanBasis] = useState(spanM);
  if (spanBasis !== spanM) {
    setSpanBasis(spanM);
    if (spanBasis > 0) {
      const ratio = spanM / spanBasis;
      setZoom((z) => Math.min(maxZoom, Math.max(MIN_VIEW_ZOOM, z * ratio)));
    }
  }
  /**
   * Apply the fit ONCE, when the viewport has first been measured.
   *
   * `useState(fitZoom)` runs before the ResizeObserver has reported anything,
   * so the first value is always the legacy fallback. Without this the canvas
   * would open at rooftop magnification on a kilometre-wide site and only
   * correct itself if the user happened to press Fit view. It is deliberately
   * a one-shot: re-fitting on every later resize would yank the view out from
   * under someone who had panned to a corner and then opened a side panel.
   */
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current || shortSidePx <= 0) return;
    didFit.current = true;
    setZoom(fitZoom);
  }, [shortSidePx, fitZoom]);
  const [pan, setPan] = useState<XY>({ x: 0, y: 0 });
  /**
   * The PAN TOOL: a drag moves the picture, whatever else is going on.
   *
   * Panning was already here, but only where the screen had nothing else to do
   * with the drag (`panEnabled`) or on the middle button. So half-way through
   * tracing a roof, or with a placement tool up, there was no way to reach the
   * part of the site that was off screen — and a laptop trackpad has no middle
   * button to fall back on. With the tool on, the screens are not offered the
   * down at all: the drag is the viewport's, and a click does nothing rather
   * than dropping a point where the user meant to grab the map.
   */
  const [panTool, setPanTool] = useState(false);
  /** grabbing hand while the pan drag is live — cursor only */
  const [grabbing, setGrabbing] = useState(false);
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

  // ── What the user can see right now, in world metres ──────────────────────
  // The content plane is laid out centre-anchored and then
  // `translate(pan) scale(zoom)`, so a screen offset from the viewport centre
  // is (offset - pan)/zoom content px, and the plane's centre is world (0,0).
  //
  // Rounded OUT to VIEW_QUANTUM_M so panning does not re-run the tile layout on
  // every frame. Rounding out (never in) guarantees the rect never reports less
  // ground than is actually on screen, which would cull something the user is
  // looking at — a basemap tile, or a module the overlay culls with the same
  // rect.
  const viewRect = useMemo(() => {
    const halfW = (viewport.w / 2 - pan.x) / zoom;
    const halfH = (viewport.h / 2 - pan.y) / zoom;
    // content px of the viewport's edges, measured from the plane's centre
    const mPerPx = spanM / sizePx;
    const q = VIEW_QUANTUM_M;
    const out = (v: number, dir: 1 | -1) =>
      dir > 0 ? Math.ceil(v / q) * q : Math.floor(v / q) * q;
    return {
      minX: out(-halfW * mPerPx, -1),
      maxX: out(halfW * mPerPx, 1),
      // screen y grows downward, world y grows north — the halves swap sign
      minY: out(-halfH * mPerPx, -1),
      maxY: out(halfH * mPerPx, 1),
    };
  }, [viewport.w, viewport.h, pan.x, pan.y, zoom, spanM, sizePx]);

  /**
   * Screen pixels per world metre — what decides how sharp the imagery has to
   * be. Quantised to 2 significant figures for the same reason as the rect: a
   * wheel notch changes it continuously, and the answer is a discrete zoom
   * level that only moves every factor of two.
   */
  const screenPxPerM = useMemo(() => {
    const raw = (sizePx / spanM) * zoom;
    if (!(raw > 0)) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
    return Math.round(raw / mag) * mag;
  }, [sizePx, spanM, zoom]);

  const tiles = useMemo(
    () =>
      mosaicTiles({
        lat,
        lng,
        spanM,
        sizePx,
        view: viewRect,
        screenPxPerM,
        scaleFactor,
      }),
    [lat, lng, spanM, sizePx, viewRect, screenPxPerM, scaleFactor],
  );

  /**
   * One wide picture under the mosaic, so the canvas is never black.
   *
   * It is also the ONLY imagery when the site is zoomed out past what the
   * mosaic will pay for, and it is what the very first paint shows while the
   * sharp tiles are still in flight. One request, cached after that.
   */
  const backdrop = useMemo(
    () => staticSatelliteUrl(lat, lng, backdropZoom(lat, spanM, scaleFactor), TILE_PX, TILE_SCALE),
    [lat, lng, spanM, scaleFactor],
  );

  const frame: CanvasFrame = {
    spanM,
    sizePx,
    zoom,
    pxPerM: (sizePx / spanM) * zoom,
    view: viewRect,
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
    const captured = !middle && !panTool && onCanvasDown?.(m, e);
    const panning = captured ? false : middle || panTool || panEnabled;
    if (panning) setGrabbing(true);
    dragRef.current = {
      mode: captured ? 'custom' : panning ? 'pan' : null,
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
    d.mode = !panTool && onCanvasDown?.(at, e) ? 'custom' : panTool || panEnabled ? 'pan' : null;
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
    setGrabbing(false);
    // With the pan tool up the canvas is a map, not a drawing: a tap that went
    // nowhere must not start a roof or clear the selection.
    if (!panTool && !d.moved && d.mode !== 'custom' && e.button === 0) onCanvasClick?.(m, e);
    onCanvasUp?.(m, e);
    dragRef.current = { ...d, mode: null, moved: false };
  }

  /** The browser took the gesture away (a system edge-swipe, a stylus lifted
   *  out of range). Bookkeeping only — no click, and no callback a screen
   *  would read as a committed drag. */
  function cancel(e: ReactPointerEvent) {
    ptsRef.current.delete(e.pointerId);
    setGrabbing(false);
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
            // the pan tool owns the cursor: the screen's own (crosshair while
            // drawing, grab over a handle) would be a lie while a drag pans
            cursor: panTool ? (grabbing ? 'grabbing' : 'grab') : cursor,
            position: 'relative',
            touchAction: 'none',
          }}
        >
          {/*
            THE BASEMAP, in two layers.

            Layer 1 is one wide picture of the whole plane. Layer 2 is the
            mosaic: Static Maps tiles at the sharpest zoom this magnification
            actually resolves, only where the viewport can see them.

            Why two. A single stretched image is what limited the app to 84.8 m
            of ground — 800 kWp — because the plane and the picture were the
            same object, so a wider site meant a coarser photo. Splitting them
            lets the plane grow to kilometres while detail under the cursor
            stays at 7 cm per pixel. And keeping the wide one underneath means
            there is no instant at which the user sees black: a tile arriving is
            the picture getting sharper, never the picture appearing.
          */}
          <img
            src={backdrop}
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
              // Always smooth. `pixelated` is nearest-neighbour: past ~3.4×
              // upscale it drew hard square blocks, which read as a broken
              // photo rather than a magnified one. Every mature design tool
              // (ResLink included) draws its imagery with linear filtering.
              imageRendering: 'auto',
            }}
          />
          {tiles.map((t) => (
            <img
              // stable key = zoom/i/j, so a tile that survives a pan keeps its
              // element, its decoded bitmap and its place in the browser cache.
              // Re-keying per frame would re-request and re-bill every tile.
              key={t.key}
              src={staticSatelliteUrl(t.lat, t.lng, t.zoom, MOSAIC_TILE_PX, MOSAIC_TILE_SCALE)}
              alt=""
              aria-hidden
              draggable={false}
              decoding="async"
              style={{
                position: 'absolute',
                // Grown by one px about its own centre, so neighbours overlap
                // by a hair instead of risking a hairline gap. Tile centres are
                // exact in Mercator pixels, but each box is finally snapped to
                // the browser's layout grid, and two boxes rounding opposite
                // ways show a line of the backdrop between them — which reads
                // as a grid drawn over the site. The cost is that each tile is
                // 1 px oversized (~0.1%); it does not accumulate, because every
                // tile is positioned from its own centre, so the worst error is
                // half a pixel at a seam.
                left: t.leftPx - 0.5,
                top: t.topPx - 0.5,
                width: t.sizePx + 1,
                height: t.sizePx + 1,
                filter: dim ? 'brightness(0.6) saturate(0.9)' : 'brightness(0.94)',
                userSelect: 'none',
                imageRendering: 'auto',
              }}
            />
          ))}
          <svg
            viewBox={`0 0 ${sizePx} ${sizePx}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          >
            {children}
          </svg>
        </div>

        {/* view cluster: the pan tool sits above the zoom pair, the way every
            map editor stacks them */}
        <div
          className="tool-rail dark"
          style={{ right: 14, bottom: 14 }}
          role="group"
          aria-label="View controls"
        >
          <button
            className={`tool-btn ${panTool ? 'on' : ''}`}
            data-tip={
              panTool
                ? 'Stop panning\nDrawing and picking work again'
                : 'Pan the view\nDrag to move the map — nothing is drawn or picked'
            }
            data-tip-left=""
            aria-label="Pan the view"
            aria-pressed={panTool}
            onClick={() => setPanTool((v) => !v)}
          >
            <Hand />
          </button>
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
