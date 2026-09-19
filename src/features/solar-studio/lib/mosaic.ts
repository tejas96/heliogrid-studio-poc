// ─── The basemap as MANY tiles, not one picture ──────────────────────────────
// Why this file exists, measured before it did:
//
// The 2D canvas asked Static Maps for exactly ONE image — `zoom=20,
// size=640x640, scale=2` — and stretched it across the whole editor. One image
// at zoom 20 is 84.8 m of ground at latitude 27.5. Everything past its edge was
// black, and zooming out did not fetch more: it shrank the same picture. The
// largest area that could be traced was therefore ~78 m square = 6,153 m²,
// which is 800 kWp of modules. A 100 MW plant needs ~1.1 km² — about 155× more
// ground than the canvas could ever show. You cannot trace what you cannot see,
// so the imagery, not the layout engine, was the ceiling on project size.
//
// SatCanvas already had the beginning of an answer: a `coverM` prop that steps
// the map zoom back through `zoomCovering` until one tile holds the site. It
// was fully written, fully documented — and passed by nobody, so every canvas
// in the app ran at zoom 20. Stepping back alone is also only half an answer:
// at zoom 16 one tile does span 1.36 km, but at 2.1 m per pixel, which is
// coarse enough that a module row is a smudge. A ground-mount plant needs BOTH
// a kilometre of ground AND centimetres under the cursor, and one image cannot
// carry both.
//
// So: a mosaic. Many Static Maps images, each at the sharpest zoom the current
// magnification actually resolves, only the ones the viewport can see.
//
// ── Why tile centres are computed in Mercator PIXELS, not in metres ──────────
// Adjacent tiles have to butt up exactly. A gap shows as a black seam, an
// overlap shows as a doubled row of modules, and either one is worse than the
// single stretched image it replaced. Static Maps renders Web Mercator, so a
// `size=640` image at zoom z spans exactly 640 Mercator pixels — an integer,
// with no projection error in it. Offsetting tile centres by 640 Mercator px
// is therefore seam-free by construction.
//
// Offsetting by "84.8 metres" instead would NOT be: metres-per-pixel is a
// function of latitude, so a metre-based step accumulates error away from the
// pin and the seams open up. This is the same trap `lib/site/frame.ts` records
// for geodesy — the app has an exact ellipsoidal ruler for GEOMETRY, and the
// imagery has its own spherical one. Each is used for its own job. Mixing them
// is what produced the 0.572% north-south disagreement that file documents.
//
// ── The residual, stated ────────────────────────────────────────────────────
// The canvas is a flat local frame; Mercator is not. Ground metres per Mercator
// pixel varies with latitude, so a mosaic laid on a flat canvas is very
// slightly non-uniform north-south. Size of it: at latitude 27.5°, 1 km north
// changes cos(latitude) by 5e-5, i.e. 0.05 m over that kilometre — under one
// pixel of zoom-20 imagery (0.071 m). Below the resolution of the picture it
// is correcting, so it is left alone and written down here.
import { SAT_ZOOM, metersPerStaticMap } from './maps';

/** Web Mercator tile size, the constant the whole projection is defined on. */
const MERCATOR_TILE_PX = 256;

/**
 * Static Maps request size, in Mercator pixels of GROUND. Matched to
 * SatCanvas's own TILE_PX — a mosaic that stepped in different units from the
 * canvas drawing it would seam.
 */
export const MOSAIC_TILE_PX = 640;

/**
 * `scale=2` returns 1280 image pixels for those 640 Mercator pixels — twice the
 * detail for the same ground and the same quota line. The zoom chooser below
 * counts on it: it is what lets zoom 19 look sharp enough to skip zoom 20, and
 * so halves the tile count for the same picture.
 */
export const MOSAIC_TILE_SCALE = 2 as const;

/**
 * The widest single picture anything here will ask for — and so the widest
 * PLANE the canvas can lay out, since the backdrop has to cover it.
 *
 * One tile at this zoom is 5.4 km of ground at Indian latitudes, which holds
 * any utility-scale site an EPC will trace. It is exported because SatCanvas
 * sizes its plane with the same number: a canvas whose plane could outgrow the
 * backdrop would show black past the backdrop's edge, which is the exact defect
 * this module exists to remove. One constant, one owner.
 */
export const MIN_TILE_ZOOM = 14;

/**
 * Most sharp tiles in flight at once.
 *
 * This is a real limit, not a tidiness preference. Each tile is one billed
 * Static Maps request and one HTTP connection, and a browser serialises past
 * ~6 per host — so an uncapped mosaic over a 1.4 km site at zoom 20 would
 * queue 256 requests, bill 256 loads, and leave the user watching tiles trickle
 * in for half a minute. When the cap is hit the mosaic drops to a coarser zoom
 * rather than truncating the picture: a whole slightly-soft site is useful, and
 * a sharp quarter of one with black where the rest should be is not.
 */
export const MAX_MOSAIC_TILES = 24;

export interface MosaicTile {
  /**
   * Stable identity: zoom + integer grid position. Used as the React key, so a
   * tile that stays in view across a pan keeps its very same `<img>` element
   * and is never re-requested or re-decoded. Panning a mosaic that re-keyed
   * every frame would flash white and re-bill every tile.
   */
  key: string;
  /** tile centre, for `staticSatelliteUrl` */
  lat: number;
  lng: number;
  zoom: number;
  /** tile box in CANVAS px (the un-zoomed content plane SatCanvas lays out in) */
  leftPx: number;
  topPx: number;
  sizePx: number;
}

/** Web Mercator world size in pixels at a zoom. */
function worldPx(zoom: number): number {
  return MERCATOR_TILE_PX * Math.pow(2, zoom);
}

/** lat/lng -> absolute Web Mercator pixel at a zoom. */
function toMercatorPx(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const w = worldPx(zoom);
  // clamp at the projection's own poles: tan blows up at ±90° and Mercator is
  // undefined there. No site is within 5° of a pole, so this only ever guards
  // a corrupt input from reaching Infinity and painting NaN tiles.
  const s = Math.sin(Math.max(-85.05112878, Math.min(85.05112878, lat)) * (Math.PI / 180));
  return {
    x: ((lng + 180) / 360) * w,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * w,
  };
}

/** Absolute Web Mercator pixel -> lat/lng. Exact inverse of toMercatorPx. */
function fromMercatorPx(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const w = worldPx(zoom);
  const lat =
    (2 * Math.atan(Math.exp((0.5 - y / w) * 2 * Math.PI)) - Math.PI / 2) * (180 / Math.PI);
  // wrap longitude into (-180, 180] so a mosaic straddling the antimeridian
  // asks Static Maps for a coordinate it accepts, rather than 180.03
  let lng = (x / w) * 360 - 180;
  if (lng > 180 || lng <= -180) {
    lng = ((((lng + 180) % 360) + 360) % 360) - 180;
    if (lng === -180) lng = 180;
  }
  return { lat, lng };
}

/**
 * Imagery pixels per ground metre that a map zoom actually delivers, counting
 * `scale=2`. The number the zoom chooser compares against the screen.
 */
function imageryPxPerM(lat: number, zoom: number): number {
  return (MOSAIC_TILE_PX * MOSAIC_TILE_SCALE) / metersPerStaticMap(lat, zoom, MOSAIC_TILE_PX);
}

/**
 * The coarsest zoom that still resolves what the screen is showing — i.e. the
 * cheapest imagery the user cannot tell from sharper imagery.
 *
 * Asking for zoom 20 at every magnification is what makes a tiled map feel
 * slow: zoomed out to a whole 1.4 km field, zoom-20 tiles are downscaled ~30×
 * on screen, so 256 requests are spent rendering detail that is thrown away in
 * the resample. Matching the imagery to the screen is the single change that
 * makes the mosaic affordable, and it costs nothing visible — by definition the
 * chosen zoom carries at least one imagery pixel per screen pixel.
 */
export function detailZoomFor(lat: number, screenPxPerM: number): number {
  for (let z = MIN_TILE_ZOOM; z < SAT_ZOOM; z++) {
    if (imageryPxPerM(lat, z) >= screenPxPerM) return z;
  }
  return SAT_ZOOM;
}

export interface MosaicRequest {
  /** the site pin: canvas world origin (0,0) and the mosaic's grid anchor */
  lat: number;
  lng: number;
  /** world metres the canvas plane spans edge to edge (already calibrated) */
  spanM: number;
  /** logical canvas px the plane is laid out in (square) */
  sizePx: number;
  /**
   * Visible world rect, in the SAME metres as `spanM`. Tiles outside it are not
   * requested. Pass the whole plane to disable culling (the 3D ground texture
   * and any non-interactive consumer do).
   */
  view: { minX: number; maxX: number; minY: number; maxY: number };
  /** screen px per world metre right now — picks the zoom */
  screenPxPerM: number;
  /** site calibration (project.calibration.scaleFactor); 1 = uncalibrated */
  scaleFactor?: number;
  /** rings of tiles fetched beyond the viewport, so a pan is already covered */
  marginTiles?: number;
}

/**
 * The tiles to draw, cheapest sufficient zoom first choice, viewport-culled and
 * count-capped.
 *
 * Pure: no fetching, no DOM, no React. The component does nothing but map this
 * list to `<img>` elements, which is what makes the seam arithmetic and the
 * cost cap testable without a browser.
 */
export function mosaicTiles(req: MosaicRequest): MosaicTile[] {
  const { lat, lng, spanM, sizePx, view, screenPxPerM } = req;
  const scaleFactor = req.scaleFactor ?? 1;
  const margin = req.marginTiles ?? 1;
  if (!(spanM > 0) || !(sizePx > 0) || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const pxPerM = sizePx / spanM; // canvas px per world metre

  // The mosaic exists only to be SHARPER than the backdrop. At the backdrop's
  // own zoom one picture already covers the whole plane, so tiles there would
  // be the same imagery re-requested in pieces — more cost, no more detail.
  // That makes this the natural floor of the step-back loop, and the reason the
  // loop can give up entirely instead of being forced to emit something.
  const floor = backdropZoom(lat, spanM, scaleFactor);

  // Step back until the picture fits the request cap. Each step halves the
  // tiles on BOTH axes, so a handful of iterations covers any site. The
  // prefetch margin is a luxury and is surrendered FIRST: a ring of
  // off-screen tiles is there to make panning feel instant, and paying for it
  // with a coarser picture under the cursor is the wrong trade.
  for (let zoom = Math.max(floor, detailZoomFor(lat, screenPxPerM)); zoom > floor; zoom -= 1) {
    const withMargin = layOut(zoom, margin);
    if (withMargin.length <= MAX_MOSAIC_TILES) return withMargin;
    const bare = layOut(zoom, 0);
    if (bare.length <= MAX_MOSAIC_TILES) return bare;
  }
  // Nothing sharper than the backdrop fits the budget — so the backdrop IS the
  // picture. Returning none is not a failure: it is the correct answer at a
  // magnification where the wide image already carries every pixel the screen
  // can show, and it is what keeps a fully zoomed-out kilometre-wide site at
  // ONE request instead of hundreds.
  return [];

  function layOut(z: number, ring: number): MosaicTile[] {
    // A tile's ground span comes from the imagery's own model, then the site's
    // calibration factor — the same product `spanM` was built with, so the
    // mosaic and the geometry stay on one ruler.
    const tileM = metersPerStaticMap(lat, z, MOSAIC_TILE_PX) * scaleFactor;
    if (!(tileM > 0)) return [];
    const tileCanvasPx = tileM * pxPerM;

    // Grid anchored so tile (0,0) is CENTRED on the site pin. Anchoring at the
    // pin (rather than at a Mercator-absolute tile boundary) means the sharpest
    // imagery lands on the site itself, and the single-tile case reduces to
    // exactly the picture this canvas drew before the mosaic existed.
    const iMin = Math.floor((view.minX / tileM) + 0.5) - ring;
    const iMax = Math.ceil((view.maxX / tileM) - 0.5) + ring;
    const jMin = Math.floor((view.minY / tileM) + 0.5) - ring;
    const jMax = Math.ceil((view.maxY / tileM) - 0.5) + ring;

    const anchor = toMercatorPx(lat, lng, z);
    const out: MosaicTile[] = [];
    for (let j = jMin; j <= jMax; j++) {
      for (let i = iMin; i <= iMax; i++) {
        // exact, seam-free step: one request width in Mercator pixels.
        // +y is SOUTH in Mercator and NORTH in world metres, hence the minus.
        const c = fromMercatorPx(
          anchor.x + i * MOSAIC_TILE_PX,
          anchor.y - j * MOSAIC_TILE_PX,
          z,
        );
        const cx = i * tileM; // tile centre in world metres, +x east
        const cy = j * tileM; // +y north
        out.push({
          key: `${z}/${i}/${j}`,
          lat: c.lat,
          lng: c.lng,
          zoom: z,
          // world -> canvas px: x right, y DOWN (SatCanvas.toPx's convention)
          leftPx: (cx / spanM + 0.5) * sizePx - tileCanvasPx / 2,
          topPx: (0.5 - cy / spanM) * sizePx - tileCanvasPx / 2,
          sizePx: tileCanvasPx,
        });
      }
    }
    return out;
  }
}

/**
 * The one wide tile drawn UNDER the mosaic, so there is never a black hole.
 *
 * A sharp tile takes a moment to arrive. Without a backdrop the user sees the
 * void through every gap while panning, which reads as the site being broken
 * rather than as imagery loading — the exact impression the single-tile canvas
 * gave past its own edge. One extra request, cached by the browser after the
 * first, buys a picture that is complete at every instant and only ever gets
 * sharper. It covers the WHOLE plane, so it is also the answer at the widest
 * zoom-out, where the mosaic is culled to nothing.
 */
export function backdropZoom(lat: number, spanM: number, scaleFactor = 1): number {
  const needed = spanM / (scaleFactor || 1);
  for (let z = SAT_ZOOM; z > MIN_TILE_ZOOM; z--) {
    if (metersPerStaticMap(lat, z, MOSAIC_TILE_PX) >= needed) return z;
  }
  return MIN_TILE_ZOOM;
}
