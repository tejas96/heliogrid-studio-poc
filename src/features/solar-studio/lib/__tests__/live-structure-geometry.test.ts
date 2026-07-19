// ─── Live-project structure geometry (Phase 22k verification) ───────────────
// Built from the ACTUAL persisted project used to verify the 3D in the browser
// (18 panels, 4 rows × 5 cols less two removed, az 180 / tilt 10 on a flat RCC
// roof). Two things this pins that a synthetic fixture would not:
//
//  · the stored `racking.profile` is the PRE-22a literal with no `dims`, so the
//    renderer must resolve the section by KEY from the catalog, not from the
//    stored object — otherwise every existing project silently falls back to a
//    box and the section picker looks broken;
//  · no member may extend meaningfully beyond its own modules, which is the
//    stated expiry condition on StructureInstanced's "visual shadows only"
//    reasoning. If members ever overhang, they must join buildShadowCasters.
import { describe, expect, it } from 'vitest';
import type { ArraySegment, PanelSpec, PlacedPanel, Project, Roof } from '../../types';
import { buildStructure, resolveRacking } from '../structure';
import { profileByKey } from '../../data/profiles';
import { fixtureProject } from './fixtures/project';

const SPEC: PanelSpec = {
  id: 'pnl_ae610', brand: 'AESOLAR', model: 'CMER-132BDS 610', watt: 610, tech: 'TOPCon',
  lengthMm: 2382, widthMm: 1133, vocV: 48.9, vmpV: 40.7, iscA: 15.75, impA: 15,
  tempCoeffVocPct: -0.25, almm: true, dcr: false, priceInr: 14030,
  warrantyYears: 30, weightKg: 28, availability: 'in_stock',
};

const ROOF: Roof = {
  id: 'roof_live', name: 'Reported roof',
  polygon: [{ x: 1.43, y: 9.78 }, { x: 2.26, y: -6.37 }, { x: 10.07, y: -5.73 }, { x: 8.94, y: 10.58 }],
  roofType: 'rcc_flat', heightM: 3, pitchDeg: 0, slopeAzimuthDeg: 180, setbackM: 0.3,
  perEdgeSetbacksM: null,
  parapet: { enabled: false, direction: 'inward', heightM: 1, widthM: 0.3, perEdge: null, suppressSharedEdges: true },
};

// EXACTLY as persisted — note the profile literal carries no `dims`
const SEG: ArraySegment = {
  id: 'seg_live', roofId: 'roof_live', label: 'A1', polygon: ROOF.polygon,
  rows: 4, cols: 5, orientation: 'portrait', azimuthDeg: 180,
  racking: {
    kind: 'fixed_tilt', tiltDeg: 10, rowPitchM: 2.815, frontLegM: 0.3, backLegM: 0.714,
    profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 },
  },
  moduleGapM: 0.05, removed: [3003, 3004],
};

const ROWS_Y = [-2.04, 0.775, 3.589, 6.404];
const COLS_X = [3.494, 4.677, 5.86, 7.043, 8.226];

function livePanels(): PlacedPanel[] {
  const out: PlacedPanel[] = [];
  ROWS_Y.forEach((y, r) => {
    COLS_X.forEach((x, c) => {
      if (r === 3 && c >= 3) return; // removed 3003 / 3004
      out.push({
        id: `pv_${r}_${c}`, roofId: 'roof_live', segmentId: 'seg_live',
        cellIndex: r * 1000 + c, center: { x, y }, orientation: 'portrait',
        azimuthDeg: 180, tiltDeg: 10, solarAccess: 1, enabled: true,
      });
    });
  });
  return out;
}

function liveProject(): Project {
  return { ...fixtureProject(0), roofs: [ROOF], segments: [SEG], panels: livePanels() };
}

const built = () => {
  const racking = resolveRacking(liveProject(), ROOF, SEG, SPEC)!;
  return buildStructure(SEG, SPEC, ROOF, racking, livePanels());
};

describe('the live 18-panel table', () => {
  it('builds a structure at all', () => {
    const s = built();
    expect(s).toBeTruthy();
    expect(s.members.length).toBeGreaterThan(0);
  });

  it('a pre-22a stored profile still resolves to a real section by KEY', () => {
    // The stored object has no dims; the catalog entry for the same key does.
    expect(SEG.racking.kind !== 'flush' && SEG.racking.profile.dims).toBeUndefined();
    expect(profileByKey('c_channel')?.dims).toBeDefined();
    for (const m of built().members) expect(profileByKey(m.profileKey)?.dims).toBeDefined();
  });

  // THE check the screenshot raised. Purlins legitimately span a whole row;
  // nothing should reach beyond the modules it carries.
  it('no member extends beyond the array it belongs to', () => {
    const s = built();
    const panels = livePanels();
    const w = SPEC.widthMm / 1000;
    const hh = SPEC.lengthMm / 1000;
    const minX = Math.min(...panels.map((p) => p.center.x)) - w;
    const maxX = Math.max(...panels.map((p) => p.center.x)) + w;
    const minY = Math.min(...panels.map((p) => p.center.y)) - hh;
    const maxY = Math.max(...panels.map((p) => p.center.y)) + hh;
    for (const m of s.members) {
      for (const pt of [m.a, m.b]) {
        expect(pt.x, `${m.id} x`).toBeGreaterThanOrEqual(minX);
        expect(pt.x, `${m.id} x`).toBeLessThanOrEqual(maxX);
        expect(pt.y, `${m.id} y`).toBeGreaterThanOrEqual(minY);
        expect(pt.y, `${m.id} y`).toBeLessThanOrEqual(maxY);
      }
    }
  });

  it('reports its longest member per kind (diagnostic)', () => {
    const s = built();
    const longest = new Map<string, number>();
    for (const m of s.members) {
      longest.set(m.kind, Math.max(longest.get(m.kind) ?? 0, m.lengthM));
    }
    // a purlin spans one row: 5 modules × (1.133 + 0.05) − 0.05 ≈ 5.87 m
    expect(longest.get('purlin')!).toBeLessThan(6.0);
    // a rafter spans the module's along-tilt dimension, ~2.38 m
    expect(longest.get('rafter')!).toBeLessThan(2.6);
    // legs start ON the pedestal now (D15)
    expect(longest.get('front_leg')!).toBeCloseTo(0.15, 2);
  });

  it('every leg base carries a foundation node', () => {
    const s = built();
    const legs = s.members.filter((m) => m.kind === 'front_leg' || m.kind === 'back_leg').length;
    const anchors = s.nodes.filter((n) => n.kind === 'roof_anchor').length;
    expect(anchors).toBe(legs);
    for (const n of s.nodes.filter((x) => x.kind === 'roof_anchor')) {
      expect(n.fastenerSpec.pedestals).toBe(1); // D12 rooftop default
    }
  });
});
