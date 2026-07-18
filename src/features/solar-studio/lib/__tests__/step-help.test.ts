import { describe, expect, it } from 'vitest';
import { STEP_HELP, STEP_NAMES } from '../../screens/Wizard';

// The Help button reads STEP_HELP[step - 1]. If the two lists ever drift, the
// sheet silently describes the WRONG step — the exact class of quiet-wrong-UI
// the honesty audit targets, so it is pinned here rather than left to review.
describe('wizard step help', () => {
  it('covers every step, one entry each', () => {
    expect(STEP_HELP).toHaveLength(STEP_NAMES.length);
  });

  it('every step says what it is for', () => {
    for (const [i, h] of STEP_HELP.entries()) {
      expect(h.does.length, `step ${i + 1} has no description`).toBeGreaterThan(20);
    }
  });

  it('every step offers at least one concrete tip', () => {
    for (const [i, h] of STEP_HELP.entries()) {
      expect(h.tips.length, `step ${i + 1} has no tips`).toBeGreaterThan(0);
      for (const t of h.tips) expect(t.trim()).not.toBe('');
    }
  });

  it('the manual-edit step documents the keyboard shortcuts (they have no other home)', () => {
    const step6 = STEP_HELP[5].tips.join(' ');
    for (const key of ['Arrow', 'Shift', 'K no-build zone', 'V select'])
      expect(step6).toContain(key);
  });
});
