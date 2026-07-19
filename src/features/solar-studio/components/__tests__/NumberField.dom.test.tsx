// @vitest-environment jsdom
// ─── DOM gate: NumberField commits ONCE ─────────────────────────────────────
// This was a named gate in the Phase-22f plan — "a number field produces
// exactly one patchProject on blur" — and I shipped it verified by hand,
// because there was no DOM harness. Hand-verification is where I have made
// every mistake this project has seen, so the gate is now a test.
//
// The environment is opted into per FILE rather than globally: the other 1456
// tests are pure and run far faster under node, and several of the shading
// ones are heavy enough that a global jsdom would hurt.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NumberField } from '../ui';

afterEach(cleanup);

describe('NumberField commits once, on blur', () => {
  it('typing four digits produces ONE commit, not four', async () => {
    // the whole reason this component exists: the inputs it replaced patched
    // the project on every keystroke, so typing "1250" wrote four revisions
    // and four undo entries — three of them numbers nobody meant
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<NumberField value={0} onCommit={onCommit} ariaLabel="Rate" />);

    const input = screen.getByLabelText('Rate');
    await user.clear(input);
    await user.type(input, '1250');
    expect(onCommit).not.toHaveBeenCalled(); // nothing while typing

    await user.tab(); // blur
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(1250);
  });

  it('Enter commits without also firing on the blur it triggers', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<NumberField value={10} onCommit={onCommit} ariaLabel="Rate" />);

    await user.clear(screen.getByLabelText('Rate'));
    await user.type(screen.getByLabelText('Rate'), '42{Enter}');
    // Enter blurs, and blur commits — if Enter ALSO committed this would be 2
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(42);
  });

  it('Escape abandons the edit — no commit, value restored', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<NumberField value={7} onCommit={onCommit} ariaLabel="Rate" />);

    const input = screen.getByLabelText('Rate') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '999{Escape}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('7');
  });

  it('re-typing the same value is not an edit', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<NumberField value={42} onCommit={onCommit} ariaLabel="Rate" />);

    await user.clear(screen.getByLabelText('Rate'));
    await user.type(screen.getByLabelText('Rate'), '42');
    await user.tab();
    // visiting a field and leaving it alone must not push an undo entry
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('emptying the box CLEARS — it does not commit zero', async () => {
    // ₹0 is a price you can quote; "no value" is not. Conflating them turns an
    // abandoned edit into a free line item.
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<NumberField value={42} onCommit={onCommit} ariaLabel="Rate" />);

    await user.clear(screen.getByLabelText('Rate'));
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(undefined);
  });

  it('clamps to the allowed range', async () => {
    const onCommit = vi.fn();
    const user = userEvent.setup();
    render(<NumberField value={5} onCommit={onCommit} min={0} max={100} ariaLabel="Pct" />);

    await user.clear(screen.getByLabelText('Pct'));
    await user.type(screen.getByLabelText('Pct'), '999');
    await user.tab();
    expect(onCommit).toHaveBeenCalledWith(100);
  });

  it('is reachable and labelled for assistive tech', async () => {
    render(<NumberField value={1} onCommit={vi.fn()} ariaLabel="Waste allowance" />);
    const input = screen.getByLabelText('Waste allowance');
    expect(input).toBeDefined();
    expect(input.getAttribute('type')).toBe('number');
  });
});
