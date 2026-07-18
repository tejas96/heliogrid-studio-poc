import { beforeEach, describe, expect, it } from 'vitest';
import type { PanelSpec, PlacedPanel, Project, Roof, XY } from '../../../types';
import { clearAnalyzers, computeInsights } from '../registry';
import { registerAccessAnalyzers } from '../analyzers-access';
import { resolveRules } from '../../../data/rules/india';

const rect = (cx: number, cy: number, w: number, h: number): XY[] => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

const SPEC: PanelSpec = {
  id: 'p1', brand: 'T', model: 'T', watt: 550, tech: 'Mono PERC',
  lengthMm: 2000, widthMm: 1000, vocV: 49.5, vmpV: 41, iscA: 14, impA: 13.4,
  tempCoeffVocPct: -0.27, almm: true, dcr: true, priceInr: 1,
};

function roof(id: string, poly: XY[]): Roof {
  return {
    id, name: id, polygon: poly, roofType: 'rcc_flat', heightM: 3,
    pitchDeg: 0, slopeAzimuthDeg: 180, setbackM: 0.5, perEdgeSetbacksM: null,
    parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
  };
}

const panel = (id: string, roofId: string, center: XY): PlacedPanel => ({
  id, roofId, center, orientation: 'portrait', azimuthDeg: 180,
  tiltDeg: 10, solarAccess: 1, enabled: true,
});

function project(over: Partial<Project> = {}): Project {
  return {
    roofs: [], panels: [], segments: [], obstructions: [], walkways: [],
    keepouts: [], rails: [], arresters: [], inverterPlacements: [], strings: [],
    components: { panel: SPEC, targetKwp: 0, inverter: null, inverterCount: 1 },
    insightState: {},
    ...over,
  } as unknown as Project;
}

beforeEach(() => {
  clearAnalyzers();
  registerAccessAnalyzers();
});

const keysOf = (p: Project) => computeInsights(p).map((i) => i.analyzerId);

describe('cleaning-access', () => {
  const reach = resolveRules().defaults.cleaningReachM;

  it('flags modules stranded in the middle of a very large roof', () => {
    const r = roof('big', rect(0, 0, 60, 60));
    const p = project({ roofs: [r], panels: [panel('mid', 'big', { x: 0, y: 0 })] });
    const hit = computeInsights(p).find((i) => i.analyzerId === 'cleaning-access')!;
    expect(hit).toBeDefined();
    expect(hit.category).toBe('maintenance');
    expect(hit.focusIds).toEqual(['mid']);
  });

  it('a walkway through the middle resolves it', () => {
    const r = roof('big', rect(0, 0, 60, 60));
    const p = project({
      roofs: [r],
      panels: [panel('mid', 'big', { x: 0, y: 0 })],
      walkways: [{ id: 'w', roofId: 'big', a: { x: -30, y: 0 }, b: { x: 30, y: 0 }, widthMm: 800, heightMm: 100 }],
    } as Partial<Project>);
    expect(keysOf(p)).not.toContain('cleaning-access');
  });

  it('a small roof is reachable from its own edges', () => {
    const r = roof('small', rect(0, 0, reach, reach));
    const p = project({ roofs: [r], panels: [panel('a', 'small', { x: 0, y: 0 })] });
    expect(keysOf(p)).not.toContain('cleaning-access');
  });

  it('cites the threshold as an assumed convention, and never claims certainty', () => {
    const r = roof('big', rect(0, 0, 60, 60));
    const p = project({ roofs: [r], panels: [panel('mid', 'big', { x: 0, y: 0 })] });
    const hit = computeInsights(p).find((i) => i.analyzerId === 'cleaning-access')!;
    expect(hit.evidence.join(' ')).toMatch(/ASSUMED/);
    expect(hit.confidence).toBeLessThan(0.8);
  });
});

describe('module-replacement', () => {
  it('flags a module boxed in on all four sides', () => {
    const r = roof('r', rect(0, 0, 40, 40));
    // centre module surrounded N/S/E/W at ~1 module pitch
    const panels = [
      panel('c', 'r', { x: 0, y: 0 }),
      panel('n', 'r', { x: 0, y: -1.2 }),
      panel('s', 'r', { x: 0, y: 1.2 }),
      panel('e', 'r', { x: 1.2, y: 0 }),
      panel('w', 'r', { x: -1.2, y: 0 }),
    ];
    const p = project({ roofs: [r], panels });
    const hit = computeInsights(p).find((i) => i.analyzerId === 'module-replacement')!;
    expect(hit).toBeDefined();
    expect(hit.focusIds).toContain('c');
  });

  it('a row of modules boxes nobody in', () => {
    const r = roof('r', rect(0, 0, 40, 40));
    const panels = Array.from({ length: 6 }, (_, i) => panel(`p${i}`, 'r', { x: i * 1.2 - 3, y: 0 }));
    const p = project({ roofs: [r], panels });
    expect(keysOf(p)).not.toContain('module-replacement');
  });

  it('stays a suggestion — dense arrays are normal, not defects', () => {
    const r = roof('r', rect(0, 0, 40, 40));
    const panels = [
      panel('c', 'r', { x: 0, y: 0 }),
      panel('n', 'r', { x: 0, y: -1.2 }),
      panel('s', 'r', { x: 0, y: 1.2 }),
      panel('e', 'r', { x: 1.2, y: 0 }),
      panel('w', 'r', { x: -1.2, y: 0 }),
    ];
    const hit = computeInsights(project({ roofs: [r], panels })).find(
      (i) => i.analyzerId === 'module-replacement',
    )!;
    expect(hit.severity).toBe('suggestion');
  });
});

describe('ladder-access', () => {
  it('flags a roof whose every edge is crowded with modules', () => {
    const r = roof('tight', rect(0, 0, 4, 4));
    const panels = [
      panel('a', 'tight', { x: -1, y: -1 }), panel('b', 'tight', { x: 1, y: -1 }),
      panel('c', 'tight', { x: -1, y: 1 }), panel('d', 'tight', { x: 1, y: 1 }),
    ];
    const p = project({ roofs: [r], panels });
    const hit = computeInsights(p).find((i) => i.analyzerId === 'ladder-access')!;
    expect(hit).toBeDefined();
    expect(hit.category).toBe('constructability');
  });

  it('a roof with a clear edge passes', () => {
    const r = roof('roomy', rect(0, 0, 40, 40));
    const p = project({ roofs: [r], panels: [panel('a', 'roomy', { x: 0, y: 0 })] });
    expect(keysOf(p)).not.toContain('ladder-access');
  });

  it('an empty roof is not flagged — nothing to install yet', () => {
    const p = project({ roofs: [roof('empty', rect(0, 0, 4, 4))], panels: [] });
    expect(keysOf(p)).not.toContain('ladder-access');
  });
});

describe('inverter-access', () => {
  it('flags an inverter with modules crowding its standing space', () => {
    const r = roof('r', rect(0, 0, 20, 20));
    const p = project({
      roofs: [r],
      panels: [panel('near', 'r', { x: -10, y: 0 })],
      inverterPlacements: [{ id: 'inv1', roofId: 'r', edgeIndex: 3, t: 0.5, heightM: 1.5 }],
    } as Partial<Project>);
    const hit = computeInsights(p).find((i) => i.analyzerId === 'inverter-access')!;
    expect(hit).toBeDefined();
    expect(hit.focusIds).toContain('near');
  });

  it('a clear inverter wall passes', () => {
    const r = roof('r', rect(0, 0, 20, 20));
    const p = project({
      roofs: [r],
      panels: [panel('far', 'r', { x: 8, y: 8 })],
      inverterPlacements: [{ id: 'inv1', roofId: 'r', edgeIndex: 3, t: 0.5, heightM: 1.5 }],
    } as Partial<Project>);
    expect(keysOf(p)).not.toContain('inverter-access');
  });
});

describe('the pack as a whole', () => {
  it('says nothing about an empty project — no noise before there is a design', () => {
    expect(computeInsights(project())).toEqual([]);
  });

  it('registration is idempotent', () => {
    expect(() => registerAccessAnalyzers()).not.toThrow();
  });

  it('every access insight warns — none of them block', () => {
    const r = roof('big', rect(0, 0, 60, 60));
    const p = project({ roofs: [r], panels: [panel('mid', 'big', { x: 0, y: 0 })] });
    for (const i of computeInsights(p)) expect(i.severity).not.toBe('critical');
  });
});
