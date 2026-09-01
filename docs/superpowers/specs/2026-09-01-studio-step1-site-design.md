# Studio Step 1 — "The Site"

**Date:** 2026-09-01
**Status:** approved design, ready for an implementation plan
**Scope:** wizard Step 1 only, plus the new `lib/site/` module it is built on

---

## Plain summary

Step 1 stops being a form and becomes **the site**: a full-screen map where the app
learns exactly where the building is, gets the sharpest picture of it, builds the real
ground and neighbours around it, and accepts the user's own drawings.

Four jobs:

1. **Fix the ruler.** Today the app measures latitude with the wrong earth radius, so
   anything the AI draws comes out 0.57% too tall — 1.1 m on a 200 m factory roof.
2. **Use the sharp photo we already pay for.** Google sends us a 0.1 m/px aerial image
   and we throw it away, drawing on a 0.14 m/px one instead.
3. **Build the neighbourhood.** Neighbour buildings currently look real but cast no
   shadow. Google's height map is already fetched; we use it.
4. **Read the user's files.** DXF, KML, drone ortho, PDF. Today: nothing.

Everything commercial on this screen — project name, customer, logo, DISCOM, tariff,
bill — is untouched and folds into a drawer.

---

## 1 · Why (evidence from the code)

| # | Defect | Location | Effect |
|---|---|---|---|
| D1 | `makeProjector` uses the **equatorial** radius for latitude: `mPerDegLat = π/180 × 6378137` = 111,320 m/°. The true meridional degree at 18.5°N is **110,684 m**. The canvas ruler `metersPerStaticMap` is the **same spherical model** — its constant 156543.03392 = 2π·6378137/256 — so the two legacy rulers agreed with each other. | [lib/geo.ts:8](../../../src/features/solar-studio/lib/geo.ts), [lib/maps.ts:43](../../../src/features/solar-studio/lib/maps.ts) | Every lat/lng→metre conversion is stretched **0.57% north–south against true ground** (canvas/true = a/M = 1.005720 at Pune; east–west a/N = 0.999662): 23 cm on a 40 m shed, **1.1 m on a 200 m roof**. Hand-traced roofs carry the *same* stretch, so AI and traced geometry did **not** disagree — both were wrong together, and the BOM priced rail and cable off stretched metres. *Corrected in the final review of slice 1: the earlier claim here that AI roofs "disagree with hand-traced ones" was false. Slice 1 makes the geodetic path exact and leaves the imagery spherical, so the two now disagree by a/M − 1 = **0.572 %** north–south until slice 2 corrects the imagery scale (§3.3).* |
| D2 | The Google Solar `dataLayers` call returns **DSM + building mask + RGB aerial**. The RGB URL is relayed to the client and never read. | [route.ts:89](../../../src/app/api/solar/data-layers/route.ts), [detect-client.ts:21](../../../src/features/solar-studio/lib/roof-ai/detect-client.ts) | We draw on a 0.14 m/px Static Map instead of the 0.1 m/px georeferenced aerial we already paid for. |
| D3 | The canvas world is **one 640 px Static Map tile at zoom 20** = 90.6 m across at Pune. | [SatCanvas.tsx:39,99](../../../src/features/solar-studio/components/SatCanvas.tsx) | A C&I roof wider than ~90 m runs off the imagery. A 1.13 m panel is **8 px** — a 0.23 m parapet is 1.6 px. |
| D4 | Confirming a location more than **25 m** from the previous one wipes roofs, obstructions, panels, segments, keepouts, walkways, rails, arresters, inverters, strings, captures, SLD params and BOM overrides. | [Step1Setup.tsx](../../../src/features/solar-studio/screens/Step1Setup.tsx) `confirmLocation` | One map nudge destroys a full design. It is undoable, but it is still a cliff. |
| D5 | Neighbour buildings are decorative and explicitly excluded from the shading engine (`audit R6`). | [lib/shading.ts](../../../src/features/solar-studio/lib/shading.ts) | The most common real-world shade source in an Indian city must be re-entered by hand as a Step 3 "building" obstruction, with a guessed height. |
| D6 | No import path exists for any external file. | — | A surveyor's KML, a consultant's DXF, or a drone ortho cannot enter the design. |
| D7 | Scale calibration and north offset live in Step 2, but describe the **site**. | [lib/calibration.ts](../../../src/features/solar-studio/lib/calibration.ts) | Discovered after the roof is already traced, so applying it re-scales work already done. |

---

## 2 · Decisions taken

| # | Decision | Reason |
|---|---|---|
| A1 | Step 1 becomes **"The Site"** — map-first. Commercial fields collapse into a drawer. | The site anchors all 3D work; a form does not. |
| A2 | Imagery = **Google Solar RGB** first, **stitched Static Maps mosaic** as fallback/extension, **user underlay** on top. | Fixes D2 and D3 without extra API cost in the common case. |
| A3 | Build the **real surround** (terrain + shading neighbours) from the DSM already fetched. | Fixes D5. The fetch is already paid for by roof detection. |
| A4 | Internal frame = **local ENU on the WGS84 ellipsoid**, anchored at the pin. UTM is the **interchange** format only. | Fixes D1. Plain UTM carries its own ≤0.1% grid distortion — 0.4 m over 400 m, the same order as the bug being fixed. ENU at site scale is exact. |
| A5 | Build the `lib/site/` module **first**, then the screen on top of it. | The production port lifts one module rather than re-deriving geometry. |
| A6 | **DXF in v1; DWG deferred.** The UI tells the user to "Save As DXF" in AutoCAD. | DWG is a closed format. A licensed converter (ODA) or a patchy GPL one (LibreDWG) is not worth it against a 5-second user step. Reversible later. |
| A7 | Surround solids are a **separate layer**, not obstructions. | Obstructions sit on the roof and block panel placement. Surround solids sit off-site and only cast shade. Different rules, different lifecycle. |
| A8 | **Migration does not move existing geometry.** | Stored local metres are **spherical-consistent throughout**: hand-traced (canvas, `metersPerStaticMap`) and AI-detected (`makeProjector`) came through the same spherical earth radius and agreed with each other to ~1 cm over 50 m. Re-projecting stored EN onto the exact frame would desynchronise it from the imagery it was traced on, which stays spherical until slice 2 — and silently moving a user's traced roof is worse than leaving it. Re-running detection puts a roof on true ground metres; until slice 2 that roof sits 0.572 % short north–south against the imagery and any traced roof beside it. *Corrected in the final review of slice 1: the earlier rationale "hand-traced = already correct; AI = stretched" was false.* |

---

## 3 · Architecture — `src/features/solar-studio/lib/site/`

One module owns *where the site is* and *what it looks like*. No other file computes
projections, picks imagery, or places an underlay.

```
lib/site/
  frame.ts        ENU frame · UTM interchange · scale · north offset
  imagery.ts      the layer stack and the source ladder
  mosaic.ts       Static Maps tile selection + stitching
  surround.ts     DSM → terrain heightfield + shading solids
  import/
    dxf.ts        ASCII DXF reader
    kml.ts        KML / KMZ reader
    raster.ts     GeoTIFF · JPG · PNG · PDF
    align.ts      2-point alignment for un-georeferenced sources
  types.ts        SiteFrame · ImageryLayer · SurroundModel · ImportResult
  index.ts        public surface
```

### 3.1 `frame.ts` — the ruler

```ts
export interface SiteFrame {
  origin: LatLng;                 // the confirmed pin
  utmZone: number;                // derived from origin.lng
  utmHemisphere: 'N' | 'S';
  utmOrigin: { e: number; n: number };
  convergenceDeg: number;         // local north vs UTM grid north at origin
  scaleFactor: number;            // user 2-point calibration, default 1
  northOffsetDeg: number;         // user north correction, default 0
}
```

**ENU maths.** WGS84: `a = 6378137.0`, `e² = 0.00669437999014`.

```
M(φ) = a(1 − e²) / (1 − e² sin²φ)^1.5      meridional radius of curvature
N(φ) = a / (1 − e²sin²φ)^0.5               prime vertical radius of curvature

north_m = (lat − lat₀) · π/180 · M(lat₀)
east_m  = (lng − lng₀) · π/180 · N(lat₀) · cos(lat₀)
```

This replaces `makeProjector`. The only change from today is using the **true radii at
the site latitude** instead of the equatorial radius for both axes.

**Public functions**

| Function | Contract |
|---|---|
| `makeSiteFrame(origin: LatLng): SiteFrame` | Pure. Computes UTM zone, UTM origin and convergence. |
| `toEN(frame, p: LatLng): XY` | Geodetic only, then rotated by `northOffsetDeg` into the image-aligned axes. **Does not apply `scaleFactor`.** |
| `toLatLng(frame, p: XY): LatLng` | Exact inverse of `toEN`. |

**Why `toEN` must not apply `scaleFactor`.** The two scales in play are different
things. `scaleFactor` corrects the **imagery** (pixels → metres); the geodetic
conversion is fixed by physics. `applyKnownDistance` in `lib/calibration.ts` already
rescales stored geometry once at calibration time, so **stored EN is true metres**.
Applying `scaleFactor` again inside `toEN` would double-count it.

This also confirms the two AI detection paths are correct as they stand and need no
change here: Gemini works in **image space**, so `gemini-client.ts` rightly multiplies by
`scaleFactor`; the dataLayers pipeline works in **geo space** via a georeferenced
GeoTIFF, so it rightly does not.

`northOffsetDeg` **is** applied, because the project's EN axes are aligned to the
**image**, not to true north (`types.ts` `Calibration.northOffsetDeg`: "degrees TRUE
north lies clockwise of the image's up axis"). `makeProjector` never applied it. The
default is 0 and Google tiles are north-up, so this changes nothing in practice today,
but it becomes load-bearing for a rotated imported underlay.
| `toUtm(frame, p: XY): { e, n }` | For export. Offset + rotation by `convergenceDeg`. |
| `fromUtm(frame, p: { e, n }): XY` | For import. |
| `reanchor(frame, newOrigin): { frame, deltaEN }` | Returns the new frame and the shift to apply to geometry. |

**UTM**: standard Transverse Mercator, `k₀ = 0.9996`, false easting 500,000 m, false
northing 0 (N) / 10,000,000 (S). `zone = floor((lng + 180) / 6) + 1`, with the Norway
(32V) and Svalbard exceptions implemented for correctness even though India never hits
them.

`makeProjector` in `lib/geo.ts` is deleted, along with its `EARTH_R` constant, which
nothing else uses. Verified callers, and the only ones: `lib/roof-ai/pipeline.ts:65` and
`screens/Step2Roof.tsx:270`. `lib/roof-ai/gemini-client.ts` does **not** call it — it
works in image space and converts through the canvas scale instead.

### 3.2 `imagery.ts` — what we draw on

```ts
export type ImagerySourceKind =
  | 'solar-rgb'      // Google Solar dataLayers RGB GeoTIFF
  | 'static-mosaic'  // stitched Google Static Maps
  | 'user-raster'    // ortho / photo / PDF page
  | 'user-vector';   // DXF / KML rendered as lines

export interface ImageryLayer {
  id: string;
  kind: ImagerySourceKind;
  label: string;
  blobId: string | null;          // stored via lib/persistence/blobs.ts
  originEN: XY;                   // EN of the image's top-left corner
  widthM: number;
  heightM: number;
  rotationDeg: number;            // 0 for north-up sources
  metersPerPixel: number;
  capturedOn: string | null;
  quality: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  georeference: 'exact' | 'aligned' | 'assumed';
  opacity: number;                // 0..1
  visible: boolean;
  isBase: boolean;                // exactly one layer is the base
}
```

> **Blocking precondition — see §3.3.** `metersPerPixel` as a single scalar is a
> placeholder that this slice must replace. The ground scale of a Web Mercator source is
> **anisotropic** on the ellipsoid — north–south `r·M(φ)/a`, east–west `r·N(φ)/a` — and
> slice 1 opened a 0.572 % north–south gap between the exact site frame and the
> still-spherical imagery. No `ImageryLayer` may be persisted until §3.3's precondition
> is resolved.

**Source ladder**, resolved by `resolveImagery(frame, siteRadiusM)`:

1. **`solar-rgb`** — decoded with the existing `lib/roof-ai/geotiff-decode.ts`. Its own
   UTM georeferencing places it exactly (`georeference: 'exact'`). ~0.1 m/px. Radius is
   capped at 100 m by `MAX_RADIUS_M` in the dataLayers route.
2. **`static-mosaic`** — built **only** when `solar-rgb` is unavailable, or when it does
   not cover the site. Frugal by default.
3. **`user-*`** — always additive, stacked above the base.

**"Does not cover the site"** means precisely: the RGB raster's decoded extent fails to
contain the axis-aligned square of half-width `siteRadiusM` centred on `frame.origin`.

**Default base layer** is the first available rung of the ladder — `solar-rgb`, else
`static-mosaic`. An imported `user-*` layer is **never** promoted automatically; the user
promotes it explicitly. Exactly one layer carries `isBase: true` at all times, and
promoting one clears the flag on the other in the same patch.

The base layer drives the 2D canvas background and the 3D ground texture. Non-base layers
render above it with their own opacity.

### 3.3 `mosaic.ts` — Static Maps stitching

Ground resolution at zoom `z`, latitude `φ`:

```
r(z, φ) = 156543.03392 · cos φ / 2^z        metres per pixel (scale 1)
```

With `scale=2` the tile returns 1280×1280 px for the same 640-px ground span, so the
effective resolution is `r/2`.

> ⚠️ **BLOCKING PRECONDITION — added by the final review of slice 1.**
>
> The formula above is the **spherical** Web Mercator ground resolution: 156543.03392 =
> 2π·6378137/256, the same equatorial radius the deleted `makeProjector` used. It is
> isotropic in *map* units, which is **anisotropic in ground metres** on the WGS84
> ellipsoid. Persisting it as a single `metersPerPixel` would bake permanently into
> `ImageryLayer` the exact error slice 1 removed from the frame. Verified numerically at
> Pune (18.5202 °N), zoom 20, 640 px:
>
> | | span | canvas / true |
> |---|---|---|
> | canvas assumes, both axes | 90.5981 m | — |
> | true east–west (`r·N(φ)/a`) | 90.6287 m | **0.999662** = a/N |
> | true north–south (`r·M(φ)/a`) | 90.0829 m | **1.005720** = a/M |
>
> **This is the gap slice 1 opened.** The site frame is now exact while
> `metersPerStaticMap` — consumed by `SatCanvas.tsx:99`, `Scene3D.tsx:1161` (the 3D
> ground texture) and `gemini-client.ts:54` — is still spherical, so a hand-traced roof
> and an AI-detected roof of the same building differ by a/M − 1 = **0.572 %**
> north–south today (17 cm on a 30 m shed; 5.7 cm on a 10 m edge, under one screen pixel).
> Before slice 1 the two rulers were the same spherical model and agreed with each other.
>
> **Before any `ImageryLayer` is persisted, the imagery layer must either**
> **(a) carry an anisotropic ground scale** — `metersPerPixelNS = r·M(φ)/a`,
> `metersPerPixelEW = r·N(φ)/a` — **or (b) explicitly reproject the raster into the site
> frame.** All three `metersPerStaticMap` consumers move to it in the same change.
> `lib/__tests__/imagery-scale-parity.test.ts` pins the 1.005720 / 0.999662 ratios as a
> tripwire: correcting the scale turns both to 1, and that test must be updated in the
> same change. The worked examples below are unaffected in zoom and grid choice; their
> "effective m/px" column is the isotropic map-unit figure and must be read with the
> factors above.

**Zoom selection.** Choose the highest `z ≤ 21` such that the tile grid needed to cover
`2 × siteRadiusM` is at most **4 × 4**. Floor at `z = 18`. Hard cap **16 tile requests**
per project, fetched once and cached as a single stitched blob.

Worked examples at 18.5°N:

| Site radius | Span | Chosen zoom | Grid | Effective m/px | Requests |
|---|---|---|---|---|---|
| 45 m (residential) | 90 m | 21 | 2×2 | 0.035 | 4 |
| 100 m (C&I shed) | 200 m | 20 | 3×3 | 0.071 | 9 |
| 200 m (large plot) | 400 m | 19 | 3×3 | 0.142 | 9 |

Stitched on an `OffscreenCanvas` in a worker, stored through
`lib/persistence/blobs.ts`, keyed by `(lat, lng, zoom, grid)` so a reopened project does
not refetch.

`siteRadiusM` defaults to 60 m and grows automatically when the drawn design or an
imported underlay exceeds the current extent.

### 3.4 `surround.ts` — the neighbourhood

**Input:** the DSM and building-mask GeoTIFFs already fetched by roof detection. No new
network call.

**Pipeline:**

1. Decode the DSM (`geotiff-decode.ts`) into a heightfield in the site frame.
2. Establish the ground datum with the existing `groundLevelM` from
   `lib/roof-ai/plane-fit.ts`.
3. **Terrain** — downsample to a ~1 m grid, build a heightfield mesh. Receives shadows,
   casts none (it is the ground).
4. **Solids** — cells above ground and outside the target building's mask component are
   clustered with the existing `labelComponents`; each cluster's footprint comes from
   `traceBoundary` + `simplifyDP`, and its height is the 90th percentile of the cluster
   (robust to spikes). Emitted as an extruded prism.
5. **Classification** — flat-topped and low roughness → `building`; rough top → `vegetation`.
   Rendered differently, shaded identically (a bounding solid, consistent with how Step 3
   already treats trees).
6. **Culling** — a solid of height `h` at horizontal distance `d` is kept only when
   `h / d > tan(10°) = 0.176`. At 10 m tall that is a 57 m reach. Then cap at **40
   solids**, keeping the largest `h/d` first.

   `d` is measured to the **target-building footprint** — the mask component containing
   `frame.origin`. Surround construction runs in parallel with roof detection, so drawn
   roofs cannot be assumed to exist; the mask component always does. If the mask has no
   component at the origin (a new building absent from Google's mask), `d` falls back to
   distance from `frame.origin` itself and the model is flagged
   `targetFootprint: 'assumed'`.

```ts
export interface SurroundSolid {
  id: string;
  kind: 'building' | 'vegetation';
  footprintEN: XY[];
  baseM: number;                  // height of its base above the frame datum
  topM: number;
  castsShadow: boolean;           // default true, user-togglable
  provenance: 'dsm';
  confidence: number;             // 0..1 from cluster size + height variance
}

export interface SurroundModel {
  terrain: { originEN: XY; cellM: number; cols: number; rows: number; heights: Float32Array };
  solids: SurroundSolid[];
  dsmQuality: 'HIGH' | 'MEDIUM' | 'LOW';
  targetFootprint: 'mask' | 'assumed';   // see culling, step 6
  builtAt: number;
  forFrameOrigin: LatLng;
}
```

**Honesty.** A DSM is a *surface* model captured on one date: it includes vegetation and
whatever was parked there. Heights are approximate and carry a provenance label
("derived — Google height map"). Each solid can be switched off individually. The
existing structural-safety rule is unaffected: nothing here is a safety verdict.

**Wiring into shading.** `buildShadowCasters` in `lib/scene-model.ts` gains the surround
solids. The shading engine's interface does not change. Because casters grow, the raycast
loop gets a bounding-sphere pre-filter per sample direction. The `audit R6` comment in
`lib/shading.ts` (decorative buildings excluded) is replaced — decorative context
buildings are removed entirely and superseded by real surround solids.

### 3.5 `import/` — the user's own files

| Reader | Formats | Placement |
|---|---|---|
| `raster.ts` | GeoTIFF | **exact** — from its own georeferencing |
| `raster.ts` | JPG, PNG | **aligned** — 2-point |
| `raster.ts` | PDF (page 1, via `pdfjs-dist`) | **aligned** — 2-point |
| `kml.ts` | KML, KMZ (zip) — Placemark points and Polygons | **exact** — lat/lng |
| `dxf.ts` | ASCII DXF — `LINE`, `LWPOLYLINE`, `POLYLINE`, `ARC`, `CIRCLE`; `INSERT` flattened one level; units from `$INSUNITS` | **exact** when coordinates look like a real UTM grid, else **aligned** |

`pdfjs-dist` is a new dependency (~1 MB, client-side only, lazily imported so it never
loads unless a PDF is opened).

**2-point alignment** (`align.ts`). Primary gesture: pick two points on the underlay,
then the two matching points on the base imagery. That resolves position, rotation and
scale in one action. Fallback for a plan with no visible landmark: pick two points and
type the real distance between them, which resolves scale only.

Imported **vector** geometry lands as a `user-vector` imagery layer — a visual underlay,
not roofs. Turning a DXF polyline into a roof is a Step 2 action ("trace over" or "adopt
this polyline"), specified there, not here.

**Rejected file handling.** A file that parses but has no usable entities returns
`{ ok: false, reason }` and the UI shows the reason. Nothing is silently dropped.

---

## 4 · The screen

### Layout

**Desktop 1440** — map fills the viewport. A 380 px right rail holds four cards and, at
the bottom, one collapsed **Project details** drawer.

**Mobile 375** — map full-bleed. A bottom sheet with three snap points (peek / half /
full) holds the same cards stacked. Pinch-zoom and two-finger pan come from the Google
Maps SDK. Every control is a visible button; nothing is keyboard-only.

### Cards

1. **Where** — address, lat/lng to 6 dp, UTM zone, **Change location**.
2. **Picture** — active base layer, its resolution in m/px, capture date, quality badge;
   the full layer list with per-layer opacity and visibility; **Calibrate** (2-point scale
   + north offset); **Add your own file**.
3. **Sun** — PVGIS GHI in kWh/m²/day, the radiation database, years of record. Or, on
   failure, "Built-in estimate (±10%)" with the reason. This is the existing provenance
   contract, moved here.
4. **Site model** — ground built ✓; *N* neighbours found, *M* casting shade; *K* roof
   faces detected, with **Review in Step 2**.

**Project details drawer** — project name, customer name and phone, country, state,
DISCOM, site type, connection type, sanctioned load, tariff, monthly bill, logo. Moved
verbatim, no behaviour change. In HelioGrid these are pre-filled from the lead.

### Calibration moves here

Scale calibration and north offset leave Step 2 and become part of the Picture card.
`lib/calibration.ts` is absorbed into `frame.ts`; the Step 2 entry point is removed.
Applying a calibration after geometry exists still re-scales that geometry, exactly as
today — the change is that it is now discoverable *before* tracing starts.

---

## 5 · What happens on Confirm

All non-blocking, each landing independently, with a progress list showing
pending / done / failed and a per-row retry.

```
Confirm
├─ set the site frame                          instant   (blocking, cheap)
├─ dataLayers → RGB + DSM + mask               ~2 s
│    ├─ imagery layer  (solar-rgb)             ~1 s
│    ├─ surround build (worker)                ~3 s
│    └─ roof detection (existing worker)       ~4 s → ghosts stashed for Step 2
├─ static mosaic  (only if RGB missing/short)  ~2 s
├─ PVGIS climate                               ~3 s
└─ Google Solar Building Insights              ~2 s
```

Step 2 therefore opens with roof ghosts already computed instead of a cold ~10 s wait.

**Staleness guard.** Every callback re-checks that the pin has not moved before writing,
using the existing `stillCurrent()` pattern from `Step1Setup.tsx`. That pattern is kept
verbatim; only its callers change.

---

## 6 · Moving the pin — the wipe is removed

`confirmLocation`'s 25 m destruction (D4) is deleted outright.

Moving the pin calls `frame.reanchor(oldFrame, newOrigin)` — the **frame-level**
operation. It returns the new frame (same `scaleFactor` / `northOffsetDeg`, fresh UTM
anchor) together with

```
deltaEN = toEN(oldFrame, newOrigin)      // the new origin expressed in the OLD frame
```

`|deltaEN|` is the move distance the dialog shows and gates on. If a design exists and
`|deltaEN| > 1 m`, one dialog with two outcomes:

| Choice | Effect |
|---|---|
| **Keep the design on the same building** *(default)* | Every stored EN point is re-projected **per point, exactly**: `p' = toEN(newFrame, toLatLng(oldFrame, p))`. The design stays at the same lat/lng; only the frame origin moved. |
| **Slide the design to the new spot** | EN values untouched, so the design keeps its offset from the pin and moves with it. |

**Why per point, not `p' = p − deltaEN`** *(corrected in the final review of slice 1)*. A
single translation is exact only to first order: the new frame's origin latitude changed,
so its metres-per-degree differ from the old frame's, and subtracting one constant leaves
a residual that grows with the move and with the geometry's distance from the origin.
Measured for geometry at (300, −200), moving the pin equally in lat and lng:

| Move | Residual of `p − deltaEN` |
|---|---|
| 76 m | 0.7 mm |
| 765 m | 6.6 mm |
| 3.06 km | 0.21 m |
| 13.8 km | 4.83 m |

The per-point transform costs two function calls per vertex and is exact to the frame's
own round-trip error (< 1 mm at 300 m). `reanchor` keeps returning `deltaEN` for the
distance readout; the dialog must never use it to move geometry. `reanchor` itself is
unchanged — it is the frame-level operation, and the per-point transform is how the
dialog applies the move.

Cancel leaves everything alone. The whole re-anchor is one undoable patch.

Site-scoped data — imagery, surround, PVGIS, insights — refetches when the move exceeds
25 m. **Geometry is never destroyed.**

---

## 7 · Saved-project migration

Per decision A8, geometry is not moved.

On load, a project with no `siteFrame` gets one built from `location.latLng`, seeded with
its existing `calibration.scaleFactor` and `northOffsetDeg`. Stored EN values are copied
through **unchanged**. Only future lat/lng ↔ EN conversions use the corrected maths.

Consequence, stated plainly in the release note *(corrected in the final review of
slice 1)*: a design saved before this change keeps the spherical 0.57 % north–south
stretch in **all** of its stored geometry — hand-traced and AI-detected alike, since both
came through the same spherical model (§1 D1) — and stays consistent with the imagery it
was drawn on. Re-running detection puts that roof on true ground metres, which until
slice 2 corrects the imagery scale (§3.3) means it will sit 0.572 % short north–south
against the imagery and against any hand-traced roof beside it. Nothing regresses in
absolute accuracy; the inconsistency is new, and it is disclosed here rather than
discovered.

Schema work lives in `lib/persistence/schema.ts` and `normalize.ts`, following the
existing versioned-normalise pattern.

---

## 8 · Error states

Every failure keeps the user moving.

| Failure | Behaviour |
|---|---|
| Google Solar has no coverage here | Mosaic imagery, no surround, no auto-detect. Card says so and offers manual tracing plus "add your own file". |
| dataLayers times out | Retry once, then the same as no coverage, with a **Retry** button that stays. |
| PVGIS unreachable | Built-in estimate, labelled "Built-in estimate (±10%)". Existing behaviour, preserved. |
| Maps SDK blocked (bad key, ad-blocker, offline) | Coordinate entry still confirms the site. Existing behaviour, preserved. |
| Mosaic tile fetch partially fails | Stitch what arrived; missing tiles render as a hatched "no imagery" fill rather than blank. |
| Imported file has no georeferencing | Fall through to 2-point alignment. |
| Imported file parses to nothing usable | Explicit reason shown; the file is not added. |
| Base imagery older than 3 years | Amber note on the Picture card offering "add your own". |
| Blob storage full / private browsing | Same honest save-error pattern already used by Step 7 captures. |

---

## 9 · Testing

Unit tests are the gate; none of these are visual checks.

**`site-frame.test.ts`**
- ENU round-trip error **< 1 mm at 300 m**, **< 1 cm at 1 km**, in all four quadrants,
  and in the southern hemisphere.
- **Regression pinning D1:** 0.001° of latitude at 18.52°N resolves to **110.686 m**, and
  a hard floor asserts it is under 111.0 m. The buggy value was 111.320 m, so this test
  fails loudly if the equatorial radius is ever reintroduced.
- `northOffsetDeg` rotation, including the invariant that `scaleFactor` never affects
  `toEN`.
- `reanchor` round-trip: move the origin, subtract `deltaEN`, geometry lands back on the
  same lat/lng within 1 mm.
- A guard asserting `lib/geo.ts` no longer exports `makeProjector` — two disagreeing
  lat/lng paths is how D1 survived.

**`site-utm.test.ts`**
- Forward ↔ inverse round-trip to **1 mm** in both hemispheres.
- The central-meridian invariant: a point on the zone's central meridian must have
  easting exactly 500,000. This catches a wrong zone or a dropped false easting without
  needing an external control-point citation.
- Zone selection, including the Norway 32V and Svalbard exceptions.
- Grid convergence is zero on the central meridian and small-negative west of it.

**`mosaic.test.ts`**
- The zoom/grid selection table in §3.3 is asserted row by row.
- Ground span and m/px maths.
- Tile-count cap and the zoom floor.

**`imagery.test.ts`**
- Ladder resolution: RGB present and sufficient → no mosaic requested.
- RGB present but site larger than its extent → mosaic built.
- Base-layer invariant: exactly one layer has `isBase`.

**`surround.test.ts`**
- Fixture DSM → expected solid count and heights.
- The target building is excluded from the solids.
- The `h/d > 0.176` cull rule and the 40-solid cap.
- Terrain grid dimensions and datum.

**`import/*.test.ts`**
- DXF fixture with real UTM coordinates lands at a known EN within 1 cm.
- DXF fixture with arbitrary coordinates routes to alignment.
- KML and KMZ fixtures.
- GeoTIFF places exactly; JPG routes to alignment.

**`migration.test.ts`**
- A saved pre-frame project loads, gains a frame, and every geometry array is
  **byte-identical** to before.

**One-frame gate** — `lib/__tests__/one-frame.test.ts` is extended: the site frame, the
canvas transform and the 3D scene must agree on metres-per-unit and on north.

---

## 10 · Out of scope for Step 1

Named so the implementation plan does not drift into them.

- Roof drawing, editing and ghost review — **Step 2**.
- Obstruction placement — **Step 3**.
- Converting an imported DXF polyline into a roof — **Step 2**.
- The monthly-shading fix (PVGIS-weighted access per month) — the **shading pass**;
  recorded in §11 because §3.4 feeds it.
- CAD, PVsyst and SketchUp **export** — a later step.
- The commercial fields — moved, not changed.
- Anything about subscriptions, plans or capacity limits — permanently out (D38).

---

## 11 · Recorded for the shading pass (not built here)

`lib/shading.ts` does not use PVGIS at all. Sample weights are
`max(0, sin(altitude)) × hourStep` — a clear-sky geometric proxy. All twelve months are
sampled, then collapsed into **one annual access figure**, which
`computeEnergyReport` applies identically to every month.

That is wrong for India: winter sun is low so shadows are longest, while monsoon months
deliver little energy. Today July and January carry equal weight.

**The fix, for its own pass:** `computeSolarAccess` returns twelve monthly access values;
each sample's weight comes from the site's real PVGIS monthly GHI; `computeEnergyReport`
applies month `m`'s access to month `m`'s energy. The surround solids from §3.4 become
casters in that same engine.

---

## 12 · Suggested build order

This spec is larger than one sitting. It splits cleanly at these seams, each shippable
and testable on its own, in this order:

| # | Slice | Ships |
|---|---|---|
| 1 | `frame.ts` + migration + the D1 regression test | The ruler is correct. Nothing visible changes. |
| 2 | `imagery.ts` + `mosaic.ts`, canvas and 3D switched to the layer stack | Sharp, correctly placed imagery. D2 and D3 closed. |
| 3 | The Step 1 screen, the Confirm flow, re-anchor | The map-first site. D4 and D7 closed. |
| 4 | `surround.ts` + shading wiring | Real ground and shading neighbours. D5 closed. |
| 5 | `import/` + alignment | The user's own files. D6 closed. |

Slice 1 must land first — every later slice depends on the frame.

---

## 13 · Interfaces later steps consume

| Consumer | Reads |
|---|---|
| `SatCanvas` | base `ImageryLayer` (origin, span, m/px), `SiteFrame` for the scale bar and north badge |
| `Scene3D` | base layer as ground texture, `SurroundModel` for terrain and neighbours |
| `lib/scene-model.ts` | `SurroundModel.solids` → shadow casters |
| `lib/roof-ai/pipeline.ts` | `frame.toEN` in place of `makeProjector` |
| Step 2 | stashed roof ghosts from the Confirm run; `user-vector` layers to trace over |
| Step 3 | `SurroundModel` for context; surround solids are **not** obstructions |
| Export (later) | `frame.toUtm` so exported CAD carries true survey coordinates |
