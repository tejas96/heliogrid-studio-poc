// ─── Gate: obstruction capability model + bridging (Phase 7 §26c) ────────────
// The binding gates: bridging decisions per capability combination (incl.
// mustRemainOpenToSky and clearance failures), legacy-boolean migration
// safety (untouched objects behave EXACTLY as before), and fingerprint
// stability (default migration changes NO fingerprint).
import { describe, it, expect } from 'vitest';
import type { Obstruction, Project } from '../../types';
import {
  CAPABILITY_PRESETS,
  isBridgedAt,
  requiredBridgeClearanceM,
  resolveCapabilities,
} from '../capabilities';
import { autoFillRoof, DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { geometryFp, layoutFp } from '../fingerprints';
import { layoutIssues } from '../drc';
import { applyStructChoice, reconcileBridgedPanels } from '../structure-edit';
import { makeObstruction, obstructionToPlatform } from '../roof-factory';
import { autoDesign } from '../auto-design';
import { fixtureProject, fixtureRoof } from './fixtures/project';

/** 1.2 m water tank in the middle of the fixture roof, blocking placement. */
function tank(over: Partial<Obstruction> = {}): Obstruction {
  return {
    id: 'ob_wt1',
    type: 'tank',
    label: 'WT1',
    roofId: 'roof_1',
    center: { x: 0, y: 0 },
    shape: 'rect',
    lengthM: 3,
    widthM: 2,
    diameterM: 0,
    heightM: 1.2,
    rotationDeg: 0,
    setbackM: 0.3,
    castsShadow: true,
    blocksPlacement: true,
    capabilities: { ...CAPABILITY_PRESETS.tank },
    ...over,
  };
}

function siteProject(ob: Obstruction | null): Project {
  const p = { ...fixtureProject(0), roofs: [fixtureRoof()] };
  return { ...p, obstructions: ob ? [ob] : [], panels: [], segments: [], strings: [] };
}

const overTank = (panels: { center: { x: number; y: number } }[]) =>
  panels.filter((pp) => Math.abs(pp.center.x) < 1.5 && Math.abs(pp.center.y) < 1).length;

describe('resolveCapabilities — migration safety', () => {
  it('an UNTOUCHED legacy object resolves to exactly its boolean behavior', () => {
    const legacy = tank({ capabilities: undefined });
    const caps = resolveCapabilities(legacy);
    expect(caps.panelsMayCross).toBe(false); // blocksPlacement=true ⇒ no bridging
    expect(caps.castsAnalyticalShadow).toBe(true);
    const nonBlocking = tank({ capabilities: undefined, blocksPlacement: false });
    expect(resolveCapabilities(nonBlocking).panelsMayCross).toBe(true);
  });

  it('explicit capability fields win over presets and legacy booleans', () => {
    const o = tank({ capabilities: { panelsMayCross: false, minVerticalClearanceM: 0.9 } });
    const caps = resolveCapabilities(o);
    expect(caps.panelsMayCross).toBe(false);
    expect(caps.minVerticalClearanceM).toBe(0.9);
    expect(caps.maintenanceAccess).toBe('top'); // preset fills the gaps
  });

  it('factory obstructions carry the FULL preset explicitly', () => {
    const o = makeObstruction({ type: 'tank', center: { x: 0, y: 0 }, existing: [], roofId: 'roof_1' });
    expect(o.capabilities).toEqual(CAPABILITY_PRESETS.tank);
    const chimney = makeObstruction({ type: 'chimney', center: { x: 0, y: 0 }, existing: [], roofId: 'roof_1' });
    expect(chimney.capabilities?.mustRemainOpenToSky).toBe(true);
  });
});

describe('fingerprint stability — the capture-stale guard', () => {
  it('legacy objects (no capabilities) change NO fingerprint; explicit edits do', () => {
    const legacy = siteProject(tank({ capabilities: undefined }));
    const base = geometryFp(legacy);
    // absent vs undefined-field must serialize identically
    const withUndef = siteProject({ ...tank({ capabilities: undefined }) });
    expect(geometryFp(withUndef)).toBe(base);
    const edited = siteProject(tank()); // explicit preset object
    expect(geometryFp(edited)).not.toBe(base);
    expect(layoutFp(edited)).not.toBe(layoutFp(legacy)); // nests upward
  });
});

describe('bridging — fill decisions per capability combination', () => {
  const spec = fixtureProject(0).components.panel!;

  it('blocks at grade (0.3 m structure) and bridges at walk-under clearance', () => {
    const p = siteProject(tank());
    const grade = autoFillRoof(p, p.roofs[0], spec, { ...DEFAULT_FILL, bridgeClearanceM: 0.3 });
    expect(overTank(grade)).toBe(0); // 0.3 < 1.2 + 0.3 required
    const walk = autoFillRoof(p, p.roofs[0], spec, { ...DEFAULT_FILL, bridgeClearanceM: 2.2 });
    expect(overTank(walk)).toBeGreaterThan(0); // spans the tank footprint
    expect(walk.length).toBeGreaterThan(grade.length); // recovered area
  });

  it('mustRemainOpenToSky blocks regardless of clearance (chimney semantics)', () => {
    const p = siteProject(tank({ capabilities: { ...CAPABILITY_PRESETS.tank, mustRemainOpenToSky: true } }));
    const walk = autoFillRoof(p, p.roofs[0], spec, { ...DEFAULT_FILL, bridgeClearanceM: 2.2 });
    expect(overTank(walk)).toBe(0);
  });

  it('a raised minVerticalClearance blocks an otherwise-sufficient structure', () => {
    const p = siteProject(tank({ capabilities: { ...CAPABILITY_PRESETS.tank, minVerticalClearanceM: 1.2 } }));
    // needs 1.2 + 1.2 = 2.4 > 2.2 available
    const walk = autoFillRoof(p, p.roofs[0], spec, { ...DEFAULT_FILL, bridgeClearanceM: 2.2 });
    expect(overTank(walk)).toBe(0);
    expect(isBridgedAt(p.obstructions[0], 2.2)).toBe(false);
    expect(isBridgedAt(p.obstructions[0], 2.5)).toBe(true);
  });

  it('legacy blocked objects never bridge; non-blocking objects need no bridging', () => {
    expect(isBridgedAt(tank({ capabilities: undefined }), 5)).toBe(false);
    expect(isBridgedAt(tank({ blocksPlacement: false }), undefined)).toBe(false);
  });

  it('fillRoofAsSegment derives walk-under clearance from structure defaults', () => {
    const p = siteProject(tank());
    p.structureDefaults = { clearanceM: 2.2 };
    const filled = fillRoofAsSegment(p, p.roofs[0], spec, DEFAULT_FILL)!;
    expect(overTank(filled.panels)).toBeGreaterThan(0);
    const grade = { ...p, structureDefaults: undefined };
    const gradeFill = fillRoofAsSegment(grade, grade.roofs[0], spec, DEFAULT_FILL)!;
    expect(overTank(gradeFill.panels)).toBe(0);
  });
});

describe('DRC + decision log', () => {
  const spec = fixtureProject(0).components.panel!;

  function bridgedProject(): Project {
    const p = siteProject(tank());
    p.structureDefaults = { clearanceM: 2.2 };
    const filled = fillRoofAsSegment(p, p.roofs[0], spec, DEFAULT_FILL)!;
    return { ...p, segments: [filled.segment], panels: filled.panels };
  }

  it('a legal bridge warns for engineer confirmation; shrinking clearance errors', () => {
    const good = bridgedProject();
    const issues = layoutIssues(good, spec);
    expect(issues.some((i) => i.code === 'bridge_engineer' && i.level === 'warn')).toBe(true);
    expect(issues.some((i) => i.code === 'bridge_clearance')).toBe(false);

    // user later drops the clearance — the SAME panels now violate
    const dropped: Project = {
      ...good,
      structureDefaults: { clearanceM: 0 },
      segments: good.segments.map((sg) =>
        sg.racking.kind === 'flush'
          ? sg
          : { ...sg, racking: { ...sg.racking, clearanceM: undefined } },
      ),
    };
    const after = layoutIssues(dropped, spec);
    expect(after.some((i) => i.code === 'bridge_clearance' && i.level === 'error')).toBe(true);
  });

  it('panels over a non-bridgeable obstruction are a hard error', () => {
    const good = bridgedProject();
    const sealed: Project = {
      ...good,
      obstructions: [tank({ capabilities: { ...CAPABILITY_PRESETS.tank, panelsMayCross: false } })],
    };
    const issues = layoutIssues(sealed, spec);
    expect(issues.some((i) => i.code === 'panel_over_obstruction' && i.level === 'error')).toBe(true);
  });

  it('auto-design logs the bridge with its numbers and flags engineer review', () => {
    const p = siteProject(tank());
    p.structureDefaults = { clearanceM: 2.2 };
    const r = autoDesign(p, 'max_roof');
    const d = r.decisions.find((x) => x.id === 'bridging:ob_wt1');
    expect(d).toBeDefined();
    expect(d!.reason).toContain('1.50 m'); // required = 1.2 + 0.3
    expect(d!.inputs.join(' ')).toContain('structureClearance=2.20m');
    expect(r.warnings.some((w) => w.includes('engineer confirmation'))).toBe(true);
  });

  it('required clearance arithmetic is exact', () => {
    expect(requiredBridgeClearanceM(tank())).toBeCloseTo(1.5, 5);
  });
});

describe('shading over bridged obstructions (the fixed-0.45m sample bug)', () => {
  const spec = fixtureProject(0).components.panel!;

  function bridgedAt(clearanceM: number | undefined): Project {
    const p = siteProject(tank());
    p.location = {
      address: 'Pune',
      latLng: { lat: 18.5203, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.2,
      peakSunHours: 5.2,
      dataSource: 'test',
    };
    if (clearanceM) p.structureDefaults = { clearanceM };
    const filled = fillRoofAsSegment(p, p.roofs[0], spec, DEFAULT_FILL)!;
    return { ...p, segments: [filled.segment], panels: filled.panels };
  }

  it('panels bridging ABOVE a tank sample from the module plane — no false shade', async () => {
    const { computeSolarAccess } = await import('../shading');
    const walk = bridgedAt(2.2);
    const over = walk.panels.filter(
      (pp) => Math.abs(pp.center.x) < 1.5 && Math.abs(pp.center.y) < 1,
    );
    expect(over.length).toBeGreaterThan(0); // fill DID bridge the tank
    const access = computeSolarAccess(walk);
    for (const pp of over) {
      // 2.2 m module plane vs 1.2 m tank: nothing to shade them
      expect(access.get(pp.id)!).toBeGreaterThan(0.99);
    }
  });

  it('grade-height panels NEXT to a tall obstruction still read shaded', async () => {
    const { computeSolarAccess } = await import('../shading');
    // tall wall south of the array at grade height — must still shade
    const p = bridgedAt(undefined);
    p.obstructions = [
      tank({
        id: 'ob_wall',
        label: 'WALL',
        lengthM: 12,
        widthM: 0.4,
        heightM: 6,
        center: { x: 0, y: -5.5 },
        blocksPlacement: false,
        capabilities: undefined,
      }),
    ];
    const access = computeSolarAccess(p);
    const south = p.panels.filter((pp) => pp.center.y < -3);
    expect(south.length).toBeGreaterThan(0);
    expect(Math.min(...south.map((pp) => access.get(pp.id)!))).toBeLessThan(0.9);
  });

  it('shadingFp re-keys when the structure clearance changes (v6 engine)', async () => {
    const { shadingFp } = await import('../fingerprints');
    const grade = bridgedAt(undefined);
    expect(shadingFp(grade)).toContain('e6|');
    const walk: Project = { ...grade, structureDefaults: { clearanceM: 2.2 } };
    expect(shadingFp(walk)).not.toBe(shadingFp(grade)); // sample points moved
  });
});

describe('obstruction → rooftop platform (§26e tight-space)', () => {
  const spec = fixtureProject(0).components.panel!;

  it('converts a rect obstruction into a stacked roof at top height and removes it', () => {
    const p = siteProject(tank({ lengthM: 6, widthM: 4 })); // big enough top
    const r = obstructionToPlatform(p, 'ob_wt1')!;
    expect(r).not.toBeNull();
    expect(r.obstructions).toHaveLength(0); // replaced, not duplicated
    const platform = r.roofs.find((x) => x.name === 'WT1 platform')!;
    expect(platform).toBeDefined();
    expect(platform.heightM).toBeCloseTo(3 + 1.2, 5); // base roof 3 m + tank 1.2 m
    expect(platform.polygon).toHaveLength(4);
    // panels place ON the platform via the normal pipeline
    const upgraded: Project = { ...p, ...r };
    const onTop = autoFillRoof(upgraded, platform, spec, DEFAULT_FILL);
    expect(onTop.length).toBeGreaterThan(0);
    // and the LOWER roof's fill now avoids the platform footprint (stacking)
    const below = autoFillRoof(upgraded, upgraded.roofs[0], spec, DEFAULT_FILL);
    expect(overTank(below)).toBe(0);
  });

  it('converts circles to a 12-gon and rejects too-small tops', () => {
    const round = tank({ shape: 'circle', diameterM: 5, lengthM: 5, widthM: 5 });
    const r = obstructionToPlatform(siteProject(round), 'ob_wt1')!;
    expect(r.roofs.find((x) => x.name === 'WT1 platform')!.polygon).toHaveLength(12);
    const tiny = tank({ lengthM: 0.6, widthM: 0.6 }); // no area after setback probe
    expect(obstructionToPlatform(siteProject(tiny), 'ob_wt1')).toBeNull();
    expect(obstructionToPlatform(siteProject(null), 'missing')).toBeNull();
  });
});

// ─── Bridging reconciliation: structure/obstruction edits auto-adjust panels ─
describe('reconcileBridgedPanels — bridged panels track clearance changes', () => {
  const spec = fixtureProject(0).components.panel!;
  function bridged(): Project {
    const p = siteProject(tank());
    p.structureDefaults = { clearanceM: 2.2 };
    const filled = fillRoofAsSegment(p, p.roofs[0], spec, DEFAULT_FILL)!;
    return { ...p, segments: [filled.segment], panels: filled.panels };
  }

  it('walk-under → flush DISABLES the panels over the tank, others untouched', () => {
    const p = bridged();
    expect(overTank(p.panels)).toBeGreaterThan(0);
    const r = applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'flush' })!;
    const off = r.panels.filter((x) => !x.enabled);
    expect(off.length).toBe(overTank(p.panels));
    expect(off.every((x) => Math.abs(x.center.x) < 1.5 && Math.abs(x.center.y) < 1)).toBe(true);
    // DRC agrees: nothing enabled violates bridging anymore
    const p2 = { ...p, ...r };
    expect(layoutIssues(p2, spec).filter((i) => i.code === 'bridge_clearance')).toEqual([]);
  });

  it('flush → walk-under RE-ENABLES them (auto-adjust is symmetric)', () => {
    const p = bridged();
    const down = applyStructChoice(p, p.segments[0].id, { kind: 'preset', preset: 'flush' })!;
    const pDown = { ...p, ...down };
    const up = applyStructChoice(pDown, p.segments[0].id, { kind: 'preset', preset: 'walkunder' })!;
    expect(up.panels.every((x) => x.enabled)).toBe(true);
  });

  it('clearance stepper below the required total disables; restoring re-enables', () => {
    const p = bridged();
    const need = requiredBridgeClearanceM(p.obstructions[0]); // 1.2 + 0.3
    const low = applyStructChoice(p, p.segments[0].id, { kind: 'clearance', clearanceM: need - 0.2 })!;
    expect(low.panels.filter((x) => !x.enabled).length).toBe(overTank(p.panels));
    const pLow = { ...p, ...low };
    const high = applyStructChoice(pLow, p.segments[0].id, { kind: 'clearance', clearanceM: 2.2 })!;
    expect(high.panels.every((x) => x.enabled)).toBe(true);
  });

  it('raising the obstruction HEIGHT past the clearance disables (Step3 path)', () => {
    const p = bridged();
    const taller = p.obstructions.map((o) => ({ ...o, heightM: 2.4 }));
    const panels = reconcileBridgedPanels(p, { obstructions: taller })!;
    expect(panels.filter((x) => !x.enabled).length).toBe(overTank(p.panels));
    // lowering back re-enables
    const restored = reconcileBridgedPanels({ ...p, panels, obstructions: taller }, {
      obstructions: p.obstructions,
    })!;
    expect(restored.every((x) => x.enabled)).toBe(true);
  });

  it('turning bridging OFF (panelsMayCross=false) disables the spanning panels', () => {
    const p = bridged();
    const closed = p.obstructions.map((o) => ({
      ...o,
      capabilities: { ...o.capabilities, panelsMayCross: false },
    }));
    const panels = reconcileBridgedPanels(p, { obstructions: closed })!;
    expect(panels.filter((x) => !x.enabled).length).toBe(overTank(p.panels));
  });

  it('returns null when nothing overlaps or nothing changes (no patch churn)', () => {
    const p = bridged();
    expect(reconcileBridgedPanels(p, {})).toBeNull(); // already consistent
    const empty = siteProject(null);
    expect(reconcileBridgedPanels(empty, {})).toBeNull();
  });

  it('tilt/profile choices leave bridged panels enabled (clearance unchanged)', () => {
    const p = bridged();
    const r = applyStructChoice(p, p.segments[0].id, { kind: 'tilt', tiltDeg: 15 })!;
    expect(r.panels.every((x) => x.enabled)).toBe(true);
  });
});
