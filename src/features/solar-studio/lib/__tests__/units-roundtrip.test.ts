// ─── Gate: the display→stored return trip (E19) ─────────────────────────────
// Every other helper in units.ts is one-way, because most lengths are printed
// and never typed. `lenToM` is the first inverse, and an inverse is where a
// units bug actually costs something: get it wrong and an imperial user's
// "100 ft" is stored as 100 METERS — a 3.28× error that looks plausible on
// screen and only surfaces as a cable order three times too long.
import { describe, expect, it } from 'vitest';
import { M_TO_FT, lenToM, lenValue } from '../units';

describe('lenToM', () => {
  it('metric is the identity — no conversion, no rounding drift', () => {
    for (const v of [0, 1, 12.5, 47.83, 2000]) {
      expect(lenToM(v, 'metric')).toBe(v);
    }
  });

  it('imperial divides — 100 ft is 30.48 m, not 100 m', () => {
    expect(lenToM(100, 'imperial')).toBeCloseTo(30.48, 3);
  });

  it('zero converts to zero in both systems', () => {
    expect(lenToM(0, 'imperial')).toBe(0);
    expect(lenToM(0, 'metric')).toBe(0);
  });
});

describe('the round trip a user actually performs', () => {
  // type a number → store → the box redraws from storage. If these disagree
  // the value visibly changes after committing, which reads as data loss.
  it('typed feet survive the trip back to the box', () => {
    for (const typed of [10, 33, 100, 164.04, 6561.68]) {
      const stored = lenToM(typed, 'imperial');
      expect(Number(lenValue(stored, 'imperial'))).toBeCloseTo(typed, 2);
    }
  });

  it('typed metres survive the trip back to the box', () => {
    for (const typed of [10, 33, 100, 47.5, 2000]) {
      const stored = lenToM(typed, 'metric');
      expect(Number(lenValue(stored, 'metric'))).toBeCloseTo(typed, 2);
    }
  });

  it('storage is rounded, so switching systems twice does not accumulate dust', () => {
    // metric value → shown as feet → committed back → must be the same number,
    // not 30.479999999999997. Float dust here would churn the fingerprint and
    // stale captures on a project nobody edited.
    const original = 30.48;
    const asFeet = Number(lenValue(original, 'imperial'));
    const back = lenToM(asFeet, 'imperial');
    expect(back).toBe(30.48);
  });

  it('the stored value never carries more than 0.1 mm of precision', () => {
    const stored = lenToM(137.79, 'imperial');
    expect(stored).toBe(Math.round(stored * 1e4) / 1e4);
  });
});

describe('the ceiling converts with the value', () => {
  // the input caps at 2000 STORED metres; left unconverted the imperial user
  // would be stopped at 2000 ft = 610 m, a limit nobody chose
  it('2000 m presented in feet is well past 2000', () => {
    const maxInFeet = Number(lenValue(2000, 'imperial'));
    expect(maxInFeet).toBeCloseTo(2000 * M_TO_FT, 1);
    expect(maxInFeet).toBeGreaterThan(6000);
  });

  it('a value typed at the imperial ceiling stores as the metric ceiling', () => {
    expect(lenToM(Number(lenValue(2000, 'imperial')), 'imperial')).toBeCloseTo(2000, 2);
  });
});
