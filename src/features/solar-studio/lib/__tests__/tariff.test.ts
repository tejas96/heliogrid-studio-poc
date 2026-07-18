// ─── Per-DISCOM / category tariff lookup (Phase 12 · task 31c) ──────────────
import { describe, expect, it } from 'vitest';
import { tariffFor, tariffForState } from '../../data/discoms';

describe('tariffFor — most-specific-first resolution', () => {
  it('a DISCOM override beats the state average', () => {
    // Mumbai licensees run above the MSEDCL/Maharashtra state rate
    expect(tariffFor('Maharashtra', 'Tata Power Mumbai', 'residential')).toBeGreaterThan(
      tariffFor('Maharashtra', 'MSEDCL', 'residential'), // MSEDCL not overridden ⇒ state rate
    );
  });

  it('falls back to the state rate when the DISCOM has no override', () => {
    // MSEDCL isn't in the per-DISCOM table ⇒ resolves to the Maharashtra rate
    expect(tariffFor('Maharashtra', 'MSEDCL', 'residential')).toBe(
      tariffFor('Maharashtra', '', 'residential'),
    );
  });

  it('commercial is always dearer than residential (same state/DISCOM)', () => {
    for (const [state, discom] of [['Maharashtra', ''], ['Gujarat', ''], ['Delhi', 'BSES Rajdhani']] as const) {
      expect(tariffFor(state, discom, 'commercial')).toBeGreaterThan(
        tariffFor(state, discom, 'residential'),
      );
    }
  });

  it('an unknown state falls back to the default (commercial scaled up)', () => {
    const res = tariffFor('Nowhere', '', 'residential');
    const com = tariffFor('Nowhere', '', 'commercial');
    expect(res).toBeGreaterThan(0);
    expect(com).toBeGreaterThan(res);
  });

  it('tariffForState stays back-compatible (residential-by-state)', () => {
    expect(tariffForState('Maharashtra')).toBe(tariffFor('Maharashtra', '', 'residential'));
  });
});
