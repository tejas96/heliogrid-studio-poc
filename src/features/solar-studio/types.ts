// ─── Solar Design Studio — Domain Model ─────────────────────────────────────
// Every entity in a project. The store, the editors, the 3D scene, the SLD,
// the drawings and the BOM engine all read from this single shape.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Local metric coordinate (meters, East-North frame around project origin). */
export interface XY {
  x: number;
  y: number;
}

// ─── Step 1: Project setup ──────────────────────────────────────────────────

export type SiteType = 'residential' | 'commercial';
export type ConnectionType = 'single' | 'three';
export type ProjectStatus = 'in_progress' | 'proposal_ready';

export interface ProjectInfo {
  name: string;
  customerName: string;
  customerPhone: string; // improvement: proposal delivery
  country: 'India';
  state: string;
  discom: string;
  siteType: SiteType;
  connectionType: ConnectionType;
  sanctionedLoadKw: number;
  groundMount: boolean;
  logoDataUrl: string | null;
  /** improvement: consumption-based sizing */
  monthlyBillInr: number | null;
  tariffInrPerKwh: number;
}

/** One roof plane detected by Google Solar, in OUR angle convention. */
export interface RoofSegmentInsight {
  /** roof pitch in degrees (0 = flat) */
  pitchDeg: number;
  /** azimuth 0 = North, clockwise — same convention as Roof.slopeAzimuthDeg */
  azimuthDeg: number;
  areaM2: number;
  /** segment centroid (lat/lng), for matching to a user-drawn roof */
  center?: LatLng;
}

/** Google Solar API Building Insights subset (enhancement layer). */
export interface SolarInsights {
  status: 'ok' | 'unavailable' | 'error';
  fetchedAt: number;
  message?: string;
  imageryDate?: string; // ISO yyyy-mm-dd
  imageryQuality?: 'HIGH' | 'MEDIUM' | 'BASE';
  maxPanels?: number;
  maxArrayAreaM2?: number;
  maxSunshineHoursPerYear?: number;
  panelCapacityWatts?: number;
  roofAreaM2?: number;
  roofSegmentCount?: number;
  /** per-plane pitch/azimuth Google detected (was discarded before) */
  roofSegments?: RoofSegmentInsight[];
  carbonOffsetFactorKgPerMwh?: number;
}

/**
 * Measured climate for the site — monthly horizontal global irradiation and
 * diffuse fraction from PVGIS (free, no key, global). Absent = fall back to the
 * built-in latitude estimate. All-or-nothing: a partial/invalid payload is
 * dropped, never half-applied.
 */
export interface SiteWeather {
  /** kWh/m²/day, 12 (Jan..Dec) — monthly-mean daily global horizontal */
  monthlyGhi: number[];
  /** 0..1, 12 (Jan..Dec) — diffuse/global ratio (PVGIS Kd) */
  monthlyDiffuseFrac: number[];
  /** kWh/m²/day — annual mean daily GHI (ΣmonthlySum / 365) */
  annualGhi: number;
  /** the pin this was fetched for — guards against stale reuse after a move */
  forLatLng: LatLng;
  source: 'pvgis';
  fetchedAt: number;
  /** PVGIS radiation database used (e.g. PVGIS-ERA5, PVGIS-SARAH3) */
  raddatabase?: string;
  /** distinct years in the climatological record (e.g. 19 for 2005–2023) */
  yearsOfRecord?: number;
}

export interface SiteLocation {
  address: string;
  latLng: LatLng;
  confirmed: boolean;
  /** kWh/m²/day — built-in latitude model, or PVGIS annualGhi once measured */
  irradiance: number;
  peakSunHours: number;
  dataSource: string; // provenance string shown to the user
  /** Google Solar Building Insights, when coverage exists */
  solarInsights?: SolarInsights;
  /** measured PVGIS climate, when the fetch succeeded for this pin */
  weather?: SiteWeather;
}

// ─── Step 2: Roofs ──────────────────────────────────────────────────────────

/**
 * A mounting SURFACE. 'ground' is not a roof — it is a free-field array area at
 * grade (heightM 0, no parapet). It rides the Roof model on purpose: the fill,
 * setbacks, shading, stringing, routing and BOM traceability are all per-surface
 * already, so a separate entity would fork every one of those pipelines (§A0).
 */
/**
 * What the roof is COVERED WITH — never how steep it is.
 *
 * These two facts were conflated: `makeRoof` stamped every roof 'rcc_flat' and
 * the gable/hip/skeleton factories only set `pitchDeg`, so a pitched face
 * claimed to be a flat RCC deck. The fix is NOT a 'sloped_rcc' member — that
 * trades a wrong pitch for a wrong COVERING, and converting a metal shed to a
 * gable would move its faces from clamp pricing to hook pricing in the BOM.
 *
 * So the two facts are answered separately, each by one source of truth:
 *   covering →  this field                (rcc / metal sheet / tile / ground)
 *   pitch    →  `isSloped(roof)`          (lib/roof-plane.ts)
 * A converted face keeps its covering and gains a pitch; nothing is lost.
 *
 * 'rcc_flat' is a legacy WIRE VALUE kept verbatim so stored projects and their
 * fingerprints stay valid. Read it as "RCC slab", flat or pitched — `isSloped`
 * is what says which.
 */
export type RoofType = 'rcc_flat' | 'metal_shed' | 'tile' | 'ground';

export interface ParapetWall {
  enabled: boolean;
  direction: 'outward' | 'inward';
  heightM: number;
  widthM: number;
  /** wall on/off per polygon edge (edge i = vertex i → i+1); null = all edges on */
  perEdge: boolean[] | null;
  /** auto-drop this roof's parapet on edges shared with an equal/higher adjacent roof */
  suppressSharedEdges: boolean;
}

/** Where an entity's geometry came from — honest labeling (§3.5/§3.6). */
export interface EntityProvenance {
  source: 'manual' | 'dataLayers' | 'gemini';
  /** detector confidence 0..1 (absent for manual entities) */
  confidence?: number;
}

export interface Roof {
  id: string;
  name: string;
  /** polygon in local meters, CCW */
  polygon: XY[];
  /** the COVERING (see RoofType). Pitch is `isSloped(roof)`, not this field. */
  roofType: RoofType;
  /** eave (low-side) height from ground; a sloped roof rises from here toward the ridge */
  heightM: number;
  /** roof pitch from horizontal in degrees (0 = flat) */
  pitchDeg: number;
  /** compass direction the roof slopes DOWN toward / panels face (0=N, 90=E, 180=S, 270=W) */
  slopeAzimuthDeg: number;
  /** uniform setback; perEdgeSetbacks overrides when set (improvement) */
  setbackM: number;
  perEdgeSetbacksM: number[] | null;
  parapet: ParapetWall;
  /**
   * Faces created together from ONE footprint (gable = 2, hip = 4, skeleton = N)
   * share this id. They are only a buildable roof while they share one eave
   * height and one pitch — that is what keeps the ridge level and the hips
   * straight — so those two fields propagate across the group on edit
   * (`applyFaceGroupPatch`). slopeAzimuthDeg is genuinely per-face and does NOT
   * propagate.
   *
   * ADDITIVE + OPTIONAL on purpose: absent on every stored project, and absent
   * fields serialize identically, so persisted fingerprints/captures stay valid.
   * A roof without it behaves exactly as it always did (per-roof edits only).
   */
  faceGroupId?: string;
  /** per-roof structure defaults (Phase 7) — overrides project defaults */
  structureOverride?: StructureDefaults;
  /** absent = manual (drawn by hand) */
  provenance?: EntityProvenance;
}

// ─── Step 3: Obstructions ───────────────────────────────────────────────────

export type ObstructionType =
  | 'tank'
  | 'dish'
  | 'chimney'
  | 'tree'
  | 'elevated'
  | 'building'
  | 'solar_wh'
  | 'ladder'
  | 'windmill'
  | 'turbine_vent'
  | 'other';

export type ObstructionShape = 'rect' | 'circle';

export interface Obstruction {
  id: string;
  type: ObstructionType;
  label: string; // e.g. WT1
  roofId: string | null; // null = on ground
  center: XY;
  shape: ObstructionShape;
  lengthM: number; // rect
  widthM: number; // rect
  diameterM: number; // circle
  heightM: number;
  rotationDeg: number;
  setbackM: number;
  castsShadow: boolean;
  blocksPlacement: boolean;
  /** capability OVERRIDES (Phase 7 §26c). Absent fields resolve from the
   *  type preset; the legacy booleans above stay canonical for their two
   *  behaviors (resolveCapabilities maps them) so untouched projects keep
   *  byte-identical fingerprints. Factory-created obstructions write the
   *  full preset here explicitly. */
  capabilities?: Partial<ObstructionCapabilities>;
  /** absent = manual (placed by hand) */
  provenance?: EntityProvenance;
}

/** What a rooftop object permits around/above it (plan §F) — consumed by the
 *  fill's bridging rule, DRC, auto-design decisions and the maintenance
 *  analyzers (Phase 15). */
export interface ObstructionCapabilities {
  /** panels may span ABOVE it when the structure clears heightM + minVertical */
  panelsMayCross: boolean;
  legsAllowedNearby: boolean;
  minVerticalClearanceM: number;
  minHorizontalClearanceM: number;
  maintenanceAccess: 'none' | 'perimeter' | 'top';
  removable: boolean;
  /** chimneys/vents: never cover, regardless of clearance */
  mustRemainOpenToSky: boolean;
  castsAnalyticalShadow: boolean;
  supportsStructuralLoad: boolean;
  /** bridging over this must be flagged for engineer review */
  requiresEngineerConfirmation: boolean;
}

// ─── Step 4: Components ─────────────────────────────────────────────────────

export type CellTech = 'Mono PERC' | 'TOPCon' | 'Bifacial' | 'Poly' | 'HJT';

export interface PanelSpec {
  id: string;
  brand: string;
  model: string;
  watt: number;
  tech: CellTech;
  lengthMm: number;
  widthMm: number;
  vocV: number;
  vmpV: number;
  iscA: number;
  impA: number;
  /** temp coefficient of Voc, %/°C (negative) */
  tempCoeffVocPct: number;
  /**
   * Pmax/Vmp temperature coefficient (%/°C, negative). OPTIONAL: datasheets
   * carry it but the seed catalog predates the field, so string sizing falls
   * back to the market rule's value and LABELS the window "estimated"
   * (lib/electrical/temps.ts). Never reuse tempCoeffVocPct for Vmp — it is
   * materially smaller and inflates the usable window.
   */
  tempCoeffPmaxPct?: number;
  almm: boolean;
  dcr: boolean;
  priceInr: number;
  /** performance warranty, years — optional: user-imported specs may omit it */
  warrantyYears?: number;
  /** module mass, kg — drives the install-complexity column in comparisons */
  weightKg?: number;
  availability?: 'in_stock' | 'on_order';
}

export interface MpptSpec {
  count: number;
  minV: number;
  maxV: number;
  maxCurrentA: number;
  stringsPerMppt: number;
}

export interface InverterSpec {
  id: string;
  brand: string;
  model: string;
  acKw: number;
  phases: 1 | 3;
  mppt: MpptSpec;
  maxDcV: number;
  efficiencyPct: number;
  priceInr: number;
  /** product warranty, years — optional: user-imported specs may omit it */
  warrantyYears?: number;
}

/**
 * DC collection topology. 'string' = strings go straight to inverter MPPTs
 * (residential/small C&I, today's default). 'central' = strings are paralleled
 * through fused string-combiner boxes (SCB/AJB) before the inverter DC bus —
 * the standard large-C&I / ground-mount arrangement.
 */
export type InverterTopology = 'string' | 'central';

/**
 * Module-level power electronics. 'optimizer' = a DC optimiser per module, so
 * every module tracks its own MPP — orientation, tilt and shading no longer
 * constrain what may share a series string (the reason a multi-face hip roof
 * can otherwise strand a whole face). 'none' = plain string wiring.
 */
export type MlpeKind = 'none' | 'optimizer';

export interface Components {
  panel: PanelSpec | null;
  targetKwp: number;
  inverter: InverterSpec | null;
  inverterCount: number;
  /** DC collection topology; absent ⇒ 'string' (back-compat) */
  inverterTopology?: InverterTopology;
  /** module-level power electronics; absent ⇒ 'none' (back-compat) */
  mlpe?: MlpeKind;
}

// ─── Steps 5–6: Layout & electrical ─────────────────────────────────────────

export type PanelOrientation = 'portrait' | 'landscape';

// ─── Parametric arrays + keepouts (research-validated: HelioScope/Aurora/OpenSolar) ──

/** Cross-section family. Drives both the extruded 3D geometry and the glyph. */
export type SectionShape = 'c' | 'u' | 'l' | 'z' | 'hat' | 'rhs' | 'chs';

/**
 * Machine-readable section dimensions in MILLIMETRES.
 *
 * This is the single source the geometry, the glyph and the spec string all read,
 * so a section can never *look* like one thing and be *quoted* as another.
 *
 *   h    overall depth (web height); for `chs` this is the outside diameter
 *   b    flange width (unused for `chs`)
 *   t    wall / material thickness
 *   lip  return lip on `c`, brim on `hat`
 *
 * These must stay consistent with `kgPerM`: a profile test asserts that the
 * extruded cross-sectional area × 7850 kg/m³ lands within 3% of the declared
 * mass. Change one without the other and the 3D model stops describing the
 * steel we price.
 */
export interface SectionDims {
  h: number;
  b?: number;
  t: number;
  lip?: number;
  shape: SectionShape;
}

/** Structural steel section for the mounting structure; kgPerM → BOM tonnage. */
export interface StructureProfile {
  key: string; // 'c_channel' | 'z_purlin' | 'rhs' | …
  label: string; // 'C-Channel (Lip)'
  kgPerM: number;
  /** LAZY (Phase 22a): absent on profiles authored before the catalog gained
   *  geometry. Consumers fall back to a plain box, exactly as before. */
  dims?: SectionDims;
  /** human-readable section, e.g. '80 × 40 × 15 × 2.5' — derived from `dims` */
  sectionMm?: string;
  isGrade?: string; // 'IS 2062'
  coating?: string; // 'HDG ≥ 80 µm'
}

/** How an array is mounted; tilt behaviour follows the kind (verified). */
/**
 * How a table is held down. The first two are rooftop; the last two are ground,
 * where you found INTO the earth rather than onto a slab:
 *   anchor    chemical/expansion anchors into an RCC roof
 *   ballast   dead weight, no penetration (roof or hard standing)
 *   pile      driven/rammed galvanised post — the ground-mount default
 *   concrete  cast-in-situ pedestal, for rock or poor bearing soil
 */
export type FoundationKind = 'anchor' | 'ballast' | 'pile' | 'concrete';

/**
 * How a cast foundation is formed. Both are ordinary Indian practice and the
 * choice is NOT cosmetic: volume differs by π/4 (a circular pedestal is ~21%
 * less concrete than a square one of the same nominal size), and that figure
 * feeds both the concrete BOM line and the added-dead-load warning.
 *   square    plank shuttering — the common rooftop PCC pedestal
 *   circular  sono-tube / pipe shuttering — also the usual ground pier
 */
export type FoundationShape = 'square' | 'circular';

export type RackingSpec =
  | { kind: 'flush' } // pitched roof: coplanar, no self-shade, hotter
  | {
      kind: 'fixed_tilt' | 'dual_tilt'; // flat roof: elevated
      tiltDeg: number;
      rowPitchM: number; // centre-to-centre; GCR solver fills this (Phase 3)
      frontLegM: number;
      backLegM: number; // = frontLegM + slant·sin(tilt)
      profile: StructureProfile;
      /** LAZY fields (Phase 7): absent = resolved from roof/project defaults
       *  at READ time (resolveRacking) — only explicit edits write them, so
       *  existing projects' fingerprints (and captures) stay untouched. */
      legSpacingM?: number;
      foundation?: FoundationKind;
      /** Shuttering form for a CAST foundation. Lazy like its siblings: absent
       *  resolves from rule config, so untouched projects fingerprint
       *  byte-identically. Only meaningful for `concrete` — ballast is precast
       *  rectangular, a pile is driven round. */
      foundationShape?: FoundationShape;
      /** walk-under etc: raises the effective front-leg height */
      clearanceM?: number;

      // ── Parametric structure (Phase 22g) ──────────────────────────────────
      // All LAZY, all defaulting to exactly today's hardcoded behaviour, so a
      // segment that sets none of them builds a byte-identical graph. That is
      // the gate: `layoutFp` JSON.stringify's this whole object, so any field
      // that appeared with a value — even its own default — would re-key every
      // existing project and stale its captures.
      /**
       * Per-member-class sections. One table can legitimately mix them: a
       * heavier leg carrying load to the deck, a lighter purlin spanning
       * module-to-module. Absent classes fall back to `profile`.
       */
      profiles?: {
        legs?: StructureProfile;
        rafters?: StructureProfile;
        purlins?: StructureProfile;
      };
      /** explicit rafter count per run; absent ⇒ one per leg station */
      rafterCount?: number;
      /**
       * Rafter DENSITY as a multiple of leg stations. Deliberately NOT called a
       * safety factor: this tool performs no structural analysis (§F), so it
       * buys material, not capacity. The competitor control this mirrors is
       * labelled "set 1.5 to add 50% safety margin", which invites a user to
       * invent an engineering margin in a tool that cannot compute one.
       */
      rafterMultiplier?: number;
      /** purlins spanning each run; absent ⇒ 2 (front and back module edges) */
      purlinCount?: number;
      /** overhang past the end legs for rafters/purlins; absent ⇒ 0 */
      endBufferM?: number;
      /** false removes longitudinal braces and their bolts; absent ⇒ braced */
      bracing?: boolean;
      /** cutting allowance on structural steel, % — priced, not modelled */
      structureWastePct?: number;
    };

/** Structure defaults, resolved structureDefaults → roof.structureOverride →
 *  segment.racking (most specific wins). All optional — absence = built-ins. */
export interface StructureDefaults {
  profileKey?: string;
  legSpacingM?: number;
  foundation?: FoundationKind;
  foundationShape?: FoundationShape;
  clearanceM?: number;
}

/**
 * A drawn region that GENERATES modules by keepout-aware fill ("Field Segment").
 * Panels stay materialised in Project.panels; this is the grouping layer over them.
 */
export interface ArraySegment {
  id: string;
  roofId: string;
  label: string; // auto 'A1','A2'… (assigned on insert)
  polygon: XY[]; // fill region, local metres (rectangle ⇒ a "table")
  rows: number;
  cols: number;
  orientation: PanelOrientation;
  azimuthDeg: number;
  racking: RackingSpec;
  moduleGapM: number;
  removed: number[]; // fill-cell ids toggled OFF → holes. JSON-safe (not a Set)
}

/** ONE primitive for exclusion AND shade — carries a height (verified). */
export type KeepoutKind = 'obstruction' | 'walkway' | 'fire_setback' | 'shade';
export interface Keepout {
  id: string;
  roofId: string | null;
  shape: XY[]; // polygon; circles sampled to a polygon at creation
  heightM: number; // 0 = pure setback/lane; >0 = shade caster
  kind: KeepoutKind;
}

export interface PlacedPanel {
  id: string;
  roofId: string;
  center: XY;
  orientation: PanelOrientation;
  azimuthDeg: number; // 180 = facing south
  tiltDeg: number;
  /** filled by 3D solar-access analysis, 0..1 */
  solarAccess: number;
  enabled: boolean;
  /** link to its ArraySegment; undefined = loose panel */
  segmentId?: string;
  /** encodes (row,col): row*COL_STRIDE + col (see lib/layout.ts) */
  cellIndex?: number;
}

export interface Walkway {
  id: string;
  roofId: string;
  a: XY;
  b: XY;
  widthMm: number;
  heightMm: number;
}

export interface SafetyRail {
  id: string;
  roofId: string;
  a: XY;
  b: XY;
  heightMm: number;
}

export interface LightningArrester {
  id: string;
  roofId: string;
  pos: XY;
  heightMm: number;
}

export interface InverterPlacement {
  id: string;
  /** wall index of the roof polygon edge it hangs on */
  roofId: string;
  edgeIndex: number;
  /** 0..1 along the edge */
  t: number;
  heightM: number;
}

/**
 * A physical conductor run (plan §F2). Cable is BOUGHT by the metre along a
 * path that exists on the roof — not guessed from a panel count — so this is
 * the object BOM quantities must derive from.
 */
export interface CableRoute {
  id: string;
  kind: 'string_homerun' | 'inverter_ac' | 'earth_conductor';
  /** what it connects, for traceability back to the design */
  fromRef: string;
  toRef: string;
  /** plan-frame polyline INCLUDING both endpoints */
  waypoints: XY[];
  /** vertical descents along the run (roof edge drops, m) */
  verticalDropM: number;
  /** installation slack as a fraction (0.1 = +10%) */
  slackPct: number;
  /** true when the user has hand-edited the path — auto-routing must not stomp it */
  manual?: boolean;
}

export interface StringDef {
  id: string;
  name: string;
  inverterIndex: number;
  mpptIndex: number;
  panelIds: string[];
  color: string;
}

// ─── Step 7: Proposal captures ──────────────────────────────────────────────

export interface ShadowCapture {
  id: string;
  label: string;
  dateIso: string; // e.g. 2026-06-21
  hour: number;
  mode: 'shadow' | 'solar_access';
  /** rendered image in the IndexedDB blob store (lib/persistence/blobs) */
  imageBlobId: string | null;
  /**
   * @deprecated schema-v1 inline base64 — hoisted into the blob store on
   * load (lib/persistence/repository). Always null after hydration.
   */
  imageDataUrl?: string | null;
  /**
   * lib/fingerprints layoutFp of the design when this was captured.
   * Mismatch with the current layoutFp ⇒ the image shows an outdated design
   * (stale badge; retake flow in Phase 12). null = legacy capture (stale).
   */
  forLayoutFp: string | null;
}

// ─── Energy & financials ────────────────────────────────────────────────────

export interface LossItem {
  key: string;
  label: string;
  pct: number;
}

export interface EnergyReport {
  capacityKwp: number;
  panelCount: number;
  roofAreaM2: number;
  /** mean plane-of-array factor from panel tilt/azimuth (1 = horizontal) */
  poaFactor: number;
  annualMwh: number;
  /** unrounded annual energy — the basis annualMwh rounds; per-panel shares
   *  split THIS so the inspector and the report can't drift by rounding */
  annualKwh: number;
  specificYield: number;
  performanceRatio: number;
  monthlyKwh: number[]; // Jan..Dec
  monsoonMonths: number[]; // month indices
  losses: LossItem[];
  totalLossPct: number;
  avgSolarAccessPct: number;
  lifetimeMwh25: number;
  year25Mwh: number;
  degradationPctPerYear: number;
  /** provenance of the irradiance driving these numbers, for honest labeling */
  irradianceSource?: 'PVGIS' | 'estimate';
}

export interface FinancialSummary {
  systemCostInr: number;
  subsidyInr: number;
  netCostInr: number;
  annualSavingsInr: number;
  paybackYears: number;
  savings25YrInr: number;
  /**
   * @deprecated A bare EMI on the FULL net cost (no down payment). Superseded by
   * lib/financing.ts `computeFinancing`, whose loan option applies the rule-config
   * down payment — showing both produced two different "monthly" figures for one
   * system. Nothing renders this any more; use the financing model instead.
   */
  emiPerMonthInr: number;
  tariffEscalationPct: number;
}

// ─── BOM (improvement — first-class artifact) ───────────────────────────────

export type BomCategory =
  | 'Modules'
  | 'Inverter'
  | 'Electrical BOS'
  | 'Mechanical BOS'
  | 'Safety'
  | 'Civil & Misc';

/**
 * ONE edited field of a derived BOM line.
 *
 * `autoAtEdit` records what the engine was saying at the moment the user
 * overrode it. That single field does three jobs:
 *   · staleness detection is a comparison, not a separate subsystem — if the
 *     engine now says something different, the override is stale;
 *   · "refresh from design" is just deleting the entry;
 *   · the user can be shown what they overrode, not merely that they did.
 */
export interface BomFieldOverride {
  value: unknown;
  autoAtEdit: unknown;
}

/**
 * Edits attached to a derived line, keyed by its STABLE line key (Phase 22b).
 *
 * The old model replaced the whole line, so editing `qty` also froze `spec`,
 * `unitPriceInr` and — worst — `formula`, leaving a line whose stated
 * derivation no longer produced the number beside it. Per-field edits leave
 * everything untouched live.
 */
export interface BomOverride {
  lineKey: string;
  fields: Record<string, BomFieldOverride>;
}

/** Derivation inputs the user can set for a whole BOM section (Phase 22e). */
export interface BomInputs {
  /** average array → inverter DC run, m */
  avgDcRunM?: number;
  /** average inverter → LT panel AC run, m */
  avgAcRunM?: number;
}

export interface BomState {
  overrides: BomOverride[];
  /** lines the user added by hand; these are not derived from anything */
  custom: BomLine[];
  inputs?: BomInputs;
}

export interface BomLine {
  id: string;
  category: BomCategory;
  item: string;
  spec: string;
  qty: number;
  unit: string;
  unitPriceInr: number;
  /** human-readable derivation, shown as tooltip */
  formula: string;
  /**
   * How trustworthy the QUANTITY is (plan §F3). A line is only as strong as its
   * weakest input, so this drives the BOM's "preliminary vs site-verified"
   * header and the proposal's site-verification warning:
   *   measured  — a direct count of placed objects (modules, inverters)
   *   derived   — computed from the design geometry (routed cable, tonnage)
   *   estimated — a labelled fallback where geometry is not yet available
   *   assumed   — depends on a fact the model does not hold (soil resistivity,
   *               LPS risk class, meter position) — an engineer must confirm
   */
  confidence: 'measured' | 'derived' | 'estimated' | 'assumed';
  /** design objects this line came from — for BOM↔3D focus (Phase 10 §F3) */
  sourceRoofId?: string;
  sourceSegmentId?: string;
  /**
   * PROCUREMENT fields (Phase 22d). Optional on the type so hand-written lines
   * still construct, but always populated by `line()`; readers default them.
   */
  /** false = shown but supplied by others — contributes nothing to any total */
  included?: boolean;
  /** cutting/pulling allowance, % of qty. A counted item is 0, not padded. */
  wastePct?: number;
  gstPct?: number;
  brand?: string;
  /** HSN/SAC code, when the org tracks one */
  hsn?: string;
  /** auto lines re-sync when design changes; custom lines don't */
  auto: boolean;
  overridden: boolean;
  /** field names carrying a user override — drives the per-field reset icon */
  overriddenFields?: string[];
  /** overridden fields whose derived value has since MOVED (Phase 22e) */
  staleFields?: string[];
}

// ─── Pricing ────────────────────────────────────────────────────────────────

/** Commercial settings that must drive BOTH the BOM table and the financials. */
export interface PricingSettings {
  /** installer margin % applied on the BOM subtotal (persisted — single money path) */
  marginPct: number;
}

// ─── SLD parameters ─────────────────────────────────────────────────────────

export interface SldParams {
  inverterLabel: string;
  acRatingKw: number;
  dcCableSizeMm2: number;
  dcFuseA: number;
  dcSpdType: string;
  dcIsolatorA: number;
  acCableSizeMm2: number;
  acCableType: string;
  mccbA: number;
  acSpdType: string;
  acIsolatorA: number;
  standard: string;
  /** worst-case DC system voltage: longest string × module Voc at the site's
   *  design MIN temperature (cold Voc rises) — the number a CEIG inspector
   *  checks against the inverter's max DC input */
  maxSystemVdc: number;
  /** the inverter's max DC input voltage that maxSystemVdc must stay under */
  inverterMaxDcV: number;
  /** false ⇒ the longest string over-volts the inverter when cold (a fault) */
  voltageWithinLimit: boolean;
  /** longest series length on the sheet (the string that sets maxSystemVdc) */
  maxStringLength: number;
  /** number of inverters — the sheet notes when the block represents several */
  inverterCount: number;
}

// ─── Auto-design decision log (§3.5 explainability) ─────────────────────────

/** One automated design choice, recorded so the "why?" UI can explain it. */
export interface DesignDecision {
  id: string;
  topic: string;
  choice: string;
  reason: string;
  /** the project data that drove it */
  inputs: string[];
}

// ─── Site calibration (§A0 measurement integrity) ───────────────────────────

/**
 * Ground-truth correction for the traced geometry. Satellite tiles carry a
 * few percent of scale error and are not always exactly north-up; one trusted
 * site measurement corrects EVERYTHING derived from the imagery.
 */
export interface Calibration {
  /**
   * Cumulative image-projector correction. The satellite tile's world span is
   * spanM × scaleFactor, so after a rescale the imagery still sits exactly
   * under the corrected geometry. 1 = uncalibrated.
   */
  scaleFactor: number;
  /**
   * Degrees TRUE north lies clockwise of the image's up axis. Rotates the
   * sun frame (engine sampling, visual sun, sun path, heatmap) and the north
   * badge. 0 = image is north-up (the static-tile default).
   */
  northOffsetDeg: number;
  /** the measurement that produced scaleFactor — provenance for the report */
  reference: { a: XY; b: XY; knownDistanceM: number } | null;
}

// ─── Derived-state stamps & override layers ─────────────────────────────────

/**
 * Bookkeeping for DERIVED data that must persist (expensive async results and
 * user override layers). Never authored directly by a screen — stamped by the
 * recompute host (useDesignSync) or written through a dedicated override UI.
 */
export interface DerivedState {
  /**
   * lib/fingerprints shadingFp of the geometry the persisted per-panel
   * `solarAccess` values were computed for. Mismatch ⇒ numbers are provisional
   * (recompute in flight); null = never computed (legacy project / fresh edit).
   */
  solarAccessFp: string | null;
  /**
   * User edits on top of the DERIVED SLD parameters (only the fields the user
   * actually changed — same pattern as bomOverrides over the auto BOM). null =
   * untouched, the sheet always shows freshly derived values.
   */
  sldOverrides: Partial<SldParams> | null;
  /** the SLD intro dialog was acknowledged for this project */
  sldIntroSeen: boolean;
  /**
   * Last stamped Health Score (lib/health.ts) + the one before it, for
   * "why did it change" attribution. Keyed on the COMPOSITE health key
   * (designFp + solarAccessFp + insightState) — designFp alone misses
   * shading-stamp and dismissed-advice changes. Stamped by useHealthSync,
   * never authored by a screen. null = never scored.
   */
  healthSnapshot: { current: HealthSnapshotEntry; prev: HealthSnapshotEntry | null } | null;
}

/** Serializable per-stamp health record — per-category code lists make the
 *  delta explainable by NAME, not just by number. */
export interface HealthSnapshotEntry {
  key: string;
  total: number | null;
  /** stamped while the shading recompute was still in flight (optimistic) */
  provisional?: boolean;
  categories: { key: 'energy' | 'electrical' | 'utilization'; score: number | null; codes: string[] }[];
}

// ─── Project root ───────────────────────────────────────────────────────────

export interface Project {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: ProjectStatus;
  wizardStep: number; // last visited step 1..10
  info: ProjectInfo;
  location: SiteLocation | null;
  roofs: Roof[];
  obstructions: Obstruction[];
  components: Components;
  panels: PlacedPanel[];
  segments: ArraySegment[];
  keepouts: Keepout[];
  walkways: Walkway[];
  rails: SafetyRail[];
  arresters: LightningArrester[];
  inverterPlacements: InverterPlacement[];
  /**
   * Where the supply meets the grid — meter / service entry, in plan metres.
   * OPTIONAL BY DESIGN. Aurora models this because a permit plan set must show
   * it; a phone-in-hand quote never knows it. Placed ⇒ the AC run is measured
   * like the DC runs. Absent ⇒ the BOM keeps its LABELLED allowance and says
   * so, rather than inventing a length (plan §F2).
   */
  gridConnection?: { pos: XY } | null;
  /** routed conductor runs; empty until the router has run (additive migration) */
  cableRoutes?: CableRoute[];
  strings: StringDef[];
  captures: ShadowCapture[];
  /** proposal cover image in the IndexedDB blob store */
  coverImageBlobId: string | null;
  /**
   * @deprecated schema-v1 inline base64 cover — hoisted into the blob store
   * on load. Always null after hydration.
   */
  coverImage?: string | null;
  /** layoutFp when the cover was captured — mismatch ⇒ stale cover badge */
  coverForLayoutFp: string | null;
  /**
   * @deprecated migrated into `derived.sldOverrides` (normalizeProject);
   * kept only so old saved payloads still parse. Always null after load.
   */
  sldParams: SldParams | null;
  /**
   * LEGACY whole-line overrides. Superseded by `bom` (Phase 22c) and migrated
   * on load; kept on the type so a project saved before the migration still
   * parses. New code must not write here.
   */
  bomOverrides: BomLine[];
  /** Per-field BOM edits, custom lines and section inputs (Phase 22c). */
  bom?: BomState;
  pricing: PricingSettings;
  derived: DerivedState;
  calibration: Calibration;
  /** decision log of the last auto-design run (renders the "why?" sheet) */
  designLog?: DesignDecision[];
  /**
   * User decisions on Copilot insights, keyed by Insight.key (lib/insights).
   * 'ignored' hides the insight until the underlying finding changes;
   * 'accepted' keeps it visible as acknowledged. Deliberately OUTSIDE the
   * fingerprint graph — dismissing advice never stales derived data.
   */
  insightState: Record<string, 'accepted' | 'ignored'>;
  /**
   * Installer tick-boxes, keyed by the STRUCTURAL step id from
   * lib/installation. Progress only — the plan itself is always derived, so a
   * design change re-derives the steps and any id that still exists keeps its
   * tick. Optional: absent on every project created before Phase 16.
   */
  installation?: { stepStates: Record<string, boolean> };
  /** project-wide structure defaults (Phase 7) — segment racking wins */
  structureDefaults?: StructureDefaults;
  /** engineer sign-off gate for structure outputs (plan §F boundary) —
   *  absent = pending. NEVER a calculation: a human engineer flips this. */
  structuralVerification?: { status: 'pending' | 'engineer_approved'; notes: string };
  shareId: string;
}

export type UnitSystem = 'metric' | 'imperial';

export interface AppUser {
  phone: string;
  companyName: string;
  language: 'en' | 'hi' | 'th' | 'vi';
  units: UnitSystem;
}

// ─── Validation (improvement: live electrical checks) ──────────────────────

export type ValidationLevel = 'ok' | 'warn' | 'error';

export interface ValidationIssue {
  level: ValidationLevel;
  code: string;
  message: string;
  /** panels this issue points at — click an issue to select/locate them */
  focusPanelIds?: string[];
}
