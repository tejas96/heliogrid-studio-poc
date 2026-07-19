// ─── Phase 22c gates: per-field BOM overrides ───────────────────────────────
// The model this replaces stored a whole edited COPY of a line, keyed on
// `category|item`. Each describe below pins one of the ways that failed.
import { describe, expect, it } from 'vitest';
import {
  clearFieldOverride,
  clearOverrides,
  deriveBom,
  mergedBom,
  mergedBomResult,
  migrateLegacyOverrides,
  setFieldOverride,
} from '../bom';
import {
  addCustomBomLine,
  adoptOrphanAsCustom,
  discardOrphan,
  editBomField,
  refreshBomLines,
  removeCustomBomLine,
  resetBomField,
  setBomInput,
} from '../bom/edit';
import { designFp } from '../fingerprints';
import { STRUCTURE_PROFILES } from '../../data/profiles';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { ArraySegment, BomLine, PlacedPanel, Project, Roof } from '../../types';

const rect = (cx: number, cy: number, w: number, h: number) => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

function panelsOn(roofId: string, n: number, x0: number, over: Partial<PlacedPanel> = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${roofId}_p${i}`,
    roofId,
    center: { x: x0 + i * 1.2, y: 0 },
    orientation: 'portrait' as const,
    azimuthDeg: 180,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
    ...over,
  }));
}

/** Simple designed project — enough to produce a full BOM. */
function proj(): Project {
  const roof = fixtureRoof({ id: 'r1' });
  return { ...fixtureProject(0), roofs: [roof], panels: panelsOn('r1', 6, -3) };
}

/**
 * A project with BOTH pitched coverings, which the old key could not tell
 * apart: the emitter loop produces two lines with IDENTICAL item strings.
 */
function twoCoveringProject(): Project {
  const tile: Roof = fixtureRoof({ id: 'r_tile', roofType: 'tile', pitchDeg: 22, polygon: rect(-30, 0, 12, 9) });
  const slab: Roof = fixtureRoof({ id: 'r_slab', roofType: 'rcc_flat', pitchDeg: 18, polygon: rect(30, 0, 12, 9) });
  return {
    ...fixtureProject(0),
    roofs: [tile, slab],
    panels: [
      ...panelsOn('r_tile', 4, -33, { tiltDeg: 22 }),
      ...panelsOn('r_slab', 4, 27, { tiltDeg: 18 }),
    ],
  };
}

const lineFor = (p: Project, key: string) => mergedBom(p).find((l) => l.id === key)!;
const anyAutoLine = (p: Project) => deriveBom(p)[0];

// ════════════════════════════════════════════════════════ POSITIVE ══════════
describe('POSITIVE — a field edit changes that field and nothing else', () => {
  it('applies the value', () => {
    const p = proj();
    const t = anyAutoLine(p);
    const next: Project = { ...p, bom: setFieldOverride(undefined, t.id, 'qty', 999, t.qty) };
    expect(lineFor(next, t.id).qty).toBe(999);
  });

  // THE regression. The old model froze `formula` alongside the edited qty, so
  // a line stated a derivation that did not produce the number beside it.
  it('leaves formula and spec LIVE-derived when qty is overridden', () => {
    const p = proj();
    const t = anyAutoLine(p);
    const next: Project = { ...p, bom: setFieldOverride(undefined, t.id, 'qty', 42, t.qty) };
    const merged = lineFor(next, t.id);
    expect(merged.qty).toBe(42);
    expect(merged.formula).toBe(t.formula); // still the engine's text
    expect(merged.spec).toBe(t.spec);
    expect(merged.unitPriceInr).toBe(t.unitPriceInr);
  });

  it('and they keep tracking the design after the edit', () => {
    const p = proj();
    const t = anyAutoLine(p);
    const edited: Project = { ...p, bom: setFieldOverride(undefined, t.id, 'qty', 42, t.qty) };
    // grow the array: the formula text must move even though qty is pinned
    const bigger: Project = { ...edited, panels: panelsOn('r1', 10, -5) };
    const merged = lineFor(bigger, t.id);
    expect(merged.qty).toBe(42);
    expect(merged.formula).toBe(deriveBom(bigger).find((l) => l.id === t.id)!.formula);
  });

  it('marks which fields are overridden, for the reset affordance', () => {
    const p = proj();
    const t = anyAutoLine(p);
    let bom = setFieldOverride(undefined, t.id, 'qty', 5, t.qty);
    bom = setFieldOverride(bom, t.id, 'unitPriceInr', 7, t.unitPriceInr);
    const merged = lineFor({ ...p, bom }, t.id);
    expect(merged.overridden).toBe(true);
    expect([...(merged.overriddenFields ?? [])].sort()).toEqual(['qty', 'unitPriceInr']);
  });

  it('resetting ONE field restores auto and leaves its sibling alone', () => {
    const p = proj();
    const t = anyAutoLine(p);
    let bom = setFieldOverride(undefined, t.id, 'qty', 5, t.qty);
    bom = setFieldOverride(bom, t.id, 'unitPriceInr', 7, t.unitPriceInr);
    bom = clearFieldOverride(bom, t.id, 'qty');
    const merged = lineFor({ ...p, bom }, t.id);
    expect(merged.qty).toBe(t.qty); // back to derived
    expect(merged.unitPriceInr).toBe(7); // sibling survives
    expect(merged.overriddenFields).toEqual(['unitPriceInr']);
  });

  it('clearing the last field drops the record entirely', () => {
    const p = proj();
    const t = anyAutoLine(p);
    let bom = setFieldOverride(undefined, t.id, 'qty', 5, t.qty);
    bom = clearFieldOverride(bom, t.id, 'qty');
    expect(bom.overrides).toEqual([]);
    expect(lineFor({ ...p, bom }, t.id).overridden).toBe(false);
  });

  it('custom lines are appended', () => {
    const p = proj();
    const custom: BomLine = {
      id: 'custom_1', category: 'Civil & Misc', item: 'Crane hire', spec: '1 day',
      qty: 1, unit: 'Lot', unitPriceInr: 18000, formula: 'entered by hand',
      confidence: 'measured', auto: false, overridden: false,
    };
    const next: Project = { ...p, bom: { overrides: [], custom: [custom] } };
    expect(mergedBom(next).some((l) => l.id === 'custom_1')).toBe(true);
  });

  it('clearOverrides drops a whole set — the section refresh', () => {
    const p = proj();
    const [a, b] = deriveBom(p);
    let bom = setFieldOverride(undefined, a.id, 'qty', 1, a.qty);
    bom = setFieldOverride(bom, b.id, 'qty', 2, b.qty);
    bom = clearOverrides(bom, [a.id, b.id]);
    expect(bom.overrides).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════ NEGATIVE ══════════
describe('NEGATIVE — nothing is silently dropped', () => {
  it('an override with no matching line is REPORTED as an orphan', () => {
    const p = proj();
    const bom = setFieldOverride(undefined, 'mech.does_not_exist', 'qty', 5, 1);
    const r = mergedBomResult({ ...p, bom });
    expect(r.orphans).toHaveLength(1);
    expect(r.orphans[0].lineKey).toBe('mech.does_not_exist');
    expect(r.orphans[0].fields.qty).toBe(5); // the user's work is still readable
  });

  it('a design change that removes a line orphans its edit rather than losing it', () => {
    const p = proj();
    const t = deriveBom(p).find((l) => l.category === 'Modules')!;
    const bom = setFieldOverride(undefined, t.id, 'qty', 77, t.qty);
    // strip every panel: the modules line disappears
    const emptied: Project = { ...p, bom, panels: [] };
    const r = mergedBomResult(emptied);
    expect(r.lines.find((l) => l.id === t.id)).toBeUndefined();
    expect(r.orphans.map((o) => o.lineKey)).toContain(t.id);
  });

  it('a field the registry does not expose is reported, never applied', () => {
    const p = proj();
    const t = anyAutoLine(p);
    const bom = {
      overrides: [{ lineKey: t.id, fields: { formula: { value: 'hacked', autoAtEdit: undefined } } }],
      custom: [],
    };
    const r = mergedBomResult({ ...p, bom });
    expect(r.lines.find((l) => l.id === t.id)!.formula).toBe(t.formula);
    expect(r.orphans.some((o) => 'formula' in o.fields)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════ EDGE ══════════
describe('EDGE — the collision, the migration, the fingerprint', () => {
  // The exact failure the old `category|item` key had: two lines, same item
  // text, so an edit to one applied to both and only one survived the Map.
  it('two pitched coverings take INDEPENDENT edits despite identical item text', () => {
    const p = twoCoveringProject();
    const sloped = deriveBom(p).filter((l) => l.id.startsWith('mech.mms_sloped'));
    expect(sloped.length, 'fixture must produce both covering lines').toBe(2);
    expect(sloped[0].item).toBe(sloped[1].item); // same text…
    expect(sloped[0].id).not.toBe(sloped[1].id); // …different key

    let bom = setFieldOverride(undefined, sloped[0].id, 'qty', 111, sloped[0].qty);
    bom = setFieldOverride(bom, sloped[1].id, 'qty', 222, sloped[1].qty);
    const merged = mergedBom({ ...p, bom });
    expect(merged.find((l) => l.id === sloped[0].id)!.qty).toBe(111);
    expect(merged.find((l) => l.id === sloped[1].id)!.qty).toBe(222);
  });

  it('migration carries qty and price across, and is idempotent', () => {
    const p = proj();
    const t = deriveBom(p).find((l) => l.category === 'Modules')!;
    const legacy: Project = {
      ...p,
      bomOverrides: [{ ...t, qty: t.qty + 5, unitPriceInr: t.unitPriceInr + 100, overridden: true }],
    };
    const a = migrateLegacyOverrides(legacy);
    expect(a.overrides).toHaveLength(1);
    expect(a.overrides[0].lineKey).toBe(t.id);
    expect(a.overrides[0].fields.qty.value).toBe(t.qty + 5);
    expect(a.overrides[0].fields.unitPriceInr.value).toBe(t.unitPriceInr + 100);

    // after the caller clears the legacy array a second pass finds nothing
    const migrated: Project = { ...legacy, bomOverrides: [], bom: { ...a } };
    expect(migrateLegacyOverrides(migrated).overrides).toEqual([]);
  });

  it('migration keeps custom lines', () => {
    const p = proj();
    const custom: BomLine = {
      id: 'c1', category: 'Civil & Misc', item: 'Scaffolding', spec: '', qty: 1, unit: 'Lot',
      unitPriceInr: 5000, formula: 'manual', confidence: 'measured', auto: false, overridden: false,
    };
    expect(migrateLegacyOverrides({ ...p, bomOverrides: [custom] }).custom).toHaveLength(1);
  });

  it('a migrated override is never called stale — we do not know what it was', () => {
    const p = proj();
    const t = anyAutoLine(p);
    const bom = {
      overrides: [{ lineKey: t.id, fields: { qty: { value: 5, autoAtEdit: undefined } } }],
      custom: [],
    };
    expect(lineFor({ ...p, bom }, t.id).staleFields).toBeUndefined();
  });

  it('an override IS stale once the engine moves away from what it recorded', () => {
    const p = proj();
    const t = deriveBom(p).find((l) => l.category === 'Modules')!;
    const bom = setFieldOverride(undefined, t.id, 'qty', 99, t.qty);
    const bigger: Project = { ...p, bom, panels: panelsOn('r1', 9, -4) };
    expect(lineFor(bigger, t.id).staleFields).toContain('qty');
  });

  it('…and is NOT stale while the design still agrees', () => {
    const p = proj();
    const t = anyAutoLine(p);
    const bom = setFieldOverride(undefined, t.id, 'qty', 99, t.qty);
    expect(lineFor({ ...p, bom }, t.id).staleFields).toBeUndefined();
  });

  // THE contract that protects every stored capture and quote.
  it('a project that never edited its BOM fingerprints byte-identically', () => {
    const p = proj();
    const before = designFp(p);
    expect(designFp({ ...p, bom: undefined })).toBe(before);
    // an EMPTY block must also be indistinguishable from absent
    expect(designFp({ ...p, bom: { overrides: [], custom: [] } })).not.toBe(before);
  });

  it('…but a real edit DOES re-key the design, because it moves money', () => {
    const p = proj();
    const t = anyAutoLine(p);
    const edited: Project = { ...p, bom: setFieldOverride(undefined, t.id, 'qty', 5, t.qty) };
    expect(designFp(edited)).not.toBe(designFp(p));
  });

  it('field ORDER inside an override does not change the fingerprint', () => {
    const p = proj();
    const t = anyAutoLine(p);
    const a: Project = {
      ...p,
      bom: { overrides: [{ lineKey: t.id, fields: { qty: { value: 1, autoAtEdit: 0 }, unitPriceInr: { value: 2, autoAtEdit: 0 } } }], custom: [] },
    };
    const b: Project = {
      ...p,
      bom: { overrides: [{ lineKey: t.id, fields: { unitPriceInr: { value: 2, autoAtEdit: 0 }, qty: { value: 1, autoAtEdit: 0 } } }], custom: [] },
    };
    expect(designFp(a)).toBe(designFp(b));
  });

  it('legacy whole-line overrides still apply while a project is unmigrated', () => {
    const p = proj();
    const t = deriveBom(p).find((l) => l.category === 'Modules')!;
    const legacy: Project = { ...p, bomOverrides: [{ ...t, qty: 1234, overridden: true }] };
    expect(mergedBom(legacy).find((l) => l.id === t.id)!.qty).toBe(1234);
  });

  it('mergedBom stays a thin wrapper — same lines as mergedBomResult', () => {
    const p = proj();
    expect(mergedBom(p)).toEqual(mergedBomResult(p).lines);
  });
});

// ─── Lazy migration on first edit ───────────────────────────────────────────
// Converting the legacy array needs a full re-derive, so it cannot live in
// normalize.ts (every load, every project). It happens on the first BOM edit
// instead — which means a project that never touches its BOM is never migrated
// and its designFp never moves.
describe('lazy migration', () => {
  it('an untouched legacy project is NOT migrated and does not re-key', () => {
    const p = proj();
    const t = deriveBom(p).find((l) => l.category === 'Modules')!;
    const legacy: Project = { ...p, bomOverrides: [{ ...t, qty: 500, overridden: true }] };
    expect(legacy.bom).toBeUndefined();
    // legacy still applies, unchanged
    expect(mergedBom(legacy).find((l) => l.id === t.id)!.qty).toBe(500);
  });

  it('the FIRST edit converts the legacy array and clears it', () => {
    const p = proj();
    const t = deriveBom(p).find((l) => l.category === 'Modules')!;
    const legacy: Project = { ...p, bomOverrides: [{ ...t, qty: 500, overridden: true }] };

    const r = editBomField(legacy, t.id, 'unitPriceInr', 111);
    expect(r.bomOverrides).toEqual([]); // legacy emptied so it cannot double-apply
    const after: Project = { ...legacy, ...r };

    const merged = mergedBom(after).find((l) => l.id === t.id)!;
    expect(merged.qty, 'the migrated legacy edit survives').toBe(500);
    expect(merged.unitPriceInr, 'and the new edit applies').toBe(111);
  });

  it('editing stamps autoAtEdit, so staleness works from the first edit on', () => {
    const p = proj();
    const t = deriveBom(p).find((l) => l.category === 'Modules')!;
    const after: Project = { ...p, ...editBomField(p, t.id, 'qty', 3) };
    expect(after.bom!.overrides[0].fields.qty.autoAtEdit).toBe(t.qty);
  });

  it('reset and refresh go through the same lazy conversion', () => {
    const p = proj();
    const t = anyAutoLine(p);
    const edited: Project = { ...p, ...editBomField(p, t.id, 'qty', 3) };
    expect(mergedBom({ ...edited, ...resetBomField(edited, t.id, 'qty') })
      .find((l) => l.id === t.id)!.qty).toBe(t.qty);
    expect(refreshBomLines(edited, [t.id]).bom.overrides).toEqual([]);
  });

  it('an orphan can be kept as a custom line instead of being lost', () => {
    const p = proj();
    const t = deriveBom(p).find((l) => l.category === 'Modules')!;
    const edited: Project = { ...p, ...editBomField(p, t.id, 'qty', 77) };
    const gone: Project = { ...edited, panels: [] };
    const orphan = mergedBomResult(gone).orphans[0];
    expect(orphan).toBeDefined();

    const kept: Project = {
      ...gone,
      ...adoptOrphanAsCustom(gone, orphan.lineKey, { ...t, id: 'kept_1', qty: 77 }),
    };
    expect(mergedBomResult(kept).orphans).toEqual([]);
    expect(mergedBom(kept).find((l) => l.id === 'kept_1')!.qty).toBe(77);
  });

  it('discarding an orphan is explicit and removes it', () => {
    const p = proj();
    const t = deriveBom(p).find((l) => l.category === 'Modules')!;
    const edited: Project = { ...p, ...editBomField(p, t.id, 'qty', 77) };
    const gone: Project = { ...edited, panels: [] };
    const cleared: Project = { ...gone, ...discardOrphan(gone, t.id) };
    expect(mergedBomResult(cleared).orphans).toEqual([]);
  });

  it('section inputs round-trip, and clear back to absent', () => {
    const p = proj();
    const withInput: Project = { ...p, ...setBomInput(p, 'avgDcRunM', 12) };
    expect(withInput.bom!.inputs!.avgDcRunM).toBe(12);
    const cleared: Project = { ...withInput, ...setBomInput(withInput, 'avgDcRunM', undefined) };
    expect(cleared.bom!.inputs).toBeUndefined();
  });
});
