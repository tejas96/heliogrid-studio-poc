// ─── Plane identity: what "one roof" means to the stringer ──────────────────
// S7. Grouping used to key on `roofId`. A pitched roof in this app is several
// ADJACENT Roof objects — the straight-skeleton wavefront emits two CO-PLANAR
// faces for one wall after a split — so co-planar siblings could never share a
// string, and a 6–8 face roof fragmented into 6–8 groups, each shedding its own
// sub-minimum tail. These tests pin the fix and, just as importantly, the two
// splits that must SURVIVE it: different orientation, and physically separate
// roofs that merely happen to be parallel.
import { describe, expect, it } from 'vitest';
import { computePlaneIds, groupPanels } from '../electrical/grouping';
import { autoStringPlan } from '../electrical/autostring';
import { resolveDesignTemps } from '../electrical/temps';
import { stringSizing } from '../electrical/window';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import { PANEL_DB } from '../../data/panels';
import { INVERTER_DB } from '../../data/inverters';
import type { PlacedPanel, Project, Roof } from '../../types';

const panel = PANEL_DB.find((p) => p.id === 'pnl_ada540')!;
const inverter = INVERTER_DB.find((i) => i.id === 'inv_gr10')!;

function project(roofs: Roof[], panels: PlacedPanel[]): Project {
  return {
    ...fixtureProject(0),
    roofs,
    panels,
    location: {
      address: 'Pune',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

const TEMPS = resolveDesignTemps(project([fixtureRoof()], []));
const SIZING = stringSizing(panel, inverter, TEMPS); // min 5 / max 18 in series

/**
 * `n` strips 4 m wide laid side by side, each sharing a full wall edge with the
 * next — i.e. ONE physical slope the skeleton happened to cut into n polygons.
 * `gapM` > 0 detaches them instead (separate buildings / separate wings).
 */
function faces(n: number, over: (i: number) => Partial<Roof> = () => ({}), gapM = 0): Roof[] {
  return Array.from({ length: n }, (_, i) => {
    const x0 = i * (4 + gapM);
    return fixtureRoof({
      id: `roof_${i}`,
      name: `Face ${i}`,
      polygon: [
        { x: x0, y: 0 },
        { x: x0 + 4, y: 0 },
        { x: x0 + 4, y: 8 },
        { x: x0, y: 8 },
      ],
      roofType: 'metal_shed',
      heightM: 3,
      pitchDeg: 20,
      slopeAzimuthDeg: 180,
      ...over(i),
    });
  });
}

/** `per` panels on each face, inheriting that face's pose. */
function panelsOn(roofs: Roof[], per: number): PlacedPanel[] {
  return roofs.flatMap((r, i) =>
    Array.from({ length: per }, (_, k) => ({
      id: `pv_${i}_${k}`,
      roofId: r.id,
      center: { x: r.polygon[0].x + 0.8 + (k % 2) * 1.6, y: 2 + Math.floor(k / 2) * 1.6 },
      orientation: 'portrait' as const,
      azimuthDeg: r.slopeAzimuthDeg,
      tiltDeg: r.pitchDeg,
      solarAccess: 1,
      enabled: true,
    })),
  );
}

describe('computePlaneIds — one physical surface, however many polygons', () => {
  it('(a) two CO-PLANAR sibling faces share one plane', () => {
    const rs = faces(2);
    const ids = computePlaneIds(rs);
    expect(ids.get('roof_0')).toBe(ids.get('roof_1'));
  });

  it('(b) faces at different AZIMUTHS are different planes', () => {
    const rs = faces(2, (i) => (i === 1 ? { slopeAzimuthDeg: 90 } : {}));
    const ids = computePlaneIds(rs);
    expect(ids.get('roof_0')).not.toBe(ids.get('roof_1'));
  });

  it('adjacent faces at different PITCH or different eave height are different planes', () => {
    const pitch = computePlaneIds(faces(2, (i) => (i === 1 ? { pitchDeg: 30 } : {})));
    expect(pitch.get('roof_0')).not.toBe(pitch.get('roof_1'));
    // same orientation, stepped up 1 m: parallel, NOT co-planar
    const stepped = computePlaneIds(faces(2, (i) => (i === 1 ? { heightM: 4 } : {})));
    expect(stepped.get('roof_0')).not.toBe(stepped.get('roof_1'));
  });

  it('CROSS-BUILDING: co-planar but DETACHED faces stay separate planes', () => {
    // identical pitch, azimuth and eave height — two neighbouring wings 6 m
    // apart. Merging them would let a string be planned across the gap and
    // understate its cable run, so plane identity requires a shared wall edge.
    const ids = computePlaneIds(faces(2, () => ({}), 6));
    expect(ids.get('roof_0')).not.toBe(ids.get('roof_1'));
  });

  it('is deterministic and independent of roof array order', () => {
    const rs = faces(4);
    const a = computePlaneIds(rs);
    const b = computePlaneIds([...rs].reverse());
    for (const r of rs) expect(b.get(r.id)).toBe(a.get(r.id));
  });
});

describe('groupPanels keys on the PLANE, not the Roof object', () => {
  it('(a) panels on two co-planar sibling faces land in ONE group', () => {
    const rs = faces(2);
    const groups = groupPanels(project(rs, panelsOn(rs, 6)));
    expect(groups).toHaveLength(1);
    expect(groups[0].panels).toHaveLength(12);
    expect(new Set(groups[0].panels.map((p) => p.roofId)).size).toBe(2);
  });

  it('(b) panels on faces of DIFFERENT azimuth still never share a group', () => {
    const rs = faces(2, (i) => (i === 1 ? { slopeAzimuthDeg: 90 } : {}));
    const groups = groupPanels(project(rs, panelsOn(rs, 6)));
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(new Set(g.panels.map((p) => p.azimuthDeg)).size).toBe(1);
  });

  it('the shade-tier split survives plane merging', () => {
    const rs = faces(2);
    const ps = panelsOn(rs, 8);
    ps.slice(0, 6).forEach((p) => (p.solarAccess = 0.6)); // a genuinely shaded run
    const groups = groupPanels(project(rs, ps));
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.shadeTier))).toEqual(new Set(['clear', 'heavy']));
  });

  it('a panel whose roof is not in the project keeps its own plane', () => {
    const rs = faces(2);
    const ps = panelsOn(rs, 6);
    ps[0].roofId = 'roof_ghost'; // no geometry ⇒ nothing to prove co-planarity
    expect(groupPanels(project(rs, ps))).toHaveLength(2);
  });
});

describe('(c) azimuth bucketing wraps around north', () => {
  it('359° and 1° are 2° apart, not 358° — one group', () => {
    const rs = [fixtureRoof({ slopeAzimuthDeg: 0 })];
    const ps = panelsOn(rs, 6);
    ps.forEach((p, i) => (p.azimuthDeg = i % 2 === 0 ? 359 : 1));
    const groups = groupPanels(project(rs, ps));
    expect(groups).toHaveLength(1);
    expect(groups[0].panels).toHaveLength(6);
    expect(groups[0].azimuthDeg).toBeGreaterThanOrEqual(0);
    expect(groups[0].azimuthDeg).toBeLessThan(360); // normalised, never 360
  });

  it('a due-north face is one group whichever side of 0° each panel reports', () => {
    const rs = [fixtureRoof({ slopeAzimuthDeg: 0 })];
    const ps = panelsOn(rs, 4);
    ps[0].azimuthDeg = 358;
    ps[1].azimuthDeg = 2;
    ps[2].azimuthDeg = 0;
    ps[3].azimuthDeg = 360;
    expect(groupPanels(project(rs, ps))).toHaveLength(1);
  });

  it('wraparound does NOT collapse genuinely opposed orientations', () => {
    const rs = [fixtureRoof({ slopeAzimuthDeg: 0 })];
    const ps = panelsOn(rs, 4);
    ps[0].azimuthDeg = 359;
    ps[1].azimuthDeg = 181; // due south vs due north: must stay apart
    expect(groupPanels(project(rs, ps)).length).toBeGreaterThan(1);
  });
});

describe('(d) orphaned tails on a multi-face roof', () => {
  // 6 co-planar faces × 4 panels. Per-face grouping gave 6 groups of 4, and 4 <
  // minPanels(5), so EVERY panel was an orphaned tail: 0 strings, 24 unstrung.
  const per = 4;
  expect(per).toBeLessThan(SIZING.minPanels);

  it('co-planar faces pool into strings instead of 6 sub-minimum tails', () => {
    const rs = faces(6);
    const p = project(rs, panelsOn(rs, per));
    const plan = autoStringPlan(p, panel, inverter, 4, TEMPS);
    expect(plan.unstrungPanelIds).toEqual([]);
    expect(plan.strings.flatMap((s) => s.panelIds)).toHaveLength(24);
    expect(plan.strings.length).toBeLessThanOrEqual(2); // was 0 strings / 24 orphans
    expect(plan.issues.some((i) => i.code === 'group_too_small')).toBe(false);
    // MPPT inputs actually consumed — the BOM's inverter/combiner count follows
    const slots = new Set(plan.strings.map((s) => `${s.inverterIndex}:${s.mpptIndex}`));
    expect(slots.size).toBeLessThanOrEqual(2);
  });

  it('the SAME panels on DETACHED faces still strand — the split is real, not incidental', () => {
    const rs = faces(6, () => ({}), 6);
    const plan = autoStringPlan(project(rs, panelsOn(rs, per)), panel, inverter, 4, TEMPS);
    expect(plan.strings).toEqual([]);
    expect(plan.unstrungPanelIds).toHaveLength(24);
    expect(plan.issues.filter((i) => i.code === 'group_too_small')).toHaveLength(6);
  });

  it('a string never spans two different planes', () => {
    const rs = [...faces(3), ...faces(3, (i) => ({ id: `west_${i}`, slopeAzimuthDeg: 270 }))];
    const ps = panelsOn(rs, 6);
    const plan = autoStringPlan(project(rs, ps), panel, inverter, 4, TEMPS);
    const planeOf = computePlaneIds(rs);
    const byId = new Map(ps.map((p) => [p.id, p]));
    expect(plan.strings.length).toBeGreaterThan(0);
    for (const s of plan.strings) {
      const planes = new Set(s.panelIds.map((id) => planeOf.get(byId.get(id)!.roofId)));
      expect(planes.size).toBe(1);
    }
  });
});
