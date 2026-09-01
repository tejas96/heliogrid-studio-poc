// ─── Pipeline gates (Phase 5, task 23b) — run on REAL captured fixtures ─────
// datalayers-pune-dense: a Pune city block with 30.7% building mask coverage
// datalayers-pune:       the audit pin, mask legitimately EMPTY (0 pixels)
// Both captured live from Google Solar dataLayers (2026-07-16, EPSG:32643).
import { readFile } from 'fs/promises';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { decodeGeoTiff, detectRoofArtifact } from '../roof-ai/pipeline';
import { validateArtifact } from '../roof-ai/artifact';
import { utmToLatLng } from '../site/utm';
import { polygonArea } from '../geo';
import { makeSiteFrame, toEN } from '../site/frame';
import { sanitizeRoofPolygon } from '../roof-factory';

const FIXTURES = join(__dirname, 'fixtures');
// the pins each fixture was requested for (probe log, 2026-07-16)
const DENSE_PIN = { lat: 18.5203, lng: 73.8567 };
const EMPTY_PIN = { lat: 18.5158, lng: 73.9272 };

async function buf(fixture: string, file: string): Promise<ArrayBuffer> {
  const b = await readFile(join(FIXTURES, fixture, file));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe('decodeGeoTiff (real dataLayers rasters)', () => {
  it('decodes the mask with the verified grid + coverage', async () => {
    const mask = await decodeGeoTiff(await buf('datalayers-pune-dense', 'mask.tif'));
    expect(mask.epsg).toBe(32643); // UTM 43N
    expect(mask.width * mask.height).toBe(mask.data.length);
    let ones = 0;
    for (const v of mask.data) if (v === 1) ones += 1;
    expect(ones).toBe(180924); // byte-identical to the independent decode
  });

  it('DSM elevations are plausible for Pune (~560 m ASL)', async () => {
    const dsm = await decodeGeoTiff(await buf('datalayers-pune', 'dsm.tif'));
    const vals = [...(dsm.data as Float32Array)].filter((v) => v > 100).sort((a, b) => a - b);
    expect(vals[(vals.length / 2) | 0]).toBeGreaterThan(540);
    expect(vals[(vals.length / 2) | 0]).toBeLessThan(600);
  });
});

// Covers the raster→frame chain in isolation: decodeGeoTiff's own
// georeferencing (pixelToLatLng, from the raster's UTM tags) piped through
// lib/site/frame.ts. It does NOT call detectRoofArtifact and so does NOT
// cover pipeline.ts's choice of projector — see the golden test inside
// 'detectRoofArtifact — dense fixture' below for that.
describe('coordinate alignment gate (≤ 0.5 m)', () => {
  it('raster center maps back to the request pin', async () => {
    const mask = await decodeGeoTiff(await buf('datalayers-pune-dense', 'mask.tif'));
    const center = mask.pixelToLatLng(mask.width / 2, mask.height / 2);
    // AOI is centered on the pin — sub-pixel agreement expected
    const frame = makeSiteFrame(DENSE_PIN);
    const en = toEN(frame, center);
    expect(Math.hypot(en.x, en.y)).toBeLessThan(5); // meters off the pin
  });

  it('UTM distances survive the utm→latLng→frame chain within 0.1 m over 50 m', async () => {
    // This gate previously ACCEPTED a +0.63% north stretch, with a comment
    // claiming "the north-axis scale is shared by the imagery mapping itself".
    // It is not: the canvas uses the Web Mercator ground resolution, which is
    // the SAME in both axes, while makeProjector used the equatorial radius for
    // latitude only. That is why AI roofs and hand-traced roofs disagreed
    // north-south but not east-west. The frame (lib/site/frame.ts) removes it.
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

  it('utmToLatLng round-trips a known UTM 43N point', () => {
    // fixture origin (verified tag values): E 386730.1, N 2047619.8 → Pune area
    const ll = utmToLatLng(386730.1, 2047619.8, 43, true);
    expect(ll.lat).toBeGreaterThan(18.5);
    expect(ll.lat).toBeLessThan(18.53);
    expect(ll.lng).toBeGreaterThan(73.9);
    expect(ll.lng).toBeLessThan(73.94);
  });
});

describe('detectRoofArtifact — dense fixture (building present)', () => {
  const run = async () =>
    detectRoofArtifact({
      maskBuffer: await buf('datalayers-pune-dense', 'mask.tif'),
      dsmBuffer: await buf('datalayers-pune-dense', 'dsm.tif'),
      pin: DENSE_PIN,
      imageryQuality: 'LOW',
      generatedAt: 1,
    });

  it('recovers real building footprints that pass the FULL artifact validation', async () => {
    const artifact = await run();
    expect(artifact.roofs.length).toBeGreaterThanOrEqual(1);
    const validated = validateArtifact(artifact, DENSE_PIN);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.artifact.roofs.length).toBeGreaterThanOrEqual(1);
      const main = validated.artifact.roofs[0]; // largest component first
      expect(polygonArea(main.polygon)).toBeGreaterThan(50); // a real building
      expect(sanitizeRoofPolygon(main.polygon).ok).toBe(true);
      expect(main.confidence).toBeGreaterThan(0);
      expect(main.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('golden: largest roof holds its north-south extent to real ground metres', async () => {
    // GOLDEN / characterization test — same convention as bom-golden.test.ts and
    // structure-golden.test.ts: pin the CURRENT, correct output, then diff future
    // changes against it. This is the one test in this file that actually calls
    // detectRoofArtifact (via the run() helper above) and would catch a regression
    // to the old projector; the 'coordinate alignment gate' tests build their own
    // frame directly against decodeGeoTiff and never touch the pipeline, so they
    // pass unchanged even if pipeline.ts reverts to makeProjector.
    //
    // Golden value: 17.2439 m, measured from validated.artifact.roofs[0].polygon —
    // max(y) - min(y), the polygon's north-south span in the image-aligned frame.
    //
    // Tolerance arithmetic: the bug this slice fixes adds +0.572% to any north-south
    // length (equatorial vs meridional earth radius at Pune's latitude, 18.52°N).
    // At this extent that is 0.00572 × 17.2439 ≈ 0.0986 m. A tolerance a quarter of
    // that, ≈0.0247 m, is the loosest bound that still can't hide the bug. This test
    // uses 0.02 m — tighter still, and the pipeline is proven bit-deterministic
    // (see 'is fully deterministic' below), so there is no run-to-run noise to absorb.
    //
    // What a failure means:
    //   - drift of about +0.57% (extent lands near 17.34 m, i.e. +0.099 m): the
    //     pipeline has reverted to an equatorial-radius projector. Fix pipeline.ts;
    //     do not touch this golden value.
    //   - any OTHER drift: the vectorizer (traceBoundary / simplifyDP /
    //     orthogonalizeGated) changed on purpose. Re-measure and re-baseline this
    //     golden value deliberately.
    const artifact = await run();
    const validated = validateArtifact(artifact, DENSE_PIN);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      const main = validated.artifact.roofs[0]; // largest component first
      const ys = main.polygon.map((p) => p.y);
      const extentNS = Math.max(...ys) - Math.min(...ys);
      expect(extentNS).toBeGreaterThan(17.2439 - 0.02);
      expect(extentNS).toBeLessThan(17.2439 + 0.02);
    }
  });

  it('plane fits produce finite pitch and plausible heights where the DSM supports them', async () => {
    const artifact = await run();
    for (const r of artifact.roofs) {
      if (r.pitchDeg !== null) {
        expect(r.pitchDeg).toBeGreaterThanOrEqual(0);
        expect(r.pitchDeg).toBeLessThan(60);
      }
      if (r.heightM !== null) {
        expect(r.heightM).toBeGreaterThan(1);
        expect(r.heightM).toBeLessThan(60);
      }
    }
  });

  it('is fully deterministic', async () => {
    const [a, b] = [await run(), await run()];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('detectRoofArtifact — empty-mask fixture (the fallback ladder)', () => {
  it('returns zero roofs plus the honest warning that drives the fallback', async () => {
    const artifact = await detectRoofArtifact({
      maskBuffer: await buf('datalayers-pune', 'mask.tif'),
      dsmBuffer: await buf('datalayers-pune', 'dsm.tif'),
      pin: EMPTY_PIN,
      generatedAt: 1,
    });
    expect(artifact.roofs).toHaveLength(0);
    expect(artifact.obstructions).toHaveLength(0);
    expect(artifact.warnings.some((w) => w.includes('mask is empty'))).toBe(true);
  });
});
