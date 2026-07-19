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
} from '../types';
import { COL_STRIDE, panelFootprintM } from './layout';
import { resolveRules } from '../data/rules/india';
import { ruleFor } from './foundation';

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
  const foundation =
    r.foundation ??
    roofO?.foundation ??
    projD?.foundation ??
    (roof.roofType === 'ground' ? DEFAULT_GROUND_FOUNDATION : DEFAULT_FOUNDATION);
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

export type MemberKind = 'front_leg' | 'back_leg' | 'rafter' | 'purlin' | 'brace';
export type NodeKind =
  | 'roof_anchor' // leg base: base plate + anchors (or ballast block)
  | 'leg_rafter' // leg top → rafter bolt joint
  | 'rafter_purlin' // purlin resting on a rafter
  | 'panel_clamp_end'
  | 'panel_clamp_mid'
  | 'brace_bolt';

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

      // leg stations along the run
      const bays = Math.max(1, Math.ceil(runLen / racking.legSpacingM));
      const stations = bays + 1;
      const half = runLen / 2;
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
        const t = stations === 1 ? 0 : (s / (stations - 1)) * runLen - half;
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
        const t = stations === 1 ? 0 : (s / (stations - 1)) * runLen - half;
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
        const t0 = (s / (stations - 1)) * runLen - half;
        const t1 = ((s + 1) / (stations - 1)) * runLen - half;
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

  const memberSummary = {} as Record<MemberKind, { count: number; totalM: number }>;
  for (const kind of ['front_leg', 'back_leg', 'rafter', 'purlin', 'brace'] as const) {
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
export function projectStructures(project: Project): SegmentStructure[] {
  const spec = project.components.panel;
  if (!spec) return [];
  const out: SegmentStructure[] = [];
  for (const seg of project.segments) {
    const roof = project.roofs.find((r) => r.id === seg.roofId);
    if (!roof) continue;
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
} {
  const t = { anchors: 0, plates: 0, bolts: 0, clamps: 0, ballast: 0, piles: 0, pedestals: 0 };
  for (const s of structures) {
    for (const n of s.nodes) {
      t.anchors += n.fastenerSpec.anchors ?? 0;
      t.plates += n.fastenerSpec.plates ?? 0;
      t.bolts += n.fastenerSpec.bolts ?? 0;
      t.clamps += n.fastenerSpec.clamps ?? 0;
      t.ballast += n.fastenerSpec.ballast ?? 0;
      t.piles += n.fastenerSpec.piles ?? 0;
      t.pedestals += n.fastenerSpec.pedestals ?? 0;
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
  };
  for (const m of s.members) {
    const kinds = new Set((nodesByMember.get(m.id) ?? []).map((n) => n.kind));
    for (const req of REQUIRED[m.kind]) {
      if (!kinds.has(req)) issues.push(`${m.id}: missing ${req} node — unsupported member`);
    }
  }
  return issues;
}
