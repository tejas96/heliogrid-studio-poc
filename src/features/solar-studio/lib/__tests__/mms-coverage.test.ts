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
import { insetPolygonRobust, pointInPolygon } from '../geo';
import { panelCornersOnRoof } from '../layout';
import { setSegmentAzimuth } from '../segment-ops';
import { allowedFoundations, resolveRacking } from '../structure';
import { foundationDeadLoadKg } from '../foundation';
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
  stone_slab: true,
  tile: true,
  ground: true,
  carport: true,
  floating: true,
  facade: true,
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

// ─── Turning a table must not throw it off the roof ─────────────────────────
// With an MMS the frame is rigid, so re-facing turns the whole footprint about
// its centroid. A 7 × 22 table becoming 22 × 7 walked most of a 111-module array
// off a roof it had fitted a moment earlier, and the user — who had only picked
// a legitimate mounting system — got 70 boundary errors to clear by hand.
//
// The fix is a SHIFT on the AUTOMATIC path only. Both halves of that matter, so
// both are pinned here: a preset slides the table back on, and a hand turn is
// left exactly where the user put it.
describe('a preset that turns a table keeps it on the roof', () => {
  const PITCH = W + 0.05; // panel width + module gap

  /** A long single row parked near one edge, so a 90° turn overhangs. */
  function longRow(cols: number, centreY: number): { project: Project; seg: ArraySegment } {
    const base = fixtureProject(0);
    const roof: Roof = {
      ...fixtureRoof(),
      polygon: [
        { x: -12, y: -8 },
        { x: 12, y: -8 },
        { x: 12, y: 8 },
        { x: -12, y: 8 },
      ],
    };
    const seg: ArraySegment = {
      id: 'seg_t',
      roofId: roof.id,
      label: 'A1',
      polygon: [],
      rows: 1,
      cols,
      orientation: 'portrait',
      azimuthDeg: 180,
      racking: { kind: 'fixed_tilt', tiltDeg: 10, rowPitchM: 0, frontLegM: 0.3, backLegM: 0.3, profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 } },
      moduleGapM: 0.05,
      removed: [],
    };
    const panels: PlacedPanel[] = Array.from({ length: cols }, (_, c) => ({
      id: `pv_${c}`,
      roofId: roof.id,
      segmentId: seg.id,
      cellIndex: c,
      center: { x: (c - (cols - 1) / 2) * PITCH, y: centreY },
      orientation: 'portrait' as const,
      azimuthDeg: 180,
      tiltDeg: 10,
      solarAccess: 1,
      enabled: true,
    }));
    return { project: { ...base, roofs: [roof], segments: [seg], panels }, seg };
  }

  const outsideCount = (p: Project) => {
    const roof = p.roofs[0];
    const spec = p.components.panel!;
    const inset = insetPolygonRobust(roof.polygon, roof.polygon.map(() => roof.setbackM));
    return p.panels.filter(
      (pv) =>
        !inset.some((region) =>
          panelCornersOnRoof(pv, spec, roof).every((c) => pointInPolygon(c, region)),
        ),
    ).length;
  };

  it('slides the turned table back in, instead of leaving it hanging off', () => {
    const { project, seg } = longRow(10, 6);
    expect(outsideCount(project), 'the fixture must FIT before the turn').toBe(0);
    const after: Project = { ...project, ...configureMms(project, seg.id, 'east_west') };
    expect(after.segments[0].azimuthDeg, 'it really did turn').toBe(90);
    expect(outsideCount(after), 'and it is still on the roof').toBe(0);
  });

  it('keeps every module — a shift is not a re-fill', () => {
    const { project, seg } = longRow(10, 6);
    const after: Project = { ...project, ...configureMms(project, seg.id, 'east_west') };
    expect(after.panels).toHaveLength(project.panels.length);
    expect(after.panels.filter((p) => p.enabled)).toHaveLength(10);
  });

  it('a table the USER turns by hand is left exactly where they put it', () => {
    const { project, seg } = longRow(10, 6);
    const withMms: Project = { ...project, ...configureMms(project, seg.id, 'rcc_fixed') };
    const mid = (pts: { x: number; y: number }[]) => ({
      x: pts.reduce((v, p) => v + p.x, 0) / pts.length,
      y: pts.reduce((v, p) => v + p.y, 0) / pts.length,
    });
    const before = mid(withMms.panels.map((p) => p.center));
    // the manual op: turn only. Rotation is about the centroid, so the centroid
    // may not move — if it did, something slid the table under the user's hand.
    const turned = setSegmentAzimuth(withMms.segments[0], withMms.panels, 90);
    const after = mid(turned.panels.map((p) => p.center));
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
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

// ─── Floating (FPV) ─────────────────────────────────────────────────────────
// Water bears nothing. There is no pedestal to cast, no pile to drive and no
// block to stand — the array floats, and what holds it where it was drawn is
// the MOORING, a system with no equivalent anywhere else in this app.
describe('a floating array is held by its mooring, not by a footing', () => {
  function waterScene() {
    const s = scene('floating');
    const roof: Roof = { ...s.project.roofs[0], heightM: 0 };
    return { project: { ...s.project, roofs: [roof] }, seg: s.seg };
  }

  it('offers a float and NOTHING you could build into a lake bed', () => {
    const { project, seg } = waterScene();
    expect(allowedFoundations(project.roofs[0], seg)).toEqual(['float']);
    const r = resolveRacking(project, project.roofs[0], seg, project.components.panel!)!;
    expect(r.foundation).toBe('float');
  });

  it('a float carries no dead load — it displaces water, it does not bear', () => {
    expect(foundationDeadLoadKg('float')).toBe(0);
  });

  it('buys floats, the mooring that holds them, and the survey it all rests on', () => {
    const { project, seg } = waterScene();
    const after: Project = { ...project, ...configureMms(project, seg.id, 'float_pontoon') };
    const bom = deriveBom(after);
    for (const key of [
      'mech.float_body',
      'mech.float_mooring',
      'mech.float_anchor',
      'mech.float_cable',
      'mech.float_survey',
      'mech.float_walkway',
    ]) {
      const l = bom.find((x) => x.id.startsWith(key));
      expect(l, key).toBeDefined();
      expect(l!.qty, key).toBeGreaterThan(0);
      expect(l!.unitPriceInr, key).toBeGreaterThan(0);
    }
    // and none of the dry-land foundations may appear
    for (const dry of ['mech.pedestal', 'mech.pile', 'mech.ballast']) {
      expect(bom.some((l) => l.id.startsWith(dry)), dry).toBe(false);
    }
  });

  // You cannot walk on a pure float. A walkable raft already includes the path,
  // so charging for it again would be selling the same deck twice.
  it('a walkable raft does not also buy a walkway', () => {
    const { project, seg } = waterScene();
    const after: Project = { ...project, ...configureMms(project, seg.id, 'float_raft') };
    const bom = deriveBom(after);
    expect(bom.some((l) => l.id.startsWith('mech.float_body'))).toBe(true);
    expect(bom.some((l) => l.id.startsWith('mech.float_walkway'))).toBe(false);
  });

  it('says outright that the water level — the governing input — is unknown', () => {
    const { project, seg } = waterScene();
    const after: Project = { ...project, ...configureMms(project, seg.id, 'float_pontoon') };
    const findings = validateMms(after, deriveStructures(after));
    expect(findings.some((f) => f.code === 'float_level_range' && f.status === 'not_calculated')).toBe(true);
    expect(findings.some((f) => f.code === 'float_bed' && f.status === 'not_calculated')).toBe(true);
    // and it must NOT claim a roof capacity for a structure standing on a lake
    expect(findings.some((f) => f.code === 'roof_capacity')).toBe(false);
  });
});

// ─── Carport / canopy ───────────────────────────────────────────────────────
// Not a covering: a structure with CARS under it. Three things are load-bearing
// that no roof has — the posts land on parking bays, the modules are the roof so
// their run-off has to go somewhere, and the frame is open so uplift governs.
// `high_height` only ever raised an RCC table into the air.
describe('a carport is a structure over cars, not a roof', () => {
  function carportScene() {
    const s = scene('carport');
    // a canopy stands on the tarmac; the posts are what go up
    const roof: Roof = { ...s.project.roofs[0], heightM: 0 };
    return { project: { ...s.project, roofs: [roof] }, seg: s.seg };
  }

  it('stands on a cast or driven footing — never on a ballast block', () => {
    const { project, seg } = carportScene();
    const allowed = allowedFoundations(project.roofs[0], seg);
    expect(allowed).toEqual(['concrete', 'pile']);
    expect(allowed).not.toContain('ballast');
  });

  it('clears a vehicle and spaces its posts on bays, not on cheap steel', () => {
    const { project, seg } = carportScene();
    const after: Project = { ...project, ...configureMms(project, seg.id, 'carport_cantilever') };
    const r = resolveRacking(after, after.roofs[0], after.segments[0], after.components.panel!)!;
    expect(r.frontLegM).toBeGreaterThanOrEqual(2.2); // a car fits under it
    expect(r.legSpacingM).toBe(5); // two 2.5 m bays per post, so every bay is usable
  });

  it('actually builds a gutter and downpipes — the modules ARE the roof', () => {
    const { project, seg } = carportScene();
    const after: Project = { ...project, ...configureMms(project, seg.id, 'carport_cantilever') };
    const st = deriveStructures(after).find((x) => x.segmentId === seg.id)!;
    expect(st.members.filter((m) => m.kind === 'gutter').length).toBeGreaterThan(0);
    expect(st.members.filter((m) => m.kind === 'downpipe').length).toBeGreaterThan(0);
  });

  it('buys the drainage, the footings and the make-good, all priced', () => {
    const { project, seg } = carportScene();
    const after: Project = { ...project, ...configureMms(project, seg.id, 'carport_cantilever') };
    const bom = deriveBom(after);
    for (const key of [
      'mech.carport_gutter',
      'mech.carport_downpipe',
      'mech.carport_footing',
      'mech.carport_paving',
      'mech.carport_lighting',
      'mech.carport_bollard',
    ]) {
      const l = bom.find((x) => x.id.startsWith(key));
      expect(l, key).toBeDefined();
      expect(l!.qty, key).toBeGreaterThan(0);
      expect(l!.unitPriceInr, key).toBeGreaterThan(0);
    }
  });

  // Drainage is bought per METRE as finished goods. Left in the structure's
  // steel weight it would also be billed by the kilo — the same pipe twice.
  it('never bills the gutter twice, by weight and by length', () => {
    const { project, seg } = carportScene();
    const after: Project = { ...project, ...configureMms(project, seg.id, 'carport_cantilever') };
    const st = deriveStructures(after).find((x) => x.segmentId === seg.id)!;
    const drainage = st.members.filter((m) => m.kind === 'gutter' || m.kind === 'downpipe');
    expect(drainage.length, 'there IS drainage to exclude').toBeGreaterThan(0);
    // Σ of the STRUCTURAL members alone. If drainage were still in `steelKg` it
    // would exceed this, because the pipe would carry a section and a weight.
    const structuralKg = st.members
      .filter((m) => m.kind !== 'gutter' && m.kind !== 'downpipe')
      .reduce((v, m) => v + m.lengthM * (m.profile?.kgPerM ?? 0), 0);
    expect(st.steelKg).toBeCloseTo(structuralKg, 1);
    // and drainage carries no structural section that a steel line could price
    expect(drainage.every((m) => m.profile === undefined)).toBe(true);
  });

  // Caught in the browser: a 22.7 kWp canopy carried ₹57,600 of concrete
  // pedestals AND ₹2,35,200 of canopy footings — the same 24 holes, sold twice.
  it('buys each post footing ONCE — a canopy footing is not also a pedestal', () => {
    const { project, seg } = carportScene();
    const after: Project = { ...project, ...configureMms(project, seg.id, 'carport_cantilever') };
    const bom = deriveBom(after);
    expect(bom.find((l) => l.id.startsWith('mech.carport_footing'))).toBeDefined();
    expect(bom.some((l) => l.id.includes(':pedestal'))).toBe(false);
    expect(bom.some((l) => l.id.startsWith('mech.pedestal'))).toBe(false);
    expect(bom.some((l) => l.id.startsWith('mech.pile'))).toBe(false);
  });

  it('a canopy too low for a car is an ERROR, not a note', () => {
    const { project, seg } = carportScene();
    const after: Project = { ...project, ...configureMms(project, seg.id, 'carport_cantilever') };
    const low: Project = {
      ...after,
      segments: after.segments.map((s) =>
        s.racking.kind === 'flush' ? s : { ...s, racking: { ...s.racking, clearanceM: 1.8, frontLegM: 1.8 } },
      ),
    };
    const findings = validateMms(low, deriveStructures(low));
    expect(findings.some((f) => f.code === 'carport_headroom' && f.status === 'error')).toBe(true);
  });
});

// ─── Shahabad / Kota stone slab on joists ───────────────────────────────────
// It looks exactly like a flat RCC deck and is nothing like one: a 30 mm
// limestone plate spanning between beams splits on a chemical anchor and cracks
// under a pedestal. Filed under 'rcc_flat' it was offered both.
describe('a stone slab is built on its joists, not on the slab', () => {
  function stoneProject(): Project {
    const base = fixtureProject(6);
    return { ...base, roofs: [{ ...fixtureRoof(), roofType: 'stone_slab' }] };
  }

  it('refuses a cast pedestal — the point load cracks the slab', () => {
    const { project, seg } = scene('stone_slab');
    const allowed = allowedFoundations(project.roofs[0], seg);
    expect(allowed).not.toContain('concrete');
    expect(allowed).toEqual(['anchor', 'ballast']);
  });

  it('buys joist clamps, joint re-pointing and the beam survey', () => {
    const bom = deriveBom(stoneProject());
    for (const key of ['mech.mms_stone', 'mech.stone_joint', 'mech.stone_survey']) {
      const l = bom.find((x) => x.id.startsWith(key));
      expect(l, key).toBeDefined();
      expect(l!.unitPriceInr, key).toBeGreaterThan(0);
    }
    expect(bom.some((l) => l.id.startsWith('mech.mms_rcc'))).toBe(false);
  });

  // The trap the AC and membrane slices both fell into: a real roof's panels are
  // in a TABLE, and a stone table resolves to `anchor` like a rooftop one — so
  // the generic plate-and-anchor line would have billed a chemical anchor into
  // concrete for the SAME fixings the joist clamps already cover.
  it('a TABLE buys joist clamps ONCE, not clamps plus chemical anchors', () => {
    const { project } = scene('stone_slab');
    const bom = deriveBom(project);
    const clamps = bom.find((l) => l.id.startsWith('mech.stone_beam_clamp'));
    const joints = bom.find((l) => l.id.startsWith('mech.stone_joint_node'));
    expect(clamps).toBeDefined();
    expect(clamps!.qty).toBeGreaterThan(0);
    expect(joints?.qty).toBe(clamps!.qty); // one joint per bracket, one graph
    // the generic line must not also claim those bases
    const plate = bom.find((l) => l.id.startsWith('mech.base_plate'));
    expect(plate?.item ?? 'Base Plates').not.toMatch(/Anchors/);
  });

  it('a fixing that bears on the deck is an ERROR', () => {
    const { project, seg } = scene('stone_slab');
    const after: Project = { ...project, ...configureMms(project, seg.id, 'stone_beam_clamp') };
    const wrong: Project = {
      ...after,
      segments: after.segments.map((s) => ({ ...s, mms: { ...s.mms!, strategy: 'rcc_anchor' as const } })),
    };
    const findings = validateMms(wrong, deriveStructures(wrong));
    expect(findings.some((f) => f.code === 'stone_wrong_fixing' && f.status === 'error')).toBe(true);
  });
});

// ─── Seasonal manual tilt is no longer RCC-only ─────────────────────────────
describe('seasonal tilt reaches past the RCC slab', () => {
  it('is offered on RCC, ground and a metal shed', () => {
    const seasonal = MOUNT_CATALOGUE.filter((p) =>
      ['adjustable', 'ground_seasonal', 'shed_seasonal'].includes(p.id),
    );
    expect(seasonal.flatMap((p) => p.roofs).sort()).toEqual(['ground', 'metal_shed', 'rcc_flat']);
  });

  it('is deliberately NOT offered where the roof cannot take a moment frame', () => {
    // a tile hook reaches a batten, an AC sheet carries nothing, a membrane may
    // not be fixed through — inventing a product for them would be worse than
    // leaving the gap, so this pins the refusal rather than leaving it to drift
    for (const roof of ['tile', 'ac_sheet', 'membrane'] as RoofType[]) {
      const here = MOUNT_CATALOGUE.filter((p) => p.roofs.includes(roof)).map((p) => p.id);
      expect(here, roof).not.toContain('adjustable');
      expect(here, roof).not.toContain('shed_seasonal');
    }
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

