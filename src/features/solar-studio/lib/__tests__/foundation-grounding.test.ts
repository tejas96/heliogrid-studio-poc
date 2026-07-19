// ─── Foundations must SIT ON the roof ───────────────────────────────────────
// Reported as "the mounting structure is levitating on the roof", and it was:
// every pedestal rendered one foundation height above the deck.
//
// The cause was a contract mismatch, not a maths error. `foundationAssembly`
// declares its part offsets "relative to the roof surface at the leg centre"
// and builds the pedestal spanning 0 → h upward. The roof_anchor node was
// placed at `frontLeg.a`, which the D15 height chain had moved to the TOP of
// the foundation. Both were individually correct; together they floated.
//
// It was invisible while DEFAULT_FOUNDATION was 'anchor' (height 0) and
// appeared the moment the rooftop default became a 150 mm pedestal — so these
// pin the RELATIONSHIP, across every foundation kind, rather than one number.
import { describe, expect, it } from 'vitest';
import { buildStructure, resolveRacking, validateStructure } from '../structure';
import { foundationAssembly, ruleFor } from '../foundation';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, FoundationKind, PlacedPanel, Project } from '../../types';

const KINDS: FoundationKind[] = ['anchor', 'concrete', 'ballast', 'pile'];
const W = 1.134;
const GAP = 0.05;

/** Same one-row portrait segment the Phase-7 structure gates use. */
function rowSegment(cols: number[]) {
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: 'roof_1',
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: Math.max(...cols) + 1,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 0,
      frontLegM: 0.3,
      backLegM: 0.3,
      profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 },
    },
    moduleGapM: GAP,
    removed: [],
  };
  const panels: PlacedPanel[] = cols.map((col) => ({
    id: `pv_${col}`,
    roofId: 'roof_1',
    center: { x: col * (W + GAP), y: 0 },
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: col,
  }));
  return { seg, panels };
}

/** Build the structure with a given foundation kind. */
function build(kind: FoundationKind) {
  const base = fixtureProject(0);
  const project: Project = {
    ...base,
    roofs: [fixtureRoof()],
    structureDefaults: { ...base.structureDefaults, foundation: kind },
  };
  const { seg, panels } = rowSegment([0, 1, 2]);
  const roof = project.roofs[0];
  const spec = project.components.panel!;
  const racking = resolveRacking(project, roof, seg, spec);
  if (!racking) return null;
  expect(racking.foundation, 'the kind under test must actually resolve').toBe(kind);
  return { s: buildStructure(seg, spec, roof, racking, panels), roof, racking };
}

describe('a foundation rests on the deck, whatever kind it is', () => {
  for (const kind of KINDS) {
    it(`${kind}: the roof_anchor node sits at the roof surface`, () => {
      const built = build(kind);
      if (!built) return expect.unreachable('fixture segment must have a structure');
      const { s, roof } = built;
      const anchors = s.nodes.filter((n) => n.kind === 'roof_anchor');
      expect(anchors.length).toBeGreaterThan(0);
      for (const n of anchors) {
        // THE pin: on the deck, not on top of the foundation
        expect(n.position.z, `${kind} anchor ${n.id}`).toBeCloseTo(roof.heightM, 6);
      }
    });

    it(`${kind}: the pedestal's underside lands exactly on the deck`, () => {
      const built = build(kind);
      if (!built) return expect.unreachable('fixture segment must have a structure');
      const { s, roof } = built;
      const asm = foundationAssembly(kind);
      const anchor = s.nodes.find((n) => n.kind === 'roof_anchor')!;

      // reproduce what the renderer does: node.z + part.offset.y, box centred
      const bottomOf = (p: (typeof asm.parts)[number]) =>
        anchor.position.z + p.offset.y - p.size.y / 2;

      // NOTHING floats. This is the whole bug: the lowest part of the assembly
      // must reach the deck, never stop short above it.
      const lowest = Math.min(...asm.parts.map(bottomOf));
      expect(lowest, `${kind} lowest part must not hover`).toBeLessThanOrEqual(
        roof.heightM + 1e-6,
      );

      if (kind === 'pile') {
        // a pile is DRIVEN — it is meant to pass through the deck and continue
        // below grade, so it is the one kind whose lowest part sits under it
        expect(lowest, 'pile embedment').toBeLessThan(roof.heightM);
      } else {
        // everything else rests exactly on the surface: no float, no sinking
        expect(lowest, `${kind} rests on the deck`).toBeCloseTo(roof.heightM, 6);
      }
    });

    it(`${kind}: the steel leg starts on TOP of the foundation`, () => {
      const built = build(kind);
      if (!built) return expect.unreachable('fixture segment must have a structure');
      const { s, roof } = built;
      const foundH = ruleFor(kind).heightMm / 1000;
      for (const leg of s.members.filter((m) => m.kind === 'front_leg' || m.kind === 'back_leg')) {
        expect(leg.a.z, `${kind} ${leg.id} base`).toBeCloseTo(roof.heightM + foundH, 6);
      }
    });
  }

  it('the foundation fills the gap between deck and leg — no void, no overlap', () => {
    for (const kind of KINDS) {
      const built = build(kind);
      if (!built) continue;
      const { s } = built;
      const anchor = s.nodes.find((n) => n.kind === 'roof_anchor')!;
      const leg = s.members.find((m) => m.kind === 'front_leg')!;
      expect(leg.a.z - anchor.position.z, kind).toBeCloseTo(ruleFor(kind).heightMm / 1000, 6);
    }
  });

  it('the module plane does NOT move when the foundation kind changes (D15)', () => {
    // the whole reason the height chain is arranged this way — a foundation
    // swap that lifted the array would change shading, energy and every capture
    const tops = KINDS.map((k) => {
      const built = build(k);
      return built ? Math.max(...built.s.members.map((m) => Math.max(m.a.z, m.b.z))) : null;
    }).filter((v): v is number => v !== null);
    for (const t of tops) expect(t).toBeCloseTo(tops[0], 6);
  });

  it('every kind still validates', () => {
    for (const kind of KINDS) {
      const built = build(kind);
      if (built) expect(validateStructure(built.s), kind).toEqual([]);
    }
  });
});
