// ─── The ruler: lat/lng <-> local metres, geodetically exact at site scale ──
// Replaces lib/geo.ts `makeProjector`, which used the EQUATORIAL radius for
// latitude and so stretched every lat/lng-derived shape +0.57% north-south.
// See lib/__tests__/site-frame.test.ts for the regression gate.
//
// Model: first-order local ENU using the true radii of curvature at the origin
// latitude. Round-trip error is under 1 mm at 300 m and under 1 cm at 1 km,
// which is an order of magnitude tighter than the imagery this sits on.
import type { LatLng, XY } from '../../types';
import { gridConvergenceDeg, latLngToUtm, utmZoneForLatLng } from './utm';
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

export function makeSiteFrame(
  origin: LatLng,
  opts?: { scaleFactor?: number; northOffsetDeg?: number },
): SiteFrame {
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
  const dE = (p.lng - frame.origin.lng) * mpd.lng; // true east metres
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

/** Exact inverse of toEN. */
export function toLatLng(frame: SiteFrame, p: XY): LatLng {
  const t = frame.northOffsetDeg * D2R;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const dE = p.x * cos - p.y * sin;
  const dN = p.x * sin + p.y * cos;
  const mpd = metresPerDegree(frame.origin);
  return {
    lat: frame.origin.lat + dN / mpd.lat,
    lng: frame.origin.lng + dE / mpd.lng,
  };
}
