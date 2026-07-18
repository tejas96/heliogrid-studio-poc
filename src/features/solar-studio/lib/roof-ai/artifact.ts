// ─── RoofArtifact v1: the ONLY doorway from AI output into the project ──────
// Plan §10 (binding): AI processes never emit prose or touch the store — they
// produce THIS versioned, validated structure, the user reviews it as ghosts,
// and acceptance converts entities through the SAME factory the manual tools
// use. Every entity carries provenance + confidence; nothing enters silently.
//
//   AI output → validateArtifact (schema → pin → geometry → bounds →
//   confidence) → ghost review → applyArtifact (ONE undoable patch)
import type { LatLng, Obstruction, ObstructionType, Project, Roof, XY } from '../../types';
import {
  latLngClose,
  makeObstruction,
  makeRoof,
  preCleanRing,
  sanitizeRoofPolygon,
} from '../roof-factory';
import { pickRoofAt } from '../roof-topology';
import { pointInPolygon, polygonCentroid } from '../geo';

export const ARTIFACT_VERSION = 1 as const;
export type ArtifactSource = 'dataLayers' | 'gemini';

export interface ArtifactRoof {
  /** deterministic within the artifact (e.g. 'ar_1') — replaced on accept */
  id: string;
  /** local east-north meters around the project pin; any winding */
  polygon: XY[];
  /** eave height above ground; null = unknown → manual default (3 m) */
  heightM: number | null;
  /** null = unknown → flat default */
  pitchDeg: number | null;
  slopeAzimuthDeg: number | null;
  /** 0..1 — plane-fit / detector quality */
  confidence: number;
  /** plane-fit RMSE in meters, when a DSM fit produced this roof */
  rmseM?: number;
}

export interface ArtifactObstruction {
  id: string;
  type: ObstructionType;
  center: XY;
  lengthM: number;
  widthM: number;
  heightM: number;
  rotationDeg: number;
  confidence: number;
}

export interface RoofArtifact {
  version: typeof ARTIFACT_VERSION;
  source: ArtifactSource;
  /** the pin this was generated for — guards against stale reuse after a move */
  forLatLng: LatLng;
  generatedAt: number;
  imageryDate?: string;
  imageryQuality?: string;
  roofs: ArtifactRoof[];
  obstructions: ArtifactObstruction[];
  /** honest caveats surfaced in the review UI (e.g. 'building mask empty') */
  warnings: string[];
}

// ─── Staged validation ───────────────────────────────────────────────────────

/** entities live within this radius of the pin (dataLayers max is 100 m) */
const MAX_EXTENT_M = 150;
const PIN_TOL_DEG = 1e-3; // ~110 m — same pin, allowing minor re-centering

export interface ValidatedArtifact {
  ok: true;
  artifact: RoofArtifact;
  /** entity ids removed by validation, with reasons — shown in the review UI */
  dropped: { id: string; reason: string }[];
}
export interface RejectedArtifact {
  ok: false;
  error: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isXY = (v: unknown): v is XY =>
  !!v && isNum((v as XY).x) && isNum((v as XY).y);

const clamp01 = (v: unknown): number => (isNum(v) ? Math.min(1, Math.max(0, v)) : 0);

const OBSTRUCTION_TYPES: ObstructionType[] = [
  'tank', 'dish', 'chimney', 'tree', 'elevated', 'building',
  'solar_wh', 'ladder', 'windmill', 'turbine_vent', 'other',
];

/**
 * Validate an untrusted artifact against the CURRENT pin. Whole-artifact
 * failures reject (wrong version/pin/shape); per-entity failures DROP the
 * entity with a reason and keep the rest — one bad polygon must not discard
 * an otherwise-good detection.
 */
export function validateArtifact(
  raw: unknown,
  expectedPin: LatLng,
): ValidatedArtifact | RejectedArtifact {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Artifact is not an object' };
  const a = raw as Partial<RoofArtifact>;
  if (a.version !== ARTIFACT_VERSION) {
    return { ok: false, error: `Unsupported artifact version ${String(a.version)}` };
  }
  if (a.source !== 'dataLayers' && a.source !== 'gemini') {
    return { ok: false, error: 'Unknown artifact source' };
  }
  if (!a.forLatLng || !isNum(a.forLatLng.lat) || !isNum(a.forLatLng.lng)) {
    return { ok: false, error: 'Artifact has no location pin' };
  }
  if (!latLngClose(a.forLatLng, expectedPin, PIN_TOL_DEG)) {
    return { ok: false, error: 'Artifact was generated for a different location' };
  }
  if (!Array.isArray(a.roofs) || !Array.isArray(a.obstructions)) {
    return { ok: false, error: 'Artifact entity lists are malformed' };
  }

  const dropped: { id: string; reason: string }[] = [];
  const inExtent = (p: XY) => Math.hypot(p.x, p.y) <= MAX_EXTENT_M;

  const roofs: ArtifactRoof[] = [];
  for (const [i, r] of a.roofs.entries()) {
    const id = typeof r?.id === 'string' ? r.id : `ar_${i + 1}`;
    if (!Array.isArray(r?.polygon) || !r.polygon.every(isXY)) {
      dropped.push({ id, reason: 'polygon is not a point list' });
      continue;
    }
    const cleaned = preCleanRing(r.polygon);
    const sanitized = sanitizeRoofPolygon(cleaned);
    if (!sanitized.ok) {
      dropped.push({ id, reason: sanitized.reason });
      continue;
    }
    if (!sanitized.polygon.every(inExtent)) {
      dropped.push({ id, reason: `outside the ${MAX_EXTENT_M} m site extent` });
      continue;
    }
    roofs.push({
      id,
      polygon: sanitized.polygon,
      heightM: isNum(r.heightM) && r.heightM > 0 && r.heightM < 60 ? r.heightM : null,
      pitchDeg: isNum(r.pitchDeg) && r.pitchDeg >= 0 && r.pitchDeg <= 60 ? r.pitchDeg : null,
      slopeAzimuthDeg:
        isNum(r.slopeAzimuthDeg) && r.slopeAzimuthDeg >= 0 && r.slopeAzimuthDeg < 360
          ? r.slopeAzimuthDeg
          : null,
      confidence: clamp01(r.confidence),
      rmseM: isNum(r.rmseM) ? r.rmseM : undefined,
    });
  }

  const obstructions: ArtifactObstruction[] = [];
  for (const [i, o] of a.obstructions.entries()) {
    const id = typeof o?.id === 'string' ? o.id : `ao_${i + 1}`;
    if (!isXY(o?.center) || !inExtent(o.center)) {
      dropped.push({ id, reason: 'center missing or outside the site extent' });
      continue;
    }
    if (!isNum(o.lengthM) || !isNum(o.widthM) || o.lengthM <= 0 || o.widthM <= 0) {
      dropped.push({ id, reason: 'invalid footprint dimensions' });
      continue;
    }
    if (o.lengthM > 50 || o.widthM > 50 || !isNum(o.heightM) || o.heightM <= 0 || o.heightM > 60) {
      dropped.push({ id, reason: 'implausible dimensions' });
      continue;
    }
    obstructions.push({
      id,
      type: OBSTRUCTION_TYPES.includes(o.type as ObstructionType)
        ? (o.type as ObstructionType)
        : 'other',
      center: o.center,
      lengthM: o.lengthM,
      widthM: o.widthM,
      heightM: o.heightM,
      rotationDeg: isNum(o.rotationDeg) ? ((o.rotationDeg % 360) + 360) % 360 : 0,
      confidence: clamp01(o.confidence),
    });
  }

  return {
    ok: true,
    artifact: {
      version: ARTIFACT_VERSION,
      source: a.source,
      forLatLng: a.forLatLng,
      generatedAt: isNum(a.generatedAt) ? a.generatedAt : 0,
      imageryDate: typeof a.imageryDate === 'string' ? a.imageryDate : undefined,
      imageryQuality: typeof a.imageryQuality === 'string' ? a.imageryQuality : undefined,
      roofs,
      obstructions,
      warnings: Array.isArray(a.warnings) ? a.warnings.filter((w) => typeof w === 'string') : [],
    },
    dropped,
  };
}

// ─── Acceptance: artifact entities → real project entities ──────────────────

/**
 * Convert the ACCEPTED subset of a validated artifact into real project
 * entities via the shared factory. Returns ONE patch — the caller applies it
 * as a single undoable step. Roofs accept first so obstruction roof-parenting
 * sees them; artifact roofs fully inside an accepted/new roof become mumtys.
 */
export function applyArtifact(
  project: Project,
  artifact: RoofArtifact,
  accepted: { roofIds: Set<string>; obstructionIds: Set<string> },
): Partial<Project> {
  const newRoofs: Roof[] = [];
  const provenance = (confidence: number) => ({ source: artifact.source, confidence });

  for (const ar of artifact.roofs) {
    if (!accepted.roofIds.has(ar.id)) continue;
    const allRoofs = [...project.roofs, ...newRoofs];
    // mumty rule (Step 2): fully contained in an existing roof ⇒ stacked
    const parent =
      allRoofs.find(
        (r) =>
          ar.polygon.every((p) => pointInPolygon(p, r.polygon)) &&
          pointInPolygon(polygonCentroid(ar.polygon), r.polygon),
      ) ?? null;
    newRoofs.push(
      makeRoof({
        polygon: ar.polygon,
        existing: allRoofs,
        parent,
        heightM: ar.heightM ?? undefined,
        pitchDeg: ar.pitchDeg ?? undefined,
        slopeAzimuthDeg: ar.slopeAzimuthDeg ?? undefined,
        provenance: provenance(ar.confidence),
      }),
    );
  }

  const roofsAfter = [...project.roofs, ...newRoofs];
  const newObstructions: Obstruction[] = [];
  for (const ao of artifact.obstructions) {
    if (!accepted.obstructionIds.has(ao.id)) continue;
    newObstructions.push(
      makeObstruction({
        type: ao.type,
        center: ao.center,
        existing: [...project.obstructions, ...newObstructions],
        roofId: pickRoofAt(ao.center, roofsAfter)?.id ?? null,
        lengthM: ao.lengthM,
        widthM: ao.widthM,
        heightM: ao.heightM,
        rotationDeg: ao.rotationDeg,
        provenance: provenance(ao.confidence),
      }),
    );
  }

  const patch: Partial<Project> = {};
  if (newRoofs.length > 0) patch.roofs = roofsAfter;
  if (newObstructions.length > 0) {
    patch.obstructions = [...project.obstructions, ...newObstructions];
  }
  return patch;
}
