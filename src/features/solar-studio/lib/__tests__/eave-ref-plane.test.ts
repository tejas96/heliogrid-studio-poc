import { describe, expect, it } from 'vitest';
import type { Roof, XY } from '../../types';
import { computeEaveRefs, surfaceHeightAt } from '../roof-plane';

// computeEaveRefs groups ADJACENT same-slope roofs and gives them ONE eave
// datum, so a slope split across polygons reads as a single continuous plane.
// Two defects (EPC review): azimuth compared without wraparound, so 359.8 vs
// 0.1 read as 359.7 apart; and no height check, so parallel-but-STEPPED roofs
// were fused onto one datum.

function roof(id: string, x0: number, az: number, heightM = 3): Roof {
  const poly: XY[] = [
    { x: x0, y: 0 }, { x: x0 + 10, y: 0 }, { x: x0 + 10, y: 8 }, { x: x0, y: 8 },
  ];
  return {
    id, name: id, polygon: poly, roofType: 'rcc_flat', heightM,
    pitchDeg: 20, slopeAzimuthDeg: az, setbackM: 0.3, perEdgeSetbacksM: null,
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
}

describe('eave datum grouping', () => {
  it('adjacent faces near NORTH (359.8° vs 0.1°) share one datum', () => {
    const a = roof('a', 0, 359.8);
    const b = roof('b', 10, 0.1); // shares the x=10 wall
    const refs = computeEaveRefs([a, b]);
    expect(refs.get('a')).toBeCloseTo(refs.get('b')!, 9);
  });

  it('and therefore meet at ONE height along the shared edge', () => {
    const a = roof('a', 0, 359.8);
    const b = roof('b', 10, 0.1);
    const refs = computeEaveRefs([a, b]);
    const seam: XY = { x: 10, y: 4 };
    const ha = surfaceHeightAt(a, seam, refs.get('a'));
    const hb = surfaceHeightAt(b, seam, refs.get('b'));
    expect(Math.abs(ha - hb)).toBeLessThan(0.02);
  });

  it('parallel roofs at DIFFERENT heights are NOT fused onto one plane', () => {
    // NB: the datum is a PROJECTION, and two separately-grouped roofs with the
    // same extent can share a projection value. What proves they were not fused
    // is that their surfaces stay 3 m apart — the step is preserved.
    const a = roof('a', 0, 180, 3);
    const b = roof('b', 10, 180, 6); // same slope, 3 m higher — a stepped roof
    const refs = computeEaveRefs([a, b]);
    const at: XY = { x: 5, y: 4 };
    const bt: XY = { x: 15, y: 4 };
    const ha = surfaceHeightAt(a, at, refs.get('a'));
    const hb = surfaceHeightAt(b, bt, refs.get('b'));
    expect(hb - ha).toBeCloseTo(3, 6);
  });

  it('genuinely different orientations still separate', () => {
    const refs = computeEaveRefs([roof('a', 0, 180), roof('b', 10, 90)]);
    expect(refs.get('a')).not.toBeCloseTo(refs.get('b')!, 6);
  });
});
