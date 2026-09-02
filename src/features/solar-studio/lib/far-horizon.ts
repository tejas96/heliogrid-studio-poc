// ─── The hills around the site, as PVGIS sees them ──────────────────────────
// One fetch per pin per session. Informational: the climate numbers already
// carry this horizon; the sun chart draws it so the designer sees it.
export interface FarHorizonPoint {
  azDeg: number;
  elevDeg: number;
}

const cache = new Map<string, Promise<FarHorizonPoint[] | null>>();

export function fetchFarHorizon(lat: number, lng: number): Promise<FarHorizonPoint[] | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = (async () => {
    try {
      const res = await fetch(`/api/site/horizon?lat=${lat}&lng=${lng}`);
      const json = (await res.json()) as { status: string; horizon?: FarHorizonPoint[] };
      return json.status === 'ok' && json.horizon?.length ? json.horizon : null;
    } catch {
      return null;
    }
  })();
  cache.set(key, p);
  return p;
}

/** elevation of the far horizon at a compass azimuth, interpolated */
export function farHorizonAt(h: FarHorizonPoint[], azDeg: number): number {
  if (h.length === 0) return 0;
  const a = ((azDeg % 360) + 360) % 360;
  let lo = h[h.length - 1];
  let hi = h[0];
  for (let i = 0; i < h.length; i++) {
    if (h[i].azDeg <= a) lo = h[i];
    if (h[i].azDeg >= a) {
      hi = h[i];
      break;
    }
  }
  const span = ((hi.azDeg - lo.azDeg) % 360 + 360) % 360 || 360;
  const t = (((a - lo.azDeg) % 360) + 360) % 360 / span;
  return lo.elevDeg + (hi.elevDeg - lo.elevDeg) * Math.min(1, Math.max(0, t));
}
