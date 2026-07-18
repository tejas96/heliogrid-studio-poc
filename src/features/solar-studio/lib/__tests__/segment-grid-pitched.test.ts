import { describe, expect, it } from 'vitest';
import type { PanelSpec, Project, Roof, XY } from '../../types';
import { fillRoofAsSegment, planCellM } from '../layout';
import { reindexSegment } from '../segment-ops';

// segmentGrid used to re-derive the plan cell as w·cos(pitch) × h — the pre-S1
// axis assignment. On a PITCHED roof that is rotated 90° from the cell the fill
// actually places panels with, so reindexSegment mis-derives rows/cols. It went
// unnoticed because every other fixture in this area is a FLAT roof, where the
// two derivations coincide. This test is pitched on purpose.
const SPEC: PanelSpec = {
  id: 'p', brand: 'T', model: 'T', watt: 550, tech: 'Mono PERC',
  lengthMm: 2278, widthMm: 1134, vocV: 49.5, vmpV: 41, iscA: 14, impA: 13.4,
  tempCoeffVocPct: -0.27, almm: true, dcr: true, priceInr: 1,
};

const rect = (w: number, h: number): XY[] => [
  { x: -w / 2, y: -h / 2 }, { x: w / 2, y: -h / 2 },
  { x: w / 2, y: h / 2 }, { x: -w / 2, y: h / 2 },
];

function roof(pitchDeg: number): Roof {
  return {
    id: 'r', name: 'r', polygon: rect(20, 14), roofType: 'rcc_flat',
    heightM: 3, pitchDeg, slopeAzimuthDeg: 180, setbackM: 0.3, perEdgeSetbacksM: null,
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
}

const project = (r: Roof): Project =>
  ({ roofs: [r], panels: [], segments: [], obstructions: [], walkways: [], keepouts: [] } as unknown as Project);

describe('segment grid uses the SAME plan cell as the fill', () => {
  for (const pitch of [20, 30]) {
    it(`a ${pitch}° roof: reindex reproduces the fill's own grid`, () => {
      const r = roof(pitch);
      const filled = fillRoofAsSegment(project(r), r, SPEC);
      expect(filled, 'fill produced a segment').not.toBeNull();
      if (!filled) return;

      const re = reindexSegment(r, SPEC, filled.segment, filled.panels);

      // every panel keeps a cell, and no two panels collide on one cell —
      // the failure mode of a 90°-rotated grid is exactly a collision
      const cells = re.panels.map((p) => p.cellIndex);
      expect(cells.every((c) => c != null)).toBe(true);
      expect(new Set(cells).size, 'cellIndex collisions ⇒ grid rotated').toBe(cells.length);

      // and the derived extent must hold every panel
      expect(re.segment.rows * re.segment.cols).toBeGreaterThanOrEqual(re.panels.length);
    });
  }

  it('the pitched plan cell really is transposed vs the flat one', () => {
    // guards the premise: if these ever agree, the test above proves nothing
    const flat = planCellM(SPEC, 'portrait', roof(0));
    const tilt = planCellM(SPEC, 'portrait', roof(25));
    expect(tilt.ax).toBeCloseTo((SPEC.lengthMm / 1000) * Math.cos((25 * Math.PI) / 180), 6);
    expect(tilt.ay).toBeCloseTo(SPEC.widthMm / 1000, 6);
    expect(flat.ax).toBeCloseTo(SPEC.widthMm / 1000, 6); // axes swap on a slope
  });
});
