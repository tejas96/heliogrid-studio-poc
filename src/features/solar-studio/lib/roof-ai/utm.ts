// ─── UTM → WGS84 inverse (Transverse Mercator) ──────────────────────────────
// Google Solar dataLayers rasters are georeferenced in UTM (verified live:
// EPSG:32643 for Pune — zone 43N, meters). Converting each traced vertex
// UTM → lat/lng → makeProjector local-EN handles grid convergence and scale
// EXACTLY, with no proj4 dependency. Standard Snyder series for the WGS84
// ellipsoid; accuracy ~1 mm — far inside the ≤0.5 m alignment gate.
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
