// ─── Phase 22a gates: foundation geometry, volume and the height contract ───
import { describe, expect, it } from 'vitest';
import {
  foundationAssembly,
  foundationDeadLoadKg,
  foundationTooTall,
  foundationVolumeM3,
  legAboveFoundationM,
  ruleFor,
} from '../foundation';
import { resolveRules } from '../../data/rules/india';

describe('D14 — volume follows the SHAPE, not a hardcoded box', () => {
  it('square uses l × w × h', () => {
    const v = foundationVolumeM3({ shape: 'square', l: 300, w: 300, heightMm: 150, plateMm: 160, plateThkMm: 10 });
    expect(v).toBeCloseTo(0.3 * 0.3 * 0.15, 9); // 0.0135 m³
  });

  it('circular uses π (d/2)² h', () => {
    const v = foundationVolumeM3({ shape: 'circular', d: 300, heightMm: 150, plateMm: 160, plateThkMm: 10 });
    expect(v).toBeCloseTo(Math.PI * 0.15 ** 2 * 0.15, 9);
  });

  // The whole reason shape had to become a parameter: same nominal size, 21%
  // less concrete. Quoting one for the other under-buys and under-reports load.
  it('a circular pedestal is materially lighter than a square one of the same nominal size', () => {
    const sq = foundationVolumeM3({ shape: 'square', l: 300, w: 300, heightMm: 150, plateMm: 160, plateThkMm: 10 });
    const ci = foundationVolumeM3({ shape: 'circular', d: 300, heightMm: 150, plateMm: 160, plateThkMm: 10 });
    expect(ci / sq).toBeCloseTo(Math.PI / 4, 6);
    expect(1 - ci / sq).toBeGreaterThan(0.2);
  });

  it('a zero-height foundation encloses no concrete', () => {
    expect(foundationVolumeM3(ruleFor('anchor'))).toBe(0);
  });
});

describe('dead load — the figure the DRC warning reports', () => {
  it('pedestal mass is volume × concrete density', () => {
    const { concreteDensityKgM3 } = resolveRules().foundations;
    const expected = foundationVolumeM3(ruleFor('concrete')) * concreteDensityKgM3;
    expect(foundationDeadLoadKg('concrete')).toBeCloseTo(expected, 9);
  });

  it('the default pedestal is ~32 kg, so 30 legs is ~1 tonne', () => {
    const each = foundationDeadLoadKg('concrete');
    expect(each).toBeGreaterThan(28);
    expect(each).toBeLessThan(36);
    expect(each * 30).toBeGreaterThan(900); // the number the warning must carry
  });

  it('a chemical anchor adds nothing — it is a plate, not a mass', () => {
    expect(foundationDeadLoadKg('anchor')).toBe(0);
  });

  it('a driven pile adds no ROOF load — it is founded in the ground', () => {
    expect(foundationDeadLoadKg('pile')).toBe(0);
  });

  it('ballast is reported as a count with a mass, never as a required mass', () => {
    // We may state what a block weighs; we must never compute what it NEEDS to
    // weigh — that is wind-tunnel territory we deliberately do not enter (§F).
    expect(foundationDeadLoadKg('ballast')).toBeGreaterThan(0);
  });
});

describe('D15 — the foundation consumes clearance; the module plane never moves', () => {
  it('a 150 mm pedestal shortens the steel leg by exactly 150 mm', () => {
    expect(legAboveFoundationM(0.3, 'concrete')).toBeCloseTo(0.15, 9);
  });

  it('a chemical anchor leaves the full leg', () => {
    expect(legAboveFoundationM(0.3, 'anchor')).toBeCloseTo(0.3, 9);
  });

  // THE invariant that protects every existing project: switching foundation
  // kind must not raise or lower the modules, because that would change shading
  // geometry, change energy, and stale every stored capture.
  it('leg + foundation height is the same total for every kind', () => {
    const frontLegM = 0.6;
    for (const kind of ['anchor', 'concrete', 'ballast'] as const) {
      const total = legAboveFoundationM(frontLegM, kind) + ruleFor(kind).heightMm / 1000;
      expect(total, `${kind} must preserve the module plane`).toBeCloseTo(frontLegM, 9);
    }
  });

  it('walk-under clearance still means what it says', () => {
    expect(legAboveFoundationM(2.2, 'concrete') + 0.15).toBeCloseTo(2.2, 9);
  });

  it('flags — not silently clamps — a foundation taller than its clearance', () => {
    expect(foundationTooTall(0.3, 'concrete')).toBe(false);
    expect(foundationTooTall(0.15, 'concrete')).toBe(true); // nothing left to build
    expect(foundationTooTall(0.18, 'concrete')).toBe(true); // below the 50 mm floor
    expect(foundationTooTall(0.3, 'anchor')).toBe(false);
  });
});

describe('assemblies are complete and buildable', () => {
  it('a pedestal carries block + grout + plate + four bolts', () => {
    const a = foundationAssembly('concrete');
    const buckets = a.parts.map((p) => p.bucket);
    expect(buckets).toContain('pedestal');
    expect(buckets).toContain('grout');
    expect(buckets).toContain('plate');
    expect(buckets.filter((b) => b === 'bolt')).toHaveLength(4);
    expect(a.concreteM3).toBeGreaterThan(0);
  });

  it('a chemical anchor is plate + bolts only — nothing cast', () => {
    const a = foundationAssembly('anchor');
    const buckets = a.parts.map((p) => p.bucket);
    expect(buckets).toContain('plate');
    expect(buckets.filter((b) => b === 'bolt')).toHaveLength(4);
    expect(buckets).not.toContain('pedestal');
    expect(buckets).not.toContain('grout');
    expect(a.concreteM3).toBe(0);
  });

  it('a ballast block does not penetrate — no bolts', () => {
    const a = foundationAssembly('ballast');
    expect(a.parts.map((p) => p.bucket)).not.toContain('bolt');
    expect(a.parts.map((p) => p.bucket)).toContain('ballast');
  });

  it('a pile is a single cylinder spanning embedment to plate', () => {
    const a = foundationAssembly('pile');
    const pile = a.parts.find((p) => p.bucket === 'pile')!;
    expect(pile.geometry).toBe('cylinder');
    const embed = ruleFor('pile').embedMm! / 1000;
    expect(pile.size.y).toBeCloseTo(embed + ruleFor('pile').heightMm / 1000, 9);
    expect(pile.offset.y - pile.size.y / 2).toBeLessThan(0); // reaches below grade
  });

  it('every part has finite, positive size', () => {
    for (const kind of ['anchor', 'concrete', 'ballast', 'pile'] as const) {
      for (const p of foundationAssembly(kind).parts) {
        for (const ax of ['x', 'y', 'z'] as const) {
          expect(Number.isFinite(p.size[ax])).toBe(true);
          expect(p.size[ax], `${kind}/${p.bucket}.${ax}`).toBeGreaterThan(0);
          expect(Number.isFinite(p.offset[ax])).toBe(true);
        }
      }
    }
  });

  it('nothing in the assembly dips below the deck except a pile', () => {
    for (const kind of ['anchor', 'concrete', 'ballast'] as const) {
      for (const p of foundationAssembly(kind).parts) {
        expect(p.offset.y - p.size.y / 2, `${kind}/${p.bucket}`).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });
});

// ─── D14 end-to-end: the SHAPE choice reaches geometry, mass and quote ──────
describe('D14 wiring — shape is a real quantity decision, not a label', () => {
  it('ruleFor honours a shape override for a CAST pedestal', () => {
    const sq = ruleFor('concrete', 'square');
    const ci = ruleFor('concrete', 'circular');
    expect(sq.shape).toBe('square');
    expect(ci.shape).toBe('circular');
    // "same size, round shuttering" — the plan dimension carries across
    expect(ci.d).toBe(sq.l);
    expect(ci.heightMm).toBe(sq.heightMm);
  });

  it('the override changes concrete volume by exactly π/4', () => {
    const sq = foundationVolumeM3(ruleFor('concrete', 'square'));
    const ci = foundationVolumeM3(ruleFor('concrete', 'circular'));
    expect(ci / sq).toBeCloseTo(Math.PI / 4, 6);
  });

  it('…and therefore the reported dead load too', () => {
    const sq = foundationDeadLoadKg('concrete', 'square');
    const ci = foundationDeadLoadKg('concrete', 'circular');
    expect(ci).toBeLessThan(sq);
    expect(ci / sq).toBeCloseTo(Math.PI / 4, 6);
  });

  it('the drawn assembly follows the shape', () => {
    const sq = foundationAssembly('concrete', 'square').parts.find((p) => p.bucket === 'pedestal')!;
    const ci = foundationAssembly('concrete', 'circular').parts.find((p) => p.bucket === 'pedestal')!;
    expect(sq.geometry).toBe('box');
    expect(ci.geometry).toBe('cylinder');
  });

  // NEGATIVE: kinds that cannot be formed round must ignore the override
  // rather than silently render something unbuildable.
  it('ballast and pile IGNORE a shape override', () => {
    expect(ruleFor('ballast', 'circular').shape).toBe(ruleFor('ballast').shape);
    expect(ruleFor('pile', 'square').shape).toBe(ruleFor('pile').shape);
    expect(foundationDeadLoadKg('ballast', 'circular')).toBe(foundationDeadLoadKg('ballast'));
  });

  it('an anchor has no body, so shape cannot change its (zero) load', () => {
    expect(foundationDeadLoadKg('anchor', 'circular')).toBe(0);
    expect(foundationDeadLoadKg('anchor', 'square')).toBe(0);
  });

  it('EDGE: passing the shape it already is changes nothing', () => {
    const base = ruleFor('concrete');
    expect(ruleFor('concrete', base.shape)).toEqual(base);
  });

  it('EDGE: shape never affects HEIGHT, so the module plane cannot move', () => {
    expect(ruleFor('concrete', 'circular').heightMm).toBe(ruleFor('concrete', 'square').heightMm);
    expect(legAboveFoundationM(0.3, 'concrete')).toBeCloseTo(0.15, 9);
  });
});
