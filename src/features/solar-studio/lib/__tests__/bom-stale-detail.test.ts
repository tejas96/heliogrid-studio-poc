// ─── Gate: field-level mismatch reporting (E17) ─────────────────────────────
// `staleFields` could only name the field that drifted. That told the user
// something was wrong and gave them no way to judge it: to find out whether
// their 30 or the design's 44 was right, the only move was to reset and watch.
//
// These pin the three values that make the report actionable, and — just as
// important — pin the cases that must stay SILENT, because a staleness banner
// that cries wolf gets ignored, and then the real drift gets ignored with it.
import { describe, expect, it } from 'vitest';
import { deriveBom } from '../bom';
import { mergeBom, setFieldOverride } from '../bom/merge';
import { fieldLabel, fmtFieldValue, staleRows } from '../bom/view';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import type { BomState, Project } from '../../types';

function designed(maxPanels: number): Project {
  const base = fixtureProject(0);
  const p: Project = { ...base, roofs: [fixtureRoof()] };
  const f = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
    ...DEFAULT_FILL,
    maxPanels,
  })!;
  return { ...p, segments: [f.segment], panels: f.panels };
}

/** Override `field` on `lineKey` while the project says `autoNow`. */
function withOverride(
  p: Project,
  lineKey: string,
  field: string,
  value: unknown,
  autoNow: unknown,
): Project {
  const state = setFieldOverride(p.bom, lineKey, field as never, value, autoNow);
  return { ...p, bom: state as BomState };
}

function lineFor(p: Project, key: string) {
  return mergeBom(deriveBom(p), p).lines.find((l) => l.id === key);
}

describe('staleDetail captures all three values', () => {
  it('records yours, wasAtEdit and now when the engine moves', () => {
    const p = designed(8);
    const modules = deriveBom(p).find((l) => l.id === 'modules.panel')!;
    const wasQty = modules.qty;

    // user prices the design as it stood, then the design grows
    const edited = withOverride(p, 'modules.panel', 'qty', 30, wasQty);
    const grown: Project = { ...edited, ...designed(12), bom: edited.bom };

    const line = lineFor(grown, 'modules.panel')!;
    expect(line.staleFields).toEqual(['qty']);
    expect(line.staleDetail).toHaveLength(1);

    const d = line.staleDetail![0];
    expect(d.field).toBe('qty');
    expect(d.yours).toBe(30);
    expect(d.wasAtEdit).toBe(wasQty);
    expect(d.now).not.toBe(wasQty);
    // the line still SHOWS the user's figure — that is the silent failure
    expect(line.qty).toBe(30);
  });

  it('the derived value is otherwise unrecoverable from the merged line', () => {
    // withField overwrites the field, so without staleDetail the only way to
    // learn what the design says is a full re-derivation
    const p = designed(8);
    const wasQty = deriveBom(p).find((l) => l.id === 'modules.panel')!.qty;
    const grown: Project = {
      ...designed(12),
      bom: withOverride(p, 'modules.panel', 'qty', 30, wasQty).bom,
    };
    const line = lineFor(grown, 'modules.panel')!;
    const derivedNow = deriveBom(grown).find((l) => l.id === 'modules.panel')!.qty;

    expect(line.qty).toBe(30);
    expect(line.staleDetail![0].now).toBe(derivedNow);
  });

  it('a rate override does NOT go stale just because the design grew', () => {
    // only the field that actually moved is reported. Growing the array
    // changes qty, not the per-unit price, so the price edit stays clean.
    const p = designed(8);
    const auto = deriveBom(p).find((l) => l.id === 'modules.panel')!;
    let edited = withOverride(p, 'modules.panel', 'qty', 30, auto.qty);
    edited = withOverride(edited, 'modules.panel', 'unitPriceInr', 999, auto.unitPriceInr);
    const grown: Project = { ...designed(12), bom: edited.bom };

    const line = lineFor(grown, 'modules.panel')!;
    expect(line.overriddenFields).toEqual(expect.arrayContaining(['qty', 'unitPriceInr']));
    expect(line.staleDetail!.map((d) => d.field)).toEqual(['qty']);
  });

  it('two drifted fields on one line produce two entries', () => {
    // stamped with values the engine never said, so both read as drifted the
    // moment they are merged — this exercises the accumulation path that a
    // single-field case cannot
    const p = designed(8);
    const auto = deriveBom(p).find((l) => l.id === 'modules.panel')!;
    let edited = withOverride(p, 'modules.panel', 'qty', 30, auto.qty + 5);
    edited = withOverride(
      edited,
      'modules.panel',
      'unitPriceInr',
      999,
      auto.unitPriceInr + 1,
    );

    const line = lineFor(edited, 'modules.panel')!;
    expect(line.staleFields).toEqual(['qty', 'unitPriceInr']);
    expect(line.staleDetail).toHaveLength(2);
    expect(staleRows([line])).toHaveLength(2);
    // each entry carries ITS OWN pair, not the line's
    const byField = Object.fromEntries(line.staleDetail!.map((d) => [d.field, d]));
    expect(byField.qty.yours).toBe(30);
    expect(byField.qty.now).toBe(auto.qty);
    expect(byField.unitPriceInr.yours).toBe(999);
    expect(byField.unitPriceInr.now).toBe(auto.unitPriceInr);
  });
});

describe('what must NOT be reported', () => {
  it('an override that still agrees with the design is not stale', () => {
    const p = designed(8);
    const auto = deriveBom(p).find((l) => l.id === 'modules.panel')!;
    // same value the engine produced — an edit, but not a disagreement
    const edited = withOverride(p, 'modules.panel', 'qty', auto.qty, auto.qty);
    const line = lineFor(edited, 'modules.panel')!;
    expect(line.staleFields).toBeUndefined();
    expect(line.staleDetail).toBeUndefined();
  });

  it('a migrated override (no autoAtEdit) is never stale, so has no detail', () => {
    // we do not know what the engine said when it was made; guessing cries wolf
    const p = designed(8);
    const edited = withOverride(p, 'modules.panel', 'qty', 30, undefined);
    const grown: Project = { ...designed(12), bom: edited.bom };
    const line = lineFor(grown, 'modules.panel')!;
    expect(line.staleFields).toBeUndefined();
    expect(line.staleDetail).toBeUndefined();
  });

  it('staleDetail is absent, not empty, on a clean line — the field stays lazy', () => {
    const line = lineFor(designed(8), 'modules.panel')!;
    expect('staleDetail' in line).toBe(false);
  });
});

describe('staleRows flattens for display', () => {
  it('one row per drifted field, carrying both numbers', () => {
    const p = designed(8);
    const wasQty = deriveBom(p).find((l) => l.id === 'modules.panel')!.qty;
    const grown: Project = {
      ...designed(12),
      bom: withOverride(p, 'modules.panel', 'qty', 30, wasQty).bom,
    };
    const stale = mergeBom(deriveBom(grown), grown).lines.filter(
      (l) => (l.staleFields?.length ?? 0) > 0,
    );
    const rows = staleRows(stale);

    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('Qty');
    expect(rows[0].yoursText).toBe('30');
    expect(rows[0].nowText).not.toBe('30');
    expect(rows[0].now).toBeDefined();
  });

  it('a pre-E17 line still lists its field, with no comparison to offer', () => {
    // staleFields present, staleDetail absent — the fallback path
    const rows = staleRows([
      {
        id: 'mech.rail',
        item: 'Mounting Rail',
        staleFields: ['qty'],
      } as never,
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].yoursText).toBe('—');
    expect(rows[0].nowText).toBe('—');
    // no derived value means no "Take X" button
    expect(rows[0].now).toBeUndefined();
  });
});

describe('field labels and value formatting', () => {
  it('names fields in product terms, not schema terms', () => {
    expect(fieldLabel('unitPriceInr')).toBe('Rate');
    expect(fieldLabel('gstPct')).toBe('GST');
    expect(fieldLabel('qty')).toBe('Qty');
  });

  it('an unknown field falls back to its own name rather than blank', () => {
    expect(fieldLabel('somethingNew')).toBe('somethingNew');
  });

  it('formats each field in its own unit', () => {
    expect(fmtFieldValue('unitPriceInr', 1234)).toBe('₹1,234');
    expect(fmtFieldValue('gstPct', 18)).toBe('18%');
    expect(fmtFieldValue('wastePct', 8)).toBe('8%');
    expect(fmtFieldValue('qty', 44)).toBe('44');
  });

  it('handles the non-numeric overridables', () => {
    expect(fmtFieldValue('included', false)).toBe('no');
    expect(fmtFieldValue('included', true)).toBe('yes');
    expect(fmtFieldValue('spec', '4 sq.mm Cu')).toBe('4 sq.mm Cu');
    expect(fmtFieldValue('qty', undefined)).toBe('—');
  });

  it('rounds float dust rather than printing it', () => {
    expect(fmtFieldValue('qty', 0.1 + 0.2)).toBe('0.3');
  });
});
