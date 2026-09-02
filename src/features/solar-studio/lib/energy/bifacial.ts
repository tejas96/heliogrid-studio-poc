// ─── The rear side of a bifacial module, from the mounting geometry ─────────
// A bifacial module makes power from light landing on its BACK. How much is
// not a property of the module — it is a property of how the module is hung.
// The same 550 W bifacial panel gains almost nothing lying flush on a tiled
// roof (its back is 5 cm from a dark, self-shaded surface) and 8–10% standing
// a metre off open ground. A tool that adds a flat "+7% because bifacial"
// tells the flush-roof customer a number that will never arrive.
//
// So the gain is MEASURED off the design, with the model the industry uses for
// it: the 2D "infinite sheds" view-factor model (the same family as PVsyst's
// 2D rear-side model and pvlib's `infinite_sheds`).
//
// The method, in one paragraph. Take a vertical slice across the rows. The
// array repeats with the row pitch, so one pitch of ground stands for all of
// it. From points spread along the module's back, sweep the whole half-space
// in front of that back and ask what each direction sees: open sky, a
// neighbouring row, or a patch of ground (and which patch). That sweep is the
// view factor — done once per geometry, since it only depends on tilt, pitch,
// height and module width. Then, hour by hour, work out which ground patches
// the rows are shading and how bright each patch therefore is, and add up what
// the back can see. Nothing here is a fitted constant.
//
// What it does NOT model, stated because it changes the answer:
//   · the array is treated as endless — the first and last rows of a real
//     field see more sky and more sunlit ground, so a small array is
//     UNDER-counted (PVsyst's 2D model shares this limitation);
//   · the reflecting surface is horizontal and uniformly bright;
//   · rear-side sky diffuse is isotropic (the Perez sky is used on the front,
//     where it matters; the back sees mostly ground);
//   · structure behind the module (torque tube, rafters, purlins, the junction
//     box and its leads) blocks part of the back — a stated allowance, not a
//     geometric result, because the member layout is not modelled in 3D;
//   · the back of a module is lit unevenly, and cells in series mismatch —
//     also a stated allowance.
import type { PanelSpec, PlacedPanel, Project, RoofType, XY } from '../../types';
import { panelFootprintM } from '../layout';
import { resolveRacking } from '../structure';

/** angular bins in the half-space sweep — the view factors are built once */
const SWEEP_BINS = 240;
/** points spread along the module's back */
const REAR_POINTS = 6;
/** ground bins across one row pitch */
export const PHASE_BINS = 24;
/** neighbouring rows each side included in the sweep */
const NEIGHBOUR_ROWS = 4;

/**
 * How bright the surface under the array is — the single biggest lever on the
 * rear-side gain, because everything the back sees has bounced off it.
 *
 * These are mid-range weathered values from the standard albedo tables, NOT
 * datasheet-fresh figures: a new galvanised sheet is near 0.5 and a two-year-old
 * one is near 0.3, and quoting the higher number would inflate every bifacial
 * yield. A white-membrane or gravel roof genuinely reflects more; that is a
 * survey fact, so it is stated as an assumption rather than guessed at.
 */
export function surfaceAlbedo(roofType: RoofType): number {
  switch (roofType) {
    case 'rcc_flat':
      return 0.25; // weathered concrete
    case 'metal_shed':
      return 0.3; // coated / galvanised sheet, weathered
    case 'tile':
      return 0.15; // clay / Mangalore tile, dark
    case 'ground':
    default:
      return 0.2; // grass and dry soil
  }
}

/** the albedo when no surface is known — the engine's long-standing default */
export const DEFAULT_ALBEDO = 0.2;

/**
 * Rear-side allowances (PVsyst's defaults for the same two terms). Structure
 * shading is the frame, rails and torque tube standing between the back and
 * the ground; mismatch is the cost of lighting a series string unevenly.
 */
export const REAR_STRUCTURE_SHADE_FRAC = 0.05;
export const REAR_MISMATCH_FRAC = 0.1;

export interface RearGeometryInput {
  /** module tilt from horizontal, degrees */
  tiltDeg: number;
  /** module dimension along the slope (the slant width), metres */
  slantM: number;
  /** height of the module's LOW edge above the reflecting surface, metres */
  lowEdgeM: number;
  /** row pitch, centre to centre across the rows, metres */
  pitchM: number;
}

export interface RearGeometry {
  tiltDeg: number;
  pitchM: number;
  lowEdgeM: number;
  slantM: number;
  /** mean over the back: share of its view that is open sky */
  skyVf: number;
  /** mean over the back: share of its view that is each ground bin of one pitch */
  groundVf: Float32Array;
  /** Σ groundVf — the share of the back's view that is ground at all */
  groundVfTotal: number;
  /** each ground bin's own view of the sky, for the diffuse it re-reflects */
  binSkyVf: Float32Array;
  /** the sample points on the back, cross-section (u = down-slope, v = up) */
  points: { u: number; v: number }[];
  /** the neighbouring rows' module lines, for the per-hour beam test */
  rows: { u1: number; v1: number; u2: number; v2: number }[];
}

/** 2D ray (origin o, direction d) against segment a→b; returns t along the ray or null. */
function raySegment(
  ou: number,
  ov: number,
  du: number,
  dv: number,
  au: number,
  av: number,
  bu: number,
  bv: number,
): number | null {
  const eu = bu - au;
  const ev = bv - av;
  const denom = du * ev - dv * eu;
  if (Math.abs(denom) < 1e-12) return null; // parallel
  const t = ((au - ou) * ev - (av - ov) * eu) / denom;
  const s = ((au - ou) * dv - (av - ov) * du) / denom;
  return t > 1e-6 && s >= 0 && s <= 1 ? t : null;
}

/**
 * Build the view factors for one mounting geometry.
 *
 * Cross-section frame: `u` runs horizontally in the direction the module FACES
 * (down-slope), `v` is height above the reflecting surface. Row k has its low
 * edge at u = k·pitch and its high edge up-slope of that. Row 0 is ours.
 */
export function buildRearGeometry(input: RearGeometryInput): RearGeometry {
  const tilt = (Math.max(0, Math.min(90, input.tiltDeg)) * Math.PI) / 180;
  const w = Math.max(0.1, input.slantM);
  const h0 = Math.max(0.01, input.lowEdgeM);
  // A pitch below the row's own plan footprint would mean rows overlapping;
  // contiguous is the floor, and it is what a flush roof array actually is.
  const pitch = Math.max(input.pitchM, w * Math.cos(tilt), 0.05);
  const cosB = Math.cos(tilt);
  const sinB = Math.sin(tilt);

  // the module lines of the neighbouring rows (ours excluded — a ray from our
  // own back cannot strike our own plane)
  const rows: RearGeometry['rows'] = [];
  for (let k = -NEIGHBOUR_ROWS; k <= NEIGHBOUR_ROWS; k++) {
    if (k === 0) continue;
    rows.push({ u1: k * pitch, v1: h0, u2: k * pitch - w * cosB, v2: h0 + w * sinB });
  }

  // the back's outward normal points up-slope and downward; its tangent runs
  // along the module
  const nu = -sinB;
  const nv = -cosB;
  const tu = cosB;
  const tv = -sinB;

  const points: RearGeometry['points'] = [];
  for (let i = 0; i < REAR_POINTS; i++) {
    const s = (i + 0.5) / REAR_POINTS;
    points.push({ u: -s * w * cosB, v: h0 + s * w * sinB });
  }

  const groundVf = new Float32Array(PHASE_BINS);
  let skyVf = 0;
  const dAlpha = Math.PI / SWEEP_BINS;
  for (const p of points) {
    for (let bin = 0; bin < SWEEP_BINS; bin++) {
      const alpha = -Math.PI / 2 + (bin + 0.5) * dAlpha;
      // dF = ½·cos α·dα over a half-space sums to exactly 1
      const weight = (0.5 * Math.cos(alpha) * dAlpha) / points.length;
      const du = Math.cos(alpha) * nu + Math.sin(alpha) * tu;
      const dv = Math.cos(alpha) * nv + Math.sin(alpha) * tv;
      // nearest row in this direction
      let tBest = Infinity;
      for (const r of rows) {
        const t = raySegment(p.u, p.v, du, dv, r.u1, r.v1, r.u2, r.v2);
        if (t !== null && t < tBest) tBest = t;
      }
      // the reflecting surface
      let tGround = Infinity;
      let uGround = 0;
      if (dv < -1e-9) {
        tGround = -p.v / dv;
        uGround = p.u + du * tGround;
      }
      if (tGround < tBest) {
        // fold into one pitch: the array repeats, so bin by phase
        const phase = ((uGround % pitch) + pitch) % pitch;
        const idx = Math.min(PHASE_BINS - 1, Math.floor((phase / pitch) * PHASE_BINS));
        groundVf[idx] += weight;
      } else if (tBest === Infinity) {
        skyVf += weight;
      }
      // otherwise the direction ends on a neighbouring row: the back sees the
      // FRONT GLASS of the next row, which reflects a few percent. Counting it
      // as nothing is the honest side of that rounding.
    }
  }

  // each ground bin's own sky view — what it has to reflect on a cloudy hour
  const binSkyVf = new Float32Array(PHASE_BINS);
  for (let idx = 0; idx < PHASE_BINS; idx++) {
    const u = ((idx + 0.5) / PHASE_BINS) * pitch;
    let sky = 0;
    for (let bin = 0; bin < SWEEP_BINS; bin++) {
      const alpha = -Math.PI / 2 + (bin + 0.5) * dAlpha;
      const weight = 0.5 * Math.cos(alpha) * dAlpha;
      // the ground looks straight up: normal (0,1), tangent (1,0)
      const du = Math.sin(alpha);
      const dv = Math.cos(alpha);
      let blocked = false;
      for (const r of rows) {
        if (raySegment(u, 0, du, dv, r.u1, r.v1, r.u2, r.v2) !== null) {
          blocked = true;
          break;
        }
      }
      // our own row too — the ground under it is shaded from the sky by it
      if (!blocked) {
        const own = raySegment(u, 0, du, dv, 0, h0, -w * cosB, h0 + w * sinB);
        if (own !== null) blocked = true;
      }
      if (!blocked) sky += weight;
    }
    binSkyVf[idx] = sky;
  }

  let groundVfTotal = 0;
  for (const g of groundVf) groundVfTotal += g;

  return { tiltDeg: input.tiltDeg, pitchM: pitch, lowEdgeM: h0, slantM: w, skyVf, groundVf, groundVfTotal, binSkyVf, points, rows };
}

/** A geometry cache: one build serves every module on the same table. */
const cache = new Map<string, RearGeometry>();

export function rearGeometryFor(input: RearGeometryInput): RearGeometry {
  const key = `${input.tiltDeg.toFixed(1)}|${input.slantM.toFixed(2)}|${input.lowEdgeM.toFixed(2)}|${input.pitchM.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const built = buildRearGeometry(input);
  cache.set(key, built);
  return built;
}

export interface RearHourInput {
  /** direct normal irradiance, W/m² */
  dni: number;
  /** diffuse horizontal irradiance, W/m² */
  dhi: number;
  /** the sun's horizontal component along the facing direction, cos(azSun − azArray) */
  cosAzOffset: number;
  /** sine of the sun's altitude (= cos of its zenith angle) */
  sinAlt: number;
  /** cosine of the sun's altitude */
  cosAlt: number;
  /** cos of the incidence angle on the BACK: max(0, −cosθ_front), unclamped front dot negated */
  cosThetaRear: number;
  albedo: number;
}

/**
 * Irradiance on the back of a module of this geometry, this hour, W/m².
 *
 * The ground under an endless array is shaded in a band that repeats with the
 * pitch, so a ground bin is in beam shadow when its distance past the band's
 * start, taken modulo the pitch, is inside the band. Each bin's brightness is
 * then the beam it keeps plus the sky it can still see, and the back collects
 * those bins through the view factors built above.
 */
export function rearIrradiance(g: RearGeometry, s: RearHourInput): number {
  const { dni, dhi, albedo } = s;
  // ── the ground, bin by bin ────────────────────────────────────────────────
  const beamHoriz = dni * Math.max(0, s.sinAlt);
  // the sun's direction in the cross-section: horizontal component along the
  // facing direction, vertical component its altitude
  const su = s.cosAlt * s.cosAzOffset;
  const sv = s.sinAlt;
  let shadeStart = 0;
  let shadeWidth = 0;
  if (sv > 1e-6 && beamHoriz > 0) {
    const tilt = (g.tiltDeg * Math.PI) / 180;
    const w = g.slantM;
    // where the row's two edges throw their shadow on the surface
    const uLow = 0 - (su * g.lowEdgeM) / sv;
    const uHigh = -w * Math.cos(tilt) - (su * (g.lowEdgeM + w * Math.sin(tilt))) / sv;
    shadeStart = Math.min(uLow, uHigh);
    shadeWidth = Math.min(g.pitchM, Math.abs(uHigh - uLow));
  }
  let ground = 0;
  for (let idx = 0; idx < PHASE_BINS; idx++) {
    const vf = g.groundVf[idx];
    if (vf <= 0) continue;
    const u = ((idx + 0.5) / PHASE_BINS) * g.pitchM;
    let lit = beamHoriz;
    if (shadeWidth > 0) {
      const rel = (((u - shadeStart) % g.pitchM) + g.pitchM) % g.pitchM;
      if (rel < shadeWidth) lit = 0;
    }
    ground += vf * (lit + dhi * g.binSkyVf[idx]);
  }

  // ── the sky the back can see directly, and the beam when it is rear-lit ───
  const sky = dhi * g.skyVf;
  let beam = 0;
  if (s.cosThetaRear > 0 && dni > 0) {
    // exact: how many of the sample points on the back have a clear line to the sun
    let clear = 0;
    for (const p of g.points) {
      let blocked = false;
      for (const r of g.rows) {
        if (raySegment(p.u, p.v, su, sv, r.u1, r.v1, r.u2, r.v2) !== null) {
          blocked = true;
          break;
        }
      }
      if (!blocked) clear++;
    }
    beam = dni * s.cosThetaRear * (clear / g.points.length);
  }

  return albedo * ground + sky + beam;
}

/** Everything the back gives, after the two stated rear-side allowances. */
export function rearEffective(rearWm2: number, bifaciality: number): number {
  return rearWm2 * bifaciality * (1 - REAR_STRUCTURE_SHADE_FRAC) * (1 - REAR_MISMATCH_FRAC);
}

/**
 * How open the ground is that this back can see, 0..1 — the one number that
 * decides whether a bifacial module was worth buying.
 *
 * The back only ever gets light that bounced off the surface below, so what
 * matters is not how much surface it sees but how much SUN that surface gets.
 * A module lying flush on a roof sees plenty of roof, all of it boxed in under
 * the array and lit by almost nothing; a module standing a metre up sees ground
 * that is open to the sky between the rows. This weights each patch of ground
 * the back sees by that patch's own view of the sky.
 */
export function rearOpenness(g: RearGeometry): number {
  if (g.groundVfTotal <= 0) return 0;
  let lit = 0;
  for (let i = 0; i < PHASE_BINS; i++) lit += g.groundVf[i] * g.binSkyVf[i];
  return lit / g.groundVfTotal;
}

/**
 * Below this the back is boxed in: the surface it looks at barely sees the sun,
 * so a bifacial module earns close to nothing there and its premium is wasted.
 *
 * Set from the model's own sweep, where openness tracks the yearly rear gain
 * monotonically: flush on a metal shed 0.07 → 0.3%, flush on tile 0.12 → 0.4%,
 * rows packed at GCR 0.91 0.20 → 1.2%, an elevated RCC table 0.26 → 2.8%, a
 * ground row a metre up 0.50 → 4.9%.
 */
export const REAR_BOXED_IN_OPENNESS = 0.2;

// ─── The design's own rear geometry ─────────────────────────────────────────

/**
 * The mounting each module's back looks out on, and the surface it reflects
 * off. ONE derivation, read by the hourly engine and by the design check, so
 * the warning and the yield can never be arguing from different geometry.
 */
export function projectRearGeometry(
  project: Project,
  spec: PanelSpec,
  enabled: PlacedPanel[],
): { byPanel: Map<string, RearGeometry>; albedo: number; bifaciality: number } {
  const bifaciality = (spec.bifacialityPct ?? 0) / 100;
  const surfaces = new Set(
    project.roofs.filter((r) => enabled.some((p) => p.roofId === r.id)).map((r) => r.roofType),
  );
  const albedo = surfaces.size === 1 ? surfaceAlbedo([...surfaces][0]) : DEFAULT_ALBEDO;
  const byPanel = new Map<string, RearGeometry>();
  if (bifaciality <= 0) return { byPanel, albedo, bifaciality };

  const centresBySeg = new Map<string, XY[]>();
  for (const p of enabled) {
    if (!p.segmentId) continue;
    const list = centresBySeg.get(p.segmentId);
    if (list) list.push(p.center);
    else centresBySeg.set(p.segmentId, [p.center]);
  }
  for (const p of enabled) {
    const seg = p.segmentId ? project.segments.find((s) => s.id === p.segmentId) : undefined;
    const roof = project.roofs.find((r) => r.id === p.roofId);
    const resolved = seg && roof ? resolveRacking(project, roof, seg, spec) : null;
    // how high the back stands over what it reflects off: the table's own front
    // leg, or a flush mount's rail standoff
    const lowEdgeM = Math.max(FLUSH_STANDOFF_M, resolved ? resolved.frontLegM : FLUSH_STANDOFF_M);
    const measured = seg ? measuredRowPitchM(centresBySeg.get(seg.id) ?? [], p.azimuthDeg) : null;
    const declared = seg && seg.racking.kind !== 'flush' ? seg.racking.rowPitchM : 0;
    byPanel.set(
      p.id,
      rearGeometryFor({
        tiltDeg: p.tiltDeg,
        slantM: panelFootprintM(spec, p.orientation).h,
        lowEdgeM,
        pitchM: measured ?? (declared > 0 ? declared : 0),
      }),
    );
  }
  return { byPanel, albedo, bifaciality };
}

/** a flush module's standoff off its roof covering, m — rail height, typical */
export const FLUSH_STANDOFF_M = 0.1;

/**
 * The row pitch of a table, MEASURED off where its modules actually stand.
 *
 * `racking.rowPitchM` is what the fill solver asked for; the modules are what
 * got built, and after a row is grown, shrunk or dragged the two can differ.
 * This is a geometry model, so it reads the geometry: project every module
 * centre onto the down-slope direction, and the gap between neighbouring rows
 * is the pitch. Null when there is only one row — nothing to measure, and the
 * model then falls back to contiguous.
 */
export function measuredRowPitchM(centres: XY[], azimuthDeg: number): number | null {
  if (centres.length < 2) return null;
  const a = (azimuthDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  const seen: number[] = [];
  for (const c of centres) {
    const t = c.x * dx + c.y * dy;
    if (!seen.some((v) => Math.abs(v - t) < 0.05)) seen.push(t);
  }
  if (seen.length < 2) return null;
  seen.sort((p, q) => p - q);
  const gaps: number[] = [];
  for (let i = 1; i < seen.length; i++) gaps.push(seen[i] - seen[i - 1]);
  gaps.sort((p, q) => p - q);
  return gaps[Math.floor(gaps.length / 2)];
}
