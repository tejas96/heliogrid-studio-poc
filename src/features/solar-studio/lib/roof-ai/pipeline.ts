// ─── dataLayers → RoofArtifact: the full detection pipeline ─────────────────
// mask GeoTIFF → components → boundary trace → (UTM → lat/lng → project EN)
// → simplify → gated orthogonalize → DSM plane fit (pitch/azimuth/RMSE →
// confidence) → obstruction residual clusters → RoofArtifact v1 (UNVALIDATED
// — the caller MUST run validateArtifact before showing ghosts).
//
// Deterministic: no RNG, no clock (generatedAt comes from the caller), stable
// ids (ar_N / ao_N by descending component area). Pure math — runs in a
// Web Worker in the app and directly under vitest against the real fixtures.
import type { LatLng, XY } from '../../types';
import { makeProjector } from '../geo';
import { decodeGeoTiff, type DecodedRaster } from './geotiff-decode';
import { isInterior, labelComponents, orthogonalizeGated, segmentByHeight, simplifyDP, traceBoundary } from './vectorize';
import { fitPlane, groundLevelM, residualClusters } from './plane-fit';
import type { RoofArtifact } from './artifact';
import { ARTIFACT_VERSION } from './artifact';

export interface DetectInput {
  maskBuffer: ArrayBuffer;
  dsmBuffer: ArrayBuffer;
  /** the project pin — origin of the local east-north frame */
  pin: LatLng;
  imageryDate?: string;
  imageryQuality?: string;
  generatedAt: number;
}

const MIN_ROOF_AREA_PX = 2000; // ≈ 20 m² at 0.1 m/px
const MAX_ROOFS = 8;
const SIMPLIFY_TOL_M = 0.4;
const MAX_PLANE_SAMPLES = 5000;

export async function detectRoofArtifact(input: DetectInput): Promise<RoofArtifact> {
  const [mask, dsm] = await Promise.all([
    decodeGeoTiff(input.maskBuffer),
    decodeGeoTiff(input.dsmBuffer),
  ]);
  const warnings: string[] = [];
  const artifact: RoofArtifact = {
    version: ARTIFACT_VERSION,
    source: 'dataLayers',
    forLatLng: input.pin,
    generatedAt: input.generatedAt,
    imageryDate: input.imageryDate,
    imageryQuality: input.imageryQuality,
    roofs: [],
    obstructions: [],
    warnings,
  };

  const { width, height, data: maskData } = mask;
  const comps = labelComponents(maskData, width, height);
  const bigEnough = [];
  for (let label = 1; label <= comps.count; label++) {
    if (comps.areas[label] >= MIN_ROOF_AREA_PX) bigEnough.push(label);
  }
  if (bigEnough.length === 0) {
    warnings.push(
      'The aerial building mask is empty here — no roofs auto-detected. Draw the roof manually, or try the photo-based detection.',
    );
    return artifact;
  }
  bigEnough.sort((a, b) => comps.areas[b] - comps.areas[a]);

  const project = makeProjector(input.pin);
  const pixelToEN = (col: number, row: number): XY => project.toXY(mask.pixelToLatLng(col, row));
  // the DSM shares the mask's grid (same request) — verify, don't assume
  const sameGrid = dsm.width === width && dsm.height === height;
  if (!sameGrid) warnings.push('DSM and mask grids differ — heights/pitch skipped.');
  const ground = sameGrid ? groundLevelM(dsm.data, maskData) : null;
  if (sameGrid && ground === null) {
    warnings.push('Could not estimate ground level — roof heights use the default.');
  }

  // ACCURACY (evidence-driven): urban masks fuse touching buildings into one
  // blob — split every component into height-coherent sub-buildings first, so
  // each gets its own footprint + plane fit (RMSE drops from meters to cm on
  // clean levels, and obstruction residuals stop being fit noise).
  interface Candidate { labels: Int32Array; label: number; areaPx: number }
  const candidates: Candidate[] = [];
  for (const label of bigEnough) {
    if (sameGrid) {
      const sub = segmentByHeight(dsm.data, comps.labels, label, width, height);
      let used = 0;
      for (let sl = 1; sl <= sub.count; sl++) {
        if (sub.areas[sl] >= MIN_ROOF_AREA_PX) {
          candidates.push({ labels: sub.labels, label: sl, areaPx: sub.areas[sl] });
          used += 1;
        }
      }
      // fall back to the whole component if height data segmented it away
      if (used === 0) candidates.push({ labels: comps.labels, label, areaPx: comps.areas[label] });
    } else {
      candidates.push({ labels: comps.labels, label, areaPx: comps.areas[label] });
    }
  }
  candidates.sort((a, b) => b.areaPx - a.areaPx);
  if (candidates.length > MAX_ROOFS) {
    warnings.push(`Detected ${candidates.length} roof surfaces; importing the largest ${MAX_ROOFS}.`);
  }

  let roofIdx = 0;
  let obIdx = 0;
  for (const cand of candidates.slice(0, MAX_ROOFS)) {
    const { labels: candLabels, label } = cand;
    // 1) footprint: trace in pixel space, convert EVERY vertex through the
    //    raster's own georeferencing (UTM) into the project frame, simplify
    //    in METERS, then orthogonalize (gated)
    const ringPx = traceBoundary(candLabels, width, height, label);
    if (ringPx.length < 4) continue;
    const ringEN = ringPx.map((p) => pixelToEN(p.x, p.y));
    const simplified = simplifyDP(ringEN, SIMPLIFY_TOL_M);
    const polygon = orthogonalizeGated(simplified);
    if (polygon.length < 3) continue;

    // 2) plane fit over the component's DSM samples (UTM meters — consistent
    //    local frame; grid convergence < 0.4° ≪ the 1° azimuth resolution)
    let pitchDeg: number | null = null;
    let azimuthDeg: number | null = null;
    let heightM: number | null = null;
    let rmseM: number | undefined;
    let confidence = 0.4; // footprint-only default when no DSM support
    if (sameGrid) {
      const step = Math.max(1, Math.floor(Math.sqrt(cand.areaPx / MAX_PLANE_SAMPLES)));
      const xs: number[] = [];
      const ys: number[] = [];
      const zs: number[] = [];
      for (let row = 0; row < height; row += step) {
        for (let col = 0; col < width; col += step) {
          const i = row * width + col;
          if (candLabels[i] !== label) continue;
          // skip edge ramps — the smoothed DSM slopes at region borders and
          // would fake double-digit pitch on flat roofs
          if (!isInterior(candLabels, width, height, col, row, label)) continue;
          const z = dsm.data[i];
          if (!Number.isFinite(z) || z <= 1) continue;
          const [e, n] = mask.pixelToUtm(col, row);
          xs.push(e);
          ys.push(n);
          zs.push(z);
        }
      }
      const plane = fitPlane(xs, ys, zs);
      if (plane) {
        pitchDeg = Math.round(plane.pitchDeg * 10) / 10;
        azimuthDeg = plane.azimuthDeg !== null ? Math.round(plane.azimuthDeg) : null;
        rmseM = Math.round(plane.rmseM * 100) / 100;
        // eave height ≈ LOW side of the plane above ground: centroid height
        // minus half the plane's rise across the footprint
        if (ground !== null) {
          const h = plane.zAtCentroid - ground;
          if (h > 1 && h < 60) heightM = Math.round(h * 10) / 10;
        }
        // RMSE → confidence (0.3 m fit noise ⇒ 0.5): honest, monotonic
        confidence = Math.max(0.2, Math.min(0.95, 1 - plane.rmseM / 0.6));
        if (plane.rmseM > 0.3) {
          warnings.push(
            `Roof ${roofIdx + 1}: uneven surface (fit RMSE ${plane.rmseM.toFixed(2)} m) — likely multiple planes or clutter; review by hand.`,
          );
        }

        // 3) obstruction candidates: things RISING above the fitted plane.
        // GATED on fit quality — residuals of a bad fit are noise, not
        // objects — and capped to the largest few per roof.
        const clusters =
          plane.rmseM <= 0.5
            ? residualClusters(dsm.data, candLabels, label, width, height, plane, mask.pixelToUtm)
                .filter((c) => c.heightM >= 0.5)
                .sort((a, b) => b.areaPx - a.areaPx)
                .slice(0, 5)
            : [];
        for (const c of clusters) {
          const centerEN = pixelToEN((c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2);
          const cornerA = pixelToEN(c.minX, c.minY);
          const cornerB = pixelToEN(c.maxX, c.maxY);
          obIdx += 1;
          artifact.obstructions.push({
            id: `ao_${obIdx}`,
            type: 'other', // the DSM sees a lump; the USER classifies it
            center: centerEN,
            lengthM: Math.max(0.3, Math.abs(cornerB.x - cornerA.x)),
            widthM: Math.max(0.3, Math.abs(cornerB.y - cornerA.y)),
            heightM: Math.round(c.heightM * 10) / 10,
            rotationDeg: 0,
            confidence: 0.5,
          });
        }
      }
    }

    roofIdx += 1;
    artifact.roofs.push({
      id: `ar_${roofIdx}`,
      polygon,
      heightM,
      pitchDeg,
      slopeAzimuthDeg: azimuthDeg,
      confidence,
      rmseM,
    });
  }
  return artifact;
}

// re-exported so the worker/tests can reuse the decode without a second import path
export { decodeGeoTiff };
export type { DecodedRaster };
