// ─── Gates for the slice-3 audit fixes ──────────────────────────────────────
// Three defects found by auditing slice 3 against the plan rather than against
// my memory of it. Two of them were arithmetic that had gone wrong on a
// document, which is the failure class this project cares about most.
import { describe, expect, it } from 'vitest';
import { bomMoney, bomToCsv, mergedBom, orderQtyOf } from '../bom';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';

const parse = (csv: string) => {
  const rows = csv.split('\n').map((r) => r.match(/"((?:[^"]|"")*)"/g)!.map((c) => c.slice(1, -1).replace(/""/g, '"')));
  return { head: rows[0], body: rows.slice(1) };
};

describe('CSV is the file a purchase order is raised from', () => {
  const project = fixtureProject(8);
  const lines = mergedBom(project);
  const { head, body } = parse(bomToCsv(lines, project));

  it('carries ORDER qty, not just the design qty', () => {
    // exporting `qty` alone hands procurement a number short by the waste
    // allowance on every cable and steel line
    expect(head).toContain('Order Qty');
    expect(head).toContain('Waste %');

    const cable = body.find((r) => r[1] === 'DC Solar Cable')!;
    const line = lines.find((l) => l.id === 'elec.dc_cable')!;
    expect(Number(cable[head.indexOf('Qty')])).toBe(line.qty);
    expect(Number(cable[head.indexOf('Order Qty')])).toBe(orderQtyOf(line));
    expect(orderQtyOf(line)).toBeGreaterThan(line.qty); // waste is real here
  });

  it('carries the tax columns the quote is actually built from', () => {
    expect(head).toContain('GST %');
    expect(head).toContain('GST (INR)');
    expect(head).toContain('Total (INR)');
    expect(head.some((h) => h.includes('margin'))).toBe(true);
  });

  it('the exported totals sum to the quote total', () => {
    const total = head.indexOf('Total (INR)');
    const sum = body
      .filter((r) => r[0] !== 'NOTE')
      .reduce((s, r) => s + Number(r[total]), 0);
    expect(Math.abs(sum - bomMoney(lines, project).total)).toBeLessThanOrEqual(body.length);
  });

  it('says plainly when a line is NOT being supplied', () => {
    const p2 = {
      ...project,
      bom: {
        overrides: [{ lineKey: 'elec.dc_cable', fields: { included: { value: false, autoAtEdit: true } } }],
        custom: [],
      },
    } as Project;
    const t = parse(bomToCsv(mergedBom(p2), p2));
    const cable = t.body.find((r) => r[1] === 'DC Solar Cable')!;
    expect(cable[t.head.indexOf('Included')]).toContain('NO');
    expect(Number(cable[t.head.indexOf('Total (INR)')])).toBe(0);
    // …but the quantity is still stated, so the reader knows the scope exists
    expect(Number(cable[t.head.indexOf('Order Qty')])).toBeGreaterThan(0);
  });

  it('the NOTE rows still line up with the header', () => {
    const structured = parse(bomToCsv(lines, project));
    for (const r of structured.body.filter((x) => x[0] === 'NOTE')) {
      expect(r.length).toBe(structured.head.length);
    }
  });

  it('without a project it falls back to zero margin and SAYS so', () => {
    // silently printing cost as though it were price is the failure to avoid
    expect(parse(bomToCsv(lines)).head.join(',')).toContain('0% margin');
  });
});

describe('the proposal’s engineering breakdown is arithmetically true', () => {
  // It printed "subtotal + margin% = systemCost", which held until GST went
  // per-line — after which the stated sum was short by exactly the tax.
  it('cost → margin → taxable → GST → total actually reconciles', () => {
    const p = fixtureProject(8);
    const m = bomMoney(mergedBom(p), p);

    expect(m.taxable + m.gst).toBe(m.total);
    // and the old two-term claim does NOT reconcile — the reason for the change
    expect(Math.round(m.subtotal * (1 + p.pricing.marginPct / 100))).not.toBe(m.total);
  });

  it('the gap is exactly the GST, not a rounding artefact', () => {
    const p = fixtureProject(8);
    const m = bomMoney(mergedBom(p), p);
    const oldClaim = Math.round(m.subtotal * (1 + p.pricing.marginPct / 100));
    expect(Math.abs(m.total - oldClaim - m.gst)).toBeLessThanOrEqual(2);
  });
});
