// ─── Gate: the AC conductor is SIZED, not asserted ──────────────────────────
// The BOM used to print `phases === 3 ? '4-core 10 sq.mm' : '3-core 6 sq.mm'`
// — a fixed pair, chosen by phase count alone, with no reference to how much
// current the system actually produces. 10 sq.mm carries about 55 A in conduit,
// so every three-phase system past roughly 30 kW was quoted a cable that could
// not carry its own breaker, stated as fact on a document an installer buys
// from.
//
// The rule these pin is COORDINATION: a conductor must carry the device that
// protects it, or the cable fails before the breaker trips. That is why the
// sizer takes the breaker rating and not the load current.
import { describe, expect, it } from 'vitest';
import {
  acBreakerA,
  acCableSizeMm2,
  acFullLoadA,
  acVoltDropPct,
  sizeAcCable,
} from '../electrical-sizing';
import { resolveRules } from '../../data/rules/india';
import { cableRatePerM, PRICE_BOOK } from '../../data/pricebook';
import { deriveBom } from '../bom';
import { fixtureProject } from './fixtures/project';

const LADDER = resolveRules().acSizing.cableAmpacity;
const ampacityOf = (mm2: number) => LADDER.find(([s]) => s === mm2)![1];

describe('the conductor carries its breaker', () => {
  it('holds across the whole plausible range, single and three phase', () => {
    for (const phases of [1, 3] as const) {
      for (let kw = 1; kw <= 400; kw += 1) {
        const sized = sizeAcCable(kw, phases, 30);
        const breaker = acBreakerA(kw, phases);
        // past the end of the ladder no single cable can carry it; that case
        // is REPORTED, not silently answered with the top rung
        if (!sized.singleRunAdequate) continue;
        expect(
          ampacityOf(sized.mm2),
          `${kw} kW ${phases}φ → ${sized.mm2} sq.mm must carry ${breaker} A`,
        ).toBeGreaterThanOrEqual(breaker);
      }
    }
  });

  it('a breaker no single cable can carry is flagged, not fudged', () => {
    // the ladder tops out at 500 A; a 630 A service genuinely needs parallel
    // runs or a busbar, and saying so is more useful than returning 400 sq.mm
    // as though it were the answer
    const huge = sizeAcCable(400, 3, 30);
    if (!huge.singleRunAdequate) {
      expect(ampacityOf(huge.mm2)).toBeLessThan(acBreakerA(400, 3));
    }
    // and an ordinary system is never flagged
    expect(sizeAcCable(50, 3, 30).singleRunAdequate).toBe(true);
  });

  it('picks the SMALLEST size that does — no gold-plating', () => {
    for (const kw of [5, 12, 30, 75, 150]) {
      const size = acCableSizeMm2(kw, 3);
      const breaker = acBreakerA(kw, 3);
      const smaller = LADDER.filter(([s]) => s < size);
      for (const [s, amps] of smaller) {
        expect(amps, `${s} sq.mm should NOT have carried ${breaker} A`).toBeLessThan(breaker);
      }
    }
  });

  it('the old constant was wrong in BOTH directions', () => {
    // undersized at the top: 10 sq.mm carries 55 A, a 50 kW three-phase run
    // needs a 100 A breaker
    expect(sizeAcCable(50, 3, 30).mm2).toBeGreaterThan(10);
    // and OVERsized at the bottom on a short run — which is why ampacity alone
    // could not simply replace it
    expect(sizeAcCable(15, 3, 20).mm2).toBeLessThan(10);
  });
});

describe('voltage drop, the criterion that usually governs', () => {
  it('a long run needs more copper than ampacity alone would allow', () => {
    // THE FINDING that shaped this: ampacity alone puts 15 kW three-phase on
    // 4 sq.mm because 21 A is thermally comfortable. Over 80 m it is not
    // electrically comfortable, and shipping ampacity-only would have quoted
    // a THINNER cable than the constant it replaced.
    const short = sizeAcCable(15, 3, 20);
    const long = sizeAcCable(15, 3, 80);
    expect(long.mm2).toBeGreaterThan(short.mm2);
    expect(long.governedBy).toBe('voltage-drop');
    expect(long.ampacityMm2).toBeLessThan(long.mm2);
  });

  it('the chosen size actually meets the limit it was chosen for', () => {
    const limit = resolveRules().acSizing.voltDropLimitPct;
    for (const phases of [1, 3] as const) {
      for (const kw of [3, 8, 15, 40, 100]) {
        for (const runM of [10, 40, 90, 150]) {
          const s = sizeAcCable(kw, phases, runM);
          if (!s.singleRunAdequate) continue;
          expect(
            acVoltDropPct(kw, phases, runM, s.mm2),
            `${kw} kW ${phases}φ over ${runM} m on ${s.mm2} sq.mm`,
          ).toBeLessThanOrEqual(limit + 1e-9);
        }
      }
    }
  });

  it('drop rises with length and falls with size', () => {
    expect(acVoltDropPct(15, 3, 100, 10)).toBeGreaterThan(acVoltDropPct(15, 3, 50, 10));
    expect(acVoltDropPct(15, 3, 100, 25)).toBeLessThan(acVoltDropPct(15, 3, 100, 10));
  });

  it('single phase drops more than three for the same power', () => {
    // 2·I·L·R at 230 V against √3·I·L·R at 415 V
    expect(acVoltDropPct(5, 1, 50, 10)).toBeGreaterThan(acVoltDropPct(5, 3, 50, 10));
  });

  it('a zero-length run has no drop, and ampacity governs', () => {
    const s = sizeAcCable(15, 3, 0);
    expect(s.voltDropPct).toBe(0);
    expect(s.governedBy).toBe('ampacity');
  });

  it('governedBy names the criterion that actually decided', () => {
    const long = sizeAcCable(15, 3, 120);
    expect(long.mm2).toBe(Math.max(long.ampacityMm2, long.voltDropMm2));
    expect(long.governedBy).toBe(long.voltDropMm2 > long.ampacityMm2 ? 'voltage-drop' : 'ampacity');
  });
});

describe('the defect this replaces', () => {
  it('a 50 kW three-phase system needs far more than the asserted 10 sq.mm', () => {
    const kw = 50;
    const load = acFullLoadA(kw, 3);
    const breaker = acBreakerA(kw, 3);
    expect(load).toBeGreaterThan(69); // ~69.6 A
    expect(breaker).toBeGreaterThanOrEqual(80);
    // 10 sq.mm carries 55 A — it could not even carry the LOAD, let alone the
    // breaker. This is the number that used to be printed as fact.
    expect(ampacityOf(10)).toBeLessThan(load);
    expect(acCableSizeMm2(kw, 3)).toBeGreaterThanOrEqual(25);
  });

  it('single phase past its small range also outgrew the asserted 6 sq.mm', () => {
    // 6 sq.mm carries 41 A; a 10 kW single-phase inverter pulls ~43 A
    expect(acFullLoadA(10, 1)).toBeGreaterThan(ampacityOf(6));
    expect(acCableSizeMm2(10, 1)).toBeGreaterThan(6);
  });
});

describe('monotonicity — a bigger system never gets a thinner cable', () => {
  it('size is non-decreasing in system size', () => {
    for (const phases of [1, 3] as const) {
      let prev = 0;
      for (let kw = 1; kw <= 300; kw += 1) {
        const size = acCableSizeMm2(kw, phases);
        expect(size, `${kw} kW ${phases}φ went backwards`).toBeGreaterThanOrEqual(prev);
        prev = size;
      }
    }
  });

  it('three phase needs less copper than single phase for the same kW', () => {
    // 415 V line-to-line at √3 vs 230 V — the reason three phase is preferred
    for (const kw of [5, 10, 15]) {
      expect(acCableSizeMm2(kw, 3)).toBeLessThanOrEqual(acCableSizeMm2(kw, 1));
    }
  });
});

describe('the ladder itself', () => {
  it('is ascending in BOTH columns — the sizer takes the first hit', () => {
    for (let i = 1; i < LADDER.length; i++) {
      expect(LADDER[i][0], 'sizes ascending').toBeGreaterThan(LADDER[i - 1][0]);
      expect(LADDER[i][1], 'ampacity ascending').toBeGreaterThan(LADDER[i - 1][1]);
    }
  });

  it('has a resistance entry for every size it can return', () => {
    // a missing entry falls back to the LAST row, which would silently compute
    // the drop of a 400 sq.mm cable for a 4 sq.mm one
    const res = resolveRules().acSizing.cableResistanceOhmPerKm;
    for (const [mm2] of LADDER) {
      expect(res.some(([s]) => s === mm2), `${mm2} sq.mm has no resistance`).toBe(true);
    }
  });

  it('resistance falls as size rises', () => {
    const res = resolveRules().acSizing.cableResistanceOhmPerKm;
    for (let i = 1; i < res.length; i++) {
      expect(res[i][1]).toBeLessThan(res[i - 1][1]);
    }
  });
});

describe('price follows the size', () => {
  // sizing the conductor while quoting one flat rate would print 25 sq.mm at
  // the 6 sq.mm price — a wrong quote, and a worse failure than the wrong spec
  it('every size the ladder can produce has a rate', () => {
    for (const [mm2] of LADDER) {
      expect(cableRatePerM(PRICE_BOOK.acCablePerMBySize, mm2), `${mm2} sq.mm`).toBeGreaterThan(0);
    }
  });

  it('a dearer conductor costs more per metre', () => {
    expect(cableRatePerM(PRICE_BOOK.acCablePerMBySize, 25)).toBeGreaterThan(
      cableRatePerM(PRICE_BOOK.acCablePerMBySize, 6),
    );
  });

  it('an unpriced size falls UP, never down', () => {
    // understating is the failure that costs the installer money
    const table = { 6: 210, 25: 690 };
    expect(cableRatePerM(table, 10)).toBe(690);
    expect(cableRatePerM(table, 6)).toBe(210);
  });

  it('past the end of the book it returns the dearest rung', () => {
    expect(cableRatePerM({ 6: 210, 25: 690 }, 400)).toBe(690);
  });
});

describe('the emitted line', () => {
  it('states the derived size, and the price matches it', () => {
    const ac = deriveBom(fixtureProject(8)).find((l) => l.id === 'elec.ac_cable')!;
    const size = Number(/(\d+(?:\.\d+)?) sq\.mm/.exec(ac.spec!)![1]);
    expect(LADDER.some(([s]) => s === size)).toBe(true);
    expect(ac.unitPriceInr).toBe(cableRatePerM(PRICE_BOOK.acCablePerMBySize, size));
  });

  it('core count still follows the phase count', () => {
    const ac = deriveBom(fixtureProject(8)).find((l) => l.id === 'elec.ac_cable')!;
    expect(ac.spec).toMatch(/^[34]-core /);
  });

  it('the formula names the criterion that governed', () => {
    const ac = deriveBom(fixtureProject(8)).find((l) => l.id === 'elec.ac_cable')!;
    expect(ac.formula).toMatch(/Governed by (VOLTAGE DROP|AMPACITY)/);
    expect(ac.formula).toMatch(/breaker/i);
  });

  it('the formula admits what it did NOT model', () => {
    // an installer reading a size without knowing which checks were skipped
    // could under-build the run; saying so is the whole point of `formula`
    const ac = deriveBom(fixtureProject(8)).find((l) => l.id === 'elec.ac_cable')!;
    expect(ac.formula).toMatch(/NOT modelled/);
    expect(ac.formula).toMatch(/engineer to verify/i);
  });

  it('the cable is sized from the SAME current as the breaker line', () => {
    // two copies of `inv.acKw * invCount` would be two things that merely
    // happen to agree until one of them moves
    const lines = deriveBom(fixtureProject(8));
    const ac = lines.find((l) => l.id === 'elec.ac_cable')!;
    const acdb = lines.find((l) => l.id === 'elec.acdb')!;
    const cableBreaker = Number(/carrying the (\d+) A breaker/.exec(ac.formula!)![1]);
    expect(cableBreaker).toBeGreaterThan(0);
    const acdbBreaker = Number(/^(\d+)A MCB/.exec(acdb.spec!)![1]);
    expect(cableBreaker).toBe(acdbBreaker);
  });
});
