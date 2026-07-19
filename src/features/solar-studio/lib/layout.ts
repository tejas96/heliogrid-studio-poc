// ─── Panel auto-layout: fill roof polygons honoring setbacks & obstructions ─
import type {
  ArraySegment,
  Keepout,
  Obstruction,
  PanelOrientation,
  PanelSpec,
  PlacedPanel,
  Project,
  RackingSpec,
  Roof,
  Walkway,
  XY,
} from '../types';
import { DEFAULT_PROFILE } from '../data/profiles';
import {
  dominantEdgeAngle,
  genId,
  insetPolygonRobust,
  pointInPolygon,
  rectCorners,
  rectIntersectsPolygon,
  rectsOverlap,
  rotate,
  add,
} from './geo';
import { higherOverlapFootprints } from './roof-topology';
import { isBridgedAt, resolveCapabilities } from './capabilities';
import { isSloped, slopePanelPose, slopeVector } from './roof-plane';
import { resolveRules } from '../data/rules/india';
import { shadowFreePitchM } from './spacing';

export interface FillOptions {
  orientation: PanelOrientation;
  /** gap between panels in meters */
  gapM: number;
  /** row walkway gap every N rows (0 = none) */
  grouped: boolean;
  maxPanels?: number;
  /** existing panels the fill must NOT overlap (collision-aware placement) */
  avoidPanels?: PlacedPanel[];
  /**
   * Expert override for the TILTED-row pitch (centre-to-centre, m). Default =
   * the winter-solstice shadow-free solver. A tighter manual pitch is allowed
   * — the row-shading derate then prices it honestly in the energy report.
   */
  rowPitchM?: number;
  /**
   * Under-structure clearance of the array being placed (frontLegM incl.
   * walk-under). When set, obstructions whose capabilities allow bridging at
   * this clearance STOP blocking placement (§26c). Absent = no bridging.
   */
  bridgeClearanceM?: number;
}

export const DEFAULT_FILL: FillOptions = {
  orientation: 'portrait',
  gapM: 0.05,
  grouped: true,
};

/**
 * Mounting pose implied by the roof: a pitched roof flush-mounts, so panels
 * inherit the roof's slope (tilt) and aspect (azimuth). Otherwise RCC flat
 * roofs use an elevated 10° south structure; flat metal sheds lie flush at 0°.
 */
export function defaultPanelPose(roof: Roof): {
  tiltDeg: number;
  azimuthDeg: number;
} {
  if (isSloped(roof)) return slopePanelPose(roof);
  if (roof.roofType === 'metal_shed') return { tiltDeg: 0, azimuthDeg: 180 };
  // a FLAT tile deck cannot take ballasted tilt legs — tile is a covering you
  // hook through, not a slab you stand a structure on. Flush, like metal shed.
  if (roof.roofType === 'tile') return { tiltDeg: 0, azimuthDeg: 180 };
  // open ground has no roof to constrain tilt, so it does NOT inherit the 10°
  // rooftop ballast compromise — it starts near latitude-optimal
  if (roof.roofType === 'ground')
    return { tiltDeg: resolveRules().defaults.groundTiltDeg, azimuthDeg: 180 };
  return { tiltDeg: 10, azimuthDeg: 180 };
}

function panelFootprint(
  spec: PanelSpec,
  orientation: PanelOrientation,
): { w: number; h: number } {
  const L = spec.lengthMm / 1000;
  const W = spec.widthMm / 1000;
  // portrait = long side along column direction (vertical in row layout)
  return orientation === 'portrait' ? { w: W, h: L } : { w: L, h: W };
}

/** cellIndex encodes the grid position: row * COL_STRIDE + col. */
export const COL_STRIDE = 1000;

/** Grid-origin nudge that keeps flush candidates off the region boundary. */
const GRID_EPS_M = 1e-6;

/**
 * Default mounting profile until the racking picker sets one.
 *
 * This used to be a SECOND hand-written literal that duplicated
 * `STRUCTURE_PROFILES[0]` and had already drifted from it by label. Both now
 * come from `data/profiles.ts`; re-exported so existing importers are unchanged.
 */
export { DEFAULT_PROFILE };

interface Blocker {
  corners: XY[];
}

/** Drawn keepouts that block placement (shade-only keepouts do not). */
function keepoutPolys(roof: Roof, keepouts: Keepout[]): XY[][] {
  return keepouts
    .filter(
      (k) => (k.roofId === roof.id || k.roofId === null) && k.kind !== 'shade',
    )
    .map((k) => k.shape);
}

function obstructionBlockers(
  roof: Roof,
  obstructions: Obstruction[],
  bridgeClearanceM?: number,
): Blocker[] {
  return obstructions
    .filter(
      (o) =>
        o.blocksPlacement &&
        o.roofId === roof.id &&
        // §26c bridging: a crossable obstruction stops blocking when the
        // array's under-structure clearance clears its top + margin
        !isBridgedAt(o, bridgeClearanceM),
    )
    .map((o) => {
      // horizontal buffer honors the capability clearance when larger
      const buf = Math.max(o.setbackM, resolveCapabilities(o).minHorizontalClearanceM);
      if (o.shape === 'circle') {
        const r = o.diameterM / 2 + buf;
        // approximate circle with its bounding square for SAT
        return { corners: rectCorners(o.center, r * 2, r * 2, 0) };
      }
      return {
        corners: rectCorners(o.center, o.lengthM + buf * 2, o.widthM + buf * 2, o.rotationDeg),
      };
    });
}

/** Walkway strips as placement blockers. */
function walkwayBlockersFor(roof: Roof, walkways: Walkway[]): Blocker[] {
  return walkways
    .filter((wk) => wk.roofId === roof.id)
    .map((wk) => {
      const cx = (wk.a.x + wk.b.x) / 2;
      const cy = (wk.a.y + wk.b.y) / 2;
      const len = Math.hypot(wk.b.x - wk.a.x, wk.b.y - wk.a.y);
      const ang = (Math.atan2(wk.b.y - wk.a.y, wk.b.x - wk.a.x) * 180) / Math.PI;
      return { corners: rectCorners({ x: cx, y: cy }, len, wk.widthMm / 1000, ang) };
    });
}

/** Already-placed panels as blockers (footprints shrunk ~10% so exact
 *  edge-adjacency isn't mistaken for overlap). Collision-aware placement.
 *  Footprints come from the canonical frame (incl. slope foreshortening) so
 *  blockers occupy exactly the space the fill placed them in. */
function panelBlockersFor(
  roof: Roof,
  spec: PanelSpec,
  panels: PlacedPanel[],
): Blocker[] {
  return panels
    .filter((p) => p.roofId === roof.id)
    .map((p) => {
      const c = panelCornersOnRoof(p, spec, roof);
      const cx = (c[0].x + c[2].x) / 2;
      const cy = (c[0].y + c[2].y) / 2;
      const k = 0.9;
      return { corners: c.map((pt) => ({ x: cx + (pt.x - cx) * k, y: cy + (pt.y - cy) * k })) };
    });
}

/** Roof grid alignment angle (down-slope on pitched roofs, else dominant edge). */
export function roofGridAngle(roof: Roof): number {
  if (isSloped(roof)) {
    const sv = slopeVector(roof);
    return (Math.atan2(sv.dy, sv.dx) * 180) / Math.PI;
  }
  return dominantEdgeAngle(roof.polygon);
}

/**
 * THE lattice angle for panels of a given pose on this roof — the one frame
 * fill, snap, fits, and segment ops all derive their grid from.
 *
 *  - sloped roof: local x runs straight down the slope (as before);
 *  - flat + tilted pose: the lattice comes from the pose's AZIMUTH, not the
 *    roof outline. `panelCornersOnRoof` gives a tilted flat-roof module the
 *    footprint rectCorners(center, w, h·cos tilt, −azimuthDeg): its `w` axis
 *    lies across the facing, its foreshortened `h` axis along it. The fill
 *    steps local x by w+gap and local y by the row pitch, so the lattice
 *    rotation must put those extents on those axes: angle ≡ −azimuthDeg
 *    (mod 180). We use 180 − azimuthDeg — the same line (a rectangle is
 *    invariant under a 180° turn about its centre), chosen so the default
 *    south-facing pose (az 180) yields angle 0 and axis-aligned roofs keep
 *    their historical lattice. Rows then run PERPENDICULAR to the facing and
 *    the row axis advances along the facing's horizontal direction — the
 *    geometry `fillRowPitchM`/`shadowFreePitchM` already assume. Before this,
 *    the lattice followed dominantEdgeAngle: on a roof whose long edge runs
 *    N-S, panels were spaced w+gap along the very axis their tilted plates
 *    occupy h·cos(tilt) — every consecutive pair overlapped (shingled 3D,
 *    field bug 2026-07-18);
 *  - flat + flush (tilt 0): dominant edge, as before — footprint alignment is
 *    aesthetic, there is no facing to violate.
 */
export function gridAngleFor(
  roof: Roof,
  pose: { tiltDeg: number; azimuthDeg: number },
): number {
  if (isSloped(roof)) {
    const sv = slopeVector(roof);
    return (Math.atan2(sv.dy, sv.dx) * 180) / Math.PI;
  }
  if (pose.tiltDeg > 0) return 180 - pose.azimuthDeg;
  return dominantEdgeAngle(roof.polygon);
}

/**
 * Row pitch (centre-to-centre, m) for a fill on this roof, or null for flush
 * mounts (sloped roofs / tilt-0 poses — coplanar rows cannot self-shade).
 * Default = the winter-solstice shadow-free solver (audit: the old fill
 * packed tilted rows at a 5 cm gap, so tight and correct spacing reported
 * identical energy). An explicit opts.rowPitchM wins, floored at the panel
 * footprint so rows can never physically overlap.
 */
export function fillRowPitchM(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  opts: FillOptions,
): number | null {
  if (isSloped(roof)) return null;
  const pose = defaultPanelPose(roof);
  if (pose.tiltDeg <= 0.1) return null;
  const { h } = panelFootprint(spec, opts.orientation);
  const floor = h + opts.gapM;
  if (opts.rowPitchM !== undefined) return Math.max(opts.rowPitchM, h + 0.01);
  const loc = project.location;
  if (!loc) return floor;
  return Math.max(
    floor,
    shadowFreePitchM(loc.latLng.lat, loc.latLng.lng, pose.tiltDeg, h, pose.azimuthDeg),
  );
}

/** Panel footprint in metres for the given orientation (w across, h along). */
export function panelFootprintM(
  spec: PanelSpec,
  orientation: PanelOrientation,
): { w: number; h: number } {
  return panelFootprint(spec, orientation);
}

/**
 * THE plan-view cell of one module in the roof-grid frame (§A0 frame parity).
 * `ax` is the extent along local x — which `roofGridAngle` points DOWN-SLOPE on
 * a pitched roof — and `ay` the extent across it.
 *
 * Which module axis runs down-slope is not a free choice: `panelPose` puts the
 * module's `h` (portrait ⇒ LENGTH) along the plate's local z, and after
 * `yaw = -slopeAzimuth` that axis runs straight down the slope. That is also
 * the physical convention — a portrait module's long axis runs UP the slope,
 * because that is how rails and clamps are laid — and it is what the flat-roof
 * tilted case already does (`fillRowPitchM` solves the shadow-free row pitch
 * from `h`, i.e. treats `h` as the along-tilt dimension).
 *
 * This frame previously put `w` (portrait ⇒ WIDTH) down-slope and foreshortened
 * THAT, so every 2D consumer (fill, DRC, editor, DXF, SLD, auto-design) placed
 * and validated modules rotated 90° from the ones the 3D view rendered and the
 * Tier-2 shading engine cast shadows with. The 2D side was the one that
 * disagreed with both physics and the pose, so the 2D side moved: `h` is now
 * the down-slope (foreshortened) axis, `w` the across-slope one.
 *
 * Flat roofs are untouched: no slope axis exists, so the cell stays (w, h).
 */
export function planCellM(
  spec: PanelSpec,
  orientation: PanelOrientation,
  roof: Roof | undefined,
): { ax: number; ay: number } {
  const { w, h } = panelFootprint(spec, orientation);
  if (!roof || !isSloped(roof)) return { ax: w, ay: h };
  // a module lying ON the slope projects shorter in plan along the slope axis
  const cosP = Math.max(0.2, Math.cos((roof.pitchDeg * Math.PI) / 180));
  return { ax: h * cosP, ay: w };
}

/**
 * Grid-fill a roof with panels aligned to its dominant edge.
 * Every candidate slot must be fully inside the setback-inset polygon and
 * clear of all obstruction buffers + walkway strips.
 */
export function autoFillRoof(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  opts: FillOptions = DEFAULT_FILL,
  areaLimit?: XY[],
): PlacedPanel[] {
  const insetRegions = insetPolygonRobust(
    roof.polygon,
    roof.perEdgeSetbacksM ?? roof.polygon.map(() => roof.setbackM),
  );
  if (insetRegions.length === 0) return [];
  const insideInset = (corners: XY[]) =>
    insetRegions.some((reg) => corners.every((c) => pointInPolygon(c, reg)));
  // The lattice is ALWAYS anchored to the roof's own inset regions — never to
  // `areaLimit`. Anchoring at the drag-box's bbox min made the grid phase a
  // function of the box, so the drag-fill preview reflowed every candidate on
  // every pointer move ("fluctuating" panels) and the committed panels landed
  // on a lattice offset from the roof's own fill. areaLimit is purely an extra
  // FILTER below: a candidate must sit fully inside it. Consequences: the
  // preview is monotonic (growing the box only ADDS panels) and area-filled
  // panels coincide exactly with full-roof-fill positions.
  const regions = insetRegions;

  const pose = defaultPanelPose(roof);
  // on a slope, local x runs straight down the slope (module h on that axis,
  // foreshortened by cos(pitch) — see planCellM). On a FLAT roof with a tilted
  // pose the lattice is derived from the pose's azimuth, so rows run
  // perpendicular to the facing and the row pitch applies along it (the
  // geometry shadowFreePitchM solves for). See gridAngleFor.
  const angle = gridAngleFor(roof, pose);
  // w/h below are the PLAN CELL extents along local x / local y (not the raw
  // module w/h): on a pitched roof they are swapped and foreshortened.
  const { ax: w, ay: h } = planCellM(spec, opts.orientation, roof);
  const gap = opts.gapM;
  // obstructions + walkways + already-placed panels are all occupied space —
  // a new fill must never overlap any of them (collision-aware placement).
  // The DEFAULT is to avoid the project's OWN panels (§A0: never place into
  // occupied space) — the old default of [] silently ignored every existing
  // panel. Callers that measure raw capacity or replace the whole layout pass
  // an explicit `avoidPanels: []`.
  const allBlockers: Blocker[] = [
    ...obstructionBlockers(roof, project.obstructions, opts.bridgeClearanceM),
    ...walkwayBlockersFor(roof, project.walkways),
    ...panelBlockersFor(roof, spec, opts.avoidPanels ?? project.panels ?? []),
  ];
  // footprints of roofs stacked ABOVE this one (mumty, upper terrace) — panels
  // must never be placed underneath them
  const covered = higherOverlapFootprints(roof, project.roofs);
  // drawn keepouts block placement too (arbitrary polygons → polygon test)
  const koPolys = keepoutPolys(roof, project.keepouts ?? []);

  const rowGap = opts.grouped ? gap : gap + 0.4;
  // tilted rows on a flat roof advance by the shadow-free pitch (or the
  // expert override, which may deliberately be tighter); flush mounts keep
  // the plain footprint+gap step
  const tiltedPitch = fillRowPitchM(project, roof, spec, opts);
  const rowStep =
    tiltedPitch === null
      ? h + rowGap
      : opts.rowPitchM !== undefined
        ? tiltedPitch
        : Math.max(tiltedPitch, h + rowGap);
  const panels: PlacedPanel[] = [];
  // grid row index is shared across the roof's regions so cellIndex is unique
  let rowIdx = -1;
  // the setback can split a concave roof into several usable regions —
  // grid-fill each one in the shared roof-aligned frame
  for (const region of regions) {
    const localPoly = region.map((p) => rotate(p, -angle));
    const minX = Math.min(...localPoly.map((p) => p.x));
    const maxX = Math.max(...localPoly.map((p) => p.x));
    const minY = Math.min(...localPoly.map((p) => p.y));
    const maxY = Math.max(...localPoly.map((p) => p.y));

    // The first candidate of a region sits FLUSH against its min edge, so its
    // corners land exactly ON the boundary — where `pointInPolygon` is a
    // knife-edge and the ~1e-15 noise of the grid rotation decides the verdict
    // (measured: two mirror-image gable faces, one filled, one came back
    // empty). Start the grid 1 µm inside instead: physically nil, nine orders
    // above the noise, and strictly MORE conservative about the setback.
    for (let y = minY + h / 2 + GRID_EPS_M; y + h / 2 <= maxY + 0.01; y += rowStep) {
      let col = 0;
      let placedInRow = false;
      for (let x = minX + w / 2 + GRID_EPS_M; x + w / 2 <= maxX + 0.01; x += w + gap) {
        if (opts.maxPanels && panels.length >= opts.maxPanels) return panels;
        const localCorners = [
          { x: x - w / 2, y: y - h / 2 },
          { x: x + w / 2, y: y - h / 2 },
          { x: x + w / 2, y: y + h / 2 },
          { x: x - w / 2, y: y + h / 2 },
        ];
        const worldCorners = localCorners.map((c) => rotate(c, angle));
        // fully inside this region AND inside the setback inset
        if (!worldCorners.every((c) => pointInPolygon(c, region))) continue;
        if (!insideInset(worldCorners)) continue;
        // area-limited fill (drag-box): candidate filter ONLY — the lattice
        // itself stays anchored to the roof frame above
        if (areaLimit && !worldCorners.every((c) => pointInPolygon(c, areaLimit)))
          continue;
        if (allBlockers.some((b) => rectsOverlap(worldCorners, b.corners)))
          continue;
        if (covered.some((poly) => rectIntersectsPolygon(worldCorners, poly)))
          continue;
        if (koPolys.some((poly) => rectIntersectsPolygon(worldCorners, poly)))
          continue;
        if (!placedInRow) {
          rowIdx++;
          placedInRow = true;
        }
        const centerWorld = rotate({ x, y }, angle);
        panels.push({
          id: genId('pv'),
          roofId: roof.id,
          center: centerWorld,
          orientation: opts.orientation,
          ...pose,
          solarAccess: 1,
          enabled: true,
          cellIndex: rowIdx * COL_STRIDE + col,
        });
        col++;
      }
    }
  }
  return panels;
}

export interface FilledSegment {
  segment: ArraySegment;
  panels: PlacedPanel[];
}

/**
 * Fill a roof (or a sub-area) and wrap the result as an ArraySegment, linking
 * every panel back via segmentId. Panels remain the materialised source of
 * truth; the segment carries the shared parameters + a holes list. The label is
 * left blank for the caller to assign (see nextSegmentLabel).
 */
export function fillRoofAsSegment(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  opts: FillOptions = DEFAULT_FILL,
  areaLimit?: XY[],
): FilledSegment | null {
  // the fill's OWN under-structure clearance (defaults chain) drives §26c
  // bridging: a walk-under default lets the fill span bridgeable obstructions.
  // Tile is flush like metal shed (defaultPanelPose) — no elevated structure.
  const elevatedPose =
    !isSloped(roof) && roof.roofType !== 'metal_shed' && roof.roofType !== 'tile';
  const fillOpts: FillOptions =
    opts.bridgeClearanceM !== undefined || !elevatedPose
      ? opts
      : {
          ...opts,
          bridgeClearanceM: Math.max(
            0.3,
            roof.structureOverride?.clearanceM ?? project.structureDefaults?.clearanceM ?? 0,
          ),
        };
  const panels = autoFillRoof(project, roof, spec, fillOpts, areaLimit);
  if (panels.length === 0) return null;
  const segId = genId('seg');
  const pose = defaultPanelPose(roof);
  // flush ⇔ the pose has no structure under it — must stay in lockstep with
  // defaultPanelPose (a flat TILE deck is flush too: hooks, not tilt legs)
  const flush =
    isSloped(roof) || roof.roofType === 'metal_shed' || roof.roofType === 'tile';
  const racking: RackingSpec = flush
    ? { kind: 'flush' }
    : {
        kind: 'fixed_tilt',
        tiltDeg: pose.tiltDeg,
        // the pitch the fill ACTUALLY used — drives the row-shading derate
        // (a 0 here would mean "pitch unknown", which skips the derate)
        rowPitchM:
          Math.round((fillRowPitchM(project, roof, spec, opts) ?? 0) * 1000) / 1000,
        frontLegM: 0.3,
        // back leg = front + module rise — a flat 0.3 here understated every
        // fill-created structure until the tilt slider was touched
        backLegM:
          Math.round(
            (0.3 +
              (panelFootprintM(spec, opts.orientation).h *
                Math.sin((pose.tiltDeg * Math.PI) / 180))) *
              1000,
          ) / 1000,
        profile: DEFAULT_PROFILE,
      };
  for (const p of panels) p.segmentId = segId;
  const rows =
    Math.max(...panels.map((p) => Math.floor((p.cellIndex ?? 0) / COL_STRIDE))) + 1;
  const cols =
    Math.max(...panels.map((p) => (p.cellIndex ?? 0) % COL_STRIDE)) + 1;
  const segment: ArraySegment = {
    id: segId,
    roofId: roof.id,
    label: '',
    polygon: areaLimit ?? roof.polygon,
    rows,
    cols,
    orientation: opts.orientation,
    azimuthDeg: pose.azimuthDeg,
    racking,
    moduleGapM: opts.gapM,
    removed: [],
  };
  return { segment, panels };
}

/** Next auto label ('A1','A2'…) given the existing segments. */
export function nextSegmentLabel(segments: ArraySegment[]): string {
  return `A${segments.length + 1}`;
}


/** Corners of a placed panel in world meters (for rendering + overlap tests). */
export function placedPanelCorners(
  panel: PlacedPanel,
  spec: PanelSpec,
  roofAngle: number,
): XY[] {
  const { w, h } = panelFootprint(spec, panel.orientation);
  const local = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  return local.map((c) => add(rotate(c, roofAngle), panel.center));
}

/**
 * THE canonical plan-view footprint of a placed panel — the ONE frame shared
 * by placement, DRC, editors, drawings and dependency checks. Uses the same
 * geometry the fill used to position the panel: rows aligned to
 * `roofGridAngle` (down-slope on pitched roofs, dominant edge on flat), with
 * the down-slope local-x extent plan-foreshortened by cos(pitch) — a panel
 * lying ON a slope projects shorter in plan. Before this existed, DRC/render/
 * SLD rebuilt footprints with the flat dominant-edge angle and NO
 * foreshortening, so any pitched roof produced false overlaps and setback
 * verdicts that disagreed with what placement had validated.
 */
export function panelCornersOnRoof(
  panel: PlacedPanel,
  spec: PanelSpec,
  roof: Roof | undefined,
): XY[] {
  if (!roof) return placedPanelCorners(panel, spec, 0);
  // FLAT roof + TILTED module: the footprint is the plan projection of the
  // tilted plate, facing the panel's OWN azimuth — exactly what panel-pose.ts
  // renders (yaw = -azimuthDeg·π/180 about three's +Y, then rotateX(-tilt)
  // about the plate's local x). Three yaw a maps to a plan rotation of a
  // (z = -planY), so plan rotation = -azimuthDeg; the tilt is about the
  // plate's local x (its `w` axis), so only the `h` extent foreshortens to
  // h·cos(tilt). Before this branch, rotating or tilting a flat-roof panel
  // changed the 3D plate but NOT the 2D footprint — the S1 class of defect.
  // tiltDeg == 0 keeps the grid-aligned w × h (footprint alignment governs,
  // matching pose's yaw = roofGridAngle for untilted flat panels). Sloped
  // roofs are flush — pose comes from the roof — and are untouched below.
  if (!isSloped(roof) && panel.tiltDeg > 0) {
    const { w, h } = panelFootprintM(spec, panel.orientation);
    const cosT = Math.cos((panel.tiltDeg * Math.PI) / 180);
    return rectCorners(panel.center, w, h * cosT, -panel.azimuthDeg);
  }
  const angle = roofGridAngle(roof);
  const { ax, ay } = planCellM(spec, panel.orientation, roof);
  const local = [
    { x: -ax / 2, y: -ay / 2 },
    { x: ax / 2, y: -ay / 2 },
    { x: ax / 2, y: ay / 2 },
    { x: -ax / 2, y: ay / 2 },
  ];
  return local.map((c) => add(rotate(c, angle), panel.center));
}

/**
 * Snap a panel centre to the roof grid so hand-placed panels line up (AutoCAD
 * feel). The grid is anchored to an existing panel on the roof when there is one
 * (so new panels align to the current layout), else to the setback-inset corner.
 */
export function snapPanelCenter(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  center: XY,
  orientation: PanelOrientation,
): XY {
  const existingOnRoof = project.panels.filter((p) => p.roofId === roof.id);
  // the grid frame follows the pose the snapped panel will get: the current
  // layout's pose when panels exist (align to them), else the roof default —
  // the same frame autoFillRoof lays its lattice in (gridAngleFor)
  const poseSrc = existingOnRoof[0] ?? defaultPanelPose(roof);
  const angle = gridAngleFor(roof, {
    tiltDeg: poseSrc.tiltDeg,
    azimuthDeg: poseSrc.azimuthDeg,
  });
  // same plan cell the fill stepped by, so hand-placed panels land on its grid
  const { ax, ay } = planCellM(spec, orientation, roof);
  const pitchX = ax + DEFAULT_FILL.gapM;
  const pitchY = ay + DEFAULT_FILL.gapM;

  const existing = existingOnRoof;
  let anchor: XY;
  if (existing.length > 0) {
    anchor = rotate(existing[0].center, -angle); // align to the current layout
  } else {
    const inset = insetPolygonRobust(
      roof.polygon,
      roof.perEdgeSetbacksM ?? roof.polygon.map(() => roof.setbackM),
    )[0] ?? roof.polygon;
    const local = inset.map((p) => rotate(p, -angle));
    anchor = {
      x: Math.min(...local.map((p) => p.x)) + ax / 2,
      y: Math.min(...local.map((p) => p.y)) + ay / 2,
    };
  }
  const local = rotate(center, -angle);
  const sx = anchor.x + Math.round((local.x - anchor.x) / pitchX) * pitchX;
  const sy = anchor.y + Math.round((local.y - anchor.y) / pitchY) * pitchY;
  return rotate({ x: sx, y: sy }, angle);
}

/**
 * True when a single panel at `center` (aligned to the roof grid) fits: inside
 * the setback inset AND clear of obstructions, walkways, keepouts, roofs stacked
 * above, and every already-placed panel. Powers smart single-panel placement.
 */
export function panelFitsAt(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  center: XY,
  orientation: PanelOrientation,
  bridgeClearanceM?: number,
  pose?: { tiltDeg: number; azimuthDeg: number },
): boolean {
  const insetRegions = insetPolygonRobust(
    roof.polygon,
    roof.perEdgeSetbacksM ?? roof.polygon.map(() => roof.setbackM),
  );
  if (insetRegions.length === 0) return false;
  // the candidate carries the pose the placement will ACTUALLY assign (caller
  // override for segment ops / moves; roof default for hand placement), so
  // fits, fill and DRC all judge the same panelCornersOnRoof footprint. The
  // old cand hardcoded azimuth 0 / tilt 0 — a grid-aligned cell that was not
  // the plate DRC would later measure.
  const candPose = pose ?? defaultPanelPose(roof);
  const cand: PlacedPanel = {
    id: '',
    roofId: roof.id,
    center,
    orientation,
    azimuthDeg: candPose.azimuthDeg,
    tiltDeg: candPose.tiltDeg,
    solarAccess: 1,
    enabled: true,
  };
  const corners = panelCornersOnRoof(cand, spec, roof);
  if (!insetRegions.some((reg) => corners.every((c) => pointInPolygon(c, reg)))) return false;
  const blockers = [
    ...obstructionBlockers(roof, project.obstructions, bridgeClearanceM),
    ...walkwayBlockersFor(roof, project.walkways),
    ...panelBlockersFor(roof, spec, project.panels),
  ];
  if (blockers.some((b) => rectsOverlap(corners, b.corners))) return false;
  if (keepoutPolys(roof, project.keepouts ?? []).some((poly) => rectIntersectsPolygon(corners, poly)))
    return false;
  if (higherOverlapFootprints(roof, project.roofs).some((poly) => rectIntersectsPolygon(corners, poly)))
    return false;
  return true;
}

/** Max panels that fit ⇒ suggested capacity (the "Auto" button). */
export function estimateMaxCapacityKwp(
  project: Project,
  spec: PanelSpec,
): { panels: number; kwp: number } {
  let count = 0;
  for (const roof of project.roofs) {
    // Must fill through the SAME door the real fill uses. Calling autoFillRoof
    // directly skipped fillRoofAsSegment's bridging-clearance derivation, so a
    // walk-under array that legitimately spans a tank fitted MORE panels than
    // this "maximum" allowed — the UI then read "141.5 / 139.7 kWp", an
    // installed system larger than the roof's stated capacity.
    // avoidPanels: [] — this measures the roof's RAW capacity; panels already
    // placed must not subtract from the theoretical maximum.
    count +=
      fillRoofAsSegment(project, roof, spec, { ...DEFAULT_FILL, avoidPanels: [] })
        ?.panels.length ?? 0;
  }
  // round UP to 0.1 kWp: guarantees floor(kwp·1000/watt) === count, so the
  // budgets in auto-design/comparison reproduce this measured max exactly
  return { panels: count, kwp: Math.ceil((count * spec.watt) / 100) / 10 };
}
