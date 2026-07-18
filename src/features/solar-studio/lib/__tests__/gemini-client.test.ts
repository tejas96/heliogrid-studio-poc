// ─── Gemini path gates (Phase 5, task 23d) — fixture-driven, no live calls ──
import { describe, expect, it } from 'vitest';
import {
  GEMINI_TILE_PX,
  crossCheckWithGeometry,
  geminiDetectionToArtifact,
  type GeminiDetection,
} from '../roof-ai/gemini-client';
import { validateArtifact } from '../roof-ai/artifact';
import { metersPerStaticMap } from '../maps';

const PIN = { lat: 18.5203, lng: 73.8567 };
const SPAN = metersPerStaticMap(PIN.lat, 20, GEMINI_TILE_PX); // uncalibrated

// a clean square roof around the tile centre, 100 px (~14 m) wide
const DETECTION: GeminiDetection = {
  roofs: [
    {
      polygonPx: [
        { x: 270, y: 270 },
        { x: 370, y: 270 },
        { x: 370, y: 370 },
        { x: 270, y: 370 },
      ],
      confidence: 0.85,
    },
  ],
  objects: [
    { centerPx: { x: 320, y: 300 }, widthPx: 15, heightPx: 12, kind: 'water_tank', confidence: 0.7 },
  ],
};

describe('geminiDetectionToArtifact (pixel → meter contract)', () => {
  const artifact = geminiDetectionToArtifact(DETECTION, PIN, 1, 42, {
    promptVersion: 'roof-detect-v1',
    model: 'gemini-test',
  });

  it('maps the tile centre to the origin and scales by the tile span', () => {
    const poly = artifact.roofs[0].polygon;
    // centroid of the 270..370 px square = tile centre → (0,0) m
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    expect(Math.abs(cx)).toBeLessThan(1e-9);
    expect(Math.abs(cy)).toBeLessThan(1e-9);
    // 100 px wide = 100/640 of the span
    const width = Math.max(...poly.map((p) => p.x)) - Math.min(...poly.map((p) => p.x));
    expect(width).toBeCloseTo((100 / 640) * SPAN, 6);
  });

  it('applies calibration.scaleFactor (a calibrated project must not misalign)', () => {
    const calibrated = geminiDetectionToArtifact(DETECTION, PIN, 1.05, 42);
    const w = (poly: { x: number }[]) =>
      Math.max(...poly.map((p) => p.x)) - Math.min(...poly.map((p) => p.x));
    expect(w(calibrated.roofs[0].polygon)).toBeCloseTo(
      w(artifact.roofs[0].polygon) * 1.05,
      6,
    );
  });

  it('imagery cannot measure heights: roofs get null, objects get type presets', () => {
    expect(artifact.roofs[0].heightM).toBeNull();
    expect(artifact.obstructions[0].type).toBe('tank'); // water_tank → tank
    expect(artifact.obstructions[0].heightM).toBe(1.2); // tank preset height
    expect(artifact.warnings.some((w) => w.includes('NOT measurable'))).toBe(true);
  });

  it('the artifact passes the SAME validation doorway as the geometric path', () => {
    const res = validateArtifact(artifact, PIN);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.artifact.source).toBe('gemini');
      expect(res.artifact.roofs).toHaveLength(1);
      expect(res.artifact.obstructions).toHaveLength(1);
    }
  });

  it('garbage detections are dropped by validation, not imported', () => {
    const bad = geminiDetectionToArtifact(
      {
        roofs: [
          { polygonPx: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], confidence: 0.9 }, // sub-mm sliver
          { polygonPx: [{ x: 10, y: 10 }], confidence: 0.9 }, // not a polygon
        ],
        objects: [],
      },
      PIN,
      1,
      42,
    );
    const res = validateArtifact(bad, PIN);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.artifact.roofs).toHaveLength(0);
  });
});

describe('crossCheckWithGeometry (plan §23b)', () => {
  const gem = geminiDetectionToArtifact(DETECTION, PIN, 1, 42);

  it('agreement with the geometric mask keeps confidence', () => {
    // reference roof = the same square → full overlap
    const checked = crossCheckWithGeometry(gem, [
      { ...gem.roofs[0], id: 'ref_1' },
    ]);
    expect(checked.roofs[0].confidence).toBe(0.85);
  });

  it('disagreement floors confidence and adds a warning — never deletes', () => {
    // reference far away → ~0% overlap
    const far = gem.roofs[0].polygon.map((p) => ({ x: p.x + 40, y: p.y + 40 }));
    const checked = crossCheckWithGeometry(gem, [{ ...gem.roofs[0], id: 'ref_1', polygon: far }]);
    expect(checked.roofs[0].confidence).toBeLessThanOrEqual(0.25);
    expect(checked.roofs).toHaveLength(1); // still present — the USER decides
    expect(checked.warnings.some((w) => w.includes('disagrees'))).toBe(true);
  });

  it('no geometric reference ⇒ no judgement (the Gemini-as-fallback case)', () => {
    const checked = crossCheckWithGeometry(gem, []);
    expect(checked).toBe(gem);
  });
});
