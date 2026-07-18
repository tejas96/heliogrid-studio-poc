// ─── Step 6: Panel layout editor — tools, selection, stringing, safety ──────
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertTriangle,
  Box,
  Cable,
  Plug,
  CheckCircle2,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Eraser,
  Ban,
  Fence,
  Footprints,
  Grid3x3,
  Hand,
  Info,
  Lock,
  LockOpen,
  ListChecks,
  MousePointer2,
  PencilRuler,
  PlugZap,
  Plus,
  Power,
  Redo2,
  RotateCcw,
  RotateCw,
  Settings2,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Wand2,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { useActiveProject, useProjectPatch, useStore } from '../store/store';
import { SatCanvas, type SatCanvasHandle, polyPath, useCanvasFrame } from '../components/SatCanvas';
import { MeasureOverlay, useMeasure } from '../components/MeasureTool';
import { Dialog, EmptyState, OptionCard, Sheet } from '../components/ui';
import { ObstructionLayer } from './Step3Obstructions';
import type {
  ArraySegment,
  PlacedPanel,
  StringDef,
  Walkway,
  SafetyRail,
  LightningArrester,
  Keepout,
  XY,
} from '../types';
import {
  genId,
  insetPolygonRobust,
  pointInPolygon,
  pointSegDist,
  rectCorners,
} from '../lib/geo';
import {
  autoFillRoof,
  defaultPanelPose,
  fillRoofAsSegment,
  nextSegmentLabel,
  panelCornersOnRoof,
  panelFitsAt,
  snapPanelCenter,
} from '../lib/layout';
import { layoutIssues } from '../lib/drc';
import {
  computeHeatmap,
  heatColor,
  type HeatCancel,
  type HeatmapResult,
} from '../lib/solar-heatmap';
import { gcr, shadowFreePitchM } from '../lib/spacing';
import { shadingFingerprint } from '../lib/fingerprints';
import {
  classifySelection,
  duplicateSegment,
  groupIntoTable,
  growCandidates,
  growSegment,
  reindexAll,
  reindexSegment,
  respaceSegment,
  setSegmentAzimuth,
  setSegmentProfile,
  setSegmentRacking,
  setSegmentStructureFields,
  setSegmentTilt,
  STRUCTURE_PROFILES,
  type GrowAxis,
  type GrowSide,
  type SelectionShape,
} from '../lib/segment-ops';
import { cascadeDeletePanels } from '../lib/cascade';
import { resolveRules } from '../data/rules/india';
import { pickRoofAt } from '../lib/roof-topology';
import { estimateDcCableM, stringSizing, validateSystem, vocAtTemp } from '../lib/stringing';
import { autoRouteAc, autoRouteStrings, dcCableFromRoutes, routeIssues } from '../lib/routing';
import { autoDesign } from '../lib/auto-design';
import { resolveDesignTemps } from '../lib/electrical/temps';
import { autoStringPlan } from '../lib/electrical/autostring';
import { applyStructChoice, reconcileBridgedPanels, type StructChoice } from '../lib/structure-edit';
import {
  buildStructure,
  resolveRacking,
  STRUCTURE_DISCLAIMER,
  validateStructure,
} from '../lib/structure';
import { StructurePreview } from '../components/StructurePreview';
import { registerAllAnalyzers } from '../lib/insights/analyzers';
import { memoizedInsights } from '../lib/insights/registry';

registerAllAnalyzers();
import { movePanels, nudgeDelta } from '../lib/panel-move';
import { Scene3D } from '../three/Scene3D';

type Tool =
  | 'select'
  | 'panels'
  | 'walkway'
  | 'rail'
  | 'arrester'
  | 'inverter'
  | 'keepout'
  | 'erase';

const PLAN_LIMIT_KW = resolveRules().defaults.planLimitKw; // freemium capacity gate

const MUTATING_TOOLS: Tool[] = [
  'panels',
  'walkway',
  'rail',
  'arrester',
  'inverter',
  'keepout',
  'erase',
];

const TOOL_HINTS: Record<Exclude<Tool, 'select' | 'walkway'>, string> = {
  panels: 'Click to add one panel · drag to fill an area (obstacles auto-avoided)',
  erase: 'Click a panel to remove it',
  rail: 'Drag along a roof edge to add a safety rail',
  arrester: 'Click to place a lightning arrester (2.0 m)',
  inverter: 'Click near a roof edge to mount the inverter',
  keepout: 'Drag a no-build zone (fire lane, access, reserved area) · click one to remove it',
};

const WALKWAY_WIDTHS_MM = [600, 800, 1000];

type Notice = { kind: 'lock' | 'ok' | 'info'; text: string };

function RailBtn({
  icon,
  label,
  tip,
  side = 'right',
  active = false,
  danger = false,
  accent = false,
  disabled = false,
  pressed,
  count = 0,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  tip: string;
  side?: 'right' | 'left';
  active?: boolean;
  danger?: boolean;
  accent?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  count?: number;
  onClick: () => void;
}) {
  const stateCls = active ? (danger ? 'danger-on' : accent ? 'accent' : 'on') : '';
  const tipSide = side === 'right' ? { 'data-tip-right': '' } : { 'data-tip-left': '' };
  return (
    <button
      className={`tool-btn ${stateCls}`}
      data-tip={tip}
      {...tipSide}
      aria-label={label}
      aria-pressed={pressed}
      aria-disabled={disabled || undefined}
      style={disabled ? { opacity: 0.4 } : undefined}
      onClick={onClick}
    >
      {icon}
      {count > 0 && <span className="count">{count}</span>}
    </button>
  );
}

export function Step6Editor() {
  const project = useActiveProject()!;
  const patch = useProjectPatch();
  const { state, dispatch } = useStore();
  const loc = project.location!;
  const spec = project.components.panel!;
  const inverter = project.components.inverter!;

  const [tool, setTool] = useState<Tool>('select');
  const [heatmap, setHeatmap] = useState(false);
  const [heatMonth, setHeatMonth] = useState(new Date().getMonth());
  const [heatResult, setHeatResult] = useState<HeatmapResult | null>(null);
  const heatCacheRef = useRef<{ fp: string; res: HeatmapResult } | null>(null);
  const [showStrings, setShowStrings] = useState(true);
  const [show3D, setShow3D] = useState(false);
  const [locked, setLocked] = useState(false);
  const [confirmPlace, setConfirmPlace] = useState(false);
  const [whySheet, setWhySheet] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [stringSheet, setStringSheet] = useState(false);
  const [stringInfo, setStringInfo] = useState(false);
  const [issuesSheet, setIssuesSheet] = useState(false);
  const [manualString, setManualString] = useState<string[] | null>(null);
  // The inverter tool places TWO different things. A 15th rail button is not an
  // option — the rail already overflows its own column (that is exactly how the
  // 3D pill came to cover "Mount inverter"), so the sub-mode lives in the tool's
  // own hint bar, the pattern manual-stringing already uses.
  const [placeKind, setPlaceKind] = useState<'inverter' | 'meter'>('inverter');
  // §H: the router's corners are draggable ON the route. Live position is LOCAL
  // (like dragLine/marquee) — the store is written once, on release, so a drag
  // is ONE undo step rather than one per pointermove.
  const [routeDrag, setRouteDrag] = useState<
    { routeId: string; index: number; pos: XY; insert?: boolean } | null
  >(null);
  const [dragLine, setDragLine] = useState<{ a: XY; b: XY } | null>(null);
  const measure = useMeasure();
  // an in-flight panel drag: the gesture is committed on release as ONE patch
  const [panelDrag, setPanelDrag] = useState<{
    id: string;
    start: XY;
    pos: XY;
    shift: boolean;
  } | null>(null);
  const [marquee, setMarquee] = useState<{ a: XY; b: XY } | null>(null);
  const [hoverPoint, setHoverPoint] = useState<XY | null>(null);
  const [tableSheet, setTableSheet] = useState(false);
  const canvasRef = useRef<SatCanvasHandle>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [walkwayWidthMm, setWalkwayWidthMm] = useState(800);
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const enabledPanels = project.panels.filter((p) => p.enabled);
  const kwp = (enabledPanels.length * spec.watt) / 1000;

  // routed metres when the runs exist; the labelled legacy estimate otherwise
  const dcCable = useMemo(() => {
    const routed = dcCableFromRoutes(project);
    return routed.routed
      ? routed
      : { ...routed, meters: estimateDcCableM(project.strings, project.panels) };
  }, [project]);

  // the string window the site's design temperatures allow, for the live
  // manual-stringing readout (cheap: pure arithmetic on two specs)
  const manualWindow = useMemo(() => {
    const n = manualString?.length ?? 0;
    const temps = resolveDesignTemps(project);
    const sizing = stringSizing(spec, inverter, temps);
    return {
      min: sizing.minPanels,
      max: sizing.maxPanels,
      vocCold: vocAtTemp(spec, temps.minCellC) * n,
      over: n > sizing.maxPanels,
      under: n > 0 && n < sizing.minPanels,
    };
  }, [manualString, project, spec, inverter]);

  // step 5: offer auto-placement once when arriving with no panels
  useEffect(() => {
    if (project.panels.length === 0 && project.roofs.length > 0) {
      setConfirmPlace(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  // Real rasterised solar-access heatmap for the 2D canvas — same engine as 3D,
  // cached by the shading fingerprint so it only recomputes on a geometry change.
  const heatFp = useMemo(() => shadingFingerprint(project), [project]);
  useEffect(() => {
    if (!heatmap) return;
    if (heatCacheRef.current?.fp === heatFp) {
      setHeatResult(heatCacheRef.current.res);
      return;
    }
    const signal: HeatCancel = { aborted: false };
    setHeatResult(null);
    computeHeatmap(project, { signal })
      .then((res) => {
        if (signal.aborted) return;
        heatCacheRef.current = { fp: heatFp, res };
        setHeatResult(res);
      })
      .catch(() => {});
    return () => {
      signal.aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmap, heatFp]);

  const issues = useMemo(
    () =>
      [
        ...layoutIssues(project, spec),
        ...routeIssues(project, spec),
        ...validateSystem(
          project.strings,
          spec,
          inverter,
          project.components.inverterCount,
          enabledPanels.length,
          resolveDesignTemps(project),
          enabledPanels.map((p) => p.id),
        ),
      ].sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1)),
    [
      project,
      project.strings,
      spec,
      inverter,
      project.components.inverterCount,
      enabledPanels.length,
    ],
  );

  const selectedPanels = useMemo(
    () => project.panels.filter((p) => selectedIds.includes(p.id)),
    [project.panels, selectedIds],
  );

  const overLimit = kwp > PLAN_LIMIT_KW;
  // banners stack: plan-limit (if over) then DRC issues (if any)
  const chromeTop = (overLimit ? 38 : 0) + (issues.length > 0 ? 38 : 0) + 14;

  function flash(kind: Notice['kind'], text: string) {
    window.clearTimeout(noticeTimer.current);
    setNotice({ kind, text });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  }

  function flashLock() {
    flash('lock', 'Layout locked — unlock to make changes');
  }

  /** Activate a tool (toggles back to select); blocked by the layout lock. */
  function activate(t: Tool) {
    if (t !== 'select' && locked && MUTATING_TOOLS.includes(t)) {
      flashLock();
      return;
    }
    setManualString(null);
    setDragLine(null);
    setMarquee(null);
    if (t !== 'select') setSelectedIds([]);
    setTool((cur) => (cur === t && t !== 'select' ? 'select' : t));
  }

  function toggleLock() {
    const next = !locked;
    if (next) {
      setTool('select');
      setManualString(null);
      setDragLine(null);
      setMarquee(null);
    }
    setLocked(next);
  }

  function openStringing() {
    if (locked) {
      flashLock();
      return;
    }
    setStringSheet(true);
  }

  function runAutoPlace(objective: 'target_kwp' | 'max_roof' = 'target_kwp') {
    // ranked, budgeted, EXPLAINED layout (Phase 6) — roofs fill in order of
    // measured expected energy, and every choice lands in the decision log
    const result = autoDesign(project, objective);
    patch(
      {
        panels: result.panels,
        segments: result.segments,
        strings: [],
        designLog: result.decisions,
      },
      true,
    );
    for (const w of result.warnings) flash('info', w);
    setConfirmPlace(false);
    if (result.decisions.length > 0) setWhySheet(true);
  }

  // ── selection actions ──────────────────────────────────────────────────────

  function toggleEnableSelected() {
    if (locked) {
      flashLock();
      return;
    }
    const enable = !selectedPanels.every((p) => p.enabled);
    patch(
      {
        panels: project.panels.map((p) =>
          selectedIds.includes(p.id) ? { ...p, enabled: enable } : p,
        ),
        strings: [],
      },
      true,
    );
  }

  function rotateSelected(deltaDeg: number) {
    if (locked) {
      flashLock();
      return;
    }
    patch(
      {
        panels: project.panels.map((p) =>
          selectedIds.includes(p.id)
            ? { ...p, azimuthDeg: (((p.azimuthDeg + deltaDeg) % 360) + 360) % 360 }
            : p,
        ),
      },
      true,
    );
  }

  /** Shared by click-to-select and the release of a drag that never moved. */
  function selectPanel(id: string, shift: boolean) {
    setSelectedIds((cur) => {
      if (shift)
        return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return cur.length === 1 && cur[0] === id ? [] : [id];
    });
  }

  function nudgeSelected(dx: number, dy: number) {
    if (locked) {
      flashLock();
      return;
    }
    const r = movePanels(project, spec, selectedIds, dx, dy);
    if (!r.ok) {
      // §H: the model is the feedback, but a REFUSED move shows nothing at all
      // — so say why, once, instead of leaving the user tapping a dead key
      flash('lock', r.reason);
      return;
    }
    // strings survive a move: the same modules stay wired in the same order,
    // only their positions changed
    patch({ panels: r.panels, segments: r.segments }, true);
  }

  function tiltSelected(deltaDeg: number) {
    if (locked) {
      flashLock();
      return;
    }
    // panels in ONE elevated table tilt through the SEGMENT (racking + legs
    // + member model stay coupled) — a per-panel nudge would visibly detach
    // modules from their parametric structure
    const sel = project.panels.filter((p) => selectedIds.includes(p.id));
    // PARTITION the selection: every represented elevated segment tilts as a
    // unit (racking + legs + member model stay coupled); only loose panels
    // tilt individually — a mixed marquee must never detach modules from
    // their parametric structure
    const segIds = [...new Set(sel.map((p) => p.segmentId).filter((x): x is string => !!x))];
    let segments = project.segments;
    let panels = project.panels;
    for (const id of segIds) {
      const seg = segments.find((sg) => sg.id === id);
      if (!seg || seg.racking.kind === 'flush') continue;
      const r = setSegmentTilt(spec, seg, panels, seg.racking.tiltDeg + deltaDeg);
      segments = segments.map((sg) => (sg.id === id ? r.segment : sg));
      panels = r.panels;
    }
    const segmented = new Set(segIds);
    panels = panels.map((p) =>
      selectedIds.includes(p.id) && (!p.segmentId || !segmented.has(p.segmentId))
        ? { ...p, tiltDeg: Math.max(0, Math.min(35, p.tiltDeg + deltaDeg)) }
        : p,
    );
    patch({ segments, panels }, true);
  }

  function deleteSelected() {
    if (locked) {
      flashLock();
      return;
    }
    if (selectedIds.length === 0) return;
    // cascade: reindexes/drops affected tables and prunes (not wipes) strings
    patch(cascadeDeletePanels(project, selectedIds), true);
    setSelectedIds([]);
  }

  // Smart-grow: add rows/columns to the selected table's segment (collision-aware).
  const growShape: SelectionShape = useMemo(
    () => classifySelection(selectedPanels),
    [selectedPanels],
  );

  // Loose panels on one roof can be grouped into a parametric table.
  const canGroup = useMemo(() => {
    if (selectedPanels.length < 2) return false;
    if (selectedPanels.some((p) => p.segmentId)) return false;
    const roofId = selectedPanels[0].roofId;
    return selectedPanels.every((p) => p.roofId === roofId);
  }, [selectedPanels]);

  function groupSelection() {
    if (locked) {
      flashLock();
      return;
    }
    if (!canGroup) return;
    const roof = project.roofs.find((r) => r.id === selectedPanels[0].roofId);
    if (!roof) return;
    const res = groupIntoTable(roof, spec, selectedPanels, nextSegmentLabel(project.segments));
    const selIds = new Set(selectedPanels.map((p) => p.id));
    const others = project.panels.filter((p) => !selIds.has(p.id));
    patch(
      {
        panels: [...others, ...res.panels],
        segments: [...project.segments, res.segment],
        strings: [],
      },
      true,
    );
    setSelectedIds(res.panels.map((p) => p.id));
  }

  function growSelection(axis: GrowAxis, side: GrowSide, count: number) {
    if (locked) {
      flashLock();
      return;
    }
    const seg = growShape.segmentId
      ? project.segments.find((s) => s.id === growShape.segmentId)
      : undefined;
    const roof = seg && project.roofs.find((r) => r.id === seg.roofId);
    if (!seg || !roof) return;
    const res = growSegment(project, roof, spec, seg, axis, side, count);
    if (res.added === 0) {
      flash('info', 'No room to add there');
      return;
    }
    const others = project.panels.filter((p) => p.segmentId !== seg.id);
    patch(
      {
        panels: [...others, ...res.panels],
        segments: project.segments.map((s) => (s.id === seg.id ? res.segment : s)),
        strings: [],
      },
      true,
    );
    setSelectedIds(res.panels.map((p) => p.id));
  }

  // Live ghost for the grow popover: the exact panels a grow would add, so the
  // user sees the new rows/columns before pressing Add.
  function growPreviewCorners(axis: GrowAxis, side: GrowSide, count: number): XY[][] {
    const seg = growShape.segmentId
      ? project.segments.find((s) => s.id === growShape.segmentId)
      : undefined;
    const roof = seg && project.roofs.find((r) => r.id === seg.roofId);
    if (!seg || !roof) return [];
    return growCandidates(project, roof, spec, seg, axis, side, count).map((p) =>
      panelCornersOnRoof(p, spec, roof),
    );
  }

  // ── per-table settings (array side panel) ───────────────────────────────────
  const selectedSegment = growShape.segmentId
    ? project.segments.find((s) => s.id === growShape.segmentId)
    : undefined;
  const selectedSegRoof =
    selectedSegment && project.roofs.find((r) => r.id === selectedSegment.roofId);

  function applySegment(update: { segment: ArraySegment; panels: PlacedPanel[] }) {
    const segments = project.segments.map((s) =>
      s.id === update.segment.id ? update.segment : s,
    );
    // racking/tilt/respace edits can change under-structure clearance — keep
    // panels bridging obstructions valid in the same undoable patch
    const panels =
      reconcileBridgedPanels(project, { segments, panels: update.panels }) ?? update.panels;
    patch({ panels, segments, strings: [] }, true);
  }
  function applyRacking(kind: 'flush' | 'fixed_tilt' | 'dual_tilt') {
    if (locked) return flashLock();
    if (!selectedSegment || !selectedSegRoof) return;
    applySegment(setSegmentRacking(selectedSegRoof, spec, selectedSegment, project.panels, kind));
  }
  function applyTilt(t: number) {
    if (locked || !selectedSegment) return;
    applySegment(setSegmentTilt(spec, selectedSegment, project.panels, t));
  }
  function applyAzimuth(az: number) {
    if (locked || !selectedSegment) return;
    applySegment(setSegmentAzimuth(selectedSegment, project.panels, az));
  }
  function applyProfile(key: string) {
    if (locked || !selectedSegment) return;
    const profile = STRUCTURE_PROFILES.find((p) => p.key === key);
    if (!profile) return;
    patch(
      {
        segments: project.segments.map((s) =>
          s.id === selectedSegment.id ? setSegmentProfile(selectedSegment, profile) : s,
        ),
      },
      true,
    );
  }
  function applyStructureFields(
    fields: Partial<{ legSpacingM: number; foundation: 'anchor' | 'ballast'; clearanceM: number }>,
  ) {
    if (locked || !selectedSegment) return;
    const segments = project.segments.map((sg) =>
      sg.id === selectedSegment.id ? setSegmentStructureFields(selectedSegment, fields) : sg,
    );
    const panels = 'clearanceM' in fields ? reconcileBridgedPanels(project, { segments }) : null;
    patch({ segments, ...(panels ? { panels } : {}) }, true);
  }
  /** Presets write the fields they OWN; anything else the user set survives. */
  function applyPreset(preset: Extract<StructChoice, { kind: 'preset' }>['preset']) {
    if (locked || !selectedSegment || !selectedSegRoof) return;
    const r = applyStructChoice(project, selectedSegment.id, { kind: 'preset', preset });
    if (r) patch(r, true);
  }
  function applyRespace(pitch: number) {
    if (locked) return flashLock();
    if (!selectedSegment || !selectedSegRoof) return;
    const res = respaceSegment(project, selectedSegRoof, spec, selectedSegment, pitch);
    if (!res) return flash('info', 'No room to apply that spacing');
    applySegment(res);
    setSelectedIds(res.panels.map((p) => p.id));
  }
  function duplicateTable() {
    if (locked) return flashLock();
    if (!selectedSegment || !selectedSegRoof) return;
    const dup = duplicateSegment(project, selectedSegRoof, spec, selectedSegment);
    if (!dup) return flash('info', 'No room to duplicate this table');
    dup.segment.label = nextSegmentLabel(project.segments);
    patch(
      {
        panels: [...project.panels, ...dup.panels],
        segments: [...project.segments, dup.segment],
        strings: [],
      },
      true,
    );
    setSelectedIds(dup.panels.map((p) => p.id));
    setTableSheet(false);
  }
  function deleteTable() {
    if (locked) return flashLock();
    if (!selectedSegment) return;
    const ids = project.panels
      .filter((p) => p.segmentId === selectedSegment.id)
      .map((p) => p.id);
    patch(cascadeDeletePanels(project, ids), true);
    setSelectedIds([]);
    setTableSheet(false);
  }

  // ── canvas interactions ────────────────────────────────────────────────────

  function findPanelAt(m: XY): PlacedPanel | undefined {
    return project.panels.find(
      (p) => Math.hypot(m.x - p.center.x, m.y - p.center.y) < 1.3,
    );
  }

  function handleClick(m: XY, e: ReactPointerEvent) {
    if (measure.handleClick(m)) return;
    switch (tool) {
      case 'erase': {
        const hit = findPanelAt(m);
        if (hit) patch(cascadeDeletePanels(project, [hit.id]), true);
        return;
      }
      case 'arrester': {
        const roof = pickRoofAt(m, project.roofs);
        if (!roof) return;
        const la: LightningArrester = {
          id: genId('la'),
          roofId: roof.id,
          pos: m,
          heightMm: 2000,
        };
        patch({ arresters: [...project.arresters, la] }, true);
        return;
      }
      case 'inverter': {
        if (placeKind === 'meter') {
          // the service entry is a free point: it is usually off the roof, at
          // ground level, so it is NOT snapped to an edge like the inverter
          patch({ gridConnection: { pos: m } }, true);
          flash('ok', 'Meter placed — Auto string to route the AC run');
          return;
        }
        // click near a roof edge to hang the inverter on that wall
        let best: { roofId: string; edgeIndex: number; t: number; d: number } | null = null;
        for (const roof of project.roofs) {
          for (let i = 0; i < roof.polygon.length; i++) {
            const a = roof.polygon[i];
            const b = roof.polygon[(i + 1) % roof.polygon.length];
            const { d, t } = pointSegDist(m, a, b);
            if (!best || d < best.d) best = { roofId: roof.id, edgeIndex: i, t, d };
          }
        }
        if (best && best.d < 4) {
          patch(
            {
              inverterPlacements: [
                {
                  id: genId('invp'),
                  roofId: best.roofId,
                  edgeIndex: best.edgeIndex,
                  t: best.t,
                  heightM: 1.5,
                },
              ],
            },
            true,
          );
          setTool('select');
          flash('ok', 'Inverter mounted — now string the panels');
        }
        return;
      }
      case 'select': {
        if (manualString) {
          const hit = findPanelAt(m);
          // A panel belongs to exactly ONE string and must be enabled. The old
          // check only looked inside the string being built, so a panel could be
          // wired into two strings at once (physically impossible — the audit's
          // "manual string double-assignment") or a disabled panel could be
          // wired into one. Tapping such a panel now says why instead of
          // silently doing the wrong thing.
          if (!hit) return;
          if (manualString.includes(hit.id)) return; // already in this string: no-op
          if (!hit.enabled) {
            flash('lock', 'That panel is disabled — enable it before wiring it into a string');
            return;
          }
          const owner = project.strings.find((st) => st.panelIds.includes(hit.id));
          if (owner) {
            flash('lock', `That panel is already wired into ${owner.name}`);
            return;
          }
          setManualString([...manualString, hit.id]);
          return;
        }
        const hit = findPanelAt(m);
        if (!hit) return; // empty clicks are handled by the marquee gesture
        selectPanel(hit.id, e.shiftKey);
        return;
      }
      default:
        return;
    }
  }

  function finishDragTool(a: XY, b: XY) {
    const roof =
      pickRoofAt(a, project.roofs) ?? project.roofs[0];
    if (!roof) return;
    if (tool === 'walkway') {
      const w: Walkway = {
        id: genId('wk'),
        roofId: roof.id,
        a,
        b,
        widthMm: Math.round(Math.min(3000, Math.max(100, walkwayWidthMm || 800))),
        heightMm: 100,
      };
      patch({ walkways: [...project.walkways, w] }, true);
    } else if (tool === 'keepout') {
      // A no-build zone is an axis-aligned rectangle in project metres. Height 0
      // means "blocks placement but casts no shadow" — a lane/reservation, not a
      // solid object (layout.ts:100 filters kind !== 'shade' for the block set).
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxY = Math.max(a.y, b.y);
      if (maxX - minX < 0.3 || maxY - minY < 0.3) return; // a stray click, not a zone
      const k: Keepout = {
        id: genId('ko'),
        roofId: roof.id,
        shape: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
        heightM: 0,
        kind: 'fire_setback',
      };
      patch({ keepouts: [...project.keepouts, k] }, true);
    } else if (tool === 'rail') {
      const r: SafetyRail = {
        id: genId('rl'),
        roofId: roof.id,
        a,
        b,
        heightMm: 1100,
      };
      patch({ rails: [...project.rails, r] }, true);
    }
  }

  function finishMarquee(m: XY, shift: boolean) {
    const a = marquee!.a;
    setMarquee(null);
    if (Math.abs(m.x - a.x) < 0.3 && Math.abs(m.y - a.y) < 0.3) {
      // treated as a click on empty canvas
      if (!shift) setSelectedIds([]);
      return;
    }
    const minX = Math.min(a.x, m.x);
    const maxX = Math.max(a.x, m.x);
    const minY = Math.min(a.y, m.y);
    const maxY = Math.max(a.y, m.y);
    const inside = project.panels
      .filter(
        (p) =>
          p.center.x >= minX && p.center.x <= maxX && p.center.y >= minY && p.center.y <= maxY,
      )
      .map((p) => p.id);
    setSelectedIds((cur) => (shift ? [...new Set([...cur, ...inside])] : inside));
  }

  // ── stringing ──────────────────────────────────────────────────────────────

  function doAutoString() {
    // the planner reports WHY it couldn't do better; those issues surface in
    // the live banner via validateSystem, which re-derives them from the result
    const plan = autoStringPlan(
      project,
      spec,
      inverter,
      project.components.inverterCount,
      resolveDesignTemps(project),
    );
    // routes follow the strings they serve: one undoable patch, so undo puts
    // BOTH back rather than leaving copper for strings that no longer exist
    const routed = { ...project, strings: plan.strings };
    patch(
      {
        strings: plan.strings,
        cableRoutes: [...autoRouteStrings(routed), ...autoRouteAc(routed)],
      },
      true,
    );
    setStringSheet(false);
    setShowStrings(true);
  }

  /**
   * The route corner under the pointer, if any. INTERIOR waypoints only: the
   * ends are the panel and the inverter — dragging those would detach the run
   * from the things it connects, which is a different (and wrong) edit.
   */
  function findRouteHandleAt(m: XY): { routeId: string; index: number } | null {
    const TOL_M = 0.9;
    for (const r of project.cableRoutes ?? []) {
      for (let i = 1; i < r.waypoints.length - 1; i++) {
        const w = r.waypoints[i];
        if (Math.hypot(w.x - m.x, w.y - m.y) <= TOL_M) return { routeId: r.id, index: i };
      }
    }
    return null;
  }

  /**
   * The route SEGMENT under the pointer — where a new corner can be born.
   * Without this the feature is unusable: a clean roof routes straight, so
   * there are no corners to grab and no way to make one.
   */
  function findRouteSegmentAt(m: XY): { routeId: string; index: number } | null {
    const TOL_M = 0.6;
    for (const r of project.cableRoutes ?? []) {
      for (let i = 1; i < r.waypoints.length; i++) {
        const { d } = pointSegDist(m, r.waypoints[i - 1], r.waypoints[i]);
        if (d <= TOL_M) return { routeId: r.id, index: i }; // insert BEFORE i
      }
    }
    return null;
  }

  /** Commit a corner drag: ONE undoable patch, and the route becomes the user's. */
  function commitRouteDrag(m: XY) {
    const d = routeDrag;
    setRouteDrag(null);
    if (!d) return;
    // An inserted corner the user never moved is just noise on the same line —
    // drop it rather than litter the route with collinear points.
    if (d.insert && Math.hypot(m.x - d.pos.x, m.y - d.pos.y) < 0.25) return;
    patch(
      {
        cableRoutes: (project.cableRoutes ?? []).map((r) =>
          r.id === d.routeId
            ? {
                ...r,
                waypoints: d.insert
                  ? [...r.waypoints.slice(0, d.index), m, ...r.waypoints.slice(d.index)]
                  : r.waypoints.map((w, i) => (i === d.index ? m : w)),
                // hand-edited: auto-routing must never stomp it (autoRouteStrings
                // keeps `manual` routes and skips re-routing that string)
                manual: true,
              }
            : r,
        ),
      },
      true,
    );
  }

  function finishManualString() {
    if (!manualString || manualString.length === 0) {
      setManualString(null);
      return;
    }
    const idx = project.strings.length;
    const s: StringDef = {
      id: genId('str'),
      name: `String ${idx + 1}`,
      inverterIndex: Math.floor(idx / inverter.mppt.count),
      mpptIndex: idx % inverter.mppt.count,
      panelIds: manualString,
      color: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'][idx % 5],
    };
    patch({ strings: [...project.strings, s] }, true);
    setManualString(null);
  }

  // ── keyboard shortcuts ─────────────────────────────────────────────────────

  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[contenteditable]'))
        return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // sheets & dialogs own the keyboard while open (Escape closes them)
      if (confirmPlace || confirmClear || stringSheet || stringInfo || issuesSheet) return;
      if (e.key === 'Escape') {
        setManualString(null);
        setDragLine(null);
        setMarquee(null);
        setSelectedIds([]);
        setTool('select');
        return;
      }
      const nudge = nudgeDelta(e.key, e.shiftKey);
      if (nudge) {
        if (selectedIds.length > 0) {
          e.preventDefault(); // arrows would otherwise scroll the editor
          nudgeSelected(nudge.x, nudge.y);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIds.length > 0) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'h':
          setHeatmap((v) => !v);
          break;
        case 's':
          setShowStrings((v) => !v);
          break;
        case 'v':
          activate('select');
          break;
        case 't':
        case 'p':
          activate('panels');
          break;
        case 'e':
          activate('erase');
          break;
        case 'w':
          activate('walkway');
          break;
        case 'r':
          activate('rail');
          break;
        case 'k':
          activate('keepout');
          break;
        case 'l':
          activate('arrester');
          break;
        case 'i':
          activate('inverter');
          break;
        case 'g':
          openStringing();
          break;
      }
    };
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (show3D) {
    return <Scene3D onClose={() => setShow3D(false)} />;
  }

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* plan-limit / validation banners */}
      {overLimit && (
        <div
          className="banner-error"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 45 }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={15} />
            Total capacity {kwp.toFixed(1)} kWp exceeds the {PLAN_LIMIT_KW} kW plan limit —
            remove panels or upgrade.
          </span>
          <button
            className="btn btn-primary"
            style={{ minHeight: 28, padding: '4px 14px', fontSize: 12 }}
            onClick={() => flash('info', 'Plan upgrades are not available in this demo')}
          >
            Upgrade
          </button>
        </div>
      )}
      {issues.length > 0 && (
        <button
          className={issues.some((i) => i.level === 'error') ? 'banner-error' : 'banner-warn'}
          style={{
            position: 'absolute',
            top: overLimit ? 38 : 0,
            left: 0,
            right: 0,
            zIndex: 45,
            width: '100%',
            textAlign: 'left',
            cursor: 'pointer',
          }}
          aria-haspopup="dialog"
          onClick={() => setIssuesSheet(true)}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {issues.some((i) => i.level === 'error') ? (
              <XCircle size={15} />
            ) : (
              <AlertTriangle size={15} />
            )}
            {issues[0].message}
          </span>
          <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
            {issues.length > 1 && `+${issues.length - 1} more · `}View all
          </span>
        </button>
      )}

      <SatCanvas
        ref={canvasRef}
        lat={loc.latLng.lat}
        lng={loc.latLng.lng}
        scaleFactor={project.calibration.scaleFactor}
        northOffsetDeg={project.calibration.northOffsetDeg}
        dim
        cursor={measure.active ? 'crosshair' : tool === 'select' ? 'default' : 'crosshair'}
        panEnabled={tool === 'select' && !manualString}
        onCanvasClick={handleClick}
        onCanvasDown={(m) => {
          if (measure.active) return; // measure owns clicks; drags still pan
          if (
            tool === 'walkway' ||
            tool === 'rail' ||
            tool === 'panels' ||
            tool === 'keepout'
          ) {
            setDragLine({ a: m, b: m });
            return true;
          }
          if (tool === 'select' && !manualString) {
            // grab a route corner first: the marquee claims every empty click,
            // so it would swallow the handle
            const hit = findRouteHandleAt(m);
            if (hit) {
              setRouteDrag({ ...hit, pos: m });
              return true;
            }
            // grab-and-go: pressing on the run itself creates a corner there and
            // starts dragging it — one gesture, and still ONE undo step because
            // the insert is only committed on release
            const seg = findRouteSegmentAt(m);
            if (seg) {
              setRouteDrag({ ...seg, pos: m, insert: true });
              return true;
            }
            // grab a PANEL: pressing one starts a move, releasing without
            // travel is still a plain click-to-select (resolved in onCanvasUp)
            const hitPanel = findPanelAt(m);
            if (hitPanel) {
              setPanelDrag({ id: hitPanel.id, start: m, pos: m, shift: false });
              return true;
            }
            setMarquee({ a: m, b: m });
            return true;
          }
        }}
        onCanvasMove={(m) => {
          measure.handleMove(m);
          if (routeDrag) setRouteDrag({ ...routeDrag, pos: m });
          else if (dragLine) setDragLine({ ...dragLine, b: m });
          else if (panelDrag) setPanelDrag({ ...panelDrag, pos: m });
          else if (marquee) setMarquee({ ...marquee, b: m });
          else if (tool === 'panels' || tool === 'erase' || tool === 'arrester' || tool === 'inverter')
            setHoverPoint(m);
        }}
        onCanvasUp={(m, e) => {
          if (routeDrag) {
            commitRouteDrag(m);
            return;
          }
          if (panelDrag) {
            const { id, start } = panelDrag;
            setPanelDrag(null);
            const dx = m.x - start.x;
            const dy = m.y - start.y;
            if (Math.hypot(dx, dy) < 0.3) {
              selectPanel(id, e.shiftKey); // a press with no travel is a click
              return;
            }
            // drag a panel that was NOT selected ⇒ move just that one
            const ids = selectedIds.includes(id) ? selectedIds : [id];
            const r = movePanels(project, spec, ids, dx, dy);
            if (!r.ok) {
              flash('lock', r.reason);
              return;
            }
            patch({ panels: r.panels, segments: r.segments }, true);
            return;
          }
          if (marquee) {
            finishMarquee(m, e.shiftKey);
            return;
          }
          if (!dragLine) return;
          const line = { a: dragLine.a, b: m };
          setDragLine(null);
          const dist = Math.hypot(line.b.x - line.a.x, line.b.y - line.a.y);
          if (tool === 'keepout' && dist < 0.4) {
            // CLICK on an existing zone → remove it. The draw tool is its own
            // eraser, so there is no second control to find. Topmost first, so
            // clicking overlapping zones peels them off in drawing order.
            const hit = [...project.keepouts]
              .reverse()
              .find((k) => pointInPolygon(line.a, k.shape));
            if (hit)
              patch(
                { keepouts: project.keepouts.filter((k) => k.id !== hit.id) },
                true,
              );
            return;
          }
          if (tool === 'panels') {
            if (dist < 0.4) {
              // CLICK → one panel, SNAPPED to the roof grid, refusing overlap /
              // outside-setback (smart placement).
              const roof = pickRoofAt(line.a, project.roofs);
              if (roof) {
                const c = snapPanelCenter(project, roof, spec, line.a, 'portrait');
                if (panelFitsAt(project, roof, spec, c, 'portrait')) {
                  patch(
                    {
                      panels: [
                        ...project.panels,
                        {
                          id: genId('pv'),
                          roofId: roof.id,
                          center: c,
                          orientation: 'portrait',
                          ...defaultPanelPose(roof),
                          solarAccess: 1,
                          enabled: true,
                        },
                      ],
                      strings: [],
                    },
                    true,
                  );
                }
              }
              return;
            }
            // DRAG → fill the rectangle as a collision-aware segment
            const minX = Math.min(line.a.x, line.b.x);
            const maxX = Math.max(line.a.x, line.b.x);
            const minY = Math.min(line.a.y, line.b.y);
            const maxY = Math.max(line.a.y, line.b.y);
            const area: XY[] = [
              { x: minX, y: minY },
              { x: maxX, y: minY },
              { x: maxX, y: maxY },
              { x: minX, y: maxY },
            ];
            const roof = pickRoofAt(line.a, project.roofs) ?? project.roofs[0];
            if (roof) {
              const filled = fillRoofAsSegment(
                project,
                roof,
                spec,
                { orientation: 'portrait', gapM: 0.05, grouped: true, avoidPanels: project.panels },
                area,
              );
              if (filled) {
                const re = reindexSegment(roof, spec, filled.segment, filled.panels);
                re.segment.label = nextSegmentLabel(project.segments);
                patch(
                  {
                    panels: [...project.panels, ...re.panels],
                    segments: [...project.segments, re.segment],
                    strings: [],
                  },
                  true,
                );
              }
            }
          } else if (dist > 0.5) {
            finishDragTool(line.a, line.b);
          }
        }}
      >
        <EditorLayers
          heatmap={heatmap}
          heatResult={heatResult}
          heatMonth={heatMonth}
          showStrings={showStrings}
          routeDrag={routeDrag}
          manualString={manualString}
          dragLine={dragLine}
          panelDrag={panelDrag}
          marquee={marquee}
          hoverPoint={hoverPoint}
          walkwayWidthMm={walkwayWidthMm}
          selected={selectedIds}
          tool={tool}
        />
        {tool === 'select' && !manualString && (
          <SelectionContextBar
            panels={selectedPanels}
            locked={locked}
            growShape={growShape}
            onGrow={growSelection}
            onGrowPreview={growPreviewCorners}
            onTableSettings={() => setTableSheet(true)}
            canGroup={canGroup}
            onGroup={groupSelection}
            onToggleEnable={toggleEnableSelected}
            onRotate={rotateSelected}
            onTilt={tiltSelected}
            onDelete={deleteSelected}
            onClear={() => setSelectedIds([])}
          />
        )}
        <MeasureOverlay measure={measure} fmt={(m) => `${m.toFixed(2)} m`} />
      </SatCanvas>

      {/* heatmap legend + month scrubber (2D parity with the 3D view) */}
      {heatmap && heatResult && (
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            background: 'rgba(12,16,20,0.92)',
            color: '#eaf3f1',
            borderRadius: 12,
            padding: '10px 14px',
            width: 300,
            boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <b>
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][heatMonth]}
            </b>
            <span style={{ marginLeft: 'auto', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(heatResult.monthlyRoofAvg[heatMonth] * 100)}% avg access
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, marginBottom: 5, background: 'linear-gradient(90deg,#dc2626,#ca8a04,#16a34a)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, opacity: 0.7, marginBottom: 8 }}>
            <span>Poor</span>
            <span>Moderate</span>
            <span>Good</span>
            <span>Excellent</span>
          </div>
          <input
            type="range"
            min={0}
            max={11}
            value={heatMonth}
            onChange={(e) => setHeatMonth(Number(e.target.value))}
            style={{ width: '100%' }}
            aria-label="Heatmap month"
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, opacity: 0.6 }}>
            <span>Jan</span>
            <span>Jun</span>
            <span>Dec</span>
          </div>
        </div>
      )}

      {/* left tool rail */}
      <div
        className="tool-rail dark"
        style={{ left: 14, top: chromeTop }}
        role="toolbar"
        aria-label="Editor tools"
        aria-orientation="vertical"
      >
        <div className="tool-group-label">View</div>
        <RailBtn
          icon={<Sun />}
          label="Irradiance heatmap"
          tip={'Irradiance heatmap\nH'}
          active={heatmap}
          accent
          pressed={heatmap}
          onClick={() => setHeatmap((v) => !v)}
        />
        <RailBtn
          icon={<Cable />}
          label="Show strings"
          tip={'Show strings\nS'}
          active={showStrings}
          pressed={showStrings}
          onClick={() => setShowStrings((v) => !v)}
        />
        <RailBtn
          icon={<ListChecks />}
          label="Why this layout?"
          tip={'Why this layout?\nDecision log + Copilot suggestions'}
          active={whySheet}
          pressed={whySheet}
          onClick={() => setWhySheet((v) => !v)}
        />
        <RailBtn
          icon={<PencilRuler />}
          label="Measure distance"
          tip={'Measure distance\nClick two points'}
          active={measure.active}
          pressed={measure.active}
          onClick={measure.toggle}
        />
        <div className="tool-sep" />
        <div className="tool-group-label">Build</div>
        <RailBtn
          icon={<MousePointer2 />}
          label="Select"
          tip={'Select\nV'}
          active={tool === 'select' && !manualString}
          pressed={tool === 'select' && !manualString}
          onClick={() => activate('select')}
        />
        <RailBtn
          icon={<Grid3x3 />}
          label="Panels"
          tip={'Panels — click for one · drag to fill\nP'}
          active={tool === 'panels'}
          pressed={tool === 'panels'}
          disabled={locked}
          onClick={() => activate('panels')}
        />
        <RailBtn
          icon={<Eraser />}
          label="Erase panel"
          tip={'Erase panel\nE'}
          active={tool === 'erase'}
          pressed={tool === 'erase'}
          danger
          disabled={locked}
          onClick={() => activate('erase')}
        />
        <div className="tool-sep" />
        <div className="tool-group-label">Safety</div>
        <RailBtn
          icon={<Footprints />}
          label="Walkway"
          tip={'Walkway\nW'}
          active={tool === 'walkway'}
          pressed={tool === 'walkway'}
          disabled={locked}
          count={project.walkways.length}
          onClick={() => activate('walkway')}
        />
        <RailBtn
          icon={<Ban />}
          label="No-build zone"
          tip={'No-build zone — drag an area panels must avoid\nK'}
          active={tool === 'keepout'}
          pressed={tool === 'keepout'}
          disabled={locked}
          count={project.keepouts.length}
          onClick={() => activate('keepout')}
        />
        <RailBtn
          icon={<Fence />}
          label="Safety rail"
          tip={'Safety rail\nR'}
          active={tool === 'rail'}
          pressed={tool === 'rail'}
          disabled={locked}
          count={project.rails.length}
          onClick={() => activate('rail')}
        />
        <RailBtn
          icon={<Zap />}
          label="Lightning arrester"
          tip={'Lightning arrester\nL'}
          active={tool === 'arrester'}
          pressed={tool === 'arrester'}
          disabled={locked}
          count={project.arresters.length}
          onClick={() => activate('arrester')}
        />
        <div className="tool-sep" />
        <div className="tool-group-label">Electrical</div>
        <RailBtn
          icon={<PlugZap />}
          label="Mount inverter"
          tip={'Mount inverter\nI'}
          active={tool === 'inverter'}
          pressed={tool === 'inverter'}
          disabled={locked}
          count={project.inverterPlacements.length}
          onClick={() => activate('inverter')}
        />
        <RailBtn
          icon={<Cable />}
          label="Stringing"
          tip={'Stringing\nG'}
          active={manualString !== null}
          disabled={locked}
          onClick={openStringing}
        />
        <RailBtn
          icon={<Info />}
          label="String connections"
          tip="String connections"
          onClick={() => setStringInfo(true)}
        />
      </div>

      {/* top-right rail: history + layout actions */}
      <div
        className="tool-rail dark"
        style={{ right: 66, top: chromeTop, flexDirection: 'row' }}
        role="toolbar"
        aria-label="History and layout actions"
      >
        <RailBtn
          icon={<Undo2 />}
          label="Undo"
          tip={'Undo\nCtrl+Z'}
          side="left"
          disabled={state.undoStack.length === 0}
          onClick={() => dispatch({ type: 'undo' })}
        />
        <RailBtn
          icon={<Redo2 />}
          label="Redo"
          tip={'Redo\nCtrl+Shift+Z'}
          side="left"
          disabled={state.redoStack.length === 0}
          onClick={() => dispatch({ type: 'redo' })}
        />
        <span
          style={{
            width: 1,
            alignSelf: 'stretch',
            background: 'var(--editor-line)',
            margin: '3px 2px',
          }}
          aria-hidden
        />
        <RailBtn
          icon={locked ? <Lock /> : <LockOpen />}
          label={locked ? 'Unlock layout' : 'Lock layout'}
          tip={locked ? 'Unlock layout' : 'Lock layout'}
          side="left"
          active={locked}
          accent
          pressed={locked}
          onClick={toggleLock}
        />
        <RailBtn
          icon={<Trash2 />}
          label="Clear all panels"
          tip="Clear all panels"
          side="left"
          disabled={locked || project.panels.length === 0}
          onClick={() => {
            if (locked) {
              flashLock();
              return;
            }
            if (project.panels.length > 0) setConfirmClear(true);
          }}
        />
      </div>

      {/* top-center guidance: notices, tool hints, walkway options */}
      <div
        style={{
          position: 'absolute',
          top: chromeTop,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 34,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'center',
        }}
      >
        {notice && (
          <div className="hint-bar" role="status" aria-live="polite">
            {notice.kind === 'lock' ? (
              <Lock />
            ) : notice.kind === 'ok' ? (
              <CheckCircle2 />
            ) : (
              <Info />
            )}
            {notice.text}
          </div>
        )}
        {tool === 'walkway' && (
          <div className="hint-bar" role="group" aria-label="Walkway options">
            <Footprints />
            Width
            {WALKWAY_WIDTHS_MM.map((wmm) => (
              <button
                key={wmm}
                className={`chip ${walkwayWidthMm === wmm ? 'on' : ''}`}
                style={
                  walkwayWidthMm === wmm
                    ? { background: '#fff', borderColor: '#fff', color: '#10141a' }
                    : {
                        background: 'transparent',
                        borderColor: 'var(--editor-line)',
                        color: 'var(--editor-ink)',
                      }
                }
                aria-pressed={walkwayWidthMm === wmm}
                onClick={() => setWalkwayWidthMm(wmm)}
              >
                {wmm}
              </button>
            ))}
            <input
              type="number"
              min={100}
              max={3000}
              step={50}
              value={walkwayWidthMm}
              aria-label="Custom walkway width in millimeters"
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setWalkwayWidthMm(n);
              }}
              style={{
                width: 70,
                background: 'var(--editor-panel-2)',
                border: '1px solid var(--editor-line)',
                color: 'var(--editor-ink)',
                borderRadius: 7,
                padding: '4px 7px',
                fontSize: 12,
              }}
            />
            mm · drag to draw
          </div>
        )}
        {tool !== 'select' && tool !== 'walkway' && !manualString && (
          <div className="hint-bar" role="status">
            <MousePointer2 />
            {TOOL_HINTS[tool]}
          </div>
        )}
      </div>

      {/* manual stringing bar */}
      {tool === 'inverter' && !manualString && (
        <div
          className="hint-bar"
          style={{
            position: 'absolute',
            bottom: 66,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 32,
          }}
        >
          <Plug />
          {/* Selected = LIGHT. `btn-primary` is dark in this theme, which on a
              dark hint bar made the SELECTED chip recede and the unselected one
              pop — the active state read as inactive. State this explicitly
              rather than borrowing button semantics that invert here. */}
          {(['inverter', 'meter'] as const).map((k) => (
            <button
              key={k}
              className="btn"
              aria-pressed={placeKind === k}
              style={{
                minHeight: 28,
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 8,
                background: placeKind === k ? '#f1f5f9' : 'transparent',
                color: placeKind === k ? '#0b1220' : '#cbd5e1',
                border: `1px solid ${placeKind === k ? '#f1f5f9' : 'rgba(255,255,255,.28)'}`,
              }}
              onClick={() => setPlaceKind(k)}
            >
              {k === 'inverter' ? 'Inverter' : 'Meter'}
            </button>
          ))}
          <span style={{ opacity: 0.85 }}>
            {placeKind === 'inverter'
              ? 'Tap a roof edge to hang the inverter'
              : project.gridConnection
                ? 'Tap to move the meter / service entry'
                : 'Tap the meter / service entry — optional, but it makes the AC cable a measured length'}
          </span>
        </div>
      )}

      {manualString && (
        <div
          className="hint-bar"
          style={{
            position: 'absolute',
            bottom: 66,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 32,
          }}
        >
          <Cable />
          {/* Live window feedback: hand-building a string is the one path that
              can still author an over-voltage design, so show the limit WHILE
              it is being crossed rather than only in the banner afterwards. */}
          Tap panels in order — <b>{manualString.length}</b> of {manualWindow.min}–
          {manualWindow.max} ·{' '}
          <span
            style={{
              color: manualWindow.over
                ? '#f87171'
                : manualWindow.under
                  ? '#fbbf24'
                  : '#4ade80',
              fontWeight: 700,
            }}
          >
            {Math.round(manualWindow.vocCold)} V cold
          </span>
          {manualWindow.over && (
            <span style={{ color: '#f87171' }}>
              · over {inverter.maxDcV} V limit
            </span>
          )}
          {manualWindow.under && !manualWindow.over && (
            <span style={{ color: '#fbbf24' }}>· below MPPT floor when hot</span>
          )}{' '}
          · <kbd className="dark">Esc</kbd> cancels
          <button
            className="btn btn-secondary"
            style={{ minHeight: 28, padding: '4px 12px', fontSize: 12 }}
            onClick={() => setManualString(null)}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            style={{ minHeight: 28, padding: '4px 12px', fontSize: 12 }}
            onClick={finishManualString}
          >
            Save string
          </button>
        </div>
      )}

      {/* status pill */}
      <div
        className="status-pill"
        style={{
          position: 'absolute',
          bottom: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 30,
        }}
      >
        <span>
          <b>{enabledPanels.length}</b> panels
        </span>
        <span
          style={{ color: overLimit ? '#f87171' : '#4ade80', fontWeight: 800 }}
        >
          {kwp.toFixed(1)} / {project.components.targetKwp} kWp
        </span>
        {project.strings.length > 0 && (
          <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            Strings
            {project.strings.map((s, i) => (
              <span
                key={s.id}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: s.color,
                  fontSize: 8.5,
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                }}
              >
                {i + 1}
              </span>
            ))}
          </span>
        )}
        <span style={{ color: 'var(--editor-ink-2)' }}>
          DC cable ≈ {dcCable.meters} m{dcCable.routed ? '' : ' (est.)'}
        </span>
      </div>

      {/* 3D view */}
      <button
        className="tool-btn light"
        style={{
          position: 'absolute',
          // CLEAR OF THE TOOL RAIL. At left:14 this pill sat in the rail's own
          // column and, on a ~860px-tall viewport, landed exactly on top of
          // "Mount inverter" (both y≈730–768, zIndex 30) — elementFromPoint
          // returned this button, so the tool was UNREACHABLE and no inverter
          // could ever be placed (which in turn blocks cable routing and makes
          // the AC side unquotable). The rail fills the viewport top to bottom,
          // so there is no free slot in that column: the pill has to move out
          // of it, not just up or down.
          left: 76,
          bottom: 96,
          zIndex: 30,
          width: 'auto',
          padding: '0 13px',
          gap: 7,
          fontWeight: 800,
          fontSize: 12.5,
          borderRadius: 12,
        }}
        aria-label="Open 3D shadow view"
        data-tip="3D shadow view"
        data-tip-right=""
        onClick={() => setShow3D(true)}
      >
        <Box />
        3D
      </button>

      {confirmPlace && (
        <Dialog
          title="Auto-fill this roof?"
          icon={<Sparkles />}
          onClose={() => setConfirmPlace(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmPlace(false)}>
                Place manually
              </button>
              <button className="btn btn-primary" onClick={() => runAutoPlace()}>
                <Sparkles />
                Auto-fill panels
              </button>
              <button className="btn btn-secondary" onClick={() => runAutoPlace('max_roof')}>
                Use max roof capacity
              </button>
            </>
          }
        >
          <p>
            Design automatically with {spec.brand} {spec.watt} W panels up to{' '}
            {project.components.targetKwp} kWp: roofs are RANKED by measured sun access ×
            capacity and filled best-first, honoring setbacks, obstructions, walkways and
            shadow-free row spacing. Every choice is explained in the &ldquo;Why this
            layout?&rdquo; panel afterwards — and everything stays editable.
          </p>
        </Dialog>
      )}

      {whySheet && (
        <Sheet title="Why this layout?" onClose={() => setWhySheet(false)}>
          {(project.designLog ?? []).length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
              No automatic design has run yet — use Auto-fill to generate one.
            </p>
          )}
          {(project.designLog ?? []).map((d) => (
            <div key={d.id} className="card" style={{ marginBottom: 8, padding: 10 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800 }}>{d.topic}</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '2px 0' }}>{d.choice}</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{d.reason}</div>
              <div style={{ fontSize: 10, color: 'var(--ink-3)', marginTop: 4, fontFamily: 'var(--mono)' }}>
                {d.inputs.join(' · ')}
              </div>
            </div>
          ))}
          {memoizedInsights(project).length > 0 && (
            <>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: 'var(--ink-3)', margin: '12px 0 6px' }}>
                COPILOT SUGGESTIONS
              </div>
              {memoizedInsights(project).map((i) => (
                <div key={i.key} className="card" style={{ marginBottom: 8, padding: 10, borderLeft: `3px solid ${i.severity === 'warning' ? '#f59e0b' : '#22d3ee'}` }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{i.title}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{i.detail}</div>
                </div>
              ))}
            </>
          )}
        </Sheet>
      )}

      {confirmClear && (
        <Dialog
          title="Clear all panels?"
          icon={<Trash2 />}
          onClose={() => setConfirmClear(false)}
          actions={
            <>
              <button className="btn btn-secondary" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  patch({ panels: [], segments: [], strings: [] }, true);
                  setSelectedIds([]);
                  setConfirmClear(false);
                }}
              >
                Clear all
              </button>
            </>
          }
        >
          <p>
            This removes all {project.panels.length} panels and their strings from the
            canvas. You can undo this action.
          </p>
        </Dialog>
      )}

      {tableSheet && selectedSegment && (() => {
        const seg = selectedSegment;
        const segPanels = project.panels.filter((p) => p.segmentId === seg.id);
        const kwp = Math.round(((segPanels.length * spec.watt) / 1000) * 10) / 10;
        const isFlush = seg.racking.kind === 'flush';
        const tilt = seg.racking.kind !== 'flush' ? seg.racking.tiltDeg : 0;
        const az = seg.azimuthDeg;
        const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8];
        const seg2 = seg.racking;
        const rowStyle = { display: 'flex', gap: 6, marginBottom: 12 } as const;
        const lbl = { fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--editor-ink-2)', margin: '2px 0 6px' } as const;
        const seg3btn = (active: boolean) => ({
          flex: 1, minHeight: 30, fontSize: 12, fontWeight: 700, borderRadius: 8,
          border: '1px solid var(--editor-line)', cursor: 'pointer',
          background: active ? 'var(--accent, #22c55e)' : 'var(--editor-surface, transparent)',
          color: active ? '#08130c' : 'var(--editor-ink)',
        });
        return (
          <Sheet title="Table settings" icon={<Settings2 />} onClose={() => setTableSheet(false)}>
            <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 14, color: 'var(--editor-ink-2)' }}>
              {seg.label} · {seg.rows}×{seg.cols} · {segPanels.length} panels · {kwp} kWp
            </div>

            {(() => {
              const roofFor = project.roofs.find((r) => r.id === seg.roofId);
              const resolved = roofFor ? resolveRacking(project, roofFor, seg, spec) : null;
              // preset MATCH is DERIVED from resolved state — never stored
              const isStd =
                resolved != null && resolved.tiltDeg === 10 && resolved.frontLegM < 1;
              const isWalk = resolved != null && resolved.frontLegM >= 2.2;
              const isFlushP = seg.racking.kind === 'flush';
              const isCustom = !isFlushP && !isStd && !isWalk;
              const presetBtn = (
                active: boolean,
                onClick: () => void,
                label: string,
                preview: React.ReactNode,
              ) => (
                <button
                  key={label}
                  onClick={onClick}
                  style={{
                    ...(seg3btn(active) as React.CSSProperties),
                    flex: 1,
                    height: 'auto',
                    padding: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    alignItems: 'center',
                  }}
                >
                  {preview}
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{label}</span>
                </button>
              );
              const stdRacking =
                resolved != null
                  ? { ...resolved, tiltDeg: 10, frontLegM: 0.3, backLegM: 0.3 + 0.396 }
                  : null;
              const walkRacking =
                resolved != null
                  ? { ...resolved, tiltDeg: 10, frontLegM: 2.2, backLegM: 2.2 + 0.396 }
                  : null;
              const fallback = resolveRacking(
                project,
                roofFor ?? project.roofs[0],
                { ...seg, racking: { kind: 'fixed_tilt', tiltDeg: 10, rowPitchM: 0, frontLegM: 0.3, backLegM: 0.7, profile: STRUCTURE_PROFILES[0] } },
                spec,
              );
              // A ground table is founded in earth, not clamped to a slab, so
              // the rooftop presets (flush / walk-under) do not apply to it —
              // and the ground presets do not apply to a roof. Show one set.
              const isGround = roofFor?.roofType === 'ground';
              const groundTilt = resolveRules().defaults.groundTiltDeg;
              const groundRacking =
                resolved != null ? { ...resolved, tiltDeg: groundTilt } : null;
              const foundation = resolved?.foundation;
              if (isGround)
                return (
                  <>
                    <div style={lbl as React.CSSProperties}>
                      Foundation{isCustom ? ' · custom' : ''}
                    </div>
                    <div style={{ ...rowStyle, alignItems: 'stretch' }}>
                      {presetBtn(
                        foundation === 'pile',
                        () => applyPreset('ground_pile'),
                        'Driven pile',
                        <StructurePreview racking={groundRacking ?? fallback} spec={spec} width={96} height={56} />,
                      )}
                      {presetBtn(
                        foundation === 'ballast',
                        () => applyPreset('ground_ballast'),
                        'Ballasted',
                        <StructurePreview racking={groundRacking ?? fallback} spec={spec} width={96} height={56} />,
                      )}
                    </div>
                    <div className="hint" style={{ marginTop: 6 }}>
                      Embedment depth and pull-out capacity depend on the soil —
                      a site survey and engineer sign-off are required.
                    </div>
                  </>
                );
              return (
                <>
                  <div style={lbl as React.CSSProperties}>
                    Structure preset{isCustom ? ' · custom' : ''}
                  </div>
                  <div style={{ ...rowStyle, alignItems: 'stretch' }}>
                    {presetBtn(isFlushP, () => applyPreset('flush'), 'Flush', (
                      <StructurePreview racking={null} spec={spec} flush width={96} height={56} />
                    ))}
                    {presetBtn(isStd, () => applyPreset('standard'), 'Standard 10°', (
                      <StructurePreview racking={stdRacking ?? fallback} spec={spec} width={96} height={56} />
                    ))}
                    {presetBtn(isWalk, () => applyPreset('walkunder'), 'Walk-under 2.2 m', (
                      <StructurePreview racking={walkRacking ?? fallback} spec={spec} width={96} height={56} />
                    ))}
                  </div>
                </>
              );
            })()}

            <div style={lbl as React.CSSProperties}>Racking</div>
            <div style={rowStyle}>
              {(['flush', 'fixed_tilt', 'dual_tilt'] as const).map((k) => (
                <button key={k} style={seg3btn(seg.racking.kind === k) as React.CSSProperties} onClick={() => applyRacking(k)}>
                  {k === 'flush' ? 'Flush' : k === 'fixed_tilt' ? 'Fixed tilt' : 'Dual tilt'}
                </button>
              ))}
            </div>

            {!isFlush && (
              <>
                <div style={lbl as React.CSSProperties}>Panel tilt · {tilt}°</div>
                <div style={rowStyle}>
                  <button className="tool-btn" onClick={() => applyTilt(tilt - 1)}>−</button>
                  <input
                    type="range" min={0} max={35} value={tilt}
                    onChange={(e) => applyTilt(Number(e.target.value))}
                    style={{ flex: 1 }}
                    aria-label="Panel tilt"
                  />
                  <button className="tool-btn" onClick={() => applyTilt(tilt + 1)}>+</button>
                </div>
              </>
            )}

            {!isFlush &&
              project.location &&
              (() => {
                const loc = project.location;
                const collectorLen = (seg.orientation === 'portrait' ? spec.lengthMm : spec.widthMm) / 1000;
                const pitch = shadowFreePitchM(loc.latLng.lat, loc.latLng.lng, tilt, collectorLen, az);
                const g = gcr(collectorLen, pitch);
                return (
                  <div
                    style={{
                      border: '1px solid var(--editor-line)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      marginBottom: 12,
                      fontSize: 12,
                    }}
                  >
                    <div style={lbl as React.CSSProperties}>Inter-row shading · winter shadow-free</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--editor-ink-2)' }}>Recommended row pitch</span>
                      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{pitch.toFixed(2)} m</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <span style={{ color: 'var(--editor-ink-2)' }}>Ground coverage (GCR)</span>
                      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{g.toFixed(2)}</b>
                    </div>
                    <button
                      className="btn"
                      style={{ width: '100%', marginTop: 10, minHeight: 30, fontSize: 12, fontWeight: 700 }}
                      onClick={() => applyRespace(pitch)}
                    >
                      Apply shadow-free spacing
                    </button>
                  </div>
                );
              })()}

            <div style={lbl as React.CSSProperties}>Azimuth (facing) · {az}° {dir}</div>
            <div style={rowStyle}>
              <button className="tool-btn" onClick={() => applyAzimuth(az - 5)}>−</button>
              <button style={{ ...seg3btn(az === 180), flex: 'none', padding: '0 12px' } as React.CSSProperties} onClick={() => applyAzimuth(180)}>Due S</button>
              <button
                style={{ ...seg3btn(az === (selectedSegRoof?.slopeAzimuthDeg ?? 180)), flex: 'none', padding: '0 12px' } as React.CSSProperties}
                onClick={() => applyAzimuth(selectedSegRoof?.slopeAzimuthDeg ?? 180)}
              >
                Roof slope
              </button>
              <button className="tool-btn" onClick={() => applyAzimuth(az + 5)}>+</button>
            </div>

            {!isFlush && seg2.kind !== 'flush' && (
              <>
                <div style={lbl as React.CSSProperties}>Structure profile</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {STRUCTURE_PROFILES.map((p) => (
                    <button
                      key={p.key}
                      style={{ ...seg3btn(seg2.profile.key === p.key), flex: 'none', padding: '0 12px' } as React.CSSProperties}
                      onClick={() => applyProfile(p.key)}
                    >
                      {p.label} <span style={{ opacity: 0.6, fontSize: 10 }}>{p.kgPerM} kg/m</span>
                    </button>
                  ))}
                </div>

                {(() => {
                  const roofFor = project.roofs.find((r) => r.id === seg.roofId);
                  const resolved = roofFor ? resolveRacking(project, roofFor, seg, spec) : null;
                  if (!resolved || !roofFor) return null;
                  const struct = buildStructure(seg, spec, roofFor, resolved, project.panels);
                  const drc = validateStructure(struct);
                  const ms = struct.memberSummary;
                  const rows: [string, number, number][] = [
                    ['Legs (front+back)', ms.front_leg.count + ms.back_leg.count, ms.front_leg.totalM + ms.back_leg.totalM],
                    ['Rafters', ms.rafter.count, ms.rafter.totalM],
                    ['Purlins', ms.purlin.count, ms.purlin.totalM],
                    ['Braces', ms.brace.count, ms.brace.totalM],
                  ];
                  return (
                    <>
                      <div style={lbl as React.CSSProperties}>Structure (member model)</div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <StructurePreview racking={resolved} spec={spec} width={120} height={80} />
                        <div style={{ flex: 1, fontSize: 11.5, color: 'var(--editor-ink-2)' }}>
                          {rows.map(([label, count, m]) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>{label}</span>
                              <span>{count} · {Math.round(m * 10) / 10} m</span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, marginTop: 4, borderTop: '1px solid var(--editor-line)', paddingTop: 4 }}>
                            <span>Steel ({resolved.profile.label})</span>
                            <span>{struct.steelKg} kg</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                        <label style={{ fontSize: 11, color: 'var(--editor-ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          Leg spacing
                          <input
                            type="number" min={0.5} max={4} step={0.1}
                            value={resolved.legSpacingM}
                            aria-label="Leg spacing in meters"
                            style={{ width: 62, padding: '4px 6px' }}
                            onChange={(e) => applyStructureFields({ legSpacingM: Math.max(0.5, Math.min(4, Number(e.target.value) || 2)) })}
                          /> m
                        </label>
                        <label style={{ fontSize: 11, color: 'var(--editor-ink-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          Clearance
                          <input
                            type="number" min={0} max={3} step={0.1}
                            value={Math.round(resolved.frontLegM * 10) / 10}
                            aria-label="Under-structure clearance in meters"
                            style={{ width: 62, padding: '4px 6px' }}
                            onChange={(e) => applyStructureFields({ clearanceM: Math.max(0, Math.min(3, Number(e.target.value) || 0)) })}
                          /> m
                        </label>
                        {(['anchor', 'ballast'] as const).map((f) => (
                          <button
                            key={f}
                            style={{ ...seg3btn(resolved.foundation === f), flex: 'none', padding: '0 10px' } as React.CSSProperties}
                            onClick={() => applyStructureFields({ foundation: f })}
                          >
                            {f === 'anchor' ? 'Anchored' : 'Ballasted'}
                          </button>
                        ))}
                      </div>
                      {drc.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--bad, #ef4444)', marginTop: 6 }}>
                          {drc[0]} {drc.length > 1 ? `(+${drc.length - 1} more)` : ''}
                        </div>
                      )}
                      {struct.warnings.map((w) => (
                        <div key={w} style={{ fontSize: 10.5, color: 'var(--warn, #f59e0b)', marginTop: 4 }}>{w}</div>
                      ))}
                      <div style={{ fontSize: 10, color: 'var(--editor-ink-3, #888)', marginTop: 6 }}>
                        {STRUCTURE_DISCLAIMER}
                      </div>
                    </>
                  );
                })()}
              </>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 18, borderTop: '1px solid var(--editor-line)', paddingTop: 14 }}>
              <button
                className="btn"
                style={{ flex: 1, minHeight: 32, fontSize: 12, fontWeight: 700 }}
                onClick={duplicateTable}
              >
                Duplicate table
              </button>
              <button
                className="btn"
                style={{ flex: 1, minHeight: 32, fontSize: 12, fontWeight: 700, color: 'var(--bad, #ef4444)' }}
                onClick={deleteTable}
              >
                Delete table
              </button>
            </div>
          </Sheet>
        );
      })()}

      {issuesSheet && (
        <Sheet
          title="System validation"
          icon={<AlertTriangle />}
          onClose={() => setIssuesSheet(false)}
        >
          {issues.length === 0 ? (
            <EmptyState icon={<CheckCircle2 size={28} />} text="All design checks pass" />
          ) : (
            issues.map((iss, i) => {
              const focus = (iss.focusPanelIds ?? []).filter((id) =>
                project.panels.some((p) => p.id === id),
              );
              return (
              <div
                key={`${iss.code}-${i}`}
                className="card"
                role={focus.length ? 'button' : undefined}
                onClick={
                  focus.length
                    ? () => {
                        activate('select');
                        setSelectedIds(focus);
                        setIssuesSheet(false);
                        // bring the offending panels to the centre of the view
                        const pts = project.panels.filter((p) => focus.includes(p.id));
                        if (pts.length) {
                          const cx = pts.reduce((s, p) => s + p.center.x, 0) / pts.length;
                          const cy = pts.reduce((s, p) => s + p.center.y, 0) / pts.length;
                          canvasRef.current?.centerOn({ x: cx, y: cy });
                        }
                      }
                    : undefined
                }
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  marginBottom: 8,
                  padding: '12px 14px',
                  cursor: focus.length ? 'pointer' : 'default',
                }}
              >
                {iss.level === 'error' ? (
                  <XCircle size={16} style={{ color: 'var(--bad)', flex: 'none', marginTop: 1 }} />
                ) : (
                  <AlertTriangle
                    size={16}
                    style={{ color: 'var(--warn)', flex: 'none', marginTop: 1 }}
                  />
                )}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
                    {iss.message}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: 'var(--ink-3)',
                      marginTop: 3,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      fontWeight: 700,
                    }}
                  >
                    {iss.level === 'error' ? 'Error' : 'Warning'} · {iss.code}
                    {focus.length > 0 && ' · tap to locate →'}
                  </div>
                  {/* A block with no way out is a wall; this is the door. The
                      unstrung/capacity errors are the ones auto-stringing can
                      actually answer, so the fix sits ON the error that names
                      the problem — not three menus away. */}
                  {(iss.code === 'unstrung_panels' || iss.code === 'mppt_capacity') && (
                    <button
                      className="btn btn-primary"
                      style={{ minHeight: 28, padding: '4px 12px', fontSize: 12, marginTop: 8 }}
                      onClick={(e) => {
                        e.stopPropagation(); // don't also trigger tap-to-locate
                        setIssuesSheet(false);
                        doAutoString();
                      }}
                    >
                      Auto-string now
                    </button>
                  )}
                </div>
              </div>
              );
            })
          )}
        </Sheet>
      )}

      {stringSheet && (
        <Sheet title="Stringing" icon={<Cable />} onClose={() => setStringSheet(false)}>
          <OptionCard
            icon={<Wand2 size={18} />}
            title="Auto string"
            sub="Group panels into optimised strings, validated against the inverter MPPT voltage windows"
            onClick={doAutoString}
          />
          <OptionCard
            icon={<Hand size={18} />}
            title="Manual string"
            sub="Tap panels one by one to build custom strings"
            onClick={() => {
              setStringSheet(false);
              setTool('select');
              setSelectedIds([]);
              setManualString([]);
            }}
          />
          {project.strings.length > 0 && (
            <button
              className="btn btn-danger btn-block"
              style={{ marginTop: 6 }}
              onClick={() => {
                patch({ strings: [] }, true);
                setStringSheet(false);
              }}
            >
              <Trash2 />
              Clear strings
            </button>
          )}
        </Sheet>
      )}

      {stringInfo && (
        <Sheet title="String connections" icon={<Info />} onClose={() => setStringInfo(false)}>
          {project.strings.length === 0 ? (
            <EmptyState
              icon={<Cable size={28} />}
              text="No strings yet — open the Stringing tool to auto-string or build them manually."
            />
          ) : (
            project.strings.map((s) => (
              <div key={s.id} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: s.color }} />
                  <b style={{ fontSize: 13.5 }}>{s.name}</b>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                    INV {s.inverterIndex + 1} · MPPT {s.mpptIndex + 1}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
                  <span
                    style={{
                      background: 'var(--bad)',
                      color: '#fff',
                      borderRadius: 5,
                      padding: '3px 5px',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                    aria-label="Inverter DC input"
                  >
                    <Zap size={10} fill="#fff" />
                  </span>
                  {s.panelIds.map((_, i) => (
                    <span
                      key={i}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    >
                      <ChevronRight size={11} style={{ color: 'var(--ink-3)' }} />
                      <span
                        style={{
                          display: 'inline-flex',
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          background: s.color,
                          color: '#fff',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 10.5,
                        }}
                      >
                        {i + 1}
                      </span>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 6 }}>
                  {s.panelIds.length} panels ·{' '}
                  {Math.round(s.panelIds.length * spec.vocV)}V string Voc (STC)
                </div>
              </div>
            ))
          )}
        </Sheet>
      )}
    </div>
  );
}

// ─── selection context bar (SVG-anchored, constant screen size) ─────────────

function SelectionContextBar({
  panels,
  locked,
  growShape,
  onGrow,
  onGrowPreview,
  onTableSettings,
  canGroup,
  onGroup,
  onToggleEnable,
  onRotate,
  onTilt,
  onDelete,
  onClear,
}: {
  panels: PlacedPanel[];
  locked: boolean;
  growShape: SelectionShape;
  onGrow: (axis: GrowAxis, side: GrowSide, count: number) => void;
  onGrowPreview: (axis: GrowAxis, side: GrowSide, count: number) => XY[][];
  onTableSettings: () => void;
  canGroup: boolean;
  onGroup: () => void;
  onToggleEnable: () => void;
  onRotate: (deltaDeg: number) => void;
  onTilt: (deltaDeg: number) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const frame = useCanvasFrame();
  const [growOpen, setGrowOpen] = useState(false);
  const [axis, setAxis] = useState<GrowAxis>('row');
  const [side, setSide] = useState<GrowSide>('bottom');
  const [count, setCount] = useState(1);
  const canGrow = growShape.kind !== 'other' && !locked;
  const growGhost = useMemo(
    () => (growOpen && canGrow ? onGrowPreview(axis, side, count) : []),
    [growOpen, canGrow, axis, side, count, onGrowPreview],
  );
  if (panels.length === 0) return null;
  const c = frame.toPx({
    x: panels.reduce((s, p) => s + p.center.x, 0) / panels.length,
    y: panels.reduce((s, p) => s + p.center.y, 0) / panels.length,
  });
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
  const W = 340;
  const H = 104;
  return (
    <>
      {/* live grow ghost — where the new rows/columns will land, before Apply */}
      {growGhost.map((corners, i) => (
        <path
          key={i}
          d={polyPath(frame, corners)}
          fill="rgba(34,197,94,0.4)"
          stroke="#16a34a"
          strokeWidth={1}
        />
      ))}
      <g transform={`translate(${c.x}, ${c.y}) scale(${1 / frame.zoom})`}>
      <foreignObject
        x={-W / 2}
        y={-(H + 24)}
        width={W}
        height={H}
        style={{ overflow: 'visible' }}
      >
        <div
          onPointerDown={stop}
          onPointerUp={stop}
          onClick={stop}
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            height: '100%',
            position: 'relative',
          }}
        >
          <div
            className="context-bar"
            style={{ position: 'static' }}
            role="toolbar"
            aria-label="Panel selection actions"
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: 'var(--editor-ink-2)',
                padding: '0 7px',
                whiteSpace: 'nowrap',
              }}
            >
              {panels.length}
            </span>
            {canGroup && (
              <button
                className="tool-btn"
                data-tip="Group into a table"
                aria-label="Group selected panels into a table"
                onClick={onGroup}
              >
                <Grid3x3 />
              </button>
            )}
            {canGrow && (
              <button
                className="tool-btn"
                data-tip="Add rows / columns"
                aria-label="Add rows or columns"
                style={growOpen ? { color: 'var(--accent, #22c55e)' } : undefined}
                onClick={() => {
                  setAxis(growShape.kind === 'column' ? 'column' : 'row');
                  setSide(growShape.kind === 'column' ? 'right' : 'bottom');
                  setCount(1);
                  setGrowOpen((o) => !o);
                }}
              >
                <Plus />
              </button>
            )}
            {canGrow && (
              <button
                className="tool-btn"
                data-tip="Table settings (racking, tilt, azimuth)"
                aria-label="Table settings"
                onClick={onTableSettings}
              >
                <Settings2 />
              </button>
            )}
            <button
              className="tool-btn"
              data-tip="Enable / disable"
              aria-label="Enable or disable panels"
              aria-disabled={locked || undefined}
              style={locked ? { opacity: 0.4 } : undefined}
              onClick={onToggleEnable}
            >
              <Power />
            </button>
            <button
              className="tool-btn"
              data-tip="Rotate azimuth −15°"
              aria-label="Rotate azimuth minus 15 degrees"
              aria-disabled={locked || undefined}
              style={locked ? { opacity: 0.4 } : undefined}
              onClick={() => onRotate(-15)}
            >
              <RotateCcw />
            </button>
            <button
              className="tool-btn"
              data-tip="Rotate azimuth +15°"
              aria-label="Rotate azimuth plus 15 degrees"
              aria-disabled={locked || undefined}
              style={locked ? { opacity: 0.4 } : undefined}
              onClick={() => onRotate(15)}
            >
              <RotateCw />
            </button>
            <span className="sep" />
            <button
              className="tool-btn"
              data-tip="Tilt −5° (affects yield)"
              aria-label="Decrease tilt by 5 degrees"
              aria-disabled={locked || undefined}
              style={locked ? { opacity: 0.4 } : undefined}
              onClick={() => onTilt(-5)}
            >
              <ChevronsDown />
            </button>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 800,
                color: 'var(--editor-ink-2)',
                padding: '0 2px',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}
              title="Panel tilt (min of selection)"
            >
              {Math.min(...panels.map((p) => p.tiltDeg))}°
            </span>
            <button
              className="tool-btn"
              data-tip="Tilt +5° (affects yield)"
              aria-label="Increase tilt by 5 degrees"
              aria-disabled={locked || undefined}
              style={locked ? { opacity: 0.4 } : undefined}
              onClick={() => onTilt(5)}
            >
              <ChevronsUp />
            </button>
            <span className="sep" />
            <button
              className="tool-btn"
              data-tip={'Delete panels\nDel'}
              aria-label="Delete selected panels"
              aria-disabled={locked || undefined}
              style={locked ? { opacity: 0.4 } : undefined}
              onClick={onDelete}
            >
              <Trash2 />
            </button>
            <span className="sep" />
            <button
              className="tool-btn"
              data-tip={'Clear selection\nEsc'}
              aria-label="Clear selection"
              onClick={onClear}
            >
              <X />
            </button>
          </div>

          {growOpen && canGrow && (
            <div
              className="context-bar"
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: '50%',
                transform: 'translateX(-50%)',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                padding: 10,
                minWidth: 190,
              }}
            >
              <div style={{ display: 'flex', gap: 6 }}>
                {(['row', 'column'] as GrowAxis[]).map((a) => (
                  <button
                    key={a}
                    className="tool-btn"
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'capitalize',
                      background: axis === a ? 'var(--accent, #22c55e)' : undefined,
                      color: axis === a ? '#08130c' : undefined,
                    }}
                    onClick={() => {
                      setAxis(a);
                      setSide(a === 'row' ? 'bottom' : 'right');
                    }}
                  >
                    {a}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--editor-ink-2)' }}>
                <span>Count</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button className="tool-btn" onClick={() => setCount((n) => Math.max(1, n - 1))}>−</button>
                  <span style={{ minWidth: 16, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
                  <button className="tool-btn" onClick={() => setCount((n) => Math.min(20, n + 1))}>+</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(axis === 'row' ? (['top', 'bottom'] as GrowSide[]) : (['left', 'right'] as GrowSide[])).map((s) => (
                  <button
                    key={s}
                    className="tool-btn"
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'capitalize',
                      background: side === s ? 'var(--accent, #22c55e)' : undefined,
                      color: side === s ? '#08130c' : undefined,
                    }}
                    onClick={() => setSide(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-primary"
                style={{ minHeight: 30, fontSize: 12, fontWeight: 700 }}
                onClick={() => {
                  onGrow(axis, side, count);
                  setGrowOpen(false);
                }}
              >
                Add {count} {axis}
                {count > 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      </foreignObject>
      </g>
    </>
  );
}

// ─── SVG layers ─────────────────────────────────────────────────────────────

function EditorLayers({
  heatmap,
  heatResult,
  heatMonth,
  showStrings,
  routeDrag,
  manualString,
  dragLine,
  panelDrag,
  marquee,
  hoverPoint,
  walkwayWidthMm,
  selected,
  tool,
}: {
  heatmap: boolean;
  heatResult: HeatmapResult | null;
  heatMonth: number;
  showStrings: boolean;
  routeDrag: { routeId: string; index: number; pos: XY; insert?: boolean } | null;
  manualString: string[] | null;
  dragLine: { a: XY; b: XY } | null;
  panelDrag: { id: string; start: XY; pos: XY; shift: boolean } | null;
  marquee: { a: XY; b: XY } | null;
  hoverPoint: XY | null;
  walkwayWidthMm: number;
  selected: string[];
  tool: Tool;
}) {
  const project = useActiveProject()!;
  const frame = useCanvasFrame();
  const spec = project.components.panel!;
  const pxPerM = frame.sizePx / frame.spanM;
  const byId = new Map(project.panels.map((p) => [p.id, p]));

  // Live preview for the panel-table (drag-fill) tool: the drawn rectangle AND a
  // ghost of the panels that would land there — already obstruction/setback-aware
  // (autoFillRoof honours every blocker), so the user SEES panels avoid keepouts
  // and obstructions as they drag, instead of just a line.
  const tablePreview = useMemo(() => {
    if (tool !== 'panels' || !dragLine) return null;
    const minX = Math.min(dragLine.a.x, dragLine.b.x);
    const maxX = Math.max(dragLine.a.x, dragLine.b.x);
    const minY = Math.min(dragLine.a.y, dragLine.b.y);
    const maxY = Math.max(dragLine.a.y, dragLine.b.y);
    if (maxX - minX < 0.2 || maxY - minY < 0.2) return { panels: [], minX, maxX, minY, maxY, angle: 0 };
    const area: XY[] = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
    const roof = pickRoofAt(dragLine.a, project.roofs) ?? project.roofs[0];
    if (!roof) return { panels: [], minX, maxX, minY, maxY, roof: undefined };
    const panels = autoFillRoof(
      project,
      roof,
      spec,
      { orientation: 'portrait', gapM: 0.05, grouped: true, avoidPanels: project.panels },
      area,
    );
    return { panels, minX, maxX, minY, maxY, roof };
  }, [tool, dragLine, project, spec]);

  // Live single-panel ghost: where a click would drop ONE panel, snapped to the
  // roof grid — green if it fits, red if it would overlap or breach the setback.
  const singleGhost = useMemo(() => {
    if (tool !== 'panels' || !hoverPoint || dragLine) return null;
    const roof = pickRoofAt(hoverPoint, project.roofs);
    if (!roof) return null;
    const c = snapPanelCenter(project, roof, spec, hoverPoint, 'portrait');
    const fits = panelFitsAt(project, roof, spec, c, 'portrait');
    const cand: PlacedPanel = {
      id: 'ghost',
      roofId: roof.id,
      center: c,
      orientation: 'portrait',
      azimuthDeg: 0,
      tiltDeg: 0,
      solarAccess: 1,
      enabled: true,
    };
    return {
      corners: panelCornersOnRoof(cand, spec, roof),
      fits,
    };
  }, [tool, hoverPoint, dragLine, project, spec]);

  // Erase preview: outline the panel the cursor is about to remove.
  const eraseGhost = useMemo(() => {
    if (tool !== 'erase' || !hoverPoint) return null;
    const hit = project.panels.find(
      (p) => Math.hypot(hoverPoint.x - p.center.x, hoverPoint.y - p.center.y) < 1.3,
    );
    if (!hit) return null;
    const roof = project.roofs.find((r) => r.id === hit.roofId);
    return panelCornersOnRoof(hit, spec, roof);
  }, [tool, hoverPoint, project, spec]);

  // Inverter preview: snap a ghost marker to the nearest wall edge (< 4 m).
  const inverterGhost = useMemo(() => {
    if (tool !== 'inverter' || !hoverPoint) return null;
    let best: { pos: XY; d: number } | null = null;
    for (const roof of project.roofs) {
      for (let i = 0; i < roof.polygon.length; i++) {
        const a = roof.polygon[i];
        const b = roof.polygon[(i + 1) % roof.polygon.length];
        const { d, t } = pointSegDist(hoverPoint, a, b);
        if (!best || d < best.d)
          best = { pos: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, d };
      }
    }
    return best && best.d < 4 ? best.pos : null;
  }, [tool, hoverPoint, project]);

  // Arrester preview: ghost marker where it would drop (only over a roof).
  const arresterGhost =
    tool === 'arrester' && hoverPoint && pickRoofAt(hoverPoint, project.roofs)
      ? hoverPoint
      : null;

  // Real rasterised heatmap cells projected to 2D screen space (same grid as 3D).
  const heatCells = useMemo(() => {
    if (!heatmap || !heatResult) return null;
    const s = heatResult.stepM * pxPerM;
    return heatResult.cells.map((c) => {
      const px = frame.toPx({ x: c.world[0], y: -c.world[2] }); // world[0]=planX, -world[2]=planY
      return { x: px.x - s / 2, y: px.y - s / 2, s, color: `#${heatColor(c.monthly[heatMonth]).getHexString()}` };
    });
  }, [heatmap, heatResult, heatMonth, frame, pxPerM]);

  return (
    <>
      {/* roofs */}
      {project.roofs.map((r) => {
        const insetRegions = insetPolygonRobust(
          r.polygon,
          r.perEdgeSetbacksM ?? r.polygon.map(() => r.setbackM),
        );
        return (
          <g key={r.id}>
            <path
              d={polyPath(frame, r.polygon)}
              fill={
                heatmap
                  ? heatResult
                    ? 'rgba(20,24,28,0.55)' // neutral base; the real cells colour it
                    : 'rgba(251,146,60,0.5)'
                  : 'rgba(59,130,246,0.32)'
              }
              stroke={heatmap ? '#fb923c' : '#3b82f6'}
              strokeWidth={2}
            />
            {heatmap && !heatResult && (
              <path d={polyPath(frame, r.polygon)} fill="url(#irr)" opacity={0.55} />
            )}
            {insetRegions.map((reg, ri) => (
              <path
                key={ri}
                d={polyPath(frame, reg)}
                fill="none"
                stroke="#f87171"
                strokeWidth={1}
                strokeDasharray="6 4"
              />
            ))}
          </g>
        );
      })}
      <defs>
        <radialGradient id="irr">
          <stop offset="0%" stopColor="#fde047" />
          <stop offset="60%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ef4444" />
        </radialGradient>
        <pattern
          id="ko-hatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="#f97316" fillOpacity="0.14" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#f97316" strokeWidth="2" strokeOpacity="0.55" />
        </pattern>
      </defs>

      {/* real rasterised solar-access heatmap (same engine as 3D) */}
      {heatCells && (
        <g opacity={0.72}>
          {heatCells.map((c, i) => (
            <rect key={i} x={c.x} y={c.y} width={c.s} height={c.s} fill={c.color} shapeRendering="crispEdges" />
          ))}
        </g>
      )}

      {/* walkways */}
      {project.walkways.map((w) => (
        <line
          key={w.id}
          x1={frame.toPx(w.a).x}
          y1={frame.toPx(w.a).y}
          x2={frame.toPx(w.b).x}
          y2={frame.toPx(w.b).y}
          stroke="#fbbf24"
          strokeWidth={(w.widthMm / 1000) * pxPerM}
          strokeLinecap="round"
          opacity={0.85}
        />
      ))}
      {/* rails */}
      {project.rails.map((r) => (
        <line
          key={r.id}
          x1={frame.toPx(r.a).x}
          y1={frame.toPx(r.a).y}
          x2={frame.toPx(r.b).x}
          y2={frame.toPx(r.b).y}
          stroke="#ef4444"
          strokeWidth={2.5}
          strokeDasharray="10 5"
        />
      ))}

      {/* panels */}
      {project.panels.map((p) => {
        const roof = project.roofs.find((r) => r.id === p.roofId);
        const corners = panelCornersOnRoof(p, spec, roof);
        const inString = manualString?.includes(p.id);
        const isSelected = selected.includes(p.id);
        const stringOf = project.strings.find((s) => s.panelIds.includes(p.id));
        const access = p.solarAccess ?? 1;
        const accessColor =
          access > 0.95 ? '#16a34a' : access > 0.85 ? '#eab308' : '#dc2626';
        return (
          <path
            key={p.id}
            d={polyPath(frame, corners)}
            fill={
              !p.enabled
                ? 'rgba(100,116,139,0.35)'
                : heatmap
                  ? accessColor
                  : '#0f2a5c'
            }
            stroke={
              inString
                ? '#facc15'
                : isSelected
                  ? '#38bdf8'
                  : stringOf && showStrings
                    ? stringOf.color
                    : '#93c5fd'
            }
            strokeWidth={inString || isSelected ? 2.6 : 1.2}
            opacity={p.enabled ? 0.96 : 0.5}
            style={{ cursor: tool === 'select' || tool === 'erase' ? 'pointer' : undefined }}
          />
        );
      })}

      {/* No-build zones. Drawn ABOVE the panels on purpose: a zone is a CONSTRAINT
          annotation, and when it conflicts with panels already placed the DRC error
          is unreadable if the panels hide the zone that caused it. The fill is
          light enough to read the modules through. */}
      {project.keepouts.map((k) => (
        <polygon
          key={k.id}
          points={k.shape.map((v) => { const q = frame.toPx(v); return `${q.x},${q.y}`; }).join(' ')}
          fill="url(#ko-hatch)"
          stroke="#f97316"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
      ))}

      {/* string routing */}
      {showStrings &&
        project.strings.map((s) => {
          const pts = s.panelIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .map((p) => frame.toPx(p!.center));
          if (pts.length < 2) return null;
          const d =
            `M ${pts[0].x} ${pts[0].y} ` +
            pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ');
          return (
            <path
              key={s.id}
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={1.8}
              strokeDasharray="5 3"
              opacity={0.9}
            />
          );
        })}

      {/* Routed home runs (Phase 10). Drawn with the strings because they ARE
          the string's copper — solid, so the routed run reads differently from
          the dashed series path, and visible BEFORE it is editable: a cable
          quantity nobody can see is a number nobody can check. */}
      {showStrings &&
        (project.cableRoutes ?? []).map((r) => {
          // preview the corner under the pointer without touching the store
          const live =
            routeDrag && routeDrag.routeId === r.id
              ? routeDrag.insert
                ? [
                    ...r.waypoints.slice(0, routeDrag.index),
                    routeDrag.pos,
                    ...r.waypoints.slice(routeDrag.index),
                  ]
                : r.waypoints.map((w, i) => (i === routeDrag.index ? routeDrag.pos : w))
              : r.waypoints;
          const pts = live.map((w) => frame.toPx(w));
          if (pts.length < 2) return null;
          const colour =
            project.strings.find((st) => st.id === r.fromRef)?.color ?? '#38bdf8';
          const d =
            `M ${pts[0].x} ${pts[0].y} ` +
            pts.slice(1).map((q) => `L ${q.x} ${q.y}`).join(' ');
          return (
            <g key={r.id}>
              <path d={d} fill="none" stroke="#000" strokeWidth={3.2} opacity={0.35} />
              <path d={d} fill="none" stroke={colour} strokeWidth={1.6} opacity={0.95} />
              {/* draggable corners (§H): grab one to re-route the run by hand.
                  Drawn larger than they look — the visible dot is 3px but the
                  hit target is ~0.9 m in plan, so it stays grabbable at any zoom. */}
              {pts.slice(1, -1).map((q, i) => (
                <circle
                  key={i}
                  cx={q.x}
                  cy={q.y}
                  r={routeDrag?.routeId === r.id && routeDrag.index === i + 1 ? 4.2 : 3}
                  fill={colour}
                  stroke="#000"
                  strokeWidth={0.8}
                  style={{ cursor: 'grab' }}
                />
              ))}
              {r.manual && pts.length > 1 && (
                <title>{`${r.id} — hand-routed (auto-string will not change it)`}</title>
              )}
            </g>
          );
        })}

      {/* obstructions */}
      <ObstructionLayer obstructions={project.obstructions} />

      {/* arresters — markers keep constant screen size across zoom */}
      {project.arresters.map((la) => {
        const c = frame.toPx(la.pos);
        return (
          <g key={la.id} transform={`translate(${c.x}, ${c.y}) scale(${1 / frame.zoom})`}>
            <circle r={9} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />
            <Zap
              x={-5}
              y={-5}
              width={10}
              height={10}
              color="#fff"
              fill="#fff"
              strokeWidth={1.5}
            />
          </g>
        );
      })}

      {/* inverter placements — markers keep constant screen size across zoom */}
      {project.gridConnection &&
        (() => {
          const q = frame.toPx(project.gridConnection.pos);
          return (
            <g>
              <rect x={q.x - 7} y={q.y - 7} width={14} height={14} rx={3}
                fill="#0ea5e9" stroke="#0b1220" strokeWidth={1.5} />
              <text x={q.x} y={q.y + 3.4} textAnchor="middle" fontSize={8}
                fontWeight={800} fill="#fff">M</text>
            </g>
          );
        })()}

      {project.inverterPlacements.map((ip) => {
        const roof = project.roofs.find((r) => r.id === ip.roofId);
        if (!roof) return null;
        const a = roof.polygon[ip.edgeIndex];
        const b = roof.polygon[(ip.edgeIndex + 1) % roof.polygon.length];
        const pos = frame.toPx({
          x: a.x + (b.x - a.x) * ip.t,
          y: a.y + (b.y - a.y) * ip.t,
        });
        return (
          <g key={ip.id} transform={`translate(${pos.x}, ${pos.y}) scale(${1 / frame.zoom})`}>
            <rect
              x={-8}
              y={-10}
              width={16}
              height={20}
              rx={3}
              fill="#dc2626"
              stroke="#fff"
              strokeWidth={1.5}
            />
            <PlugZap x={-6} y={-6} width={12} height={12} color="#fff" />
          </g>
        );
      })}

      {/* marquee selection */}
      {marquee && (
        <rect
          x={Math.min(frame.toPx(marquee.a).x, frame.toPx(marquee.b).x)}
          y={Math.min(frame.toPx(marquee.a).y, frame.toPx(marquee.b).y)}
          width={Math.abs(frame.toPx(marquee.b).x - frame.toPx(marquee.a).x)}
          height={Math.abs(frame.toPx(marquee.b).y - frame.toPx(marquee.a).y)}
          fill="rgba(56,189,248,0.14)"
          stroke="#38bdf8"
          strokeWidth={1.4}
          strokeDasharray="6 4"
        />
      )}

      {/* drag ghost — where the modules will land. Outlines only, translated:
          deliberately NOT re-validated every frame (§H — the hover-preview
          rebuild was what made the earlier live-preview attempt janky). The
          move is validated once, on release, and refused as a whole. */}
      {panelDrag &&
        (() => {
          const dx = panelDrag.pos.x - panelDrag.start.x;
          const dy = panelDrag.pos.y - panelDrag.start.y;
          if (Math.hypot(dx, dy) < 0.3) return null;
          const base = selected.includes(panelDrag.id) ? selected : [panelDrag.id];
          const segs = new Set(
            project.panels
              .filter((q) => base.includes(q.id))
              .map((q) => q.segmentId)
              .filter(Boolean),
          );
          const moving = project.panels.filter(
            (q) => base.includes(q.id) || (q.segmentId && segs.has(q.segmentId)),
          );
          return (
            <g pointerEvents="none">
              {moving.map((q) => {
                const rf = project.roofs.find((r) => r.id === q.roofId);
                const pts = panelCornersOnRoof(q, spec, rf)
                  .map((c) => frame.toPx({ x: c.x + dx, y: c.y + dy }))
                  .map((c) => `${c.x},${c.y}`)
                  .join(' ');
                return (
                  <polygon
                    key={q.id}
                    points={pts}
                    fill="rgba(56,189,248,0.20)"
                    stroke="#38bdf8"
                    strokeWidth={1.4}
                  />
                );
              })}
            </g>
          );
        })()}

      {/* drag preview — the no-build rectangle, exactly as it will be committed */}
      {dragLine && tool === 'keepout' && (
        <rect
          x={Math.min(frame.toPx(dragLine.a).x, frame.toPx(dragLine.b).x)}
          y={Math.min(frame.toPx(dragLine.a).y, frame.toPx(dragLine.b).y)}
          width={Math.abs(frame.toPx(dragLine.b).x - frame.toPx(dragLine.a).x)}
          height={Math.abs(frame.toPx(dragLine.b).y - frame.toPx(dragLine.a).y)}
          fill="url(#ko-hatch)"
          stroke="#f97316"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
      )}

      {/* drag preview — the real WIDTH strip for walkway/rail (not just a line) */}
      {dragLine &&
        (tool === 'walkway' || tool === 'rail') &&
        (() => {
          const { a, b } = dragLine;
          const len = Math.hypot(b.x - a.x, b.y - a.y);
          if (len < 0.3) return null;
          const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
          const widthM = tool === 'walkway' ? walkwayWidthMm / 1000 : 0.12;
          const corners = rectCorners({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, len, widthM, ang);
          return (
            <path
              d={polyPath(frame, corners)}
              fill={tool === 'rail' ? 'rgba(239,68,68,0.3)' : 'rgba(251,191,36,0.35)'}
              stroke={tool === 'rail' ? '#ef4444' : '#fbbf24'}
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
          );
        })()}

      {/* erase preview — outline the panel about to be removed */}
      {eraseGhost && (
        <path
          d={polyPath(frame, eraseGhost)}
          fill="rgba(239,68,68,0.35)"
          stroke="#ef4444"
          strokeWidth={1.6}
        />
      )}

      {/* arrester / inverter placement ghosts (constant screen size) */}
      {arresterGhost && (
        <g
          transform={`translate(${frame.toPx(arresterGhost).x}, ${frame.toPx(arresterGhost).y}) scale(${1 / frame.zoom})`}
        >
          <circle r={9} fill="#f59e0b" opacity={0.5} stroke="#fff" strokeWidth={1.5} />
        </g>
      )}
      {inverterGhost && (
        <g
          transform={`translate(${frame.toPx(inverterGhost).x}, ${frame.toPx(inverterGhost).y}) scale(${1 / frame.zoom})`}
        >
          <rect x={-8} y={-10} width={16} height={20} rx={3} fill="#dc2626" opacity={0.5} stroke="#fff" strokeWidth={1.5} />
        </g>
      )}

      {/* panel-table drag preview — a fill ZONE + a live ghost of the panels that
          will land (already avoiding obstructions/keepouts/setbacks) */}
      {tablePreview &&
        (() => {
          const pa = frame.toPx({ x: tablePreview.minX, y: tablePreview.minY });
          const pb = frame.toPx({ x: tablePreview.maxX, y: tablePreview.maxY });
          return (
            <g>
              <rect
                x={Math.min(pa.x, pb.x)}
                y={Math.min(pa.y, pb.y)}
                width={Math.abs(pb.x - pa.x)}
                height={Math.abs(pb.y - pa.y)}
                fill="rgba(34,197,94,0.12)"
                stroke="#22c55e"
                strokeWidth={1.6}
                strokeDasharray="8 5"
              />
              {tablePreview.panels.map((p) => (
                <path
                  key={p.id}
                  d={polyPath(frame, panelCornersOnRoof(p, spec, tablePreview.roof))}
                  fill="rgba(34,197,94,0.45)"
                  stroke="#16a34a"
                  strokeWidth={1}
                />
              ))}
            </g>
          );
        })()}

      {/* single-panel snap ghost (Panels tool, hovering, not dragging) */}
      {singleGhost && (
        <path
          d={polyPath(frame, singleGhost.corners)}
          fill={singleGhost.fits ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.32)'}
          stroke={singleGhost.fits ? '#16a34a' : '#ef4444'}
          strokeWidth={1.3}
          strokeDasharray={singleGhost.fits ? undefined : '4 3'}
        />
      )}
    </>
  );
}
