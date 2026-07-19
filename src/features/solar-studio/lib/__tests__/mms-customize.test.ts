// ─── Customize MMS gates ────────────────────────────────────────────────────
// 22g made the table parametric and shipped no way to change it. These pin the
// commit path that now does — and above all the LAZY-DEFAULT contract: putting
// a control back to its default must leave the project serialising exactly as
// it did before anyone touched it. Writing `2` for a purlin count that defaults
// to 2 would re-key layoutFp and stale every stored capture for a no-op edit.
import { describe, expect, it } from 'vitest';
import { applyStructChoice } from '../structure-edit';
import { projectStructures } from '../structure';
import { layoutFp } from '../fingerprints';
import { deriveBom } from '../bom';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Project, RackingSpec } from '../../types';

function tableProject(): Project {
  const base = fixtureProject(0);
  const p: Project = { ...base, roofs: [fixtureRoof()] };
  const filled = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
    ...DEFAULT_FILL,
    maxPanels: 8,
  })!;
  return { ...p, segments: [filled.segment], panels: filled.panels };
}

const SEG = (p: Project) => p.segments[0].id;
const apply = (p: Project, field: string, value: unknown): Project => {
  const r = applyStructChoice(p, SEG(p), {
    kind: 'mms',
    field: field as 'purlinCount',
    value: value as number,
  });
  if (!r) throw new Error('choice refused');
  return { ...p, ...r };
};
// the elevated branch's `kind` is itself a union, so Extract<_, {kind:'fixed_tilt'}>
// collapses to never — exclude the flush branch instead
const racking = (p: Project) => p.segments[0].racking as Exclude<RackingSpec, { kind: 'flush' }>;
const members = (p: Project, kind: string) =>
  projectStructures(p)[0].members.filter((m) => m.kind === kind).length;
const steelKg = (p: Project) => projectStructures(p).reduce((s, st) => s + st.steelKg, 0);

describe('the controls reach the structure', () => {
  it('purlin count changes the member graph', () => {
    const p = tableProject();
    const before = members(p, 'purlin');
    const after = apply(p, 'purlinCount', 4);
    expect(members(after, 'purlin')).toBeGreaterThan(before);
    expect(racking(after).purlinCount).toBe(4);
  });

  it('rafter density changes the member graph', () => {
    const p = tableProject();
    const before = members(p, 'rafter');
    expect(members(apply(p, 'rafterMultiplier', 2), 'rafter')).toBe(before * 2);
  });

  it('bracing off removes the braces', () => {
    const p = tableProject();
    expect(members(p, 'brace')).toBeGreaterThan(0);
    expect(members(apply(p, 'bracing', false), 'brace')).toBe(0);
  });

  it('end buffer lengthens the purlins and leaves the legs alone', () => {
    const p = tableProject();
    const legsBefore = members(p, 'front_leg');
    const after = apply(p, 'endBufferM', 0.3);
    expect(members(after, 'front_leg')).toBe(legsBefore);
    expect(steelKg(after)).toBeGreaterThan(steelKg(p));
  });
});

describe('one change, one patch, everywhere', () => {
  it('more purlins moves the 3D graph AND the BOM kg together', () => {
    const p = tableProject();
    const kg = (x: Project) =>
      deriveBom(x)
        .filter((l) => l.id.startsWith('mech.steel'))
        .reduce((s, l) => s + l.qty, 0);
    const after = apply(p, 'purlinCount', 4);
    expect(members(after, 'purlin')).toBeGreaterThan(members(p, 'purlin'));
    expect(kg(after)).toBeGreaterThan(kg(p));
    // the model and the bill cannot drift — same source
    expect(kg(after)).toBeCloseTo(Math.round(steelKg(after) * 10) / 10, 1);
  });

  it('a change re-keys the layout, because it moves steel', () => {
    const p = tableProject();
    expect(layoutFp(apply(p, 'purlinCount', 3))).not.toBe(layoutFp(p));
  });
});

// ══════════════════════ THE LAZY-DEFAULT CONTRACT ═══════════════════════════
describe('returning a control to its default is a true no-op', () => {
  for (const [field, custom] of [
    ['purlinCount', 4],
    ['rafterMultiplier', 2],
    ['endBufferM', 0.3],
    ['bracing', false],
  ] as const) {
    it(`${field}: set then clear ⇒ byte-identical layoutFp`, () => {
      const p = tableProject();
      const changed = apply(p, field, custom);
      expect(layoutFp(changed)).not.toBe(layoutFp(p)); // it really did something

      const cleared = apply(changed, field, undefined);
      expect(layoutFp(cleared)).toBe(layoutFp(p)); // …and truly undid it
    });

    it(`${field}: clearing REMOVES the key, it does not store undefined`, () => {
      const p = tableProject();
      const cleared = apply(apply(p, field, custom), field, undefined);
      expect(field in racking(cleared)).toBe(false);
    });

    it(`${field}: the graph comes back identical`, () => {
      const p = tableProject();
      const cleared = apply(apply(p, field, custom), field, undefined);
      expect(projectStructures(cleared)).toEqual(projectStructures(p));
    });
  }
});

describe('refusals', () => {
  it('a flush segment has no table to parameterise', () => {
    const p = tableProject();
    const flush: Project = {
      ...p,
      segments: [{ ...p.segments[0], racking: { kind: 'flush' } }],
    };
    expect(
      applyStructChoice(flush, SEG(flush), { kind: 'mms', field: 'purlinCount', value: 3 }),
    ).toBeNull();
  });

  it('an unknown segment is refused rather than silently ignored', () => {
    const p = tableProject();
    expect(applyStructChoice(p, 'nope', { kind: 'mms', field: 'purlinCount', value: 3 })).toBeNull();
  });
});
