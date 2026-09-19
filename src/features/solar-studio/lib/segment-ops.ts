// ─── Parametric ArraySegment ops: grow rows/columns, reindex the grid ───────
// The engine behind Phase 2's "smart grow" tool. Panels stay the materialised
// source of truth; these helpers add cells (collision-aware) and keep the
// segment's rows/cols/cellIndex/removed self-consistent with the panels.
import type {
  FoundationKind,
  FoundationShape,
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
// A table's extent is measured over its MODULES, so these walk a list that
// grows with the design — 128,000 of them on a 36 ha field. The spread form
// (`Math.min(...locals.map(…))`) passes one argument per module and throws
// RangeError past ~100k. See lib/bulk.ts for the measurement.
import { maxBy, minBy } from './bulk';
import {
  COL_STRIDE,
  DEFAULT_FILL,
  DEFAULT_PROFILE,
  defaultPanelPose,
  gridAngleFor,
  panelFitsAt,
  panelFootprintM,
  planCellM,
  refitShiftAfterTurn,
} from './layout';
import {
  AZEL_DEFAULT_PITCH_FACTOR,
  isTrackerKind,
  TRACKER_FIELD_FACING_DEG,
  TRACKER_DEFAULT_GCR,
  TRACKER_DEFAULT_MAX_ROTATION_DEG,
  TRACKER_DEFAULT_TUBE_HEIGHT_M,
} from './energy/tracker';
import { isFacade, isSheetRoof } from './roof-plane';
import { facadeAlongM, facadeFace } from './facade';

/** Racking a segment gets by default from its roof (flush on pitched/sheet). */
function defaultRacking(roof: Roof, tiltDeg: number): ArraySegment['racking'] {
  const flush = roof.pitchDeg > 0 || isSheetRoof(roof);
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

/**
 * The pose a segment's grid frame follows: the pose its own panels ACTUALLY
 * carry (majority azimuth+tilt — the user may have rotated/tilted the table
 * after the fill), falling back to the segment's declared azimuth + racking
 * tilt when it has no panels to read.
 */
function segmentPose(
  seg: ArraySegment,
  panels: PlacedPanel[],
): { tiltDeg: number; azimuthDeg: number } {
  if (panels.length > 0) {
    const counts = new Map<string, { n: number; tiltDeg: number; azimuthDeg: number }>();
    for (const p of panels) {
      const k = `${p.azimuthDeg}/${p.tiltDeg}`;
      const e = counts.get(k);
      if (e) e.n++;
      else counts.set(k, { n: 1, tiltDeg: p.tiltDeg, azimuthDeg: p.azimuthDeg });
    }
    let best: { n: number; tiltDeg: number; azimuthDeg: number } | undefined;
    for (const e of counts.values()) if (!best || e.n > best.n) best = e;
    return { tiltDeg: best!.tiltDeg, azimuthDeg: best!.azimuthDeg };
  }
  return {
    azimuthDeg: seg.azimuthDeg,
    tiltDeg: seg.racking.kind !== 'flush' ? seg.racking.tiltDeg : 0,
  };
}

/**
 * THE segment's local frame angle — the one its panels are actually laid out
 * in, whatever the user has since rotated.
 *
 * Exported because Phase 22i stores a hand-placed leg plan in this frame, and
 * the leg plan must not derive its own. An independent derivation is exactly
 * the azimuth-lattice bug class: it agrees on a due-south table and silently
 * diverges the moment one is rotated, putting the legs at an angle to the
 * panels they carry. One derivation, two readers.
 *
 * World → local is `rotate(p, -angle)`; local → world is `rotate(p, angle)`.
 */
export function segmentFrameAngle(
  roof: Roof,
  seg: ArraySegment,
  panels: PlacedPanel[],
): number {
  return gridAngleFor(roof, segmentPose(seg, panels));
}

export function segmentGrid(
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  panels: PlacedPanel[],
): Grid {
  // the frame the segment's panels actually use: on a flat roof a TILTED
  // table's lattice follows its panels' azimuth (rows perpendicular to the
  // facing — the frame autoFillRoof placed them in and gridAngleFor defines),
  // so grow/respace/duplicate/reindex keep operating in the panels' own frame
  // even after the user rotates the table.
  const angle = gridAngleFor(roof, segmentPose(seg, panels), {
    faceAzimuth: isTrackerKind(seg.racking.kind),
  });
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
  // ── A FACADE's grid is not in plan ────────────────────────────────────────
  // The plan derivation below reads the row off `locals.y`, and on a wall every
  // course of a column IS the same plan point — so it collapsed a 5 × 15
  // elevation into "1 × 15", rewrote 75 modules onto 15 cell indices, and left
  // the structure builder splitting the wall into 75 one-module runs with two
  // short rails each instead of 10 rails across it. The panels still LOOKED
  // right in 3D, because their height rides on the module (`mountHeightM`), so
  // only the BOM and the member graph were wrong. Caught in the browser: the
  // table settings header said "1x15" next to a canvas label saying "5×15".
  //
  // The wall's own frame answers both: along the face for the column, and the
  // module's own height for the course.
  const wall = isFacade(roof) ? facadeFace(roof) : null;
  const foot = panelFootprintM(spec, seg.orientation);
  const alongOf = (p: PlacedPanel) => facadeAlongM(wall!, p.center);
  const heightOf = (p: PlacedPanel) => p.mountHeightM ?? 0;
  const { angle, pitchX, pitchY } = segmentGrid(roof, spec, seg, mine);
  const locals = mine.map((p) => (wall ? { x: alongOf(p), y: heightOf(p) } : rotate(p.center, -angle)));
  const minX = minBy(locals, (l) => l.x);
  const minY = minBy(locals, (l) => l.y);
  // on a wall the pitches are the module's own extents plus the joint: a course
  // is one module tall, a column one module wide, and neither is foreshortened
  const stepX = wall ? foot.w + seg.moduleGapM : pitchX;
  const stepY = wall ? foot.h + seg.moduleGapM : pitchY;

  let maxRow = 0;
  let maxCol = 0;
  const occupied = new Set<number>();
  const out = mine.map((p, i) => {
    const col = Math.max(0, Math.round((locals[i].x - minX) / stepX));
    const row = Math.max(0, Math.round((locals[i].y - minY) / stepY));
    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
    occupied.add(row * COL_STRIDE + col);
    return { ...p, cellIndex: row * COL_STRIDE + col, ...(seg.mms && seg.racking.kind === 'dual_tilt' ? { azimuthDeg: (seg.azimuthDeg + (row % 2 ? 180 : 0)) % 360 } : {}) };
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
 * How wide a grown row (or tall a grown column) is, and where along the table
 * it starts. Both are cell counts on the CROSS axis, both optional, and both
 * default to the table's full width — the behaviour every caller had before.
 *
 * This is the "6 wide next to a 9-wide table" case. Real roofs step in and out
 * around a stair head, and every added row used to be forced to full width and
 * then trimmed one module at a time with the eraser.
 *
 * KNOWN LIMIT, mitigated by the ghost rather than hidden: `cols`/`rows` come
 * from the panels' BOUNDING BOX, so a table already trimmed into an L reports
 * the full rectangle and a narrow row can land beside a gap. The live preview
 * paints exactly the modules that will appear, so the user sees it before Add.
 */
export interface GrowSpan {
  /** modules along the cross axis; default = the table's full width */
  span?: number;
  /** first cell on the cross axis; default 0 */
  offset?: number;
}

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
  opts: GrowSpan = {},
): PlacedPanel[] {
  const mine = project.panels.filter((p) => p.segmentId === seg.id);
  if (mine.length === 0 || count < 1) return [];
  const { angle, pitchX, pitchY } = segmentGrid(roof, spec, seg, mine);
  const locals = mine.map((p) => rotate(p.center, -angle));
  const minX = minBy(locals, (l) => l.x);
  const maxX = maxBy(locals, (l) => l.x);
  const minY = minBy(locals, (l) => l.y);
  const maxY = maxBy(locals, (l) => l.y);
  const cols = Math.round((maxX - minX) / pitchX) + 1;
  const rows = Math.round((maxY - minY) / pitchY) + 1;
  // grown panels inherit the TABLE's pose, not the roof default — otherwise a
  // rotated/tilted table grows panels facing the wrong way.
  const tiltDeg =
    seg.racking.kind !== 'flush' ? seg.racking.tiltDeg : (mine[0]?.tiltDeg ?? defaultPanelPose(roof).tiltDeg);

  const make = (localX: number, localY: number): PlacedPanel | null => {
    const world = rotate({ x: localX, y: localY }, angle);
    // the candidate carries the pose the grown panel will get, so the fit
    // check judges the same footprint DRC will (azimuth-lattice tables too)
    if (
      !panelFitsAt(project, roof, spec, world, seg.orientation, undefined, {
        tiltDeg,
        azimuthDeg: seg.azimuthDeg,
      })
    )
      return null;
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

  // How wide the new line is, and where it starts, along the CROSS axis. The
  // default is the table's full width — what every caller got before this
  // existed — so a row is only narrower when someone asks for it.
  const full = axis === 'row' ? cols : rows;
  const span = Math.max(1, Math.min(opts.span ?? full, full));
  const offset = Math.max(0, Math.min(opts.offset ?? 0, full - span));

  const added: PlacedPanel[] = [];
  for (let k = 1; k <= count; k++) {
    if (axis === 'row') {
      // higher world-Y is UP on screen, so 'top' extends toward +Y
      const y = side === 'top' ? maxY + k * pitchY : minY - k * pitchY;
      for (let c = offset; c < offset + span; c++) {
        const p = make(minX + c * pitchX, y);
        if (p) added.push(p);
      }
    } else {
      const x = side === 'left' ? minX - k * pitchX : maxX + k * pitchX;
      for (let r = offset; r < offset + span; r++) {
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
  opts: GrowSpan = {},
): { segment: ArraySegment; panels: PlacedPanel[]; added: number } {
  const mine = project.panels.filter((p) => p.segmentId === seg.id);
  const added = growCandidates(project, roof, spec, seg, axis, side, count, opts);
  const re = reindexSegment(roof, spec, seg, [...mine, ...added]);
  return { segment: re.segment, panels: re.panels, added: added.length };
}

/**
 * Shrink a segment by `count` rows or columns on a given side — the mirror of
 * growSegment, in the same lattice frame, so an edge dragged in and back out
 * lands on the same cells. Never empties the table: the last row/column
 * stays (remove the table instead).
 */
export function shrinkSegment(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  axis: GrowAxis,
  side: GrowSide,
  count: number,
): { segment: ArraySegment; panels: PlacedPanel[]; removed: number } {
  const mine = project.panels.filter((p) => p.segmentId === seg.id);
  if (mine.length === 0 || count < 1) return { segment: seg, panels: mine, removed: 0 };
  const { angle, pitchX, pitchY } = segmentGrid(roof, spec, seg, mine);
  const locals = mine.map((p) => ({ p, l: rotate(p.center, -angle) }));
  const minX = minBy(locals, ({ l }) => l.x);
  const maxX = maxBy(locals, ({ l }) => l.x);
  const minY = minBy(locals, ({ l }) => l.y);
  const maxY = maxBy(locals, ({ l }) => l.y);
  const cut = (l: { x: number; y: number }): boolean =>
    axis === 'row'
      ? side === 'top'
        ? l.y > maxY - count * pitchY + pitchY / 2
        : l.y < minY + count * pitchY - pitchY / 2
      : side === 'left'
        ? l.x < minX + count * pitchX - pitchX / 2
        : l.x > maxX - count * pitchX + pitchX / 2;
  const keep = locals.filter(({ l }) => !cut(l)).map(({ p }) => p);
  if (keep.length === 0) return { segment: seg, panels: mine, removed: 0 };
  const re = reindexSegment(roof, spec, seg, keep);
  return { segment: re.segment, panels: re.panels, removed: mine.length - keep.length };
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

/** One lattice row or column of a table: which modules it holds, and the band
 *  to draw over them so it can be tapped. */
export interface SegmentLine {
  /** the lattice index — row number for axis 'row', column number for 'column' */
  index: number;
  panelIds: string[];
  /** plan-space quad covering the whole line, for the tap target and the mark */
  corners: XY[];
}

/**
 * The table's rows (or columns) as tappable bands.
 *
 * Deleting an interior row was already POSSIBLE — marquee it and press Delete,
 * and `cascadeDeletePanels` → `reindexSegment` keeps the table's geometry and
 * records the gap in `segment.removed`. What was missing was the affordance and
 * the number. Two reasons to mark by BAND rather than by marquee: the 2D marquee
 * is world-axis-aligned, so it cannot cleanly grab a lattice row on a rotated
 * table; and a per-module marking would inherit the neighbour-hit-test problem
 * that `lib/plan-pick.ts` exists to avoid.
 *
 * Lines come from the panels' own `cellIndex`, which `reindexSegment` stamps, so
 * this reads the same grid every other table operation does. A line that has
 * been trimmed to nothing simply is not returned.
 */
export function segmentLines(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  axis: GrowAxis,
): SegmentLine[] {
  const mine = project.panels.filter((p) => p.segmentId === seg.id && p.cellIndex != null);
  if (mine.length === 0) return [];
  const { angle, pitchX, pitchY } = segmentGrid(roof, spec, seg, mine);
  const locals = mine.map((p) => rotate(p.center, -angle));
  const minX = minBy(locals, (l) => l.x);
  const maxX = maxBy(locals, (l) => l.x);
  const minY = minBy(locals, (l) => l.y);
  const maxY = maxBy(locals, (l) => l.y);

  const byIndex = new Map<number, string[]>();
  mine.forEach((p) => {
    const cell = p.cellIndex as number;
    const i = axis === 'row' ? Math.floor(cell / COL_STRIDE) : cell % COL_STRIDE;
    const bucket = byIndex.get(i);
    if (bucket) bucket.push(p.id);
    else byIndex.set(i, [p.id]);
  });

  // the band spans the table on the OTHER axis and one cell on its own
  const halfX = pitchX / 2;
  const halfY = pitchY / 2;
  return [...byIndex.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, panelIds]) => {
      const c =
        axis === 'row'
          ? (() => {
              const y = minY + index * pitchY;
              return [
                { x: minX - halfX, y: y - halfY },
                { x: maxX + halfX, y: y - halfY },
                { x: maxX + halfX, y: y + halfY },
                { x: minX - halfX, y: y + halfY },
              ];
            })()
          : (() => {
              const x = minX + index * pitchX;
              return [
                { x: x - halfX, y: minY - halfY },
                { x: x + halfX, y: minY - halfY },
                { x: x + halfX, y: maxY + halfY },
                { x: x - halfX, y: maxY + halfY },
              ];
            })();
      return { index, panelIds, corners: c.map((pt) => rotate(pt, angle)) };
    });
}

/**
 * Every table the selection touches, in first-seen order.
 *
 * `classifySelection` deliberately answers a DIFFERENT question — "is this
 * selection one row, one column, or one whole table?" — and returns
 * `{kind:'other'}` the moment two panels carry different `segmentId`s, because
 * growing a row across two tables is meaningless. That is right for grow and
 * wrong for everything else: it also made the Table sheet unreachable with two
 * tables selected, so "set these twelve tables to 12°" was not slow, it was
 * impossible. This is the question the settings sheet actually asks.
 *
 * Loose hand-placed modules carry no `segmentId` and are simply not tables;
 * they are ignored here rather than reported as a null entry.
 */
export function selectedSegmentIds(panels: PlacedPanel[]): string[] {
  const seen: string[] = [];
  for (const p of panels) {
    if (p.segmentId && !seen.includes(p.segmentId)) seen.push(p.segmentId);
  }
  return seen;
}

/**
 * The one value they all share, or `undefined` when they differ — the test
 * behind a settings field showing "–" for a mixed selection instead of lying
 * with the first table's number. `undefined` for an empty list too: nothing
 * selected has no shared value either.
 */
export function oneOf<T>(vals: readonly T[]): T | undefined {
  if (vals.length === 0) return undefined;
  const first = vals[0];
  return vals.every((v) => v === first) ? first : undefined;
}

// ─── Per-table properties (Phase 2 array side-panel) ────────────────────────

/**
 * Steel mounting sections now live in `data/profiles.ts` (Phase 22a), where the
 * catalog also carries the machine-readable `dims` that drive the 3D geometry.
 * Re-exported here so the existing import sites keep working unchanged.
 */
export { STRUCTURE_PROFILES } from '../data/profiles';

export type ElevatedKind = 'fixed_tilt' | 'dual_tilt' | 'tracker_hsat' | 'tracker_azel';

/** Vertical rise a tilted module adds: its along-tilt dimension × sin(tilt). */
function moduleRise(spec: PanelSpec, seg: ArraySegment, tiltDeg: number): number {
  const { h } = panelFootprintM(spec, seg.orientation);
  return h * Math.sin((tiltDeg * Math.PI) / 180);
}

/**
 * Shallowest tilt an elevated table may be set to. Rationale at setSegmentTilt:
 * it is both the practical drainage/self-cleaning minimum and the guard that
 * keeps a table off the tilt-0 frame boundary.
 */
const MIN_ELEVATED_TILT_DEG = 5;

/** Build an elevated racking spec, carrying prior fields where possible. */
function elevatedRacking(
  spec: PanelSpec,
  seg: ArraySegment,
  kind: ElevatedKind,
  tiltDeg: number,
): RackingSpec {
  const prev = seg.racking.kind !== 'flush' ? seg.racking : null;
  const tracker = isTrackerKind(kind);
  // A tracker lies FLAT at rest (its real tilt is the time of day), stands on a
  // torque tube well clear of the ground, and needs the wide pitch a tracker
  // field is laid out at — a fixed table's 3 m rows would spend the morning
  // backtracked almost flat. Every one of these is editable afterwards.
  const slantM = panelFootprintM(spec, seg.orientation).h;
  const front = tracker
    ? Math.max(prev?.frontLegM ?? 0, TRACKER_DEFAULT_TUBE_HEIGHT_M)
    : (prev?.frontLegM ?? 0.3);
  // A DUAL-AXIS field needs MORE room than a single-axis one, not the same.
  // An HSAT backtracks its way out of a low sun; a pointed frame cannot, so
  // distance is the only thing keeping one unit out of the next one's shadow.
  const pitch = tracker
    ? Math.max(
        prev?.rowPitchM ?? 0,
        kind === 'tracker_azel' ? slantM * AZEL_DEFAULT_PITCH_FACTOR : slantM / TRACKER_DEFAULT_GCR,
      )
    : (prev?.rowPitchM ?? 0);
  return {
    ...(prev ?? {}),
    kind,
    tiltDeg,
    rowPitchM: pitch,
    frontLegM: front,
    backLegM: front + moduleRise(spec, seg, tiltDeg),
    profile: prev?.profile ?? DEFAULT_PROFILE,
    ...(tracker
      ? {
          // axisAzimuthDeg stays LAZY: the tube follows the table's rows
          ...(prev?.axisAzimuthDeg !== undefined ? { axisAzimuthDeg: prev.axisAzimuthDeg } : {}),
          maxRotationDeg: prev?.maxRotationDeg ?? TRACKER_DEFAULT_MAX_ROTATION_DEG,
          backtracking: prev?.backtracking ?? true,
        }
      : {}),
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
    // Flush means "coplanar with the surface", so the tilt is the SURFACE's
    // own angle — and a facade's is 90°, which `pitchDeg` cannot say (it is
    // stored 0 because the plane formula has no finite value at vertical, see
    // roof-plane.isFacade). Testing only `pitchDeg > 0` therefore flattened
    // every module on a wall the moment a mounting system was chosen for it.
    const tiltDeg =
      roof.pitchDeg > 0 || isFacade(roof) ? defaultPanelPose(roof).tiltDeg : 0;
    return { segment: { ...seg, racking: { kind: 'flush' } }, panels: syncTilt(panels, seg.id, tiltDeg) };
  }
  // a tracker lies flat at rest; coming BACK off one, the stored 0° is not a
  // tilt any fixed table may keep, so it takes the ordinary rooftop default
  const prevTilt = seg.racking.kind !== 'flush' ? seg.racking.tiltDeg : 10;
  const tiltDeg = isTrackerKind(kind) ? 0 : prevTilt >= MIN_ELEVATED_TILT_DEG ? prevTilt : 10;
  const racking = elevatedRacking(spec, seg, kind, tiltDeg);
  const tilted = syncTilt(panels, seg.id, tiltDeg);
  // A DUAL-AXIS field is NOT turned east. An HSAT is turned so its rows run
  // north–south, because its rows ARE its tubes and a tube must lie that way.
  // A dual-axis unit has no tube: every mast turns on its own, so the layout's
  // facing decides only where the frames park and which way they swing from.
  // Turning the table here would move 75 modules for no reason at all.
  if (kind !== 'tracker_hsat') return { segment: { ...seg, racking }, panels: tilted };
  // A tracker's ROWS are its tubes, so the table must be laid out with its rows
  // running north–south — which is a table facing EAST. Turning it here, rather
  // than leaving the rows pointing wherever the fill put them, is the
  // difference between a tracker field and a row of modules that shade each
  // other all morning. Re-space the rows afterwards to finish the re-lay.
  //
  // Picking "Tracker" is a PRESET, not a drag, so the turned table is slid back
  // onto the roof rather than left breaching the setback where the turn put it.
  return faceSegmentForPreset(roof, spec, { ...seg, racking }, tilted, TRACKER_FIELD_FACING_DEG);
}

/** Set the tilt of an elevated table (0–35°); no-op on flush racking. */
export function setSegmentTilt(
  spec: PanelSpec,
  seg: ArraySegment,
  panels: PlacedPanel[],
  tiltDeg: number,
): { segment: ArraySegment; panels: PlacedPanel[] } {
  if (seg.racking.kind === 'flush') return { segment: seg, panels };
  // A TRACKER'S tilt is the time of day, not a setting — see lib/energy/tracker.
  // Both machines: an HSAT's roll and a dual-axis frame's lift are each solved
  // from where the sun is, so neither has a tilt anybody can type.
  if (isTrackerKind(seg.racking.kind)) return { segment: seg, panels };
  // An ELEVATED table cannot go to 0°, for two independent reasons.
  //
  // Engineering: below ~5° a module neither drains nor self-cleans, so no
  // ballasted table in Indian rooftop practice is built flatter than that.
  //
  // Geometric: the plan footprint of a flat-roof module snaps to the roof grid
  // at exactly tilt 0 (panelCornersOnRoof) while a tilted one follows its own
  // azimuth. Nudging tilt to 0 therefore rotated every module in the table ~90°
  // in place, landing two of them on one cellIndex and overlapping the rows.
  // Going genuinely flush is a RACKING-KIND change (setSegmentRacking), which
  // re-lays the table in the flush frame instead of re-posing it underneath.
  const t = Math.max(MIN_ELEVATED_TILT_DEG, Math.min(35, tiltDeg));
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
  const mine = panels.filter(p => p.segmentId === seg.id);
  const center = { x: mine.reduce((v, p) => v + p.center.x, 0) / Math.max(1, mine.length), y: mine.reduce((v, p) => v + p.center.y, 0) / Math.max(1, mine.length) };
  const turn = (p: XY): XY => { const v = rotate({ x: p.x - center.x, y: p.y - center.y }, seg.azimuthDeg - az); return { x: center.x + v.x, y: center.y + v.y }; };
  const rotated = seg.mms && seg.racking.kind !== 'flush';
  return {
    segment: { ...seg, azimuthDeg: az, ...(rotated ? { polygon: seg.polygon.map(turn) } : {}) },
    panels: panels.map((p) => (p.segmentId === seg.id ? { ...p, ...(rotated ? { center: turn(p.center) } : {}), azimuthDeg: seg.mms && seg.racking.kind === 'dual_tilt' && Math.floor((p.cellIndex ?? 0) / COL_STRIDE) % 2 ? (az + 180) % 360 : az } : p)),
  };
}

/**
 * Slide a whole table, frame and modules together, by `d` metres.
 *
 * Rigid: nothing is re-posed, re-indexed, added or dropped, so the module
 * count, the grid, the holes the user punched and every string survive
 * untouched. That is the whole reason a re-faced table is rescued by a SHIFT
 * rather than a re-fill.
 */
function shiftSegment(
  seg: ArraySegment,
  panels: PlacedPanel[],
  d: XY,
): { segment: ArraySegment; panels: PlacedPanel[] } {
  if (d.x === 0 && d.y === 0) return { segment: seg, panels };
  return {
    segment: { ...seg, polygon: seg.polygon.map((p) => ({ x: p.x + d.x, y: p.y + d.y })) },
    panels: panels.map((p) =>
      p.segmentId === seg.id ? { ...p, center: { x: p.center.x + d.x, y: p.center.y + d.y } } : p,
    ),
  };
}

/**
 * Turn a table to a new facing on an AUTOMATIC path, and keep it on the roof.
 *
 * `setSegmentAzimuth` alone is the manual gesture: it turns the table and
 * leaves it wherever that puts it, which is right when a person dragged the
 * handle. When a PRESET turns it — an east–west tray, a tracker — the user
 * asked for a mounting system, not for a relocation, so the table is slid back
 * inside the roof. When no slide can do it (the turned table is simply longer
 * than the roof is wide) the turn still applies and `validateMms` says so with
 * a finding that names the cause; nothing is deleted to make the geometry work.
 */
export function faceSegmentForPreset(
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  panels: PlacedPanel[],
  azimuthDeg: number,
): { segment: ArraySegment; panels: PlacedPanel[] } {
  const turned = setSegmentAzimuth(seg, panels, azimuthDeg);
  const shift = refitShiftAfterTurn(roof, spec, turned.segment, turned.panels);
  return shift ? shiftSegment(turned.segment, turned.panels, shift) : turned;
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
  fields: Partial<{
    legSpacingM: number;
    foundation: FoundationKind;
    foundationShape: FoundationShape;
    clearanceM: number;
    // Phase 22g parametrics, exposed by the Customize MMS controls
    purlinCount: number;
    rafterCount: number;
    rafterMultiplier: number;
    endBufferM: number;
    bracing: boolean;
  }>,
): ArraySegment {
  if (seg.racking.kind === 'flush') return seg;
  const racking = { ...seg.racking, ...fields };
  // Drop explicit undefineds so the racking JSON stays canonical. This is the
  // lazy-field contract, and it is what lets a control return a value to its
  // DEFAULT and have the segment serialise byte-identically to one that never
  // touched it — no re-keyed layoutFp, no staled capture, for a no-op edit.
  for (const k of [
    'legSpacingM',
    'foundation',
    'foundationShape',
    'clearanceM',
    'purlinCount',
    'rafterCount',
    'rafterMultiplier',
    'endBufferM',
    'bracing',
  ] as const) {
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
  const { angle, pitchX } = segmentGrid(roof, spec, seg, mine);
  const locals = mine.map((p) => rotate(p.center, -angle));
  const minX = minBy(locals, (l) => l.x);
  const maxX = maxBy(locals, (l) => l.x);
  const shift = maxX - minX + pitchX; // one column clear of the original
  const newId = genId('seg');
  const out: PlacedPanel[] = [];
  for (const p of mine) {
    const loc = rotate(p.center, -angle);
    const world = rotate({ x: loc.x + shift, y: loc.y }, angle);
    // each clone keeps its source panel's pose — validate that exact footprint
    if (
      !panelFitsAt(project, roof, spec, world, seg.orientation, undefined, {
        tiltDeg: p.tiltDeg,
        azimuthDeg: p.azimuthDeg,
      })
    )
      continue;
    out.push({ ...p, id: genId('pv'), center: world, segmentId: newId });
  }
  if (out.length === 0) return null;
  return reindexSegment(roof, spec, { ...seg, id: newId, label: '' }, out);
}

/**
 * Re-lay a table's modules on a given lattice, inside the extent its CURRENT
 * modules occupy. Shared by respace (new row pitch) and relay (new orientation
 * or module gap) so there is exactly one definition of "lay a table out and
 * keep only what fits". Returns null if nothing fits.
 *
 * The extent does not grow: widening the pitch, or flipping to landscape,
 * therefore DROPS modules rather than spilling the table across the roof. That
 * is the physically honest answer, and the caller must surface the loss — the
 * op kernel's impact line does it for free.
 */
function layOnLattice(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  mine: PlacedPanel[],
  angle: number,
  pitchX: number,
  pitchY: number,
): PlacedPanel[] | null {
  const locals = mine.map((p) => rotate(p.center, -angle));
  const minX = minBy(locals, (l) => l.x);
  const maxX = maxBy(locals, (l) => l.x);
  const minY = minBy(locals, (l) => l.y);
  const maxY = maxBy(locals, (l) => l.y);
  const tiltDeg = seg.racking.kind !== 'flush' ? seg.racking.tiltDeg : (mine[0]?.tiltDeg ?? 0);
  // fit against everything EXCEPT this table's own (about-to-be-replaced) panels
  const without: Project = { ...project, panels: project.panels.filter((p) => p.segmentId !== seg.id) };

  const out: PlacedPanel[] = [];
  // local y IS the facing axis on an azimuth-lattice table (gridAngleFor), so
  // the pitch applies along the direction the rows shade each other in
  for (let y = minY; y <= maxY + 0.01; y += pitchY) {
    for (let x = minX; x <= maxX + 0.01; x += pitchX) {
      const world = rotate({ x, y }, angle);
      if (
        !panelFitsAt(without, roof, spec, world, seg.orientation, undefined, {
          tiltDeg,
          azimuthDeg: seg.azimuthDeg,
          faceAzimuth: isTrackerKind(seg.racking.kind),
        })
      )
        continue;
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
  return out.length > 0 ? out : null;
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
  // A row pitch below the module's own length puts steel through steel. The
  // fill has always floored it (fillRowPitchM); respace did not, so dragging
  // the spacing slider down produced physically overlapping rows that only DRC
  // caught after the fact. Same floor, one rule: the module footprint + 1 cm.
  const pitch = Math.max(rowPitchM, panelFootprintM(spec, seg.orientation).h + 0.01);
  const { angle, pitchX } = segmentGrid(roof, spec, seg, mine);
  const out = layOnLattice(project, roof, spec, seg, mine, angle, pitchX, pitch);
  if (!out) return null;
  const racking: RackingSpec =
    seg.racking.kind !== 'flush' ? { ...seg.racking, rowPitchM } : seg.racking;
  return reindexSegment(roof, spec, { ...seg, racking }, out);
}

/**
 * Change a table's module ORIENTATION or its module GAP and re-lay it.
 *
 * Both are engine capabilities that had no control. `lib/layout.ts` has honoured
 * `orientation` end to end since the beginning and `three/PanelsInstanced.tsx`
 * even keeps a separate instanced mesh and material for landscape modules — the
 * renderer could draw a case nothing in the product could produce, because five
 * call sites in the editor passed the literal `'portrait'`. Indian metal-shed
 * and north-light roofs are laid landscape along the purlins, and half our
 * declared scope is C&I.
 *
 * Neither field can be written on its own: both change the lattice pitch, so the
 * modules must be re-laid or the stored grid stops describing the panels — which
 * is what corrupts reindex, grow and duplicate. Hence one function, not a setter.
 *
 * `moduleGapM` is ONE scalar and drives BOTH axes (`segmentGrid`). Independent
 * row and column gaps would need a new field on `ArraySegment`, and it would have
 * to be optional and lazily written, because `lib/fingerprints.ts` serialises the
 * segment tuple — an always-present field re-keys every existing project and
 * stales its captures. Not done here.
 */
export function relaySegment(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  seg: ArraySegment,
  fields: { orientation?: PanelOrientation; moduleGapM?: number },
): { segment: ArraySegment; panels: PlacedPanel[] } | null {
  const mine = project.panels.filter((p) => p.segmentId === seg.id);
  if (mine.length === 0) return null;
  const next: ArraySegment = {
    ...seg,
    ...(fields.orientation ? { orientation: fields.orientation } : {}),
    ...(fields.moduleGapM !== undefined ? { moduleGapM: Math.max(0, fields.moduleGapM) } : {}),
  };
  if (next.orientation === seg.orientation && next.moduleGapM === seg.moduleGapM) return null;
  // the lattice of the NEW pose — angle included, because planCellM swaps the
  // axes with orientation on a pitched roof
  const { angle, pitchX, pitchY } = segmentGrid(roof, spec, next, mine);
  const out = layOnLattice(project, roof, spec, next, mine, angle, pitchX, pitchY);
  if (!out) return null;
  return reindexSegment(roof, spec, next, out);
}
