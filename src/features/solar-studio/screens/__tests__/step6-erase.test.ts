// ─── Eraser hit-testing: every placeable thing must be erasable ─────────────
import { describe, expect, it } from 'vitest';
import { findEraseTargetAt, inverterPlacementPos } from '../step6-erase';
import type { Project } from '../../types';

/** Minimal project: one 10×10 roof with one of everything the eraser handles. */
function fixture(overrides: Partial<Project> = {}): Project {
  return {
    roofs: [
      {
        id: 'r1',
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      },
    ],
    panels: [
      {
        id: 'pv1',
        roofId: 'r1',
        center: { x: 2, y: 2 },
        orientation: 'portrait',
        azimuthDeg: 0,
        tiltDeg: 0,
        solarAccess: 1,
        enabled: true,
      },
    ],
    arresters: [{ id: 'la1', roofId: 'r1', pos: { x: 8, y: 2 }, heightMm: 2000 }],
    inverterPlacements: [
      // edge 0 runs (0,0)→(10,0); t=0.5 puts the marker at (5,0)
      { id: 'invp1', roofId: 'r1', edgeIndex: 0, t: 0.5, heightM: 1.5 },
    ],
    gridConnection: { pos: { x: 8, y: 8 } },
    walkways: [
      { id: 'wk1', roofId: 'r1', a: { x: 0, y: 5 }, b: { x: 10, y: 5 }, widthMm: 800, heightMm: 100 },
      // vertical walkway passing straight under the panel at (2,2)
      { id: 'wk2', roofId: 'r1', a: { x: 2, y: 0 }, b: { x: 2, y: 10 }, widthMm: 800, heightMm: 100 },
    ],
    rails: [
      { id: 'rl1', roofId: 'r1', a: { x: 0, y: 9.5 }, b: { x: 10, y: 9.5 }, heightMm: 1100 },
    ],
    ...overrides,
  } as unknown as Project;
}

describe('findEraseTargetAt', () => {
  it('hits a panel, and the panel WINS over a walkway running under it', () => {
    expect(findEraseTargetAt(fixture(), { x: 2, y: 2 })).toMatchObject({
      kind: 'panel',
      id: 'pv1',
    });
  });

  it('hits an arrester within its 0.8 m marker radius, not outside it', () => {
    expect(findEraseTargetAt(fixture(), { x: 8.5, y: 2 })).toMatchObject({
      kind: 'arrester',
      id: 'la1',
    });
    expect(findEraseTargetAt(fixture(), { x: 8, y: 3.2 })).toBeNull();
  });

  it('hits the edge-mounted inverter at its resolved edge position', () => {
    expect(findEraseTargetAt(fixture(), { x: 5, y: 0.5 })).toMatchObject({
      kind: 'inverter',
      id: 'invp1',
      pos: { x: 5, y: 0 },
    });
  });

  it('hits the meter, and reports nothing there once it is gone', () => {
    expect(findEraseTargetAt(fixture(), { x: 8, y: 8 })).toMatchObject({
      kind: 'meter',
    });
    expect(
      findEraseTargetAt(fixture({ gridConnection: null }), { x: 8, y: 8 }),
    ).toBeNull();
  });

  it('hits a walkway within half its width + 0.3 m slop', () => {
    // wk1 is 800 mm wide → tolerance 0.4 + 0.3 = 0.7 m off the centreline
    expect(findEraseTargetAt(fixture(), { x: 5.5, y: 5.4 })).toMatchObject({
      kind: 'walkway',
      id: 'wk1',
    });
    expect(findEraseTargetAt(fixture(), { x: 5.5, y: 6.0 })).toBeNull();
  });

  it('walkway tolerance scales with its width', () => {
    const wide = fixture();
    wide.walkways = [
      { id: 'wk3', roofId: 'r1', a: { x: 0, y: 5 }, b: { x: 10, y: 5 }, widthMm: 3000, heightMm: 100 },
    ] as Project['walkways'];
    // 3000 mm wide → tolerance 1.5 + 0.3 = 1.8 m
    expect(findEraseTargetAt(wide, { x: 5, y: 6.7 })).toMatchObject({
      kind: 'walkway',
      id: 'wk3',
    });
  });

  it('hits a safety rail within 0.4 m of its line', () => {
    expect(findEraseTargetAt(fixture(), { x: 9.7, y: 9.3 })).toMatchObject({
      kind: 'rail',
      id: 'rl1',
    });
  });

  it('returns null over empty roof (a miss is a silent no-op by design)', () => {
    expect(findEraseTargetAt(fixture(), { x: 6, y: 7 })).toBeNull();
  });
});

describe('inverterPlacementPos', () => {
  it('wraps the closing edge of the polygon', () => {
    const p = fixture();
    // edge 3 runs (0,10)→(0,0); t=0.25 → (0, 7.5)
    const pos = inverterPlacementPos(p, {
      id: 'invp2',
      roofId: 'r1',
      edgeIndex: 3,
      t: 0.25,
      heightM: 1.5,
    });
    expect(pos).toEqual({ x: 0, y: 7.5 });
  });

  it('returns null for a missing roof', () => {
    const p = fixture();
    expect(
      inverterPlacementPos(p, {
        id: 'invp3',
        roofId: 'nope',
        edgeIndex: 0,
        t: 0.5,
        heightM: 1.5,
      }),
    ).toBeNull();
  });
});
