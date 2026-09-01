# Site Frame (Step 1, Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `lib/site/frame.ts` the single, geodetically correct source of every
lat/lng ↔ local-metre conversion in the studio. Every lat/lng-derived shape (AI-detected
roofs, Google Solar segments) was 0.57% too long north–south **against true ground**
because `makeProjector` used the equatorial radius.

> **Corrected record (final review).** This plan originally said the stretch "affects
> every AI-detected shape" while hand-traced shapes were correct, so the two disagreed.
> That was false. The canvas ruler `metersPerStaticMap` (lib/maps.ts) is the *same*
> spherical model — 156543.03392 = 2π·6378137/256 — so hand-traced roofs carried the
> identical stretch and the two legacy paths *agreed* with each other (~1 cm over 50 m).
> Verified numerically: canvas/true = 1.005720 north–south and 0.999662 east–west at
> Pune, identical to `makeProjector`'s a/M and a/N. This slice therefore does not close a
> disagreement; it makes the geodetic path exact and leaves the imagery path spherical,
> which **opens** a known a/M − 1 = 0.572% north–south gap between detected and traced
> geometry until slice 2 corrects the imagery scale (spec §3.3 blocking precondition;
> pinned by `lib/__tests__/imagery-scale-parity.test.ts`). The maths stays: stored EN must
> be true ground metres because the BOM prices steel by the metre.

**Architecture:** A new `lib/site/` module holds a `SiteFrame` — a local ENU frame on the
WGS84 ellipsoid anchored at the project pin, plus UTM interchange for files that leave
the app. `SiteFrame` is stored on `Project`, defaulted for existing saved projects
without touching their geometry. `makeProjector` in `lib/geo.ts` is deleted and its three
callers move to the frame. The imagery scale — `metersPerStaticMap`, consumed by
`SatCanvas.tsx:99`, `Scene3D.tsx:1161` and `gemini-client.ts:54` — is deliberately **not**
touched here; slice 2 owns metres-per-pixel.

**Tech Stack:** TypeScript, React 19, Next.js, three.js, Vitest (node environment, jsdom
opt-in per file), Zustand-style store in `store/store.tsx`, localStorage + IndexedDB
persistence.

**Spec:** [docs/superpowers/specs/2026-09-01-studio-step1-site-design.md](../specs/2026-09-01-studio-step1-site-design.md) — this plan implements §3.1 and §7 only (spec slice 1 of 5).

## Global Constraints

- **Edit/Write only.** Never mutate source with `sed`, `perl`, `python` or any shell
  rewrite — it has corrupted files in this repo before (CLAUDE.md).
- **Both gates green before every commit:** `npx vitest run` and `npx tsc --noEmit`.
- **No raw values outside `src/design/tokens.css`.** No hex, no arbitrary px, no inline
  `style={{}}` in new design-system UI. This slice adds no UI, so it does not apply, but
  it binds any incidental edit.
- **WGS84 constants, exact:** `a = 6378137.0`, `f = 1 / 298.257223563`,
  `e² = f(2 − f)`, `k₀ = 0.9996`, false easting `500000`, false northing `10000000` (south).
- **Project XY convention:** `+x` = image-right, `+y` = image-up. With the default
  `northOffsetDeg = 0`, `+y` is true north. Verified against
  `lib/__tests__/roof-pipeline.test.ts:70` (a point 50 m south has smaller `y`).
- **Sun-frame convention (do not change):** `lib/shading.ts` uses
  `az = sunAzimuth + northOffsetDeg`. The frame's rotation must agree with this sign.
- **Canonical test site:** Pune, `{ lat: 18.5202, lng: 73.8567 }` — matches the
  `datalayers-pune-dense` fixture already in `lib/__tests__/fixtures/`.
- **Test style:** Vitest `describe`/`it`/`expect`. Files live in
  `src/features/solar-studio/lib/__tests__/`. Explain *why* a gate exists in a header
  comment, matching `one-frame.test.ts`.
- **Do not touch** roof drawing, obstructions, imagery, the surround, imports, or any
  screen other than `Step2Roof.tsx`'s single projector call. Those are slices 2–5.

---

### Task 1: UTM interchange module

Move the existing UTM inverse into the new module and add the missing forward
transform, zone selection and grid convergence. The forward direction is what lets
exported CAD carry true survey coordinates.

**Files:**
- Create: `src/features/solar-studio/lib/site/utm.ts` (content moved from `lib/roof-ai/utm.ts`, plus new functions)
- Delete: `src/features/solar-studio/lib/roof-ai/utm.ts`
- Modify: `src/features/solar-studio/lib/roof-ai/geotiff-decode.ts:12` (import path)
- Modify: `src/features/solar-studio/lib/__tests__/roof-pipeline.test.ts:10` (import path)
- Test: `src/features/solar-studio/lib/__tests__/site-utm.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  ```ts
  export function utmZoneFromEpsg(epsg: number): { zone: number; north: boolean } | null
  export function utmZoneForLatLng(lat: number, lng: number): { zone: number; north: boolean }
  export function utmToLatLng(easting: number, northing: number, zone: number, north: boolean): { lat: number; lng: number }
  export function latLngToUtm(lat: number, lng: number, zone: number, north: boolean): { e: number; n: number }
  export function gridConvergenceDeg(lat: number, lng: number, zone: number): number
  ```

- [ ] **Step 1: Move the existing file, unchanged**

Create `src/features/solar-studio/lib/site/utm.ts` containing the **exact current
contents** of `src/features/solar-studio/lib/roof-ai/utm.ts` (constants `A`, `F`, `K0`,
`E2`, `EP2`, `E1`, plus `utmZoneFromEpsg` and `utmToLatLng`). Update its header comment's
first line to:

```ts
// ─── UTM ↔ WGS84 (Transverse Mercator, Snyder series) ───────────────────────
```

Then delete `src/features/solar-studio/lib/roof-ai/utm.ts` and repoint its two importers:

- `lib/roof-ai/geotiff-decode.ts:12` → `import { utmToLatLng, utmZoneFromEpsg } from '../site/utm';`
- `lib/__tests__/roof-pipeline.test.ts:10` → `import { utmToLatLng } from '../site/utm';`

- [ ] **Step 2: Run the suite to prove the move is inert**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, same counts as before the move. A pure move must change nothing.

- [ ] **Step 3: Commit the move on its own**

```bash
git add src/features/solar-studio/lib/site/utm.ts src/features/solar-studio/lib/roof-ai/utm.ts src/features/solar-studio/lib/roof-ai/geotiff-decode.ts src/features/solar-studio/lib/__tests__/roof-pipeline.test.ts
git commit -m "refactor: move roof-ai/utm.ts to the new lib/site module

UTM is a site-level concern, not a roof-detection one. Pure move plus
import repointing; no behaviour change."
```

- [ ] **Step 4: Write the failing tests for the new functions**

Create `src/features/solar-studio/lib/__tests__/site-utm.test.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/site-utm.test.ts`
Expected: FAIL — `latLngToUtm`, `utmZoneForLatLng` and `gridConvergenceDeg` are not
exported from `../site/utm`.

- [ ] **Step 6: Implement the three new functions**

Append to `src/features/solar-studio/lib/site/utm.ts`:

```ts
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
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/site-utm.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 8: Run both gates and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite PASS, no type errors.

```bash
git add src/features/solar-studio/lib/site/utm.ts src/features/solar-studio/lib/__tests__/site-utm.test.ts
git commit -m "feat(site): add UTM forward transform, zone selection and convergence

The inverse already existed for reading Google's georeferenced rasters. Export
needs the forward direction so a DXF carries true survey coordinates. Round-trip
gate at 1 mm; zone rule includes the Norway and Svalbard exceptions."
```

---

### Task 2: The ENU frame — the ruler fix

The core of the slice. `SiteFrame` plus exact lat/lng ↔ local-metre conversion,
with the regression test that pins the 0.57% bug shut forever.

**Files:**
- Create: `src/features/solar-studio/lib/site/types.ts`
- Create: `src/features/solar-studio/lib/site/frame.ts`
- Test: `src/features/solar-studio/lib/__tests__/site-frame.test.ts`

**Interfaces:**
- Consumes: `utmZoneForLatLng`, `latLngToUtm`, `gridConvergenceDeg` from Task 1.
- Produces:
  ```ts
  export interface SiteFrame {
    origin: LatLng;
    utmZone: number;
    utmNorth: boolean;
    utmOrigin: { e: number; n: number };
    convergenceDeg: number;
    scaleFactor: number;
    northOffsetDeg: number;
  }
  export function makeSiteFrame(origin: LatLng, opts?: { scaleFactor?: number; northOffsetDeg?: number }): SiteFrame
  export function toEN(frame: SiteFrame, p: LatLng): XY
  export function toLatLng(frame: SiteFrame, p: XY): LatLng
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/features/solar-studio/lib/__tests__/site-frame.test.ts`:

```ts
// ─── The ruler gate: lat/lng ↔ local metres must be geodetically exact ──────
// lib/geo.ts `makeProjector` converted latitude with the EQUATORIAL radius
// (6378137 m), giving 111,320 m per degree. The true meridian arc at Pune
// (18.52°N) is 110,686 m. Every shape that entered the app as lat/lng — every
// AI-detected roof, every Google Solar segment — was therefore stretched
// +0.57% north-south against true ground: 23 cm on a 40 m shed, 1.1 m on a
// 200 m factory roof.
//
// Hand-traced roofs came from the canvas, whose ruler (metersPerStaticMap,
// 156543.03392 = 2π·6378137/256) is the SAME spherical model, so the two legacy
// rulers AGREED with each other and were both wrong against the ground (a/M =
// 1.005720 north-south, a/N = 0.999662 east-west at Pune). This frame makes the
// geodetic path exact and leaves the imagery spherical, so they now disagree by
// 0.572% north-south until slice 2 — imagery-scale-parity.test.ts pins that gap.
// [Corrected in the final review: the header first said the canvas was
// "isotropic and correct, so the two disagreed" — false.]
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/site-frame.test.ts`
Expected: FAIL — cannot resolve `../site/frame`.

- [ ] **Step 3: Create the types file**

Create `src/features/solar-studio/lib/site/types.ts`:

```ts
// ─── Site-level types: the frame everything geometric is measured against ───
import type { LatLng } from '../../types';

/**
 * The site's coordinate frame. Local ENU on the WGS84 ellipsoid, anchored at the
 * confirmed pin, with the axes aligned to the IMAGERY (not to true north — see
 * northOffsetDeg). UTM fields are interchange only: they let an exported drawing
 * carry real survey coordinates, and they are never used for internal geometry.
 */
export interface SiteFrame {
  /** the confirmed pin — origin of the local frame */
  origin: LatLng;
  /** UTM zone containing the origin (interchange only) */
  utmZone: number;
  /** true = northern hemisphere (interchange only) */
  utmNorth: boolean;
  /** the origin's UTM easting/northing, so local EN -> UTM is offset + rotation */
  utmOrigin: { e: number; n: number };
  /** degrees UTM grid north lies clockwise of TRUE north at the origin */
  convergenceDeg: number;
  /**
   * IMAGERY correction (pixels -> metres), carried here so one object describes
   * the whole site. Deliberately NOT applied by toEN: lib/calibration.ts already
   * rescales stored geometry once, so stored EN is true metres.
   */
  scaleFactor: number;
  /**
   * Degrees TRUE north lies clockwise of the image's up axis. Mirrors
   * Calibration.northOffsetDeg and the sun-frame convention in lib/shading.ts
   * (`az = sunAzimuth + northOffsetDeg`). 0 = north-up imagery, the default.
   */
  northOffsetDeg: number;
}
```

- [ ] **Step 4: Implement the frame**

Create `src/features/solar-studio/lib/site/frame.ts`:

```ts
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
const R2D = 180 / Math.PI;

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
```

Do not declare an `R2D` constant here — nothing in this file needs it. `F` is used only
to derive `E2`; keep both.

**Expect a type-only import cycle in Task 4** and do not try to break it:
`lib/site/types.ts` imports `LatLng` from `../../types`, and `types.ts` will import
`SiteFrame` back from `./lib/site/types`. Both are `import type`, so TypeScript and
esbuild erase them entirely — there is no runtime cycle. Keep both as `import type`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/site-frame.test.ts`
Expected: PASS, 13 tests.

If `en.y` in the first test does not land near 110.686, do **not** widen the assertion.
Re-derive `meridionalRadius` — the expected value is fixed by geodesy, not by taste.

- [ ] **Step 6: Run both gates and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite PASS (`roof-pipeline.test.ts` still passes — nothing calls the
frame yet), no type errors.

```bash
git add src/features/solar-studio/lib/site/types.ts src/features/solar-studio/lib/site/frame.ts src/features/solar-studio/lib/__tests__/site-frame.test.ts
git commit -m "feat(site): add the geodetically exact ENU site frame

makeProjector used the equatorial radius for latitude, stretching every
lat/lng-derived shape +0.57% north-south (1.1 m on a 200 m roof). The frame
uses the true meridional and prime-vertical radii at the site latitude, and
applies northOffsetDeg, which makeProjector never did.

Round-trip under 1 mm at 300 m. site-frame.test.ts pins the metres-per-degree
values so the equatorial radius cannot return."
```

---

### Task 3: Re-anchoring

The operation that lets the pin move without destroying a design (spec §6).
Pure maths only — the dialog and the patch land in slice 3.

**Files:**
- Modify: `src/features/solar-studio/lib/site/frame.ts`
- Modify: `src/features/solar-studio/lib/__tests__/site-frame.test.ts`

**Interfaces:**
- Consumes: `SiteFrame`, `toEN`, `toLatLng` from Task 2.
- Produces:
  ```ts
  export function reanchor(frame: SiteFrame, newOrigin: LatLng): { frame: SiteFrame; deltaEN: XY }
  export function toUtm(frame: SiteFrame, p: XY): { e: number; n: number }
  export function fromUtm(frame: SiteFrame, p: { e: number; n: number }): XY
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/features/solar-studio/lib/__tests__/site-frame.test.ts`:

```ts
import { fromUtm, reanchor, toUtm } from '../site/frame';

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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/site-frame.test.ts`
Expected: FAIL — `reanchor`, `toUtm`, `fromUtm` are not exported.

- [ ] **Step 3: Implement**

Append to `src/features/solar-studio/lib/site/frame.ts`, and add `utmToLatLng` to the
existing import from `./utm`:

```ts
/**
 * Move the frame's origin, keeping every other frame property.
 *
 * `deltaEN` is the NEW origin expressed in the OLD frame. Spec section 6:
 *   keep the design on the same building -> p' = p - deltaEN
 *   slide the design to the new spot     -> leave p alone
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
```

- [ ] **Step 4: Run to verify passing**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/site-frame.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Run both gates and commit**

Run: `npx vitest run && npx tsc --noEmit`

```bash
git add src/features/solar-studio/lib/site/frame.ts src/features/solar-studio/lib/__tests__/site-frame.test.ts
git commit -m "feat(site): add reanchor and UTM interchange to the site frame

reanchor is the maths behind removing the >25 m pin-move wipe: it returns the
shift to apply so geometry stays on the same ground. toUtm/fromUtm are the door
for CAD in and out."
```

---

### Task 4: Put the frame on `Project`, and migrate saved projects

Spec §7 and decision A8: existing geometry is copied through **unchanged**. Only
future lat/lng ↔ EN conversions use the corrected maths.

**Files:**
- Modify: `src/features/solar-studio/types.ts` (add `siteFrame` to `Project`)
- Modify: `src/features/solar-studio/lib/persistence/normalize.ts` (default it on load)
- Modify: `src/features/solar-studio/store/store.tsx:127` area (default it on create)
- Test: `src/features/solar-studio/lib/__tests__/site-migration.test.ts`

**Interfaces:**
- Consumes: `makeSiteFrame` and `SiteFrame` from Task 2.
- Produces: `Project.siteFrame: SiteFrame | null` — `null` only while no location is
  confirmed. Every later slice reads it through
  `frameFor(project)`, exported from `lib/site/frame.ts`:
  ```ts
  export function frameFor(project: Pick<Project, 'location' | 'calibration' | 'siteFrame'>): SiteFrame | null
  ```

- [ ] **Step 1: Write the failing migration tests**

Create `src/features/solar-studio/lib/__tests__/site-migration.test.ts`:

```ts
// ─── Saved projects gain a site frame WITHOUT their geometry moving ─────────
// Spec decision A8. Stored local metres are spherical-consistent throughout:
// hand-traced roofs came through the canvas ruler (metersPerStaticMap) and
// AI-detected roofs through makeProjector, and both used the same spherical
// earth radius, so they AGREED with each other to ~1 cm over 50 m. Re-projecting
// stored EN onto the exact frame would desynchronise it from the imagery it was
// traced on (still spherical until slice 2), and silently moving a user's traced
// roof is worse than leaving it. The frame is added; the numbers are untouched.
// [Corrected in the final review: this header first said "hand-traced = already
// true metres, AI = stretched" — false; both carried the same stretch.]
import { describe, expect, it } from 'vitest';
import { normalizeProject } from '../persistence/normalize';
import { frameFor, makeSiteFrame } from '../site/frame';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Project } from '../../types';

const PUNE = { lat: 18.5202, lng: 73.8567 };

/**
 * fixtureProject() is built on newProject(), which sets `location: null` — a
 * blank project has no site. These tests need a CONFIRMED location, so each
 * builds one explicitly rather than assuming the fixture has one.
 */
function locatedProject(): Project {
  const p = fixtureProject();
  return {
    ...p,
    location: {
      address: 'Test site, Pune',
      latLng: PUNE,
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'test',
    },
    siteFrame: makeSiteFrame(PUNE),
  };
}

/** Round-trip through JSON, the way a stored project actually arrives. */
const stored = (p: unknown) => JSON.parse(JSON.stringify(p));

describe('normalizeProject adds a site frame', () => {
  it('builds one from the confirmed location when absent', () => {
    const raw = stored({ ...locatedProject(), siteFrame: undefined });
    const out = normalizeProject(raw);
    expect(out.siteFrame).not.toBeNull();
    expect(out.siteFrame!.origin).toEqual(PUNE);
    expect(out.siteFrame!.utmZone).toBe(43);
  });

  it('seeds scaleFactor and northOffsetDeg from the existing calibration', () => {
    const raw = stored({
      ...locatedProject(),
      siteFrame: undefined,
      calibration: { scaleFactor: 1.031, northOffsetDeg: 7.5, reference: null },
    });
    const out = normalizeProject(raw);
    expect(out.siteFrame!.scaleFactor).toBeCloseTo(1.031, 6);
    expect(out.siteFrame!.northOffsetDeg).toBeCloseTo(7.5, 6);
  });

  it('leaves the frame null when there is no location — the blank-project case', () => {
    const raw = stored({ ...fixtureProject(), siteFrame: undefined });
    expect(raw.location).toBeNull();
    expect(normalizeProject(raw).siteFrame).toBeNull();
  });

  it('does not move one single coordinate', () => {
    const p = locatedProject();
    p.roofs = [fixtureRoof()];
    const raw = stored({ ...p, siteFrame: undefined });
    const before = JSON.stringify(raw.roofs);
    const out = normalizeProject(raw);
    expect(JSON.stringify(out.roofs)).toBe(before);
  });

  it('keeps an already-stored frame rather than rebuilding it', () => {
    const raw = stored(locatedProject());
    raw.siteFrame = { ...raw.siteFrame, northOffsetDeg: 12 };
    expect(normalizeProject(raw).siteFrame!.northOffsetDeg).toBe(12);
  });

  it('rebuilds a frame whose origin no longer matches the location', () => {
    // An older build could have moved the pin without updating the frame.
    // The location is authoritative.
    const raw = stored(locatedProject());
    raw.siteFrame = { ...raw.siteFrame, origin: { lat: 0, lng: 0 } };
    expect(normalizeProject(raw).siteFrame!.origin).toEqual(PUNE);
  });
});

describe('frameFor', () => {
  it('returns the stored frame when its origin matches the location', () => {
    const p = locatedProject();
    expect(frameFor(p)).toBe(p.siteFrame);
  });

  it('rebuilds when the stored frame is stale', () => {
    const p = locatedProject();
    const stale = { ...p, siteFrame: makeSiteFrame({ lat: 0, lng: 0 }) };
    expect(frameFor(stale)!.origin).toEqual(PUNE);
  });

  it('returns null for a project with no location', () => {
    expect(frameFor(fixtureProject())).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/site-migration.test.ts`
Expected: FAIL — `siteFrame` is not a property of `Project`, `frameFor` is not exported.

- [ ] **Step 3: Add `siteFrame` to the `Project` type**

In `src/features/solar-studio/types.ts`, next to the existing `calibration` field on
`Project`, add:

```ts
  /**
   * The site's coordinate frame (lib/site/frame.ts). Null until a location is
   * confirmed. Built from `location.latLng` and seeded from `calibration` for
   * projects saved before it existed — see lib/__tests__/site-migration.test.ts.
   */
  siteFrame: SiteFrame | null;
```

and add the import at the top of `types.ts`:

```ts
import type { SiteFrame } from './lib/site/types';
```

Also re-export it so existing `from '../types'` imports keep working:

```ts
export type { SiteFrame } from './lib/site/types';
```

- [ ] **Step 4: Add `frameFor` to `lib/site/frame.ts`**

```ts
/**
 * The frame for a project, or null when no location is confirmed. The single
 * accessor every consumer uses — never read `project.siteFrame` directly, so
 * the location stays authoritative if the two ever drift.
 */
export function frameFor(project: {
  location: { latLng: LatLng } | null;
  calibration: { scaleFactor: number; northOffsetDeg: number };
  siteFrame: SiteFrame | null;
}): SiteFrame | null {
  if (!project.location) return null;
  const f = project.siteFrame;
  if (
    f &&
    f.origin.lat === project.location.latLng.lat &&
    f.origin.lng === project.location.latLng.lng
  ) {
    return f;
  }
  return makeSiteFrame(project.location.latLng, {
    scaleFactor: project.calibration.scaleFactor,
    northOffsetDeg: project.calibration.northOffsetDeg,
  });
}
```

- [ ] **Step 5: Default the frame in `normalize.ts`**

In `src/features/solar-studio/lib/persistence/normalize.ts`, import the frame helpers:

```ts
import { makeSiteFrame } from '../site/frame';
import type { SiteFrame } from '../site/types';
```

Then, in the returned normalized object, immediately **after** the existing
`calibration: { ... } satisfies Exhaustive<Calibration>,` block, add:

```ts
    siteFrame: normalizeSiteFrame(p),
```

and add this helper above the main normalize function:

```ts
/**
 * Additive migration: projects saved before lib/site existed get a frame built
 * from their confirmed location, seeded with their calibration. Geometry is NOT
 * touched (spec decision A8). A stored frame whose origin disagrees with the
 * location is rebuilt — the location is authoritative.
 */
function normalizeSiteFrame(p: {
  location?: { latLng?: { lat?: unknown; lng?: unknown } } | null;
  calibration?: { scaleFactor?: unknown; northOffsetDeg?: unknown } | null;
  siteFrame?: unknown;
}): SiteFrame | null {
  const ll = p.location?.latLng;
  if (typeof ll?.lat !== 'number' || typeof ll?.lng !== 'number') return null;
  if (!Number.isFinite(ll.lat) || !Number.isFinite(ll.lng)) return null;

  const scaleFactor =
    typeof p.calibration?.scaleFactor === 'number' &&
    Number.isFinite(p.calibration.scaleFactor) &&
    p.calibration.scaleFactor > 0
      ? p.calibration.scaleFactor
      : 1;
  const northOffsetDeg =
    typeof p.calibration?.northOffsetDeg === 'number' &&
    Number.isFinite(p.calibration.northOffsetDeg)
      ? p.calibration.northOffsetDeg
      : 0;

  const stored = p.siteFrame as SiteFrame | undefined;
  if (
    stored &&
    typeof stored.origin?.lat === 'number' &&
    typeof stored.origin?.lng === 'number' &&
    stored.origin.lat === ll.lat &&
    stored.origin.lng === ll.lng &&
    typeof stored.utmZone === 'number' &&
    typeof stored.northOffsetDeg === 'number' &&
    typeof stored.scaleFactor === 'number'
  ) {
    return stored;
  }
  return makeSiteFrame({ lat: ll.lat, lng: ll.lng }, { scaleFactor, northOffsetDeg });
}
```

- [ ] **Step 6: Default the frame on project creation**

In `src/features/solar-studio/store/store.tsx`, the blank project literal at line ~127
sets `calibration: { scaleFactor: 1, northOffsetDeg: 0, reference: null },`. Add
directly after it:

```ts
    siteFrame: null,
```

A blank project has no confirmed location, so `null` is correct. Slice 3's Confirm flow
is what populates it.

Then in `src/features/solar-studio/screens/Step1Setup.tsx`, inside `confirmLocation`,
the `freshDesign` object resets `calibration` on a >25 m move. Add alongside it:

```ts
          siteFrame: null,
```

and, in the same `patch(...)` call that sets `location`, add:

```ts
        siteFrame: makeSiteFrame({ lat, lng }, {
          scaleFactor: moved ? 1 : project.calibration.scaleFactor,
          northOffsetDeg: moved ? 0 : project.calibration.northOffsetDeg,
        }),
```

with `import { makeSiteFrame } from '../lib/site/frame';` added to the imports.

This keeps the existing >25 m behaviour untouched for now — removing the wipe is spec §6
and lands in slice 3. All this task does is keep the frame in step with the location.

- [ ] **Step 7: Run the migration tests**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/site-migration.test.ts`
Expected: PASS, 9 tests.

`fixtures/project.ts:52` builds on `newProject()`, so it inherits the `siteFrame: null`
added in Step 6 automatically — the fixture file needs no edit.

- [ ] **Step 8: Run both gates and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite PASS.

`tsc` will flag any test that builds a `Project` literal by hand rather than through
`newProject()`, because `siteFrame` is now required. Add `siteFrame: null` to each one.
Never weaken an existing assertion to make this compile — the only legal change is
adding the field.

`model-version.test.ts` guards the persisted model shape. If it asserts a field list or
a hash, update it to include `siteFrame` and state in the diff that this is an additive
migration with no geometry change.

```bash
git add src/features/solar-studio/types.ts src/features/solar-studio/lib/site/frame.ts src/features/solar-studio/lib/persistence/normalize.ts src/features/solar-studio/store/store.tsx src/features/solar-studio/screens/Step1Setup.tsx src/features/solar-studio/lib/__tests__/
git commit -m "feat(site): store the site frame on Project and migrate saved projects

Projects saved before lib/site existed gain a frame built from their confirmed
location and seeded from their calibration. Geometry is copied through
unchanged (spec decision A8) — there is no correct inverse for the old stretch,
and re-running detection is what fixes an old design."
```

> **Correction (final review):** committed as `947bdb1`. A8 stands, but for a better
> reason than "no correct inverse": stored EN is spherical-consistent throughout — traced
> and detected alike — and re-projecting it would desynchronise it from the
> still-spherical imagery. Re-running detection puts a roof on true ground metres, which
> until slice 2 means 0.572% short north–south of the imagery it is drawn over.

---

### Task 5: Switch roof detection to the frame — the visible correction

Where the 0.57% actually disappears from the detection path. The existing gate test
currently **encodes** the bug; this task corrects that expectation, and the corrected
numbers are the proof.

> **Corrected record (final review).** The rationale below and the commit message in
> Step 5 originally claimed the canvas was "identical in both axes" so AI and traced roofs
> disagreed. False — see the Goal. The old gate comment ("the north-axis scale is shared
> by the imagery mapping itself") was *right* about the imagery: both rulers were the
> same spherical model. Making this path exact is still correct (stored EN must be true
> ground metres), but it opens the 0.572% gap against the still-spherical imagery that
> slice 2 must close.

**Files:**
- Modify: `src/features/solar-studio/lib/roof-ai/pipeline.ts:11,65`
- Modify: `src/features/solar-studio/lib/__tests__/roof-pipeline.test.ts:11,47,52-75`

**Interfaces:**
- Consumes: `makeSiteFrame`, `toEN` from Task 2.
- Produces: `DetectInput` gains an optional `frame?: SiteFrame`. When absent, the
  pipeline builds one from `input.pin`, so existing callers keep working unchanged.

- [ ] **Step 1: Correct the gate test to expect true metres**

In `src/features/solar-studio/lib/__tests__/roof-pipeline.test.ts`:

Replace the import on line 11:

```ts
import { polygonArea } from '../geo';
import { makeSiteFrame, toEN } from '../site/frame';
```

Replace the body of `'raster center maps back to the request pin'` (line ~47):

```ts
    const frame = makeSiteFrame(DENSE_PIN);
    const en = toEN(frame, center);
    expect(Math.hypot(en.x, en.y)).toBeLessThan(5); // meters off the pin
```

Replace the whole of `'UTM distances survive the utm→latLng→projector chain within 0.5 m over 50 m'`
with:

```ts
  it('UTM distances survive the utm→latLng→frame chain within 0.1 m over 50 m', () => {
    // This gate previously ACCEPTED a +0.63% north stretch, with a comment
    // saying "the north-axis scale is shared by the imagery mapping itself".
    // That comment was RIGHT about the imagery: the canvas (metersPerStaticMap,
    // 156543.03392 = 2π·6378137/256) and makeProjector (EARTH_R = 6378137) were
    // the SAME spherical model — isotropic in map units, anisotropic in ground
    // metres by a/M = 1.005720 north-south and a/N = 0.999662 east-west at
    // Pune — so the two legacy rulers agreed with each other. What was wrong
    // was the ABSOLUTE scale; the BOM prices rail and cable by the metre. The
    // frame (lib/site/frame.ts) makes THIS path exact; the imagery stays
    // spherical until slice 2, so detected and traced geometry now differ by
    // 0.572% north-south — pinned by imagery-scale-parity.test.ts.
    // [Corrected in the final review; the first version of this comment said
    // the canvas was "the SAME in both axes" in ground metres — false.]
    //
    // One systematic remains, and is correct: the UTM point scale factor at
    // Pune (~113 km west of the 75°E central meridian) makes 50 m of UTM
    // easting about 49.99 m on the ground.
    const mask = await decodeGeoTiff(await buf('datalayers-pune-dense', 'mask.tif'));
    const frame = makeSiteFrame(DENSE_PIN);
    const enOf = (col: number, row: number) => toEN(frame, mask.pixelToLatLng(col, row));
    const a = enOf(50, 50);
    const b = enOf(550, 50); // 500 px = 50 m east
    const c = enOf(50, 550); // 500 px = 50 m south
    expect(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - 50)).toBeLessThan(0.1);
    expect(Math.abs(Math.hypot(c.x - a.x, c.y - a.y) - 50)).toBeLessThan(0.1);
    // per-axis: both now land on true ground metres
    expect(b.x - a.x).toBeCloseTo(49.99, 1);
    expect(a.y - c.y).toBeGreaterThan(49.95);
    expect(a.y - c.y).toBeLessThan(50.05); // was 50.2-50.45 before the fix
    // orientation: east really is +x, south really is −y (convergence ≤ 0.4°)
    expect(Math.abs(b.y - a.y)).toBeLessThan(0.5);
    expect(Math.abs(c.x - a.x)).toBeLessThan(0.5);
  });
```

Note the test must be `async` — it awaits `buf`. Keep the existing `async` signature.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/roof-pipeline.test.ts`
Expected: FAIL. The old pipeline is still in place, so the north assertion reports
roughly **50.31**, outside the new 49.95–50.05 window. That failure number is the bug,
measured.

- [ ] **Step 3: Switch the pipeline to the frame**

In `src/features/solar-studio/lib/roof-ai/pipeline.ts`:

Replace line 11:

```ts
import { makeSiteFrame, toEN } from '../site/frame';
import type { SiteFrame } from '../site/types';
```

Add to the `DetectInput` interface, after `pin`:

```ts
  /**
   * The project's site frame. Optional so existing callers keep working; when
   * absent one is built from `pin`. Passing the real frame matters once a
   * project carries a north offset.
   */
  frame?: SiteFrame;
```

Replace line 65:

```ts
  const frame = input.frame ?? makeSiteFrame(input.pin);
  const pixelToEN = (col: number, row: number): XY =>
    toEN(frame, mask.pixelToLatLng(col, row));
```

and delete the now-unused `const project = makeProjector(input.pin);` line together with
the old `pixelToEN` definition on line 66.

Update the header comment's second line to read:

```ts
// mask GeoTIFF → components → boundary trace → (UTM → lat/lng → site frame EN)
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/roof-pipeline.test.ts`
Expected: PASS. The north figure should now read close to 50.00.

**Do not thread the frame through `detect-client.ts` in this slice.** The worker payload
in `detect-client.ts` (`worker.postMessage({ maskBuffer, dsmBuffer, pin, ... })`) sends
only the pin, and `makeSiteFrame(pin)` inside the pipeline produces an identical frame
whenever `northOffsetDeg` is 0 (`scaleFactor` is unused by `toEN`). The optional `frame`
field exists so a later slice can pass a rotated frame. Adding the plumbing now would be
untestable churn.

> **Correction (final review):** this paragraph originally ended "— which is every
> project today". Wrong: `northOffsetDeg` is user-settable *today* through
> `CalibrateDialog`, so a project with a non-zero offset gets roofs detected at 0°
> rotation while shading, the scene and the north badge use the offset. This is
> pre-existing (`makeProjector` never applied the offset either), not a regression; the
> deferral stands, and `pipeline.ts`'s comment on `DetectInput.frame` now says so plainly.
> Wiring the frame through `detect-client` and the worker payload is what closes it.

- [ ] **Step 5: Run both gates and commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite PASS.

```bash
git add src/features/solar-studio/lib/roof-ai/pipeline.ts src/features/solar-studio/lib/__tests__/roof-pipeline.test.ts
git commit -m "fix(roof-ai): detect roofs in the exact site frame

The alignment gate previously accepted a +0.63% north stretch on the grounds
that the imagery shared the same scale. It does not — the canvas uses the Web
Mercator ground resolution, identical in both axes. A 50 m north-south span now
measures 50.00 m instead of 50.31 m."
```

> **Correction (final review):** this message was committed as `a1c41c9` and its second
> sentence is false — the imagery *does* share the same spherical scale: identical in both
> axes in map units, which is the same anisotropic error in ground metres that
> `makeProjector` had. The 50.00 m figure is right; the reason given for it is not. See
> the Goal.

---

### Task 6: Retire `makeProjector`

The last caller moves over and the old function is deleted, so nothing can regress to it.

**Files:**
- Modify: `src/features/solar-studio/screens/Step2Roof.tsx:58,270`
- Modify: `src/features/solar-studio/lib/geo.ts:7-26` (delete `makeProjector`)
- Modify: `src/features/solar-studio/lib/__tests__/site-frame.test.ts` (add the guard)

**Interfaces:**
- Consumes: `frameFor`, `toEN` from Tasks 2 and 4.
- Produces: nothing new. `makeProjector` no longer exists.

- [ ] **Step 1: Write the guard test**

Append to `src/features/solar-studio/lib/__tests__/site-frame.test.ts`:

```ts
describe('makeProjector is gone', () => {
  it('lib/geo.ts no longer exports a projector', async () => {
    // A second lat/lng->metre path is exactly how the 0.57% stretch survived so
    // long: two frames that disagreed, each locally reasonable. One path only.
    const geo = await import('../geo');
    expect('makeProjector' in geo).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/features/solar-studio/lib/__tests__/site-frame.test.ts`
Expected: FAIL — `makeProjector` is still exported from `lib/geo.ts`.

- [ ] **Step 3: Move the Step2Roof caller**

In `src/features/solar-studio/screens/Step2Roof.tsx`:

Remove `makeProjector,` from the import block at line 58, and add:

```ts
import { frameFor, toEN } from '../lib/site/frame';
```

Replace line 270 and the loop body that uses `proj`:

```ts
    const frame = frameFor(project);
    if (!frame) return null;
    const c = polygonCentroid(selected.polygon);
    let best: (typeof segs)[number] | null = null;
    let bestD = Infinity;
    for (const s of segs) {
      if (!s.center) continue;
      const sc = toEN(frame, s.center);
      const d = Math.hypot(sc.x - c.x, sc.y - c.y);
      if (d < bestD) { bestD = d; best = s; }
    }
```

Add `project` to the `useMemo` dependency array if it is not already there — `frameFor`
reads `project.location`, `project.calibration` and `project.siteFrame`.

- [ ] **Step 4: Delete `makeProjector`**

In `src/features/solar-studio/lib/geo.ts`, delete lines **5–26**: the `EARTH_R` constant,
the doc comment, and the whole `makeProjector` function. `EARTH_R` is referenced only by
`makeProjector` (verified: `grep -rn "EARTH_R" src/` returns `geo.ts:5` and `geo.ts:10`
and nothing else), so it goes with it.

Update the file's header comment, whose first line currently reads
`// ─── Geometry helpers: lat/lng ↔ local meters, polygon math ────────────────`:

```ts
// ─── Geometry helpers: polygon math ────────────────────────────────────────
// lat/lng <-> local metres moved to lib/site/frame.ts, which is geodetically
// exact. This file is pure planar geometry.
```

- [ ] **Step 5: Run both gates**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite PASS, no type errors. `tsc` is what proves no caller was missed.

- [ ] **Step 6: Verify in the browser**

CLAUDE.md: real bugs here have passed the whole suite. Restart the dev server first — a
stale HMR after many edits produces blank studio routes.

1. Start the preview (`preview_start`), open the studio.
2. Open an **existing saved project**. Confirm its roofs render in the same place as
   before this branch, with the same areas.
3. Create a new project, confirm a Pune location, run **Detect roofs (AI)** in Step 2.
   Confirm the ghost outlines sit on the building in the satellite image.
4. Trace one roof edge by hand alongside a detected edge. **They will not agree exactly**
   *(corrected in the final review)*: the detected edge is true ground metres and the
   canvas is still spherical, so they differ by 0.572% north–south — 5.7 cm on a 10 m
   edge, under one screen pixel. Agreement by eye proves nothing here either way; the
   numeric pin is `lib/__tests__/imagery-scale-parity.test.ts`.
5. Check the console for errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/solar-studio/screens/Step2Roof.tsx src/features/solar-studio/lib/geo.ts src/features/solar-studio/lib/__tests__/site-frame.test.ts
git commit -m "refactor: delete makeProjector, leaving one lat/lng frame

Two lat/lng->metre paths that disagreed is how the 0.57% stretch survived. The
site frame is now the only one, and a guard test fails if a second returns."
```

---

## Done when

- `npx vitest run` and `npx tsc --noEmit` are both green.
- `grep -rn "makeProjector" src/` returns nothing.
- `roof-pipeline.test.ts` asserts a 50 m north–south span measures 49.95–50.05 m.
- An existing saved project opens with its geometry unchanged.
- ~~A freshly detected roof and a hand-traced roof of the same edge agree in the browser.~~
  **Restated (final review):** by construction they no longer do. A freshly detected roof
  is true ground metres; a hand-traced roof comes off the still-spherical canvas, so the
  two differ by a known a/M − 1 = 0.572% north–south (1.005720 at Pune). On a 10 m edge
  that is 5.7 cm — under one screen pixel — so it cannot be verified by eye either way.
  The gap is pinned numerically by `lib/__tests__/imagery-scale-parity.test.ts` and is
  closed by slice 2 correcting the imagery scale (spec §3.3 blocking precondition).

Slice 2 (imagery and the mosaic) is the next plan, and it is **blocked** on that
precondition: no `ImageryLayer` may be persisted before the imagery ground scale is
anisotropic or explicitly reprojected.
