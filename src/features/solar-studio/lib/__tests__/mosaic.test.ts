// ─── Gate: the basemap covers a SITE, and it does it seam-free and capped ───
// Three claims hold this up, and every one of them is silent when it breaks —
// which is why they are pinned here rather than left to the eye:
//
//   the tiles BUTT UP. A gap paints a black grid over the imagery and an
//   overlap paints a doubled row of modules. Both look like a rendering bug
//   rather than an arithmetic one, and both come from stepping tile centres in
//   metres instead of in Mercator pixels;
//
//   the cost is CAPPED. Every tile is one billed Static Maps request. Asking
//   for the sharpest imagery over a square kilometre is 256 of them, which
//   bills 256 loads and leaves the user watching a picture trickle in;
//
//   a SITE fits. This is the defect the work started from: one zoom-20 tile is
//   84.8 m of ground, so the largest plant the app could design was ~800 kWp
//   however much land the customer had.
import { describe, expect, it } from 'vitest';
import { MAX_MOSAIC_TILES, MOSAIC_TILE_PX, backdropZoom, detailZoomFor, mosaicTiles } from '../mosaic';
import { SAT_ZOOM, metersPerStaticMap } from '../maps';
import { siteCoverM } from '../site-cover';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Project, Roof } from '../../types';

/** Bhadla, Rajasthan — the latitude every measurement in this slice was taken at. */
const LAT = 27.49;
const LNG = 71.91;

/** A view wide enough to need many tiles, on a plane wide enough to hold them. */
function wideRequest(spanM: number, screenPxPerM: number) {
  const half = spanM / 2;
  return {
    lat: LAT,
    lng: LNG,
    spanM,
    sizePx: 1000,
    view: { minX: -half, maxX: half, minY: -half, maxY: half },
    screenPxPerM,
  };
}

describe('the mosaic tiles the ground without seams', () => {
  it('neighbouring tiles share an edge exactly — no gap, no overlap', () => {
    // a magnification that forces the sharpest imagery, over a plane far wider
    // than one tile, so there are interior seams on both axes to check
    const tiles = mosaicTiles(wideRequest(680, 14));
    expect(tiles.length, 'this request must actually produce a grid').toBeGreaterThan(4);

    const size = tiles[0].sizePx;
    // every tile is the same size: a mosaic of unequal boxes cannot tessellate
    for (const t of tiles) expect(t.sizePx).toBeCloseTo(size, 9);

    // group by row, then walk each row left to right: the next tile's left edge
    // must be the previous tile's right edge, to floating-point.
    const rows = new Map<number, typeof tiles>();
    for (const t of tiles) {
      const k = Math.round(t.topPx * 1e6);
      rows.set(k, [...(rows.get(k) ?? []), t]);
    }
    let checked = 0;
    for (const row of rows.values()) {
      const sorted = [...row].sort((a, b) => a.leftPx - b.leftPx);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].leftPx).toBeCloseTo(sorted[i - 1].leftPx + size, 6);
        checked++;
      }
    }
    expect(checked, 'the test must have found interior seams to check').toBeGreaterThan(0);
  });

  it('a tile centre is one request-width of Mercator away from its neighbour', () => {
    // THE seam guarantee, checked at the source rather than through the layout:
    // the ground a tile spans must equal the step between tile centres. Stepping
    // in metres instead makes these two disagree away from the pin, which is
    // what opens the seams up at the edges of a big site.
    const tiles = mosaicTiles(wideRequest(680, 14));
    const z = tiles[0].zoom;
    const tileM = metersPerStaticMap(LAT, z, MOSAIC_TILE_PX);
    const pxPerM = 1000 / 680;
    expect(tiles[0].sizePx).toBeCloseTo(tileM * pxPerM, 6);
  });
});

describe('the mosaic is affordable', () => {
  it('it never asks for more tiles than the cap, however big the view', () => {
    // every plane size the canvas can lay out, at every magnification from
    // fully out to hard in. Not one of them may bill more than the cap.
    for (const spanM of [84.8, 340, 680, 1400, 2700, 5400]) {
      for (const pxPerM of [0.2, 0.5, 1, 2, 5, 12, 30, 80]) {
        const tiles = mosaicTiles(wideRequest(spanM, pxPerM));
        expect(
          tiles.length,
          `span ${spanM} m at ${pxPerM} px/m billed ${tiles.length} tiles`,
        ).toBeLessThanOrEqual(MAX_MOSAIC_TILES);
      }
    }
  });

  it('when it cannot be sharper than the backdrop it draws nothing at all', () => {
    // A fully zoomed-out kilometre-wide site must cost ONE request, not
    // hundreds. The backdrop already covers the whole plane there, so tiles at
    // that zoom would be the same imagery re-requested in pieces. Returning
    // none is the right answer, and it is what keeps the cap honest without
    // ever truncating the picture.
    expect(mosaicTiles(wideRequest(2700, 0.2))).toHaveLength(0);
  });

  it('it pays the cap in sharpness, never in coverage', () => {
    // whatever it returns must cover the view it was asked for — a mosaic with
    // a hole in it is worse than the single stretched image this replaced
    const tiles = mosaicTiles(wideRequest(680, 8));
    expect(tiles.length).toBeGreaterThan(0);
    expect(Math.min(...tiles.map((t) => t.leftPx))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.leftPx + t.sizePx))).toBeGreaterThanOrEqual(1000);
    expect(Math.min(...tiles.map((t) => t.topPx))).toBeLessThanOrEqual(0);
    expect(Math.max(...tiles.map((t) => t.topPx + t.sizePx))).toBeGreaterThanOrEqual(1000);
  });

  it('it buys only the sharpness the screen can show', () => {
    // zoomed out, sharp imagery is thrown away in the downscale — so it is not
    // requested. This is the single choice that makes tiling affordable.
    expect(detailZoomFor(LAT, 0.5)).toBeLessThan(SAT_ZOOM);
    // and under a cursor at working magnification it does go to the sharpest
    expect(detailZoomFor(LAT, 40)).toBe(SAT_ZOOM);
    // monotone: more screen resolution never asks for coarser imagery
    let prev = 0;
    for (const s of [0.2, 1, 3, 8, 20, 60]) {
      const z = detailZoomFor(LAT, s);
      expect(z).toBeGreaterThanOrEqual(prev);
      prev = z;
    }
  });

  it('the backdrop always covers the whole plane, so nothing is ever black', () => {
    for (const spanM of [84.8, 340, 680, 1400, 2700, 5400]) {
      const z = backdropZoom(LAT, spanM);
      expect(
        metersPerStaticMap(LAT, z, MOSAIC_TILE_PX),
        `backdrop must hold a ${spanM} m plane`,
      ).toBeGreaterThanOrEqual(spanM - 1e-6);
    }
  });
});

describe('a site decides how much ground the editor shows', () => {
  /** A project with one square field of `side` metres centred on the pin. */
  function withField(side: number, groundMount: boolean): Project {
    const base = fixtureProject(0);
    const h = side / 2;
    const roof: Roof = {
      ...fixtureRoof(),
      roofType: 'ground',
      heightM: 0,
      polygon: [
        { x: -h, y: -h },
        { x: h, y: -h },
        { x: h, y: h },
        { x: -h, y: h },
      ],
    };
    return {
      ...base,
      info: { ...base.info, groundMount },
      roofs: [roof],
      panels: [],
      segments: [],
    };
  }

  it('a rooftop project with nothing drawn opens exactly where it always did', () => {
    // the floor is the old default: one zoom-20 tile. Residential work must not
    // move because ground mount was fixed.
    const empty = { ...fixtureProject(0), roofs: [], panels: [], segments: [] };
    const cover = siteCoverM(empty);
    expect(cover).toBeLessThanOrEqual(metersPerStaticMap(LAT, SAT_ZOOM, MOSAIC_TILE_PX));
  });

  it('a ground mount project opens wide BEFORE anything is drawn', () => {
    // the chicken-and-egg behind the report: a plot cannot be traced inside a
    // picture too small to show it, so the wide view cannot wait for geometry
    const empty = { ...fixtureProject(0), roofs: [], panels: [], segments: [] };
    const ground = { ...empty, info: { ...empty.info, groundMount: true } };
    expect(siteCoverM(ground)).toBeGreaterThan(400);
    expect(siteCoverM(ground)).toBeGreaterThan(siteCoverM(empty));
  });

  it('the view grows with the site, and always leaves room to grab an edge', () => {
    const cover = siteCoverM(withField(372, true));
    // the drawn field measured in the browser for this slice was 372 m square
    expect(cover).toBeGreaterThan(372);
    // a boundary traced hard against the edge of the picture cannot be adjusted
    expect(cover).toBeGreaterThan(372 * 1.2);
    // and a bigger field asks for more ground, monotonically
    expect(siteCoverM(withField(800, true))).toBeGreaterThan(cover);
  });
});
