// ─── Step 2: Roof editor — CAD-style tracing, vertex & edge editing ─────────
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Building2,
  Copy,
  Factory,
  Trees,
  Home,
  Info,
  Layers,
  Lock,
  LockOpen,
  MousePointer2,
  Move,
  MoveVertical,
  PencilRuler,
  PenLine,
  Pyramid,
  Redo2,
  RotateCw,
  Ruler,
  RulerDimensionLine,
  Sparkles,
  Trash2,
  Triangle,
  TriangleAlert,
  Undo2,
  X,
} from 'lucide-react';
import { useActiveProject, useProjectPatch, useStore } from '../store/store';
import {
  SatCanvas,
  polyPath,
  useCanvasFrame,
  type CanvasFrame,
} from '../components/SatCanvas';
import { EdgeLabels } from '../components/EdgeLabels';
import { MeasureOverlay, useMeasure } from '../components/MeasureTool';
import { RadialMenu, type RadialGroup } from '../components/RadialMenu';
import { applyKnownDistance } from '../lib/calibration';
import {
  Dialog,
  OptionCard,
  Seg,
  Sheet,
  SliderRow,
  ToggleRow,
  UnitToggle,
} from '../components/ui';
import type { Project, Roof, XY } from '../types';
import {
  dist,
  dominantEdgeAngle,
  genId,
  insetPolygonRobust,
  isCCW,
  pointInPolygon,
  pointSegDist,
  polygonArea,
  polygonCentroid,
  validateRoofPolygon,
} from '../lib/geo';
import { typedInto } from '../lib/keyboard';
import { frameFor, toEN } from '../lib/site/frame';
import { defaultPanelPose, panelCornersOnRoof } from '../lib/layout';
import { cascadeDeleteRoof } from '../lib/cascade';
import { gableFaces } from '../lib/roof-gable';
import { hipFaces } from '../lib/roof-hip';
import { skeletonFaces } from '../lib/roof-skeleton';
import { applyFaceGroupPatch } from '../lib/roof-face-group';
import {
  MIN_ROOF_AREA_M2,
  MIN_ROOF_EDGE_M,
  makeRoof,
  sanitizeRoofPolygon,
  groundSurfaceFrom,
} from '../lib/roof-factory';
import { useSurroundGrid } from '../lib/use-surround-grid';
import { roofMapFit, roofsWithMapFit, TRUSTED_RMSE_M } from '../lib/roof-map-fit';
import { ROOF_HEIGHT_TOLERANCE_M } from '../lib/surround-check';
import { lightenHex, roofColor, roofRgba } from '../lib/roof-colors';
import { effectiveParapetEdges, pickRoofAt } from '../lib/roof-topology';
import { useUnits } from '../store/useUnits';
import { Scene3D } from '../three/Scene3D';

type SheetKind = null | 'roofType' | 'height';
type VertexRef = { roofId: string; i: number };
type EdgeEdit = { roofId: string; i: number; text: string };
type HintMsg = { text: string; lock?: boolean };
/**
 * Alignment guide ray shown while drafting (meters-space anchor + angle).
 *
 * `locked` separates SEEING square from BEING square. A guide is drawn
 * whenever the cursor is near an alignment — that is pure information, and it
 * costs the user nothing. Only a `locked` guide has actually moved the point
 * onto the ray, and that happens solely when the user asked for it (ortho
 * mode, or Shift held). Drawing them identically would be a lie: the user
 * could not tell a hint from a hard constraint.
 */
type SnapGuide = { anchor: XY; deg: number; locked: boolean };
type DependencyIssues = {
  panels: string[];
  obstructions: string[];
  walkways: string[];
  rails: string[];
  arresters: string[];
  inverters: string[];
};
type PendingGeometryChange = {
  roofId: string;
  polygon: XY[];
  /** extra roof fields to apply with the polygon (pre-spliced per-edge arrays) */
  roofPatch?: Partial<Roof>;
  issues: DependencyIssues;
  useExistingUndoSnapshot: boolean;
};

// canonical roof invariants live in lib/roof-factory (shared with AI import)

const COMPASS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** 0=N clockwise azimuth → 8-point compass label. */
function compass8(azDeg: number): string {
  return COMPASS_8[Math.round((((azDeg % 360) + 360) % 360) / 45) % 8];
}

export function Step2Roof() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  // the aerial height map: a traced roof takes its height, pitch and facing from it
  const surroundGrid = useSurroundGrid(project.surround);
  const { state, dispatch } = useStore();
  const loc = project.location!;

  /** null = select tool; array = draw tool with points so far */
  const [draft, setDraft] = useState<XY[] | null>(null);
  const [hover, setHover] = useState<XY | null>(null);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [askClose, setAskClose] = useState(false);
  const [selectedId, setSelectedIdRaw] = useState<string | null>(
    project.roofs[0]?.id ?? null,
  );
  const [selectedVertex, setSelectedVertex] = useState<VertexRef | null>(null);
  const [dragVertex, setDragVertex] = useState<VertexRef | null>(null);
  /** roofs whose Google pitch/azimuth suggestion the user applied or dismissed */
  const [hintDoneRoofs, setHintDoneRoofs] = useState<Record<string, boolean>>({});
  const [dragBody, setDragBody] = useState<{ roofId: string } | null>(null);
  const dragBodyDownRef = useRef<XY | null>(null);
  const [dragRotate, setDragRotate] = useState<{ roofId: string } | null>(null);
  const dragRotateRef = useRef<{ c: XY; startDeg: number; startAz: number } | null>(null);
  const dragMovedRef = useRef(false);
  const [edgeEdit, setEdgeEdit] = useState<EdgeEdit | null>(null);
  const [lockedIds, setLockedIds] = useState<ReadonlySet<string>>(new Set());
  const [sheet, setSheet] = useState<SheetKind>(null);
  // ridge orientation for gable/hip conversion: along the long wall (default,
  // how pitched roofs are usually built) or across it
  const [ridgeMode, setRidgeMode] = useState<'length' | 'width'>('length');
  const [show3D, setShow3D] = useState(false);
  const { units, setUnits, fmtLen, fmtArea, lenValue } = useUnits();
  const [ortho, setOrtho] = useState(false);
  const [hint, setHint] = useState<HintMsg | null>(null);
  const hintTimer = useRef<number | undefined>(undefined);
  const [canvasPxPerM, setCanvasPxPerM] = useState(20);
  const [pendingGeometryChange, setPendingGeometryChange] =
    useState<PendingGeometryChange | null>(null);
  /*
   * Edge lengths are ON by default.
   *
   * They used to appear only on the SELECTED roof, so the dimensions a user had
   * just traced vanished the moment they clicked away — the one moment they
   * want to read them back and check the trace against a tape measure. A roof
   * outline without its lengths is a drawing of a shape; with them it is a
   * measured drawing, which is what the rest of this app treats it as.
   *
   * The Dims toggle stays, for turning them off on a crowded site. It does not
   * need to be there to turn them ON: `EdgeLabels` already drops any edge
   * shorter than 30 screen px, so a zoomed-out site sheds its own clutter.
   */
  const [showMeasurements, setShowMeasurements] = useState(true);
  // two-click measure + known-distance site calibration
  const measure = useMeasure();
  const [calibrateOpen, setCalibrateOpen] = useState(false);

  const dragStartPolygonRef = useRef<XY[] | null>(null);
  const dragOffsetRef = useRef<XY>({ x: 0, y: 0 });

  const selected = project.roofs.find((r) => r.id === selectedId) ?? null;

  // Google Solar detected pitch/azimuth for the plane nearest the selected roof.
  // Non-destructive: surfaced as a dismissible suggestion, never auto-applied —
  // the manual pipeline stays authoritative.
  const roofHint = useMemo(() => {
    if (!selected || hintDoneRoofs[selected.id]) return null;
    const segs = loc.solarInsights?.roofSegments;
    if (!segs?.length) return null;
    const frame = frameFor(project);
    if (!frame) return null;
    const c = polygonCentroid(selected.polygon);
    let best: (typeof segs)[number] | null = null;
    let bestD = Infinity;
    for (const s of segs) {
      if (!s.center) continue;
      const sc = toEN(frame, s.center);
      const d = Math.hypot(sc.x - c.x, sc.y - c.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    if (!best || bestD > 20) return null; // no plausible match near this roof
    // nothing to suggest if it already matches what the user set
    const samePitch = Math.abs(best.pitchDeg - selected.pitchDeg) <= 1;
    const sameAz = best.pitchDeg <= 1 ||
      Math.abs(((best.azimuthDeg - selected.slopeAzimuthDeg + 540) % 360) - 180) <= 8;
    if (samePitch && sameAz) return null;
    return best;
  }, [selected, hintDoneRoofs, loc.solarInsights, loc.latLng, project]);

  const canUndo = state.undoStack.length > 0;
  const canRedo = state.redoStack.length > 0;
  const undoDisabled = draft ? draft.length === 0 : !canUndo;
  const redoDisabled = draft ? true : !canRedo;

  useEffect(() => () => window.clearTimeout(hintTimer.current), []);

  /** A short notice; `ms` for one the user must have time to read (an outcome, an instruction). */
  function showHint(text: string, lock = false, ms = 2400) {
    window.clearTimeout(hintTimer.current);
    setHint({ text, lock });
    hintTimer.current = window.setTimeout(() => setHint(null), ms);
  }

  function selectRoof(id: string | null) {
    setSelectedIdRaw(id);
    setSelectedVertex(null);
    setEdgeEdit(null);
  }

  function startDraw() {
    setDraft([]);
    setHover(null);
    selectRoof(null);
  }

  function cancelDraw() {
    setDraft(null);
    setHover(null);
    setSnapGuides([]);
    setAskClose(false);
  }

  function normalisedPolygon(points: XY[]): XY[] | null {
    // the canonical gate (shared with AI import) — UI adds only the hint
    const result = sanitizeRoofPolygon(points);
    if (!result.ok) {
      showHint(result.reason, true);
      return null;
    }
    return result.polygon;
  }

  function updateRoof(id: string, p: Partial<Roof>, undoable = true, silent = false) {
    const polygon = p.polygon
      ? (() => {
          const next = isCCW(p.polygon) ? p.polygon : [...p.polygon].reverse();
          const validation = validateRoofPolygon(next, {
            minEdgeM: MIN_ROOF_EDGE_M,
            minAreaM2: MIN_ROOF_AREA_M2,
          });
          if (!validation.valid) {
            if (!silent) showHint(validation.reason ?? 'That roof shape is not valid.', true);
            return null;
          }
          return next;
        })()
      : undefined;
    if (p.polygon && !polygon) return false;
    // Sibling faces of one pitched roof share their eave height (and pitch) —
    // applyFaceGroupPatch lands those on the whole faceGroup so a per-face edit
    // can't leave a step at the ridge. Ungrouped roofs (every stored project)
    // take the plain per-roof path.
    const spread = applyFaceGroupPatch(project.roofs, id, p);
    patch(
      {
        roofs: spread.roofs.map((r) => {
          if (r.id !== id) return r;
          const merged: Roof = { ...r };
          if (polygon) {
            merged.polygon = polygon;
            // per-edge arrays must track the vertex count; callers that change
            // the count pass pre-spliced arrays, anything else falls back to
            // uniform (null) rather than silently misaligning edges
            const n = polygon.length;
            if (merged.perEdgeSetbacksM && merged.perEdgeSetbacksM.length !== n) {
              merged.perEdgeSetbacksM = null;
            }
            if (merged.parapet.perEdge && merged.parapet.perEdge.length !== n) {
              merged.parapet = { ...merged.parapet, perEdge: null };
            }
          }
          return merged;
        }),
      },
      undoable,
    );
    return true;
  }

  /**
   * Patch a roof's mounting-relevant fields (type or slope) AND remap its
   * panels to the resulting mounting pose in one undo step — so tilt/azimuth
   * stay consistent with the surface the panels sit on.
   */
  function patchRoofAndPose(id: string, roofPatch: Partial<Roof>) {
    const roof = project.roofs.find((r) => r.id === id);
    if (!roof) return;
    // A pitch change is a change to the ROOF, not to one face of it: it lands on
    // every sibling in the faceGroup (see roof-face-group) so the ridge stays
    // level. Azimuth stays per-face. Panels on EVERY face that moved get repoged
    // in the same undo step, so tilt never drifts from the surface underneath.
    const spread = applyFaceGroupPatch(project.roofs, id, roofPatch);
    const poseById = new Map(
      spread.changedIds.map((rid) => {
        const next = spread.roofs.find((r) => r.id === rid)!;
        return [rid, defaultPanelPose(next)];
      }),
    );
    patch(
      {
        roofs: spread.roofs,
        panels: project.panels.map((p) => {
          const pose = p.roofId ? poseById.get(p.roofId) : undefined;
          return pose ? { ...p, ...pose } : p;
        }),
      },
      true,
    );
  }

  function setRoofType(id: string, roofType: Roof['roofType']) {
    const roof = project.roofs.find((r) => r.id === id);
    if (!roof || roof.roofType === roofType) return;
    if (roofType === 'ground') {
      // Ground is a SURFACE change, not a cladding change: it drops to grade,
      // loses its parapet (a boundary is not a parapet) and takes the wider
      // boundary setback. Renamed too — "Roof 2" at height 0 would read as a
      // bug. Panel poses follow via patchRoofAndPose (ground tilt ≠ 10°).
      // Built by the same factory as a drawn array area, so the two cannot
      // differ — and the height's provenance is dropped WITH the height: this
      // used to leave a DSM-fitted roof stamped 'aerial_map' at 0.0 m, so the
      // pick card asserted a measured eave on open ground. The spread below
      // cannot delete a key, so the drop is explicit.
      const g = groundSurfaceFrom(roof, project.roofs.filter((r) => r.id !== id));
      patchRoofAndPose(id, { ...g, heightSource: undefined });
      return;
    }
    patchRoofAndPose(id, { roofType });
  }

  /**
   * Replace a flat footprint with two pitched gable faces sharing a ridge
   * (Phase 21). The faces are ordinary adjacent Roofs, so the rest of the app
   * treats them as it always has. The original roof's panels/obstructions
   * cascade away (the flat layout no longer applies to a pitched surface); the
   * user fills each face fresh in Step 6.
   */
  /**
   * Pitch to build converted faces at. Every conversion used to fall through to
   * the builders' 20° default, so a footprint Google had already measured at 34°
   * silently became a 20° roof — wrong tilt, wrong yield, wrong quote. Prefer the
   * detected pitch, then whatever pitch the roof already carries, and only then
   * let the builder default.
   */
  function conversionPitchDeg(roof: Roof): number | undefined {
    const detected =
      roofHint && selected?.id === roof.id && roofHint.pitchDeg > 1 ? roofHint.pitchDeg : null;
    const own = roof.pitchDeg >= 1 ? roof.pitchDeg : null;
    const pick = detected ?? own;
    // the builders reject <1 or >60; out-of-range detections fall back to default
    return pick != null && pick <= 60 ? pick : undefined;
  }

  /**
   * Stamp faces built from ONE footprint with a shared faceGroupId, so later
   * pitch/eave-height edits move the whole roof instead of one face (which used
   * to leave an unbuildable step at the ridge). Additive: only faces created
   * here get the field; nothing stored is touched.
   */
  function linkFaces(faces: readonly Roof[]): Roof[] {
    const faceGroupId = genId('facegrp');
    return faces.map((f) => ({ ...f, faceGroupId }));
  }

  function convertToGable(roof: Roof, ridgeAngleDeg?: number) {
    const g = gableFaces({
      footprint: roof.polygon,
      existing: project.roofs.filter((r) => r.id !== roof.id),
      ridgeAngleDeg,
      pitchDeg: conversionPitchDeg(roof),
      eaveHeightM: roof.heightM,
      // A gable changes the SHAPE, not the cladding: a tile roof stays tile, a
      // metal shed stays a metal shed. Without this the faces reverted to the
      // 'rcc_flat' default and the BOM silently re-priced the whole mounting
      // system (clamps → hooks) on a conversion the user made for geometry.
      roofType: roof.roofType,
      namePrefix: roof.name,
    });
    if (!g.ok) return; // the card is disabled in this case; belt-and-braces
    // cascade removes the original roof AND its dependents (panels, segments,
    // on-roof obstructions, …) in one shot — no orphans — then the two faces
    // appear: the visual result IS the confirmation (§H).
    const cascade = cascadeDeleteRoof(project, roof.id);
    patch({ ...cascade, roofs: [...(cascade.roofs ?? []), ...linkFaces(g.faces)] }, true);
    setSheet(null);
    setSelectedIdRaw(g.faces[0].id);
  }

  /**
   * Replace a rectangular footprint with four pitched hip faces (two
   * trapezoids + two triangles) meeting at a central ridge — a pyramid when
   * square (Phase 21b). Same additive model as the gable: ordinary adjacent
   * Roofs, dependents cascade away, one undoable patch.
   */
  function convertToHip(roof: Roof, ridgeAngleDeg?: number) {
    const others = project.roofs.filter((r) => r.id !== roof.id);
    // rectangles keep the tidy OBB hip (+ ridge orientation); any other convex
    // footprint falls back to the straight-skeleton (one sloped face per wall)
    const pitchDeg = conversionPitchDeg(roof);
    const h = hipFaces({
      footprint: roof.polygon,
      existing: others,
      ridgeAngleDeg,
      pitchDeg,
      eaveHeightM: roof.heightM,
      roofType: roof.roofType, // shape change, not a re-cladding (see convertToGable)
      namePrefix: roof.name,
    });
    const g = h.ok
      ? h
      : skeletonFaces({
          footprint: roof.polygon,
          existing: others,
          pitchDeg,
          eaveHeightM: roof.heightM,
          roofType: roof.roofType,
          namePrefix: roof.name,
        });
    if (!g.ok) return; // the card is disabled in this case; belt-and-braces
    const cascade = cascadeDeleteRoof(project, roof.id);
    patch({ ...cascade, roofs: [...(cascade.roofs ?? []), ...linkFaces(g.faces)] }, true);
    setSheet(null);
    setSelectedIdRaw(g.faces[0].id);
  }

  function dependencyIssues(roof: Roof, polygon: XY[]): DependencyIssues {
    const nextRoof = {
      ...roof,
      polygon,
      perEdgeSetbacksM:
        roof.perEdgeSetbacksM?.length === polygon.length ? roof.perEdgeSetbacksM : null,
    };
    const insetRegions = insetPolygonRobust(
      polygon,
      nextRoof.perEdgeSetbacksM ?? polygon.map(() => nextRoof.setbackM),
    );
    const inUsableArea = (points: XY[]) =>
      insetRegions.some((region) => points.every((point) => pointInPolygon(point, region)));
    const inRoof = (point: XY) => pointInPolygon(point, polygon);
    const panel = project.components.panel;
    return {
      panels: panel
        ? project.panels
            .filter((p) => p.roofId === roof.id)
            // canonical frame against the RESHAPED roof — same footprint the
            // fill validated, so the dependency review can't cry wolf
            .filter((p) => !inUsableArea(panelCornersOnRoof(p, panel, nextRoof)))
            .map((p) => p.id)
        : [],
      obstructions: project.obstructions
        .filter((o) => o.roofId === roof.id && !inRoof(o.center))
        .map((o) => o.id),
      walkways: project.walkways
        .filter((w) => w.roofId === roof.id && (!inUsableArea([w.a]) || !inUsableArea([w.b])))
        .map((w) => w.id),
      rails: project.rails
        .filter((r) => r.roofId === roof.id && (!inRoof(r.a) || !inRoof(r.b)))
        .map((r) => r.id),
      arresters: project.arresters
        .filter((a) => a.roofId === roof.id && !inRoof(a.pos))
        .map((a) => a.id),
      inverters: project.inverterPlacements
        .filter((i) => i.roofId === roof.id && i.edgeIndex >= polygon.length)
        .map((i) => i.id),
    };
  }

  function hasDependencyIssues(issues: DependencyIssues) {
    return Object.values(issues).some((items) => items.length > 0);
  }

  function requestGeometryChange(
    roofId: string,
    points: XY[],
    useExistingUndoSnapshot = false,
    roofPatch?: Partial<Roof>,
  ) {
    const roof = project.roofs.find((r) => r.id === roofId);
    const polygon = normalisedPolygon(points);
    if (!roof || !polygon) return false;
    const issues = dependencyIssues(roof, polygon);
    if (hasDependencyIssues(issues)) {
      setPendingGeometryChange({ roofId, polygon, roofPatch, issues, useExistingUndoSnapshot });
      return false;
    }
    return updateRoof(roofId, { ...roofPatch, polygon }, !useExistingUndoSnapshot);
  }

  function applyPendingGeometryChange(removeInvalidItems: boolean) {
    const pending = pendingGeometryChange;
    if (!pending) return;
    const roof = project.roofs.find((r) => r.id === pending.roofId);
    if (!roof) return;
    const patchData: Partial<typeof project> = {
      roofs: project.roofs.map((r) =>
        r.id === roof.id
          ? (() => {
              const merged: Roof = { ...r, ...pending.roofPatch, polygon: pending.polygon };
              const n = pending.polygon.length;
              if (merged.perEdgeSetbacksM && merged.perEdgeSetbacksM.length !== n) {
                merged.perEdgeSetbacksM = null;
              }
              if (merged.parapet.perEdge && merged.parapet.perEdge.length !== n) {
                merged.parapet = { ...merged.parapet, perEdge: null };
              }
              return merged;
            })()
          : r,
      ),
    };
    if (removeInvalidItems) {
      patchData.panels = project.panels.filter((p) => !pending.issues.panels.includes(p.id));
      patchData.obstructions = project.obstructions.filter(
        (o) => !pending.issues.obstructions.includes(o.id),
      );
      patchData.walkways = project.walkways.filter((w) => !pending.issues.walkways.includes(w.id));
      patchData.rails = project.rails.filter((r) => !pending.issues.rails.includes(r.id));
      patchData.arresters = project.arresters.filter(
        (a) => !pending.issues.arresters.includes(a.id),
      );
      patchData.inverterPlacements = project.inverterPlacements.filter(
        (i) => !pending.issues.inverters.includes(i.id),
      );
    }
    patch(patchData, !pending.useExistingUndoSnapshot);
    setPendingGeometryChange(null);
  }

  /**
   * Object snap to OTHER roofs' vertices and edges — lets adjacent terraces
   * share a wall line exactly (shared-parapet detection needs coincidence).
   * Vertex snap beats edge snap; returns the raw point when nothing is close.
   */
  function snapToRoofs(raw: XY, excludeId: string | null): XY {
    const tol = Math.min(0.5, 10 / canvasPxPerM);
    let bestVertex: { p: XY; d: number } | null = null;
    let bestEdge: { p: XY; d: number } | null = null;
    for (const r of project.roofs) {
      if (r.id === excludeId) continue;
      const n = r.polygon.length;
      for (let i = 0; i < n; i++) {
        const v = r.polygon[i];
        const dv = Math.hypot(raw.x - v.x, raw.y - v.y);
        if (dv <= tol && (!bestVertex || dv < bestVertex.d)) {
          bestVertex = { p: { ...v }, d: dv };
        }
        const b = r.polygon[(i + 1) % n];
        const { d, t } = pointSegDist(raw, v, b);
        if (d <= tol && (!bestEdge || d < bestEdge.d)) {
          bestEdge = { p: { x: v.x + (b.x - v.x) * t, y: v.y + (b.y - v.y) * t }, d };
        }
      }
    }
    return bestVertex?.p ?? bestEdge?.p ?? raw;
  }

  /**
   * CAD-style draft snapping: angles snap RELATIVE to the previous edge
   * (collinear / perpendicular), so guides follow the roof's own orientation
   * instead of the screen axes; the first segment falls back to world axes.
   * Also aligns with the first vertex's axes to help close clean rectangles.
   *
   * Two tolerances, deliberately. The WIDE one only DRAWS the ray; the NARROW
   * one is the only thing allowed to move the point, and only when the user
   * asked (ortho mode, or Shift held). Free drawing used to show nothing at
   * all, which left the user guessing where square was and made every hand
   * trace a few degrees off; a guide you can ignore costs nothing and is how
   * every mature tool does it. Keeping the hint band wider than the lock band
   * also means the ray appears BEFORE the cursor would jump, so a lock is
   * never a surprise.
   */
  function snapDraft(
    raw: XY,
    pts: XY[],
    temporarySnap = false,
  ): { p: XY; guides: SnapGuide[] } {
    // roof object-snap first: an exact shared point beats angle guides
    const objSnapped = snapToRoofs(raw, null);
    if (objSnapped !== raw) return { p: objSnapped, guides: [] };
    if (pts.length === 0) return { p: raw, guides: [] };
    /** may this call MOVE the point, or only draw rays? */
    const mayLock = ortho || temporarySnap;
    const HINT_DEG = 14;
    const LOCK_DEG = 7.5;
    const prev = pts[pts.length - 1];
    const guides: SnapGuide[] = [];
    let p = raw;
    const baseDeg =
      pts.length >= 2
        ? (Math.atan2(
            prev.y - pts[pts.length - 2].y,
            prev.x - pts[pts.length - 2].x,
          ) *
            180) /
          Math.PI
        : 0;
    const candDeg =
      (Math.atan2(raw.y - prev.y, raw.x - prev.x) * 180) / Math.PI;
    const len = Math.hypot(raw.x - prev.x, raw.y - prev.y);
    for (const rel of [0, 90, -90, 180]) {
      const target = baseDeg + rel;
      const delta = ((candDeg - target + 540) % 360) - 180;
      if (Math.abs(delta) < HINT_DEG) {
        const locked = mayLock && Math.abs(delta) < LOCK_DEG;
        if (locked) {
          const rad = (target * Math.PI) / 180;
          p = { x: prev.x + Math.cos(rad) * len, y: prev.y + Math.sin(rad) * len };
        }
        guides.push({ anchor: prev, deg: target, locked });
        break;
      }
    }
    if (pts.length >= 2) {
      const first = pts[0];
      const hintToleranceM = 14 / canvasPxPerM;
      const lockToleranceM = 8 / canvasPxPerM;
      const dx = Math.abs(p.x - first.x);
      const dy = Math.abs(p.y - first.y);
      if (dx < hintToleranceM) {
        const locked = mayLock && dx < lockToleranceM;
        if (locked) p = { ...p, x: first.x };
        guides.push({ anchor: first, deg: 90, locked });
      } else if (dy < hintToleranceM) {
        const locked = mayLock && dy < lockToleranceM;
        if (locked) p = { ...p, y: first.y };
        guides.push({ anchor: first, deg: 0, locked });
      }
    }
    return { p, guides };
  }

  function finishRoof(points: XY[]) {
    if (points.length < 3) return;
    const polygon = normalisedPolygon(points);
    if (!polygon) return;
    // a roof drawn fully inside another is a rooftop structure (mumty/stair
    // room): default it to sit ABOVE the parent so it stacks, not clashes
    const parent = project.roofs.find(
      (r) =>
        polygon.every((p) => pointInPolygon(p, r.polygon)) &&
        pointInPolygon(polygonCentroid(polygon), r.polygon),
    );
    // shared factory — identical defaults for hand-drawn and AI-imported roofs
    let roof: Roof = makeRoof({ polygon, existing: project.roofs, parent });
    // the aerial height map knows this roof: its height, pitch and facing are
    // MEASURED, not typed — the user can still change any of them
    const grid = surroundGrid;
    const fit = grid ? roofMapFit(grid, roof, project.calibration.northOffsetDeg) : null;
    if (fit) {
      roof = {
        ...roof,
        heightM: fit.heightM,
        heightSource: 'aerial_map',
        ...(fit.rmseM <= TRUSTED_RMSE_M
          ? { pitchDeg: fit.pitchDeg, ...(fit.slopeAzimuthDeg !== null ? { slopeAzimuthDeg: fit.slopeAzimuthDeg } : {}) }
          : {}),
      };
    }
    patch({ roofs: [...project.roofs, roof] }, true);
    cancelDraw();
    selectRoof(roof.id);
    if (fit) {
      showHint(
        `${roof.name}: ${roof.heightM.toFixed(1)} m${roof.pitchDeg ? ` · ${roof.pitchDeg}° facing ${Math.round(roof.slopeAzimuthDeg)}°` : ' · flat'} — measured from the aerial height map`,
      );
    } else if (parent) {
      showHint(`Placed on ${parent.name} — height set to ${roof.heightM.toFixed(1)} m`);
    }
  }

  function deleteRoof(id: string) {
    if (lockedIds.has(id)) {
      showHint('Roof is locked — unlock it to delete', true);
      return;
    }
    // cascade: panels/segments/obstructions/walkways/rails/arresters/inverters
    // on this roof go with it, and strings are pruned — no orphans (one undo step)
    patch(cascadeDeleteRoof(project, id), true);
    setLockedIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
    if (selectedId === id) selectRoof(null);
  }

  function toggleLock(id: string) {
    setLockedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
    if (selectedVertex?.roofId === id) setSelectedVertex(null);
    if (edgeEdit?.roofId === id) setEdgeEdit(null);
    if (dragVertex?.roofId === id) setDragVertex(null);
  }

  function deleteVertex(roofId: string, i: number) {
    const roof = project.roofs.find((r) => r.id === roofId);
    if (!roof) return;
    if (lockedIds.has(roofId)) {
      showHint('Roof is locked — unlock it to edit', true);
      return;
    }
    if (roof.polygon.length <= 3) {
      showHint('A roof needs at least 3 corners');
      return;
    }
    // removing vertex i merges edges (i-1) and (i); keep edge (i-1)'s values
    const dropEdge = <T,>(arr: T[] | null): T[] | null =>
      arr ? arr.filter((_, j) => j !== i) : null;
    const roofPatch: Partial<Roof> = {
      perEdgeSetbacksM: dropEdge(roof.perEdgeSetbacksM),
      parapet: { ...roof.parapet, perEdge: dropEdge(roof.parapet.perEdge) },
    };
    if (
      requestGeometryChange(
        roofId,
        roof.polygon.filter((_, j) => j !== i),
        false,
        roofPatch,
      )
    ) {
      setSelectedVertex(null);
    }
  }

  function insertVertex(roofId: string, edgeIndex: number) {
    const roof = project.roofs.find((r) => r.id === roofId);
    if (!roof || lockedIds.has(roofId)) return;
    const a = roof.polygon[edgeIndex];
    const b = roof.polygon[(edgeIndex + 1) % roof.polygon.length];
    // splitting at the midpoint halves the edge — refuse if either half would
    // fall below the minimum edge length (would fail validation immediately)
    if (dist(a, b) < 2 * MIN_ROOF_EDGE_M) {
      showHint(`Edge too short to add a point (min ${2 * MIN_ROOF_EDGE_M} m)`);
      return;
    }
    const polygon = [...roof.polygon];
    polygon.splice(edgeIndex + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    // the split edge becomes two edges — both inherit the original's values
    const splitEdge = <T,>(arr: T[] | null): T[] | null => {
      if (!arr) return null;
      const next = [...arr];
      next.splice(edgeIndex + 1, 0, arr[edgeIndex]);
      return next;
    };
    dragStartPolygonRef.current = roof.polygon.map((p) => ({ ...p }));
    dragOffsetRef.current = { x: 0, y: 0 };
    updateRoof(
      roofId,
      {
        polygon,
        perEdgeSetbacksM: splitEdge(roof.perEdgeSetbacksM),
        parapet: { ...roof.parapet, perEdge: splitEdge(roof.parapet.perEdge) },
      },
      true,
    );
    setEdgeEdit(null);
    // let the user drag the fresh vertex right away; insert was the undo step
    dragMovedRef.current = true;
    setDragVertex({ roofId, i: edgeIndex + 1 });
  }

  function beginEdgeEdit(roofId: string, i: number) {
    if (lockedIds.has(roofId)) {
      showHint('Roof is locked — unlock it to edit', true);
      return;
    }
    const roof = project.roofs.find((r) => r.id === roofId);
    if (!roof) return;
    const len = dist(roof.polygon[i], roof.polygon[(i + 1) % roof.polygon.length]);
    setSelectedVertex(null);
    setEdgeEdit({ roofId, i, text: len.toFixed(2) });
  }

  function commitEdgeEdit() {
    if (!edgeEdit) return;
    const roof = project.roofs.find((r) => r.id === edgeEdit.roofId);
    if (!roof || edgeEdit.i >= roof.polygon.length) {
      setEdgeEdit(null);
      return;
    }
    const targetM = parseFloat(edgeEdit.text);
    if (!Number.isFinite(targetM) || targetM < 0.2 || targetM > 500) {
      showHint('Enter a length between 0.2 and 500 m');
      return;
    }
    const n = roof.polygon.length;
    const a = roof.polygon[edgeEdit.i];
    const b = roof.polygon[(edgeEdit.i + 1) % n];
    const len = dist(a, b) || 1;
    const end = {
      x: a.x + ((b.x - a.x) / len) * targetM,
      y: a.y + ((b.y - a.y) / len) * targetM,
    };
    if (
      requestGeometryChange(
        roof.id,
        roof.polygon.map((p, j) => (j === (edgeEdit.i + 1) % n ? end : p)),
      )
    ) {
      setEdgeEdit(null);
    }
  }

  function doUndo() {
    if (draft) {
      setDraft((d) => (d && d.length > 0 ? d.slice(0, -1) : d));
      return;
    }
    dispatch({ type: 'undo' });
  }

  function endVertexDrag() {
    if (!dragVertex) return;
    const roof = project.roofs.find((r) => r.id === dragVertex.roofId);
    const before = dragStartPolygonRef.current;
    if (roof && before) {
      const polygon = normalisedPolygon(roof.polygon);
      if (!polygon) {
        updateRoof(roof.id, { polygon: before }, false, true);
      } else {
        const issues = dependencyIssues(roof, polygon);
        if (hasDependencyIssues(issues)) {
          updateRoof(roof.id, { polygon: before }, false, true);
          setPendingGeometryChange({
            roofId: roof.id,
            polygon,
            issues,
            useExistingUndoSnapshot: true,
          });
        }
      }
    }
    setSelectedVertex(dragVertex);
    setDragVertex(null);
    dragStartPolygonRef.current = null;
    dragOffsetRef.current = { x: 0, y: 0 };
  }

  /**
   * Offset that snaps a whole moving polygon onto another roof: the smallest
   * shift that makes any of its vertices coincide with a nearby roof vertex or
   * edge. Lets a duplicated slope click exactly onto the ridge line.
   */
  function snapWholeRoof(poly: XY[], excludeId: string): XY {
    let best: { dx: number; dy: number; d: number } | null = null;
    for (const v of poly) {
      const s = snapToRoofs(v, excludeId);
      if (s === v) continue;
      const d = Math.hypot(s.x - v.x, s.y - v.y);
      if (!best || d < best.d) best = { dx: s.x - v.x, dy: s.y - v.y, d };
    }
    return best ? { x: best.dx, y: best.dy } : { x: 0, y: 0 };
  }

  function endBodyDrag() {
    if (!dragBody) return;
    const roof = project.roofs.find((r) => r.id === dragBody.roofId);
    const before = dragStartPolygonRef.current;
    if (roof && before) {
      const polygon = normalisedPolygon(roof.polygon);
      if (!polygon) {
        updateRoof(roof.id, { polygon: before }, false, true);
      } else {
        const issues = dependencyIssues(roof, polygon);
        if (hasDependencyIssues(issues)) {
          updateRoof(roof.id, { polygon: before }, false, true);
          setPendingGeometryChange({
            roofId: roof.id,
            polygon,
            issues,
            useExistingUndoSnapshot: true,
          });
        }
      }
    }
    setDragBody(null);
    dragStartPolygonRef.current = null;
    dragBodyDownRef.current = null;
  }

  /** Compass angle (deg) of the vector from a roof centroid to a point. */
  function angleFromCentroid(c: XY, p: XY): number {
    return (Math.atan2(p.x - c.x, p.y - c.y) * 180) / Math.PI;
  }

  function endRotateDrag() {
    if (!dragRotate) return;
    const roof = project.roofs.find((r) => r.id === dragRotate.roofId);
    const before = dragStartPolygonRef.current;
    // the live drag rotated BOTH the polygon and the slope azimuth — any revert
    // must restore the azimuth too, or the surface would point the wrong way
    // relative to the reverted geometry
    const startAz = dragRotateRef.current?.startAz ?? roof?.slopeAzimuthDeg ?? 180;
    if (roof && before) {
      const rotatedAz = roof.slopeAzimuthDeg;
      const polygon = normalisedPolygon(roof.polygon);
      if (!polygon) {
        updateRoof(roof.id, { polygon: before, slopeAzimuthDeg: startAz }, false, true);
      } else {
        const issues = dependencyIssues(roof, polygon);
        if (hasDependencyIssues(issues)) {
          updateRoof(roof.id, { polygon: before, slopeAzimuthDeg: startAz }, false, true);
          setPendingGeometryChange({
            roofId: roof.id,
            polygon,
            roofPatch: { slopeAzimuthDeg: rotatedAz },
            issues,
            useExistingUndoSnapshot: true,
          });
        }
      }
    }
    setDragRotate(null);
    dragStartPolygonRef.current = null;
    dragRotateRef.current = null;
  }

  function handleClick(m: XY, e: React.PointerEvent) {
    if (measure.handleClick(m)) return;
    if (draft) {
      const { p: pt } = snapDraft(m, draft, e.shiftKey);
      // near first vertex → offer to complete
      if (draft.length >= 3 && dist(pt, draft[0]) < 14 / canvasPxPerM) {
        setAskClose(true);
        return;
      }
      // reject a click too close to the previous point — it would make an edge
      // shorter than the minimum and only fail later when closing the roof
      const last = draft[draft.length - 1];
      if (last && dist(pt, last) < MIN_ROOF_EDGE_M) {
        showHint(`Points must be at least ${MIN_ROOF_EDGE_M} m apart`);
        return;
      }
      setDraft([...draft, pt]);
      return;
    }
    if (dragVertex) return; // vertex click/drag handled in onCanvasUp
    const selectedHit = selected && pointInPolygon(m, selected.polygon) ? selected : null;
    // stacked roofs (mumty on terrace): the higher/smaller roof wins the click
    const hit = selectedHit ?? pickRoofAt(m, project.roofs);
    selectRoof(hit?.id ?? null);
  }

  // keyboard shortcuts — re-registered each render so the handler sees fresh state
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // `target` is only an Element for key presses that reach a focused node.
      // A listener on `window` also receives events dispatched at `window` or
      // `document` — neither has `closest`, and the bare cast threw there.
      if (typedInto(e.target)) return;
      if (sheet || askClose) return; // Sheet/Dialog own the keyboard
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (!redoDisabled) dispatch({ type: 'redo' });
        } else if (!undoDisabled) {
          doUndo();
        }
        return;
      }
      if (mod || e.altKey) return;
      switch (e.key) {
        case 'Escape':
          if (draft) cancelDraw();
          else if (selectedVertex) setSelectedVertex(null);
          else selectRoof(null);
          return;
        case 'Enter':
          if (draft && draft.length >= 3) finishRoof(draft);
          return;
        case 'v':
        case 'V':
          cancelDraw();
          return;
        case 'd':
        case 'D':
          if (!draft) startDraw();
          return;
        case 'o':
        case 'O':
          setOrtho((v) => !v);
          return;
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          if (draft) setDraft((d) => (d && d.length > 0 ? d.slice(0, -1) : d));
          else if (selectedVertex) deleteVertex(selectedVertex.roofId, selectedVertex.i);
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const fmt = fmtLen;

  const vertexRoof = selectedVertex
    ? project.roofs.find((r) => r.id === selectedVertex.roofId)
    : null;
  const showVertexBar =
    !!selectedVertex &&
    !!vertexRoof &&
    selectedVertex.i < vertexRoof.polygon.length &&
    !lockedIds.has(vertexRoof.id) &&
    !dragVertex;
  /**
   * The corner the user is working on: the dragged vertex, or — once the drag
   * is released — the selected one, with its two neighbours wrapped around the
   * ring. A roof is squared as often by pulling a corner into place afterwards
   * as by placing it right the first time, so the corner gets the same angle
   * readout the draw does.
   *
   * It used to follow the DRAG only. Releasing hands the corner from
   * `dragVertex` to `selectedVertex`, so the number vanished at the exact moment
   * the user let go to read it — "is that 90.0 or 89.6?" is asked with the
   * mouse up, not down. It now stays for as long as the corner is selected:
   * until Escape, a click elsewhere, Close or Delete.
   */
  const activeCorner = (() => {
    const ref = dragVertex ?? selectedVertex;
    if (!ref) return null;
    const roof = project.roofs.find((r) => r.id === ref.roofId);
    const n = roof?.polygon.length ?? 0;
    if (!roof || n < 3 || ref.i >= n) return null;
    return {
      a: roof.polygon[(ref.i - 1 + n) % n],
      b: roof.polygon[ref.i],
      c: roof.polygon[(ref.i + 1) % n],
    };
  })();
  const edgeRoof = edgeEdit
    ? project.roofs.find((r) => r.id === edgeEdit.roofId)
    : null;
  const showEdgeInput = !!edgeEdit && !!edgeRoof && edgeEdit.i < edgeRoof.polygon.length;
  const pendingIssueCount = pendingGeometryChange
    ? Object.values(pendingGeometryChange.issues).reduce((sum, items) => sum + items.length, 0)
    : 0;

  if (show3D)
    // Roof Setup owns the roofs and nothing else — no obstructions, no array
    return <Scene3D onClose={() => setShow3D(false)} initialViewMode="mesh" stage={2} />;

  // ── the Halo menu's contents ──────────────────────────────────────────────
  // The rail's five headings collapse to three groups: "Snap" and "Measure"
  // held one and two buttons, and a group ring hub that opens a single tool
  // is a tap that buys nothing. Opening the 3D is the step's flagship action,
  // so it keeps its own pill rather than being buried a ring deep.
  const roofGroups: RadialGroup[] = [
    {
      id: 'draw',
      label: 'Draw',
      icon: <PenLine />,
      items: [
        {
          id: 'select',
          icon: <MousePointer2 />,
          label: 'Select',
          tip: 'Select\nV',
          active: !draft,
          onClick: cancelDraw,
        },
        {
          id: 'draw',
          icon: <PenLine />,
          label: 'Roof',
          tip: 'Draw roof\nD',
          active: !!draft,
          onClick: () => (draft ? cancelDraw() : startDraw()),
        },
      ],
    },
    {
      id: 'measure',
      label: 'Measure',
      icon: <Ruler />,
      items: [
        {
          id: 'ortho',
          icon: <Ruler />,
          label: 'Ortho',
          tip: 'Ortho snap\nO — hold Shift temporarily while drawing',
          active: ortho,
          onClick: () => setOrtho((v) => !v),
        },
        {
          id: 'dims',
          icon: <RulerDimensionLine />,
          label: 'Dims',
          tip: 'Measurements\nShow every roof edge length',
          active: showMeasurements,
          onClick: () => setShowMeasurements((v) => !v),
        },
        {
          id: 'distance',
          icon: <PencilRuler />,
          label: 'Dist',
          tip: 'Measure distance\nClick two points — then calibrate\nthe imagery from a known length',
          active: measure.active,
          onClick: measure.toggle,
        },
      ],
    },
    {
      id: 'history',
      label: 'History',
      icon: <Undo2 />,
      items: [
        {
          id: 'undo',
          icon: <Undo2 />,
          label: 'Undo',
          tip: 'Undo\nCtrl/⌘ Z',
          disabled: undoDisabled,
          onClick: doUndo,
        },
        {
          id: 'redo',
          icon: <Redo2 />,
          label: 'Redo',
          tip: 'Redo\nCtrl/⌘ ⇧ Z',
          disabled: redoDisabled,
          onClick: () => dispatch({ type: 'redo' }),
        },
      ],
    },
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <SatCanvas
        lat={loc.latLng.lat}
        lng={loc.latLng.lng}
        scaleFactor={project.calibration.scaleFactor}
        northOffsetDeg={project.calibration.northOffsetDeg}
        cursor={draft || measure.active ? 'crosshair' : dragVertex || dragBody || dragRotate ? 'grabbing' : 'default'}
        panEnabled={!draft && !dragVertex && !dragBody && !dragRotate}
        onCanvasClick={handleClick}
        onCanvasMove={(m, e) => {
          measure.handleMove(m);
          if (draft) {
            const res = snapDraft(m, draft, e.shiftKey);
            setHover(res.p);
            setSnapGuides(res.guides);
            return;
          }
          if (dragRotate) {
            if (e.buttons === 0) {
              endRotateDrag();
              return;
            }
            const roof = project.roofs.find((r) => r.id === dragRotate.roofId);
            const start = dragStartPolygonRef.current;
            const rot = dragRotateRef.current;
            if (!roof || !start || !rot || lockedIds.has(roof.id)) return;
            if (!dragMovedRef.current) {
              dragMovedRef.current = true;
              patch({}, true); // one pre-rotate snapshot so ⌘Z restores the angle
            }
            let delta = angleFromCentroid(rot.c, m) - rot.startDeg;
            // hold Shift to snap to tidy 15° steps for quick building alignment
            if (e.shiftKey) delta = Math.round(delta / 15) * 15;
            const rad = (delta * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            // compass rotation: (dx,dy) → rotate clockwise by delta about centroid
            const rotPt = (p: XY): XY => {
              const dx = p.x - rot.c.x;
              const dy = p.y - rot.c.y;
              return {
                x: rot.c.x + dx * cos + dy * sin,
                y: rot.c.y - dx * sin + dy * cos,
              };
            };
            updateRoof(
              roof.id,
              {
                polygon: start.map(rotPt),
                slopeAzimuthDeg: ((rot.startAz + delta) % 360 + 360) % 360,
              },
              false,
              true,
            );
            return;
          }
          if (dragBody) {
            if (e.buttons === 0) {
              endBodyDrag();
              return;
            }
            const roof = project.roofs.find((r) => r.id === dragBody.roofId);
            const start = dragStartPolygonRef.current;
            const down = dragBodyDownRef.current;
            if (!roof || !start || !down || lockedIds.has(roof.id)) return;
            if (!dragMovedRef.current) {
              dragMovedRef.current = true;
              patch({}, true); // one pre-move snapshot so ⌘Z restores the position
            }
            const dx = m.x - down.x;
            const dy = m.y - down.y;
            const moved = start.map((p) => ({ x: p.x + dx, y: p.y + dy }));
            const adj = snapWholeRoof(moved, roof.id);
            updateRoof(
              roof.id,
              { polygon: moved.map((p) => ({ x: p.x + adj.x, y: p.y + adj.y })) },
              false,
              true,
            );
            return;
          }
          if (dragVertex) {
            if (e.buttons === 0) {
              endVertexDrag();
              return;
            }
            const roof = project.roofs.find((r) => r.id === dragVertex.roofId);
            if (!roof || lockedIds.has(roof.id)) return;
            if (!dragMovedRef.current) {
              dragMovedRef.current = true;
              patch({}, true); // snapshot pre-drag state once, so ⌘Z restores it
            }
            const target = snapToRoofs(
              { x: m.x + dragOffsetRef.current.x, y: m.y + dragOffsetRef.current.y },
              roof.id,
            );
            updateRoof(
              roof.id,
              {
                polygon: roof.polygon.map((p, j) => (j === dragVertex.i ? target : p)),
              },
              false,
              true,
            );
          }
        }}
        onCanvasUp={() => {
          endVertexDrag();
          endBodyDrag();
          endRotateDrag();
        }}
      >
        <CanvasMetrics onChange={setCanvasPxPerM} />
        <RoofLayer
          roofs={project.roofs}
          selectedId={selectedId}
          lockedIds={lockedIds}
          selectedVertex={selectedVertex}
          editingEdge={edgeEdit}
          fmt={fmt}
          showMeasurements={showMeasurements}
          onRotateDown={(roofId, downCursor) => {
            const roof = project.roofs.find((r) => r.id === roofId);
            if (!roof || lockedIds.has(roofId)) return;
            const c = polygonCentroid(roof.polygon);
            dragMovedRef.current = false;
            dragStartPolygonRef.current = roof.polygon.map((p) => ({ ...p }));
            dragRotateRef.current = {
              c,
              startDeg: angleFromCentroid(c, downCursor),
              startAz: roof.slopeAzimuthDeg ?? 180,
            };
            setSelectedVertex(null);
            setEdgeEdit(null);
            setDragRotate({ roofId });
          }}
          onVertexDown={(roofId, i, grabOffset) => {
            dragMovedRef.current = false;
            dragStartPolygonRef.current =
              project.roofs.find((r) => r.id === roofId)?.polygon.map((p) => ({ ...p })) ?? null;
            dragOffsetRef.current = grabOffset;
            setEdgeEdit(null);
            setDragVertex({ roofId, i });
          }}
          onBodyDown={(roofId, downCursor) => {
            if (lockedIds.has(roofId)) return;
            dragMovedRef.current = false;
            dragStartPolygonRef.current =
              project.roofs.find((r) => r.id === roofId)?.polygon.map((p) => ({ ...p })) ?? null;
            dragBodyDownRef.current = downCursor;
            setSelectedVertex(null);
            setEdgeEdit(null);
            setDragBody({ roofId });
          }}
          onInsert={insertVertex}
          onLabelClick={beginEdgeEdit}
        />
        {draft && (
          <DrawingLayer points={draft} hover={hover} fmt={fmt} guides={snapGuides} />
        )}
        {/* the point toolbar sits just above a selected corner — keep clear of it */}
        {activeCorner && <CornerAngle {...activeCorner} avoidAbove={showVertexBar} />}
        {showVertexBar && vertexRoof && selectedVertex && (
          <VertexContextBar
            at={vertexRoof.polygon[selectedVertex.i]}
            onDelete={() => deleteVertex(selectedVertex.roofId, selectedVertex.i)}
            onClose={() => setSelectedVertex(null)}
          />
        )}
        {showEdgeInput && edgeRoof && edgeEdit && (
          <EdgeLengthInput
            poly={edgeRoof.polygon}
            i={edgeEdit.i}
            value={edgeEdit.text}
            onChange={(text) => setEdgeEdit({ ...edgeEdit, text })}
            onCommit={commitEdgeEdit}
            onCancel={() => setEdgeEdit(null)}
          />
        )}
        <MeasureOverlay measure={measure} fmt={(m) => fmtLen(m, 2)} />
      </SatCanvas>

      {/* measure result + calibration entry */}
      {measure.active && measure.done && measure.lengthM !== null && (
        <div
          style={{
            position: 'absolute',
            bottom: 18,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(10,14,20,0.92)',
            border: '1px solid var(--editor-line)',
            borderRadius: 12,
            padding: '9px 14px',
            color: '#fff',
            fontSize: 12.5,
          }}
        >
          <RulerDimensionLine size={15} aria-hidden style={{ color: '#22d3ee' }} />
          Measured <b style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtLen(measure.lengthM, 2)}</b>
          <button className="chip" onClick={() => setCalibrateOpen(true)}>
            Know the real distance? Calibrate
          </button>
          <button className="chip" onClick={measure.reset}>
            New measurement
          </button>
        </div>
      )}

      {calibrateOpen && measure.a && measure.b && measure.lengthM !== null && (
        <CalibrateDialog
          measuredM={measure.lengthM}
          project={project}
          onClose={() => setCalibrateOpen(false)}
          onApply={(knownM, northOffsetDeg) => {
            const patchData = applyKnownDistance(project, measure.a!, measure.b!, knownM);
            patch(
              {
                ...(patchData ?? {}),
                calibration: {
                  ...(patchData?.calibration ?? project.calibration),
                  northOffsetDeg,
                },
              },
              true, // rescaling every polygon deserves an undo step
            );
            setCalibrateOpen(false);
            measure.reset();
            showHint('Calibrated — all geometry rescaled; energy and BOM recalculate');
          }}
        />
      )}

      {/* every roof tool, in one radial menu (see components/RadialMenu) */}
      <RadialMenu groups={roofGroups} ariaLabel="Roof tools" style={{ left: 64, top: '50%' }} />

      {/* opening the 3D is this step's flagship action — it keeps its own pill,
          in the corner the vertical rail used to fill */}
      <button
        className="tool-btn light"
        style={{
          position: 'absolute',
          left: 14,
          bottom: 96,
          zIndex: 30,
          width: 'auto',
          padding: '0 13px',
          gap: 7,
          fontWeight: 800,
          fontSize: 12.5,
          borderRadius: 12,
          opacity: project.roofs.length === 0 ? 0.35 : 1,
        }}
        aria-label="View in 3D"
        data-tip={'View in 3D\nWhole design'}
        data-tip-right=""
        disabled={project.roofs.length === 0}
        onClick={() => setShow3D(true)}
      >
        <Box />
        3D
      </button>

      {/* TOP BAND — roof chips on the left, the selected roof's actions on the
          right. They used to be two independent absolutes both pinned to
          top:12 at z-index 30, so on a narrow viewport the action rail landed
          on top of the chips and buried their delete buttons (the later
          sibling wins at equal z). Sharing one flex row makes the overlap
          impossible at any width instead of at the widths we happened to test
          (DESIGN-SYSTEM N9). The band itself is pointer-transparent so the gap
          between the two groups still pans the canvas. */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 14,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          zIndex: 30,
          pointerEvents: 'none',
        }}
      >
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          minWidth: 0,
          maxWidth: 'min(64%, 560px)',
          pointerEvents: 'auto',
        }}
        role="list"
        aria-label="Roofs"
      >
        {project.roofs.map((r, ri) => {
          const sel = r.id === selectedId;
          const locked = lockedIds.has(r.id);
          const chipColor = roofColor(ri);
          return (
            <div
              key={r.id}
              className={`chip ${sel ? 'on' : ''}`}
              role="listitem"
              // the three controls each stand 44px tall (N2), so the chip's own
              // vertical padding would only add to a box that is already large
              // enough — it goes, and the row lands at 44px, not 56px.
              // minWidth 0 lets the name give way rather than let the chip
              // overflow the band and slide back under the action rail
              style={{ padding: '0 4px 0 10px', gap: 4, minWidth: 0 }}
            >
              <button
                type="button"
                className="min-h-(--target-min)"
                aria-label={`Select ${r.name}`}
                aria-pressed={sel}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  minWidth: 0,
                  overflow: 'hidden',
                  color: 'inherit',
                }}
                onClick={() => selectRoof(r.id)}
              >
                <span
                  aria-hidden
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: chipColor,
                    flex: 'none',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.5)',
                  }}
                />
                {/* the name gives way; the area never does — it is a
                    quantity, and a truncated one is worse than none */}
                <span className="truncate">{r.name}</span>
                <small style={{ opacity: 0.75, flex: 'none', whiteSpace: 'nowrap' }}>
                  {fmtArea(polygonArea(r.polygon))}
                </small>
              </button>
              <button
                type="button"
                className="min-h-(--target-min) min-w-(--target-min)"
                aria-label={locked ? `Unlock ${r.name}` : `Lock ${r.name}`}
                data-tip={locked ? 'Unlock roof' : 'Lock roof\nProtects its geometry'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'inherit',
                }}
                onClick={() => toggleLock(r.id)}
              >
                {locked ? <Lock /> : <LockOpen />}
              </button>
              <button
                type="button"
                className="min-h-(--target-min) min-w-(--target-min)"
                aria-label={`Delete ${r.name}`}
                data-tip={locked ? 'Unlock to delete' : 'Delete roof'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: sel ? '#fff' : 'var(--bad)',
                  opacity: locked ? 0.45 : 1,
                }}
                onClick={() => deleteRoof(r.id)}
              >
                <Trash2 />
              </button>
            </div>
          );
        })}
      </div>

      {/* selected-roof action bar — laid out by the band above, not pinned */}
      {selected && !draft && (
        <div
          className="tool-rail dark"
          style={{ position: 'static', flex: 'none', flexDirection: 'row', pointerEvents: 'auto' }}
          role="toolbar"
          aria-label="Roof actions"
        >
          <button
            className="tool-btn"
            aria-label="Roof type"
            data-tip="Roof type"
            data-tip-bottom=""
            onClick={() => setSheet('roofType')}
          >
            <Home />
          </button>
          <button
            className="tool-btn"
            aria-label={selected.roofType === 'ground' ? 'Level and setback' : 'Height and parapet'}
            data-tip={selected.roofType === 'ground' ? 'Level & setback' : 'Height & parapet'}
            data-tip-bottom=""
            onClick={() => setSheet('height')}
          >
            <MoveVertical />
          </button>
          <div
            style={{
              width: 1,
              alignSelf: 'stretch',
              background: 'var(--editor-line)',
              margin: '2px 3px',
            }}
            aria-hidden
          />
          <button
            className="tool-btn"
            aria-label="Duplicate roof"
            data-tip="Duplicate roof"
            data-tip-bottom=""
            onClick={() => {
              const copy: Roof = {
                ...selected,
                id: genId('roof'),
                name: `Roof ${project.roofs.length + 1}`,
                polygon: selected.polygon.map((p) => ({ x: p.x + 5, y: p.y + 5 })),
              };
              patch({ roofs: [...project.roofs, copy] }, true);
              selectRoof(copy.id);
            }}
          >
            <Copy />
          </button>
        </div>
      )}
      </div>{/* /top band */}

      {/* top-center guidance */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 36,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        {draft && (
          <div className="hint-bar" role="status" aria-live="polite">
            <Info />
            Click exact roof corners · hold <kbd className="dark">Shift</kbd> to snap ·{' '}
            <kbd className="dark">Enter</kbd> to finish ·{' '}
            <kbd className="dark">Esc</kbd> to cancel
          </div>
        )}
        {!draft && project.roofs.length === 0 && !hint && (
          <div className="hint-bar">
            <PenLine />
            Press <kbd className="dark">D</kbd> or pick the pen tool to trace your first roof
          </div>
        )}
        {hint && (
          <div className="hint-bar" role="status" aria-live="polite">
            {hint.lock ? <Lock /> : <TriangleAlert />}
            {hint.text}
          </div>
        )}
      </div>

      {askClose && draft && (
        <Dialog
          title="Complete Shape?"
          icon={<Sparkles size={16} />}
          onClose={() => setAskClose(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setAskClose(false)}>
                Keep Drawing
              </button>
              <button className="btn btn-primary" onClick={() => finishRoof(draft)}>
                Complete Shape
              </button>
            </>
          }
        >
          <p>
            Your shape isn't closed yet. Would you like us to automatically
            connect the last point to the first point to complete the roof
            area?
          </p>
        </Dialog>
      )}

      {pendingGeometryChange && (
        <Dialog
          title="Review dependent design items"
          icon={<TriangleAlert size={16} />}
          onClose={() => setPendingGeometryChange(null)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setPendingGeometryChange(null)}>
                Keep current roof
              </button>
              <button className="btn btn-secondary" onClick={() => applyPendingGeometryChange(false)}>
                Keep items for review
              </button>
              <button className="btn btn-primary" onClick={() => applyPendingGeometryChange(true)}>
                Remove invalid items
              </button>
            </>
          }
        >
          <p>
            This roof change affects {pendingIssueCount} item{pendingIssueCount === 1 ? '' : 's'}
            {' '}placed in a later design step.
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {pendingGeometryChange.issues.panels.length > 0 && (
              <li>{pendingGeometryChange.issues.panels.length} panel(s) outside the usable roof area</li>
            )}
            {pendingGeometryChange.issues.obstructions.length > 0 && (
              <li>{pendingGeometryChange.issues.obstructions.length} obstruction(s) outside the roof</li>
            )}
            {pendingGeometryChange.issues.walkways.length > 0 && (
              <li>{pendingGeometryChange.issues.walkways.length} walkway(s) outside the usable roof area</li>
            )}
            {pendingGeometryChange.issues.rails.length > 0 && (
              <li>{pendingGeometryChange.issues.rails.length} rail(s) outside the roof</li>
            )}
            {pendingGeometryChange.issues.arresters.length > 0 && (
              <li>{pendingGeometryChange.issues.arresters.length} arrester(s) outside the roof</li>
            )}
            {pendingGeometryChange.issues.inverters.length > 0 && (
              <li>{pendingGeometryChange.issues.inverters.length} inverter placement(s) on a removed edge</li>
            )}
          </ul>
        </Dialog>
      )}

      {sheet === 'roofType' &&
        selected &&
        (() => {
          // preview the split so the card can disable + explain when this
          // footprint can't gable — the reason is shown inline, no toast needed
          const otherRoofs = project.roofs.filter((r) => r.id !== selected.id);
          // ridge runs along the long wall by default, or across it if chosen
          const ridgeDeg =
            dominantEdgeAngle(selected.polygon) + (ridgeMode === 'width' ? 90 : 0);
          // preview at the SAME pitch the conversion will use, or the card's
          // enabled/disabled state would describe a roof we don't build
          const previewPitch = conversionPitchDeg(selected);
          const gable = gableFaces({
            footprint: selected.polygon,
            existing: otherRoofs,
            ridgeAngleDeg: ridgeDeg,
            pitchDeg: previewPitch,
            eaveHeightM: selected.heightM,
            namePrefix: selected.name,
          });
          const hipRect = hipFaces({
            footprint: selected.polygon,
            existing: otherRoofs,
            ridgeAngleDeg: ridgeDeg,
            pitchDeg: previewPitch,
            eaveHeightM: selected.heightM,
            namePrefix: selected.name,
          });
          // any convex footprint works via the straight skeleton if it's not a rectangle
          const hip = hipRect.ok
            ? hipRect
            : skeletonFaces({ footprint: selected.polygon, existing: otherRoofs, pitchDeg: previewPitch, eaveHeightM: selected.heightM, namePrefix: selected.name });
          const showRidge = gable.ok || hipRect.ok;
          return (
            <Sheet title="Roof Type" icon={<Home size={16} />} onClose={() => setSheet(null)}>
              <OptionCard
                title="RCC Flat"
                sub="Reinforced concrete flat roof – panels on elevated tilted structure"
                icon={<Building2 size={20} />}
                selected={selected.roofType === 'rcc_flat'}
                onClick={() => setRoofType(selected.id, 'rcc_flat')}
              />
              <OptionCard
                title="Metal Shed"
                sub="Metal sheet roofing – panels flush-mounted with rails and clamps"
                icon={<Factory size={20} />}
                selected={selected.roofType === 'metal_shed'}
                onClick={() => setRoofType(selected.id, 'metal_shed')}
              />
              <OptionCard
                title="Tile (Mangalore / Clay)"
                // A tile roof is always pitched. Setting the covering FIRST and
                // converting after is the intended order — the covering now
                // survives a Gable/Hip conversion — so this stays enabled on a
                // flat footprint and says what is still missing instead.
                sub={
                  selected.pitchDeg > 0
                    ? 'Clay or Mangalore tile over battens – panels flush-mounted on adjustable tile hooks'
                    : 'Clay or Mangalore tile. Still drawn FLAT — convert to Gable or Hip below to give it a pitch, or the quote will price a flat deck.'
                }
                icon={<Layers size={20} />}
                selected={selected.roofType === 'tile'}
                onClick={() => setRoofType(selected.id, 'tile')}
              />
              <OptionCard
                title="Ground Array"
                sub={
                  selected.pitchDeg > 0
                    ? `Not available for a ${selected.pitchDeg}° pitched face — a roof plane is not ground. Draw the array area separately.`
                    : 'Open ground at grade – tilted tables on foundations. Assumes level terrain.'
                }
                icon={<Trees size={20} />}
                selected={selected.roofType === 'ground'}
                // Converting a PITCHED face would silently discard its pitch and
                // azimuth — the surface would look converted while the roof plane
                // it modelled is gone. Refuse instead of quietly losing geometry.
                disabled={selected.pitchDeg > 0}
                onClick={() => setRoofType(selected.id, 'ground')}
              />
              {showRidge && (
                <div style={{ marginTop: 4 }}>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--muted)',
                      margin: '6px 2px',
                      fontWeight: 600,
                    }}
                  >
                    Ridge direction
                  </div>
                  <Seg
                    value={ridgeMode}
                    onChange={setRidgeMode}
                    options={[
                      { value: 'length', label: 'Along length' },
                      { value: 'width', label: 'Across width' },
                    ]}
                  />
                </div>
              )}
              <OptionCard
                title="Pitched Gable (2 faces)"
                sub={
                  gable.ok
                    ? "Split into two sloped faces meeting at a ridge — the common residential pitched roof. Set each face's pitch afterward."
                    : gable.reason
                }
                icon={<Triangle size={20} />}
                selected={false}
                disabled={!gable.ok}
                onClick={() => convertToGable(selected, ridgeDeg)}
              />
              <OptionCard
                title="Pitched Hip (4 faces)"
                sub={
                  hip.ok
                    ? 'One sloped face per wall, meeting at a central ridge — the hipped/pyramidal roof. Works for any convex footprint; set each face’s pitch afterward.'
                    : hip.reason
                }
                icon={<Pyramid size={20} />}
                selected={false}
                disabled={!hip.ok}
                onClick={() => convertToHip(selected, ridgeDeg)}
              />
            </Sheet>
          );
        })()}

      {sheet === 'height' && selected && (
        <Sheet
          title={selected.roofType === 'ground' ? 'Level & Setback' : 'Height & Parapet'}
          icon={<MoveVertical size={16} />}
          onClose={() => setSheet(null)}
          right={
            <UnitToggle
              unit={units === 'imperial' ? 'ft' : 'm'}
              onChange={(u) => setUnits(u === 'ft' ? 'imperial' : 'metric')}
            />
          }
        >
          {/* A ground surface IS the ground. This slider used to keep its
              2 m roof minimum for it, so the readout said 0.0 m while the
              thumb sat at 2, and the first drag lifted the whole field — modules,
              tables, obstructions, every shadow — two metres into the air with
              no way back to 0 through the control. */}
          <SliderRow
            label={selected.roofType === 'ground' ? 'Level above grade' : 'Height from Ground'}
            value={selected.heightM}
            min={selected.roofType === 'ground' ? 0 : 2}
            max={150}
            step={0.5}
            unit={units === 'imperial' ? 'ft' : 'm'}
            format={(v) => lenValue(v, 1)}
            onChange={(v) => updateRoof(selected.id, { heightM: v, heightSource: 'user' })}
            hint={
              selected.roofType === 'ground'
                ? '0 = the array area is the ground itself. Raise it only for a plinth or a raised platform. Module clearance above ground is set by the structure, not here.'
                : selected.faceGroupId
                  ? 'Low-side (eave) wall height — shared by every face of this roof, so it applies to all of them.'
                  : selected.pitchDeg > 0.5
                    ? 'Low-side (eave) wall height. The roof rises from here toward the ridge.'
                    : 'Height of roof surface from ground level. Used for accurate shadow calculations.'
            }
          />
          {(() => {
            // what the aerial height map measured over this polygon — one tap to take it
            const grid = surroundGrid;
            const fit = grid ? roofMapFit(grid, selected, project.calibration.northOffsetDeg) : null;
            // the aerial height map is excluded from open ground by definition
            if (!grid || !fit || selected.roofType === 'ground') return null;
            const differs =
              Math.abs(fit.heightM - selected.heightM) > ROOF_HEIGHT_TOLERANCE_M ||
              (fit.rmseM <= TRUSTED_RMSE_M && Math.abs(fit.pitchDeg - selected.pitchDeg) >= 1);
            // this roof and every roof standing on it, in one undo step
            const take = () =>
              patch({ roofs: roofsWithMapFit(project.roofs, grid, selected.id, project.calibration.northOffsetDeg) }, true);
            return (
              <div className="hint" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '-4px 0 10px' }}>
                <span>
                  Aerial height map: ≈ {lenValue(fit.heightM, 1)} {units === 'imperial' ? 'ft' : 'm'}
                  {fit.pitchDeg ? ` · ${fit.pitchDeg}° facing ${fit.slopeAzimuthDeg}°` : ' · flat'}
                  {selected.heightSource === 'aerial_map' && !differs && !selected.faceGroupId ? ' · in use' : ''}
                  {/* one tap here used to plane-fit ONE face of a gable and flatten it
                      against its siblings — the reading is shown, never applied */}
                  {selected.faceGroupId ? ' · reads one face only, so a gable or hip keeps its built pitch' : ''}
                </span>
                {differs && !selected.faceGroupId && (
                  <button type="button" className="btn btn-secondary" onClick={take}>
                    Use
                  </button>
                )}
              </div>
            );
          })()}
          {roofHint && selected.roofType !== 'ground' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                margin: '0 0 10px',
                borderRadius: 8,
                background: 'rgba(37,99,235,0.10)',
                border: '1px solid rgba(37,99,235,0.35)',
                fontSize: 11.5,
                color: 'var(--ink-2)',
              }}
            >
              <span style={{ flex: 1 }}>
                Google detected <b>{roofHint.pitchDeg}°</b>
                {roofHint.pitchDeg > 1 ? <> facing <b>{compass8(roofHint.azimuthDeg)}</b></> : ' (flat)'} for this
                roof.
              </span>
              <button
                type="button"
                onClick={() => {
                  patchRoofAndPose(selected.id, {
                    pitchDeg: roofHint.pitchDeg,
                    slopeAzimuthDeg: roofHint.azimuthDeg,
                    // choosing Google's value is still the user's choice — and it
                    // is a DIFFERENT source from the height map, so without the
                    // mark the map sync would overwrite what they just applied
                    heightSource: 'user',
                  });
                  setHintDoneRoofs((m) => ({ ...m, [selected.id]: true }));
                }}
                style={{
                  padding: '3px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Apply
              </button>
              <button
                type="button"
                aria-label="Dismiss suggestion"
                onClick={() => setHintDoneRoofs((m) => ({ ...m, [selected.id]: true }))}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  background: 'transparent',
                  color: 'var(--ink-3)',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
            </div>
          )}
          {/* v1 ground surfaces are flat terrain (lib/roof-factory) — no pitch */}
          {selected.roofType !== 'ground' && (
            <SliderRow
              label="Roof Pitch"
              value={selected.pitchDeg}
              // a face of a gable/hip cannot be flat — 0° would leave overlapping
              // coplanar faces where a ridge used to be, not a flat roof
              min={selected.faceGroupId ? 1 : 0}
              max={45}
              step={1}
              unit="°"
              /*
               * `heightSource: 'user'` is what makes the edit STICK.
               *
               * `useRoofMapSync` rewrites any roof not marked 'user' with what
               * the aerial height map reads, on every change to the roofs. Only
               * the height slider ever set the mark — so a user dragging pitch
               * to 0° on a roof the map had read at 13° watched it snap back to
               * 13° before the thumb was released: their edit changed `roofs`,
               * which re-ran the sync, which put the map's pitch back. The
               * type already says the source covers "heightM (and the pitch/
               * facing set with it)", and the sync's own header says "a roof
               * the user edits becomes 'user'". The pitch control just never
               * said it. The facing picker and Google's Apply below have the
               * same fix for the same reason.
               */
              onChange={(v) => patchRoofAndPose(selected.id, { pitchDeg: v, heightSource: 'user' })}
              hint={
                selected.faceGroupId
                  ? 'Slope angle from horizontal — shared by every face of this roof, so it applies to all of them and keeps the ridge level.'
                  : 'Slope angle from horizontal. 0° = flat. Panels flush-mount and inherit this tilt.'
              }
            />
          )}
          {selected.pitchDeg > 0.5 && (
            <div className="field">
              <label>Slopes toward (panels face)</label>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 6 }}>
                Tap the LOW side — the roof slopes down toward it; panels face that way.
                {selected.faceGroupId
                  ? ' This face only — each face of a gable/hip faces its own way, so this is not shared.'
                  : ''}
              </div>
              <SlopeDirectionPicker
                roof={selected}
                // 'user', or the map sync puts its facing back (see Roof Pitch)
                onPick={(az) => patchRoofAndPose(selected.id, { slopeAzimuthDeg: az, heightSource: 'user' })}
              />
            </div>
          )}
          <SliderRow
            label={selected.roofType === 'ground' ? 'Boundary Setback' : 'Edge Setback'}
            value={selected.setbackM}
            min={0}
            max={3}
            step={0.1}
            unit={units === 'imperial' ? 'ft' : 'm'}
            format={(v) => lenValue(v, 1)}
            onChange={(v) => updateRoof(selected.id, { setbackM: v })}
            hint={
              selected.roofType === 'ground'
                ? 'Clear margin kept inside the array-area boundary — no modules in this band.'
                : "Clear margin kept inside the roof edge — panels won't be placed in this band."
            }
          />
          <details style={{ marginBottom: 12 }}>
            <summary style={{ fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              Per-edge setbacks
              {selected.perEdgeSetbacksM && (
                <span style={{ color: 'var(--info)', fontWeight: 500 }}> · customised</span>
              )}
            </summary>
            <div style={{ marginTop: 6 }}>
              {selected.polygon.map((v, i) => {
                const len = dist(v, selected.polygon[(i + 1) % selected.polygon.length]);
                const val = selected.perEdgeSetbacksM?.[i] ?? selected.setbackM;
                return (
                  <div
                    key={i}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12.5 }}
                  >
                    <span style={{ flex: 1, color: 'var(--ink-2)' }}>
                      Edge {i + 1} · {fmtLen(len, 1)}
                    </span>
                    <input
                      type="number"
                      step={0.1}
                      min={0}
                      value={val}
                      aria-label={`Setback for edge ${i + 1} in meters`}
                      style={{ width: 72 }}
                      onChange={(e) => {
                        const base =
                          selected.perEdgeSetbacksM ??
                          selected.polygon.map(() => selected.setbackM);
                        const next = base.map((s, j) =>
                          j === i ? Math.max(0, Number(e.target.value)) : s,
                        );
                        updateRoof(selected.id, { perEdgeSetbacksM: next });
                      }}
                    />
                    <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>m</span>
                  </div>
                );
              })}
              {selected.perEdgeSetbacksM && (
                <button
                  className="chip"
                  style={{ marginTop: 4 }}
                  onClick={() => updateRoof(selected.id, { perEdgeSetbacksM: null })}
                >
                  Reset to uniform
                </button>
              )}
            </div>
          </details>
          {/* a boundary is not a parapet: no wall controls on a ground surface */}
          {selected.roofType !== 'ground' && (
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
            <ToggleRow
              label="Parapet Wall"
              sub="Raised edge around the roof perimeter"
              on={selected.parapet.enabled}
              onChange={(v) =>
                updateRoof(selected.id, { parapet: { ...selected.parapet, enabled: v } })
              }
            />
            {selected.parapet.enabled && (
              <>
                <div className="field">
                  <label>Direction</label>
                  <Seg
                    options={[
                      { value: 'outward', label: 'Outward' },
                      { value: 'inward', label: 'Inward' },
                    ]}
                    value={selected.parapet.direction}
                    onChange={(v) =>
                      updateRoof(selected.id, { parapet: { ...selected.parapet, direction: v } })
                    }
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div className="field">
                    <label>Height (m)</label>
                    <input
                      type="number"
                      step={0.1}
                      value={selected.parapet.heightM}
                      onChange={(e) =>
                        updateRoof(selected.id, {
                          parapet: { ...selected.parapet, heightM: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>Width (m)</label>
                    <input
                      type="number"
                      step={0.05}
                      value={selected.parapet.widthM}
                      onChange={(e) =>
                        updateRoof(selected.id, {
                          parapet: { ...selected.parapet, widthM: Number(e.target.value) },
                        })
                      }
                    />
                  </div>
                </div>
                <ToggleRow
                  label="Auto-skip shared walls"
                  sub="No wall on edges shared with an equal or taller adjacent roof"
                  on={selected.parapet.suppressSharedEdges}
                  onChange={(v) =>
                    updateRoof(selected.id, {
                      parapet: { ...selected.parapet, suppressSharedEdges: v },
                    })
                  }
                />
                <div className="field">
                  <label>Parapet sides</label>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginBottom: 6 }}>
                    Tap a side to remove its wall.
                  </div>
                  <ParapetEdgePicker
                    roof={selected}
                    allRoofs={project.roofs}
                    onToggle={(i) => {
                      const base =
                        selected.parapet.perEdge ?? selected.polygon.map(() => true);
                      const next = base.map((on, j) => (j === i ? !on : on));
                      updateRoof(selected.id, {
                        // all-on collapses back to null (uniform) for tidiness
                        parapet: {
                          ...selected.parapet,
                          perEdge: next.every(Boolean) ? null : next,
                        },
                      });
                    }}
                  />
                </div>
              </>
            )}
          </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

/**
 * Visual parapet side-picker: draws the selected roof (north-up, matching the
 * map) and lets the user tap a side to toggle its wall. Replaces the tedious
 * numeric edge list — the roof shape IS the control.
 */
function ParapetEdgePicker({
  roof,
  allRoofs,
  onToggle,
}: {
  roof: Roof;
  allRoofs: Roof[];
  onToggle: (edgeIndex: number) => void;
}) {
  const { fmtLen } = useUnits();
  const W = 300;
  const H = 150;
  const pad = 18;
  const xs = roof.polygon.map((p) => p.x);
  const ys = roof.polygon.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);
  const s = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  // centre the shape in the box; flip Y so north (larger y) is at the top
  const offX = (W - spanX * s) / 2;
  const offY = (H - spanY * s) / 2;
  const toPx = (p: XY) => ({
    x: offX + (p.x - minX) * s,
    y: offY + (maxY - p.y) * s,
  });
  const px = roof.polygon.map(toPx);
  const eff = effectiveParapetEdges(roof, allRoofs);

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', background: 'var(--paper-2)', borderRadius: 8 }}
        role="group"
        aria-label="Parapet sides — tap a side to toggle its wall"
      >
        {/* roof surface */}
        <polygon
          points={px.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="var(--paper-3)"
          stroke="none"
        />
        {/* north marker */}
        <g transform={`translate(${W - 16},16)`} opacity={0.55}>
          <line x1={0} y1={6} x2={0} y2={-6} stroke="var(--ink-3)" strokeWidth={1.2} />
          <path d="M0,-7 L2.5,-3 L-2.5,-3 Z" fill="var(--ink-3)" />
          <text x={0} y={16} textAnchor="middle" fontSize={8} fill="var(--ink-3)">N</text>
        </g>
        {roof.polygon.map((_, i) => {
          const a = px[i];
          const b = px[(i + 1) % px.length];
          const e = eff[i];
          const len = dist(roof.polygon[i], roof.polygon[(i + 1) % roof.polygon.length]);
          const stroke = e.suppressed
            ? 'var(--ink-3)'
            : e.enabled
              ? 'var(--info)'
              : 'var(--ink-3)';
          const dash = e.suppressed ? '2 3' : e.enabled ? undefined : '5 4';
          const width = e.enabled && !e.suppressed ? 4 : 1.6;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          return (
            <g key={i}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={stroke}
                strokeWidth={width}
                strokeDasharray={dash}
                strokeLinecap="round"
              />
              {!e.suppressed && (
                <circle cx={mid.x} cy={mid.y} r={2.6} fill={e.enabled ? 'var(--info)' : 'var(--ink-3)'} />
              )}
              {/* fat transparent hit target */}
              {!e.suppressed && (
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke="transparent"
                  strokeWidth={16}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onToggle(i)}
                >
                  <title>
                    {`${e.enabled ? 'Remove' : 'Add'} wall · ${fmtLen(len, 1)}`}
                  </title>
                </line>
              )}
              {e.suppressed && (
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={16}>
                  <title>{`Shared with ${e.sharedWith} — wall handled by that roof`}</title>
                </line>
              )}
            </g>
          );
        })}
      </svg>
      {/* legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 11, color: 'var(--ink-3)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 3, background: 'var(--info)', borderRadius: 2 }} /> Wall
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 0, borderTop: '1.6px dashed var(--ink-3)' }} /> No wall
        </span>
        {eff.some((e) => e.suppressed) && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 0, borderTop: '1.6px dotted var(--ink-3)' }} /> Shared
          </span>
        )}
      </div>
    </div>
  );
}

const COMPASS_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/**
 * Visual slope-direction picker: draws the roof's own shape (north-up) and the
 * user taps the LOW side — the edge the roof slopes down toward. Sets the
 * azimuth to that edge's exact outward direction, which beats 45° compass
 * chips for rotated buildings and needs zero mental mapping.
 */
function SlopeDirectionPicker({
  roof,
  onPick,
}: {
  roof: Roof;
  onPick: (azimuthDeg: number) => void;
}) {
  const { fmtLen } = useUnits();
  const W = 300;
  const H = 150;
  const pad = 20;
  const xs = roof.polygon.map((p) => p.x);
  const ys = roof.polygon.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-3, maxX - minX);
  const spanY = Math.max(1e-3, maxY - minY);
  const s = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
  const offX = (W - spanX * s) / 2;
  const offY = (H - spanY * s) / 2;
  const toPx = (p: XY) => ({
    x: offX + (p.x - minX) * s,
    y: offY + (maxY - p.y) * s,
  });
  const px = roof.polygon.map(toPx);
  const ccw = isCCW(roof.polygon);
  const currentAz = roof.slopeAzimuthDeg ?? 180;

  /** Outward-normal compass azimuth of edge i (0=N, 90=E). */
  const edgeAz = (i: number): number => {
    const a = roof.polygon[i];
    const b = roof.polygon[(i + 1) % roof.polygon.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (ccw ? dy : -dy) / len;
    const oy = (ccw ? -dx : dx) / len;
    return (Math.round(((Math.atan2(ox, oy) * 180) / Math.PI + 360) * 10) / 10) % 360;
  };
  const angDiff = (a: number, b: number) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  };

  // downslope arrow from the centroid (screen coords: north is up → -cos)
  const c = toPx(polygonCentroid(roof.polygon));
  const arrowLen = Math.min(W, H) / 3.6;
  const ax = Math.sin((currentAz * Math.PI) / 180);
  const ay = -Math.cos((currentAz * Math.PI) / 180);
  const tip = { x: c.x + ax * arrowLen, y: c.y + ay * arrowLen };
  const compass = COMPASS_NAMES[Math.round(((currentAz % 360) + 360) % 360 / 45) % 8];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: 'block', background: 'var(--paper-2)', borderRadius: 8 }}
        role="group"
        aria-label="Slope direction — tap the side the roof slopes down toward"
      >
        <polygon
          points={px.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="var(--paper-3)"
          stroke="none"
        />
        {/* north marker */}
        <g transform={`translate(${W - 16},16)`} opacity={0.55}>
          <line x1={0} y1={6} x2={0} y2={-6} stroke="var(--ink-3)" strokeWidth={1.2} />
          <path d="M0,-7 L2.5,-3 L-2.5,-3 Z" fill="var(--ink-3)" />
          <text x={0} y={16} textAnchor="middle" fontSize={8} fill="var(--ink-3)">N</text>
        </g>
        {roof.polygon.map((v, i) => {
          const a = px[i];
          const b = px[(i + 1) % px.length];
          const az = edgeAz(i);
          const isEave = angDiff(az, currentAz) <= 10;
          const len = dist(v, roof.polygon[(i + 1) % roof.polygon.length]);
          return (
            <g key={i}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={isEave ? 'var(--info)' : 'var(--ink-3)'}
                strokeWidth={isEave ? 4 : 1.6}
                strokeLinecap="round"
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="transparent"
                strokeWidth={16}
                style={{ cursor: 'pointer' }}
                onClick={() => onPick(az)}
              >
                <title>{`Slope down toward this side · ${fmtLen(len, 1)}`}</title>
              </line>
            </g>
          );
        })}
        {/* downslope arrow */}
        <g pointerEvents="none">
          <line
            x1={c.x}
            y1={c.y}
            x2={tip.x}
            y2={tip.y}
            stroke="var(--info)"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
          <path
            d={`M ${tip.x} ${tip.y} L ${tip.x - ax * 8 - -ay * 5} ${tip.y - ay * 8 - ax * 5} L ${tip.x - ax * 8 + -ay * 5} ${tip.y - ay * 8 + ax * 5} Z`}
            fill="var(--info)"
          />
          <circle cx={c.x} cy={c.y} r={2.4} fill="var(--info)" />
        </g>
      </svg>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 5 }}>
        Slopes toward <b style={{ color: 'var(--ink)' }}>{compass}</b> · {Math.round(currentAz)}°
        <span style={{ marginLeft: 10 }}>South-facing is best in the northern hemisphere.</span>
      </div>
    </div>
  );
}

// ─── Canvas helpers ──────────────────────────────────────────────────────────

function CanvasMetrics({
  onChange,
}: {
  onChange: React.Dispatch<React.SetStateAction<number>>;
}) {
  const frame = useCanvasFrame();
  useEffect(() => {
    onChange((current) =>
      Math.abs(current - frame.pxPerM) > 0.001 ? frame.pxPerM : current,
    );
  }, [frame.pxPerM, onChange]);
  return null;
}

/**
 * Label anchor for edge i: midpoint pushed outward, away from the centroid.
 * The offset is divided by zoom so the label keeps a constant SCREEN distance
 * from the edge instead of drifting away when zooming in.
 */
function edgeAnchor(frame: CanvasFrame, poly: XY[], i: number, offsetPx = 15): XY {
  const a = frame.toPx(poly[i]);
  const b = frame.toPx(poly[(i + 1) % poly.length]);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const c = {
    x: poly.reduce((s, p) => s + frame.toPx(p).x, 0) / poly.length,
    y: poly.reduce((s, p) => s + frame.toPx(p).y, 0) / poly.length,
  };
  if ((mid.x - c.x) * nx + (mid.y - c.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const off = offsetPx / frame.zoom;
  return { x: mid.x + nx * off, y: mid.y + ny * off };
}

/** Small corner marks at ~90° vertices (visual confirmation while tracing). */
function RightAngleMarks({ poly, close = true }: { poly: XY[]; close?: boolean }) {
  const frame = useCanvasFrame();
  const n = poly.length;
  if (n < 3) return null;
  const markM = 10 / frame.pxPerM; // 10 screen px expressed in meters
  const start = close ? 0 : 1;
  const end = close ? n : n - 1;
  const marks: string[] = [];
  for (let i = start; i < end; i++) {
    const p = poly[i];
    const a = poly[(i - 1 + n) % n];
    const b = poly[(i + 1) % n];
    const ua = { x: a.x - p.x, y: a.y - p.y };
    const ub = { x: b.x - p.x, y: b.y - p.y };
    const la = Math.hypot(ua.x, ua.y);
    const lb = Math.hypot(ub.x, ub.y);
    if (la < markM * 1.5 || lb < markM * 1.5) continue;
    const u = { x: ua.x / la, y: ua.y / la };
    const v = { x: ub.x / lb, y: ub.y / lb };
    const angle = (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180) / Math.PI;
    if (Math.abs(angle - 90) > 4) continue;
    const p1 = frame.toPx({ x: p.x + u.x * markM, y: p.y + u.y * markM });
    const p2 = frame.toPx({
      x: p.x + (u.x + v.x) * markM,
      y: p.y + (u.y + v.y) * markM,
    });
    const p3 = frame.toPx({ x: p.x + v.x * markM, y: p.y + v.y * markM });
    marks.push(`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y}`);
  }
  if (marks.length === 0) return null;
  return (
    <path
      d={marks.join(' ')}
      fill="none"
      stroke="#93c5fd"
      strokeWidth={1.5 / frame.zoom}
      aria-hidden
    />
  );
}

function RoofLayer({
  roofs,
  selectedId,
  lockedIds,
  selectedVertex,
  editingEdge,
  fmt,
  showMeasurements,
  onVertexDown,
  onBodyDown,
  onRotateDown,
  onInsert,
  onLabelClick,
}: {
  roofs: Roof[];
  selectedId: string | null;
  lockedIds: ReadonlySet<string>;
  selectedVertex: VertexRef | null;
  editingEdge: EdgeEdit | null;
  fmt: (m: number) => string;
  showMeasurements: boolean;
  onVertexDown: (roofId: string, i: number, grabOffset: XY) => void;
  onBodyDown: (roofId: string, downCursor: XY) => void;
  onRotateDown: (roofId: string, downCursor: XY) => void;
  onInsert: (roofId: string, edgeIndex: number) => void;
  onLabelClick: (roofId: string, i: number) => void;
}) {
  const frame = useCanvasFrame();
  // Cache the (polygon-clipping) setback inset per roof, keyed on the polygon
  // reference + setback signature. updateRoof only replaces the changed roof's
  // polygon array, so during a drag every OTHER roof hits the cache instead of
  // re-running the clipper at 60 Hz. WeakMap lets stale polygons be GC'd.
  const insetCache = useRef(new WeakMap<XY[], { key: string; regions: XY[][] }>());
  const getInset = (r: Roof): XY[][] => {
    const insets = r.perEdgeSetbacksM ?? r.polygon.map(() => r.setbackM);
    const key = insets.join(',');
    const hit = insetCache.current.get(r.polygon);
    if (hit && hit.key === key) return hit.regions;
    const regions = insetPolygonRobust(r.polygon, insets);
    insetCache.current.set(r.polygon, { key, regions });
    return regions;
  };
  // paint low → high so stacked roofs (mumty) sit visually on top; the
  // selected roof always paints last so its handles stay reachable
  const orderedRoofs = [
    ...[...roofs.filter((r) => r.id !== selectedId)].sort((a, b) => a.heightM - b.heightM),
    ...roofs.filter((r) => r.id === selectedId),
  ];
  const pointerToMeters = (e: React.PointerEvent<SVGElement>): XY => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return frame.toM({
      x: ((e.clientX - rect.left) / rect.width) * frame.sizePx,
      y: ((e.clientY - rect.top) / rect.height) * frame.sizePx,
    });
  };
  return (
    <>
      {orderedRoofs.map((r) => {
        const sel = r.id === selectedId;
        const locked = lockedIds.has(r.id);
        // colour by identity index (not paint order) so it's stable per roof
        const color = roofColor(roofs.findIndex((x) => x.id === r.id));
        const insetRegions = getInset(r);
        const centroid = frame.toPx(polygonCentroid(r.polygon));
        return (
          <g key={r.id} style={locked ? { filter: 'saturate(0.25)', opacity: 0.85 } : undefined}>
            {/* The body is deliberately inert. It used to capture the pointer
                whenever its roof was selected — and finishRoof() selects the
                roof it has just traced — so the very next one-finger drag moved
                the building instead of panning the map, with no way back. Moving
                is now an explicit grab on the move handle below; a press on the
                body falls through to SatCanvas, which pans (DESIGN-SYSTEM §7.2:
                one-finger drag on the canvas pans, drag a HANDLE moves). */}
            <path
              d={polyPath(frame, r.polygon)}
              fill={roofRgba(color, sel ? 0.45 : 0.26)}
              stroke={sel ? lightenHex(color, 0.4) : color}
              strokeWidth={(sel ? 2.4 : 1.3) / frame.zoom}
            />
            {insetRegions.map((reg, ri) => (
              <path
                key={ri}
                d={polyPath(frame, reg)}
                fill="none"
                stroke="#f87171"
                strokeWidth={1 / frame.zoom}
                strokeDasharray={`${5 / frame.zoom} ${3.5 / frame.zoom}`}
              />
            ))}
            {sel && <RightAngleMarks poly={r.polygon} />}
            {(sel || showMeasurements) && (
              <EdgeLabels
                poly={r.polygon}
                fmt={fmt}
                skip={editingEdge?.roofId === r.id ? editingEdge.i : undefined}
                // labels are editable only on the selected roof; on the others
                // (measurement overlay) they're display-only
                onLabelClick={sel ? (i) => onLabelClick(r.id, i) : undefined}
              />
            )}
            {sel &&
              !locked &&
              (() => {
                const pts = r.polygon.map((p) => frame.toPx(p));
                const topY = Math.min(...pts.map((p) => p.y));
                const anchor = { x: centroid.x, y: topY };
                const handle = { x: centroid.x, y: topY - 30 / frame.zoom };
                return (
                  <g>
                    <line
                      x1={anchor.x}
                      y1={anchor.y}
                      x2={handle.x}
                      y2={handle.y}
                      stroke="#f59e0b"
                      strokeWidth={1.4 / frame.zoom}
                      strokeDasharray={`${3 / frame.zoom} ${3 / frame.zoom}`}
                    />
                    <circle
                      cx={handle.x}
                      cy={handle.y}
                      r={9 / frame.zoom}
                      fill="#fff"
                      stroke="#f59e0b"
                      strokeWidth={1.6 / frame.zoom}
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        onRotateDown(r.id, pointerToMeters(e));
                      }}
                    >
                      <title>Drag to rotate this roof · hold Shift for 15° steps</title>
                    </circle>
                    <RotateCw
                      x={handle.x - 5 / frame.zoom}
                      y={handle.y - 5 / frame.zoom}
                      width={10 / frame.zoom}
                      height={10 / frame.zoom}
                      color="#f59e0b"
                      style={{ pointerEvents: 'none' }}
                    />
                    {/* move handle — the roof's only move affordance, sat on
                        the centroid so it reads as "grab the whole shape".
                        The hit circle is 44px (N2); the visible disc is the
                        same size as its rotate twin so the pair reads as one
                        family. Every radius is /zoom, so both stay constant
                        on screen as the canvas scales. */}
                    <circle
                      cx={centroid.x}
                      cy={centroid.y}
                      r={22 / frame.zoom}
                      fill="transparent"
                      style={{ cursor: 'move' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        onBodyDown(r.id, pointerToMeters(e));
                      }}
                    >
                      <title>Drag to move this roof</title>
                    </circle>
                    <circle
                      cx={centroid.x}
                      cy={centroid.y}
                      r={9 / frame.zoom}
                      fill="#fff"
                      stroke="#f59e0b"
                      strokeWidth={1.6 / frame.zoom}
                      style={{ pointerEvents: 'none' }}
                    />
                    <Move
                      x={centroid.x - 5 / frame.zoom}
                      y={centroid.y - 5 / frame.zoom}
                      width={10 / frame.zoom}
                      height={10 / frame.zoom}
                      color="#f59e0b"
                      style={{ pointerEvents: 'none' }}
                    />
                  </g>
                );
              })()}
            {locked && (
              <g
                aria-hidden
                transform={`translate(${centroid.x}, ${centroid.y}) scale(${1 / frame.zoom})`}
              >
                <circle r={12} fill="rgba(15,23,42,0.72)" />
                <Lock x={-7} y={-7} width={14} height={14} color="#f8fafc" />
              </g>
            )}
            {sel &&
              !locked &&
              r.polygon.map((p, i) => {
                const b = r.polygon[(i + 1) % r.polygon.length];
                const mid = frame.toPx({ x: (p.x + b.x) / 2, y: (p.y + b.y) / 2 });
                return (
                  <g key={`m${i}`}>
                    <circle
                      cx={mid.x}
                      cy={mid.y}
                      r={8 / frame.zoom}
                      fill="transparent"
                      style={{ cursor: 'copy' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        onInsert(r.id, i);
                      }}
                    >
                      <title>Insert point</title>
                    </circle>
                    <circle
                      cx={mid.x}
                      cy={mid.y}
                      r={2.5 / frame.zoom}
                      fill="rgba(255,255,255,0.75)"
                      stroke="#2563eb"
                      strokeWidth={1 / frame.zoom}
                      pointerEvents="none"
                    />
                  </g>
                );
              })}
            {sel &&
              !locked &&
              r.polygon.map((p, i) => {
                const px = frame.toPx(p);
                const isSel =
                  selectedVertex?.roofId === r.id && selectedVertex.i === i;
                return (
                  <g key={`v${i}`}>
                    <circle
                      cx={px.x}
                      cy={px.y}
                      r={9 / frame.zoom}
                      fill="transparent"
                      style={{ cursor: 'grab' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const cursor = pointerToMeters(e);
                        onVertexDown(r.id, i, { x: p.x - cursor.x, y: p.y - cursor.y });
                      }}
                    >
                      <title>Drag to move · click to select</title>
                    </circle>
                    <circle
                      cx={px.x}
                      cy={px.y}
                      r={(isSel ? 4.5 : 3.5) / frame.zoom}
                      fill={isSel ? 'var(--brand)' : '#fff'}
                      stroke={isSel ? '#fff' : '#2563eb'}
                      strokeWidth={1.25 / frame.zoom}
                      pointerEvents="none"
                    />
                  </g>
                );
              })}
          </g>
        );
      })}
    </>
  );
}

/** a corner is called square when it is this close to 90° (degrees) */
const SQUARE_TOLERANCE_DEG = 0.5;

/**
 * Live angle readout at the corner `b`, between the edges b→a and b→c.
 *
 * The alignment rays show you WHERE square is; they cannot tell you how far
 * off you are, and by eye a 4° error looks square at trace zoom — on a 12 m
 * edge that is 84 cm of phantom roof, which then propagates into area, module
 * count and the quote. A number closes that gap: you nudge until it reads
 * 90.0°, with no snapping and nothing forced. It also makes an ortho lock
 * self-evident, because a locked corner reads exactly 90.0°.
 *
 * Stated as three loose points rather than "the end of a polyline" so the SAME
 * readout serves both moments a corner is decided: the one being drawn (a =
 * the last placed vertex's predecessor, c = the cursor) and the one being
 * dragged on a finished roof (a and c = the dragged vertex's two neighbours).
 * A corner adjusted afterwards is no less load-bearing than one first placed.
 *
 * The chip sits inside the wedge, on the angle bisector, at a constant screen
 * distance — the one placement that stays legible at every zoom and can never
 * be mistaken for a label belonging to an edge.
 */
function CornerAngle({
  a,
  b,
  c,
  avoidAbove = false,
}: {
  a: XY;
  b: XY;
  c: XY;
  /** a toolbar sits directly above the vertex — never put the chip under it */
  avoidAbove?: boolean;
}) {
  const frame = useCanvasFrame();
  const pp = frame.toPx(b);
  const pa = frame.toPx(a);
  const ph = frame.toPx(c);
  const ua = { x: pa.x - pp.x, y: pa.y - pp.y };
  const uh = { x: ph.x - pp.x, y: ph.y - pp.y };
  const la = Math.hypot(ua.x, ua.y);
  const lh = Math.hypot(uh.x, uh.y);
  // both legs must be long enough ON SCREEN for an angle to mean anything —
  // below that the chip is noise sitting on top of the vertex it describes
  const MIN_LEG_PX = 26;
  if (la * frame.zoom < MIN_LEG_PX || lh * frame.zoom < MIN_LEG_PX) return null;
  const u = { x: ua.x / la, y: ua.y / la };
  const v = { x: uh.x / lh, y: uh.y / lh };
  const deg = (Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180) / Math.PI;
  // bisector points into the wedge; at a straight 180° corner it collapses, so
  // fall back to the perpendicular rather than dividing by ~0
  let bx = u.x + v.x;
  let by = u.y + v.y;
  const lb = Math.hypot(bx, by);
  if (lb < 1e-3) {
    bx = -u.y;
    by = u.x;
  } else {
    bx /= lb;
    by /= lb;
  }
  /*
   * Once released, a corner is SELECTED and its Delete/Close toolbar opens
   * centred just above it (VertexContextBar). The chip rides the bisector 32 px
   * out, so on any corner whose wedge opens upward it would land under that
   * toolbar — the number the user let go to read, hidden by the buttons. So when
   * the toolbar is up and the bisector points up (screen y < 0), the chip goes
   * to the OUTSIDE of the corner instead: same vertex, same distance, clear air.
   */
  if (avoidAbove && by < -0.3) {
    bx = -bx;
    by = -by;
  }
  const square = Math.abs(deg - 90) <= SQUARE_TOLERANCE_DEG;
  const inv = 1 / frame.zoom;
  const OFFSET = 32; // screen px from the vertex, along the bisector
  return (
    <g
      transform={`translate(${pp.x}, ${pp.y}) scale(${inv}) translate(${bx * OFFSET}, ${by * OFFSET})`}
      aria-hidden
    >
      <rect
        x={-21}
        y={-8}
        width={42}
        height={16}
        rx={4}
        fill={square ? 'rgba(22,163,74,0.94)' : 'rgba(15,23,42,0.88)'}
        stroke={square ? 'rgba(255,255,255,0.45)' : 'none'}
      />
      <text x={0} y={3.5} textAnchor="middle" fill="#fff" fontSize={9} fontWeight={650}>
        {deg.toFixed(1)}°
      </text>
    </g>
  );
}

function DrawingLayer({
  points,
  hover,
  fmt,
  guides,
}: {
  points: XY[];
  hover: XY | null;
  fmt: (m: number) => string;
  guides: SnapGuide[];
}) {
  const frame = useCanvasFrame();
  const inv = 1 / frame.zoom;
  const all = hover && points.length > 0 ? [...points, hover] : points;
  const nearFirst = !!hover && points.length >= 3 && dist(hover, points[0]) < 1.2;
  const hoverPx = hover ? frame.toPx(hover) : null;
  return (
    <g>
      {/* Alignment guides — long dashed rays through the snap anchor. A LOCKED
          guide is holding the point on the ray, so it is drawn solid-bright; an
          unlocked one is only telling you where square is, so it is faint and
          finely dashed. The user must be able to tell those apart at a glance,
          or a hint reads as a constraint that has silently moved their vertex. */}
      {guides.map((g, i) => {
        const rad = (g.deg * Math.PI) / 180;
        const a = frame.toPx({
          x: g.anchor.x - Math.cos(rad) * 400,
          y: g.anchor.y - Math.sin(rad) * 400,
        });
        const b = frame.toPx({
          x: g.anchor.x + Math.cos(rad) * 400,
          y: g.anchor.y + Math.sin(rad) * 400,
        });
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#22d3ee"
            strokeWidth={(g.locked ? 1.2 : 1) * inv}
            strokeDasharray={
              g.locked ? `${6 * inv} ${5 * inv}` : `${3 * inv} ${5 * inv}`
            }
            opacity={g.locked ? 0.85 : 0.55}
            aria-hidden
          />
        );
      })}
      {all.length >= 2 && (
        <path
          d={polyPath(frame, all, false)}
          fill="rgba(59,130,246,0.12)"
          stroke="#60a5fa"
          strokeWidth={1.1 * inv}
          strokeDasharray={`${5 * inv} ${3.5 * inv}`}
        />
      )}
      <RightAngleMarks poly={all} close={false} />
      {points.map((p, i) => {
        const px = frame.toPx(p);
        const first = i === 0;
        return (
          <circle
            key={i}
            cx={px.x}
            cy={px.y}
            r={(first ? (nearFirst ? 5 : 4) : 2.5) * inv}
            fill={first ? '#22c55e' : '#fff'}
            stroke={first && nearFirst ? '#fff' : '#2563eb'}
            strokeWidth={1.2 * inv}
          />
        );
      })}
      {/* crosshair at the (snapped) cursor position */}
      {hoverPx && (
        <g stroke="#e2e8f0" strokeWidth={1.2 * inv} opacity={0.9} aria-hidden>
          <line x1={hoverPx.x - 8 * inv} y1={hoverPx.y} x2={hoverPx.x + 8 * inv} y2={hoverPx.y} />
          <line x1={hoverPx.x} y1={hoverPx.y - 8 * inv} x2={hoverPx.x} y2={hoverPx.y + 8 * inv} />
        </g>
      )}
      {all.length >= 2 && <EdgeLabels poly={all} fmt={fmt} close={false} />}
      {hover && points.length >= 2 && (
        <CornerAngle a={points[points.length - 2]} b={points[points.length - 1]} c={hover} />
      )}
    </g>
  );
}

/**
 * HTML overlay pinned to a canvas point. Rendered via <foreignObject> so it
 * pans with the map; counter-scaled by 1/zoom to keep a constant screen size.
 */
function CanvasOverlay({
  at,
  transform,
  children,
}: {
  at: XY; // px coords (frame space)
  /** e.g. 'translate(-50%, -50%)' — applied before the counter-scale */
  transform: string;
  children: React.ReactNode;
}) {
  const frame = useCanvasFrame();
  return (
    <foreignObject x={at.x} y={at.y} width={1} height={1} style={{ overflow: 'visible' }}>
      <div
        style={{
          width: 'max-content',
          transform: `scale(${1 / frame.zoom}) ${transform}`,
          transformOrigin: '0 0',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </foreignObject>
  );
}

function VertexContextBar({
  at,
  onDelete,
  onClose,
}: {
  at: XY; // meters
  onDelete: () => void;
  onClose: () => void;
}) {
  const frame = useCanvasFrame();
  return (
    <CanvasOverlay at={frame.toPx(at)} transform="translate(-50%, calc(-100% - 14px))">
      <div className="context-bar" style={{ position: 'static' }} role="toolbar" aria-label="Point actions">
        <button
          className="tool-btn"
          aria-label="Delete point"
          data-tip={'Delete point\nDel'}
          onClick={onDelete}
        >
          <Trash2 />
        </button>
        <div className="sep" />
        <button className="tool-btn" aria-label="Close" data-tip="Close" onClick={onClose}>
          <X />
        </button>
      </div>
    </CanvasOverlay>
  );
}

function EdgeLengthInput({
  poly,
  i,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  poly: XY[];
  i: number;
  value: string;
  onChange: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const frame = useCanvasFrame();
  return (
    <CanvasOverlay at={edgeAnchor(frame, poly, i)} transform="translate(-50%, -50%)">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: 'rgba(20,24,30,0.94)',
          border: '1px solid var(--editor-line)',
          borderRadius: 8,
          padding: '5px 9px',
          boxShadow: 'var(--shadow-2)',
        }}
      >
        <input
          autoFocus
          value={value}
          inputMode="decimal"
          aria-label="Edge length in meters"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit();
            if (e.key === 'Escape') {
              e.stopPropagation();
              onCancel();
            }
          }}
          onBlur={onCancel}
          style={{
            width: 56,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#fff',
            fontSize: 12.5,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--editor-ink-2)' }}>m</span>
      </div>
    </CanvasOverlay>
  );
}

// ─── Known-distance calibration dialog ──────────────────────────────────────

function CalibrateDialog({
  measuredM,
  project,
  onClose,
  onApply,
}: {
  measuredM: number;
  project: Project;
  onClose: () => void;
  onApply: (knownM: number, northOffsetDeg: number) => void;
}) {
  const [knownText, setKnownText] = useState(measuredM.toFixed(2));
  const [northText, setNorthText] = useState(String(project.calibration.northOffsetDeg));
  const knownM = Number(knownText);
  const northOffsetDeg = Number(northText);
  const k = knownM > 0.05 ? knownM / measuredM : NaN;
  const valid =
    Number.isFinite(knownM) &&
    knownM > 0.05 &&
    Number.isFinite(northOffsetDeg) &&
    Math.abs(northOffsetDeg) <= 45 &&
    Number.isFinite(k) &&
    k > 0.5 &&
    k < 2;

  return (
    <Dialog
      title="Calibrate from a known distance"
      actions={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => onApply(knownM, northOffsetDeg)}>
            Apply calibration
          </button>
        </>
      }
    >
      <p style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
        Satellite imagery can be a few percent off. Enter the REAL length of the line you just
        measured (a compound wall, a terrace edge you have taped on site) and every drawn
        shape rescales to match — areas, capacity, energy and BOM all recalculate.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field">
          <label>Measured on screen</label>
          <input value={`${measuredM.toFixed(2)} m`} disabled />
        </div>
        <div className="field">
          <label>Actual distance (m)</label>
          <input
            autoFocus
            inputMode="decimal"
            value={knownText}
            onChange={(e) => setKnownText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      </div>
      {Number.isFinite(k) && (
        <p style={{ fontSize: 12, color: valid ? 'var(--ink-2)' : '#b45309' }}>
          Scale correction: ×{k.toFixed(4)}{' '}
          {valid
            ? `(${k > 1 ? '+' : ''}${((k - 1) * 100).toFixed(1)}%)`
            : '— outside the plausible ±50% range; re-measure or check the value'}
        </p>
      )}
      <div className="field" style={{ marginTop: 6 }}>
        <label>North offset (°, expert — 0 = imagery is north-up)</label>
        <input
          inputMode="decimal"
          value={northText}
          onChange={(e) => setNorthText(e.target.value)}
        />
      </div>
      <p style={{ fontSize: 11, color: 'var(--ink-3)' }}>
        Positive = true north lies clockwise of the image top. Affects sun position, shadows
        and the heatmap; leave 0 unless a site compass reading says otherwise.
      </p>
    </Dialog>
  );
}
