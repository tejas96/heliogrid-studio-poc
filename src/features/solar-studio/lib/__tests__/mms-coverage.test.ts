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
import { validateMms } from '../mms/validate';
import { deriveStructures } from '../derive/structures';
import { allowedFoundations, resolveRacking } from '../structure';
import { deriveBom } from '../bom';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, PlacedPanel, Project, Roof, RoofType } from '../../types';

// EXHAUSTIVE by construction. A `Record<RoofType, true>` literal cannot omit a
// member without a compile error, so adding a covering to the union forces it
// into this list — and then into the checks below, which demand it have at
// least one mounting system and a default it can actually apply. A plain array
// would have let a new covering ship with an empty MMS dropdown, which is the
// exact defect this file exists to stop.
const ALL_ROOF_TYPES: Record<RoofType, true> = {
  rcc_flat: true,
  metal_shed: true,
  ac_sheet: true,
  membrane: true,
  tile: true,
  ground: true,
};
const ROOF_TYPES = Object.keys(ALL_ROOF_TYPES) as RoofType[];
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

// ─── Waterproofing membrane ─────────────────────────────────────────────────
// One rule, and it admits no exception: NOTHING penetrates. Filed under
// 'rcc_flat' the app offered chemical anchors — the single fixing that must
// never be used here — and the flat-RCC remainder bought a table founded on a
// cast pedestal. These pin the refusal, not just the new lines.
describe('a membrane roof cannot be given a fixing that goes through it', () => {
  it('offers ONLY mass: no foundation but ballast, on any segment', () => {
    const { project, seg } = scene('membrane');
    expect(allowedFoundations(project.roofs[0], seg)).toEqual(['ballast']);
    const resolved = resolveRacking(project, project.roofs[0], seg, project.components.panel!)!;
    expect(resolved.foundation).toBe('ballast');
  });

  it.each(MOUNT_CATALOGUE.filter((p) => p.roofs.includes('membrane')).map((p) => p.id))(
    '%s founds on ballast, never an anchor',
    (id) => {
      const { project, seg } = scene('membrane');
      const after: Project = { ...project, ...configureMms(project, seg.id, id) };
      const resolved = resolveRacking(after, after.roofs[0], after.segments[0], after.components.panel!)!;
      expect(resolved.foundation).toBe('ballast');
    },
  );

  it('a penetrating fixing is an ERROR', () => {
    const { project, seg } = scene('membrane');
    const after: Project = { ...project, ...configureMms(project, seg.id, 'membrane_ballast') };
    const wrong: Project = {
      ...after,
      segments: after.segments.map((s) => ({ ...s, mms: { ...s.mms!, strategy: 'rcc_anchor' as const } })),
    };
    const findings = validateMms(wrong, deriveStructures(wrong));
    expect(findings.some((f) => f.code === 'membrane_penetration' && f.status === 'error')).toBe(true);
  });

  it('buys protection pads and the manufacturer sign-off, never a pedestal', () => {
    const base = fixtureProject(6);
    const project: Project = { ...base, roofs: [{ ...fixtureRoof(), roofType: 'membrane' }] };
    const bom = deriveBom(project);
    for (const key of ['mech.mms_membrane', 'mech.membrane_protection', 'mech.membrane_warranty']) {
      const l = bom.find((x) => x.id.startsWith(key));
      expect(l, key).toBeDefined();
      expect(l!.unitPriceInr, key).toBeGreaterThan(0);
    }
    // the remainder bucket must not also claim these panels
    expect(bom.some((l) => l.id.startsWith('mech.mms_rcc'))).toBe(false);
    expect(bom.some((l) => l.id.startsWith('mech.pedestal'))).toBe(false);
  });

  // The case the browser caught: a real membrane roof's panels are in a TABLE,
  // so the per-panel lines never fire and the blocks come from the node graph —
  // which bought concrete and NO protection at all. And the site fastener kit
  // called itself "Chemical Anchors" on the one roof where that fixing must
  // never be used.
  it('a TABLE on a membrane still buys a pad for every block', () => {
    const { project, seg } = scene('membrane');
    const bom = deriveBom(project);
    const blocks = bom.find((l) => l.id.startsWith('mech.ballast'));
    const pads = bom.find((l) => l.id.startsWith('mech.membrane_pad'));
    expect(blocks).toBeDefined();
    expect(pads).toBeDefined();
    expect(pads!.qty).toBe(blocks!.qty); // one pad per block, from one graph
    expect(pads!.unitPriceInr).toBeGreaterThan(0);
    expect(seg.id).toBeTruthy();
  });

  it('nothing in the quote offers a chemical anchor', () => {
    const { project } = scene('membrane');
    for (const l of deriveBom(project)) {
      expect(`${l.item} ${l.spec}`.toLowerCase(), l.id).not.toMatch(/chemical anchor(?!s are not)/);
    }
  });

  it('the aerodynamic tray really lays out east–west, not south', () => {
    const { project, seg } = scene('membrane');
    const after: Project = { ...project, ...configureMms(project, seg.id, 'aero_tray') };
    expect(after.segments[0].racking.kind).toBe('dual_tilt');
    expect(after.segments[0].azimuthDeg).toBe(90);
  });
});

// ─── Asbestos-cement sheet ──────────────────────────────────────────────────
// An AC roof filed under any other covering costs money and costs safety. Under
// 'metal_shed' it buys a screw into a sheet that carries nothing; in the
// flat-RCC REMAINDER it buys ballasted tilt legs for a pitched fragile roof. And
// under either, the two things the law requires before anyone climbs onto
// asbestos — boarded access and a method statement — silently leave the job.
describe('an asbestos-cement roof is quoted as itself', () => {
  /** Loose panels on one AC roof: no segment, so they land in the nAc bucket. */
  function acProject(): Project {
    const base = fixtureProject(6);
    return { ...base, roofs: [{ ...fixtureRoof(), roofType: 'ac_sheet', heightM: 6.5 }] };
  }

  it('buys hook bolts and their seal, both priced', () => {
    const bom = deriveBom(acProject());
    for (const key of ['mech.mms_ac_sheet', 'mech.ac_sheet_seal']) {
      const l = bom.find((x) => x.id.startsWith(key));
      expect(l, key).toBeDefined();
      expect(l!.qty, key).toBe(6);
      expect(l!.unitPriceInr, key).toBeGreaterThan(0);
    }
  });

  it('carries the fragile-roof access and the asbestos method statement', () => {
    const bom = deriveBom(acProject());
    for (const key of ['mech.ac_fragile_access', 'mech.ac_asbestos_method']) {
      const l = bom.find((x) => x.id.startsWith(key));
      expect(l, key).toBeDefined();
      // per ROOF, not per panel — you board a roof once
      expect(l!.qty, key).toBe(1);
      expect(l!.unitPriceInr, key).toBeGreaterThan(0);
    }
  });

  it('is never billed as elevated RCC or as a metal shed', () => {
    const bom = deriveBom(acProject());
    expect(bom.some((l) => l.id.startsWith('mech.mms_rcc'))).toBe(false);
    expect(bom.some((l) => l.id.startsWith('mech.mms_metal_shed'))).toBe(false);
  });

  // The case the first version of this file MISSED, and the browser caught: a
  // real AC shed's panels are in a TABLE, so they are `structuredPanelIds` and
  // never reach the per-panel bucket above. They are priced from the node graph
  // instead — which was summing every sheet roof into one blended pair of lines
  // named after the metal shed, buying a ₹210 L-foot and a ₹12 washer where a
  // ₹240 hook bolt and a ₹65 seal set go.
  it('a TABLE on AC sheet buys hook bolts from the node graph, not shed L-feet', () => {
    const { project, seg } = scene('ac_sheet');
    // a sheet roof carries a flush monorail: rails on fixings, no legs
    const flush: Project = {
      ...project,
      segments: project.segments.map((s) =>
        s.id === seg.id ? { ...s, racking: { kind: 'flush' as const } } : s,
      ),
    };
    const bom = deriveBom(flush);
    const hook = bom.find((l) => l.id.startsWith('mech.ac_hook_bolt'));
    const seal = bom.find((l) => l.id.startsWith('mech.ac_hook_seal'));
    expect(hook).toBeDefined();
    expect(hook!.qty).toBeGreaterThan(0);
    expect(seal?.qty).toBe(hook!.qty); // one seal per hole, by definition
    // and the metal-shed lines must NOT appear for an AC roof
    expect(bom.some((l) => l.id.startsWith('mech.sheet_standoff'))).toBe(false);
    expect(bom.some((l) => l.id.startsWith('mech.sealing_washer'))).toBe(false);
  });

  it('a fixing that bears on the sheet is an ERROR, not a warning', () => {
    const { project, seg } = scene('ac_sheet');
    const after: Project = { ...project, ...configureMms(project, seg.id, 'hook_bolt') };
    const wrong: Project = {
      ...after,
      segments: after.segments.map((s) => ({ ...s, mms: { ...s.mms!, strategy: 'direct_sheet' as const } })),
    };
    const findings = validateMms(wrong, deriveStructures(wrong));
    expect(findings.some((f) => f.code === 'ac_wrong_fixing' && f.status === 'error')).toBe(true);
  });
});

