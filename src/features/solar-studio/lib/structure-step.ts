// ─── Structure & BOM (Step 7): the facts the structure view shows ───────────
// PURE. The view renders these answers and decides nothing, so the table list,
// the inspector, the take-off and the 3D highlight cannot drift apart: each
// reads the SAME derived structures the BOM prices (lib/derive/structures).
//
// Nothing here is persisted or fingerprinted — which tables are selected and
// which part is lit are view state.
import type { ArraySegment, FoundationKind, Project, Roof } from '../types';
import type { MemberKind, NodeKind, SegmentStructure } from './structure-model';
import { allowedFoundations, projectStructures, resolveRacking, topologyOf, validateStructure } from './structure';
import { foundationOptionsFor } from './structure-view';
import { foundationTooTall } from './foundation';
import { isTrackerKind } from './energy/tracker';
import { profileByKey } from '../data/profiles';
import { wastePctFor } from './bom/registry';
import { applyStructChoice, WALK_UNDER_M, type StructChoice } from './structure-edit';
import type { MmsFinding } from './mms/types';

/** What a table stands on, in the installer's words. */
export type StructureType =
  | 'flush'
  | 'monorail'
  | 'elevated'
  | 'walkunder'
  | 'ground'
  | 'tracker'
  | 'facade';

export const STRUCTURE_TYPE_LABEL: Record<StructureType, string> = {
  flush: 'Flush',
  monorail: 'Flush on sheet',
  elevated: 'Elevated',
  walkunder: 'Walk-under',
  ground: 'Ground table',
  tracker: 'Tracker',
  facade: 'Facade',
};

export const FOUNDATION_LABEL: Record<FoundationKind, string> = {
  concrete: 'PCC pedestal',
  anchor: 'Chemical anchor',
  ballast: 'Ballast block',
  pile: 'Driven pile',
  float: 'HDPE pontoon',
};

export const FOUNDATION_HINT: Record<FoundationKind, string> = {
  concrete: 'Cast on the slab — no membrane penetration',
  anchor: 'Bolted into the slab — penetrates the membrane',
  ballast: 'Dead weight, no drilling',
  pile: 'Driven into the ground',
  float: 'Held by the mooring, not a footing',
};

function structureTypeOf(project: Project, roof: Roof, seg: ArraySegment): StructureType {
  if (roof.roofType === 'facade') return 'facade';
  if (seg.racking.kind === 'flush') return topologyOf(roof, seg) === 'sheet_monorail' ? 'monorail' : 'flush';
  if (isTrackerKind(seg.racking.kind)) return 'tracker';
  if (roof.roofType === 'ground') return 'ground';
  const spec = project.components.panel;
  const front = spec ? (resolveRacking(project, roof, seg, spec)?.frontLegM ?? 0) : 0;
  return front >= WALK_UNDER_M - 1e-6 ? 'walkunder' : 'elevated';
}

/** Which height cards a table offers. Empty = the type is not this step's choice. */
export function heightChoicesFor(roof: Roof, seg: ArraySegment): ('flush' | 'elevated' | 'walkunder')[] {
  if (roof.roofType === 'facade' || roof.roofType === 'ground') return [];
  if (seg.racking.kind !== 'flush' && isTrackerKind(seg.racking.kind)) return [];
  return ['flush', 'elevated', 'walkunder'];
}

/**
 * Foundations to offer. On a roof, the picker's subset; on open ground,
 * everything the earth can take — ballast included, as the old ground
 * "Ballasted" preset offered it.
 */
export function foundationChoicesFor(roof: Roof, seg: ArraySegment): FoundationKind[] {
  return roof.roofType === 'ground' ? allowedFoundations(roof, seg) : foundationOptionsFor(roof, seg);
}

/**
 * One line, the installer's words: "Elevated 0.30 m · C-Channel · PCC pedestal".
 * The ONE place that sentence is built — the Step 7 table list and the
 * editor's table chip both read it, so they cannot describe a table two ways.
 */
export function structureSummary(
  project: Project,
  seg: ArraySegment,
  structures: SegmentStructure[],
  fmtLen: (m: number, dp?: number) => string,
): string {
  const roof = project.roofs.find((r) => r.id === seg.roofId);
  if (!roof) return '';
  const type = structureTypeOf(project, roof, seg);
  const rk = seg.racking.kind !== 'flush' ? seg.racking : null;
  if (!rk) return STRUCTURE_TYPE_LABEL[type];
  const spec = project.components.panel;
  const front = spec ? resolveRacking(project, roof, seg, spec)?.frontLegM : undefined;
  const st = structures.find((s) => s.segmentId === seg.id);
  const parts = [STRUCTURE_TYPE_LABEL[type] + (front != null && type !== 'tracker' ? ` ${fmtLen(front, 2)}` : '')];
  if (rk.kind !== 'tracker_azel') parts.push(rk.profile.label);
  const foundation = st?.foundation;
  if (foundation) parts.push(FOUNDATION_LABEL[foundation]);
  return parts.join(' · ');
}

export type TableStatus = 'ok' | 'warning' | 'error';

export interface TableRow {
  segId: string;
  label: string;
  roofName: string;
  panels: number;
  kwp: number;
  type: StructureType;
  profileKey: string | null;
  profileLabel: string | null;
  foundation: FoundationKind | null;
  /** effective low-edge height, m — null for a table with no legs */
  clearanceM: number | null;
  tiltDeg: number | null;
  /** one line, the installer's words: "Elevated 0.30 m · C-Channel · PCC pedestal" */
  summary: string;
  status: TableStatus;
  /** every problem on this table, worst first */
  issues: { status: Exclude<TableStatus, 'ok'>; message: string; componentIds: string[] }[];
}

/** One row per table that has modules on it, in label order. */
export function tableRows(
  project: Project,
  structures: SegmentStructure[],
  findings: MmsFinding[],
  fmtLen: (m: number, dp?: number) => string,
): TableRow[] {
  const spec = project.components.panel;
  const out: TableRow[] = [];
  for (const seg of project.segments) {
    const mine = project.panels.filter((p) => p.segmentId === seg.id && p.enabled);
    if (mine.length === 0) continue;
    const roof = project.roofs.find((r) => r.id === seg.roofId);
    if (!roof) continue;
    const st = structures.find((s) => s.segmentId === seg.id);
    const resolved = spec ? resolveRacking(project, roof, seg, spec) : null;
    const type = structureTypeOf(project, roof, seg);
    const rk = seg.racking.kind !== 'flush' ? seg.racking : null;
    const elevated = rk !== null;
    const profileKey = rk && rk.kind !== 'tracker_azel' ? rk.profile.key : (st?.members[0]?.profileKey ?? null);
    const profileLabel = profileKey ? (profileByKey(profileKey)?.label ?? profileKey) : null;
    const foundation = elevated ? (st?.foundation ?? resolved?.foundation ?? null) : null;
    const clearanceM = elevated && resolved ? resolved.frontLegM : null;

    const issues: TableRow['issues'] = [];
    for (const f of findings) {
      if (f.segmentId !== seg.id) continue;
      if (f.status === 'error' || f.status === 'warning') issues.push({ status: f.status, message: f.message, componentIds: f.componentIds });
    }
    if (st) {
      for (const msg of validateStructure(st)) issues.push({ status: 'error', message: msg, componentIds: [] });
      for (const msg of st.warnings) issues.push({ status: 'warning', message: msg, componentIds: [] });
    }
    if (foundation && clearanceM != null && foundationTooTall(clearanceM, foundation)) {
      issues.push({
        status: 'warning',
        message: `${FOUNDATION_LABEL[foundation]} is taller than this table's clearance — engineer to size it.`,
        componentIds: st ? st.nodes.filter((n) => n.kind === 'roof_anchor').map((n) => n.id) : [],
      });
    }
    issues.sort((a, b) => (a.status === b.status ? 0 : a.status === 'error' ? -1 : 1));

    out.push({
      segId: seg.id,
      label: seg.label,
      roofName: roof.name,
      panels: mine.length,
      kwp: spec ? (mine.length * spec.watt) / 1000 : 0,
      type,
      profileKey,
      profileLabel,
      foundation,
      clearanceM,
      tiltDeg: rk ? rk.tiltDeg : null,
      summary: structureSummary(project, seg, structures, fmtLen),
      status: issues.some((i) => i.status === 'error') ? 'error' : issues.length > 0 ? 'warning' : 'ok',
      issues,
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}

/** The shared value across a selection, or 'mixed' when the tables differ. */
export function commonValue<T>(values: T[]): T | 'mixed' | null {
  if (values.length === 0) return null;
  return values.every((v) => v === values[0]) ? values[0] : 'mixed';
}

// ─── Parts: what lights up in 3D, and the take-off ──────────────────────────

export type PartKey = 'legs' | 'rafters' | 'purlins' | 'braces' | 'beams' | 'rails' | 'drainage' | 'foundations' | 'joints' | 'clamps';

const MEMBER_PARTS: { key: PartKey; label: string; kinds: MemberKind[] }[] = [
  { key: 'legs', label: 'Legs', kinds: ['front_leg', 'back_leg'] },
  { key: 'rafters', label: 'Rafters', kinds: ['rafter'] },
  { key: 'purlins', label: 'Purlins', kinds: ['purlin'] },
  { key: 'braces', label: 'Braces', kinds: ['brace'] },
  { key: 'beams', label: 'Beams', kinds: ['beam'] },
  { key: 'rails', label: 'Rails', kinds: ['rail'] },
  { key: 'drainage', label: 'Gutters and downpipes', kinds: ['gutter', 'downpipe'] },
];
const NODE_PARTS: { key: PartKey; label: string; kinds: NodeKind[] }[] = [
  { key: 'foundations', label: 'Foundations', kinds: ['roof_anchor'] },
  { key: 'joints', label: 'Bolted joints', kinds: ['leg_rafter', 'rafter_purlin', 'brace_bolt', 'rail_splice', 'sheet_standoff', 'wall_bracket'] },
  { key: 'clamps', label: 'Module clamps', kinds: ['panel_clamp_end', 'panel_clamp_mid'] },
];

export interface PartGroup {
  key: PartKey;
  label: string;
  count: number;
  /** metres of section — members only */
  totalM: number | null;
  /** kg of section — members only, drainage excluded (it is not steel) */
  kg: number | null;
  /** the 3D ids to light */
  ids: string[];
}

const kgPerM = (profileKey: string, profile?: { kgPerM: number }) =>
  profile?.kgPerM ?? profileByKey(profileKey)?.kgPerM ?? 0;

/** Every part group present in these structures, with what lights it up. */
export function partGroups(structures: SegmentStructure[]): PartGroup[] {
  const groups: PartGroup[] = [];
  for (const g of MEMBER_PARTS) {
    const ms = structures.flatMap((s) => s.members.filter((m) => g.kinds.includes(m.kind)));
    if (ms.length === 0) continue;
    const steel = g.key !== 'drainage';
    groups.push({
      key: g.key,
      label: g.label,
      count: ms.length,
      totalM: ms.reduce((a, m) => a + m.lengthM, 0),
      kg: steel ? ms.reduce((a, m) => a + m.lengthM * kgPerM(m.profileKey, m.profile), 0) : null,
      ids: ms.map((m) => m.id),
    });
  }
  for (const g of NODE_PARTS) {
    const ns = structures.flatMap((s) => s.nodes.filter((n) => g.kinds.includes(n.kind)));
    if (ns.length === 0) continue;
    groups.push({ key: g.key, label: g.label, count: ns.length, totalM: null, kg: null, ids: ns.map((n) => n.id) });
  }
  return groups;
}

const NODE_LABEL: Record<NodeKind, string> = {
  roof_anchor: 'Foundation',
  leg_rafter: 'Leg-to-rafter joint',
  rafter_purlin: 'Rafter-to-purlin joint',
  panel_clamp_end: 'End clamp',
  panel_clamp_mid: 'Mid clamp',
  brace_bolt: 'Brace bolt',
  sheet_standoff: 'Sheet standoff',
  wall_bracket: 'Wall bracket',
  rail_splice: 'Rail splice',
  bonding_lug: 'Bonding lug',
  cable_clip: 'Cable clip',
};

export interface PartReadout {
  title: string;
  detail: string;
  /** where the numbers come from — geometry is derived, footing sizes are assumed */
  tier: 'derived' | 'assumed';
}

/** What the pointer is on, in one line of words and one of numbers. */
export function describePart(
  project: Project,
  structures: SegmentStructure[],
  segId: string,
  partId: string,
): PartReadout | null {
  const st = structures.find((s) => s.segmentId === segId);
  const label = project.segments.find((s) => s.id === segId)?.label ?? '';
  if (!st) return null;
  const m = st.members.find((x) => x.id === partId);
  if (m) {
    const part = MEMBER_PARTS.find((g) => g.kinds.includes(m.kind));
    const profile = m.profile ?? profileByKey(m.profileKey);
    const name = m.kind === 'front_leg' ? 'Front leg' : m.kind === 'back_leg' ? 'Back leg' : (part?.label.replace(/s$/, '') ?? m.kind);
    const kg = m.lengthM * kgPerM(m.profileKey, m.profile);
    return {
      title: `${name} · table ${label}`,
      detail: `${profile?.label ?? m.profileKey}${profile?.sectionMm ? ` ${profile.sectionMm}` : ''} · ${m.lengthM.toFixed(2)} m · ${kg.toFixed(1)} kg`,
      tier: 'derived',
    };
  }
  const n = st.nodes.find((x) => x.id === partId);
  if (!n) return null;
  if (n.kind === 'roof_anchor') {
    return {
      title: `${FOUNDATION_LABEL[st.foundation]} · table ${label}`,
      detail: 'Nominal size — assumed, engineer to confirm',
      tier: 'assumed',
    };
  }
  const hw = Object.entries(n.fastenerSpec)
    .filter(([, q]) => typeof q === 'number' && q > 0)
    .map(([k, q]) => `${q} ${k}`)
    .join(' · ');
  return { title: `${NODE_LABEL[n.kind]} · table ${label}`, detail: hw || 'No loose hardware', tier: 'derived' };
}

/**
 * What a choice would do to the steel, BEFORE it is made: the same pure
 * `applyStructChoice` the click commits, run on a copy over every selected
 * table, then weighed. Null when the choice changes no selected table.
 */
export function choiceSteelDeltaKg(
  project: Project,
  segIds: string[],
  choice: StructChoice,
  baseSteelKg: number,
): number | null {
  let next = project;
  let changed = false;
  for (const id of segIds) {
    const r = applyStructChoice(next, id, choice);
    if (!r) continue;
    next = { ...next, ...r };
    changed = true;
  }
  if (!changed) return null;
  return projectStructures(next).reduce((a, s) => a + s.steelKg, 0) - baseSteelKg;
}

export interface SteelTakeoff {
  /** Σ the structures' own steelKg — the exact figure the BOM's steel lines price */
  netKg: number;
  wastePct: number;
  wasteKg: number;
  orderKg: number;
}

export function steelTakeoff(structures: SegmentStructure[]): SteelTakeoff {
  const netKg = structures.reduce((a, s) => a + s.steelKg, 0);
  const wastePct = wastePctFor('mech.steel');
  const wasteKg = (netKg * wastePct) / 100;
  return { netKg, wastePct, wasteKg, orderKg: netKg + wasteKg };
}

interface CutListRow {
  label: string;
  profileLabel: string;
  pieces: number;
  /** one cut length, m, to the centimetre */
  cutM: number;
  totalM: number;
  kg: number;
}

/**
 * What the fabricator orders: members grouped by part, section and cut length
 * to the centimetre. Read straight from the member graph — the same members
 * the steel line weighs — so the cut list always sums to the net steel.
 */
export function cutList(structures: SegmentStructure[]): CutListRow[] {
  const rows = new Map<string, CutListRow>();
  for (const s of structures) {
    for (const m of s.members) {
      if (m.kind === 'gutter' || m.kind === 'downpipe') continue;
      const part = MEMBER_PARTS.find((g) => g.kinds.includes(m.kind));
      const cutM = Math.round(m.lengthM * 100) / 100;
      const profileLabel = m.profile?.label ?? profileByKey(m.profileKey)?.label ?? m.profileKey;
      const key = `${part?.key}|${m.profileKey}|${cutM.toFixed(2)}`;
      const row = rows.get(key) ?? { label: part?.label ?? m.kind, profileLabel, pieces: 0, cutM, totalM: 0, kg: 0 };
      row.pieces += 1;
      row.totalM += m.lengthM;
      row.kg += m.lengthM * kgPerM(m.profileKey, m.profile);
      rows.set(key, row);
    }
  }
  const order = MEMBER_PARTS.map((g) => g.label);
  return [...rows.values()].sort(
    (a, b) => order.indexOf(a.label) - order.indexOf(b.label) || a.profileLabel.localeCompare(b.profileLabel) || b.cutM - a.cutM,
  );
}
