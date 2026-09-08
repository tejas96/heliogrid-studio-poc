import { describe, expect, it } from 'vitest';
import { newProject } from '../../store/store';
import { designBounds, shadowBounds } from '../scene-bounds';
import type { Obstruction, Project, Roof } from '../../types';

/** A 10 × 10 m flat roof at grade — the smallest thing with real bounds. */
function roof(): Roof {
  return {
    id: 'roof_1',
    name: 'Roof',
    polygon: [
      { x: -5, y: -5 },
      { x: 5, y: -5 },
      { x: 5, y: 5 },
      { x: -5, y: 5 },
    ],
    roofType: 'rcc_flat',
    heightM: 3,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 0.3,
    perEdgeSetbacksM: null,
    parapet: {
      enabled: false,
      direction: 'outward',
      heightM: 0,
      widthM: 0.2,
      perEdge: null,
      suppressSharedEdges: false,
    },
  };
}

/** A neighbouring block: on the ground, 40 m north, 20 m tall. */
function neighbour(over: Partial<Obstruction> = {}): Obstruction {
  return {
    id: 'obs_1',
    type: 'building',
    label: 'B1',
    roofId: null,
    center: { x: 0, y: 40 },
    shape: 'rect',
    lengthM: 12,
    widthM: 12,
    diameterM: 0,
    heightM: 20,
    rotationDeg: 0,
    setbackM: 0,
    castsShadow: true,
    blocksPlacement: false,
    ...over,
  };
}

function sited(obstructions: Obstruction[]): Project {
  return { ...newProject(), roofs: [roof()], obstructions };
}

describe('shadowBounds', () => {
  it('reaches the neighbour that shades the design', () => {
    const p = sited([neighbour()]);
    const design = designBounds(p);
    const shade = shadowBounds(p);
    // the frustum has to hold the caster: 40 m out plus half its diagonal
    expect(shade.r).toBeGreaterThan(48);
    expect(shade.r).toBeGreaterThan(design.r);
    // and its full height, so the shadow starts at the top of the block
    expect(shade.yMax).toBeGreaterThanOrEqual(20);
    // the centre never moves — the light target stays on the design
    expect(shade.cx).toBe(design.cx);
    expect(shade.cz).toBe(design.cz);
  });

  it('ignores an obstruction the user switched off, which costs texels for nothing', () => {
    const p = sited([neighbour({ castsShadow: false })]);
    expect(shadowBounds(p)).toEqual(designBounds(p));
  });
});
