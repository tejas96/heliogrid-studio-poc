// ─── Gemini vision path: pixel detections → RoofArtifact ('gemini') ─────────
// The LLM only ever annotates PIXELS on the exact SatCanvas tile; this module
// converts them to project meters with the SAME math the canvas uses
// (including calibration.scaleFactor — a calibrated project would otherwise
// misalign by (scaleFactor−1)·distance), then hands the artifact to the SAME
// validateArtifact + ghost-review doorway as the geometric pipeline. Where
// geometric roofs exist, every Gemini roof is CROSS-CHECKED against them and
// confidence-floored on disagreement (plan §23b).
import type { LatLng, ObstructionType, XY } from '../../types';
import { metersPerStaticMap } from '../maps';
import { SAT_ZOOM } from '../../components/SatCanvas';
import { polygonArea } from '../geo';
import { OBSTRUCTION_PRESETS } from '../roof-factory';
import { ARTIFACT_VERSION, type ArtifactRoof, type RoofArtifact } from './artifact';
import polygonClipping from 'polygon-clipping';

export const GEMINI_TILE_PX = 640;

export interface GeminiDetection {
  roofs?: { polygonPx?: { x?: number; y?: number }[]; confidence?: number }[];
  objects?: {
    centerPx?: { x?: number; y?: number };
    widthPx?: number;
    heightPx?: number;
    kind?: string;
    confidence?: number;
  }[];
}

const KIND_MAP: Record<string, ObstructionType> = {
  tank: 'tank',
  water_tank: 'tank',
  dish: 'dish',
  antenna: 'dish',
  chimney: 'chimney',
  solar_water_heater: 'solar_wh',
  solar_wh: 'solar_wh',
  tree: 'tree',
  staircase: 'elevated',
  staircase_room: 'elevated',
};

/**
 * Pure conversion: Gemini pixel output on the 640px zoom-20 tile → artifact
 * meters. mx=(px/W−0.5)·span, my=(0.5−py/H)·span with the CALIBRATED span.
 */
export function geminiDetectionToArtifact(
  detection: GeminiDetection,
  pin: LatLng,
  calibrationScaleFactor: number,
  generatedAt: number,
  meta?: { promptVersion?: string; model?: string },
): RoofArtifact {
  const span = metersPerStaticMap(pin.lat, SAT_ZOOM, GEMINI_TILE_PX) * calibrationScaleFactor;
  const toM = (px: { x?: number; y?: number }): XY => ({
    x: ((px.x ?? 0) / GEMINI_TILE_PX - 0.5) * span,
    y: (0.5 - (px.y ?? 0) / GEMINI_TILE_PX) * span,
  });
  const pxToM = span / GEMINI_TILE_PX;

  const roofs = (detection.roofs ?? [])
    .filter((r) => Array.isArray(r.polygonPx) && r.polygonPx.length >= 3)
    .map((r, i) => ({
      id: `ar_g${i + 1}`,
      polygon: r.polygonPx!.map(toM),
      heightM: null, // a photo cannot measure height — manual default applies
      pitchDeg: null,
      slopeAzimuthDeg: null,
      confidence: typeof r.confidence === 'number' ? r.confidence : 0,
    }));

  const obstructions = (detection.objects ?? [])
    .filter((o) => o.centerPx && (o.widthPx ?? 0) > 0 && (o.heightPx ?? 0) > 0)
    .map((o, i) => {
      const type = KIND_MAP[(o.kind ?? '').toLowerCase()] ?? 'other';
      return {
        id: `ao_g${i + 1}`,
        type,
        center: toM(o.centerPx!),
        lengthM: (o.widthPx ?? 0) * pxToM,
        widthM: (o.heightPx ?? 0) * pxToM,
        // imagery cannot measure object height — use the type's preset
        heightM: OBSTRUCTION_PRESETS[type].size[2],
        rotationDeg: 0,
        confidence: typeof o.confidence === 'number' ? o.confidence : 0,
      };
    });

  return {
    version: ARTIFACT_VERSION,
    source: 'gemini',
    forLatLng: pin,
    generatedAt,
    imageryQuality: meta?.model ? `Gemini ${meta.model} (${meta.promptVersion ?? 'v?'})` : undefined,
    roofs,
    obstructions,
    warnings: [
      'Photo-based detection: heights/pitch are NOT measurable from imagery — defaults applied; verify on site.',
    ],
  };
}

/**
 * Cross-check (plan §23b): where GEOMETRIC roofs exist (dataLayers), a Gemini
 * roof overlapping them by < 20% of its own area is suspect — confidence is
 * floored and a warning is added. Never silently deleted: the user decides.
 */
export function crossCheckWithGeometry(
  artifact: RoofArtifact,
  referenceRoofs: ArtifactRoof[],
): RoofArtifact {
  if (referenceRoofs.length === 0 || artifact.roofs.length === 0) return artifact;
  const refPolys = referenceRoofs.map(
    (r) => [r.polygon.map((p) => [p.x, p.y] as [number, number])] as [[number, number][]],
  );
  const warnings = [...artifact.warnings];
  const roofs = artifact.roofs.map((r) => {
    const area = polygonArea(r.polygon);
    if (area <= 0) return r;
    let overlap = 0;
    try {
      const gPoly: [[number, number][]] = [r.polygon.map((p) => [p.x, p.y])];
      for (const ref of refPolys) {
        const inter = polygonClipping.intersection(gPoly, ref);
        for (const mp of inter) {
          for (const ring of mp) {
            overlap += Math.abs(
              polygonArea(ring.map(([x, y]) => ({ x, y }))),
            );
          }
        }
      }
    } catch {
      return r; // clipping failure ⇒ no judgement either way
    }
    if (overlap / area < 0.2) {
      warnings.push(
        `One AI-suggested roof disagrees with the aerial building mask (only ${Math.round((overlap / area) * 100)}% overlap) — verify before accepting.`,
      );
      return { ...r, confidence: Math.min(r.confidence, 0.25) };
    }
    return r;
  });
  return { ...artifact, roofs, warnings };
}

export type GeminiOutcome =
  | { status: 'ok'; artifact: RoofArtifact }
  | { status: 'unconfigured'; message: string }
  | { status: 'error'; message: string };

/** Satellite-tile detection via the server proxy (server fetches the tile). */
export async function detectRoofsViaGemini(
  pin: LatLng,
  calibrationScaleFactor: number,
): Promise<GeminiOutcome> {
  let env: {
    status: 'ok' | 'unconfigured' | 'error';
    message?: string;
    detection?: GeminiDetection;
    promptVersion?: string;
    model?: string;
  };
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'satellite', latLng: pin }),
    });
    env = await res.json();
  } catch {
    return { status: 'error', message: 'Could not reach the photo-analysis service' };
  }
  if (env.status !== 'ok' || !env.detection) {
    return env.status === 'unconfigured'
      ? { status: 'unconfigured', message: env.message ?? 'Photo analysis not configured' }
      : { status: 'error', message: env.message ?? 'Photo analysis failed' };
  }
  return {
    status: 'ok',
    artifact: geminiDetectionToArtifact(env.detection, pin, calibrationScaleFactor, Date.now(), {
      promptVersion: env.promptVersion,
      model: env.model,
    }),
  };
}
