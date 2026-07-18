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
