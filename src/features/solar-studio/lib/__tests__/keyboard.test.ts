import { describe, expect, it } from 'vitest';
import { typedInto } from '../keyboard';

describe('typedInto — the window-shortcut guard', () => {
  it('does not throw when the event target has no closest (window / document)', () => {
    // the crash this guard exists for: a `window` listener receives events
    // dispatched at `window`, whose target is not an Element at all
    expect(() => typedInto(globalThis as unknown as EventTarget)).not.toThrow();
    expect(typedInto(globalThis as unknown as EventTarget)).toBe(false);
    expect(typedInto(null)).toBe(false);
  });

  it('stands down inside a text control and stays out of the way elsewhere', () => {
    const inside = { closest: () => ({}) } as unknown as EventTarget;
    const outside = { closest: () => null } as unknown as EventTarget;
    expect(typedInto(inside)).toBe(true);
    expect(typedInto(outside)).toBe(false);
  });
});
