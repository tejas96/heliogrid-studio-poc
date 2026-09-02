import { describe, expect, it } from 'vitest';
import {
  buildRelief,
  RELIEF_MIN_M,
  WALL_SHADE,
  WALL_UPNESS_FULL,
  WALL_UPNESS_NONE,
} from '../SurroundRelief';
import type { SurroundHeights } from '../../lib/surround-geometry';

/** The GLSL the material runs, in TypeScript, so the thresholds are gated by the same maths. */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
const photoShareOf = (upness: number) => smoothstep(WALL_UPNESS_FULL, WALL_UPNESS_NONE, upness);
/** what the shader multiplies the photo by, at this steepness */
const brightnessOf = (upness: number) => 1 + (WALL_SHADE - 1) * (1 - photoShareOf(upness));

/**
 * A height map of ORDINARY GROUND: mostly at grade, with clumps of vegetation
 * that are rough at the half-metre sampling — the shape a rural Solar API DSM
 * actually has (measured near Sangli: median 0.01 m, 12% of cells above 0.5 m,
 * peaks near 13 m).
 */
function roughGround(): SurroundHeights {
  const cols = 120;
  const rows = 120;
  const heights = new Float32Array(cols * rows);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // three soft clumps of trees, each rough cell to cell
      let h = 0;
      for (const [cx, cy, rad, top] of [
        [30, 30, 14, 8],
        [80, 45, 18, 11],
        [55, 90, 12, 6],
      ]) {
        const d = Math.hypot(c - cx, r - cy);
        if (d < rad) h = Math.max(h, top * (1 - d / rad) + rnd() * 1.2);
      }
      heights[r * cols + c] = h;
    }
  }
  return {
    cols,
    rows,
    originEN: { x: -30, y: 30 },
    stepCol: { x: 0.5, y: 0 },
    // a raster's rows run NORTH to SOUTH, so north DECREASES with the row
    // index. Get this backwards and every face is wound the other way and the
    // relief's normals point at the ground.
    stepRow: { x: 0, y: -0.5 },
    heights,
  };
}

/** Area-weighted share of the relief that keeps its photo, using the face normals it ships with. */
function photoShare(geom: NonNullable<ReturnType<typeof buildRelief>>): number {
  const p = geom.attributes.position.array as ArrayLike<number>;
  const n = geom.attributes.normal.array as ArrayLike<number>;
  const idx = geom.index!.array as ArrayLike<number>;
  let total = 0;
  let kept = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const [A, B, C] = [idx[i], idx[i + 1], idx[i + 2]];
    const ux = p[B * 3] - p[A * 3];
    const uy = p[B * 3 + 1] - p[A * 3 + 1];
    const uz = p[B * 3 + 2] - p[A * 3 + 2];
    const vx = p[C * 3] - p[A * 3];
    const vy = p[C * 3 + 1] - p[A * 3 + 1];
    const vz = p[C * 3 + 2] - p[A * 3 + 2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const area = Math.hypot(cx, cy, cz) / 2;
    if (!(area > 0)) continue;
    total += area;
    kept += photoShareOf((n[A * 3 + 1] + n[B * 3 + 1] + n[C * 3 + 1]) / 3) * area;
  }
  return kept / total;
}

describe('the height map never out-shines the map it stands in', () => {
  it('a wall only ever DARKENS the photo — it can never be a brighter colour', () => {
    // The defect the owner photographed: walls were painted flat concrete at
    // 0.58, which rendered 2.7× brighter than the same face wearing the photo,
    // so the relief read as a white mass and flashed through the streamed
    // photomesh on every zoom. Shading the photo makes that impossible.
    expect(WALL_SHADE).toBeGreaterThan(0);
    expect(WALL_SHADE).toBeLessThanOrEqual(1);
    for (let up = 0; up <= 1.0001; up += 0.05) {
      expect(brightnessOf(up)).toBeLessThanOrEqual(1 + 1e-9);
      expect(brightnessOf(up)).toBeGreaterThanOrEqual(WALL_SHADE - 1e-9);
    }
    expect(brightnessOf(0)).toBeCloseTo(WALL_SHADE, 6); // dead vertical: fully shaded
    expect(brightnessOf(1)).toBeCloseTo(1, 6); // flat top: the photo, untouched
  });

  it('rough natural ground keeps its photo — only a near-vertical face is treated as a wall', () => {
    const geom = buildRelief(roughGround(), 180, 40);
    expect(geom).not.toBeNull();
    // Ordinary vegetation is rough at half-metre sampling but is NOT a wall.
    // The old band (0.35–0.80) left this at 0.42 — half the neighbourhood
    // painted grey. Widen the band again and this fails.
    // the faces must look UP, or nothing below is measuring what it claims
    const nrm = geom!.attributes.normal.array as ArrayLike<number>;
    const used = new Set(Array.from(geom!.index!.array as ArrayLike<number>));
    let up = 0;
    for (const i of used) if (nrm[i * 3 + 1] > 0) up++;
    expect(up / used.size).toBeGreaterThan(0.9);

    expect(photoShare(geom!)).toBeGreaterThan(0.6);
    geom!.dispose();
  });

  it('still draws only what stands off the ground', () => {
    const flat = roughGround();
    flat.heights.fill(RELIEF_MIN_M - 0.01);
    expect(buildRelief(flat, 180, 40)).toBeNull();
  });
});
