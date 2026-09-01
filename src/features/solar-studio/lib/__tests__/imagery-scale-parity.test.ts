// ─── KNOWN-GAP PIN — a tripwire, NOT a correctness assertion ────────────────
// Three consumers scale imagery with `metersPerStaticMap` (lib/maps.ts): the
// 2D canvas (SatCanvas.tsx:99), the 3D ground texture (Scene3D.tsx:1161) and
// the Gemini image-space path (gemini-client.ts:54). Its constant
// 156543.03392 = 2π·6378137/256 is the SPHERICAL Web Mercator ground
// resolution. Web Mercator is conformal on the sphere, so it is isotropic in
// MAP units — which is anisotropic in GROUND metres on the WGS84 ellipsoid.
// The site frame (lib/site/frame.ts) is geodetically exact. Since the
// site-frame branch the two rulers therefore DISAGREE:
//
//   at Pune (18.5202°N), zoom 20, 640 px
//     canvas assumes one span, both axes : 90.5981 m
//     frame's true east-west span        : 90.6287 m   canvas/true = 0.999662 = a/N
//     frame's true north-south span      : 90.0829 m   canvas/true = 1.005720 = a/M
//
// Those are exactly the error factors of the deleted `makeProjector` (a/M and
// a/N), which is how the canvas and the old projector AGREED with each other
// while both were wrong. The branch fixed the frame and left the imagery, so
// a hand-traced roof and an AI-detected roof of the same building now differ
// by a/M − 1 = 0.572% north-south: 17 cm on a 30 m shed, 5.7 cm on a 10 m
// edge (under one screen pixel, so it cannot be seen).
//
// This test records the SIZE of that gap so slice 2 (the imagery layer, spec
// §3.3 blocking precondition) has to change it deliberately. When the imagery
// scale is corrected — an anisotropic metres-per-pixel (north-south r·M/a,
// east-west r·N/a) or an explicit reprojection — BOTH ratios become 1 and
// this test MUST be updated as part of that work. Until then, a change to
// either ratio means one ruler moved without the other.
import { describe, expect, it } from 'vitest';
import { SAT_ZOOM } from '../../components/SatCanvas';
import { metersPerStaticMap } from '../maps';
import { makeSiteFrame, toEN } from '../site/frame';

const PUNE = { lat: 18.5202, lng: 73.8567 };
const TILE_PX = 640; // SatCanvas.tsx:99 and Scene3D.tsx:1161 both request 640

/**
 * The lat/lng extent of a Static Maps tile, exactly as a Web Mercator tile
 * server defines it: x is linear in longitude; y is linear in the Mercator
 * ordinate ln(tan(π/4 + φ/2)), inverted here for the top and bottom edges.
 * This is a fact about the IMAGERY, not a model — the frame then says how
 * many true ground metres lie between those edges.
 */
function tileExtent(lat: number, zoom: number, sizePx: number) {
  const worldPx = 256 * 2 ** zoom;
  const lngDeg = (sizePx / worldPx) * 360;
  const yCentre = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const halfY = (sizePx / 2) * ((2 * Math.PI) / worldPx);
  const latOf = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;
  return { lngDeg, latTop: latOf(yCentre + halfY), latBottom: latOf(yCentre - halfY) };
}

describe('imagery scale vs the site frame — the gap the site-frame branch opened', () => {
  const canvasSpan = metersPerStaticMap(PUNE.lat, SAT_ZOOM, TILE_PX);
  const frame = makeSiteFrame(PUNE);
  const tile = tileExtent(PUNE.lat, SAT_ZOOM, TILE_PX);
  const eastWest =
    toEN(frame, { lat: PUNE.lat, lng: PUNE.lng + tile.lngDeg / 2 }).x -
    toEN(frame, { lat: PUNE.lat, lng: PUNE.lng - tile.lngDeg / 2 }).x;
  const northSouth =
    toEN(frame, { lat: tile.latTop, lng: PUNE.lng }).y -
    toEN(frame, { lat: tile.latBottom, lng: PUNE.lng }).y;

  it('the canvas assumes ONE span for both axes: 90.5981 m at Pune, zoom 20, 640 px', () => {
    expect(SAT_ZOOM).toBe(20); // every figure in this file is for this zoom
    expect(canvasSpan).toBeCloseTo(90.5981, 3);
  });

  it('north-south: the canvas over-reads true ground by a/M = 1.005720', () => {
    expect(northSouth).toBeCloseTo(90.0829, 3);
    expect(canvasSpan / northSouth).toBeCloseTo(1.00572, 5);
  });

  it('east-west: the canvas under-reads true ground by a/N = 0.999662', () => {
    expect(eastWest).toBeCloseTo(90.6287, 3);
    expect(canvasSpan / eastWest).toBeCloseTo(0.999662, 5);
  });

  it('the gap is a/M − 1 = 0.572% north-south — the figure spec §3.3 and the release note quote', () => {
    expect((canvasSpan / northSouth - 1) * 100).toBeCloseTo(0.572, 3);
    // 5.7 cm on a 10 m edge: under one screen pixel at any studio zoom
    expect((canvasSpan / northSouth - 1) * 10).toBeCloseTo(0.057, 3);
  });
});
