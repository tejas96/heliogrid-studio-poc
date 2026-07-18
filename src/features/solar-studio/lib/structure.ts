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
  ArraySegment,
  PanelSpec,
  PlacedPanel,
  Project,
  Roof,
  StructureProfile,
} from '../types';
import { COL_STRIDE, panelFootprintM } from './layout';
import { resolveRules } from '../data/rules/india';

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
const DEFAULT_FOUNDATION = 'anchor' as const;
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
  return {
    kind: r.kind,
    tiltDeg: r.tiltDeg,
    frontLegM,
    backLegM: frontLegM + rise,
    profile: r.profile,
    legSpacingM: r.legSpacingM ?? roofO?.legSpacingM ?? projD?.legSpacingM ?? DEFAULT_LEG_SPACING_M,
    foundation:
      r.foundation ??
      roofO?.foundation ??
      projD?.foundation ??
      (roof.roofType === 'ground' ? DEFAULT_GROUND_FOUNDATION : DEFAULT_FOUNDATION),
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
      profileKey: racking.profile.key,
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
      for (let s = 0; s < stations; s++) {
        const t = stations === 1 ? 0 : (s / (stations - 1)) * runLen - half;
        const fx = frontMid.x + along.x * t;
        const fy = frontMid.y + along.y * t;
        const bx = backMid.x + along.x * t;
        const by = backMid.y + along.y * t;
        const frontLeg = addMember(
          'front_leg',
          { x: fx, y: fy, z: dz },
          { x: fx, y: fy, z: dz + racking.frontLegM },
        );
        const backLeg = addMember(
          'back_leg',
          { x: bx, y: by, z: dz },
          { x: bx, y: by, z: dz + racking.backLegM },
        );
        const rafter = addMember('rafter', frontLeg.b, backLeg.b);
        addNode('roof_anchor', frontLeg.a, [frontLeg.id], anchorSpec(racking));
        addNode('roof_anchor', backLeg.a, [backLeg.id], anchorSpec(racking));
        addNode('leg_rafter', frontLeg.b, [frontLeg.id, rafter.id], { bolts: 2 });
        addNode('leg_rafter', backLeg.b, [backLeg.id, rafter.id], { bolts: 2 });
      }

      // two purlins spanning the run (front + back module edges)
      const purlinEnds = (edgeMid: { x: number; y: number }, z: number) => [
        { x: edgeMid.x - along.x * half, y: edgeMid.y - along.y * half, z },
        { x: edgeMid.x + along.x * half, y: edgeMid.y + along.y * half, z },
      ];
      const [fa, fb] = purlinEnds(frontMid, dz + racking.frontLegM);
      const [ba, bb] = purlinEnds(backMid, dz + racking.backLegM);
      const frontPurlin = addMember('purlin', fa, fb);
      const backPurlin = addMember('purlin', ba, bb);
      // purlin rests on every rafter at its station
      for (let s = 0; s < stations; s++) {
        const t = stations === 1 ? 0 : (s / (stations - 1)) * runLen - half;
        addNode(
          'rafter_purlin',
          { x: frontMid.x + along.x * t, y: frontMid.y + along.y * t, z: dz + racking.frontLegM },
          [frontPurlin.id],
          { bolts: 1 },
        );
        addNode(
          'rafter_purlin',
          { x: backMid.x + along.x * t, y: backMid.y + along.y * t, z: dz + racking.backLegM },
          [backPurlin.id],
          { bolts: 1 },
        );
      }

      // longitudinal braces between adjacent back legs
      for (let s = 0; s < stations - 1; s++) {
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
      for (const purlin of [frontPurlin, backPurlin]) {
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
  const steelKg = rnd(members.reduce((s, m) => s + m.lengthM * racking.profile.kgPerM, 0));

  return { segmentId: seg.id, members, nodes, steelKg, memberSummary, warnings };
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
