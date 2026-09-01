// ─── UTM forward/inverse agreement and zone selection ───────────────────────
// The inverse (utmToLatLng) already had coverage via roof-pipeline.test.ts, which
// only ever needed one direction: Google's rasters arrive in UTM and we read them.
// Export needs the FORWARD direction — a DXF must carry true eastings/northings —
// and an untested forward transform is how a drawing lands in the wrong country.
//
// The gate is a round-trip: forward then inverse must return the input. That
// catches a wrong central meridian, a dropped false easting, a hemisphere flip
// and a sign error in the series, none of which a one-way test can see.
import { describe, expect, it } from 'vitest';
import {
  gridConvergenceDeg,
  latLngToUtm,
  utmToLatLng,
  utmZoneForLatLng,
} from '../site/utm';

const PUNE = { lat: 18.5202, lng: 73.8567 };

describe('utmZoneForLatLng', () => {
  it('puts Pune in zone 43 north', () => {
    expect(utmZoneForLatLng(PUNE.lat, PUNE.lng)).toEqual({ zone: 43, north: true });
  });

  it('puts a southern-hemisphere point in the south', () => {
    // Melbourne
    expect(utmZoneForLatLng(-37.81, 144.96)).toEqual({ zone: 55, north: false });
  });

  it('applies the Norway 32V exception', () => {
    // 58°N 7°E would fall in zone 31 by the plain formula; the exception widens 32.
    expect(utmZoneForLatLng(58, 7).zone).toBe(32);
  });

  it('applies the Svalbard exceptions', () => {
    expect(utmZoneForLatLng(78, 5).zone).toBe(31);
    expect(utmZoneForLatLng(78, 15).zone).toBe(33);
    expect(utmZoneForLatLng(78, 25).zone).toBe(35);
    expect(utmZoneForLatLng(78, 38).zone).toBe(37);
  });
});

describe('latLngToUtm', () => {
  it('round-trips Pune within 1 mm', () => {
    const { e, n } = latLngToUtm(PUNE.lat, PUNE.lng, 43, true);
    const back = utmToLatLng(e, n, 43, true);
    // 1e-8 degrees is ~1.1 mm of latitude
    expect(back.lat).toBeCloseTo(PUNE.lat, 8);
    expect(back.lng).toBeCloseTo(PUNE.lng, 8);
  });

  it('round-trips a southern-hemisphere point within 1 mm', () => {
    const p = { lat: -37.81, lng: 144.96 };
    const { e, n } = latLngToUtm(p.lat, p.lng, 55, false);
    const back = utmToLatLng(e, n, 55, false);
    expect(back.lat).toBeCloseTo(p.lat, 8);
    expect(back.lng).toBeCloseTo(p.lng, 8);
  });

  it('reproduces the roof-pipeline fixture origin', () => {
    // roof-pipeline.test.ts asserts this UTM point decodes into the Pune area.
    // Going the other way must land back on the same easting/northing.
    const ll = utmToLatLng(386730.1, 2047619.8, 43, true);
    const { e, n } = latLngToUtm(ll.lat, ll.lng, 43, true);
    expect(e).toBeCloseTo(386730.1, 3);
    expect(n).toBeCloseTo(2047619.8, 3);
  });

  it('places a point on the central meridian at the false easting', () => {
    // Zone 43's central meridian is 75°E. On it, easting is exactly 500000.
    const { e } = latLngToUtm(18.5, 75, 43, true);
    expect(e).toBeCloseTo(500000, 3);
  });
});

describe('gridConvergenceDeg', () => {
  it('is zero on the central meridian', () => {
    expect(gridConvergenceDeg(18.5, 75, 43)).toBeCloseTo(0, 6);
  });

  it('is small and negative west of the central meridian at Pune', () => {
    // Pune sits ~1.14° west of 75°E, so grid north leans east of true north.
    const g = gridConvergenceDeg(PUNE.lat, PUNE.lng, 43);
    expect(g).toBeLessThan(0);
    expect(g).toBeGreaterThan(-0.5);
  });
});
