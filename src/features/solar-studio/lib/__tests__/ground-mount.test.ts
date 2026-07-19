import { describe, expect, it } from 'vitest';
import type { ArraySegment, PanelSpec, PlacedPanel, Project, Roof, XY } from '../../types';
import { makeGroundSurface, nextGroundName } from '../roof-factory';
import { autoFillRoof, defaultPanelPose } from '../layout';
import { deriveBom } from '../bom';
import { resolveRules } from '../../data/rules/india';
import { fixtureProject } from './fixtures/project';
import { buildStructure, fastenerTotals, resolveRacking } from '../structure';
import { STRUCTURE_PROFILES } from '../segment-ops';

const rect = (cx: number, cy: number, w: number, h: number): XY[] => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

describe('makeGroundSurface', () => {
  it('sits at grade with no parapet — it is not a roof', () => {
    const g = makeGroundSurface({ polygon: rect(0, 0, 30, 20), existing: [] });
    expect(g.roofType).toBe('ground');
    expect(g.heightM).toBe(0);
    expect(g.parapet.enabled).toBe(false);
  });

  it('takes the boundary setback, not the roof-edge setback', () => {
    const d = resolveRules().defaults;
    const g = makeGroundSurface({ polygon: rect(0, 0, 30, 20), existing: [] });
    expect(g.setbackM).toBe(d.groundSetbackM);
    expect(g.setbackM).not.toBe(d.roofSetbackM);
  });

  it('is named an array area — calling it "Roof 3" would be a lie', () => {
    const g = makeGroundSurface({ polygon: rect(0, 0, 30, 20), existing: [] });
    expect(g.name).toBe('Array Area A');
    expect(nextGroundName([g])).toBe('Array Area B');
  });

  it('counts only ground surfaces when naming, ignoring roofs', () => {
    const roofs = [
      { id: 'r1', roofType: 'rcc_flat' } as Roof,
      { id: 'r2', roofType: 'metal_shed' } as Roof,
    ];
    expect(nextGroundName(roofs)).toBe('Array Area A');
  });
});

describe('ground panel pose', () => {
  const ground = makeGroundSurface({ polygon: rect(0, 0, 40, 30), existing: [] });

  it('does NOT inherit the 10° rooftop ballast tilt', () => {
    const pose = defaultPanelPose(ground);
    expect(pose.tiltDeg).toBe(resolveRules().defaults.groundTiltDeg);
    expect(pose.tiltDeg).toBeGreaterThan(10);
  });

  it('faces south by default in the northern hemisphere', () => {
    expect(defaultPanelPose(ground).azimuthDeg).toBe(180);
  });
});

describe('the fill is surface-agnostic — a ground area fills like a roof', () => {
  const SPEC: PanelSpec = {
    id: 'p1', brand: 'T', model: 'T', watt: 550, tech: 'Mono PERC',
    lengthMm: 2278, widthMm: 1134, vocV: 49.5, vmpV: 41, iscA: 14, impA: 13.4,
    tempCoeffVocPct: -0.27, almm: true, dcr: true, priceInr: 1,
  };

  it('places panels on an open field', () => {
    const ground = makeGroundSurface({ polygon: rect(0, 0, 40, 30), existing: [] });
    const project = {
      roofs: [ground], obstructions: [], walkways: [], keepouts: [],
      panels: [], segments: [],
    } as unknown as Project;
    const panels = autoFillRoof(project, ground, SPEC);
    expect(panels.length).toBeGreaterThan(10);
    expect(panels.every((p) => p.roofId === ground.id)).toBe(true);
  });
});

describe('BOM — a ground array is not billed as rooftop RCC', () => {
  function projectWithGroundPanels(): Project {
    const base = fixtureProject(0);
    const ground = makeGroundSurface({ polygon: rect(0, 0, 40, 30), existing: [] });
    const panels: PlacedPanel[] = Array.from({ length: 6 }, (_, i) => ({
      id: `g${i}`,
      roofId: ground.id,
      center: { x: i * 3 - 8, y: 0 },
      orientation: 'portrait',
      azimuthDeg: 180,
      tiltDeg: 20,
      solarAccess: 1,
      enabled: true,
    }));
    return { ...base, roofs: [ground], panels, segments: [], strings: [] };
  }

  it('prints a Ground Mount Structure line, never the elevated-RCC one', () => {
    const bom = deriveBom(projectWithGroundPanels());
    const items = bom.map((l) => l.item);
    expect(items).toContain('Ground Mount Structure');
    expect(items).not.toContain('Mounting Structure (elevated RCC)');
  });

  it('bills every ground panel exactly once', () => {
    const bom = deriveBom(projectWithGroundPanels());
    expect(bom.find((l) => l.item === 'Ground Mount Structure')!.qty).toBe(6);
  });

  it('flags the foundation as assumed — it is site-dependent', () => {
    const bom = deriveBom(projectWithGroundPanels());
    const gl = bom.find((l) => l.item === 'Ground Mount Structure')!;
    expect(gl.confidence).toBe('assumed');
    expect(gl.formula).toMatch(/foundation/i);
  });

  it('a rooftop project is completely unaffected', () => {
    const roof = fixtureProject();
    const items = deriveBom(roof).map((l) => l.item);
    expect(items).not.toContain('Ground Mount Structure');
  });
});

// ─── 20b: foundations ───────────────────────────────────────────────────────
describe('ground foundations', () => {
  const SPEC: PanelSpec = {
    id: 'p1', brand: 'T', model: 'T', watt: 550, tech: 'Mono PERC',
    lengthMm: 2278, widthMm: 1134, vocV: 49.5, vmpV: 41, iscA: 14, impA: 13.4,
    tempCoeffVocPct: -0.27, almm: true, dcr: true, priceInr: 1,
  };

  function seg(roofId: string): ArraySegment {
    return {
      id: 'seg1', roofId, label: 'A1', polygon: rect(0, 0, 10, 6),
      rows: 1, cols: 2, orientation: 'portrait', azimuthDeg: 180,
      racking: {
        kind: 'fixed_tilt', tiltDeg: 20, rowPitchM: 4,
        frontLegM: 0.5, backLegM: 1.2, profile: STRUCTURE_PROFILES[0],
      },
      moduleGapM: 0.05, removed: [],
    };
  }

  const proj = (roof: Roof): Project =>
    ({ roofs: [roof], segments: [seg(roof.id)], panels: [], obstructions: [], keepouts: [], walkways: [] } as unknown as Project);

  it('a ground table founds on a driven pile, not a chemical anchor into soil', () => {
    const g = makeGroundSurface({ polygon: rect(0, 0, 40, 30), existing: [] });
    const r = resolveRacking(proj(g), g, seg(g.id), SPEC)!;
    expect(r.foundation).toBe('pile');
  });

  it('a rooftop table founds on a PEDESTAL, not a pile — the default is per surface', () => {
    // D12: the rooftop default moved anchor → concrete. A pedestal avoids
    // penetrating the waterproofing membrane and lifts the base plate clear of
    // monsoon ponding. What matters here is that it is NOT the ground default.
    const roofTop: Roof = { ...makeGroundSurface({ polygon: rect(0, 0, 40, 30), existing: [] }), roofType: 'rcc_flat', heightM: 3 };
    const r = resolveRacking(proj(roofTop), roofTop, seg(roofTop.id), SPEC)!;
    expect(r.foundation).toBe('concrete');
    expect(r.foundation).not.toBe('pile');
  });

  it('an explicit choice still wins over the surface default', () => {
    const g = makeGroundSurface({ polygon: rect(0, 0, 40, 30), existing: [] });
    const s = seg(g.id);
    const withBallast = { ...s, racking: { ...s.racking, foundation: 'ballast' } } as ArraySegment;
    const r = resolveRacking({ ...proj(g), segments: [withBallast] } as Project, g, withBallast, SPEC)!;
    expect(r.foundation).toBe('ballast');
  });

  it('counts exactly ONE foundation per leg base — never an estimate', () => {
    const g = makeGroundSurface({ polygon: rect(0, 0, 40, 30), existing: [] });
    const p = proj(g);
    const s0 = seg(g.id);
    const racking = resolveRacking(p, g, s0, SPEC)!;
    // members are emitted from the occupancy grid, so the table needs modules
    // with a cellIndex — passing [] silently yields an EMPTY structure
    const mods: PlacedPanel[] = [0, 1].map((c) => ({
      id: `gm${c}`, roofId: g.id, segmentId: s0.id, center: { x: c * 1.2 - 0.6, y: 0 },
      orientation: 'portrait', azimuthDeg: 180, tiltDeg: 20, solarAccess: 1,
      enabled: true, cellIndex: c,
    }));
    const st = buildStructure(s0, SPEC, g, racking, mods);
    const legs = st.members.filter((m) => m.kind === 'front_leg' || m.kind === 'back_leg').length;
    // guard the guard: with no legs, `piles === legs` would pass as 0 === 0 and
    // assert nothing at all
    expect(legs).toBeGreaterThan(0);
    const ft = fastenerTotals([st]);
    expect(ft.piles).toBe(legs);
    expect(ft.anchors).toBe(0); // no anchors into soil
  });
});

// ─── conversion safety ──────────────────────────────────────────────────────
// A pitched face carries pitch + azimuth that the ground conversion zeroes.
// Step 2 refuses the conversion for pitchDeg > 0 (the card is disabled with a
// reason); this pins WHY, so the guard is not "simplified away" later.
describe('ground conversion never silently discards roof geometry', () => {
  it('a ground surface is defined as pitch 0 — there is no tilted ground plane in v1', () => {
    const g = makeGroundSurface({ polygon: rect(0, 0, 30, 20), existing: [] });
    expect(g.pitchDeg).toBe(0);
  });

  it('a pitched face carries geometry that ground has no home for', () => {
    const pitched: Roof = {
      ...makeGroundSurface({ polygon: rect(0, 0, 30, 20), existing: [] }),
      roofType: 'rcc_flat', heightM: 3, pitchDeg: 20, slopeAzimuthDeg: 270,
    };
    // the two facts the UI guard is built on
    expect(pitched.pitchDeg).toBeGreaterThan(0);
    expect(makeGroundSurface({ polygon: pitched.polygon, existing: [] }).pitchDeg).toBe(0);
  });
});

// ─── 20c: free-field site works ─────────────────────────────────────────────
describe('ground site works (fencing + earthing ring)', () => {
  function groundProject(w = 40, h = 30): Project {
    const base = fixtureProject(0);
    const g = makeGroundSurface({ polygon: rect(0, 0, w, h), existing: [] });
    const panels: PlacedPanel[] = Array.from({ length: 4 }, (_, i) => ({
      id: `g${i}`, roofId: g.id, center: { x: i * 3 - 5, y: 0 },
      orientation: 'portrait', azimuthDeg: 180, tiltDeg: 20,
      solarAccess: 1, enabled: true,
    }));
    return { ...base, roofs: [g], panels, segments: [], strings: [] };
  }

  it('fences the measured boundary, not an estimate', () => {
    const bom = deriveBom(groundProject(40, 30));
    const fence = bom.find((l) => l.item === 'Perimeter Fencing')!;
    expect(fence.qty).toBe(140); // 2×(40+30)
    expect(fence.unit).toBe('m');
  });

  it('scales with the actual boundary', () => {
    const small = deriveBom(groundProject(20, 10)).find((l) => l.item === 'Perimeter Fencing')!;
    expect(small.qty).toBe(60); // 2×(20+10)
  });

  it('earths the array with a RING — a ground array has no building to run down', () => {
    const bom = deriveBom(groundProject(40, 30));
    const ring = bom.find((l) => l.item === 'Ground Array Earthing Ring')!;
    expect(ring).toBeDefined();
    expect(ring.qty).toBe(140);
    expect(ring.formula).toMatch(/no building/i);
  });

  it('labels fencing, gates and the ring as ASSUMED — none are derivable', () => {
    const bom = deriveBom(groundProject());
    for (const item of ['Perimeter Fencing', 'Fence Gate', 'Ground Array Earthing Ring'])
      expect(bom.find((l) => l.item === item)!.confidence, item).toBe('assumed');
  });

  it('a rooftop-only project gets NO fencing, gate or ring', () => {
    const bom = deriveBom(fixtureProject());
    for (const item of ['Perimeter Fencing', 'Fence Gate', 'Ground Array Earthing Ring'])
      expect(bom.some((l) => l.item === item), item).toBe(false);
  });
});
