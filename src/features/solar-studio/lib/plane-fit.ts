// ─── DSM analysis: roof plane fit and ground level ──────────────────────────
// Centroid-centered least-squares plane z = a·x + b·y + c over a component's
// DSM samples (study reference: the Sunroof-style per-segment pitch/azimuth
// model). RMSE of the fit is the honest confidence signal — a clean planar
// facet sits < 0.1–0.2 m; > 0.3 m means "complex roof, review by hand".
//
// This is the AERIAL HEIGHT MAP maths — what `roof-map-fit` uses to measure a
// hand-drawn roof's height/pitch/facing, and what `surround` uses to place the
// neighbours. It lived under `lib/roof-ai/` only because the removed roof
// detector happened to be its first caller.

export interface PlaneFit {
  /** gradient in the sample frame (x east, y north, meters) */
  a: number;
  b: number;
  /** plane height at the sample centroid, meters ASL */
  zAtCentroid: number;
  centroidX: number;
  centroidY: number;
  pitchDeg: number;
  /** compass azimuth the surface slopes DOWN toward (0=N, CW); null when ~flat */
  azimuthDeg: number | null;
  rmseM: number;
  samples: number;
}

/**
 * Fit a plane to (x, y, z) samples. x/y may be any consistent metric frame
 * (UTM offsets are fine — grid convergence shifts azimuth < 0.4°, below the
 * 1° reporting resolution).
 */
export function fitPlane(xs: number[], ys: number[], zs: number[]): PlaneFit | null {
  const n = xs.length;
  if (n < 12) return null;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; mz += zs[i]; }
  mx /= n; my /= n; mz /= n;

  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    const dz = zs[i] - mz;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    sxz += dx * dz; syz += dy * dz;
  }
  const det = sxx * syy - sxy * sxy;
  if (Math.abs(det) < 1e-9) return null; // degenerate footprint (a line)
  const a = (sxz * syy - syz * sxy) / det;
  const b = (syz * sxx - sxz * sxy) / det;

  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = zs[i] - mz - a * (xs[i] - mx) - b * (ys[i] - my);
    sse += r * r;
  }
  const rmseM = Math.sqrt(sse / n);
  const slope = Math.hypot(a, b);
  const pitchDeg = (Math.atan(slope) * 180) / Math.PI;
  // downslope direction = −∇z; compass azimuth = atan2(east, north)
  const azimuthDeg =
    pitchDeg >= 3
      ? ((Math.atan2(-a, -b) * 180) / Math.PI + 360) % 360
      : null;
  return { a, b, zAtCentroid: mz, centroidX: mx, centroidY: my, pitchDeg, azimuthDeg, rmseM, samples: n };
}

/**
 * Ground elevation estimate: median DSM over NON-building pixels (mask 0),
 * ignoring nodata/zeros. Coarse but robust — drives roof heightM.
 */
export function groundLevelM(
  dsm: Float32Array | Uint8Array,
  mask: Uint8Array | Float32Array,
  sampleStep = 7,
): number | null {
  const vals: number[] = [];
  for (let i = 0; i < dsm.length; i += sampleStep) {
    const z = dsm[i];
    if (mask[i] === 0 && Number.isFinite(z) && z > 1) vals.push(z);
  }
  if (vals.length < 50) return null;
  vals.sort((p, q) => p - q);
  return vals[(vals.length / 2) | 0];
}
