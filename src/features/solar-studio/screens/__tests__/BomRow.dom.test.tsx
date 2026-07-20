// @vitest-environment jsdom
// ─── DOM gates for the Step-9 row ───────────────────────────────────────────
// These are the Phase-22f gates I shipped "verified by hand" because there was
// no harness: unchecking a line greys it and drops it out of the total, ↻
// restores auto, and the derivation is reachable by assistive tech rather than
// being a hover-only tooltip.
//
// The last one matters most. `formula` is the traceability story of this whole
// product — where every number came from — and before 22f it lived in a
// `data-tip` attribute, which is invisible to a screen reader. A sighted mouse
// user could audit the quote and nobody else could.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BomRow } from '../Step9Bom/BomRow';
import type { BomLine } from '../../types';

afterEach(cleanup);

const mk = (over: Partial<BomLine> = {}): BomLine => ({
  id: 'elec.dc_cable',
  category: 'Electrical BOS',
  item: 'DC Solar Cable',
  spec: '4 sq.mm Cu',
  qty: 100,
  unit: 'm',
  unitPriceInr: 68,
  formula: 'Routed home runs 83 m (incl. 10% slack)',
  confidence: 'derived',
  auto: true,
  overridden: false,
  included: true,
  wastePct: 8,
  gstPct: 5,
  ...over,
});

const renderRow = (line: BomLine, handlers: Partial<Parameters<typeof BomRow>[0]> = {}) =>
  render(
    <table>
      <tbody>
        <BomRow
          line={line}
          marginPct={12}
          onEdit={handlers.onEdit ?? vi.fn()}
          onReset={handlers.onReset ?? vi.fn()}
          onRemove={handlers.onRemove}
        />
      </tbody>
    </table>,
  );

describe('include / exclude', () => {
  it('unchecking asks to exclude the line', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderRow(mk(), { onEdit });

    await user.click(screen.getByLabelText(/Include DC Solar Cable/i));
    expect(onEdit).toHaveBeenCalledWith('included', false);
  });

  it('an excluded row is GREYED, not removed — the scope is still visible', () => {
    const { container } = renderRow(mk({ included: false }));
    const row = container.querySelector('tr')!;
    expect(Number(row.style.opacity)).toBeLessThan(1);
  });

  it('an excluded row contributes zero, and says so to a screen reader', () => {
    renderRow(mk({ included: false }));
    expect(screen.getByText(/Excluded from the quote/i)).toBeDefined();
  });

  it('an excluded row still shows its order qty — the figure is not hidden', () => {
    renderRow(mk({ included: false }));
    expect(screen.getByText('108')).toBeDefined(); // 100 + 8% waste
  });
});

describe('order quantity', () => {
  it('shows what to BUY, not just what the design needs', () => {
    renderRow(mk({ qty: 100, wastePct: 8 }));
    expect(screen.getByText('108')).toBeDefined();
  });

  it('a discrete unit is a whole number — you cannot order 0.15 of a module', () => {
    renderRow(mk({ qty: 115, wastePct: 1, unit: 'Nos' }));
    expect(screen.getByText('117')).toBeDefined();
  });
});

describe('per-field reset', () => {
  it('↻ appears only for a field the user actually edited', () => {
    renderRow(mk({ overriddenFields: ['qty'] }));
    expect(screen.getByLabelText(/Reset qty of DC Solar Cable/i)).toBeDefined();
    expect(screen.queryByLabelText(/Reset unitPriceInr/i)).toBeNull();
  });

  it('clicking ↻ resets that field', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    renderRow(mk({ overriddenFields: ['qty'] }), { onReset });

    await user.click(screen.getByLabelText(/Reset qty of DC Solar Cable/i));
    expect(onReset).toHaveBeenCalledWith('qty');
  });

  it('`included` has a ↻ like every other field', () => {
    // it did not, at first. Re-ticking the box writes a NEW override equal to
    // the derived value, so without this the line reads as hand-edited forever
    // and never tracks the design again.
    renderRow(mk({ overriddenFields: ['included'] }));
    expect(screen.getByLabelText(/Reset included of DC Solar Cable/i)).toBeDefined();
  });
});

describe('accessibility of the traceability story', () => {
  it('the derivation is an accessible NAME, not a hover-only tooltip', () => {
    renderRow(mk());
    const btn = screen.getByLabelText(/Derivation of DC Solar Cable/i);
    expect(btn.getAttribute('aria-label')).toContain('Routed home runs 83 m');
  });

  it('the confidence dot is decorative; its meaning is in text', () => {
    renderRow(mk({ confidence: 'assumed' }));
    // colour must not be the only carrier of meaning
    expect(screen.getByText(/Assumed —/i)).toBeDefined();
  });

  it('every editable cell is labelled', () => {
    renderRow(mk());
    for (const label of [
      /Quantity of/i,
      /Waste allowance for/i,
      /Unit rate of/i,
      /GST rate for/i,
      // spec, brand and unit joined the row late — they were overridable in the
      // data model long before they were reachable on screen
      /Spec of/i,
      /Brand of/i,
      /Unit of/i,
    ]) {
      expect(screen.getByLabelText(label)).toBeDefined();
    }
  });
});

describe('spec, brand and unit are editable (was: static text)', () => {
  it('spec commits an edit', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderRow(mk(), { onEdit });
    const input = screen.getByLabelText(/Spec of DC Solar Cable/i);
    await user.clear(input);
    await user.type(input, '6 sq.mm Cu');
    await user.tab(); // TextField commits on blur, so a rename is ONE undo step
    expect(onEdit).toHaveBeenCalledWith('spec', '6 sq.mm Cu');
  });

  it('brand starts empty with a placeholder — no emitter sets it', () => {
    renderRow(mk());
    const input = screen.getByLabelText(/Brand of DC Solar Cable/i) as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('Brand');
  });

  it('brand commits an edit', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderRow(mk(), { onEdit });
    await user.type(screen.getByLabelText(/Brand of DC Solar Cable/i), 'Polycab');
    await user.tab();
    expect(onEdit).toHaveBeenCalledWith('brand', 'Polycab');
  });

  it('unit is a constrained select, not free text', () => {
    renderRow(mk());
    const sel = screen.getByLabelText(/Unit of DC Solar Cable/i) as HTMLSelectElement;
    expect(sel.tagName).toBe('SELECT');
    expect(sel.value).toBe('m');
    // the trap this closes: a typed "pcs" would silently stop order-qty ceiling
    expect([...sel.options].map((o) => o.value)).toContain('nos');
    expect([...sel.options].map((o) => o.value)).not.toContain('pcs');
  });

  it('unit commits an edit', async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    renderRow(mk(), { onEdit });
    await user.selectOptions(screen.getByLabelText(/Unit of DC Solar Cable/i), 'kg');
    expect(onEdit).toHaveBeenCalledWith('unit', 'kg');
  });

  it('a unit the list does not offer is preserved, not silently rewritten', () => {
    // an older project, or a hand-made line, may hold a unit we no longer offer.
    // Rendering a select that cannot represent it would rewrite the value to
    // whatever happened to be first the moment anything re-rendered.
    renderRow(mk({ unit: 'furlong' }));
    const sel = screen.getByLabelText(/Unit of DC Solar Cable/i) as HTMLSelectElement;
    expect(sel.value).toBe('furlong');
    expect([...sel.options].map((o) => o.value)).toContain('furlong');
  });
});

describe('custom lines', () => {
  it('a custom line can be renamed; a derived one cannot', () => {
    renderRow(mk({ auto: false, item: 'Crane hire' }));
    expect(screen.getByLabelText(/Name of Crane hire/i)).toBeDefined();

    cleanup();
    renderRow(mk({ auto: true }));
    expect(screen.queryByLabelText(/Name of/i)).toBeNull();
  });

  it('only a custom line offers removal', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    renderRow(mk({ auto: false, item: 'Crane hire' }), { onRemove });
    await user.click(screen.getByLabelText(/Remove Crane hire/i));
    expect(onRemove).toHaveBeenCalled();
  });
});
