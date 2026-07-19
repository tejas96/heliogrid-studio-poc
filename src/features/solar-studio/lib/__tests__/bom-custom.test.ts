// ─── Hand-entered lines are edited in place, not overridden ─────────────────
// `mergeBom` indexes overrides by DERIVED line key and appends `custom` after,
// so an override aimed at a custom line matches nothing. Before this was
// routed correctly, every edit to a custom line silently became an orphan:
// the value did not change, and a banner appeared claiming the edit no longer
// matched a design that had never produced the line at all.
import { describe, expect, it } from 'vitest';
import { addCustomBomLine, editBomField, editCustomBomLine } from '../bom/edit';
import { bomMoney, mergedBom, mergedBomResult } from '../bom';
import { fixtureProject } from './fixtures/project';
import type { BomLine, Project } from '../../types';

const CUSTOM: BomLine = {
  id: 'bomc_test',
  category: 'Civil & Misc',
  item: 'Custom item',
  spec: '',
  qty: 1,
  unit: 'nos',
  unitPriceInr: 0,
  formula: 'Added manually',
  confidence: 'measured',
  auto: false,
  overridden: false,
  included: true,
  wastePct: 0,
  gstPct: 18,
};

const withCustom = () => {
  const p = fixtureProject(8);
  return { ...p, ...addCustomBomLine(p, CUSTOM) } as Project;
};
const lineOf = (p: Project) => mergedBom(p).find((l) => l.id === 'bomc_test')!;

describe('editing a custom line', () => {
  it('renames it', () => {
    const p = withCustom();
    const next = { ...p, ...editCustomBomLine(p, 'bomc_test', 'item', 'Crane hire') } as Project;
    expect(lineOf(next).item).toBe('Crane hire');
  });

  it('prices it, and the money follows', () => {
    const p = withCustom();
    const before = bomMoney(mergedBom(p), p).total;
    const priced = { ...p, ...editCustomBomLine(p, 'bomc_test', 'unitPriceInr', 50000) } as Project;
    const next = { ...priced, ...editCustomBomLine(priced, 'bomc_test', 'qty', 2) } as Project;

    expect(lineOf(next).unitPriceInr).toBe(50000);
    expect(lineOf(next).qty).toBe(2);
    expect(bomMoney(mergedBom(next), next).total).toBeGreaterThan(before);
  });

  it('excludes it', () => {
    const p = withCustom();
    const priced = { ...p, ...editCustomBomLine(p, 'bomc_test', 'unitPriceInr', 9000) } as Project;
    const off = { ...priced, ...editCustomBomLine(priced, 'bomc_test', 'included', false) } as Project;
    expect(lineOf(off).included).toBe(false);
    expect(bomMoney(mergedBom(off), off).total).toBeLessThan(
      bomMoney(mergedBom(priced), priced).total,
    );
  });

  it('produces NO orphan — the edit lands on the line', () => {
    const p = withCustom();
    const next = { ...p, ...editCustomBomLine(p, 'bomc_test', 'item', 'Crane hire') } as Project;
    expect(mergedBomResult(next).orphans).toEqual([]);
  });

  it('leaves the derived lines untouched', () => {
    const p = withCustom();
    const before = mergedBom(p).filter((l) => l.auto);
    const next = { ...p, ...editCustomBomLine(p, 'bomc_test', 'qty', 7) } as Project;
    expect(mergedBom(next).filter((l) => l.auto)).toEqual(before);
  });

  it('touching one custom line does not disturb another', () => {
    const p0 = withCustom();
    const p = { ...p0, ...addCustomBomLine(p0, { ...CUSTOM, id: 'bomc_other', item: 'Scaffold' }) } as Project;
    const next = { ...p, ...editCustomBomLine(p, 'bomc_test', 'item', 'Crane hire') } as Project;
    expect(mergedBom(next).find((l) => l.id === 'bomc_other')!.item).toBe('Scaffold');
  });
});

describe('the failure this replaced, pinned so it cannot return', () => {
  it('the OVERRIDE path on a custom line orphans instead of editing', () => {
    const p = withCustom();
    const wrong = { ...p, ...editBomField(p, 'bomc_test', 'item', 'Crane hire') } as Project;
    const { orphans } = mergedBomResult(wrong);

    expect(lineOf(wrong).item).toBe('Custom item'); // unchanged — the edit was lost
    expect(orphans.map((o) => o.lineKey)).toContain('bomc_test');
  });
});
