// ─── Astronomical core: sun position (NOAA-style), solar time, sunrise/set ──
// Extracted from lib/solar.ts so physics modules (shading, row-shade, poa,
// heatmap) can consume the sun WITHOUT importing the energy model — keeping
// the dependency graph acyclic. lib/solar.ts re-exports everything here, so
// existing imports keep working unchanged.

export interface SunPos {
  /** radians above horizon (negative = below) */
  altitude: number;
  /** radians clockwise from north */
  azimuth: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Julian day from a JS Date (UTC). */
function julianDay(date: Date): number {
  return date.getTime() / 86400000 - 0.5 + 2440588;
}

/**
 * Compute sun altitude/azimuth for a date-time and location.
 * Standard astronomical algorithm (solar declination + hour angle).
 */
export function sunPosition(date: Date, lat: number, lng: number): SunPos {
  const d = julianDay(date) - 2451545;
  // mean anomaly & ecliptic longitude of the sun
  const g = rad((357.529 + 0.98560028 * d) % 360);
  const q = (280.459 + 0.98564736 * d) % 360;
  const L = rad(
    (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g) + 360) % 360,
  );
  const e = rad(23.439 - 0.00000036 * d);
  const sinDec = Math.sin(e) * Math.sin(L);
  const dec = Math.asin(sinDec);
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  // sidereal time
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lst = rad(((gmst * 15 + lng) % 360 + 360) % 360);
  const ha = lst - ra;
  const latR = rad(lat);
  const altitude = Math.asin(
    Math.sin(latR) * sinDec + Math.cos(latR) * Math.cos(dec) * Math.cos(ha),
  );
  const azimuth = Math.atan2(
    Math.sin(ha),
    Math.cos(ha) * Math.sin(latR) - Math.tan(dec) * Math.cos(latR),
  );
  // convert so 0 = North, clockwise (astronomers measure from south)
  return { altitude, azimuth: azimuth + Math.PI };
}

/**
 * UTC instant for a given LOCAL MEAN-SOLAR hour at longitude `lng`
 * (solarHour 12 = solar noon). Derived purely from longitude, so sun sampling
 * is identical regardless of the machine/browser timezone — the fix for
 * viewing an out-of-timezone project. East longitude is positive.
 */
export function solarHourDate(
  year: number,
  month: number,
  day: number,
  solarHour: number,
  lng: number,
): Date {
  return new Date(Date.UTC(year, month, day) + (solarHour - lng / 15) * 3_600_000);
}

/** Solar-time sunrise & sunset (local mean-solar hours 0..24), TZ-independent. */
export function sunriseSunset(
  date: Date,
  lat: number,
  lng: number,
): { sunrise: number; sunset: number } {
  // scan the solar day in 2-min steps for horizon crossings — robust and simple
  const y = date.getFullYear();
  const mo = date.getMonth();
  const d = date.getDate();
  let sunrise = 6;
  let sunset = 18;
  let prevAlt = -1;
  for (let m = 0; m <= 24 * 60; m += 2) {
    const { altitude } = sunPosition(solarHourDate(y, mo, d, m / 60, lng), lat, lng);
    if (prevAlt <= 0 && altitude > 0) sunrise = m / 60;
    if (prevAlt > 0 && altitude <= 0) sunset = m / 60;
    prevAlt = altitude;
  }
  return { sunrise, sunset };
}

