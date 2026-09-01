// ─── The ruler gate: lat/lng ↔ local metres must be geodetically exact ──────
// lib/geo.ts `makeProjector` converted latitude with the EQUATORIAL radius
// (6378137 m), giving 111,320 m per degree. The true meridian arc at Pune
// (18.52°N) is 110,686 m. Every shape that entered the app as lat/lng — every
// AI-detected roof, every Google Solar segment — was therefore stretched
// +0.57% north-south: 23 cm on a 40 m shed, 1.1 m on a 200 m factory roof.
// Hand-traced roofs came from the canvas, whose Web Mercator resolution is
// isotropic and correct, so the two disagreed with each other.
//
// roof-pipeline.test.ts previously encoded the stretch as expected behaviour
// ("north: spherical projector vs ellipsoid meridian → 50.31 m"). That
// expectation is corrected in Task 5. THIS file is the gate that stops it
// coming back: the metres-per-degree assertions below fail loudly if the
// equatorial radius is ever reintroduced.
import { describe, expect, it } from 'vitest';
import { makeSiteFrame, toEN, toLatLng } from '../site/frame';

const PUNE = { lat: 18.5202, lng: 73.8567 };

describe('metres per degree at the site (D1 regression)', () => {
  it('uses the true meridian arc for latitude, not the equatorial radius', () => {
    const f = makeSiteFrame(PUNE);
    const en = toEN(f, { lat: PUNE.lat + 0.001, lng: PUNE.lng });
    // True: 0.001° x M(18.52°) x pi/180 = 110.686 m
    // Bug:  0.001° x 6378137 x pi/180   = 111.320 m
    expect(en.y).toBeCloseTo(110.686, 1);
    expect(en.y).toBeLessThan(111.0); // hard floor: the bug cannot return
    expect(en.x).toBeCloseTo(0, 6);
  });

  it('uses the prime-vertical radius for longitude', () => {
    const f = makeSiteFrame(PUNE);
    const en = toEN(f, { lat: PUNE.lat, lng: PUNE.lng + 0.001 });
    // 0.001° x N(18.52°) x cos(18.52°) x pi/180 = 105.590 m
    // The old projector gave 105.554 m — east was already near-correct (-0.03%).
    expect(en.x).toBeCloseTo(105.59, 1);
    expect(en.y).toBeCloseTo(0, 6);
  });

  it('is anisotropic in the right direction: a degree of latitude is longer', () => {
    const f = makeSiteFrame(PUNE);
    const north = toEN(f, { lat: PUNE.lat + 0.001, lng: PUNE.lng }).y;
    const east = toEN(f, { lat: PUNE.lat, lng: PUNE.lng + 0.001 }).x;
    expect(north).toBeGreaterThan(east);
  });
});

describe('round-trip', () => {
  it('returns the origin for the zero point', () => {
    const f = makeSiteFrame(PUNE);
    expect(toEN(f, PUNE)).toEqual({ x: 0, y: 0 });
    const back = toLatLng(f, { x: 0, y: 0 });
    expect(back.lat).toBeCloseTo(PUNE.lat, 12);
    expect(back.lng).toBeCloseTo(PUNE.lng, 12);
  });

  it('round-trips all four quadrants to under 1 mm at 300 m', () => {
    const f = makeSiteFrame(PUNE);
    for (const p of [
      { x: 300, y: 300 },
      { x: -300, y: 300 },
      { x: 300, y: -300 },
      { x: -300, y: -300 },
    ]) {
      const back = toEN(f, toLatLng(f, p));
      expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(0.001);
    }
  });

  it('round-trips to under 1 cm at 1 km', () => {
    const f = makeSiteFrame(PUNE);
    const p = { x: 1000, y: 1000 };
    const back = toEN(f, toLatLng(f, p));
    expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(0.01);
  });

  it('works in the southern hemisphere', () => {
    const f = makeSiteFrame({ lat: -37.81, lng: 144.96 });
    const p = { x: 250, y: -180 };
    const back = toEN(f, toLatLng(f, p));
    expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(0.001);
  });
});

describe('northOffsetDeg rotates into image-aligned axes', () => {
  it('is a no-op at 0 degrees (the north-up default)', () => {
    const a = toEN(makeSiteFrame(PUNE), { lat: PUNE.lat + 0.001, lng: PUNE.lng });
    const b = toEN(makeSiteFrame(PUNE, { northOffsetDeg: 0 }), {
      lat: PUNE.lat + 0.001,
      lng: PUNE.lng,
    });
    expect(a).toEqual(b);
  });

  it('puts true north 90 deg clockwise of image-up onto +x', () => {
    // northOffsetDeg = 90 means true north lies 90 deg clockwise of image-up,
    // i.e. along image-right. A point due north must therefore land on +x.
    const f = makeSiteFrame(PUNE, { northOffsetDeg: 90 });
    const en = toEN(f, { lat: PUNE.lat + 0.001, lng: PUNE.lng });
    expect(en.x).toBeCloseTo(110.686, 1);
    expect(en.y).toBeCloseTo(0, 6);
  });

  it('round-trips under rotation', () => {
    const f = makeSiteFrame(PUNE, { northOffsetDeg: 23.5 });
    const p = { x: 140, y: -70 };
    const back = toEN(f, toLatLng(f, p));
    expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(0.001);
  });
});

describe('scaleFactor is carried but never applied to the geodetic conversion', () => {
  it('does not change toEN', () => {
    // Stored EN is already TRUE metres: lib/calibration.ts rescales geometry once
    // at calibration time. scaleFactor corrects the IMAGERY (pixels -> metres) and
    // is consumed by the imagery layer. Applying it here would double-count it.
    const plain = toEN(makeSiteFrame(PUNE), { lat: PUNE.lat + 0.001, lng: PUNE.lng });
    const scaled = toEN(makeSiteFrame(PUNE, { scaleFactor: 1.05 }), {
      lat: PUNE.lat + 0.001,
      lng: PUNE.lng,
    });
    expect(scaled).toEqual(plain);
  });

  it('is still recorded on the frame for the imagery layer to read', () => {
    expect(makeSiteFrame(PUNE, { scaleFactor: 1.05 }).scaleFactor).toBe(1.05);
  });
});

describe('UTM anchor', () => {
  it('records the zone, hemisphere, origin easting/northing and convergence', () => {
    const f = makeSiteFrame(PUNE);
    expect(f.utmZone).toBe(43);
    expect(f.utmNorth).toBe(true);
    expect(f.utmOrigin.e).toBeGreaterThan(300000);
    expect(f.utmOrigin.e).toBeLessThan(700000);
    expect(f.convergenceDeg).toBeLessThan(0);
    expect(f.convergenceDeg).toBeGreaterThan(-0.5);
  });
});
