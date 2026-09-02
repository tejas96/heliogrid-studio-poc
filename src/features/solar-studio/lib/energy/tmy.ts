// ─── The site's typical year, hour by hour (PVGIS TMY) ──────────────────────
// 8760 hours of global, beam and diffuse irradiance, air temperature and wind
// for the pin. Fetched once per pin through /api/pvgis/tmy, packed to Int16
// and kept in the blob store like the height map; an in-memory cache serves
// the engine synchronously once it is loaded. Metadata lives on the project
// (SiteLocation.tmy); the samples never do.
import type { LatLng, SiteTmy } from '../../types';
import { getImage, putImage } from '../persistence/blobs';

export const HOURS_PER_YEAR = 8760;

/** The unpacked year the engine reads. Irradiances in W/m², temperature °C, wind m/s. */
export interface TmyYear {
  ghi: Float32Array;
  dni: Float32Array;
  dhi: Float32Array;
  tair: Float32Array;
  wind: Float32Array;
  /** the hour's values are averages centred this far into the hour */
  timeOffsetH: number;
}

const BLOB_PREFIX = 'data:application/octet-stream;base64,';
const cache = new Map<string, TmyYear>();
const listeners = new Set<() => void>();
let version = 0;

export function subscribeTmy(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function tmyVersion(): number {
  return version;
}

function bump(): void {
  version++;
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    (window as unknown as { __tmy?: unknown }).__tmy = { version, loaded: [...cache.keys()] };
  }
  for (const fn of listeners) fn();
}

/** Int16 per value: irradiance W/m² as is, temperature and wind × 100. */
export function packTmy(t: { ghi: number[]; dni: number[]; dhi: number[]; tair: number[]; wind: number[] }): string {
  const n = HOURS_PER_YEAR;
  const i16 = new Int16Array(n * 5);
  for (let h = 0; h < n; h++) {
    i16[h] = Math.round(t.ghi[h]);
    i16[n + h] = Math.round(t.dni[h]);
    i16[2 * n + h] = Math.round(t.dhi[h]);
    i16[3 * n + h] = Math.round(t.tair[h] * 100);
    i16[4 * n + h] = Math.round(t.wind[h] * 100);
  }
  const bytes = new Uint8Array(i16.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(s);
}

export function unpackTmy(b64: string, timeOffsetH: number): TmyYear | null {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const n = HOURS_PER_YEAR;
  if (bytes.length < n * 5 * 2) return null;
  const i16 = new Int16Array(bytes.buffer, 0, n * 5);
  const slice = (k: number, scale: number) => {
    const out = new Float32Array(n);
    for (let h = 0; h < n; h++) out[h] = i16[k * n + h] / scale;
    return out;
  };
  return { ghi: slice(0, 1), dni: slice(1, 1), dhi: slice(2, 1), tair: slice(3, 100), wind: slice(4, 100), timeOffsetH };
}

export type FetchTmyResult =
  | { status: 'ok'; meta: SiteTmy; year: TmyYear }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string };

/** Fetch the pin's typical year, store it, and hand back its metadata + samples. */
export async function fetchTmy(pin: LatLng): Promise<FetchTmyResult> {
  let env: {
    status: string;
    message?: string;
    tmy?: {
      ghi: number[];
      dni: number[];
      dhi: number[];
      tair: number[];
      wind: number[];
      radiationDb: string;
      yearMin: number | null;
      yearMax: number | null;
      timeOffsetH: number;
      elevationM: number | null;
    };
  };
  try {
    const res = await fetch(`/api/pvgis/tmy?lat=${pin.lat.toFixed(6)}&lng=${pin.lng.toFixed(6)}`);
    env = await res.json();
  } catch {
    return { status: 'error', message: 'Could not reach the climate service' };
  }
  if (env.status !== 'ok' || !env.tmy) {
    return env.status === 'unavailable'
      ? { status: 'unavailable', message: env.message ?? 'No hourly climate year here' }
      : { status: 'error', message: env.message ?? 'Climate request failed' };
  }
  const t = env.tmy;
  if (t.ghi.length !== HOURS_PER_YEAR) return { status: 'error', message: 'Climate year incomplete' };
  const blobId = await putImage(BLOB_PREFIX + packTmy(t));
  const meta: SiteTmy = {
    source: 'pvgis-tmy',
    blobId,
    forLatLng: pin,
    radiationDb: t.radiationDb,
    yearMin: t.yearMin,
    yearMax: t.yearMax,
    timeOffsetH: t.timeOffsetH,
    elevationM: t.elevationM,
    fetchedAt: Date.now(),
  };
  const year = unpackTmy(packTmy(t), t.timeOffsetH)!;
  cache.set(blobId, year);
  bump();
  return { status: 'ok', meta, year };
}

/** Synchronous cache lookup — the engine's path. Null until loaded. */
export function peekTmy(meta: SiteTmy | null | undefined): TmyYear | null {
  return meta ? (cache.get(meta.blobId) ?? null) : null;
}

/** The year for a persisted TMY — cached, null when the blob is gone. */
export async function loadTmy(meta: SiteTmy | null | undefined): Promise<TmyYear | null> {
  if (!meta) return null;
  const hit = cache.get(meta.blobId);
  if (hit) return hit;
  const stored = await getImage(meta.blobId);
  if (!stored) return null;
  const year = unpackTmy(stored.slice(stored.indexOf(',') + 1), meta.timeOffsetH);
  if (!year) return null;
  cache.set(meta.blobId, year);
  bump();
  return year;
}

/** True when the stored year no longer belongs to this pin. */
export function tmyStale(meta: SiteTmy | null | undefined, pin: LatLng): boolean {
  if (!meta) return false;
  const dLat = (meta.forLatLng.lat - pin.lat) * 111_320;
  const dLng = (meta.forLatLng.lng - pin.lng) * 111_320 * Math.cos((pin.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) > 500; // PVGIS grids are kilometres wide
}
