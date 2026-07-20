import type { FoundationShape } from '../../types';

// ─── Engineering & commercial rule config — India market ────────────────────
// Seed of the configurable rule engine (§8.10): every hardcoded market/standard
// constant moves here so later phases can resolve rules per-project instead of
// importing scattered literals. Values are EXACTLY the constants previously
// inlined at their consumer sites — extraction changes no behavior.
//
// Consumers: lib/electrical-sizing.ts (DC protection), lib/finance.ts
// (PM Surya Ghar subsidy), data/discoms.ts + store newProject (tariff),
// Step2Roof (setback default), Step6Editor (plan capacity gate).

export interface DcSizingRules {
  /** overcurrent factor on module Isc (≥1.5 per IEC 62548; 1.56 = 1.25×1.25) */
  fuseFactor: number;
  /** standard gPV string-fuse ratings (A), ascending */
  fuseLadder: number[];
  /** standard DC isolator ratings (A), ascending */
  isolatorLadder: number[];
  /** copper PV-cable ampacity, [mm², A] ascending (free-air, conservative) */
  cableAmpacity: [number, number][];
}

export interface AcSizingRules {
  /** continuous-load factor on AC full-load current (IS/IEC practice) */
  breakerFactor: number;
  /**
   * Standard MCB/MCCB ratings (A), ascending — the ONE ladder both the BOM
   * and the SLD size from. Extends into MCCB frame sizes so large commercial
   * systems are never silently rated below their load current.
   */
  breakerLadder: number[];
  /**
   * Copper AC-cable ampacity, [mm², A] ascending.
   *
   * REFERENCE VALUES — multicore copper, PVC/XLPE, run in conduit or on tray
   * at 40 °C ambient. That is the derated column an Indian rooftop actually
   * runs in; quoting free-air figures here would undersize the conductor on
   * every real installation.
   *
   * These size the conductor against the OVERCURRENT DEVICE, which is the
   * coordination rule (the cable must carry what protects it) and matches how
   * `cableAmpacity` is used on the DC side.
   *
   * WHAT THIS DOES NOT DO: voltage drop is not checked, and on a long AC run
   * it — not ampacity — usually governs the size. Nor are grouping factors,
   * buried-vs-tray installation, or a non-40 °C ambient. The derived size is a
   * STARTING POINT for the engineer, and every surface that prints it says so.
   */
  cableAmpacity: [number, number][];
  /**
   * Copper conductor resistance, [mm², Ω/km] — REFERENCE values at operating
   * temperature (~70 °C), which is what a loaded cable actually runs at. Using
   * 20 °C figures would understate the drop by roughly a fifth.
   *
   * Needed because ampacity ALONE does not size an AC run. On anything but a
   * short run the voltage drop reaches its limit while the conductor is still
   * thermally comfortable, so the drop is what picks the size.
   */
  cableResistanceOhmPerKm: [number, number][];
  /**
   * Maximum acceptable voltage drop on the inverter → LT panel run, percent.
   * 3% is ordinary Indian LV practice for a final circuit; a stricter house
   * standard belongs here rather than in the sizer.
   */
  voltDropLimitPct: number;
}

export interface SubsidyRules {
  /** ₹/kW for the first N kW */
  firstSlabPerKwInr: number;
  firstSlabKw: number;
  /** ₹/kW for capacity above the first slab, up to the cap */
  secondSlabPerKwInr: number;
  /** absolute cap (₹) — applies to ALL residential systems ≥ capKw */
  capInr: number;
  /** capacity beyond which the cap is the whole subsidy */
  capKw: number;
  /** subsidy requires DCR (domestic content requirement) modules */
  requiresDcr: boolean;
}

export interface DefaultRules {
  /** uniform roof setback preset when drawing a new roof (m) */
  roofSetbackM: number;
  /**
   * Boundary offset for a free-field array. Larger than a roof setback: it
   * carries the perimeter access lane and fence standoff, not a fire margin.
   * ASSUMED — no Indian standard fixes this; engineer/site validation required.
   */
  groundSetbackM: number;
  /**
   * Default tilt for a ground array. A roof constrains tilt; open ground does
   * not, so this sits near latitude-optimal for the Indian market instead of
   * inheriting the 10° rooftop ballast default. ASSUMED pending validation.
   */
  groundTiltDeg: number;
  /**
   * Free-field site works. All ASSUMED: fencing type and earthing-ring sizing
   * are client/DISCOM/soil decisions, not values this tool can derive.
   */
  groundFenceEnabled: boolean;
  groundGatesPerArea: number;
  /**
   * Phase 15 access thresholds. ALL ASSUMED — these are workmanship/O&M
   * conventions, not code minimums, and they are warn-not-block by design
   * (§8.4 risk note: over-strict defaults just annoy installers).
   * ENGINEER/O&M VALIDATION REQUIRED before they gate anything.
   */
  cleaningReachM: number;
  ladderEdgeM: number;
  inverterClearanceM: number;
  /** residential tariff when the state is not in the DISCOM table (₹/kWh) */
  tariffUnknownStateInrPerKwh: number;
  /** tariff preset on a brand-new project before a state is chosen (₹/kWh) */
  tariffNewProjectInrPerKwh: number;
  /** freemium plan gate on total DC capacity (kW) */
  planLimitKw: number;
}

/** Health Score v1 (§8.2): fixed, capped, code-level deductions — the fixed
 *  table is what makes the monotonicity gate PROVABLE (fixing an issue can
 *  only remove its deduction, never grow another). */
export interface HealthRules {
  /** category weights for the total (normalized over APPLICABLE categories) */
  weights: { energy: number; electrical: number; utilization: number };
  /** band thresholds on the 0–100 total */
  bands: { goodMin: number; fairMin: number };
  /** points deducted per DISTINCT validation issue code */
  validationPenalties: Record<string, number>;
  /** a validation code missing from the table still costs something */
  unknownValidationPenalty: number;
  /** points deducted per Copilot insight, by severity */
  insightPenalties: { critical: number; warning: number; suggestion: number; info: number };
}

/** IS 875-3 basic wind speed FLAG (plan §F boundary): representative dominant
 *  zone per state (m/s) — display/verification-nudge ONLY, never a wind-load
 *  calculation. Site-specific values vary within states; the engineer verifies. */
export interface WindRules {
  basicWindSpeedMsByState: Record<string, number>;
  /** at/above this the UI flags "high-wind zone — verification mandatory" */
  highWindMinMs: number;
}

/**
 * Design temperatures for string sizing — the cold extreme sets the maximum
 * series length (Voc rises as it gets colder), the hot extreme sets the
 * minimum (Vmp falls as it gets hotter).
 *
 * ENGINEER VALIDATION REQUIRED (plan §7 — "design-temperature policy"): these
 * are ASSUMED climate defaults, not measured site data. The honest source is a
 * PVGIS TMY min/max ambient for the actual pin (see lib/electrical/temps.ts —
 * it prefers measured data whenever the project carries it). Latitude is a
 * coarse proxy in India specifically: altitude dominates (Leh at 34°N freezes;
 * Chennai at 13°N never does), so a hill site MUST be confirmed by an engineer
 * rather than trusted from this table.
 */
export interface TempRules {
  /** first band whose maxAbsLat >= |lat| wins; last entry is the catch-all */
  latBands: Array<{
    maxAbsLat: number;
    label: string;
    designMinAmbientC: number;
    designMaxAmbientC: number;
  }>;
  /**
   * Cell rise above ambient at full irradiance (NOCT-style adder). PVsyst/
   * PVWatts use ~25–30 °C for rooftop arrays with restricted rear airflow;
   * 30 is the conservative rooftop figure this market's installs assume.
   */
  cellRiseC: number;
  /**
   * Fallback module Pmax coefficient (%/°C) when a datasheet omits it.
   * Hot Vmp MUST use the Pmax/Vmp coefficient — NOT the Voc coefficient,
   * which is materially smaller and inflates the usable window.
   */
  fallbackPmaxCoeffPct: number;
}

/**
 * Cable installation rules.
 *
 * ENGINEER VALIDATION REQUIRED (plan §7 — DC sizing rules as adopted by target
 * DISCOMs): slack and lead-reach are INSTALLATION PRACTICE, not physics, and
 * they vary by installer. They are here, as data, precisely so they can be
 * argued with and changed per market rather than buried in an estimator.
 */
export interface CableRules {
  /** installation slack added to every routed length (0.1 = +10%) */
  slackPct: number;
  /**
   * Cable follows the building, not the crow. An installer drops to the array
   * edge and runs along rails / the roof perimeter / a tray — nobody lays a
   * conductor across live module glass. So a metre dragged ACROSS THE ARRAY
   * FOOTPRINT costs this multiplier in the ROUTER's cost function (a physical
   * near-prohibition, not a fudge); metres along aisles/edges are free. The
   * length reported to the BOM is always the real, unweighted geometry.
   */
  crossFieldPenalty: number;
  /** the perimeter corridor sits this far inside the roof edge (m) */
  corridorInsetM: number;
  /**
   * Conductor size and material the DC runs are quoted at, for the
   * voltage-drop check (matches the "DC Solar Cable 4 sq.mm" BOM line).
   */
  dcCableMm2: number;
  copperResistivity: number;
  /**
   * ENGINEER VALIDATION REQUIRED (plan §F2 — "engineer validation for drop
   * limits"). Industry practice is ~1–2% DC and ~2–3% AC at full load; the
   * binding number is whatever the DISCOM/consultant adopts.
   */
  maxDcDropPct: number;
  /**
   * How far apart two modules can sit before their factory leads stop reaching
   * and extra cable must be bought. Adjacent modules in a row cost NOTHING —
   * the old estimator charged for every module-to-module link, which is why its
   * numbers ran high.
   */
  moduleLeadReachM: number;
  /** conservative drop from the array plane to the inverter/DCDB (m) */
  defaultVerticalDropM: number;
}

/**
 * Earthing / LPS conventions.
 *
 * ENGINEER VALIDATION REQUIRED (plan §7 + §F2). The honest position: the number
 * of electrodes is a function of SOIL RESISTIVITY and the required earth
 * resistance (IS 3043) — a site measurement this tool does not have and must
 * not pretend to. Likewise LPS class (IS/IEC 62305) depends on a risk
 * assessment. What lives here is the common Indian rooftop CONVENTION, so the
 * BOM can offer a starting quantity that is LABELLED as assumed rather than
 * presented as calculated.
 */
export interface EarthingRules {
  /** one electrode each for the DC (array/structure) and AC (inverter) systems */
  pitsForSystem: number;
  /** one more when a lightning arrester is present — LPS earth is separate */
  pitsForLps: number;
  /** strip runs from the roof down (DC, AC, LPS) */
  stripRunsPerPit: number;
  /** flat allowance for pit-to-pit + equipment interconnects (m) */
  interconnectAllowanceM: number;
  /** horizontal run from an arrester's down conductor to its pit (m) */
  laGroundRunM: number;
}

/** String-combiner box (SCB/AJB) sizing for central-inverter / C&I topology. */
export interface CombinerRules {
  /** max parallel string inputs per combiner box */
  maxStringsPerBox: number;
  /** continuous-duty factor on the combined output current (ΣIsc × this) */
  outputFactor: number;
}

/** Representative financing terms (ASSUMED — a real deployment wires lender/PPA offers). */
export interface FinancingRules {
  /** rooftop solar loan APR (% per year) */
  loanRatePct: number;
  loanTenureYears: number;
  /** minimum down payment (% of net cost) */
  loanDownPaymentPct: number;
  /** developer cost-of-capital used to amortise a lease (% per year) */
  leaseRatePct: number;
  leaseTenureYears: number;
  /** PPA tariff discount vs the grid tariff (%) */
  ppaDiscountPct: number;
  ppaTenureYears: number;
}

/**
 * Nominal foundation geometry, per `FoundationKind` (Phase 22a).
 *
 * ⚠️ EVERY DIMENSION HERE IS **ASSUMED**, and must stay labelled that way in
 * any output. A pedestal's real size depends on wind uplift and overturning,
 * which this app explicitly does not calculate (§F structural-safety boundary).
 * These are conventional Indian rooftop values that give a buildable, sane
 * model — they are NOT a design.
 *
 * They matter numerically because concrete volume and the added dead-load
 * warning both derive from them, and the volume rule differs by shape:
 *   square    V = l × w × h
 *   circular  V = π (d/2)² h
 */
export interface FoundationGeometryRule {
  shape: FoundationShape;
  /** plan size, mm — `l`/`w` for square, `d` (diameter) for circular */
  l?: number;
  w?: number;
  d?: number;
  /** height above the deck, mm. Consumes part of frontLegM (plan D15). */
  heightMm: number;
  /** base plate, mm */
  plateMm: number;
  plateThkMm: number;
  /** embedment below grade, mm — piles only */
  embedMm?: number;
}

export interface FoundationRules {
  concreteDensityKgM3: number;
  /** shortest steel leg we will allow above a foundation, m (plan D15) */
  minLegAboveFoundationM: number;
  pedestal: FoundationGeometryRule;
  anchor: FoundationGeometryRule;
  ballast: FoundationGeometryRule;
  pile: FoundationGeometryRule;
}

/**
 * Metal-shed fixing geometry. BOTH figures are ASSUMED and neither is
 * measurable from anything the model holds, which is why they are named here
 * rather than buried in a formula (plan E15):
 *
 * `purlinPitchM` sets how many standoffs a rail needs — get it wrong and the
 * count is wrong. `ribPitchM` decides whether a fixing lands on a CROWN or in
 * a valley — get that wrong and the fixing does not land on steel at all, and
 * the roof leaks. Both must be confirmed at survey.
 */
export interface SheetRules {
  /** purlin centres under the sheeting, m — sets standoff spacing */
  purlinPitchM: number;
  /** sheet rib/crown pitch, m — a standoff must sit on a crown, never a valley */
  ribPitchM: number;
  /** fewest standoffs per rail, whatever the pitch arithmetic says */
  minStandoffsPerRail: number;
}

export interface MarketRules {
  market: 'india';
  temps: TempRules;
  cable: CableRules;
  earthing: EarthingRules;
  dcSizing: DcSizingRules;
  acSizing: AcSizingRules;
  subsidy: SubsidyRules;
  health: HealthRules;
  wind: WindRules;
  combiner: CombinerRules;
  financing: FinancingRules;
  foundations: FoundationRules;
  sheet: SheetRules;
  defaults: DefaultRules;
}

export const INDIA_RULES: MarketRules = {
  market: 'india',
  // representative Indian climate extremes — ASSUMED, engineer-confirmable
  temps: {
    latBands: [
      { maxAbsLat: 15, label: 'deep south (Kerala/TN coast)', designMinAmbientC: 15, designMaxAmbientC: 40 },
      { maxAbsLat: 20, label: 'Deccan (Pune/Hyderabad/Mumbai)', designMinAmbientC: 8, designMaxAmbientC: 42 },
      { maxAbsLat: 26, label: 'central (Gujarat/MP/Bengal)', designMinAmbientC: 4, designMaxAmbientC: 45 },
      { maxAbsLat: 32, label: 'north plains (Delhi/Punjab/UP)', designMinAmbientC: 0, designMaxAmbientC: 47 },
      { maxAbsLat: 90, label: 'himalayan / high altitude', designMinAmbientC: -10, designMaxAmbientC: 38 },
    ],
    cellRiseC: 30,
    fallbackPmaxCoeffPct: -0.35,
  },
  cable: {
    slackPct: 0.1,
    crossFieldPenalty: 6,
    corridorInsetM: 0.4,
    dcCableMm2: 4,
    copperResistivity: 0.0175, // Ω·mm²/m at ~20 °C
    maxDcDropPct: 2,
    moduleLeadReachM: 1.4,
    defaultVerticalDropM: 3,
  },
  earthing: {
    pitsForSystem: 2,
    pitsForLps: 1,
    stripRunsPerPit: 1,
    interconnectAllowanceM: 30,
    laGroundRunM: 6,
  },
  dcSizing: {
    fuseFactor: 1.56,
    fuseLadder: [10, 12, 15, 20, 25, 30, 32, 40, 50, 63],
    isolatorLadder: [16, 25, 32, 40, 63, 80, 100, 125],
    cableAmpacity: [
      [4, 32],
      [6, 42],
      [10, 57],
    ],
  },
  acSizing: {
    breakerFactor: 1.25,
    breakerLadder: [16, 25, 32, 40, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630],
    // Ascending, and it must REMAIN ascending: the sizer takes the first rung
    // that carries the breaker, so an out-of-order entry silently undersizes.
    // Tops out at 240 mm², which carries the 630 A end of the breaker ladder.
    cableAmpacity: [
      [4, 32],
      [6, 41],
      [10, 55],
      [16, 73],
      [25, 95],
      [35, 117],
      [50, 141],
      [70, 179],
      [95, 216],
      [120, 249],
      [150, 285],
      [185, 324],
      [240, 380],
      [300, 440],
      [400, 500],
    ],
    cableResistanceOhmPerKm: [
      [4, 6.7],
      [6, 4.5],
      [10, 2.7],
      [16, 1.7],
      [25, 1.07],
      [35, 0.77],
      [50, 0.57],
      [70, 0.39],
      [95, 0.28],
      [120, 0.23],
      [150, 0.18],
      [185, 0.15],
      [240, 0.11],
      [300, 0.092],
      [400, 0.073],
    ],
    voltDropLimitPct: 3,
  },
  subsidy: {
    firstSlabPerKwInr: 30000,
    firstSlabKw: 2,
    secondSlabPerKwInr: 18000,
    capInr: 78000,
    capKw: 3,
    requiresDcr: true,
  },
  health: {
    weights: { energy: 40, electrical: 40, utilization: 20 },
    bands: { goodMin: 85, fairMin: 65 },
    validationPenalties: {
      panel_overlap: 30,
      setback_breach: 12,
      shaded: 15,
      voc_high: 35,
      vmp_low: 12,
      imp_high: 10,
      mppt_overflow: 35,
      panel_over_obstruction: 30,
      bridge_clearance: 25,
      bridge_engineer: 8,
      // ── previously unscored (Phase 22) ─────────────────────────────────
      // Panels that exist but generate nothing, and panels placed where they
      // may not be, are as serious as an overlap — they were costing 0.
      unstrung_panels: 30,
      panel_in_keepout: 30,
      isc_high: 35,
      mppt_capacity: 30,
      string_window_empty: 25,
      dc_voltage_drop: 12,
      group_too_small: 8,
      shade_mismatch: 12,
      // a footing in a walkway / obstruction is a build blocker
      foundation_clash: 25,
      foundation_too_tall: 20,
    },
    unknownValidationPenalty: 10,
    insightPenalties: { critical: 25, warning: 12, suggestion: 6, info: 0 },
  },
  wind: {
    // representative dominant IS 875-3 zone per state (m/s); coastal belts
    // and cyclone-prone states carry the higher figure of their zones
    basicWindSpeedMsByState: {
      'Andaman & Nicobar': 55, 'Andhra Pradesh': 50, 'Arunachal Pradesh': 50,
      Assam: 50, Bihar: 47, Chandigarh: 47, Chhattisgarh: 39,
      'Dadra & Nagar Haveli': 44, 'Daman & Diu': 44, Delhi: 47, Goa: 39,
      Gujarat: 50, Haryana: 47, 'Himachal Pradesh': 39, 'Jammu & Kashmir': 39,
      Jharkhand: 47, Karnataka: 39, Kerala: 39, Ladakh: 39, Lakshadweep: 55,
      'Madhya Pradesh': 47, Maharashtra: 44, Manipur: 47, Meghalaya: 50,
      Mizoram: 47, Nagaland: 47, Odisha: 50, Puducherry: 50, Punjab: 47,
      Rajasthan: 47, Sikkim: 47, 'Tamil Nadu': 50, Telangana: 44, Tripura: 50,
      'Uttar Pradesh': 47, Uttarakhand: 39, 'West Bengal': 50,
    },
    highWindMinMs: 47,
  },
  combiner: {
    maxStringsPerBox: 12,
    outputFactor: 1.25,
  },
  financing: {
    loanRatePct: 9.5,
    loanTenureYears: 5,
    loanDownPaymentPct: 20,
    leaseRatePct: 11,
    leaseTenureYears: 10,
    ppaDiscountPct: 20,
    ppaTenureYears: 15,
  },
  // ALL ASSUMED — see FoundationRules. Sizes are conventional, not calculated.
  foundations: {
    concreteDensityKgM3: 2400,
    minLegAboveFoundationM: 0.05,
    // cast PCC pedestal: the rooftop default. 300 × 300 × 150 ≈ 32 kg each,
    // which is why 30 legs is ~1 tonne and needs the dead-load warning.
    pedestal: { shape: 'square', l: 300, w: 300, heightMm: 150, plateMm: 160, plateThkMm: 10 },
    // chemical anchor: plate straight onto the slab, nothing cast
    anchor: { shape: 'square', l: 160, w: 160, heightMm: 0, plateMm: 160, plateThkMm: 8 },
    // precast ballast block — no roof penetration. Count only, never a mass.
    ballast: { shape: 'square', l: 400, w: 300, heightMm: 110, plateMm: 160, plateThkMm: 10 },
    // driven/rammed galvanised post — ground arrays
    pile: { shape: 'circular', d: 90, heightMm: 150, plateMm: 140, plateThkMm: 10, embedMm: 1200 },
  },
  // ALL ASSUMED — see SheetRules. 1.4 m purlin centres and a 200 mm trapezoidal
  // rib are ordinary Indian industrial sheeting, but "ordinary" is not
  // "measured": both must be confirmed on site before anything is drilled.
  sheet: { purlinPitchM: 1.4, ribPitchM: 0.2, minStandoffsPerRail: 2 },
  defaults: {
    roofSetbackM: 0.3,
    groundSetbackM: 1.5,
    groundTiltDeg: 20,
    groundFenceEnabled: true,
    groundGatesPerArea: 1,
    cleaningReachM: 6,
    ladderEdgeM: 2.5,
    inverterClearanceM: 0.9,
    tariffUnknownStateInrPerKwh: 7.5,
    tariffNewProjectInrPerKwh: 8,
    planLimitKw: 10,
  },
};

/**
 * Rule resolution point (§8.10). Today there is one market; later phases pass
 * `project.info` and merge per-state / per-DISCOM overrides here, so consumers
 * are already written against a resolver instead of a constant import.
 */
export function resolveRules(): MarketRules {
  return INDIA_RULES;
}
