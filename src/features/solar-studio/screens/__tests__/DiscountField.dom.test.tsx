// @vitest-environment jsdom
// ─── DOM gate for the discount control ──────────────────────────────────────
// The bug this exists for was not in the arithmetic — the money tests all
// passed while it was live. It was in the CONTROL: at value 0 the rule is
// deleted, so the kind had nowhere to live, and picking "₹" on an empty field
// snapped silently back to "%". The next number typed was then read as a
// percentage: 50000 meaning ₹50,000 became a 50000% discount, clamped to the
// whole quote, so the total quietly went to zero.
//
// Found by driving the control in a browser, not by reading it. These pin the
// sequence a real user performs — choose the unit, THEN type the number.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DiscountField } from '../Step9Bom/DiscountField';
import type { QuoteDiscount } from '../../types';

afterEach(cleanup);

describe('choosing the unit before typing the number', () => {
  it('₹ picked on an EMPTY field survives, so the next number is rupees', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscountField discount={undefined} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText(/percentage or a rupee/i), 'amount');
    // nothing stored yet — value is still 0, so the rule stays deleted
    expect(onChange).toHaveBeenLastCalledWith(undefined);

    await user.type(screen.getByLabelText(/Discount value/i), '50000');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'amount', value: 50000 });
  });

  it('the select still SHOWS ₹ after the empty-field round trip', async () => {
    const user = userEvent.setup();
    render(<DiscountField discount={undefined} onChange={vi.fn()} />);
    const sel = screen.getByLabelText(/percentage or a rupee/i) as HTMLSelectElement;
    await user.selectOptions(sel, 'amount');
    expect(sel.value).toBe('amount');
  });

  it('percent remains the default for a project with no discount', () => {
    render(<DiscountField discount={undefined} onChange={vi.fn()} />);
    expect((screen.getByLabelText(/percentage or a rupee/i) as HTMLSelectElement).value).toBe(
      'percent',
    );
  });
});

describe('the stored rule', () => {
  it('seeds the control from what the project already holds', () => {
    const d: QuoteDiscount = { kind: 'amount', value: 25000 };
    render(<DiscountField discount={d} onChange={vi.fn()} />);
    expect((screen.getByLabelText(/percentage or a rupee/i) as HTMLSelectElement).value).toBe(
      'amount',
    );
    expect((screen.getByLabelText(/Discount value/i) as HTMLInputElement).value).toBe('25000');
  });

  it('switching unit RE-COMMITS the existing value under the new kind', async () => {
    // 5% and ₹5 are different deductions; leaving the old rule would show "₹"
    // beside a figure still being applied as a percentage
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscountField discount={{ kind: 'percent', value: 5 }} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText(/percentage or a rupee/i), 'amount');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'amount', value: 5 });
  });

  it('zero REMOVES the rule rather than storing a zero', async () => {
    // the lazy-field contract: a project that never discounts must serialize
    // byte-identically to one that discounted and went back to nothing
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DiscountField discount={{ kind: 'percent', value: 10 }} onChange={onChange} />);
    const input = screen.getByLabelText(/Discount value/i);
    await user.clear(input);
    await user.type(input, '0');
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe('accessibility', () => {
  it('both controls are named', () => {
    render(<DiscountField discount={undefined} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Discount value/i)).toBeDefined();
    expect(screen.getByLabelText(/percentage or a rupee/i)).toBeDefined();
  });
});
