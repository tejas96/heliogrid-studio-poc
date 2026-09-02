// ─── Real-surroundings grid → shading caster geometry (pure, worker-safe) ────
// Kept free of browser storage and raster decoding so the analysis worker
// can build the caster from the grid it is handed without dragging IndexedDB
// or GeoTIFF code into its bundle.
import * as THREE from 'three';
import type { SiteSurround, XY } from '../types';

/** The decoded grid the engine consumes (heights in METRES above grade). */
export interface SurroundHeights {
  cols: number;
  rows: number;
  originEN: XY;
  stepCol: XY;
  stepRow: XY;
  heights: Float32Array;
}

/** Fingerprint ingredient: everything that changes what the engine sees. */
export function surroundKey(s: SiteSurround): string {
  return `${s.source}|${s.imageryDate}|${s.radiusM}|${s.stepM}|${s.cols}x${s.rows}|${s.blobId}`;
}

/**
 * Heightfield mesh geometry in SCENE coordinates (x = E, y = up, z = −N).
 * Cells at grade are kept (a continuous sheet is what a raycast needs); the
 * grid is thinned so the engine never traverses more than ~40k triangles.
 */
export function buildSurroundGeometry(g: SurroundHeights): THREE.BufferGeometry {
  const thin = Math.max(1, Math.ceil(Math.sqrt((g.cols * g.rows) / 40_000)));
  const cols = Math.floor((g.cols - 1) / thin) + 1;
  const rows = Math.floor((g.rows - 1) / thin) + 1;
  const pos = new Float32Array(cols * rows * 3);
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sc = c * thin;
      const sr = r * thin;
      // MAX over the thinned block keeps thin casters (poles, tree tops)
      let h = 0;
      for (let dy = 0; dy < thin; dy++) {
        for (let dx = 0; dx < thin; dx++) {
          const cc = Math.min(g.cols - 1, sc + dx);
          const rr = Math.min(g.rows - 1, sr + dy);
          h = Math.max(h, g.heights[rr * g.cols + cc]);
        }
      }
      const e = g.originEN.x + sc * g.stepCol.x + sr * g.stepRow.x;
      const n = g.originEN.y + sc * g.stepCol.y + sr * g.stepRow.y;
      pos[k++] = e;
      pos[k++] = h;
      pos[k++] = -n;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  return geom;
}

// ── plan geometry helpers (local copies: this module must stay worker-safe) ──
function inPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToPolygon(p: XY, poly: XY[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
  }
  return best;
}

/** Plan position of grid cell (c, r). */
function cellEN(g: SurroundHeights, c: number, r: number): XY {
  return {
    x: g.originEN.x + c * g.stepCol.x + r * g.stepRow.x,
    y: g.originEN.y + c * g.stepCol.y + r * g.stepRow.y,
  };
}

/** The grid's height (metres above grade) at a plan point; null outside the grid. */
export function surroundHeightAt(g: SurroundHeights, p: XY): number | null {
  const dx = p.x - g.originEN.x;
  const dy = p.y - g.originEN.y;
  const cl = g.stepCol.x * g.stepCol.x + g.stepCol.y * g.stepCol.y;
  const rl = g.stepRow.x * g.stepRow.x + g.stepRow.y * g.stepRow.y;
  if (!cl || !rl) return null;
  const c = Math.round((dx * g.stepCol.x + dy * g.stepCol.y) / cl);
  const r = Math.round((dx * g.stepRow.x + dy * g.stepRow.y) / rl);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return null;
  const h = g.heights[r * g.cols + c];
  return Number.isFinite(h) ? h : null;
}

/** Around every roof the raster is the raster; under it (and this far outside) the model rules. */
export const CUTOUT_MARGIN_M = 1.0;

/**
 * The grid with the site's own roofs cut out (their cells set to 0), for the
 * roofs AS THEY ARE NOW. The stored grid is never cut: a roof traced or moved
 * after the fetch would otherwise leave the real building standing inside the
 * model — shading its own modules — with a hole where the old roof was.
 * Returns the same grid object when there is nothing to cut.
 */
export function cutSurroundForRoofs(
  g: SurroundHeights,
  roofs: readonly { polygon: XY[] }[],
  marginM = CUTOUT_MARGIN_M,
): SurroundHeights {
  const polys = roofs.map((rf) => rf.polygon).filter((p) => p.length >= 3);
  if (polys.length === 0) return g;
  const heights = new Float32Array(g.heights);
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const p = cellEN(g, c, r);
      for (const poly of polys) {
        if (inPolygon(p, poly) || distToPolygon(p, poly) < marginM) {
          heights[r * g.cols + c] = 0;
          break;
        }
      }
    }
  }
  return { ...g, heights };
}

/** A roof needs this many 0.5 m cells (10 m²) before its height-map reading counts. */
export const ROOF_READ_MIN_CELLS = 40;

/**
 * What the (uncut) height map reads over each roof polygon: the median height
 * above grade by roof id, metres — robust to tanks and parapets. Roofs with
 * too few cells inside, or outside the grid, get no entry.
 */
export function roofReadingsFor(
  g: SurroundHeights,
  roofs: readonly { id: string; polygon: XY[] }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rf of roofs) {
    if (rf.polygon.length < 3) continue;
    // scan only the polygon's bounding box
    const xs = rf.polygon.map((p) => p.x);
    const ys = rf.polygon.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const inside: number[] = [];
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const p = cellEN(g, c, r);
        if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;
        if (inPolygon(p, rf.polygon)) inside.push(g.heights[r * g.cols + c]);
      }
    }
    if (inside.length < ROOF_READ_MIN_CELLS) continue;
    inside.sort((a, b) => a - b);
    out[rf.id] = Math.round(inside[Math.floor(inside.length / 2)] * 10) / 10;
  }
  return out;
}
