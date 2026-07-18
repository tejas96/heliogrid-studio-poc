// ─── Mask → building polygons: label, trace, simplify, orthogonalize ────────
// Zero-dependency raster vectorization (study decision): connected-component
// labeling feeds BOTH the boundary tracer here and the per-component DSM
// plane fits later, so the label raster is computed once and shared.
// Everything is deterministic — no RNG anywhere.
import type { XY } from '../../types';

export interface Components {
  /** 0 = background; 1..count = component id per pixel */
  labels: Int32Array;
  count: number;
  /** pixel count per component id (index 0 unused) */
  areas: number[];
}

/** 4-connected components of mask===1 pixels (stack-based, no recursion). */
export function labelComponents(
  mask: Uint8Array | Float32Array,
  width: number,
  height: number,
): Components {
  const labels = new Int32Array(width * height);
  const areas: number[] = [0];
  let count = 0;
  const stack: number[] = [];
  for (let start = 0; start < labels.length; start++) {
    if (mask[start] !== 1 || labels[start] !== 0) continue;
    count += 1;
    let area = 0;
    stack.push(start);
    labels[start] = count;
    while (stack.length > 0) {
      const i = stack.pop()!;
      area += 1;
      const x = i % width;
      const y = (i / width) | 0;
      // 4-neighbourhood
      if (x > 0 && mask[i - 1] === 1 && labels[i - 1] === 0) { labels[i - 1] = count; stack.push(i - 1); }
      if (x < width - 1 && mask[i + 1] === 1 && labels[i + 1] === 0) { labels[i + 1] = count; stack.push(i + 1); }
      if (y > 0 && mask[i - width] === 1 && labels[i - width] === 0) { labels[i - width] = count; stack.push(i - width); }
      if (y < height - 1 && mask[i + width] === 1 && labels[i + width] === 0) { labels[i + width] = count; stack.push(i + width); }
    }
    areas.push(area);
  }
  return { labels, count, areas };
}

/**
 * Moore-neighbour boundary trace of one component's OUTER contour, returning
 * pixel (col,row) coordinates. Jacob's stopping criterion; deterministic.
 */
export function traceBoundary(
  labels: Int32Array,
  width: number,
  height: number,
  label: number,
): XY[] {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === label;

  // topmost-leftmost pixel of the component
  let sx = -1;
  let sy = -1;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (labels[y * width + x] === label) { sx = x; sy = y; break outer; }
    }
  }
  if (sx < 0) return [];

  // Moore neighbourhood, clockwise from W
  const DIRS = [
    [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1],
  ];
  const ring: XY[] = [];
  let cx = sx;
  let cy = sy;
  let backtrack = 0; // entered from the west
  const maxSteps = width * height * 4;
  for (let step = 0; step < maxSteps; step++) {
    ring.push({ x: cx, y: cy });
    let found = false;
    // scan clockwise starting just after the backtrack direction
    for (let k = 0; k < 8; k++) {
      const dir = (backtrack + 1 + k) % 8;
      const nx = cx + DIRS[dir][0];
      const ny = cy + DIRS[dir][1];
      if (inside(nx, ny)) {
        // new backtrack = direction pointing BACK at the pixel we came from
        backtrack = (dir + 4) % 8;
        cx = nx;
        cy = ny;
        found = true;
        break;
      }
    }
    if (!found) break; // isolated pixel
    if (cx === sx && cy === sy && ring.length > 2) break; // closed the loop
  }
  return ring;
}

/** Douglas-Peucker simplification (closed ring treated as open path + seal). */
export function simplifyDP(points: XY[], tolerance: number): XY[] {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const pa = points[a];
    const pb = points[b];
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    let worst = -1;
    let worstD = tolerance;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((points[i].x - pa.x) * dy - (points[i].y - pa.y) * dx) / len;
      if (d > worstD) { worstD = d; worst = i; }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/**
 * Building-footprint orthogonalization, GATED (study decision): only when
 * ≥80% of the total edge length lies within 15° of the two dominant axes —
 * otherwise the simplified polygon is returned untouched so genuinely
 * non-rectilinear roofs are never mangled.
 * Method: length-weighted circular mean of edge headings mod 90° → rotate →
 * classify each edge H/V → merge runs → rebuild corners as H/V line
 * intersections → rotate back.
 */
export function orthogonalizeGated(poly: XY[]): XY[] {
  const n = poly.length;
  if (n < 4) return poly;

  // dominant axis via 4θ circular mean (mod 90°)
  let sumSin = 0;
  let sumCos = 0;
  let totalLen = 0;
  const edges = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    const ang = Math.atan2(q.y - p.y, q.x - p.x);
    sumSin += len * Math.sin(4 * ang);
    sumCos += len * Math.cos(4 * ang);
    totalLen += len;
    return { len, ang };
  });
  if (totalLen === 0) return poly;
  const theta = Math.atan2(sumSin, sumCos) / 4;

  // gate: edge-length share within 15° of the dominant axes (mod 90°)
  const within = edges.reduce((s, e) => {
    let d = Math.abs(((e.ang - theta) % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    d = Math.min(d, Math.PI / 2 - d);
    return s + (d <= (15 * Math.PI) / 180 ? e.len : 0);
  }, 0);
  if (within / totalLen < 0.8) return poly;

  // rotate into the dominant frame
  const cosT = Math.cos(-theta);
  const sinT = Math.sin(-theta);
  const rot = poly.map((p) => ({ x: p.x * cosT - p.y * sinT, y: p.x * sinT + p.y * cosT }));

  // classify edges H/V, merge consecutive same-class runs
  type Run = { kind: 'h' | 'v'; coords: number[] };
  const runs: Run[] = [];
  for (let i = 0; i < n; i++) {
    const p = rot[i];
    const q = rot[(i + 1) % n];
    const kind: 'h' | 'v' = Math.abs(q.x - p.x) >= Math.abs(q.y - p.y) ? 'h' : 'v';
    const coord = kind === 'h' ? (p.y + q.y) / 2 : (p.x + q.x) / 2;
    const last = runs[runs.length - 1];
    if (last && last.kind === kind) last.coords.push(coord);
    else runs.push({ kind, coords: [coord] });
  }
  // wrap-around merge
  if (runs.length > 1 && runs[0].kind === runs[runs.length - 1].kind) {
    runs[0].coords.push(...runs.pop()!.coords);
  }
  if (runs.length < 4 || runs.length % 2 !== 0) return poly; // degenerate

  const lines = runs.map((r) => ({
    kind: r.kind,
    value: r.coords.reduce((s, v) => s + v, 0) / r.coords.length,
  }));
  // corners = intersections of consecutive alternating H/V lines
  const corners: XY[] = lines.map((line, i) => {
    const next = lines[(i + 1) % lines.length];
    if (line.kind === next.kind) return { x: NaN, y: NaN }; // guarded above
    return line.kind === 'h'
      ? { x: next.value, y: line.value }
      : { x: line.value, y: next.value };
  });
  if (corners.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y))) return poly;

  // rotate back
  const cosB = Math.cos(theta);
  const sinB = Math.sin(theta);
  return corners.map((p) => ({ x: p.x * cosB - p.y * sinB, y: p.x * sinB + p.y * cosB }));
}

/**
 * DSM-guided splitting of one mask component into height-coherent regions
 * (accuracy enhancement, evidence: dense-urban masks fuse touching buildings
 * into one blob — a single plane fit over a block gives RMSE > 2 m and junk
 * confidence). Region-growing: neighbours join while their DSM step is below
 * `stepTolM` — smooth slopes stay together, distinct levels/buildings split
 * at their height discontinuity. Deterministic scan order.
 */
export function segmentByHeight(
  dsm: Float32Array | Uint8Array,
  labels: Int32Array,
  label: number,
  width: number,
  height: number,
  stepTolM = 0.75,
  bandTolM = 1.25,
): Components {
  const out = new Int32Array(width * height);
  const areas: number[] = [0];
  let count = 0;
  const stack: number[] = [];
  const eligible = (i: number) =>
    labels[i] === label && out[i] === 0 && Number.isFinite(dsm[i]) && dsm[i] > 1;
  for (let start = 0; start < out.length; start++) {
    if (!eligible(start)) continue;
    count += 1;
    let area = 0;
    // running region mean — the BAND constraint stops the chaining effect
    // (smoothed DSMs ramp gently between levels; a purely local step test
    // walks the ramp and merges distinct buildings)
    let sumZ = 0;
    stack.push(start);
    out[start] = count;
    while (stack.length > 0) {
      const i = stack.pop()!;
      area += 1;
      sumZ += dsm[i] as number;
      const mean = sumZ / area;
      const x = i % width;
      const y = (i / width) | 0;
      const z = dsm[i];
      const tryJoin = (n: number) => {
        const zn = dsm[n] as number;
        if (
          eligible(n) &&
          Math.abs(zn - z) <= stepTolM &&
          Math.abs(zn - mean) <= bandTolM
        ) {
          out[n] = count;
          stack.push(n);
        }
      };
      if (x > 0) tryJoin(i - 1);
      if (x < width - 1) tryJoin(i + 1);
      if (y > 0) tryJoin(i - width);
      if (y < height - 1) tryJoin(i + width);
    }
    areas.push(area);
  }
  return { labels: out, count, areas };
}

/**
 * Interior test for plane-fit sampling: TRUE when every pixel within
 * `radius` (Chebyshev) shares the label. Smoothed DSMs ramp at region edges —
 * sampling those ramps fakes 10–25° of pitch on flat roofs.
 */
export function isInterior(
  labels: Int32Array,
  width: number,
  height: number,
  col: number,
  row: number,
  label: number,
  radius = 3,
): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = col + dx;
      const y = row + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      if (labels[y * width + x] !== label) return false;
    }
  }
  return true;
}
