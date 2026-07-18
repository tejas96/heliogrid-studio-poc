// ─── SatCanvas v2: static-satellite canvas + SVG overlay in meter coords ────
// Professional editor viewport: wheel-zoom at cursor, inertia-free precise
// panning (middle-drag or pan mode), scale bar, north badge, zoom readout.
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
import { Plus, Minus, Maximize2 } from 'lucide-react';
import type { XY } from '../types';
import { metersPerStaticMap, pickScaleBar, staticSatelliteUrl } from '../lib/maps';

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

export const SAT_ZOOM = 20;

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
  },
  ref,
) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1.5);
  const [pan, setPan] = useState<XY>({ x: 0, y: 0 });
  const dragRef = useRef<{
    mode: 'pan' | 'custom' | null;
    start: XY;
    startPan: XY;
    moved: boolean;
  }>({ mode: null, start: { x: 0, y: 0 }, startPan: { x: 0, y: 0 }, moved: false });

  const sizePx = 1000;
  // calibrated span: the same tile covers spanM × scaleFactor world meters
  // after a known-distance calibration, keeping geometry and imagery aligned
  const spanM = metersPerStaticMap(lat, SAT_ZOOM, 640) * scaleFactor;
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
      const z = targetZoom ?? zoom;
      const bx = (p.x / spanM + 0.5) * sizePx;
      const by = (0.5 - p.y / spanM) * sizePx;
      if (targetZoom !== undefined) setZoom(z);
      setPan({ x: -(bx - sizePx / 2) * z, y: -(by - sizePx / 2) * z });
    },
    [zoom, spanM],
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

  function down(e: ReactPointerEvent) {
    const m = eventToMeters(e);
    const middle = e.button === 1;
    const captured = !middle && onCanvasDown?.(m, e);
    dragRef.current = {
      mode: captured ? 'custom' : middle || panEnabled ? 'pan' : null,
      start: { x: e.clientX, y: e.clientY },
      startPan: pan,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function move(e: ReactPointerEvent) {
    const d = dragRef.current;
    const m = eventToMeters(e);
    if (d.mode === 'pan' && e.buttons > 0) {
      const dx = e.clientX - d.start.x;
      const dy = e.clientY - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setPan({ x: d.startPan.x + dx, y: d.startPan.y + dy });
    }
    onCanvasMove?.(m, e);
  }

  function up(e: ReactPointerEvent) {
    const d = dragRef.current;
    const m = eventToMeters(e);
    if (!d.moved && d.mode !== 'custom' && e.button === 0) onCanvasClick?.(m, e);
    onCanvasUp?.(m, e);
    dragRef.current = { ...d, mode: null, moved: false };
  }

  /** wheel-zoom keeping the point under the cursor fixed */
  function wheel(e: ReactWheelEvent) {
    e.preventDefault();
    const outer = outerRef.current;
    if (!outer) return;
    const rect = outer.getBoundingClientRect();
    const cx = rect.left + rect.width / 2 + pan.x;
    const cy = rect.top + rect.height / 2 + pan.y;
    const px = e.clientX - cx;
    const py = e.clientY - cy;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nz = Math.min(5, Math.max(0.55, zoom * factor));
    const applied = nz / zoom;
    setZoom(nz);
    setPan({ x: pan.x + px - px * applied, y: pan.y + py - py * applied });
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
            src={staticSatelliteUrl(lat, lng, SAT_ZOOM, 640)}
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
              imageRendering: zoom > 2.2 ? 'pixelated' : 'auto',
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
            data-tip={'Zoom in\n(scroll wheel)'}
            data-tip-left=""
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(5, +(z * 1.25).toFixed(2)))}
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
            {Math.round(zoom * 100)}%
          </div>
          <button
            className="tool-btn"
            data-tip="Zoom out"
            data-tip-left=""
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.55, +(z / 1.25).toFixed(2)))}
          >
            <Minus />
          </button>
          <button
            className="tool-btn"
            data-tip="Fit view"
            data-tip-left=""
            aria-label="Fit view"
            onClick={() => {
              setZoom(1.5);
              setPan({ x: 0, y: 0 });
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
