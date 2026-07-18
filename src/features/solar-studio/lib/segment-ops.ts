// ─── Parametric ArraySegment ops: grow rows/columns, reindex the grid ───────
// The engine behind Phase 2's "smart grow" tool. Panels stay the materialised
// source of truth; these helpers add cells (collision-aware) and keep the
// segment's rows/cols/cellIndex/removed self-consistent with the panels.
import type {
  FoundationKind,
  ArraySegment,
  PanelOrientation,
  PanelSpec,
  PlacedPanel,
  Project,
  RackingSpec,
  Roof,
  StructureProfile,
  XY,
} from '../types';
import { genId, rotate } from './geo';
import {
  COL_STRIDE,
  DEFAULT_FILL,
  DEFAULT_PROFILE,
  defaultPanelPose,
  panelFitsAt,
  panelFootprintM,
  planCellM,
  roofGridAngle,
} from './layout';

/** Racking a segment gets by default from its roof (flush on pitched/metal). */
function defaultRacking(roof: Roof, tiltDeg: number): ArraySegment['racking'] {
  const flush = roof.pitchDeg > 0 || roof.roofType === 'metal_shed';
  return flush
    ? { kind: 'flush' }
    : { kind: 'fixed_tilt', tiltDeg, rowPitchM: 0, frontLegM: 0.3, backLegM: 0.3, profile: DEFAULT_PROFILE };
}

/**
 * Turn a set of loose panels (on one roof) into a parametric ArraySegment. The
 * grid (rows/cols/cellIndex/holes) is inferred from the panels' real positions
 * via reindexSegment, so existing designs gain the full table toolkit.
 */
export function groupIntoTable(
  roof: Roof,
  spec: PanelSpec,
  panels: PlacedPanel[],
  label: string,
): { segment: ArraySegment; panels: PlacedPanel[] } {
  const segId = genId('seg');
  const first = panels[0];
  const base: ArraySegment = {
    id: segId,
    roofId: roof.id,
    label,
    polygon: roof.polygon,
    rows: 0,
    cols: 0,
    orientation: first.orientation,
    azimuthDeg: first.azimuthDeg,
    racking: defaultRacking(roof, first.tiltDeg),
    moduleGapM: DEFAULT_FILL.gapM,
    removed: [],
  };
  const assigned = panels.map((p) => ({ ...p, segmentId: segId }));
  return reindexSegment(roof, spec, base, assigned);
}

export type GrowAxis = 'row' | 'column';
export type GrowSide = 'top' | 'bottom' | 'left' | 'right';

interface Grid {
  angle: number;
  pitchX: number;
  pitchY: number;
}

function segmentGrid(roof: Roof, spec: PanelSpec, seg: ArraySegment): Grid {
  const angle = roofGridAngle(roof);
  // The plan cell comes from layout.ts — the SAME definition the fill places
  // panels with. This used to re-derive it as `w·cos(pitch)` × `h`, which is
  // the pre-S1 axis assignment: on a pitched roof it put the module's SHORT
  // edge down-slope while the fill puts the LONG edge there. The grid was
  // therefore rotated 90° from the panels it was indexing, corrupting
  // reindexSegment and every grow/duplicate operation. It stayed invisible
  // because every fixture in this file's tests is a FLAT roof, where the two
  // derivations happen to agree.
  const { ax, ay } = planCellM(spec, seg.orientation, roof);
  // an elevated table with a solved shadow-free pitch uses it for the row axis
  const customRow =
    seg.racking.kind !== 'flush' && seg.racking.rowPitchM > 0 ? seg.racking.rowPitchM : 0;
  return {
    angle,
    pitchX: ax + seg.moduleGapM,
    pitchY: customRow || ay + seg.moduleGapM,
  };
}

/**
 * Recompute a segment's rows/cols/cellIndex/removed from its materialised panels,
 * so the parametric grid always matches reality after any edit. Returns fresh
 * panel objects (cellIndex updated) plus the updated segment.
 */
export function reindexSegment(
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  panels: PlacedPanel[],
): { segment: ArraySegment; panels: PlacedPanel[] } {
  const mine = panels.filter((p) => p.segmentId === seg.id);
  if (mine.length === 0) return { segment: { ...seg, rows: 0, cols: 0, removed: [] }, panels: [] };
  const { angle, pitchX, pitchY } = segmentGrid(roof, spec, seg);
  const locals = mine.map((p) => rotate(p.center, -angle));
  const minX = Math.min(...locals.map((l) => l.x));
  const minY = Math.min(...locals.map((l) => l.y));

  let maxRow = 0;
  let maxCol = 0;
  const occupied = new Set<number>();
  const out = mine.map((p, i) => {
    const col = Math.max(0, Math.round((locals[i].x - minX) / pitchX));
    const row = Math.max(0, Math.round((locals[i].y - minY) / pitchY));
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
    occupied.add(row * COL_STRIDE + col);
    return { ...p, cellIndex: row * COL_STRIDE + col };
  });

  const rows = maxRow + 1;
  const cols = maxCol + 1;
  const removed: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!occupied.has(r * COL_STRIDE + c)) removed.push(r * COL_STRIDE + c);
    }
  }
  return { segment: { ...seg, rows, cols, removed }, panels: out };
}

/**
 * Grow a segment by `count` rows or columns on a given side, generating panels
 * from the segment's grid and skipping any cell that would overlap something or
 * breach the setback (collision-aware). Returns the segment's FULL new panel set
 * (existing + added, reindexed), the updated segment, and how many were added.
 */
/**
 * The NEW panels a grow would add (collision-aware), without mutating the
 * segment. Powers both growSegment and the live grow ghost preview.
 */
export function growCandidates(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  axis: GrowAxis,
  side: GrowSide,
  count: number,
): PlacedPanel[] {
  const mine = project.panels.filter((p) => p.segmentId === seg.id);
  if (mine.length === 0 || count < 1) return [];
  const { angle, pitchX, pitchY } = segmentGrid(roof, spec, seg);
  const locals = mine.map((p) => rotate(p.center, -angle));
  const minX = Math.min(...locals.map((l) => l.x));
  const maxX = Math.max(...locals.map((l) => l.x));
  const minY = Math.min(...locals.map((l) => l.y));
  const maxY = Math.max(...locals.map((l) => l.y));
  const cols = Math.round((maxX - minX) / pitchX) + 1;
  const rows = Math.round((maxY - minY) / pitchY) + 1;
  // grown panels inherit the TABLE's pose, not the roof default — otherwise a
  // rotated/tilted table grows panels facing the wrong way.
  const tiltDeg =
    seg.racking.kind !== 'flush' ? seg.racking.tiltDeg : (mine[0]?.tiltDeg ?? defaultPanelPose(roof).tiltDeg);

  const make = (localX: number, localY: number): PlacedPanel | null => {
    const world = rotate({ x: localX, y: localY }, angle);
    if (!panelFitsAt(project, roof, spec, world, seg.orientation)) return null;
    return {
      id: genId('pv'),
      roofId: roof.id,
      center: world,
      orientation: seg.orientation,
      azimuthDeg: seg.azimuthDeg,
      tiltDeg,
      solarAccess: 1,
      enabled: true,
      segmentId: seg.id,
    };
  };

  const added: PlacedPanel[] = [];
  for (let k = 1; k <= count; k++) {
    if (axis === 'row') {
      // higher world-Y is UP on screen, so 'top' extends toward +Y
      const y = side === 'top' ? maxY + k * pitchY : minY - k * pitchY;
      for (let c = 0; c < cols; c++) {
        const p = make(minX + c * pitchX, y);
        if (p) added.push(p);
      }
    } else {
      const x = side === 'left' ? minX - k * pitchX : maxX + k * pitchX;
      for (let r = 0; r < rows; r++) {
        const p = make(x, minY + r * pitchY);
        if (p) added.push(p);
      }
    }
  }

  return added;
}

/**
 * Grow a segment by `count` rows or columns on a given side. Returns the
 * segment's full new panel set (existing + added, reindexed), the updated
 * segment, and how many were added.
 */
export function growSegment(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  axis: GrowAxis,
  side: GrowSide,
  count: number,
): { segment: ArraySegment; panels: PlacedPanel[]; added: number } {
  const mine = project.panels.filter((p) => p.segmentId === seg.id);
  const added = growCandidates(project, roof, spec, seg, axis, side, count);
  const re = reindexSegment(roof, spec, seg, [...mine, ...added]);
  return { segment: re.segment, panels: re.panels, added: added.length };
}

/** The valid grow directions for a selection kind. */
export function growSidesFor(axis: GrowAxis): GrowSide[] {
  return axis === 'row' ? ['top', 'bottom'] : ['left', 'right'];
}

export interface SelectionShape {
  segmentId?: string;
  kind: 'row' | 'column' | 'table' | 'other';
}

/**
 * Classify a set of selected panels for the smart-grow popover: a single grid
 * row, a single column, a whole table, or something else. Only panels sharing
 * one segment can be a row/column/table.
 */
export function classifySelection(panels: PlacedPanel[]): SelectionShape {
  if (panels.length === 0) return { kind: 'other' };
  const segId = panels[0].segmentId;
  if (!segId || panels.some((p) => p.segmentId !== segId || p.cellIndex == null))
    return { kind: 'other' };
  const rows = new Set(panels.map((p) => Math.floor((p.cellIndex as number) / COL_STRIDE)));
  const cols = new Set(panels.map((p) => (p.cellIndex as number) % COL_STRIDE));
  if (rows.size === 1) return { segmentId: segId, kind: 'row' };
  if (cols.size === 1) return { segmentId: segId, kind: 'column' };
  return { segmentId: segId, kind: 'table' };
}

// ─── Per-table properties (Phase 2 array side-panel) ────────────────────────

/** Steel mounting sections; kgPerM feeds the structural BOM. */
export const STRUCTURE_PROFILES: StructureProfile[] = [
  { key: 'c_channel', label: 'C-Channel', kgPerM: 2.2 },
  { key: 'u_channel', label: 'U-Channel', kgPerM: 2.4 },
  { key: 'l_angle', label: 'L-Angle', kgPerM: 1.8 },
  { key: 'z_purlin', label: 'Z-Purlin', kgPerM: 2.6 },
  { key: 'rhs', label: 'RHS / Box', kgPerM: 3.4 },
  { key: 'chs', label: 'CHS / Round tube', kgPerM: 3.0 },
];

export type ElevatedKind = 'fixed_tilt' | 'dual_tilt';

/** Vertical rise a tilted module adds: its along-tilt dimension × sin(tilt). */
function moduleRise(spec: PanelSpec, seg: ArraySegment, tiltDeg: number): number {
  const { h } = panelFootprintM(spec, seg.orientation);
  return h * Math.sin((tiltDeg * Math.PI) / 180);
}

/** Build an elevated racking spec, carrying prior fields where possible. */
function elevatedRacking(
  spec: PanelSpec,
  seg: ArraySegment,
  kind: ElevatedKind,
  tiltDeg: number,
): RackingSpec {
  const prev = seg.racking.kind !== 'flush' ? seg.racking : null;
  const front = prev?.frontLegM ?? 0.3;
  return {
    kind,
    tiltDeg,
    rowPitchM: prev?.rowPitchM ?? 0,
    frontLegM: front,
    backLegM: front + moduleRise(spec, seg, tiltDeg),
    profile: prev?.profile ?? DEFAULT_PROFILE,
    // carry the LAZY structure fields (Phase 7) — a tilt change must never
    // silently reset an explicit leg spacing / clearance / foundation choice
    ...(prev?.legSpacingM !== undefined ? { legSpacingM: prev.legSpacingM } : {}),
    ...(prev?.foundation !== undefined ? { foundation: prev.foundation } : {}),
    ...(prev?.clearanceM !== undefined ? { clearanceM: prev.clearanceM } : {}),
  };
}

function syncTilt(panels: PlacedPanel[], segId: string, tiltDeg: number): PlacedPanel[] {
  return panels.map((p) => (p.segmentId === segId ? { ...p, tiltDeg } : p));
}

/** Change a table's racking kind; flush lays the panels in the roof plane. */
export function setSegmentRacking(
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  panels: PlacedPanel[],
  kind: 'flush' | ElevatedKind,
): { segment: ArraySegment; panels: PlacedPanel[] } {
  if (kind === 'flush') {
    const tiltDeg = roof.pitchDeg > 0 ? defaultPanelPose(roof).tiltDeg : 0;
    return { segment: { ...seg, racking: { kind: 'flush' } }, panels: syncTilt(panels, seg.id, tiltDeg) };
  }
  const tiltDeg = seg.racking.kind !== 'flush' ? seg.racking.tiltDeg : 10;
  return {
    segment: { ...seg, racking: elevatedRacking(spec, seg, kind, tiltDeg) },
    panels: syncTilt(panels, seg.id, tiltDeg),
  };
}

/** Set the tilt of an elevated table (0–35°); no-op on flush racking. */
export function setSegmentTilt(
  spec: PanelSpec,
  seg: ArraySegment,
  panels: PlacedPanel[],
  tiltDeg: number,
): { segment: ArraySegment; panels: PlacedPanel[] } {
  if (seg.racking.kind === 'flush') return { segment: seg, panels };
  const t = Math.max(0, Math.min(35, tiltDeg));
  return {
    segment: { ...seg, racking: elevatedRacking(spec, seg, seg.racking.kind, t) },
    panels: syncTilt(panels, seg.id, t),
  };
}

/** Set a table's facing azimuth (0=N clockwise); syncs the panels (yield). */
export function setSegmentAzimuth(
  seg: ArraySegment,
  panels: PlacedPanel[],
  azimuthDeg: number,
): { segment: ArraySegment; panels: PlacedPanel[] } {
  const az = ((Math.round(azimuthDeg) % 360) + 360) % 360;
  return {
    segment: { ...seg, azimuthDeg: az },
    panels: panels.map((p) => (p.segmentId === seg.id ? { ...p, azimuthDeg: az } : p)),
  };
}

/** Set the structural profile of an elevated table (no-op on flush). */
export function setSegmentProfile(seg: ArraySegment, profile: StructureProfile): ArraySegment {
  if (seg.racking.kind === 'flush') return seg;
  return { ...seg, racking: { ...seg.racking, profile } };
}

/** Write EXPLICIT structure fields onto an elevated table's racking (Phase 7).
 *  Pass undefined to clear a field back to the lazy default chain. */
export function setSegmentStructureFields(
  seg: ArraySegment,
  fields: Partial<{ legSpacingM: number; foundation: FoundationKind; clearanceM: number }>,
): ArraySegment {
  if (seg.racking.kind === 'flush') return seg;
  const racking = { ...seg.racking, ...fields };
  // drop explicit undefineds so the racking JSON stays canonical
  for (const k of ['legSpacingM', 'foundation', 'clearanceM'] as const) {
    if (racking[k] === undefined) delete racking[k];
  }
  return { ...seg, racking };
}

// ─── Delete (reindex) + duplicate ───────────────────────────────────────────

/**
 * After panels change (e.g. a row/column deleted), re-fit every segment's grid
 * to its remaining panels and drop segments that lost all their panels. So
 * deleting an edge row shrinks the grid, an interior row leaves holes, and an
 * emptied table disappears.
 */
export function reindexAll(
  roofs: Roof[],
  spec: PanelSpec,
  segments: ArraySegment[],
  panels: PlacedPanel[],
): { segments: ArraySegment[]; panels: PlacedPanel[] } {
  const roofById = new Map(roofs.map((r) => [r.id, r]));
  const byId = new Map(panels.map((p) => [p.id, p]));
  const outSegs: ArraySegment[] = [];
  for (const seg of segments) {
    const mine = panels.filter((p) => p.segmentId === seg.id);
    if (mine.length === 0) continue; // emptied table → drop it
    const roof = roofById.get(seg.roofId);
    if (!roof) {
      outSegs.push(seg);
      continue;
    }
    const re = reindexSegment(roof, spec, seg, mine);
    outSegs.push(re.segment);
    for (const p of re.panels) byId.set(p.id, p);
  }
  return { segments: outSegs, panels: [...byId.values()] };
}

/**
 * Clone a table one table-width to the side (collision-aware). Returns the new
 * segment + its panels, or null if there is no room for any of the copy.
 */
export function duplicateSegment(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
): { segment: ArraySegment; panels: PlacedPanel[] } | null {
  const mine = project.panels.filter((p) => p.segmentId === seg.id);
  if (mine.length === 0) return null;
  const { angle, pitchX } = segmentGrid(roof, spec, seg);
  const locals = mine.map((p) => rotate(p.center, -angle));
  const minX = Math.min(...locals.map((l) => l.x));
  const maxX = Math.max(...locals.map((l) => l.x));
  const shift = maxX - minX + pitchX; // one column clear of the original
  const newId = genId('seg');
  const out: PlacedPanel[] = [];
  for (const p of mine) {
    const loc = rotate(p.center, -angle);
    const world = rotate({ x: loc.x + shift, y: loc.y }, angle);
    if (!panelFitsAt(project, roof, spec, world, seg.orientation)) continue;
    out.push({ ...p, id: genId('pv'), center: world, segmentId: newId });
  }
  if (out.length === 0) return null;
  return reindexSegment(roof, spec, { ...seg, id: newId, label: '' }, out);
}

/**
 * Re-lay a table's rows at a given centre-to-centre pitch (e.g. the shadow-free
 * pitch), within the table's current extent. Wider spacing means fewer rows fit
 * — the physically correct result. Stores the pitch on the racking so grow/
 * reindex keep it. Returns null if nothing fits.
 */
export function respaceSegment(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  rowPitchM: number,
): { segment: ArraySegment; panels: PlacedPanel[] } | null {
  const mine = project.panels.filter((p) => p.segmentId === seg.id);
  if (mine.length === 0 || rowPitchM <= 0) return null;
  const { angle, pitchX } = segmentGrid(roof, spec, seg);
  const locals = mine.map((p) => rotate(p.center, -angle));
  const minX = Math.min(...locals.map((l) => l.x));
  const maxX = Math.max(...locals.map((l) => l.x));
  const minY = Math.min(...locals.map((l) => l.y));
  const maxY = Math.max(...locals.map((l) => l.y));
  const tiltDeg = seg.racking.kind !== 'flush' ? seg.racking.tiltDeg : (mine[0]?.tiltDeg ?? 0);
  // fit against everything EXCEPT this table's own (about-to-be-replaced) panels
  const without: Project = { ...project, panels: project.panels.filter((p) => p.segmentId !== seg.id) };

  const out: PlacedPanel[] = [];
  for (let y = minY; y <= maxY + 0.01; y += rowPitchM) {
    for (let x = minX; x <= maxX + 0.01; x += pitchX) {
      const world = rotate({ x, y }, angle);
      if (!panelFitsAt(without, roof, spec, world, seg.orientation)) continue;
      out.push({
        id: genId('pv'),
        roofId: roof.id,
        center: world,
        orientation: seg.orientation,
        tiltDeg,
        azimuthDeg: seg.azimuthDeg,
        solarAccess: 1,
        enabled: true,
        segmentId: seg.id,
      });
    }
  }
  if (out.length === 0) return null;
  const racking: RackingSpec =
    seg.racking.kind !== 'flush' ? { ...seg.racking, rowPitchM } : seg.racking;
  return reindexSegment(roof, spec, { ...seg, racking }, out);
}
