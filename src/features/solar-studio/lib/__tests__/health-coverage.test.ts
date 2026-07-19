// ─── The health score must not silently ignore a finding ────────────────────
// A validation code that appears in neither VALIDATION_CATEGORY nor
// EXCLUDED_VALIDATION scores ZERO: the scorer skips it before
// `unknownValidationPenalty` can ever apply. That gap left twelve codes
// unscored — including two hard errors — which is how the app could show
// "Good 100" with an open ERROR in the issues sheet.
//
// This test reads the codes straight out of the SOURCE, so adding a new DRC
// finding fails here until someone decides, in writing, whether it scores.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { computeHealth, EXCLUDED_VALIDATION, VALIDATION_CATEGORY } from '../health';
import { resolveRules } from '../../data/rules/india';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';

const LIB = join(__dirname, '..');

/** Every `code: '…'` literal an issue producer can emit. */
function emittedCodes(): string[] {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      if (!entry.name.endsWith('.ts')) continue;
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/\bcode: '([a-z_]+)'/g)) found.add(m[1]);
    }
  };
  walk(LIB);
  return [...found].sort();
}

describe('every validation code is a deliberate scoring decision', () => {
  const codes = emittedCodes();

  it('finds the producers at all (guards the scan itself)', () => {
    expect(codes.length).toBeGreaterThan(15);
    expect(codes).toContain('panel_overlap');
    expect(codes).toContain('unstrung_panels');
  });

  it('no code is silently unscored', () => {
    const orphans = codes.filter(
      (c) => !(c in VALIDATION_CATEGORY) && !EXCLUDED_VALIDATION.has(c),
    );
    expect(
      orphans,
      `These codes score ZERO because they are in neither VALIDATION_CATEGORY nor ` +
        `EXCLUDED_VALIDATION. Add each to one — with a reason if excluded: ${orphans.join(', ')}`,
    ).toEqual([]);
  });

  it('a code is never in BOTH lists', () => {
    const both = Object.keys(VALIDATION_CATEGORY).filter((c) => EXCLUDED_VALIDATION.has(c));
    expect(both).toEqual([]);
  });

  it('every scored code carries an explicit penalty, not the unknown fallback', () => {
    const { validationPenalties } = resolveRules().health;
    const missing = Object.keys(VALIDATION_CATEGORY).filter((c) => !(c in validationPenalties));
    expect(
      missing,
      `Scored but unpriced — these silently take unknownValidationPenalty: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('the two hard errors that used to score zero now cost something', () => {
    const { validationPenalties } = resolveRules().health;
    for (const c of ['unstrung_panels', 'panel_in_keepout']) {
      expect(VALIDATION_CATEGORY[c]).toBeDefined();
      expect(validationPenalties[c]).toBeGreaterThan(0);
    }
  });

  // The §F boundary, encoded: we report added dead load but never judge it.
  it('dead load is reported, NEVER scored — we do not check roof capacity', () => {
    expect(EXCLUDED_VALIDATION.has('foundation_dead_load')).toBe(true);
    expect(VALIDATION_CATEGORY.foundation_dead_load).toBeUndefined();
  });

  it('a data-provenance note is not treated as a design fault', () => {
    expect(EXCLUDED_VALIDATION.has('temp_coeff_estimated')).toBe(true);
  });

  it('penalties are sane — no negative or score-erasing values', () => {
    for (const [code, pts] of Object.entries(resolveRules().health.validationPenalties)) {
      expect(pts, code).toBeGreaterThan(0);
      expect(pts, code).toBeLessThanOrEqual(50);
    }
  });
});

// ─── The score must actually MOVE for a hard error ──────────────────────────
// Coverage alone is not enough: the codes were listed, priced and categorised
// and the score STILL read 100, because validateSystem only emits
// `unstrung_panels` when its optional 7th argument is supplied — and health.ts
// was not supplying it. The banner and the chip disagreed by construction.
describe('an open hard error is reflected in the score', () => {
  it('unstrung panels cost points', () => {
    const strung = fixtureProject(6); // fixture wires every panel into a string
    const unstrung: Project = { ...strung, strings: [] };

    const a = computeHealth(strung);
    const b = computeHealth(unstrung);

    const codes = b.categories
      .flatMap((c) => c.deductions ?? [])
      .map((d) => d.code);
    expect(codes, 'unstrung_panels must reach the scorer').toContain('unstrung_panels');
    expect(b.total!).toBeLessThan(a.total!);
  });

  it('a design with a hard error cannot sit in the top band', () => {
    const unstrung: Project = { ...fixtureProject(6), strings: [] };
    expect(computeHealth(unstrung).total!).toBeLessThan(100);
  });
});
