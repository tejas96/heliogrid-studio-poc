// ─── The ruler: lat/lng <-> local metres, geodetically exact at site scale ──
// Replaces lib/geo.ts `makeProjector`, which used the EQUATORIAL radius
// (6378137 m) and so stretched every lat/lng-derived shape +0.57% north-south
// against true ground. The canvas ruler, metersPerStaticMap in lib/maps.ts
// (156543.03392 = 2π·6378137/256), is the SAME spherical model, so the two
// legacy rulers agreed with each other and were both wrong: a/M = 1.005720
// north-south, a/N = 0.999662 east-west at Pune. This frame makes the geodetic
// path exact and leaves the imagery spherical (slice 2 owns metres-per-pixel),
// so until then detected and traced geometry disagree by a/M − 1 = 0.572%
// north-south. lib/__tests__/site-frame.test.ts is the regression gate;
// lib/__tests__/imagery-scale-parity.test.ts pins the size of that gap.
//
// Model: first-order local ENU using the true radii of curvature at the origin
// latitude. Round-trip error is under 1 mm at 300 m and under 1 cm at 1 km,
// which is an order of magnitude tighter than the imagery this sits on.
import type { LatLng, Project, XY } from '../../types';
import { gridConvergenceDeg, latLngToUtm, utmToLatLng, utmZoneForLatLng } from './utm';
import type { SiteFrame } from './types';

export type { SiteFrame } from './types';

const A = 6378137.0; // WGS84 semi-major
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const D2R = Math.PI / 180;

/** Meridional radius of curvature at latitude phi (radians). */
function meridionalRadius(phi: number): number {
  const s = Math.sin(phi);
  return (A * (1 - E2)) / Math.pow(1 - E2 * s * s, 1.5);
}

/** Prime-vertical radius of curvature at latitude phi (radians). */
function primeVerticalRadius(phi: number): number {
  const s = Math.sin(phi);
  return A / Math.sqrt(1 - E2 * s * s);
}

/** Metres per degree of latitude and of longitude at the frame origin. */
function metresPerDegree(origin: LatLng): { lat: number; lng: number } {
  const phi = origin.lat * D2R;
  return {
    lat: meridionalRadius(phi) * D2R,
    lng: primeVerticalRadius(phi) * Math.cos(phi) * D2R,
  };
}

/**
 * Origin latitudes the frame accepts: the UTM band, 80°S to 84°N.
 *
 * Policy: REJECT with a RangeError — never clamp. Outside the band the
 * frame's UTM anchor is undefined (UPS territory), and towards the poles
 * metres-per-degree of longitude → 0, so toLatLng would divide by it: before
 * this guard a frame at 89.9999999° returned lng = 1.46e13. Clamping instead
 * would leave the origin silently different from the project's location, so
 * frameFor / normalizeSiteFrame would rebuild it on every read and the frame
 * would describe a place the pin is not. A non-finite or unnormalised origin
 * (|lng| > 180 corrupts the UTM anchor) is rejected for the same reason.
 * Every production caller passes a confirmed pin or a normalize-validated
 * location, and repository.ts isolates a throwing normalizeProject per
 * project, so a bad stored origin drops that one project, not the store.
 *
 * Not guarded: an explicitly passed NaN for scaleFactor / northOffsetDeg
 * bypasses the `??` defaults. Every current caller passes normalize- or
 * UI-validated values, so it is left alone.
 */
const MIN_ORIGIN_LAT = -80;
const MAX_ORIGIN_LAT = 84;

function assertUsableOrigin(origin: LatLng): void {
  if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
    throw new RangeError(`site frame origin must be finite, got ${origin.lat}, ${origin.lng}`);
  }
  if (origin.lat < MIN_ORIGIN_LAT || origin.lat > MAX_ORIGIN_LAT) {
    throw new RangeError(
      `site frame origin latitude ${origin.lat} is outside the UTM band ${MIN_ORIGIN_LAT}..${MAX_ORIGIN_LAT}`,
    );
  }
  if (origin.lng < -180 || origin.lng > 180) {
    throw new RangeError(`site frame origin longitude ${origin.lng} is outside -180..180`);
  }
}

/**
 * Longitude difference wrapped into (−180, 180], so the frame measures across
 * the antimeridian the short way round: a frame at 179.98°E converting a
 * point at 179.98°W is 0.04° (≈4.2 km) EAST of the origin, not 359.96° west —
 * without the wrap toEN returned x ≈ −38,000 km. The ordinary case
 * (|d| ≤ 180) returns d untouched, so no site in the world loses a bit of
 * precision to the modulo arithmetic.
 */
function wrapLngDelta(d: number): number {
  if (d > -180 && d <= 180) return d;
  const w = ((((d + 180) % 360) + 360) % 360) - 180; // [-180, 180)
  return w === -180 ? 180 : w;
}

export function makeSiteFrame(
  origin: LatLng,
  opts?: { scaleFactor?: number; northOffsetDeg?: number },
): SiteFrame {
  assertUsableOrigin(origin);
  const { zone, north } = utmZoneForLatLng(origin.lat, origin.lng);
  return {
    origin,
    utmZone: zone,
    utmNorth: north,
    utmOrigin: latLngToUtm(origin.lat, origin.lng, zone, north),
    convergenceDeg: gridConvergenceDeg(origin.lat, origin.lng, zone),
    scaleFactor: opts?.scaleFactor ?? 1,
    northOffsetDeg: opts?.northOffsetDeg ?? 0,
  };
}

/**
 * lat/lng -> local metres in the project's IMAGE-aligned axes (+x right,
 * +y up). scaleFactor is deliberately NOT applied — see SiteFrame.scaleFactor.
 */
export function toEN(frame: SiteFrame, p: LatLng): XY {
  const mpd = metresPerDegree(frame.origin);
  const dE = wrapLngDelta(p.lng - frame.origin.lng) * mpd.lng; // true east metres
  const dN = (p.lat - frame.origin.lat) * mpd.lat; // true north metres
  const t = frame.northOffsetDeg * D2R;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  // True north sits at bearing +northOffsetDeg (clockwise) from image-up, so
  // north maps to (sin t, cos t) and east to (cos t, -sin t) in image axes.
  return {
    x: dE * cos + dN * sin,
    y: -dE * sin + dN * cos,
  };
}

/**
 * Exact inverse of toEN. The longitude comes back canonical, in (−180, 180],
 * so a point east of a frame at 179.98°E reads as −179.98 rather than 180.02.
 */
export function toLatLng(frame: SiteFrame, p: XY): LatLng {
  const t = frame.northOffsetDeg * D2R;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const dE = p.x * cos - p.y * sin;
  const dN = p.x * sin + p.y * cos;
  const mpd = metresPerDegree(frame.origin);
  return {
    lat: frame.origin.lat + dN / mpd.lat,
    lng: wrapLngDelta(frame.origin.lng + dE / mpd.lng),
  };
}

/**
 * Move the frame's origin, keeping every other frame property — the
 * FRAME-LEVEL operation of spec §6. Unconsumed in slice 1; slice 3's dialog
 * consumes it.
 *
 * `deltaEN` is the NEW origin expressed in the OLD frame: the move distance
 * the dialog shows and gates on (|deltaEN| > 1 m). Spec §6:
 *   keep the design on the same building -> p' = toEN(frame', toLatLng(frame, p))
 *   slide the design to the new spot     -> leave p alone
 *
 * Do NOT apply the move as one translation, `p' = p − deltaEN`. That is exact
 * only to first order: the new frame's origin latitude changed, so its
 * metres-per-degree differ, and one constant leaves a residual that grows
 * with the move and with the geometry's distance from the origin. Measured
 * for geometry at (300, −200), moving the pin equally in lat and lng:
 *
 *     move       residual of p − deltaEN
 *     76 m       0.7 mm
 *     765 m      6.6 mm
 *     3.06 km    0.21 m
 *     13.8 km    4.83 m
 *
 * The exact per-point transform costs two calls per vertex and is good to the
 * frame's own round-trip error (< 1 mm at 300 m). site-frame.test.ts pins
 * both the residual and the exactness.
 */
export function reanchor(
  frame: SiteFrame,
  newOrigin: LatLng,
): { frame: SiteFrame; deltaEN: XY } {
  const deltaEN = toEN(frame, newOrigin);
  return {
    frame: makeSiteFrame(newOrigin, {
      scaleFactor: frame.scaleFactor,
      northOffsetDeg: frame.northOffsetDeg,
    }),
    deltaEN,
  };
}

/** Local EN -> UTM easting/northing, for files that leave the app. */
export function toUtm(frame: SiteFrame, p: XY): { e: number; n: number } {
  const ll = toLatLng(frame, p);
  return latLngToUtm(ll.lat, ll.lng, frame.utmZone, frame.utmNorth);
}

/** UTM easting/northing -> local EN, for files that enter the app. */
export function fromUtm(frame: SiteFrame, p: { e: number; n: number }): XY {
  const ll = utmToLatLng(p.e, p.n, frame.utmZone, frame.utmNorth);
  return toEN(frame, ll);
}

/**
 * The frame for a project, or null when no location is confirmed. The single
 * accessor every consumer uses — never read `project.siteFrame` directly.
 *
 * Two authorities, both enforced here: `location` owns the origin, and
 * `calibration` owns `scaleFactor` and `northOffsetDeg`. A stored frame that
 * disagrees with either is rebuilt. The calibration half matters today:
 * CalibrateDialog (Step2Roof) writes `calibration.northOffsetDeg` and never
 * touches `siteFrame`, and `toEN` DOES apply the offset — so a frame left at
 * 0° beside a calibration at 7° would place a Google Solar segment centre up
 * to 2.4 m off inside the roof-hint matcher's 20 m gate, while shading, the
 * scene and the north badge all used 7°. A frame that agrees with both is
 * returned by reference, so memoised consumers keep a stable identity.
 *
 * `normalizeSiteFrame` in lib/persistence/normalize.ts applies the same rule
 * at load time; keep the two in step.
 */
export function frameFor(
  project: Pick<Project, 'location' | 'calibration' | 'siteFrame'>,
): SiteFrame | null {
  if (!project.location) return null;
  const f = project.siteFrame;
  const { latLng } = project.location;
  const { scaleFactor, northOffsetDeg } = project.calibration;
  if (
    f &&
    f.origin.lat === latLng.lat &&
    f.origin.lng === latLng.lng &&
    f.scaleFactor === scaleFactor &&
    f.northOffsetDeg === northOffsetDeg
  ) {
    return f;
  }
  return makeSiteFrame(latLng, { scaleFactor, northOffsetDeg });
}
