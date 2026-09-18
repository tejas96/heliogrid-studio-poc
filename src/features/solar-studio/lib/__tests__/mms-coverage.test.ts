// ─── Gate: no surface may reach the MMS panel with nothing it can build ──────
// Open ground had zero entries in MOUNT_CATALOGUE, so on a ground array the MMS
// type dropdown rendered EMPTY, picking a type returned `{}` from configureMms,
// and `Generate MMS` did nothing either — defaultMms handed back 'rcc_fixed',
// which ground's own list does not contain.
//
// Three controls that looked alive and did nothing, from one missing table. The
// checks below are the containment the catalogue has to keep as roof types are
// added: a roof type with no preset, a strategy no roof can reach, or a default
// its own roof rejects, all fail here instead of in a customer's browser.
import { describe, expect, it } from 'vitest';
import { defaultMms, MOUNT_CATALOGUE } from '../mms/catalogue';
import { configureMms } from '../mms/configure';
import type { MountStrategy } from '../mms/types';
import { allowedFoundations, resolveRacking } from '../structure';
import { deriveBom } from '../bom';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PlacedPanel, Project, Roof, RoofType } from '../../types';

const ROOF_TYPES: RoofType[] = ['rcc_flat', 'metal_shed', 'tile', 'ground'];
const W = 1.134;

/** One table of three modules on one surface — enough to derive a structure. */
function scene(roofType: RoofType): { project: Project; seg: ArraySegment } {
  const base = fixtureProject(0);
  const roof: Roof = { ...fixtureRoof(), roofType, heightM: roofType === 'ground' ? 0 : 3 };
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: roof.id,
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: 3,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: { kind: 'fixed_tilt', tiltDeg: 10, rowPitchM: 0, frontLegM: 0.3, backLegM: 0.3, profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 } },
    moduleGapM: 0.05,
    removed: [],
  };
  const panels: PlacedPanel[] = [0, 1, 2].map((c) => ({
    id: `pv_${c}`,
    roofId: roof.id,
    center: { x: c * (W + 0.05), y: 0 },
    orientation: 'portrait' as const,
    azimuthDeg: 180,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: c,
  }));
  return { project: { ...base, roofs: [roof], segments: [seg], panels }, seg };
}

describe('every surface the picker offers has a mounting system', () => {
  it.each(ROOF_TYPES)('%s has at least one preset', (roofType) => {
    expect(MOUNT_CATALOGUE.filter((p) => p.roofs.includes(roofType))).not.toHaveLength(0);
  });

  it.each(ROOF_TYPES)("%s's own default strategy is in its own list", (roofType) => {
    const mine = MOUNT_CATALOGUE.filter((p) => p.roofs.includes(roofType)).map((p) => p.id);
    expect(mine).toContain(defaultMms(roofType).strategy);
  });

  it('no preset is stranded on a surface that does not exist', () => {
    for (const p of MOUNT_CATALOGUE) {
      expect(p.roofs.length, p.id).toBeGreaterThan(0);
      expect(p.roofs.filter((r) => !ROOF_TYPES.includes(r)), p.id).toEqual([]);
    }
  });
});

describe('a ground array can be configured, and what it builds is what it keeps', () => {
  const groundPresets = MOUNT_CATALOGUE.filter((p) => p.roofs.includes('ground'));

  it('offers driven pile, pedestal, ballast, seasonal tilt and a tracker', () => {
    expect(groundPresets.map((p) => p.id).sort()).toEqual(
      ['ground_ballast', 'ground_pedestal', 'ground_pile', 'ground_seasonal', 'ground_tracker'] satisfies MountStrategy[],
    );
  });

  it.each(groundPresets.map((p) => p.id))('%s applies, and its foundation survives resolution', (id) => {
    const { project, seg } = scene('ground');
    const patch = configureMms(project, seg.id, id);
    // the whole bug in one assertion: the panel used to get {} back
    expect(Object.keys(patch)).not.toHaveLength(0);
    const after: Project = { ...project, ...patch };
    const segAfter = after.segments[0];
    expect(segAfter.mms?.strategy).toBe(id);
    // a foundation the surface cannot carry is silently corrected at READ time,
    // so the picker would show one thing and the model build another
    const resolved = resolveRacking(after, after.roofs[0], segAfter, after.components.panel!)!;
    expect(allowedFoundations(after.roofs[0], segAfter)).toContain(resolved.foundation);
    expect(resolved.foundation).toBe(MOUNT_CATALOGUE.find((p) => p.id === id)!.foundation);
  });

  it('the tracker preset really produces tracker racking, not a fixed table', () => {
    const { project, seg } = scene('ground');
    const after: Project = { ...project, ...configureMms(project, seg.id, 'ground_tracker') };
    expect(after.segments[0].racking.kind).toBe('tracker_hsat');
  });

  it('a pile is priced, never dropped — emitMechanical skips MMS segments', () => {
    const { project, seg } = scene('ground');
    const after: Project = { ...project, ...configureMms(project, seg.id, 'ground_pile') };
    const pile = deriveBom(after).filter((l) => l.id.includes(':pile'));
    expect(pile).not.toHaveLength(0);
    expect(pile.every((l) => l.qty > 0 && l.unitPriceInr > 0)).toBe(true);
  });
});
