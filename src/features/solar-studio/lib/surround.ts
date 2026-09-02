// ─── Real surroundings: Google's DSM as a shading caster ─────────────────────
// The Solar API's digital surface model is a 0.1 m raster of what actually
// stands around the site — trees, sheds, water tanks, the neighbour's second
// floor. Here it becomes a 0.5 m height grid above grade in the site's own
// EN frame, with the site's roofs cut out (they are modelled exactly), and a
// heightfield mesh the shading engine raycasts like any other caster.
//
// Scope rule (plan §E, binding): GEOMETRY layers only. PVGIS stays the sole
// irradiance source — this changes WHAT shades the modules, never how much
// sun the sky delivers.
import type { LatLng, Project, SiteSurround, XY } from '../types';
import { decodeGeoTiff } from './roof-ai/geotiff-decode';
import { groundLevelM } from './roof-ai/plane-fit';
import { frameFor, toEN } from './site/frame';
import { getImage, putImage } from './persistence/blobs';
import type { SurroundHeights } from './surround-geometry';

export { buildSurroundGeometry, surroundKey } from './surround-geometry';
export type { SurroundHeights } from './surround-geometry';

export const SURROUND_RADIUS_M = 100; // the Solar API's limit at LOW quality
const DOWNSAMPLE = 5; // 0.1 m → 0.5 m
const MAX_HEIGHT_M = 80;
const CUTOUT_MARGIN_M = 1.0;
/** a roof needs this many 0.5 m cells (10 m²) before its height-map reading counts */
const ROOF_READ_MIN_CELLS = 40;
const BLOB_PREFIX = 'data:application/octet-stream;base64,';

// ── point in polygon (even-odd) — local copy so this module stays dependency-light
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

type DataLayersEnvelope = {
  status: string;
  message?: string;
  imageryDate?: string;
  imageryQuality?: string;
  layers?: { mask?: string; dsm?: string };
};

export type FetchSurroundResult =
  | { status: 'ok'; meta: SiteSurround; heights: SurroundHeights }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string };

/**
 * Fetch the DSM + building mask around the pin, turn them into a grade-
 * relative 0.5 m grid in the site frame with the site's roofs cut out, store
 * the samples in the blob store and return the metadata to persist.
 */
export async function fetchSurround(project: Project): Promise<FetchSurroundResult> {
  const loc = project.location;
  const frame = frameFor(project);
  if (!loc || !frame) return { status: 'error', message: 'No site location' };
  const pin: LatLng = loc.latLng;

  let env: DataLayersEnvelope;
  try {
    const res = await fetch(
      `/api/solar/data-layers?lat=${pin.lat.toFixed(6)}&lng=${pin.lng.toFixed(6)}&radius=${SURROUND_RADIUS_M}`,
    );
    env = (await res.json()) as DataLayersEnvelope;
  } catch {
    return { status: 'error', message: 'Could not reach the aerial data service' };
  }
  if (env.status !== 'ok' || !env.layers?.dsm || !env.layers.mask) {
    return env.status === 'unavailable'
      ? { status: 'unavailable', message: env.message ?? 'No aerial height data here' }
      : { status: 'error', message: env.message ?? 'Aerial data request failed' };
  }

  let dsmBuf: ArrayBuffer;
  let maskBuf: ArrayBuffer;
  try {
    const fetchBuf = async (url: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`raster HTTP ${r.status}`);
      return r.arrayBuffer();
    };
    [dsmBuf, maskBuf] = await Promise.all([fetchBuf(env.layers.dsm), fetchBuf(env.layers.mask)]);
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : 'Raster download failed' };
  }

  const dsm = await decodeGeoTiff(dsmBuf);
  const mask = await decodeGeoTiff(maskBuf);
  const sameGrid = dsm.width === mask.width && dsm.height === mask.height;
  const grade = sameGrid ? groundLevelM(dsm.data, mask.data) : null;
  if (grade === null) return { status: 'error', message: 'Could not estimate ground level from the DSM' };

  // ── downsample (block MAX: a thin tree top still counts as shade) ──
  const cols = Math.floor(dsm.width / DOWNSAMPLE);
  const rows = Math.floor(dsm.height / DOWNSAMPLE);
  const heights = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let m = -Infinity;
      for (let dy = 0; dy < DOWNSAMPLE; dy++) {
        const row = r * DOWNSAMPLE + dy;
        for (let dx = 0; dx < DOWNSAMPLE; dx++) {
          const v = dsm.data[row * dsm.width + c * DOWNSAMPLE + dx];
          if (Number.isFinite(v) && v > 1 && v > m) m = v;
        }
      }
      const h = m === -Infinity ? 0 : m - grade;
      heights[r * cols + c] = Math.max(0, Math.min(MAX_HEIGHT_M, h));
    }
  }

  // ── georeference: block centres → site EN; the grid is UTM-aligned, so two
  // step vectors describe it exactly (grid convergence included) ──
  const half = (DOWNSAMPLE - 1) / 2;
  const en = (c: number, r: number) => toEN(frame, dsm.pixelToLatLng(c * DOWNSAMPLE + half, r * DOWNSAMPLE + half));
  const originEN = en(0, 0);
  const e10 = en(1, 0);
  const e01 = en(0, 1);
  const stepCol = { x: e10.x - originEN.x, y: e10.y - originEN.y };
  const stepRow = { x: e01.x - originEN.x, y: e01.y - originEN.y };

  // ── what the height map says each roof is, before the cutout erases it:
  // the median over the cells inside the polygon (robust to tanks and
  // parapets). The roof-height check holds the model against this. ──
  const roofReadM: Record<string, number> = {};
  for (const rf of project.roofs) {
    if (rf.polygon.length < 3) continue;
    const inside: number[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = {
          x: originEN.x + c * stepCol.x + r * stepRow.x,
          y: originEN.y + c * stepCol.y + r * stepRow.y,
        };
        if (inPolygon(p, rf.polygon)) inside.push(heights[r * cols + c]);
      }
    }
    if (inside.length < ROOF_READ_MIN_CELLS) continue;
    inside.sort((a, b) => a - b);
    roofReadM[rf.id] = Math.round(inside[Math.floor(inside.length / 2)] * 10) / 10;
  }

  // ── the site's own roofs are modelled exactly: cut them out of the raster ──
  const polys = project.roofs.map((rf) => rf.polygon).filter((p) => p.length >= 3);
  if (polys.length > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = {
          x: originEN.x + c * stepCol.x + r * stepRow.x,
          y: originEN.y + c * stepCol.y + r * stepRow.y,
        };
        for (const poly of polys) {
          if (inPolygon(p, poly) || distToPolygon(p, poly) < CUTOUT_MARGIN_M) {
            heights[r * cols + c] = 0;
            break;
          }
        }
      }
    }
  }

  const blobId = await putImage(BLOB_PREFIX + packHeights(heights));
  const meta: SiteSurround = {
    source: 'google-solar-dsm',
    imageryDate: env.imageryDate ?? 'unknown',
    quality: env.imageryQuality ?? 'unknown',
    pin,
    radiusM: SURROUND_RADIUS_M,
    stepM: Math.hypot(stepCol.x, stepCol.y),
    cols,
    rows,
    originEN,
    stepCol,
    stepRow,
    gradeM: Math.round(grade * 100) / 100,
    blobId,
    fetchedAt: Date.now(),
    roofReadM,
  };
  const grid: SurroundHeights = { cols, rows, originEN, stepCol, stepRow, heights };
  cache.set(blobId, grid);
  return { status: 'ok', meta, heights: grid };
}

// ── packing: Int16 centimetres, base64 in the (string) blob store ──
function packHeights(h: Float32Array): string {
  const i16 = new Int16Array(h.length);
  for (let i = 0; i < h.length; i++) i16[i] = Math.round(h[i] * 100);
  const bytes = new Uint8Array(i16.buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(s);
}

function unpackHeights(b64: string, n: number): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const i16 = new Int16Array(bytes.buffer, 0, Math.min(n, bytes.length >> 1));
  const out = new Float32Array(n);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 100;
  return out;
}

const cache = new Map<string, SurroundHeights>();

/** Synchronous cache lookup for on-demand callers (the panel inspector). */
export function peekSurroundHeights(meta: SiteSurround | null | undefined): SurroundHeights | null {
  return meta ? (cache.get(meta.blobId) ?? null) : null;
}

/** The engine's grid for a persisted surround — cached, null when the blob is gone. */
export async function loadSurroundHeights(meta: SiteSurround | null | undefined): Promise<SurroundHeights | null> {
  if (!meta) return null;
  const hit = cache.get(meta.blobId);
  if (hit) return hit;
  const stored = await getImage(meta.blobId);
  if (!stored || !stored.startsWith(BLOB_PREFIX)) return null;
  const heights = unpackHeights(stored.slice(BLOB_PREFIX.length), meta.cols * meta.rows);
  const grid: SurroundHeights = {
    cols: meta.cols,
    rows: meta.rows,
    originEN: meta.originEN,
    stepCol: meta.stepCol,
    stepRow: meta.stepRow,
    heights,
  };
  cache.set(meta.blobId, grid);
  return grid;
}

/** True when the persisted surround no longer describes this pin. */
export function surroundStale(project: Project): boolean {
  const s = project.surround;
  const loc = project.location;
  if (!s || !loc) return false;
  // stored before the per-roof reading existed: fetch once more to get it
  if (!s.roofReadM) return true;
  const dLat = (s.pin.lat - loc.latLng.lat) * 111_320;
  const dLng = (s.pin.lng - loc.latLng.lng) * 111_320 * Math.cos((loc.latLng.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng) > 2;
}

