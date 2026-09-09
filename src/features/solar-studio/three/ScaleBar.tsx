// ─── A scale on the parallel projections ─────────────────────────────────────
// The plan and the four elevations are orthographic: one scale everywhere on
// the picture, which is what makes a printed one measurable — provided the
// print says what that scale is. This writes it in the corner, as a bar of a
// round length in the user's own unit, re-fitted on every zoom.
import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const METRIC_M = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
const IMPERIAL_FT = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
const FT_M = 0.3048;
/** the bar never grows past this on screen */
const MAX_PX = 260;

/** The longest round length that fits MAX_PX at this zoom (CSS px per metre), in metres. */
export function scaleBarLength(pxPerM: number, imperial: boolean): number {
  const ladder = imperial ? IMPERIAL_FT.map((f) => f * FT_M) : METRIC_M;
  let pick = ladder[0];
  for (const L of ladder) if (L * pxPerM <= MAX_PX) pick = L;
  return pick;
}

/**
 * Keeps the bar and its label in step with the orthographic zoom. Writes the
 * DOM directly from the frame, like the module labels do, so a wheel zoom
 * never re-renders React for a number.
 */
export function ScaleBarSync({
  bar,
  label,
  imperial,
  fmtLen,
}: {
  bar: RefObject<HTMLDivElement | null>;
  label: RefObject<HTMLDivElement | null>;
  imperial: boolean;
  fmtLen: (m: number, dp?: number) => string;
}) {
  const last = useRef('');
  useFrame(({ camera }) => {
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    // r3f sizes the orthographic frustum in CSS pixels, so zoom IS px per metre
    const L = scaleBarLength(camera.zoom, imperial);
    const px = L * camera.zoom;
    const key = `${L}|${px.toFixed(1)}`;
    if (key === last.current) return;
    last.current = key;
    if (bar.current) bar.current.style.width = `${px}px`;
    if (label.current) label.current.textContent = fmtLen(L, imperial || L >= 1 ? 0 : 1);
  });
  return null;
}
