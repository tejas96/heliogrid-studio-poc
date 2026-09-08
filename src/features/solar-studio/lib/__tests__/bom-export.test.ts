// ─── Gates for the slice-3 audit fixes ──────────────────────────────────────
// Three defects found by auditing slice 3 against the plan rather than against
// my memory of it. Two of them were arithmetic that had gone wrong on a
// document, which is the failure class this project cares about most.
import { describe, expect, it } from 'vitest';
import { bomMoney, bomToCsv, deriveBom, mergedBom, orderQtyOf } from '../bom';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';

// The file now opens with a header block naming the project, the customer and
// the system, so the column row is no longer line 0. Find it by its first cell
// — the documented contract, and the same thing a receiving parser must do.
const parse = (csv: string) => {
  const rows = csv.split('\n').map((r) => r.match(/"((?:[^"]|"")*)"/g)!.map((c) => c.slice(1, -1).replace(/""/g, '"')));
  const at = rows.findIndex((r) => r[0] === 'Category');
  return { head: rows[at], body: rows.slice(at + 1), preamble: rows.slice(0, at) };
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

// ─── The file has to say whose job it is ────────────────────────────────────
// It used to begin at the column row: 17 columns of parts naming nothing — not
// the project, not the customer, not the site, not the capacity. Two of them on
// a purchasing clerk's desk were indistinguishable.
describe('the BOM names the job it belongs to', () => {
  const p = fixtureProject(8);
  const { preamble, head } = parse(bomToCsv(mergedBom(p), p));

  it('opens with the project and the customer, before the columns', () => {
    expect(preamble.length).toBeGreaterThan(0);
    const flat = preamble.map((r) => r.join('|')).join('\n');
    expect(flat).toContain('BILL OF MATERIALS');
    expect(flat).toContain(p.info.name);
    expect(flat).toContain('System');
    // the column row still follows, so the file stays machine-readable
    expect(head[0]).toBe('Category');
  });

  it('states no date it cannot honestly claim', () => {
    // a fresh timestamp here would assert the BOM was priced NOW, which is the
    // staleness lie the money rules forbid; the design's own stamp is the truth
    const flat = preamble.map((r) => r.join('|')).join('\n');
    expect(flat).not.toContain('Exported');
    expect(flat).not.toContain('Printed');
  });
});

// ─── The two gaps the CSV still had after the Step-9 row gained them ─────────
// Both are the same shape: a value became editable/derivable on screen and the
// file procurement actually orders from never learned about it.
describe('brand reaches the file people order from', () => {
  it('there is a Brand column', () => {
    const csv = bomToCsv(deriveBom(fixtureProject(8)), fixtureProject(8));
    expect(parse(csv).head).toContain('Brand');
  });

  it('a brand set on a line is exported', () => {
    const lines = deriveBom(fixtureProject(8));
    const withBrand = lines.map((l) =>
      l.id === 'elec.dc_cable' ? { ...l, brand: 'Polycab' } : l,
    );
    expect(bomToCsv(withBrand, fixtureProject(8))).toContain('"Polycab"');
  });

  it('a line with no brand exports empty, not "undefined"', () => {
    const csv = bomToCsv(deriveBom(fixtureProject(8)), fixtureProject(8));
    expect(csv).not.toContain('undefined');
  });
});

/**
 * Parse the CSV properly.
 *
 * `split(',')` does not work here and quietly gives a WRONG answer rather than
 * an error: `formula` routinely contains commas ("incl. 10% slack, 3 m drop"),
 * so naive splitting mangles those rows, a length check then drops them, and
 * the column sums short by most of the quote. Cost me a false failure.
 */
function parseCsv(csv: string): string[][] {
  return csv.split('\n').map((line) => {
    const cells: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') {
        cells.push(cur);
        cur = '';
      } else cur += c;
    }
    cells.push(cur);
    return cells;
  });
}

/** Sum one numeric column over the data rows (header block and NOTEs excluded). */
function sumColumn(csv: string, header: string): number {
  const all = parseCsv(csv);
  // skip the project header block — the column row is the one starting "Category"
  const at = all.findIndex((r) => r[0] === 'Category');
  expect(at, 'no Category column row').toBeGreaterThanOrEqual(0);
  const rows = all.slice(at);
  const i = rows[0].indexOf(header);
  expect(i, `no ${header} column`).toBeGreaterThanOrEqual(0);
  return rows
    .slice(1)
    .filter((r) => r[0] !== 'NOTE' && r.length === rows[0].length)
    .reduce((s, r) => s + Number(r[i]), 0);
}

describe('the discount reaches the export', () => {
  const discounted = (): Project => {
    const p = fixtureProject(8);
    return { ...p, pricing: { ...p.pricing, discount: { kind: 'percent', value: 10 } } };
  };

  it('the Total column SUMS to the quote total, not the undiscounted one', () => {
    // the actual defect: with no total row nothing was stated wrongly, but
    // adding up the column gave a number that disagreed with Step 9
    const p = discounted();
    const lines = deriveBom(p);
    const summed = sumColumn(bomToCsv(lines, p), 'Total (INR)');
    const quote = bomMoney(lines, p).total;
    // per-line rounding, so allow a rupee a line — but not the discount
    expect(Math.abs(summed - quote), `summed ${summed} vs quote ${quote}`).toBeLessThanOrEqual(
      lines.length,
    );
  });

  it('and WITHOUT the fix that sum would have been the undiscounted total', () => {
    // pins the defect: the gap is the discount, not rounding
    const p = discounted();
    const lines = deriveBom(p);
    const undiscounted = bomMoney(lines, { ...p, pricing: { marginPct: p.pricing.marginPct } });
    const summed = sumColumn(bomToCsv(lines, p), 'Total (INR)');
    expect(undiscounted.total - summed).toBeGreaterThan(1000);
  });

  it('the supplier cost is NOT discounted — Amount still sums to subtotal', () => {
    // you still pay the supplier full price; only the quote moves
    const p = discounted();
    const lines = deriveBom(p);
    const plain = bomToCsv(lines, { ...p, pricing: { marginPct: p.pricing.marginPct } });
    const cut = bomToCsv(lines, p);
    expect(sumColumn(cut, 'Amount (INR)')).toBe(sumColumn(plain, 'Amount (INR)'));
  });

  it('says a discount was applied rather than quietly repricing every row', () => {
    const csv = bomToCsv(deriveBom(discounted()), discounted());
    expect(csv).toMatch(/"NOTE","DISCOUNT 10%/);
    expect(csv).toMatch(/NOT discounted/);
  });

  it('an undiscounted quote gains no note and no change', () => {
    const p = fixtureProject(8);
    const csv = bomToCsv(deriveBom(p), p);
    expect(csv).not.toContain('DISCOUNT');
  });
});
