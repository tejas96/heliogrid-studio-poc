// ─── Phase 22f gates: what the Step-9 screen decides ────────────────────────
// The components render these results and hold no logic, so testing here tests
// the screen's behaviour without a DOM. What is NOT covered this way is DOM
// wiring itself (does the checkbox call onEdit, does blur fire once) — that
// needs jsdom + testing-library, which this project does not have. Called out
// in the commit rather than left looking complete.
import { describe, expect, it } from 'vitest';
import {
  commitNumber,
  inputIsLive,
  rowState,
  sectionHasInputs,
  sectionState,
} from '../bom/view';
import { editBomField, resetBomField } from '../bom/edit';
import { bomMoney, mergedBom } from '../bom';
import { CATEGORY_ORDER } from '../bom/registry';
import { fixtureProject } from './fixtures/project';
import type { BomLine, Project } from '../../types';

const mk = (over: Partial<BomLine> = {}): BomLine => ({
  id: 'test.line',
  category: 'Electrical BOS',
  item: 'Test',
  spec: '',
  qty: 100,
  unit: 'm',
  unitPriceInr: 10,
  formula: 'test',
  confidence: 'derived',
  auto: true,
  overridden: false,
  included: true,
  wastePct: 0,
  gstPct: 5,
  ...over,
});

// ════════════════════════════════════ commit-on-blur ════════════════════════
describe('a number field commits ONCE, and only when something changed', () => {
  it('an untouched field commits nothing', () => {
    expect(commitNumber(null, 42)).toEqual({ action: 'none' });
  });

  it('re-typing the same value is not an edit', () => {
    // this is what made undo unusable: every visit to a field pushed a state
    expect(commitNumber('42', 42)).toEqual({ action: 'none' });
  });

  it('a real change commits once', () => {
    expect(commitNumber('50', 42)).toEqual({ action: 'commit', value: 50 });
  });

  it('emptying the box CLEARS — it does not mean zero', () => {
    // ₹0 is a price you can quote; "no value" is not. Conflating them silently
    // turns an abandoned edit into a free line item.
    expect(commitNumber('', 42)).toEqual({ action: 'clear' });
    expect(commitNumber('   ', 42)).toEqual({ action: 'clear' });
  });

  it('emptying an already-empty box does nothing', () => {
    expect(commitNumber('', undefined)).toEqual({ action: 'none' });
  });

  it('garbage never reaches the project', () => {
    for (const junk of ['abc', '1e', '--5', 'NaN', '1.2.3']) {
      expect(commitNumber(junk, 42), junk).toEqual({ action: 'none' });
    }
  });

  it('clamps instead of rejecting, so a typo becomes the nearest legal value', () => {
    expect(commitNumber('999', 5, { min: 0, max: 100 })).toEqual({ action: 'commit', value: 100 });
    expect(commitNumber('-5', 5, { min: 0 })).toEqual({ action: 'commit', value: 0 });
  });

  it('a clamp that lands on the current value is not an edit', () => {
    expect(commitNumber('999', 100, { max: 100 })).toEqual({ action: 'none' });
  });

  it('accepts a decimal rate', () => {
    expect(commitNumber('12.5', 12, { min: 0 })).toEqual({ action: 'commit', value: 12.5 });
  });
});

// ═══════════════════════════════════════ row state ══════════════════════════
describe('row state', () => {
  it('an excluded line is DIMMED, not dropped', () => {
    // the reader must still see the scope was considered and left to others
    const r = rowState(mk({ included: false }), 20);
    expect(r.dimmed).toBe(true);
    expect(r.orderQty).toBeGreaterThan(0);
    expect(r.total).toBe(0);
  });

  it('shows order qty, not design qty', () => {
    expect(rowState(mk({ qty: 100, wastePct: 8 }), 0).orderQty).toBe(108);
  });

  it('a user’s own figure reads as measured whatever the engine said', () => {
    expect(rowState(mk({ confidence: 'assumed', overridden: true }), 0).confidence).toBe('measured');
    expect(rowState(mk({ confidence: 'assumed' }), 0).confidence).toBe('assumed');
  });

  it('surfaces overridden and stale fields for the ↻ affordance', () => {
    const r = rowState(mk({ overriddenFields: ['qty'], staleFields: ['qty'] }), 0);
    expect(r.overridden).toEqual(['qty']);
    expect(r.stale).toEqual(['qty']);
  });

  it('only custom lines are removable', () => {
    expect(rowState(mk({ auto: true }), 0).removable).toBe(false);
    expect(rowState(mk({ auto: false }), 0).removable).toBe(true);
  });

  it('the row total is the shared money path, not a local formula', () => {
    const l = mk({ qty: 10, wastePct: 10, unitPriceInr: 100, gstPct: 18 });
    expect(rowState(l, 20).total).toBeCloseTo(
      bomMoney([l], { pricing: { marginPct: 20 } } as Project).taxable +
        bomMoney([l], { pricing: { marginPct: 20 } } as Project).gst,
      0,
    );
  });
});

// ═══════════════════════════════════ section state ══════════════════════════
describe('section state', () => {
  const p = { pricing: { marginPct: 0 } } as Project;

  it('counts what is included, out of what is shown', () => {
    const s = sectionState(
      'Electrical BOS',
      [mk({ id: 'a' }), mk({ id: 'b', included: false }), mk({ id: 'c' })],
      p,
    );
    expect(s.includedCount).toBe(2);
    expect(s.lines.length).toBe(3);
  });

  it('offers Refresh only for lines that actually carry an edit', () => {
    const s = sectionState(
      'Electrical BOS',
      [mk({ id: 'a', overriddenFields: ['qty'] }), mk({ id: 'b' })],
      p,
    );
    expect(s.editedKeys).toEqual(['a']);
  });

  it('a section with no edits offers no refresh', () => {
    expect(sectionState('Modules', [mk()], p).editedKeys).toEqual([]);
  });

  it('counts stale FIELDS, not stale lines — one line can drift twice', () => {
    const s = sectionState(
      'Electrical BOS',
      [mk({ id: 'a', staleFields: ['qty', 'unitPriceInr'] }), mk({ id: 'b' })],
      p,
    );
    expect(s.staleLines.length).toBe(1);
    expect(s.staleFieldCount).toBe(2);
  });

  it('survey inputs appear on Electrical BOS only', () => {
    expect(sectionHasInputs('Electrical BOS')).toBe(true);
    for (const c of CATEGORY_ORDER.filter((c) => c !== 'Electrical BOS')) {
      expect(sectionHasInputs(c), c).toBe(false);
    }
  });

  it('drawn geometry disables the typed input, with a reason', () => {
    expect(inputIsLive(false)).toEqual({ enabled: true });
    const routed = inputIsLive(true);
    expect(routed.enabled).toBe(false);
    expect(routed.reason).toBeTruthy(); // never disabled without saying why
  });
});

// ══════════════════════════ end-to-end through the real screen path ═════════
describe('the screen’s actions move the real quote', () => {
  const KEY = 'elec.dc_cable';
  const total = (p: Project) => bomMoney(mergedBom(p), p).total;

  it('unchecking a line reduces the total', () => {
    const p = fixtureProject(8);
    const next = { ...p, ...editBomField(p, KEY, 'included', false) } as Project;
    expect(total(next)).toBeLessThan(total(p));
    expect(rowState(mergedBom(next).find((l) => l.id === KEY)!, 12).dimmed).toBe(true);
  });

  it('↻ on that field restores both the value and the total', () => {
    const p = fixtureProject(8);
    const off = { ...p, ...editBomField(p, KEY, 'included', false) } as Project;
    const back = { ...off, ...resetBomField(off, KEY, 'included') } as Project;
    expect(total(back)).toBe(total(p));
    expect(rowState(mergedBom(back).find((l) => l.id === KEY)!, 12).dimmed).toBe(false);
  });

  it('editing one field marks exactly that field, not the line', () => {
    const p = fixtureProject(8);
    const next = { ...p, ...editBomField(p, KEY, 'unitPriceInr', 999) } as Project;
    const r = rowState(mergedBom(next).find((l) => l.id === KEY)!, 12);
    expect(r.overridden).toEqual(['unitPriceInr']);
  });

  it('every category the registry lists renders in registry order', () => {
    // the screen used to keep its own copy of this list, free to drift
    const cats = mergedBom(fixtureProject(8)).map((l) => l.category);
    const seen = CATEGORY_ORDER.filter((c) => cats.includes(c));
    const order = seen.map((c) => CATEGORY_ORDER.indexOf(c));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(seen.length).toBeGreaterThan(1);
  });

  it('section totals sum to the quote total', () => {
    const p = fixtureProject(8);
    const lines = mergedBom(p);
    const sum = CATEGORY_ORDER.map(
      (c) => sectionState(c, lines.filter((l) => l.category === c), p).total,
    ).reduce((a, b) => a + b, 0);
    // per-section rounding can differ from one global rounding by a rupee per
    // section; the pin is that no section is missing or double-counted
    expect(Math.abs(sum - total(p))).toBeLessThanOrEqual(CATEGORY_ORDER.length);
  });
});
