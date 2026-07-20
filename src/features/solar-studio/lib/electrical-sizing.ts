// ─── DC-side protective-device sizing from actual module current ────────────
// IEC 62548 / IS practice: string overcurrent protection ≥ 1.5×Isc (we use
// 1.56× = 1.25×1.25 continuous+safety, the common Indian/NEC-style factor),
// rounded UP to a standard rating; conductors sized for the protected current.
// AC-side sizing (1.25× + breaker ladder) already exists in bom.ts/Step8 — this
// module brings the DC side up to the same standard.
// Ladders and factors live in the market rule config (data/rules/india.ts).
import type { PanelSpec } from '../types';
import { resolveRules } from '../data/rules/india';

function nextInLadder(ladder: number[], minA: number): number {
  return ladder.find((a) => a >= minA) ?? ladder[ladder.length - 1];
}

/** String fuse: next standard rating ≥ fuseFactor × module Isc. */
export function dcFuseA(panel: PanelSpec): number {
  const { fuseLadder, fuseFactor } = resolveRules().dcSizing;
  return nextInLadder(fuseLadder, panel.iscA * fuseFactor);
}

/** DC isolator: next standard rating ≥ the string fuse. */
export function dcIsolatorA(panel: PanelSpec): number {
  return nextInLadder(resolveRules().dcSizing.isolatorLadder, dcFuseA(panel));
}

/** DC cable size: smallest standard mm² whose ampacity ≥ the fuse rating. */
export function dcCableSizeMm2(panel: PanelSpec): number {
  const ampacity = resolveRules().dcSizing.cableAmpacity;
  const fuse = dcFuseA(panel);
  const hit = ampacity.find(([, amps]) => amps >= fuse);
  return hit ? hit[0] : ampacity[ampacity.length - 1][0];
}

// ─── AC side ────────────────────────────────────────────────────────────────
// ONE sizing path for the BOM's ACDB line and the SLD's MCCB/isolator. These
// previously lived as two divergent inline ladders (different top rungs,
// different rounding order), which could print two contradictory breaker
// ratings for the same system — and, past the smaller ladder's end, a rating
// BELOW the actual load current.

/** AC full-load current (A), exact — no premature rounding. */
export function acFullLoadA(acKw: number, phases: 1 | 3): number {
  return phases === 3 ? (acKw * 1000) / (1.732 * 415) : (acKw * 1000) / 230;
}

/**
 * AC breaker (MCB/MCCB) rating: next standard rung ≥ breakerFactor × exact
 * full-load amps. The ladder tops out at 630 A MCCB frames — beyond every
 * inverter combination the catalog can produce; the last rung is a floor,
 * never an undersize, because the ladder is sized to the catalog.
 */
export function acBreakerA(acKw: number, phases: 1 | 3): number {
  const { breakerFactor, breakerLadder } = resolveRules().acSizing;
  const required = acFullLoadA(acKw, phases) * breakerFactor;
  return breakerLadder.find((s) => s >= required) ?? breakerLadder[breakerLadder.length - 1];
}

/**
 * AC cable size: smallest standard mm² whose ampacity carries the BREAKER.
 *
 * Sized against the protective device rather than the load current, because
 * that is the coordination rule — a conductor must be able to carry whatever
 * is protecting it, or the breaker will not trip before the cable does. Same
 * relationship `dcCableSizeMm2` has with the string fuse.
 *
 * The BOM used to assert this outright: `phases === 3 ? '10 sq.mm' : '6 sq.mm'`,
 * a fixed pair that ignored system size entirely. 10 sq.mm carries about 55 A
 * in conduit, so every three-phase system past roughly 30 kW was quoted a cable
 * that could not carry its own breaker — stated as fact on a document an
 * installer buys from.
 *
 * NOT a substitute for engineering: ampacity only. Voltage drop is not checked
 * and commonly governs on a long run; grouping, ambient and installation method
 * are not modelled. Callers must present the result as a starting point.
 */
export function acCableSizeMm2(acKw: number, phases: 1 | 3): number {
  const ampacity = resolveRules().acSizing.cableAmpacity;
  const breaker = acBreakerA(acKw, phases);
  const hit = ampacity.find(([, amps]) => amps >= breaker);
  return hit ? hit[0] : ampacity[ampacity.length - 1][0];
}

/** Line-to-line for three phase, line-to-neutral for single. */
function nominalVolts(phases: 1 | 3): number {
  return phases === 3 ? 415 : 230;
}

/**
 * Voltage drop on a run, as a percentage of nominal.
 *
 * Three phase drops √3·I·L·R; single phase drops 2·I·L·R because the current
 * returns down the neutral and that conductor drops too.
 */
export function acVoltDropPct(
  acKw: number,
  phases: 1 | 3,
  runM: number,
  mm2: number,
): number {
  const table = resolveRules().acSizing.cableResistanceOhmPerKm;
  const entry = table.find(([s]) => s === mm2) ?? table[table.length - 1];
  const rOhm = (entry[1] * runM) / 1000;
  const i = acFullLoadA(acKw, phases);
  const drop = phases === 3 ? Math.sqrt(3) * i * rOhm : 2 * i * rOhm;
  return (drop / nominalVolts(phases)) * 100;
}

export interface AcCableSizing {
  /** the size to buy — the thicker of the two criteria */
  mm2: number;
  /** smallest size whose ampacity carries the breaker */
  ampacityMm2: number;
  /** smallest size that keeps the run inside the drop limit */
  voltDropMm2: number;
  governedBy: 'ampacity' | 'voltage-drop';
  /** actual drop at the chosen size, percent */
  voltDropPct: number;
  /**
   * false ⇒ no single cable in the ladder carries the breaker, so the run
   * needs parallel cables or a busbar. Reported rather than silently returning
   * the top rung, which would be an undersize presented as an answer.
   */
  singleRunAdequate: boolean;
}

/**
 * Size the AC run against BOTH criteria and say which one governed.
 *
 * Ampacity alone is not enough, and shipping it alone would have made this
 * WORSE than the constant it replaces. The old code asserted 10 sq.mm for
 * every three-phase system; ampacity alone puts a 15 kW three-phase run on
 * 4 sq.mm, because at 21 A the conductor is thermally fine. What it is not is
 * electrically fine over 60 m — the drop is what governs there, and a quote
 * built on ampacity alone would have under-built the common small system while
 * looking more rigorous than the constant it replaced.
 *
 * Still NOT a substitute for engineering: grouping factors, ambient other than
 * 40 °C, buried-vs-tray installation and harmonics are not modelled.
 */
export function sizeAcCable(acKw: number, phases: 1 | 3, runM: number): AcCableSizing {
  const { cableAmpacity, voltDropLimitPct } = resolveRules().acSizing;
  const breaker = acBreakerA(acKw, phases);

  // through the same primitive, not a second copy of the same find
  const ampacityMm2 = acCableSizeMm2(acKw, phases);
  const singleRunAdequate = cableAmpacity.some(([, amps]) => amps >= breaker);

  const dropHit = cableAmpacity.find(
    ([s]) => acVoltDropPct(acKw, phases, runM, s) <= voltDropLimitPct,
  );
  const voltDropMm2 = dropHit ? dropHit[0] : cableAmpacity[cableAmpacity.length - 1][0];

  const mm2 = Math.max(ampacityMm2, voltDropMm2);
  return {
    mm2,
    ampacityMm2,
    voltDropMm2,
    governedBy: voltDropMm2 > ampacityMm2 ? 'voltage-drop' : 'ampacity',
    voltDropPct: acVoltDropPct(acKw, phases, runM, mm2),
    singleRunAdequate,
  };
}
