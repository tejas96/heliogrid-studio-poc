// ─── Two-click distance measure for SatCanvas screens (Steps 2/3/6) ─────────
// Click once to anchor, the line follows the cursor, click again to freeze.
// A third click starts a new measurement; toggling the tool off clears it.
// Also the input for Step 2's known-distance site calibration.
import { useCallback, useState } from 'react';
import type { XY } from '../types';
import { useCanvasFrame } from './SatCanvas';

export interface MeasureState {
  active: boolean;
  a: XY | null;
  b: XY | null;
  /** b is frozen by a second click (measurement complete) */
  done: boolean;
  lengthM: number | null;
  toggle(): void;
  /** returns true when the click was consumed by the tool */
  handleClick(m: XY): boolean;
  handleMove(m: XY): void;
  reset(): void;
}

export function useMeasure(): MeasureState {
  const [active, setActive] = useState(false);
  const [a, setA] = useState<XY | null>(null);
  const [b, setB] = useState<XY | null>(null);
  const [done, setDone] = useState(false);

  const reset = useCallback(() => {
    setA(null);
    setB(null);
    setDone(false);
  }, []);

  const toggle = useCallback(() => {
    setActive((v) => {
      if (v) {
        setA(null);
        setB(null);
        setDone(false);
      }
      return !v;
    });
  }, []);

  const handleClick = useCallback(
    (m: XY): boolean => {
      if (!active) return false;
      if (!a || done) {
        // first click of a (new) measurement
        setA(m);
        setB(null);
        setDone(false);
      } else {
        setB(m);
        setDone(true);
      }
      return true;
    },
    [active, a, done],
  );

  const handleMove = useCallback(
    (m: XY) => {
      if (!active || !a || done) return;
      setB(m);
    },
    [active, a, done],
  );

  const lengthM = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : null;
  return { active, a, b, done, lengthM, toggle, handleClick, handleMove, reset };
}

/** SVG overlay (render inside SatCanvas children). */
export function MeasureOverlay({
  measure,
  fmt,
}: {
  measure: MeasureState;
  fmt: (m: number) => string;
}) {
  const frame = useCanvasFrame();
  if (!measure.active || !measure.a) return null;
  const pa = frame.toPx(measure.a);
  const pb = measure.b ? frame.toPx(measure.b) : null;
  const r = 4 / frame.zoom;
  const sw = 2 / frame.zoom;
  return (
    <g pointerEvents="none">
      <circle cx={pa.x} cy={pa.y} r={r} fill="#22d3ee" />
      {pb && measure.b && measure.lengthM !== null && (
        <>
          <line
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            stroke="#22d3ee"
            strokeWidth={sw}
            strokeDasharray={`${8 / frame.zoom} ${5 / frame.zoom}`}
          />
          <circle cx={pb.x} cy={pb.y} r={r} fill="#22d3ee" />
          {/* counter-scaled label (approved roof-drawing overlay style) */}
          <g transform={`translate(${(pa.x + pb.x) / 2}, ${(pa.y + pb.y) / 2}) scale(${1 / frame.zoom})`}>
            <rect x={-34} y={-24} width={68} height={18} rx={5} fill="rgba(8,12,18,0.85)" />
            <text
              textAnchor="middle"
              y={-11}
              fill="#22d3ee"
              fontSize={11.5}
              fontWeight={700}
              fontFamily="var(--mono)"
            >
              {fmt(measure.lengthM)}
            </text>
          </g>
        </>
      )}
    </g>
  );
}
