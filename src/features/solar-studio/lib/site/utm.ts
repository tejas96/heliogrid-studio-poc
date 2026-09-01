// ─── UTM ↔ WGS84 (Transverse Mercator, Snyder series) ───────────────────────
// Google Solar dataLayers rasters are georeferenced in UTM (verified live:
// EPSG:32643 for Pune — zone 43N, meters). Converting each traced vertex
// UTM → lat/lng → site-frame EN (frameFor / toEN in ./frame.ts) handles grid
// convergence and scale EXACTLY, with no proj4 dependency. Standard Snyder
// series for the WGS84 ellipsoid; accuracy ~1 mm — far inside the ≤0.5 m
// alignment gate. The forward series below is the door out (toUtm) for CAD.
const A = 6378137.0; // WGS84 semi-major
const F = 1 / 298.257223563;
const K0 = 0.9996;
const E2 = F * (2 - F); // first eccentricity²
const EP2 = E2 / (1 - E2); // second eccentricity²
const E1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));

/** EPSG 326xx (north) / 327xx (south) → zone + hemisphere; null if not UTM. */
export function utmZoneFromEpsg(epsg: number): { zone: number; north: boolean } | null {
  if (epsg >= 32601 && epsg <= 32660) return { zone: epsg - 32600, north: true };
  if (epsg >= 32701 && epsg <= 32760) return { zone: epsg - 32700, north: false };
  return null;
}

/** UTM easting/northing (meters) → { lat, lng } in degrees. */
export function utmToLatLng(
  easting: number,
  northing: number,
  zone: number,
  north: boolean,
): { lat: number; lng: number } {
  const x = easting - 500000; // remove false easting
  const y = north ? northing : northing - 10000000; // remove false northing
  const lng0 = ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180); // central meridian

  // footpoint latitude via the meridian arc
  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));
  const phi1 =
    mu +
    ((3 * E1) / 2 - (27 * E1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * E1 * E1) / 16 - (55 * E1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * E1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * E1 ** 4) / 512) * Math.sin(8 * mu);

  const sin1 = Math.sin(phi1);
  const cos1 = Math.cos(phi1);
  const tan1 = Math.tan(phi1);
  const C1 = EP2 * cos1 * cos1;
  const T1 = tan1 * tan1;
  const N1 = A / Math.sqrt(1 - E2 * sin1 * sin1);
  const R1 = (A * (1 - E2)) / Math.pow(1 - E2 * sin1 * sin1, 1.5);
  const D = x / (N1 * K0);

  const lat =
    phi1 -
    ((N1 * tan1) / R1) *
      ((D * D) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
  const lng =
    lng0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) /
      cos1;

  return { lat: lat * (180 / Math.PI), lng: lng * (180 / Math.PI) };
}

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/**
 * UTM zone for a geographic point, including the two published exceptions
 * (Norway 32V, Svalbard 31X/33X/35X/37X). India never hits either, but a wrong
 * zone silently displaces an exported drawing by hundreds of kilometres, so the
 * rule is implemented in full rather than approximated.
 */
export function utmZoneForLatLng(
  lat: number,
  lng: number,
): { zone: number; north: boolean } {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  let zone = Math.floor((wrapped + 180) / 6) + 1;
  if (zone > 60) zone = 60;
  if (lat >= 56 && lat < 64 && wrapped >= 3 && wrapped < 12) zone = 32;
  if (lat >= 72 && lat < 84) {
    if (wrapped >= 0 && wrapped < 9) zone = 31;
    else if (wrapped >= 9 && wrapped < 21) zone = 33;
    else if (wrapped >= 21 && wrapped < 33) zone = 35;
    else if (wrapped >= 33 && wrapped < 42) zone = 37;
  }
  return { zone, north: lat >= 0 };
}

/** Central meridian of a UTM zone, in radians. */
function centralMeridianRad(zone: number): number {
  return ((zone - 1) * 6 - 180 + 3) * D2R;
}

/**
 * WGS84 → UTM easting/northing (Snyder forward series). Inverse of utmToLatLng
 * to ~1 mm inside a zone — the round-trip is the gate in site-utm.test.ts.
 */
export function latLngToUtm(
  lat: number,
  lng: number,
  zone: number,
  north: boolean,
): { e: number; n: number } {
  const phi = lat * D2R;
  const lam = lng * D2R;
  const lam0 = centralMeridianRad(zone);

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);

  const N = A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const T = tanPhi * tanPhi;
  const C = EP2 * cosPhi * cosPhi;
  const Aa = (lam - lam0) * cosPhi;

  const M =
    A *
    ((1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256) * phi -
      ((3 * E2) / 8 + (3 * E2 * E2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi) +
      ((15 * E2 * E2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi) -
      ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi));

  const e =
    K0 *
      N *
      (Aa +
        ((1 - T + C) * Aa ** 3) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * Aa ** 5) / 120) +
    500000;

  let n =
    K0 *
    (M +
      N *
        tanPhi *
        ((Aa * Aa) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * Aa ** 6) / 720));
  if (!north) n += 10000000;

  return { e, n };
}

/**
 * Grid convergence: degrees that UTM grid north lies clockwise of TRUE north at
 * this point. Needed when exporting to a UTM-referenced CAD file, so the drawing
 * is not rotated by up to 3° at a zone edge.
 */
export function gridConvergenceDeg(lat: number, lng: number, zone: number): number {
  const phi = lat * D2R;
  const dLam = lng * D2R - centralMeridianRad(zone);
  return Math.atan(Math.tan(dLam) * Math.sin(phi)) * R2D;
}
