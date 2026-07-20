// ─── Parametric mounting-structure model (Phase 7, plan §F task 26) ──────────
// The member/node graph is the PARAMETRIC OWNER of the structure (§A0): BOM
// tonnage, fastener counts, the 3D render and the picker previews all derive
// from THIS graph — never from a visual mesh.
//
// Determinism contract: ids are STRUCTURAL (`${seg.id}/m/rafter/2`), derived
// from the persisted segment id + grid indices — never crypto.randomUUID. The
// graph is a pure function of (segment, panels, roof, resolvedRacking); it is
// Class-derived and NEVER persisted.
//
// Boundary (plan §F, non-negotiable): this is MATERIAL ESTIMATION and
// visual/parametric modeling only — no wind-load, roof-strength, anchoring or
// uplift calculation exists or is claimed. See STRUCTURE_DISCLAIMER.
import type {
  FoundationKind,
  FoundationShape,
  ArraySegment,
  PanelSpec,
  PlacedPanel,
  Project,
  Roof,
  StructureProfile,
  XY,
} from '../types';
import { COL_STRIDE, panelFootprintM } from './layout';
import { resolveRules } from '../data/rules/india';
import { ruleFor } from './foundation';
import { rotate } from './geo';
import { segmentFrameAngle } from './segment-ops';
import { isSloped } from './roof-plane';
import { STRUCTURE_PROFILES } from '../data/profiles';

/**
 * Vertical offset from the member AXIS plane (leg tops = rafter/purlin
 * centrelines) to the module CENTRE plane: rafter half-section 0.03 m +
 * frame/clamp stack ≈ 0.05 m. The renderer must lift modules by this or the
 * members' top halves pierce the glass (white strips through the panels).
 */
export const MODULE_STANDOFF_M = 0.08;

/** Engineer sign-off state for structure outputs — the label every
 *  engineering surface (BOM/drawings/proposal) renders. */
export function engineeringStatus(project: Project): {
  approved: boolean;
  label: string;
  notes: string;
} {
  const v = project.structuralVerification;
  return v?.status === 'engineer_approved'
    ? { approved: true, label: 'Engineer approved', notes: v.notes }
    : { approved: false, label: 'PRELIMINARY — pending engineer verification', notes: v?.notes ?? '' };
}

/** IS 875 wind-zone FLAG for a state (display only, per plan §F). */
export function windZoneInfo(state: string): {
  speedMs: number | null;
  high: boolean;
  label: string | null;
} {
  const rules = resolveRules().wind;
  const speedMs = rules.basicWindSpeedMsByState[state] ?? null;
  if (speedMs === null) return { speedMs: null, high: false, label: null };
  const high = speedMs >= rules.highWindMinMs;
  return {
    speedMs,
    high,
    label: high
      ? `High-wind zone (IS 875 basic wind speed ${speedMs} m/s) — engineer verification mandatory`
      : `IS 875 basic wind speed ${speedMs} m/s (representative)`,
  };
}


export const STRUCTURE_DISCLAIMER =
  'Structural design subject to certified engineer verification (IS 875 wind load, roof capacity, anchoring).';

// built-in fallbacks for the lazy resolution chain
const DEFAULT_LEG_SPACING_M = 2.0;
// Rooftop tables are anchored into the slab. A ground table cannot be — there
// is no slab — so it founds into the earth on a driven pile by default. This
// is a DEFAULT only: `foundation` stays a lazy field, so nothing is written to
// existing projects and no fingerprint (or capture) changes.
// D12: a rooftop table founds on a CAST PCC PEDESTAL by default, not a bare
// plate chemically anchored through the slab. Three reasons, in order of how
// often they decide it on a real job:
//   · waterproofing — anchoring penetrates the membrane, and many building
//     owners (and almost every leased roof) simply refuse that;
//   · ponding — a pedestal lifts the plate and its bolts clear of standing
//     water through monsoon;
//   · cost — cheaper per leg at scale than cartridges + bolts.
// It is also what the reference tools model, and it is why the base looked
// empty before: `anchor` has nothing to draw.
//
// ⚠️ This ADDS DEAD LOAD to the slab (~32 kg per leg) and we do NOT check roof
// capacity (§F). buildStructure reports the total so the DRC can warn.
const DEFAULT_FOUNDATION = 'concrete' as const;
const DEFAULT_GROUND_FOUNDATION = 'pile' as const;
/**
 * A tilted table on a METAL SHED founds on the sheet, not on a footing.
 *
 * You cannot cast a pedestal on corrugated steel and you do not ballast a shed
 * roof — the load goes through the purlins, not a slab. Before this, a shed
 * inherited the rooftop default (a 150 mm PCC pedestal as of 22a) and rendered
 * concrete blocks sitting on trapezoidal sheeting, with the concrete volume and
 * dead-load warning to match. E1.
 */
const DEFAULT_SHEET_FOUNDATION = 'anchor' as const;

export interface ResolvedRacking {
  kind: 'fixed_tilt' | 'dual_tilt';
  tiltDeg: number;
  /** effective low-edge leg height (clearanceM wins when larger) */
  frontLegM: number;
  /** ALWAYS front + moduleRise — repairs legacy fill segments that persisted
   *  backLegM=0.3 without ever rewriting stored bytes (capture-stale safe) */
  backLegM: number;
  profile: StructureProfile;
  legSpacingM: number;
  foundation: FoundationKind;
  /** shuttering form for a cast foundation — see FoundationShape */
  foundationShape: FoundationShape;

  // ── Parametric structure (Phase 22g), all pre-resolved ───────────────────
  /** section for one member class; falls back to `profile` per class */
  profileFor: (kind: MemberKind) => StructureProfile;
  /** explicit rafters per run; undefined ⇒ derive from stations × multiplier */
  rafterCount?: number;
  /** rafter density multiplier — MATERIAL allowance, never a safety factor */
  rafterMultiplier: number;
  purlinCount: number;
  endBufferM: number;
  /** false ⇒ emit no braces and no brace bolts */
  bracing: boolean;
  structureWastePct?: number;
}

/**
 * Effective racking for a segment: segment.racking → roof.structureOverride →
 * project.structureDefaults → built-ins. Returns null for flush racking
 * (no structure model — flush/metal-shed keep their flat BOM treatment).
 */
export function resolveRacking(
  project: Project,
  roof: Roof,
  seg: ArraySegment,
  spec: PanelSpec,
): ResolvedRacking | null {
  const r = seg.racking;
  if (r.kind === 'flush') return null;
  // the v1 topology assumes a FLAT deck — no member model on pitched roofs
  // (an elevated kind there falls back to the flat per-panel BOM line)
  if (roof.pitchDeg > 0) return null;
  const roofO = roof.structureOverride;
  const projD = project.structureDefaults;
  const clearance = r.clearanceM ?? roofO?.clearanceM ?? projD?.clearanceM ?? 0;
  const frontLegM = Math.max(r.frontLegM, clearance);
  const { h } = panelFootprintM(spec, seg.orientation);
  const rise = h * Math.sin((r.tiltDeg * Math.PI) / 180);
  const wanted =
    r.foundation ??
    roofO?.foundation ??
    projD?.foundation ??
    (roof.roofType === 'ground'
      ? DEFAULT_GROUND_FOUNDATION
      : roof.roofType === 'metal_shed'
        ? DEFAULT_SHEET_FOUNDATION
        : DEFAULT_FOUNDATION);
  // CLAMP to what this surface can carry. A persisted value the surface cannot
  // take is not honoured — it is corrected, at read time, so an existing
  // project stops drawing and pricing a foundation that cannot be built there.
  // Read-time means nothing is rewritten: change the roof back and the stored
  // preference returns.
  const allowed = allowedFoundations(roof, seg);
  const foundation = allowed.length === 0 || allowed.includes(wanted) ? wanted : allowed[0];
  return {
    kind: r.kind,
    tiltDeg: r.tiltDeg,
    frontLegM,
    backLegM: frontLegM + rise,
    profile: r.profile,
    legSpacingM: r.legSpacingM ?? roofO?.legSpacingM ?? projD?.legSpacingM ?? DEFAULT_LEG_SPACING_M,
    foundation,
    // same lazy chain; absent falls through to whatever the rule config says
    // this kind is normally formed as, so untouched projects are unchanged
    foundationShape:
      r.foundationShape ??
      roofO?.foundationShape ??
      projD?.foundationShape ??
      ruleFor(foundation).shape,

    // ── Phase 22g parametrics ────────────────────────────────────────────────
    // Every default below reproduces the hardcode it replaced, so a segment
    // that sets none of them yields the graph the golden snapshot pins.
    profileFor: (kind: MemberKind) => {
      const p = r.profiles;
      if (!p) return r.profile;
      if (kind === 'front_leg' || kind === 'back_leg') return p.legs ?? r.profile;
      if (kind === 'rafter') return p.rafters ?? r.profile;
      if (kind === 'purlin') return p.purlins ?? r.profile;
      return r.profile; // a brace follows the table's base section
    },
    rafterCount: r.rafterCount,
    rafterMultiplier: r.rafterMultiplier ?? 1,
    purlinCount: r.purlinCount ?? 2,
    endBufferM: r.endBufferM ?? 0,
    bracing: r.bracing !== false,
    structureWastePct: r.structureWastePct,
  };
}

/**
 * The parametric half of a ResolvedRacking at its defaults (22g).
 *
 * Exported so the handful of places that construct a racking by hand — preview
 * thumbnails, tests — get the same defaults `resolveRacking` applies instead of
 * each pasting its own copy. A second copy is a second thing to forget to
 * update, and these defaults are load-bearing: they are what makes an untouched
 * segment build a byte-identical graph.
 */
export function defaultStructureParams(
  profile: StructureProfile,
): Pick<
  ResolvedRacking,
  'profileFor' | 'rafterMultiplier' | 'purlinCount' | 'endBufferM' | 'bracing'
> {
  return {
    profileFor: () => profile,
    rafterMultiplier: 1,
    purlinCount: 2,
    endBufferM: 0,
    bracing: true,
  };
}

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export type MemberKind =
  | 'front_leg'
  | 'back_leg'
  | 'rafter'
  | 'purlin'
  | 'brace'
  /** metal-shed monorail: a rail running along a module row, on standoffs */
  | 'rail';
export type NodeKind =
  | 'roof_anchor' // leg base: base plate + anchors (or ballast block)
  | 'leg_rafter' // leg top → rafter bolt joint
  | 'rafter_purlin' // purlin resting on a rafter
  | 'panel_clamp_end'
  | 'panel_clamp_mid'
  | 'brace_bolt'
  /** L-foot through the sheet crown into the purlin, with a sealing washer */
  | 'sheet_standoff';

export interface Member {
  id: string; // `${seg.id}/m/<kind>/<idx>` — structural, deterministic
  kind: MemberKind;
  profileKey: string;
  a: XYZ;
  b: XYZ;
  lengthM: number;
}

export interface StructureNode {
  id: string; // `${seg.id}/n/<kind>/<idx>`
  kind: NodeKind;
  position: XYZ;
  memberIds: string[];
  /** hardware at this node — Σ over nodes = the fastener BOM */
  fastenerSpec: {
    anchors?: number;
    plates?: number;
    bolts?: number;
    clamps?: number;
    ballast?: number;
    /** driven/rammed galvanised post (ground) */
    piles?: number;
    /** cast-in-situ concrete pedestal (ground) */
    pedestals?: number;
    /** metal shed: L-foot fixed through the sheet into the purlin below */
    standoffs?: number;
    /** EPDM washer under every sheet penetration — the waterproofing */
    sealingWashers?: number;
  };
}

export interface SegmentStructure {
  segmentId: string;
  members: Member[];
  nodes: StructureNode[];
  /** the resolved foundation this table stands on — stamped here so the
   *  renderer, the DRC and the BOM all read ONE answer (§A0) rather than each
   *  re-deriving it from fastenerSpec and drifting */
  foundation: FoundationKind;
  foundationShape: FoundationShape;
  steelKg: number;
  /** total member metres per kind — the BOM formula breakdown */
  memberSummary: Record<MemberKind, { count: number; totalM: number }>;
  warnings: string[];
}

const rnd = (v: number) => Math.round(v * 1000) / 1000;

/** Every member kind, so `memberSummary` is complete whatever the topology. */
const MEMBER_KINDS = [
  'front_leg',
  'back_leg',
  'rafter',
  'purlin',
  'brace',
  'rail',
] as const satisfies readonly MemberKind[];

/** How far past a run's end a planned leg may sit and still count as its own. */
const LEG_PLAN_TOL_M = 0.05;

/**
 * Leg offsets for ONE run, taken from the segment's saved plan (22i).
 *
 * Returns `null` when there is no plan at all (⇒ automatic spacing), and an
 * empty array when there IS a plan but none of its legs fall on this run —
 * which is a real situation worth reporting rather than silently drawing a
 * table with no supports under one of its rows.
 *
 * Points are stored in the segment's LOCAL frame and rotated into world here
 * using `segmentFrameAngle`, the SAME derivation the panel lattice uses. That
 * shared derivation is the whole point: a second one agrees on a due-south
 * table and diverges as soon as it is rotated.
 */
function planStationsFor(
  seg: ArraySegment,
  frameAngle: number,
  frontMid: XY,
  along: XY,
  half: number,
): number[] | null {
  const pts = seg.legPlan?.points;
  if (!pts) return null;
  const ts: number[] = [];
  for (const local of pts) {
    const w = rotate(local, frameAngle);
    // `along` is a unit vector, so the dot product IS the distance along the
    // run. `along ⊥ down`, so measuring from frontMid or from the run centre
    // gives the same number.
    const t = (w.x - frontMid.x) * along.x + (w.y - frontMid.y) * along.y;
    if (Math.abs(t) <= half + LEG_PLAN_TOL_M) ts.push(t);
  }
  // sorted so member ids run end-to-end along the table regardless of the
  // order the user happened to place them in — ids stay deterministic
  return ts.sort((a, b) => a - b);
}

/**
 * Build the member/node graph for ONE elevated segment from its materialised
 * panels. Contiguous panel runs per grid row get: front+back legs at
 * legSpacing stations, a tilted rafter per station, two purlins spanning the
 * run, and longitudinal braces between stations. Holes (removed cells) split
 * runs, so no member is ever emitted under an absent module.
 */
export function buildStructure(
  seg: ArraySegment,
  spec: PanelSpec,
  roof: Roof,
  racking: ResolvedRacking,
  panels: PlacedPanel[],
): SegmentStructure {
  const warnings: string[] = [];
  if (racking.kind === 'dual_tilt') {
    warnings.push(
      'Dual-tilt is modeled with fixed-tilt structure topology in v1 — tonnage is approximate.',
    );
  }
  const mine = panels
    .filter((p) => p.segmentId === seg.id && p.enabled && p.cellIndex != null)
    .sort((a, b) => a.cellIndex! - b.cellIndex!);

  const members: Member[] = [];
  const nodes: StructureNode[] = [];
  const { w, h } = panelFootprintM(spec, seg.orientation);
  const tiltRad = (racking.tiltDeg * Math.PI) / 180;
  const plan = h * Math.cos(tiltRad); // module's plan-view depth
  const azRad = (seg.azimuthDeg * Math.PI) / 180;
  // unit vector the modules FACE (their down-tilt edge points this way);
  // north = +y in the local EN frame, so azimuth 0=N ⇒ (0,1), 180=S ⇒ (0,-1)
  const down = { x: Math.sin(azRad), y: Math.cos(azRad) };
  const dz = roof.heightM;
  // height the foundation occupies above the deck (D15 — see the leg emission
  // below). `anchor`, the historical default, is 0, so this is a no-op until a
  // project selects a pedestal or ballast block.
  const foundH = ruleFor(racking.foundation).heightMm / 1000;

  // The frame a saved leg plan is stored in — the segment's own, shared with
  // the panel lattice (22i/E3). Computed once; harmless when there is no plan.
  const panelFrameAngle = segmentFrameAngle(roof, seg, mine);
  let runIndex = 0;
  let plannedRunsUsed = 0;
  let plannedRunsMissing = 0;

  // group by grid row, then split each row into contiguous runs (hole-gated)
  const byRow = new Map<number, PlacedPanel[]>();
  for (const p of mine) {
    const row = Math.floor(p.cellIndex! / COL_STRIDE);
    (byRow.get(row) ?? byRow.set(row, []).get(row)!).push(p);
  }

  let mi: Record<string, number> = {};
  let ni: Record<string, number> = {};
  const addMember = (kind: MemberKind, a: XYZ, b: XYZ): Member => {
    const idx = (mi[kind] = (mi[kind] ?? 0) + 1);
    const lengthM = rnd(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    const m: Member = {
      id: `${seg.id}/m/${kind}/${idx - 1}`,
      kind,
      // per-CLASS section (22g). With no `profiles` set this returns the
      // table's single profile, which is what every existing project gets.
      profileKey: racking.profileFor(kind).key,
      a,
      b,
      lengthM,
    };
    members.push(m);
    return m;
  };
  const addNode = (
    kind: NodeKind,
    position: XYZ,
    memberIds: string[],
    fastenerSpec: StructureNode['fastenerSpec'],
  ) => {
    const idx = (ni[kind] = (ni[kind] ?? 0) + 1);
    nodes.push({ id: `${seg.id}/n/${kind}/${idx - 1}`, kind, position, memberIds, fastenerSpec });
  };

  for (const [row, rowPanels] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    // contiguous runs by column index
    const sorted = rowPanels.sort(
      (a, b) => (a.cellIndex! % COL_STRIDE) - (b.cellIndex! % COL_STRIDE),
    );
    const runs: PlacedPanel[][] = [];
    for (const p of sorted) {
      const last = runs[runs.length - 1];
      const col = p.cellIndex! % COL_STRIDE;
      if (last && col === (last[last.length - 1].cellIndex! % COL_STRIDE) + 1) last.push(p);
      else runs.push([p]);
    }

    for (const run of runs) {
      runIndex++;
      const n = run.length;
      const runLen = n * w + (n - 1) * seg.moduleGapM;
      const first = run[0].center;
      const last = run[n - 1].center;
      // row axis: from first to last panel centre (single panel: derive from
      // the facing direction's perpendicular — deterministic either way)
      const along =
        n > 1
          ? norm({ x: last.x - first.x, y: last.y - first.y })
          : { x: down.y, y: -down.x };
      const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
      const frontMid = { x: mid.x + (down.x * plan) / 2, y: mid.y + (down.y * plan) / 2 };
      const backMid = { x: mid.x - (down.x * plan) / 2, y: mid.y - (down.y * plan) / 2 };

      // ── Leg stations along the run (22i) ─────────────────────────────────
      // AUTO by default: evenly spaced at `legSpacingM`. A persisted leg plan
      // replaces those positions with hand-placed ones — but only for the runs
      // it actually covers. A run the plan does not reach keeps AUTO and says
      // so, rather than silently losing its legs (E6/E7).
      const autoBays = Math.max(1, Math.ceil(runLen / racking.legSpacingM));
      const half = runLen / 2;
      const planTs = planStationsFor(seg, panelFrameAngle, frontMid, along, half);
      const custom = planTs !== null;
      if (planTs !== null && planTs.length === 0) {
        warnings.push(
          `${seg.label}: run ${runIndex} has no leg in the saved plan — using automatic spacing for it`,
        );
      }
      const usePlan = planTs !== null && planTs.length > 0;
      if (custom && !usePlan) plannedRunsMissing++;
      if (usePlan) plannedRunsUsed++;
      const stations = usePlan ? planTs!.length : autoBays + 1;
      /** offset of station `s` along the run axis, measured from the midpoint */
      const stationT = (s: number) =>
        usePlan
          ? planTs![s]
          : stations === 1
            ? 0
            : (s / (stations - 1)) * runLen - half;
      // Rafters and purlins may overhang the end legs (22g). Legs are NOT
      // extended — they stand where they stand; only the spanning members grow.
      const spanHalf = half + racking.endBufferM;
      // How many rafters this run gets. Default is one per leg station, which
      // is the historical hardcode; `rafterCount` overrides outright, otherwise
      // the density multiplier scales the station count.
      const rafters = Math.max(
        1,
        racking.rafterCount ?? Math.round(stations * racking.rafterMultiplier),
      );
      // The default (one rafter per leg station) is emitted INSIDE the station
      // loop so member and node ordering — and therefore every generated id —
      // is unchanged from before 22g. Any other count cannot sit on the leg
      // stations, so it emits separately afterwards.
      const rafterPerStation = rafters === stations;
      for (let s = 0; s < stations; s++) {
        const t = stationT(s);
        const fx = frontMid.x + along.x * t;
        const fy = frontMid.y + along.y * t;
        const bx = backMid.x + along.x * t;
        const by = backMid.y + along.y * t;
        // ── D15: the foundation CONSUMES clearance, it does not add to it ────
        // `frontLegM` measures roof surface → module underside. A pedestal
        // occupies the bottom of that dimension, so the steel leg starts on top
        // of it and is correspondingly shorter:
        //
        //   module underside ── frontLegM ──┐
        //                                   │  steel leg = frontLegM − foundH
        //   foundation top   ───────────────┤
        //                                   │  foundation = foundH
        //   roof surface     ───────────────┘
        //
        // Chosen so switching foundation kind NEVER moves the module plane —
        // the alternative silently changes shading, energy and every stored
        // capture — and so "Walk-under 2.2 m" keeps meaning 2.2 m of clearance.
        // `anchor` (height 0) is a no-op, which is why this is invisible until
        // a project actually selects a pedestal or ballast block.
        const frontLeg = addMember(
          'front_leg',
          { x: fx, y: fy, z: dz + foundH },
          { x: fx, y: fy, z: dz + racking.frontLegM },
        );
        const backLeg = addMember(
          'back_leg',
          { x: bx, y: by, z: dz + foundH },
          { x: bx, y: by, z: dz + racking.backLegM },
        );
        const rafter = rafterPerStation ? addMember('rafter', frontLeg.b, backLeg.b) : null;
        // A roof_anchor node sits on the ROOF SURFACE, not on the leg base.
        //
        // The two stopped being the same point when the D15 chain above put a
        // foundation under the leg: `frontLeg.a` is now the TOP of the
        // foundation, foundH above the deck. `foundationAssembly` documents its
        // part offsets as "relative to the roof surface at the leg centre" and
        // builds the pedestal spanning 0 → h upward from there, so anchoring it
        // to the leg base drew every pedestal floating exactly one foundation
        // height above the roof. Invisible while the default was `anchor`
        // (foundH = 0); visible the moment the default became a 150 mm pedestal.
        const deck = (p: XYZ): XYZ => ({ x: p.x, y: p.y, z: dz });
        addNode('roof_anchor', deck(frontLeg.a), [frontLeg.id], anchorSpec(racking));
        addNode('roof_anchor', deck(backLeg.a), [backLeg.id], anchorSpec(racking));
        addNode(
          'leg_rafter',
          frontLeg.b,
          rafter ? [frontLeg.id, rafter.id] : [frontLeg.id],
          { bolts: 2 },
        );
        addNode('leg_rafter', backLeg.b, rafter ? [backLeg.id, rafter.id] : [backLeg.id], {
          bolts: 2,
        });
      }

      // Custom rafter density: interpolate along the run independently of the
      // leg stations. Each rafter carries its own joint nodes so
      // validateStructure's "every rafter is supported" rule still holds.
      if (!rafterPerStation) {
        for (let i = 0; i < rafters; i++) {
          const t = rafters === 1 ? 0 : (i / (rafters - 1)) * runLen - half;
          const a = {
            x: frontMid.x + along.x * t,
            y: frontMid.y + along.y * t,
            z: dz + racking.frontLegM,
          };
          const b = {
            x: backMid.x + along.x * t,
            y: backMid.y + along.y * t,
            z: dz + racking.backLegM,
          };
          const extra = addMember('rafter', a, b);
          addNode('leg_rafter', a, [extra.id], { bolts: 2 });
          addNode('leg_rafter', b, [extra.id], { bolts: 2 });
        }
      }

      // Purlins spanning the run. Two — front and back module edge — is the
      // default and the historical behaviour; `purlinCount` interpolates the
      // extras BETWEEN them, in XY *and* in Z, so an intermediate purlin lands
      // on the tilted rafter rather than floating above or cutting through it.
      // `spanHalf` carries the end buffer; at the default 0 it equals `half`.
      const purlinAt = (u: number) => {
        const cx = frontMid.x + (backMid.x - frontMid.x) * u;
        const cy = frontMid.y + (backMid.y - frontMid.y) * u;
        const z = dz + racking.frontLegM + (racking.backLegM - racking.frontLegM) * u;
        return {
          mid: { x: cx, y: cy },
          z,
          a: { x: cx - along.x * spanHalf, y: cy - along.y * spanHalf, z },
          b: { x: cx + along.x * spanHalf, y: cy + along.y * spanHalf, z },
        };
      };
      const nPurlins = Math.max(1, racking.purlinCount);
      const purlinLines = Array.from({ length: nPurlins }, (_, i) =>
        purlinAt(nPurlins === 1 ? 0 : i / (nPurlins - 1)),
      );
      const purlins = purlinLines.map((p) => addMember('purlin', p.a, p.b));

      // every purlin rests on a rafter at each leg station
      for (let s = 0; s < stations; s++) {
        const t = stationT(s);
        for (let i = 0; i < purlins.length; i++) {
          const line = purlinLines[i];
          addNode(
            'rafter_purlin',
            { x: line.mid.x + along.x * t, y: line.mid.y + along.y * t, z: line.z },
            [purlins[i].id],
            { bolts: 1 },
          );
        }
      }

      // longitudinal braces between adjacent back legs — omitted entirely when
      // bracing is turned off, along with their bolts (a brace bolt with no
      // brace would fail validateStructure, and would price hardware for a
      // member that is not there)
      for (let s = 0; racking.bracing && s < stations - 1; s++) {
        const t0 = stationT(s);
        const t1 = stationT(s + 1);
        const brace = addMember(
          'brace',
          { x: backMid.x + along.x * t0, y: backMid.y + along.y * t0, z: dz + racking.backLegM * 0.5 },
          { x: backMid.x + along.x * t1, y: backMid.y + along.y * t1, z: dz + racking.backLegM * 0.5 },
        );
        addNode('brace_bolt', brace.a, [brace.id], { bolts: 1 });
        addNode('brace_bolt', brace.b, [brace.id], { bolts: 1 });
      }

      // panel clamps along both purlins: 2 ends + shared mids per purlin
      for (const purlin of purlins) {
        addNode('panel_clamp_end', purlin.a, [purlin.id], { clamps: 1 });
        addNode('panel_clamp_end', purlin.b, [purlin.id], { clamps: 1 });
        for (let k = 1; k < n; k++) {
          const t = -half + k * (w + seg.moduleGapM) - seg.moduleGapM / 2;
          addNode(
            'panel_clamp_mid',
            {
              x: (purlin.a.x + purlin.b.x) / 2 + along.x * t,
              y: (purlin.a.y + purlin.b.y) / 2 + along.y * t,
              z: purlin.a.z,
            },
            [purlin.id],
            { clamps: 1 },
          );
        }
      }
    }
  }

  // E6: a table where SOME runs follow the saved plan and others fell back to
  // automatic spacing is a legitimate state — the user added panels after
  // planning the legs — but it must not look deliberate. Per-run notices are
  // already pushed above; this is the summary the UI can lead with.
  if (plannedRunsUsed > 0 && plannedRunsMissing > 0) {
    warnings.push(
      `${seg.label}: ${plannedRunsUsed} of ${plannedRunsUsed + plannedRunsMissing} runs use your leg plan — the rest are automatic. Open Legs (2D) to place the missing ones.`,
    );
  }

  const memberSummary = {} as Record<MemberKind, { count: number; totalM: number }>;
  for (const kind of MEMBER_KINDS) {
    const of = members.filter((m) => m.kind === kind);
    memberSummary[kind] = {
      count: of.length,
      totalM: rnd(of.reduce((s, m) => s + m.lengthM, 0)),
    };
  }
  // Σ PER MEMBER against its own section (22g) — a table mixing a heavy leg
  // with a light purlin cannot be priced off one kgPerM. Identical to the old
  // single-profile sum whenever `profiles` is unset.
  const steelKg = rnd(
    members.reduce((s, m) => s + m.lengthM * racking.profileFor(m.kind).kgPerM, 0),
  );

  return {
    segmentId: seg.id,
    members,
    nodes,
    foundation: racking.foundation,
    foundationShape: racking.foundationShape,
    steelKg,
    memberSummary,
    warnings,
  };
}

function anchorSpec(r: ResolvedRacking): StructureNode['fastenerSpec'] {
  // ONE foundation per leg base — the node graph is what the BOM counts, so a
  // ground table's pile count is its leg count, not an estimate.
  switch (r.foundation) {
    case 'ballast':
      return { plates: 1, ballast: 1 };
    case 'pile':
      return { piles: 1 };
    case 'concrete':
      return { pedestals: 1, plates: 1, anchors: 2 };
    default:
      return { anchors: 2, plates: 1 };
  }
}

function norm(v: { x: number; y: number }): { x: number; y: number } {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
}

/** All elevated-segment structures of a project (the BOM/3D entry point). */
/**
 * Which mounting topology a segment resolves to. The foundation question only
 * makes sense for a table that STANDS on something.
 *
 * Lives here rather than in structure-view because the BUILDER dispatches on
 * it — what the UI offers and what the model builds must come from one answer.
 */
export type StructureTopology = 'elevated_table' | 'sheet_monorail' | 'flush' | 'none';

/**
 * Foundations this surface can physically carry.
 *
 * THE single source for both the picker and the resolution. Offering a choice
 * the surface cannot take is one bug; silently resolving to one is a worse
 * one, and 22h fixed only the first half — it changed the DEFAULT for a metal
 * shed, which does nothing for a project that already had `foundation:
 * 'concrete'` written on the segment. Those kept drawing cast pedestals on
 * corrugated steel and claiming ~9 tonnes of dead load, while the picker
 * offered a list that did not contain the value in use.
 */
export function allowedFoundations(roof: Roof, seg: ArraySegment): FoundationKind[] {
  switch (topologyOf(roof, seg)) {
    case 'elevated_table':
      // ground takes anything you can put in or on earth — including BALLAST,
      // which is what you use where excavation is not possible (rock, leased
      // or restored land). The app's own ground_ballast preset relies on it;
      // my first list omitted it and quietly rewrote those designs to pile.
      if (roof.roofType === 'ground') return ['pile', 'concrete', 'ballast'];
      // a shed fixes through the sheet into the purlin: you cannot cast on
      // trapezoidal steel, and ballast loads a roof built to carry its own deck
      if (roof.roofType === 'metal_shed') return ['anchor'];
      // a rooftop takes anything but a PILE — you do not drive a post into a slab
      return ['concrete', 'anchor', 'ballast'];
    default:
      return [];
  }
}

export function topologyOf(roof: Roof, seg: ArraySegment): StructureTopology {
  if (seg.racking.kind === 'flush') {
    // a shed carries rails on standoffs through the sheet — no legs, no footing
    return roof.roofType === 'metal_shed' ? 'sheet_monorail' : 'flush';
  }
  // the elevated member model assumes a flat deck
  return isSloped(roof) ? 'none' : 'elevated_table';
}

/** An L-foot lifts the rail this far clear of the sheet crown. ASSUMED. */
const STANDOFF_HEIGHT_M = 0.1;

/**
 * Build the member/node graph for a FLUSH segment on a METAL SHED (Phase 22h).
 *
 * A shed carries no table. Modules lie flush on rails, and the rails sit on
 * L-foot standoffs fixed through the sheet CROWN into the purlin below, each
 * with an EPDM washer because every fixing is a hole in someone's roof. So:
 * rails and standoffs, and none of the legs, rafters, purlins or braces an
 * elevated table needs.
 *
 * Two numbers here are ASSUMED and neither is measurable from the model:
 * `purlinPitchM` (inside the building) sets the standoff COUNT, and the sheet's
 * rib pitch decides whether a fixing lands on steel at all. Both carry a
 * warning rather than being presented as derived — getting the second one wrong
 * does not make the quote inaccurate, it makes the roof leak.
 */
function buildMonorail(
  seg: ArraySegment,
  spec: PanelSpec,
  roof: Roof,
  project: Project,
  panels: PlacedPanel[],
): SegmentStructure {
  const mine = panels.filter((p) => p.enabled && p.segmentId === seg.id && p.cellIndex != null);
  const members: Member[] = [];
  const nodes: StructureNode[] = [];
  const warnings: string[] = [];
  if (mine.length === 0) {
    return emptyStructure(seg, 'anchor', 'square');
  }

  const rules = resolveRules();
  const purlinPitchM =
    roof.structureOverride?.purlinPitchM ??
    project.structureDefaults?.purlinPitchM ??
    rules.sheet.purlinPitchM;
  const railProfile =
    STRUCTURE_PROFILES.find((p) => p.key === 'top_hat') ?? STRUCTURE_PROFILES[0];

  const { w, h } = panelFootprintM(spec, seg.orientation);
  const azRad = (seg.azimuthDeg * Math.PI) / 180;
  const down = { x: Math.sin(azRad), y: Math.cos(azRad) };
  // flush on a shed: the module plane is the sheet, so there is no tilt rise
  const railZ = roof.heightM + STANDOFF_HEIGHT_M;

  let mi: Record<string, number> = {};
  let ni: Record<string, number> = {};
  const addMember = (kind: MemberKind, a: XYZ, b: XYZ): Member => {
    const idx = (mi[kind] = (mi[kind] ?? 0) + 1);
    const m: Member = {
      id: `${seg.id}/m/${kind}/${idx - 1}`,
      kind,
      profileKey: railProfile.key,
      a,
      b,
      lengthM: rnd(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)),
    };
    members.push(m);
    return m;
  };
  const addNode = (
    kind: NodeKind,
    position: XYZ,
    memberIds: string[],
    fastenerSpec: StructureNode['fastenerSpec'],
  ) => {
    const idx = (ni[kind] = (ni[kind] ?? 0) + 1);
    nodes.push({ id: `${seg.id}/n/${kind}/${idx - 1}`, kind, position, memberIds, fastenerSpec });
  };

  // same row/run decomposition the table model uses — holes split runs here too
  const byRow = new Map<number, PlacedPanel[]>();
  for (const p of mine) {
    const row = Math.floor(p.cellIndex! / COL_STRIDE);
    (byRow.get(row) ?? byRow.set(row, []).get(row)!).push(p);
  }

  for (const [, rowPanels] of [...byRow.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = rowPanels.sort(
      (a, b) => (a.cellIndex! % COL_STRIDE) - (b.cellIndex! % COL_STRIDE),
    );
    const runs: PlacedPanel[][] = [];
    for (const p of sorted) {
      const last = runs[runs.length - 1];
      const col = p.cellIndex! % COL_STRIDE;
      if (last && col === (last[last.length - 1].cellIndex! % COL_STRIDE) + 1) last.push(p);
      else runs.push([p]);
    }

    for (const run of runs) {
      const n = run.length;
      const runLen = n * w + (n - 1) * seg.moduleGapM;
      const first = run[0].center;
      const last = run[n - 1].center;
      const along =
        n > 1 ? norm({ x: last.x - first.x, y: last.y - first.y }) : { x: down.y, y: -down.x };
      const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
      const half = runLen / 2;

      // one rail under each module edge — the pair a flush module clamps to
      for (const side of [1, -1]) {
        const cx = mid.x + (down.x * h * side) / 2;
        const cy = mid.y + (down.y * h * side) / 2;
        const a = { x: cx - along.x * half, y: cy - along.y * half, z: railZ };
        const b = { x: cx + along.x * half, y: cy + along.y * half, z: railZ };
        const rail = addMember('rail', a, b);

        // Standoffs land on purlin centres. NEVER fewer than the rule's floor:
        // a rail on one foot is a lever, and the arithmetic can ask for that on
        // a short run (E15).
        const spans = Math.max(1, Math.ceil(runLen / purlinPitchM));
        const count = Math.max(rules.sheet.minStandoffsPerRail, spans + 1);
        for (let i = 0; i < count; i++) {
          const t = count === 1 ? 0 : (i / (count - 1)) * runLen - half;
          addNode(
            'sheet_standoff',
            { x: cx + along.x * t, y: cy + along.y * t, z: roof.heightM },
            [rail.id],
            { standoffs: 1, sealingWashers: 1, bolts: 2 },
          );
        }

        // module clamps, exactly as on a purlin
        addNode('panel_clamp_end', a, [rail.id], { clamps: 1 });
        addNode('panel_clamp_end', b, [rail.id], { clamps: 1 });
        for (let k = 1; k < n; k++) {
          const t = -half + k * (w + seg.moduleGapM) - seg.moduleGapM / 2;
          addNode(
            'panel_clamp_mid',
            { x: cx + along.x * t, y: cy + along.y * t, z: railZ },
            [rail.id],
            { clamps: 1 },
          );
        }
      }
    }
  }

  const standoffs = nodes.filter((nd) => nd.kind === 'sheet_standoff').length;
  warnings.push(
    `${seg.label}: ${standoffs} sheet fixings assume ${purlinPitchM} m purlin centres and a ${rules.sheet.ribPitchM} m rib pitch — ASSUMED, not measured. Confirm both at survey: the pitch sets the count, and the rib pitch decides whether each fixing lands on a crown or in a valley.`,
  );

  const memberSummary = {} as Record<MemberKind, { count: number; totalM: number }>;
  for (const kind of MEMBER_KINDS) {
    const of = members.filter((m) => m.kind === kind);
    memberSummary[kind] = { count: of.length, totalM: rnd(of.reduce((s, m) => s + m.lengthM, 0)) };
  }

  return {
    segmentId: seg.id,
    members,
    nodes,
    // a fixing, not a footing — the foundation CARD is hidden for this
    // topology (foundationOptionsFor returns []), but the field must say
    // something and 'anchor' is the nearest truth
    foundation: 'anchor',
    foundationShape: 'square',
    steelKg: rnd(members.reduce((s, m) => s + m.lengthM * railProfile.kgPerM, 0)),
    memberSummary,
    warnings,
  };
}

function emptyStructure(
  seg: ArraySegment,
  foundation: FoundationKind,
  foundationShape: FoundationShape,
): SegmentStructure {
  const memberSummary = {} as Record<MemberKind, { count: number; totalM: number }>;
  for (const kind of MEMBER_KINDS) memberSummary[kind] = { count: 0, totalM: 0 };
  return {
    segmentId: seg.id,
    members: [],
    nodes: [],
    foundation,
    foundationShape,
    steelKg: 0,
    memberSummary,
    warnings: [],
  };
}

export function projectStructures(project: Project): SegmentStructure[] {
  const spec = project.components.panel;
  if (!spec) return [];
  const out: SegmentStructure[] = [];
  for (const seg of project.segments) {
    const roof = project.roofs.find((r) => r.id === seg.roofId);
    if (!roof) continue;
    // Dispatch on TOPOLOGY (22h). A flush segment on a metal shed gets the
    // monorail model; a flush segment anywhere else, and any pitched roof,
    // still gets no member model at all and keeps its honest per-panel BOM
    // line. `topologyOf` is the same predicate the structure UI gates on, so
    // what is offered and what is built cannot disagree.
    const topo = topologyOf(roof, seg);
    if (topo === 'sheet_monorail') {
      const s = buildMonorail(seg, spec, roof, project, project.panels);
      if (s.members.length > 0) out.push(s);
      continue;
    }
    const racking = resolveRacking(project, roof, seg, spec);
    if (!racking) continue;
    const s = buildStructure(seg, spec, roof, racking, project.panels);
    if (s.members.length > 0) out.push(s);
  }
  return out;
}

/** Σ fasteners over the node graph — the hardware BOM inputs. */
export function fastenerTotals(structures: SegmentStructure[]): {
  anchors: number;
  plates: number;
  bolts: number;
  clamps: number;
  ballast: number;
  piles: number;
  pedestals: number;
  /** metal-shed L-feet, and one EPDM washer per penetration (22h) */
  standoffs: number;
  sealingWashers: number;
  /** clamps split by kind (22j) — an end clamp is a different part and price */
  clampsMid: number;
  clampsEnd: number;
} {
  const t = {
    anchors: 0,
    plates: 0,
    bolts: 0,
    clamps: 0,
    ballast: 0,
    piles: 0,
    pedestals: 0,
    standoffs: 0,
    sealingWashers: 0,
    clampsMid: 0,
    clampsEnd: 0,
  };
  for (const s of structures) {
    for (const n of s.nodes) {
      // `clamps` stays the total; the split is what lets the BOM price an end
      // clamp as an end clamp — a wider casting, and a separate line item
      if (n.kind === 'panel_clamp_mid') t.clampsMid += n.fastenerSpec.clamps ?? 0;
      if (n.kind === 'panel_clamp_end') t.clampsEnd += n.fastenerSpec.clamps ?? 0;
      t.anchors += n.fastenerSpec.anchors ?? 0;
      t.plates += n.fastenerSpec.plates ?? 0;
      t.bolts += n.fastenerSpec.bolts ?? 0;
      t.clamps += n.fastenerSpec.clamps ?? 0;
      t.ballast += n.fastenerSpec.ballast ?? 0;
      t.piles += n.fastenerSpec.piles ?? 0;
      t.pedestals += n.fastenerSpec.pedestals ?? 0;
      t.standoffs += n.fastenerSpec.standoffs ?? 0;
      t.sealingWashers += n.fastenerSpec.sealingWashers ?? 0;
    }
  }
  return t;
}

/**
 * Assembly-completeness / unsupported-member validation (the plan's DRC
 * gate): every member kind must carry its required node kinds.
 */
export function validateStructure(s: SegmentStructure): string[] {
  const issues: string[] = [];
  const nodesByMember = new Map<string, StructureNode[]>();
  for (const n of s.nodes) {
    for (const mid of n.memberIds) {
      (nodesByMember.get(mid) ?? nodesByMember.set(mid, []).get(mid)!).push(n);
    }
  }
  const REQUIRED: Record<MemberKind, NodeKind[]> = {
    front_leg: ['roof_anchor', 'leg_rafter'],
    back_leg: ['roof_anchor', 'leg_rafter'],
    rafter: ['leg_rafter'],
    purlin: ['rafter_purlin', 'panel_clamp_end'],
    brace: ['brace_bolt'],
    // a rail with no standoff is a rail resting on nothing. Listed here or the
    // monorail model would validate silently however it was built.
    rail: ['sheet_standoff', 'panel_clamp_end'],
  };
  for (const m of s.members) {
    const kinds = new Set((nodesByMember.get(m.id) ?? []).map((n) => n.kind));
    for (const req of REQUIRED[m.kind]) {
      if (!kinds.has(req)) issues.push(`${m.id}: missing ${req} node — unsupported member`);
    }
  }
  return issues;
}
