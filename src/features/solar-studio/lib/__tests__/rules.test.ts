import { describe, expect, it } from 'vitest';
import { INDIA_RULES, resolveRules } from '../../data/rules/india';

// The rule config is the extraction target of previously-inlined constants.
// This snapshot pins the exact values so an accidental edit is caught — any
// intentional market change must update this test alongside the config.
describe('India rule config (extraction snapshot)', () => {
  it('resolveRules returns the India config', () => {
    expect(resolveRules()).toBe(INDIA_RULES);
  });

  it('DC sizing matches the pre-extraction constants', () => {
    expect(INDIA_RULES.dcSizing.fuseFactor).toBeCloseTo(1.56, 10);
    expect(INDIA_RULES.dcSizing.fuseLadder).toEqual([10, 12, 15, 20, 25, 30, 32, 40, 50, 63]);
    expect(INDIA_RULES.dcSizing.isolatorLadder).toEqual([16, 25, 32, 40, 63, 80, 100, 125]);
    expect(INDIA_RULES.dcSizing.cableAmpacity).toEqual([
      [4, 32],
      [6, 42],
      [10, 57],
    ]);
  });

  it('AC sizing: one breaker ladder for BOM and SLD, extending into MCCB frames', () => {
    expect(INDIA_RULES.acSizing.breakerFactor).toBe(1.25);
    expect(INDIA_RULES.acSizing.breakerLadder).toEqual([
      16, 25, 32, 40, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630,
    ]);
    // ascending, so nextInLadder semantics hold
    const l = INDIA_RULES.acSizing.breakerLadder;
    expect([...l].sort((a, b) => a - b)).toEqual(l);
  });

  it('subsidy slabs match PM Surya Ghar values', () => {
    expect(INDIA_RULES.subsidy).toEqual({
      firstSlabPerKwInr: 30000,
      firstSlabKw: 2,
      secondSlabPerKwInr: 18000,
      capInr: 78000,
      capKw: 3,
      requiresDcr: true,
    });
  });

  it('defaults match the pre-extraction inline values', () => {
    expect(INDIA_RULES.defaults).toEqual({
      roofSetbackM: 0.3,
      tariffUnknownStateInrPerKwh: 7.5,
      tariffNewProjectInrPerKwh: 8,
      planLimitKw: 10,
      // Phase 20 (ground mount). Both ASSUMED — no Indian standard fixes a
      // free-field boundary offset, and optimal tilt is site/latitude specific.
      groundSetbackM: 1.5,
      groundTiltDeg: 20,
      groundFenceEnabled: true,
      groundGatesPerArea: 1,
      cleaningReachM: 6,
      ladderEdgeM: 2.5,
      inverterClearanceM: 0.9,
    });
  });
});
