// ─── Edge-length labels: rotated chips that sit outside each polygon edge ────
// Shared by the roof editor (Step 2) and the obstruction editor (Step 3) so the
// "show measurements" overlay looks identical on both screens.
import type { XY } from '../types';
import { dist, pointInPolygon } from '../lib/geo';
import { useCanvasFrame } from './SatCanvas';

export function EdgeLabels({
  poly,
  fmt,
  close = true,
  skip,
  onLabelClick,
}: {
  poly: XY[];
  fmt: (m: number) => string;
  close?: boolean;
  /** edge index currently being edited — its label is hidden */
  skip?: number;
  onLabelClick?: (i: number) => void;
}) {
  const frame = useCanvasFrame();
  const n = close ? poly.length : poly.length - 1;
  // constant SCREEN size: counter-scale by 1/zoom so labels shrink relative
  // to the map when zooming in and never block point placement
  const inv = 1 / frame.zoom;
  // when zoomed in far, an edge may be shorter on screen than its label —
  // hide labels for edges whose screen length can't fit the chip
  const minScreenLenPx = 30;
  // fallback side reference for OPEN polylines (no interior to test against)
  const cPx = {
    x: poly.reduce((s, p) => s + frame.toPx(p).x, 0) / poly.length,
    y: poly.reduce((s, p) => s + frame.toPx(p).y, 0) / poly.length,
  };
  const OFFSET = 14; // screen px between edge and chip centerline
  return (
    <>
      {Array.from({ length: Math.max(0, n) }, (_, i) => {
        if (i === skip) return null;
        const a = poly[i];
        const b = poly[(i + 1) % poly.length];
        const len = dist(a, b);
        if (len < 0.5) return null;
        const pa = frame.toPx(a);
        const pb = frame.toPx(b);
        const screenLen = Math.hypot(pb.x - pa.x, pb.y - pa.y) * frame.zoom;
        if (screenLen < minScreenLenPx) return null;
        const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        // label lies ALONG the edge; flip so text is never upside-down
        let angDeg = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
        if (angDeg > 90) angDeg -= 180;
        if (angDeg <= -90) angDeg += 180;
        // pick the offset side so the chip lands OUTSIDE the polygon:
        // local +y in the rotated frame maps to screen (−sinθ, cosθ), which
        // in meters space is (−sinθ, −cosθ) because toPx flips y. For closed
        // polygons we test the actual chip position against the interior —
        // correct even at concave notches where a centroid heuristic fails.
        const rad = (angDeg * Math.PI) / 180;
        let side: 1 | -1;
        if (close) {
          const testDistM = (OFFSET + 8) / frame.pxPerM; // chip's far edge, in meters
          const midM = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const plusY = {
            x: midM.x - Math.sin(rad) * testDistM,
            y: midM.y - Math.cos(rad) * testDistM,
          };
          side = pointInPolygon(plusY, poly) ? -1 : 1;
        } else {
          const outX = mid.x - cPx.x;
          const outY = mid.y - cPx.y;
          side = -Math.sin(rad) * outX + Math.cos(rad) * outY >= 0 ? 1 : -1;
        }
        return (
          <g
            key={i}
            transform={`translate(${mid.x}, ${mid.y}) rotate(${angDeg.toFixed(2)}) scale(${inv}) translate(0, ${side * OFFSET})`}
            style={onLabelClick ? { cursor: 'pointer' } : undefined}
            onPointerDown={onLabelClick ? (e) => e.stopPropagation() : undefined}
            onPointerUp={onLabelClick ? (e) => e.stopPropagation() : undefined}
            onClick={onLabelClick ? () => onLabelClick(i) : undefined}
          >
            {onLabelClick && <title>Click to type an exact length</title>}
            <rect
              x={-23}
              y={-8}
              width={46}
              height={16}
              rx={4}
              fill="rgba(15,23,42,0.88)"
              stroke={onLabelClick ? 'rgba(255,255,255,0.28)' : 'none'}
            />
            <text
              x={0}
              y={3.5}
              textAnchor="middle"
              fill="#fff"
              fontSize={9}
              fontWeight={650}
            >
              {fmt(len)}
            </text>
          </g>
        );
      })}
    </>
  );
}
