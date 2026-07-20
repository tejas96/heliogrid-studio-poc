// ─── Gate: a surface cannot be given a foundation it can't carry ────────────
// 22h changed the metal-shed DEFAULT, which does nothing for a project that
// already had `foundation: 'concrete'` written on the segment. Those kept
// drawing cast pedestals on corrugated steel and claiming ~9 tonnes of dead
// load — and once the picker was narrowed to ['anchor'], the UI offered a list
// that did not contain the value in use.
//
// Defaulting was the wrong lever. Resolution CLAMPS.
import { describe, expect, it } from 'vitest';
import { allowedFoundations, projectStructures, resolveRacking } from '../structure';
import { foundationOptionsFor } from '../structure-view';
import { deriveBom } from '../bom';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, FoundationKind, PlacedPanel, Project, Roof } from '../../types';

const W = 1.134;

function scene(roofType: Roof['roofType'], persisted?: FoundationKind) {
  const base = fixtureProject(0);
  const roof: Roof = { ...fixtureRoof(), roofType, heightM: roofType === 'metal_shed' ? 6.5 : 3 };
  const seg: ArraySegment = {
    id: 'seg_t',
    roofId: roof.id,
    label: 'A1',
    polygon: [],
    rows: 1,
    cols: 4,
    orientation: 'portrait',
    azimuthDeg: 180,
    racking: {
      kind: 'fixed_tilt',
      tiltDeg: 10,
      rowPitchM: 0,
      frontLegM: 0.3,
      backLegM: 0.3,
      profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 },
      ...(persisted ? { foundation: persisted } : {}),
    },
    moduleGapM: 0.05,
    removed: [],
  };
  const panels: PlacedPanel[] = [0, 1, 2].map((c) => ({
    id: `pv_${c}`,
    roofId: roof.id,
    center: { x: c * (W + 0.05), y: 0 },
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    segmentId: 'seg_t',
    cellIndex: c,
  }));
  const project: Project = { ...base, roofs: [roof], segments: [seg], panels };
  return { project, roof, seg };
}

const resolvedKind = (roofType: Roof['roofType'], persisted?: FoundationKind) => {
  const { project, roof, seg } = scene(roofType, persisted);
  return resolveRacking(project, roof, seg, project.components.panel!)!.foundation;
};

describe('a metal shed cannot be given a cast or ballasted footing', () => {
  it('a PERSISTED concrete pedestal on a shed is corrected, not honoured', () => {
    // the live case: an existing project with foundation:'concrete' on a shed
    expect(resolvedKind('metal_shed', 'concrete')).toBe('anchor');
  });

  it('persisted ballast on a shed is corrected too', () => {
    expect(resolvedKind('metal_shed', 'ballast')).toBe('anchor');
  });

  it('the pedestal BOM line and its dead load go with it', () => {
    const { project } = scene('metal_shed', 'concrete');
    expect(deriveBom(project).find((l) => l.id.startsWith('mech.pedestal'))).toBeUndefined();
    // an anchor casts nothing, so there is no added mass to warn about
    const warnings = projectStructures(project).flatMap((s) => s.warnings).join(' ');
    expect(warnings).not.toMatch(/dead load/i);
  });

  it('a rooftop slab is untouched — it really can take a pedestal', () => {
    expect(resolvedKind('rcc_flat', 'concrete')).toBe('concrete');
  });
});

describe('the clamp does not overreach', () => {
  it('BALLAST on ground is valid — it is what you use where you cannot excavate', () => {
    // my first version of the allowed list omitted this and silently rewrote
    // every ground_ballast design to a driven pile
    expect(resolvedKind('ground', 'ballast')).toBe('ballast');
  });

  it('every ground kind the app offers as a preset survives resolution', () => {
    for (const k of ['pile', 'concrete', 'ballast'] as FoundationKind[]) {
      expect(resolvedKind('ground', k), k).toBe(k);
    }
  });

  it('every rooftop kind the picker offers survives resolution', () => {
    for (const k of ['concrete', 'anchor', 'ballast'] as FoundationKind[]) {
      expect(resolvedKind('rcc_flat', k), k).toBe(k);
    }
  });

  it('a pile is not driven into a slab', () => {
    expect(resolvedKind('rcc_flat', 'pile')).not.toBe('pile');
  });
});

describe('the picker can never offer what resolution would reject', () => {
  it('every offered option is an allowed option, on every surface', () => {
    // the two lists are different by design — ground can TAKE ballast while the
    // picker leads with pile and pedestal — but offering something that gets
    // silently corrected on the next read is the bug this whole change is about
    for (const roofType of ['rcc_flat', 'metal_shed', 'ground', 'tile'] as Roof['roofType'][]) {
      const { roof, seg } = scene(roofType);
      const allowed = allowedFoundations(roof, seg);
      for (const offered of foundationOptionsFor(roof, seg)) {
        expect(allowed, `${roofType} offers ${offered}`).toContain(offered);
      }
    }
  });

  it('a shed offers exactly one honest choice', () => {
    const { roof, seg } = scene('metal_shed');
    expect(foundationOptionsFor(roof, seg)).toEqual(['anchor']);
  });
});

describe('the correction is READ-TIME, never a rewrite', () => {
  it('the stored preference survives, so changing the roof back restores it', () => {
    const { project } = scene('metal_shed', 'concrete');
    // resolution corrected it, but nothing was written to the segment
    const racking = project.segments[0].racking as { foundation?: FoundationKind };
    expect(racking.foundation).toBe('concrete');

    // put it back on a slab and the preference is honoured again
    expect(resolvedKind('rcc_flat', 'concrete')).toBe('concrete');
  });
});
