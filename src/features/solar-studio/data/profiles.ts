// ─── Structural steel section catalog (Phase 22a) ───────────────────────────
// ONE source for the six legacy profiles plus the sections added for the MMS
// work. Previously `STRUCTURE_PROFILES` lived in lib/segment-ops.ts and a
// SECOND, hand-duplicated `DEFAULT_PROFILE` literal lived in lib/layout.ts —
// the two could drift silently. Both now re-export from here.
//
// ── How `kgPerM` relates to `dims` ──────────────────────────────────────────
// These are cold-formed sections, so mass per metre is the mass of the COIL
// BLANK consumed, not the area of the finished cross-section:
//
//   open shapes (c, u, l, z, hat)   kg/m = developedWidth × t × 7850 / 1e6
//   hollow shapes (rhs, chs)        kg/m = crossSectionArea × 7850 / 1e6
//
// The distinction is worth ~5% and it is the reason a real 80 × 40 × 15 × 2.5
// lipped channel is quoted at 3.73 kg/m: its blank is 190 mm wide (190 × 2.5 =
// 475 mm²), while the finished polygon encloses only ~450 mm² because the
// corners are bends, not square. Quoting the polygon area would under-buy the
// steel. `profiles.test.ts` asserts every entry against the matching rule.
//
// The six legacy `kgPerM` values are UNCHANGED — dimensions were chosen to fit
// the existing masses, not the other way round, so no project's tonnage moves.
import type { SectionDims, StructureProfile } from '../types';

export const STEEL_DENSITY_KG_M3 = 7850;

/** Blank width for an open section — what the coil actually gives up. */
export function developedWidthMm(d: SectionDims): number {
  const b = d.b ?? 0;
  const lip = d.lip ?? 0;
  switch (d.shape) {
    case 'c':
      return d.h + 2 * b + 2 * lip; // web + both flanges + both return lips
    case 'u':
    case 'z':
      return d.h + 2 * b; // web + both flanges, no lips
    case 'l':
      return 2 * d.h - d.t; // two legs sharing one corner thickness
    case 'hat':
      return b + 2 * d.h + 2 * lip; // crown + both webs + both brims
    default:
      return 0; // hollow sections do not have a blank
  }
}

/** True enclosed area — the right rule for hollow sections only. */
export function hollowAreaMm2(d: SectionDims): number {
  if (d.shape === 'chs') {
    // h is the OUTSIDE diameter for a round tube
    return Math.PI * d.t * (d.h - d.t);
  }
  const b = d.b ?? d.h;
  return d.h * b - (d.h - 2 * d.t) * (b - 2 * d.t);
}

/** kg/m implied by the dimensions, by the rule that fits the shape family. */
export function massPerMFromDims(d: SectionDims): number {
  const area =
    d.shape === 'rhs' || d.shape === 'chs'
      ? hollowAreaMm2(d)
      : developedWidthMm(d) * d.t;
  return (area * STEEL_DENSITY_KG_M3) / 1e6;
}

/** Human-readable section string, derived so it can never drift from `dims`. */
export function sectionLabel(d: SectionDims): string {
  const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  if (d.shape === 'chs') return `Ø${n(d.h)} × ${n(d.t)}`;
  const parts = [n(d.h), n(d.b ?? d.h)];
  if (d.lip !== undefined) parts.push(n(d.lip));
  parts.push(n(d.t));
  return parts.join(' × ');
}

const IS_GRADE = 'IS 2062';
const COATING = 'HDG ≥ 80 µm';

function profile(
  key: string,
  label: string,
  kgPerM: number,
  dims: SectionDims,
): StructureProfile {
  return { key, label, kgPerM, dims, sectionMm: sectionLabel(dims), isGrade: IS_GRADE, coating: COATING };
}

/**
 * Steel mounting sections; kgPerM feeds the structural BOM.
 *
 * ORDER IS LOAD-BEARING: `STRUCTURE_PROFILES[0]` is used as a default at four
 * call sites (Scene3D, Step6Editor ×2, structure-edit). New entries go at the
 * END so that default never moves.
 */
export const STRUCTURE_PROFILES: StructureProfile[] = [
  profile('c_channel', 'C-Channel', 2.2, { h: 80, b: 40, lip: 8, t: 1.6, shape: 'c' }),
  profile('u_channel', 'U-Channel', 2.4, { h: 75, b: 40, t: 2.0, shape: 'u' }),
  profile('l_angle', 'L-Angle', 1.8, { h: 45, b: 45, t: 2.6, shape: 'l' }),
  profile('z_purlin', 'Z-Purlin', 2.6, { h: 85, b: 40, t: 2.0, shape: 'z' }),
  profile('rhs', 'RHS / Box', 3.4, { h: 65, b: 45, t: 2.0, shape: 'rhs' }),
  profile('chs', 'CHS / Round tube', 3.0, { h: 63, t: 2.0, shape: 'chs' }),
  // ── added in Phase 22a ────────────────────────────────────────────────────
  profile('top_hat', 'Top Hat', 2.01, { h: 40, b: 40, lip: 20, t: 1.6, shape: 'hat' }),
  // the heavy lipped channel the reference BOM quotes; blank 190 mm × 2.5 mm
  profile('c_channel_80', 'C-Channel 80 (heavy)', 3.73, { h: 80, b: 40, lip: 15, t: 2.5, shape: 'c' }),
];

/** Default mounting profile until the racking picker sets one. */
export const DEFAULT_PROFILE: StructureProfile = STRUCTURE_PROFILES[0];

export function profileByKey(key: string): StructureProfile | undefined {
  return STRUCTURE_PROFILES.find((p) => p.key === key);
}
