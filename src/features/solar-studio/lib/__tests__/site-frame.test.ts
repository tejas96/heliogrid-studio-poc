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
import { fromUtm, makeSiteFrame, reanchor, toEN, toLatLng, toUtm } from '../site/frame';

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

describe('reanchor', () => {
  it('reports the new origin expressed in the old frame', () => {
    const f = makeSiteFrame(PUNE);
    const moved = { lat: PUNE.lat + 0.0005, lng: PUNE.lng + 0.0005 };
    const { deltaEN } = reanchor(f, moved);
    expect(deltaEN.x).toBeCloseTo(toEN(f, moved).x, 9);
    expect(deltaEN.y).toBeCloseTo(toEN(f, moved).y, 9);
  });

  it('keeps geometry on the same ground when deltaEN is subtracted', () => {
    // This is the "keep the design on the same building" branch of spec section 6.
    const f = makeSiteFrame(PUNE);
    const p = { x: 40, y: -25 };
    const groundTruth = toLatLng(f, p);

    const moved = { lat: PUNE.lat + 0.0005, lng: PUNE.lng - 0.0003 };
    const { frame: f2, deltaEN } = reanchor(f, moved);
    const p2 = { x: p.x - deltaEN.x, y: p.y - deltaEN.y };

    const after = toLatLng(f2, p2);
    // under 1 mm: 1e-8 deg latitude is ~1.1 mm
    expect(after.lat).toBeCloseTo(groundTruth.lat, 8);
    expect(after.lng).toBeCloseTo(groundTruth.lng, 8);
  });

  it('carries scaleFactor and northOffsetDeg to the new frame', () => {
    const f = makeSiteFrame(PUNE, { scaleFactor: 1.02, northOffsetDeg: 4 });
    const { frame } = reanchor(f, { lat: PUNE.lat + 0.01, lng: PUNE.lng });
    expect(frame.scaleFactor).toBe(1.02);
    expect(frame.northOffsetDeg).toBe(4);
  });

  it('recomputes the UTM zone when the move crosses one', () => {
    const f = makeSiteFrame({ lat: 18.5, lng: 74.9 }); // zone 43
    const { frame } = reanchor(f, { lat: 18.5, lng: 75.1 }); // zone 43 still
    expect(frame.utmZone).toBe(43);
    const far = reanchor(f, { lat: 18.5, lng: 81.1 }); // zone 44
    expect(far.frame.utmZone).toBe(44);
  });

  it('a single translation p − deltaEN is only first-order; the per-point transform is exact', () => {
    // Spec §6 specifies p' = toEN(newFrame, toLatLng(oldFrame, p)) per point.
    // The "same ground" test above passes with p − deltaEN only because a 76 m
    // move leaves a 0.7 mm residual, inside its 1 mm tolerance. This pins the
    // residual table on reanchor's comment so slice 3 cannot build the dialog
    // on the linearised version by accident: at 13.8 km it is 4.83 m.
    const f = makeSiteFrame(PUNE);
    const p = { x: 300, y: -200 };
    const truth = toLatLng(f, p);
    const table: [number, number, number][] = [
      // [degrees moved in BOTH lat and lng, expected move m, expected residual m]
      [0.0005, 76.5, 0.00072],
      [0.005, 764.9, 0.00664],
      [0.02, 3059.5, 0.2108],
      [0.09, 13767.6, 4.826],
    ];
    for (const [d, moveM, residualM] of table) {
      const { frame: f2, deltaEN } = reanchor(f, { lat: PUNE.lat + d, lng: PUNE.lng + d });
      expect(Math.hypot(deltaEN.x, deltaEN.y)).toBeCloseTo(moveM, 0);
      const linear = { x: p.x - deltaEN.x, y: p.y - deltaEN.y };
      const exact = toEN(f2, toLatLng(f, p));
      // the residual grows with the move, exactly as the table says
      expect(Math.hypot(linear.x - exact.x, linear.y - exact.y)).toBeCloseTo(residualM, 3);
      // and the per-point transform lands on the same ground every time
      const back = toLatLng(f2, exact);
      expect(back.lat).toBeCloseTo(truth.lat, 9);
      expect(back.lng).toBeCloseTo(truth.lng, 9);
    }
  });
});

describe('UTM interchange from local EN', () => {
  it('maps the frame origin to the frame origin easting/northing', () => {
    const f = makeSiteFrame(PUNE);
    const u = toUtm(f, { x: 0, y: 0 });
    expect(u.e).toBeCloseTo(f.utmOrigin.e, 3);
    expect(u.n).toBeCloseTo(f.utmOrigin.n, 3);
  });

  it('round-trips local EN through UTM within 1 mm', () => {
    const f = makeSiteFrame(PUNE);
    for (const p of [{ x: 120, y: 80 }, { x: -95, y: -240 }]) {
      const back = fromUtm(f, toUtm(f, p));
      expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(0.001);
    }
  });

  it('round-trips under a rotated frame', () => {
    const f = makeSiteFrame(PUNE, { northOffsetDeg: 12 });
    const p = { x: 200, y: -60 };
    const back = fromUtm(f, toUtm(f, p));
    expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(0.001);
  });
});

describe('origin guards — reject, never clamp', () => {
  it('rejects a polar origin instead of building a frame that divides by zero', () => {
    // Before the guard, makeSiteFrame({ lat: 89.9999999 }) built happily and
    // toLatLng(frame, { x: 1, y: 0 }).lng came back as 1.46e13.
    expect(() => makeSiteFrame({ lat: 89.9999999, lng: 0 })).toThrow(RangeError);
    expect(() => makeSiteFrame({ lat: 90, lng: 0 })).toThrow(RangeError);
    expect(() => makeSiteFrame({ lat: -90, lng: 0 })).toThrow(RangeError);
    // and just outside the UTM band on either side
    expect(() => makeSiteFrame({ lat: 84.01, lng: 0 })).toThrow(/UTM band/);
    expect(() => makeSiteFrame({ lat: -80.01, lng: 0 })).toThrow(/UTM band/);
  });

  it('accepts the whole UTM band, edges included, and still round-trips there', () => {
    expect(() => makeSiteFrame({ lat: 84, lng: 15 })).not.toThrow();
    expect(() => makeSiteFrame({ lat: -80, lng: 15 })).not.toThrow();
    for (const f of [makeSiteFrame({ lat: 84, lng: 15 }), makeSiteFrame({ lat: -80, lng: 15 })]) {
      const p = { x: 100, y: -50 };
      const back = toEN(f, toLatLng(f, p));
      expect(Math.hypot(back.x - p.x, back.y - p.y)).toBeLessThan(0.001);
    }
  });

  it('rejects a non-finite or unnormalised origin', () => {
    expect(() => makeSiteFrame({ lat: NaN, lng: 73 })).toThrow(RangeError);
    expect(() => makeSiteFrame({ lat: 18, lng: Infinity })).toThrow(RangeError);
    // 250°E would feed latLngToUtm a 361° offset from its central meridian
    expect(() => makeSiteFrame({ lat: 18, lng: 250 })).toThrow(RangeError);
    expect(() => makeSiteFrame({ lat: 18, lng: -180.5 })).toThrow(RangeError);
  });

  it('reanchor inherits the rejection — a pin cannot be moved onto the pole', () => {
    const f = makeSiteFrame(PUNE);
    expect(() => reanchor(f, { lat: 89.9999999, lng: 0 })).toThrow(RangeError);
  });
});

describe('antimeridian — the longitude difference is wrapped into (−180, 180]', () => {
  const ORIGIN = { lat: 18.5202, lng: 179.98 };

  it('measures a point across ±180° the short way round', () => {
    const f = makeSiteFrame(ORIGIN);
    const across = toEN(f, { lat: ORIGIN.lat, lng: -179.98 }); // 0.04° EAST
    // 0.04° x N(18.52°) x cos(18.52°) x pi/180 = 4223.6 m east — not ≈38,000 km
    // west, which is what an unwrapped 359.96° difference produced.
    expect(across.x).toBeCloseTo(4223.6, 1);
    expect(across.y).toBeCloseTo(0, 6);
    // identical to the same ground point written without crossing the line
    const unwrapped = toEN(f, { lat: ORIGIN.lat, lng: 180.02 });
    expect(across.x).toBeCloseTo(unwrapped.x, 6);
  });

  it('wraps the western side as well', () => {
    const f = makeSiteFrame({ lat: ORIGIN.lat, lng: -179.98 });
    const across = toEN(f, { lat: ORIGIN.lat, lng: 179.98 }); // 0.04° WEST
    expect(across.x).toBeCloseTo(-4223.6, 1);
  });

  it('round-trips across the line and returns a canonical longitude', () => {
    const f = makeSiteFrame(ORIGIN);
    const ll = toLatLng(f, { x: 4223.6, y: 0 });
    expect(ll.lng).toBeGreaterThan(-180); // came back as -179.98 ...
    expect(ll.lng).toBeLessThan(-179.9); // ... not 180.02
    const back = toEN(f, ll);
    expect(back.x).toBeCloseTo(4223.6, 6);
    expect(back.y).toBeCloseTo(0, 6);
  });

  it('leaves an ordinary site bit-identical — the wrap has a fast path', () => {
    const f = makeSiteFrame(PUNE);
    // exact-equality expectations elsewhere in this file depend on the
    // ordinary path not passing through the modulo arithmetic
    expect(toEN(f, PUNE)).toEqual({ x: 0, y: 0 });
    const p = { lat: PUNE.lat + 0.0005, lng: PUNE.lng - 0.0003 };
    const d = (p.lng - PUNE.lng) * 105590.1; // hand-derived east metres at Pune
    expect(toEN(f, p).x).toBeCloseTo(d, 2);
  });
});

describe('makeProjector is gone', () => {
  it('lib/geo.ts no longer exports a projector', async () => {
    // A second lat/lng->metre path is exactly how the 0.57% stretch survived so
    // long: two frames that disagreed, each locally reasonable. One path only.
    const geo = await import('../geo');
    expect('makeProjector' in geo).toBe(false);
  });
});

describe('lib/site/index.ts — the public surface spec §3 lists', () => {
  it('re-exports every public function of frame.ts and utm.ts, by identity', async () => {
    const site = (await import('../site')) as Record<string, unknown>;
    for (const name of [
      'makeSiteFrame',
      'toEN',
      'toLatLng',
      'reanchor',
      'toUtm',
      'fromUtm',
      'frameFor',
      'utmZoneFromEpsg',
      'utmZoneForLatLng',
      'utmToLatLng',
      'latLngToUtm',
      'gridConvergenceDeg',
    ]) {
      expect(typeof site[name], name).toBe('function');
    }
    // the same functions, not wrappers — a consumer of either path gets one ruler
    expect(site.makeSiteFrame).toBe(makeSiteFrame);
    expect(site.toEN).toBe(toEN);
  });
});
