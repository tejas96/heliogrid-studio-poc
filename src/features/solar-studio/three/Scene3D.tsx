// ─── 3D Studio v2: photoreal scene, sun sim, solar access, pro HUD ──────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  CameraControls,
  CameraControlsImpl,
  Environment,
  Html,
  Lightformer,
  Line,
  Sky,
} from '@react-three/drei';
import * as THREE from 'three';
import { designBounds, type SceneBounds } from './scene-bounds';
import { ScenePost } from './ScenePost';
import { EntityLabel } from './EntityLabel';
import { HOVER_COLOR, PICK_COLOR, PickHalo } from './PickHalo';
import { useOps } from '../store/useOps';
import type { DesignOp } from '../lib/ops/types';
import type { OpPreview } from '../lib/ops/run';
import { inverterRemove } from '../lib/ops/electrical-ops';
import { segmentDelete } from '../lib/ops/layout-ops';
import { batteryRemove } from '../lib/ops/battery-ops';
import { TableGizmo, WallGizmo } from './Gizmos';
import { RealSurround } from './RealSurround';
import { wallOutward } from '../lib/battery';
import type { PanelInstance } from './PanelsInstanced';

/** the first selected module of a table, so "Edit table" opens on the module the user picked */
function selectedPanelOf(mine: { id: string }[], selected: ReadonlySet<string>): string | undefined {
  return mine.find((p) => selected.has(p.id))?.id;
}
import { obstructionRemove, obstructionRotate, obstructionSetCastsShadow } from '../lib/ops/site-ops';
import { castsAnalyticalShadow } from '../lib/capabilities';
import { polygonArea } from '../lib/geo';
import type { ObstructionType } from '../types';

/** What the scene can pick besides modules (modules use the shared selection). */
export type ScenePick = { kind: 'obstruction' | 'inverter' | 'battery' | 'roof' | 'table'; id: string };
type RunOp = <A>(op: DesignOp<A>, args: A) => OpPreview;

const OBSTRUCTION_NAME: Record<ObstructionType, string> = {
  tank: 'Water tank',
  dish: 'Dish antenna',
  chimney: 'Chimney',
  tree: 'Tree',
  elevated: 'Elevated structure',
  building: 'Building',
  solar_wh: 'Solar water heater',
  ladder: 'Ladder',
  windmill: 'Windmill',
  turbine_vent: 'Turbine vent',
  other: 'Obstruction',
};
import {
  ArrowDown,
  Axis3d,
  BarChart3,
  Box,
  Building2,
  Camera,
  Check,
  Grid3x3,
  Link2,
  Map,
  Orbit,
  Pause,
  Play,
  Route,
  SunMedium,
  Sunrise,
  Sunset,
  X,
} from 'lucide-react';
import { useActiveProject, useProjectPatch } from '../store/store';
import { useUnits } from '../lib/units';
import { applyStructChoice, type StructChoice } from '../lib/structure-edit';
import { STRUCTURE_PROFILES } from '../lib/segment-ops';
import { panelFootprintM } from '../lib/layout';
import { StructurePreview } from '../components/StructurePreview';
import { shadingFingerprint } from '../lib/fingerprints';
import {
  accessLabel,
  computeHeatmap,
  type HeatCancel,
  type HeatmapResult,
} from '../lib/solar-heatmap';
import { HeatmapLayer } from './HeatmapLayer';
import type { Project, XY } from '../types';
import { panelEnergyShares, sunPosition, sunriseSunset, fmtHour } from '../lib/solar';
import { computePanelShadeDetail } from '../lib/shading';
import { simTimeDate } from '../lib/sim-time';
import { polygonCentroid } from '../lib/geo';
import { roofGridAngle } from '../lib/layout';
import { staticSatelliteUrl, metersPerStaticMap } from '../lib/maps';
import { SAT_ZOOM } from '../components/SatCanvas';
import { EnergyReportSheet } from '../components/EnergyReportSheet';
import {
  buildParapetGeometries,
  buildRoofSolidGeometry,
  roofTopRing,
} from '../lib/scene-model';
import { computeEaveRefs, isSloped, surfaceHeightAt } from '../lib/roof-plane';
import { obstructionBaseY } from '../lib/ground';
import { lightenHex, roofColor } from '../lib/roof-colors';
import { PanelsInstanced } from './PanelsInstanced';
import { StructureInstanced } from './StructureInstanced';
import { StructureNodesInstanced } from './StructureNodesInstanced';
import { deriveStructures } from '../lib/derive';
import {
  DEFAULT_STRUCTURE_VIEW,
  effectiveView,
  foundationOptionsFor,
  partitionPanels,
  visibleStructureIds,
  type StructureViewState,
} from '../lib/structure-view';
import { StructEditPanel } from './StructEditPanel';
import { panelPose } from '../lib/panel-pose';
import { ObstructionMesh, useWarmObstructionAssets } from './ObstructionMesh';

export type SeasonPreset = 'winter' | 'summer' | 'equinox' | 'today';

export function seasonDate(preset: SeasonPreset): Date {
  const y = new Date().getFullYear();
  switch (preset) {
    case 'winter': return new Date(y, 11, 21, 12, 0, 0);
    case 'summer': return new Date(y, 5, 21, 12, 0, 0);
    case 'equinox': return new Date(y, 2, 20, 12, 0, 0);
    default: return new Date();
  }
}

type ViewPreset = 'top' | 'iso' | 'front';

/** Unit view directions; the camera director scales them to the design's size. */
const VIEW_DIRS: Record<ViewPreset, [number, number, number]> = {
  top: [0.001, 1, 0.001],
  iso: [0.55, 0.62, 0.55],
  front: [0, 0.3, 1],
};

const ACTION = CameraControlsImpl.ACTION;

/**
 * Where the camera should stand to see the whole design from a preset
 * direction: far enough that the bounding sphere fits the vertical field of view.
 */
function presetPose(b: SceneBounds, v: ViewPreset, fovDeg: number) {
  const d = VIEW_DIRS[v];
  const n = Math.hypot(d[0], d[1], d[2]);
  const dist = Math.max(10, (b.r * 1.15) / Math.tan((fovDeg * Math.PI) / 360));
  return {
    pos: [b.cx + (d[0] / n) * dist, b.cy + (d[1] / n) * dist, b.cz + (d[2] / n) * dist] as const,
    target: [b.cx, b.cy, b.cz] as const,
  };
}

const CAMERA_FOV = 40;
const POST_ENABLED = true;

export function Scene3D({
  onClose,
  captureMode = false,
  onCapture,
  initial,
  readOnly = false,
  projectOverride,
  focusRoofId,
  initialViewMode = 'map',
  visible = true,
  selectedIds,
  onSelectPanels,
}: {
  onClose?: () => void;
  captureMode?: boolean;
  onCapture?: (dataUrl: string, label: string) => void;
  initial?: { date?: Date; hour?: number; solarAccess?: boolean };
  readOnly?: boolean;
  projectOverride?: Project;
  /** roof to isolate in mesh view (studio render of a single building) */
  focusRoofId?: string;
  initialViewMode?: 'map' | 'mesh';
  /**
   * The scene stays MOUNTED while the 2D editor is up (no GL context, GLB or
   * texture rebuild on every toggle); `visible=false` parks the render loop.
   */
  visible?: boolean;
  /** the editor's module selection — 2D and 3D pick the same things */
  selectedIds?: string[];
  onSelectPanels?: (ids: string[], additive: boolean) => void;
}) {
  const storeProject = useActiveProject();
  const project = projectOverride ?? storeProject!;
  const loc = project.location!;
  const patchProject = useProjectPatch();
  const ops = useOps();
  // non-module picks (obstruction / inverter / roof) — view state, never persisted
  const [pick, setPick] = useState<ScenePick | null>(null);
  const [hoverPick, setHoverPick] = useState<ScenePick | null>(null);
  // Google's data attribution for the streamed surroundings (terms of use)
  const [surroundAttribution, setSurroundAttribution] = useState('');
  const runOp: RunOp = (op, args) => ops.run(op, args);
  // Resolved HERE, outside <Canvas>. Anything inside the Canvas lives in the
  // react-three-fiber reconciler, which is a separate React root: store
  // context does not cross into it and `useStore()` throws there. Hooks stay
  // out here; values go in as props.
  const { fmtLen } = useUnits();

  // §H on-object structure editing: click a table → contextual panel at the
  // object; clicking an option applies it INSTANTLY as one undoable patch.
  // (Hover preview was trialed and removed by user decision 2026-07-16: every
  // hover rebuilt the full scene — janky, expensive, and accidental cursor
  // travel kept mutating the model. Select-only is calmer and honest: the
  // model updates the moment you choose, and undo reverts it.)
  const structInteractive = !readOnly && !captureMode && !projectOverride;
  // Phase 22l inspection state. VIEW ONLY — deliberately not in the project, so
  // it cannot reach a fingerprint and stale a capture.
  const [structView, setStructView] = useState<StructureViewState>(DEFAULT_STRUCTURE_VIEW);
  const [structEdit, setStructEdit] = useState<{
    segId: string;
    anchor: [number, number, number];
    /** set when the click landed on a MODULE — the card then also explains
     *  that panel's sun/energy (per-panel scope, labeled separately) */
    panelId?: string;
  } | null>(null);
  const openStructEdit = (segId: string, panelId?: string) => {
    if (!structInteractive) return;
    const seg = project.segments.find((sg) => sg.id === segId);
    const roof = seg ? project.roofs.find((r) => r.id === seg.roofId) : undefined;
    const mine = project.panels.filter((pp) => pp.segmentId === segId && pp.enabled);
    if (!seg || !roof || mine.length === 0) return;
    const cx = mine.reduce((a, pp) => a + pp.center.x, 0) / mine.length;
    const cy = mine.reduce((a, pp) => a + pp.center.y, 0) / mine.length;
    setPick(null); // one card at a time
    setStructEdit({ segId, anchor: [cx, roof.heightM + 2.2, -cy], panelId });
  };
  const pickEntity = (p: ScenePick | null) => {
    if (p) setStructEdit(null);
    setPick(p);
  };
  const closeStructEdit = () => setStructEdit(null);
  /** Click-to-focus from the inspector: orbit to whatever is taking the sun,
   *  so "shaded by WT1" is a place you can look at, not a label to decode. */
  const focusBlocker = (kind: string, id: string) => {
    const c = controlsRef.current;
    if (!c) return;
    let target: [number, number, number] | null = null;
    // (moveTo keeps the current orbit offset — the view glides, it does not jump)
    if (kind === 'obstruction') {
      const o = project.obstructions.find((x) => x.id === id);
      const roof = o ? project.roofs.find((r) => r.id === o.roofId) : undefined;
      if (o) target = [o.center.x, (roof?.heightM ?? 0) + o.heightM / 2, -o.center.y];
    } else if (kind === 'panel') {
      const pp = project.panels.find((x) => x.id === id);
      const roof = pp ? project.roofs.find((r) => r.id === pp.roofId) : undefined;
      if (pp) target = [pp.center.x, (roof?.heightM ?? 3) + 0.5, -pp.center.y];
    } else {
      const roof = project.roofs.find((r) => r.id === id);
      if (roof && roof.polygon.length > 0) {
        const c2 = polygonCentroid(roof.polygon);
        target = [c2.x, roof.heightM, -c2.y];
      }
    }
    if (!target) return;
    void c.moveTo(target[0], target[1], target[2], true);
  };
  const commitStructChoice = (choice: StructChoice) => {
    if (!structEdit) return;
    const r = applyStructChoice(project, structEdit.segId, choice);
    if (r) patchProject(r, true); // ONE undoable patch
  };
  useEffect(() => {
    if (!structEdit && !pick) return;
    const inCard = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest('[data-struct-edit-card],[data-entity-label]');
    let down: { x: number; y: number; inCard: boolean } | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeStructEdit();
        setPick(null);
      }
    };
    // close ONLY on a true outside CLICK: R3F's onPointerMissed fires even
    // for clicks on the DOM card (the "steppers close the panel" bug), and a
    // raw pointerdown-close would kill orbit drags — so pair down/up with a
    // small movement tolerance and ignore anything that touches the card.
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, inCard: inCard(e.target) };
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const dragged = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
      if (!dragged && !down.inCard && !inCard(e.target)) {
        closeStructEdit();
        setPick(null);
      }
      down = null;
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointerup', onUp, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointerup', onUp, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structEdit, pick]);
  // the edited table can vanish under us (undo, delete in the 2D tab)
  useEffect(() => {
    if (structEdit && !project.segments.some((sg) => sg.id === structEdit.segId)) {
      closeStructEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.segments, structEdit]);

  const [preset, setPreset] = useState<SeasonPreset>('today');
  const [date, setDate] = useState<Date>(initial?.date ?? new Date());
  const [hour, setHour] = useState(initial?.hour ?? 12);
  const [playing, setPlaying] = useState(false);
  const [solarAccessView, setSolarAccessView] = useState(initial?.solarAccess ?? false);
  const [showReport, setShowReport] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'mesh'>(initialViewMode);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showSunPath, setShowSunPath] = useState(true);
  const [copied, setCopied] = useState(false);
  const [heatmap, setHeatmap] = useState(false);
  const [heatMonth, setHeatMonth] = useState(new Date().getMonth());
  const [heatResult, setHeatResult] = useState<HeatmapResult | null>(null);
  const [heatProgress, setHeatProgress] = useState<{ done: number; total: number } | null>(null);
  const heatCacheRef = useRef<{ fp: string; res: HeatmapResult } | null>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  // the design's footprint drives the camera director AND the shadow frustum
  const focusRoofForBounds = focusRoofId ? project.roofs.filter((r) => r.id === focusRoofId) : undefined;
  const bounds = useMemo(
    () => designBounds(project, focusRoofForBounds && focusRoofForBounds.length ? focusRoofForBounds : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.roofs, project.panels, focusRoofId],
  );

  const { sunrise, sunset } = useMemo(
    () => sunriseSunset(date, loc.latLng.lat, loc.latLng.lng),
    [date, loc.latLng.lat, loc.latLng.lng],
  );

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setHour((h) => (h + 0.05 > 19 ? 5 : h + 0.05));
    }, 33);
    return () => clearInterval(id);
  }, [playing]);

  // solar time at the SITE's longitude — the same basis the shading engine,
  // heatmap and sunrise/sunset labels use. Never the browser's wall clock.
  const simDate = useMemo(
    () => simTimeDate(date, hour, loc.latLng.lng),
    [date, hour, loc.latLng.lng],
  );

  const sun = sunPosition(simDate, loc.latLng.lat, loc.latLng.lng);
  // badge shows TRUE compass azimuth; the SCENE gets the image-frame azimuth
  // (true + calibration north offset), same convention as the shading engine
  const azDeg = Math.round(((sun.azimuth * 180) / Math.PI + 360) % 360);
  const altDeg = Math.round((sun.altitude * 180) / Math.PI);
  const sceneSunAzimuth =
    sun.azimuth + (project.calibration.northOffsetDeg * Math.PI) / 180;

  // ── solar-access heatmap: flat top-down satellite + per-month sun-hours ──
  const heatFp = useMemo(() => shadingFingerprint(project), [project]);
  useEffect(() => {
    if (heatmap) {
      // present flat, top-down over the satellite (not the 3D model)
      setViewMode('map');
      goView('top');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmap]);
  useEffect(() => {
    if (!heatmap) return;
    if (heatCacheRef.current?.fp === heatFp) {
      setHeatResult(heatCacheRef.current.res);
      setHeatProgress(null);
      return;
    }
    const signal: HeatCancel = { aborted: false };
    setHeatResult(null);
    setHeatProgress({ done: 0, total: 1 });
    computeHeatmap(project, {
      onProgress: (done, total) => setHeatProgress({ done, total }),
      signal,
    })
      .then((res) => {
        if (signal.aborted) return;
        heatCacheRef.current = { fp: heatFp, res };
        setHeatResult(res);
        setHeatProgress(null);
      })
      .catch(() => {});
    return () => {
      signal.aborted = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heatmap, heatFp]);

  /** Camera director: fly to a preset that frames the WHOLE design. */
  function goView(v: ViewPreset, animate = true) {
    const c = controlsRef.current;
    if (!c) return;
    const { pos, target } = presetPose(bounds, v, CAMERA_FOV);
    void c.setLookAt(pos[0], pos[1], pos[2], target[0], target[1], target[2], animate);
  }

  // open framed on the design (a 300 m site no longer opens off-screen), and
  // re-frame when the design's footprint changes shape
  const framedFor = useRef<string>('');
  useEffect(() => {
    const key = `${bounds.cx.toFixed(1)}|${bounds.cz.toFixed(1)}|${bounds.r.toFixed(1)}`;
    if (framedFor.current === key) return;
    // <Canvas> mounts its children in its own React root, so the controls ref
    // can still be null in this effect — poll a few frames until it exists
    let tries = 0;
    let raf = 0;
    const attempt = () => {
      if (framedFor.current === key) return;
      if (controlsRef.current) {
        const first = framedFor.current === '';
        framedFor.current = key;
        goView('iso', !first);
        return;
      }
      if (tries++ < 120) raf = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds]);

  /**
   * Orbit the camera from the keyboard (Phase 22p).
   *
   * The 3D view was mouse-only: no tab stop, no way to change the viewpoint
   * without a pointer. Every other control in this app is reachable, and the
   * scene is where the design is actually inspected — a shaded panel, a leg
   * standing clear of its footing — so "look at it from another angle" cannot
   * be a mouse-only capability.
   *
   * Drives the same OrbitControls instance the view presets use, in spherical
   * coordinates about its target, so mouse and keyboard cannot diverge.
   */
  const wrapRef = useRef<HTMLDivElement>(null);

  function orbitBy(dAzimuth: number, dElevation: number, zoomFactor = 1) {
    const c = controlsRef.current;
    if (!c) return;
    // the controls own the clamps (min/max polar and distance), so keyboard
    // and pointer can never disagree about where the camera may go
    if (dAzimuth !== 0 || dElevation !== 0) void c.rotate(dAzimuth, dElevation, true);
    if (zoomFactor !== 1) void c.dolly(zoomFactor < 1 ? c.distance * 0.12 : -c.distance * 0.12, true);
  }

  /**
   * Arrow keys orbit, +/− dolly, 1/2/3 jump to a preset, Escape exits.
   *
   * This handler is on the WRAPPER, so it also sees keys bubbling up from the
   * controls layered over the scene. Camera keys must therefore only fire when
   * the scene itself has focus: without this guard, arrowing the time-of-day
   * slider orbited the camera instead of moving the sun, and typing a date was
   * likewise eaten. Escape is deliberately left global — leaving the view is a
   * reasonable thing to want from anywhere inside it.
   */
  function onSceneKeyDown(e: React.KeyboardEvent) {
    const t = e.target as HTMLElement;
    const inControl =
      t !== e.currentTarget &&
      !!t.closest?.('input,select,textarea,button,[role="slider"],[contenteditable="true"]');
    const STEP = e.shiftKey ? 0.04 : 0.12; // Shift = fine, as everywhere else
    const map: Record<string, () => void> = {
      ArrowLeft: () => orbitBy(-STEP, 0),
      ArrowRight: () => orbitBy(STEP, 0),
      ArrowUp: () => orbitBy(0, -STEP),
      ArrowDown: () => orbitBy(0, STEP),
      '+': () => orbitBy(0, 0, 0.9),
      '=': () => orbitBy(0, 0, 0.9),
      '-': () => orbitBy(0, 0, 1.1),
      '1': () => goView('top'),
      '2': () => goView('iso'),
      '3': () => goView('front'),
    };
    const fn = inControl ? undefined : map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
      return;
    }
    // Escape peels one layer at a time: an open card closes first (its own
    // listener does that); only a bare scene leaves the 3D view
    if (e.key === 'Escape' && onClose && !structEdit && !pick) {
      e.preventDefault();
      onClose();
    }
  }

  // Phase 22p: take focus when the scene opens, so the keys below are live
  // immediately. Opening used to leave focus on <body> — you pressed Enter on
  // the toolbar button and then had to Tab back in to move the camera.
  //
  // Note this does NOT try to restore focus on unmount: the 3D view REPLACES
  // the 2D editor, so the button that opened it is already detached by then
  // and focusing it is a no-op. Handing focus back is the parent's job, since
  // only the parent still has a mounted element to hand it to.
  useEffect(() => {
    if (visible) wrapRef.current?.focus();
  }, [visible]);

  const selectedSet = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  function capture() {
    const gl = glRef.current;
    if (!gl || !onCapture) return;
    onCapture(gl.domElement.toDataURL('image/jpeg', 0.85), `${preset} ${fmtHour(hour)}`);
  }

  const meshMode = viewMode === 'mesh';

  return (
    <div
      ref={wrapRef}
      // Phase 22p: a tab stop on the scene itself. Without one the 3D view was
      // unreachable by keyboard — you could open it and then not move it.
      tabIndex={0}
      role="application"
      aria-label="3D scene. Arrow keys orbit, Shift for finer steps, plus and minus zoom, 1 top view, 2 isometric, 3 front, Escape closes."
      onKeyDown={onSceneKeyDown}
      style={{
        position: 'absolute',
        inset: 0,
        // mesh view = dark studio vignette for depth; map view = flat dark
        background: meshMode
          ? 'radial-gradient(circle at 50% 38%, #1b222e 0%, #0c0f15 60%, #05070a 100%)'
          : '#0a0d12',
        zIndex: 50,
      }}
    >
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        frameloop={visible ? 'always' : 'never'}
        // retina at 3× rendered four times the pixels for no visible gain; 1.5 is
        // the sweet spot for a scene with SMAA on top
        dpr={[1, 1.5]}
        gl={{ preserveDrawingBuffer: true, antialias: false, alpha: meshMode }}
        camera={{ position: [30, 42, 42], fov: CAMERA_FOV, near: 0.3, far: 3000 }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.0;
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.localClippingEnabled = true; // the real surround is cut out under the site
          glRef.current = gl;
        }}
      >
        <SceneContent
          project={project}
          structEdit={structInteractive ? structEdit : null}
          structView={structView}
          onViewChange={setStructView}
          captureMode={captureMode}
          onStructOpen={openStructEdit}
          onStructCommit={commitStructChoice}
          onStructPatch={(p) => patchProject(p, true)}
          fmtLen={fmtLen}
          onStructClose={closeStructEdit}
          onFocusBlocker={focusBlocker}
          sunAltitude={sun.altitude}
          sunAzimuth={sceneSunAzimuth}
          solarAccessView={solarAccessView}
          showBuildings={showBuildings}
          showSunPath={showSunPath}
          date={date}
          meshMode={meshMode}
          focusRoofId={focusRoofId}
          heatmap={heatmap}
          heatResult={heatResult}
          heatMonth={heatMonth}
          bounds={bounds}
          selectedIds={selectedSet}
          onSelectPanels={onSelectPanels}
          pick={structInteractive ? pick : null}
          hoverPick={structInteractive ? hoverPick : null}
          onPick={structInteractive ? pickEntity : () => {}}
          onHoverPick={structInteractive ? setHoverPick : () => {}}
          runOp={runOp}
          onSurroundAttribution={setSurroundAttribution}
        />
        {/* Camera director: smooth, damped, touch-native (one finger pans, two
            fingers pinch + rotate — DESIGN-SYSTEM §7.2), dolly to the cursor,
            and every preset/focus is a tween rather than a jump. */}
        <CameraControls
          ref={controlsRef}
          makeDefault
          minDistance={1.5}
          maxDistance={600}
          maxPolarAngle={Math.PI / 2.05}
          dollyToCursor
          // one wheel notch used to swallow a third of the distance; a 100 m
          // site went from overview to inside-the-wall in four notches
          dollySpeed={0.35}
          smoothTime={0.2}
          draggingSmoothTime={0.06}
          azimuthRotateSpeed={heatmap ? 0 : 1}
          polarRotateSpeed={heatmap ? 0 : 1}
          mouseButtons={{
            left: ACTION.ROTATE,
            middle: ACTION.DOLLY,
            right: ACTION.TRUCK,
            wheel: ACTION.DOLLY,
          }}
          touches={{
            one: ACTION.TOUCH_TRUCK,
            two: ACTION.TOUCH_DOLLY_ROTATE,
            three: ACTION.TOUCH_TRUCK,
          }}
        />
        {!heatmap && POST_ENABLED && <ScenePost />}
      </Canvas>

      {/* ── left rail: scene toggles ── */}
      <div className="tool-rail dark" style={{ left: 14, top: 14 }} role="toolbar" aria-label="Scene options">
        {onClose && (
          <>
            <button className="tool-btn" data-tip="Back to 2D editor" data-tip-right="" aria-label="Back to 2D editor" onClick={onClose}>
              <X />
            </button>
            <div className="tool-sep" />
          </>
        )}
        <button
          className={`tool-btn ${heatmap ? 'accent' : ''}`}
          data-tip={'Solar access heatmap\nSun-hours on the roof, by month'}
          data-tip-right=""
          aria-label="Toggle solar access heatmap"
          aria-pressed={heatmap}
          onClick={() => setHeatmap((v) => !v)}
        >
          <Grid3x3 />
        </button>
        {!heatmap && (
          <>
            <button
              className={`tool-btn ${solarAccessView ? 'accent' : ''}`}
              data-tip={'Solar access view\nPer-panel shading %'}
              data-tip-right=""
              aria-label="Toggle solar access view"
              aria-pressed={solarAccessView}
              onClick={() => setSolarAccessView((v) => !v)}
            >
              <SunMedium />
            </button>
            <button className="tool-btn" data-tip="Energy report" data-tip-right="" aria-label="Energy report" onClick={() => setShowReport(true)}>
              <BarChart3 />
            </button>
            <div className="tool-sep" />
            <button
              className={`tool-btn ${meshMode ? 'on' : ''}`}
              data-tip={meshMode ? 'Switch to map view' : 'Switch to mesh view\nIsolated studio render'}
              data-tip-right=""
              aria-label="Toggle map / mesh view"
              aria-pressed={meshMode}
              onClick={() => setViewMode((v) => (v === 'mesh' ? 'map' : 'mesh'))}
            >
              {meshMode ? <Map /> : <Box />}
            </button>
            {!meshMode && (
              <>
                <button
                  className={`tool-btn ${showBuildings ? '' : 'on'}`}
                  data-tip={showBuildings ? 'Hide the real surroundings (Google 3D)' : 'Show the real surroundings (Google 3D)'}
                  data-tip-right=""
                  aria-label="Toggle the real surroundings"
                  aria-pressed={!showBuildings}
                  onClick={() => setShowBuildings((v) => !v)}
                >
                  <Building2 />
                </button>
              </>
            )}
            <button
              className={`tool-btn ${showSunPath ? '' : 'on'}`}
              data-tip={showSunPath ? 'Hide sun path' : 'Show sun path'}
              data-tip-right=""
              aria-label="Toggle sun path"
              aria-pressed={!showSunPath}
              onClick={() => setShowSunPath((v) => !v)}
            >
              <Route />
            </button>
          </>
        )}
        {!readOnly && !heatmap && (
          <>
            <div className="tool-sep" />
            <button
              className="tool-btn"
              data-tip={copied ? 'Link copied' : 'Copy customer share link'}
              data-tip-right=""
              aria-label="Copy share link"
              onClick={() => {
                const url = `${location.origin}/share/${project.shareId}`;
                navigator.clipboard.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                });
              }}
            >
              {copied ? <Check /> : <Link2 />}
            </button>
          </>
        )}
      </div>

      {/* ── view presets ── */}
      {!heatmap && (
      <div className="tool-rail dark" style={{ left: 14, bottom: 96 }} role="toolbar" aria-label="View presets">
        <div className="tool-group-label">View</div>
        <button className="tool-btn" data-tip="Top view" data-tip-right="" aria-label="Top view" onClick={() => goView('top')}>
          <ArrowDown />
        </button>
        <button className="tool-btn" data-tip="Isometric view" data-tip-right="" aria-label="Isometric view" onClick={() => goView('iso')}>
          <Axis3d />
        </button>
        <button className="tool-btn" data-tip="Front view" data-tip-right="" aria-label="Front view" onClick={() => goView('front')}>
          <Orbit />
        </button>
      </div>
      )}

      {/* ── sun widget (hidden in mesh/studio & heatmap view) ── */}
      {!meshMode && !heatmap && (
      <div
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          background: 'rgba(20,24,30,0.88)',
          backdropFilter: 'blur(10px)',
          border: '1px solid var(--editor-line)',
          borderRadius: 12,
          color: 'var(--editor-ink)',
          padding: '10px 14px',
          textAlign: 'center',
          zIndex: 30,
          minWidth: 96,
        }}
        aria-label={`Sun position: azimuth ${azDeg} degrees, altitude ${Math.max(0, altDeg)} degrees`}
      >
        <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden style={{ display: 'block', margin: '0 auto' }}>
          <circle cx="23" cy="23" r="20" fill="none" stroke="var(--editor-line)" strokeWidth="1.5" />
          {[0, 90, 180, 270].map((a) => (
            <line
              key={a}
              x1={23 + 17 * Math.sin((a * Math.PI) / 180)}
              y1={23 - 17 * Math.cos((a * Math.PI) / 180)}
              x2={23 + 20 * Math.sin((a * Math.PI) / 180)}
              y2={23 - 20 * Math.cos((a * Math.PI) / 180)}
              stroke="var(--editor-ink-2)"
              strokeWidth="1.5"
            />
          ))}
          <text x="23" y="9" textAnchor="middle" fontSize="7" fill="var(--editor-ink-2)" fontWeight="700">N</text>
          {/* sun needle */}
          <line
            x1="23"
            y1="23"
            x2={23 + 15 * Math.sin((azDeg * Math.PI) / 180)}
            y2={23 - 15 * Math.cos((azDeg * Math.PI) / 180)}
            stroke="#f59e0b"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle cx="23" cy="23" r="2.6" fill="#f59e0b" />
        </svg>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, marginTop: 6, color: '#f5b942' }}>
          Az {azDeg}° · Alt {Math.max(0, altDeg)}°
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--editor-ink-2)', marginTop: 2 }}>
          {simDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {fmtHour(hour)}
        </div>
      </div>
      )}

      {/* ── Google attribution for the real surroundings (required) ── */}
      {showBuildings && !meshMode && !heatmap && (
        <div
          style={{
            position: 'absolute',
            right: 12,
            bottom: 104,
            zIndex: 12,
            fontSize: 9.5,
            lineHeight: 1.3,
            color: 'rgba(255,255,255,0.78)',
            background: 'rgba(10,13,18,0.55)',
            padding: '2px 7px',
            borderRadius: 4,
            pointerEvents: 'none',
            maxWidth: 300,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          3D surroundings © Google{surroundAttribution ? ` · ${surroundAttribution}` : ''}
        </div>
      )}

      {/* ── solar access legend ── */}
      {solarAccessView && !heatmap && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            bottom: 116,
            zIndex: 30,
            background: 'rgba(20,24,30,0.88)',
            border: '1px solid var(--editor-line)',
            borderRadius: 10,
            padding: '10px 12px',
            color: 'var(--editor-ink)',
            fontSize: 10.5,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Solar access</div>
          <div
            style={{
              width: 120,
              height: 8,
              borderRadius: 999,
              background: 'linear-gradient(90deg,#dc2626,#ca8a04,#16a34a)',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3, color: 'var(--editor-ink-2)' }}>
            <span>≤85%</span>
            <span>95%</span>
            <span>100%</span>
          </div>
        </div>
      )}

      {captureMode && (
        <button
          className="btn btn-primary"
          style={{ position: 'absolute', right: 16, bottom: 128, zIndex: 31 }}
          onClick={capture}
        >
          <Camera size={16} /> Capture
        </button>
      )}

      {/* ── time bar (solar context; hidden in mesh/studio & heatmap view) ── */}
      {!meshMode && !heatmap && (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '12px 18px 14px',
          background: 'linear-gradient(transparent, rgba(6,9,13,0.92) 34%)',
          zIndex: 30,
          color: 'var(--editor-ink)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {(
            [
              ['winter', 'Winter'],
              ['summer', 'Summer'],
              ['equinox', 'Equinox'],
              ['today', 'Today'],
            ] as [SeasonPreset, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              className="chip"
              aria-pressed={preset === p}
              style={
                preset === p
                  ? { background: 'var(--brand)', borderColor: 'var(--brand)', color: '#191204' }
                  : { background: 'rgba(255,255,255,0.07)', borderColor: 'var(--editor-line)', color: 'var(--editor-ink-2)' }
              }
              onClick={() => {
                setPreset(p);
                setDate(seasonDate(p));
              }}
            >
              {label}
            </button>
          ))}
          <input
            type="date"
            aria-label="Simulation date"
            value={date.toISOString().slice(0, 10)}
            onChange={(e) => {
              if (e.target.value) setDate(new Date(e.target.value + 'T12:00:00'));
            }}
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid var(--editor-line)',
              color: 'var(--editor-ink-2)',
              borderRadius: 999,
              padding: '5px 12px',
              fontSize: 12,
              colorScheme: 'dark',
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, maxWidth: 980, margin: '0 auto' }}>
          <button
            className="tool-btn"
            style={{ background: 'rgba(255,255,255,0.09)', flex: 'none' }}
            aria-label={playing ? 'Pause sun animation' : 'Play sun animation'}
            data-tip={playing ? 'Pause' : 'Animate the sun across the day'}
            onClick={() => setPlaying((v) => !v)}
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <span style={{ fontSize: 11, color: 'var(--editor-ink-2)', flex: 'none' }}>5 AM</span>
          <input
            type="range"
            min={5}
            max={19}
            step={0.05}
            value={hour}
            aria-label="Time of day"
            onChange={(e) => setHour(Number(e.target.value))}
            style={{ flex: 1, accentColor: '#f59e0b', height: 26 }}
          />
          <span style={{ fontSize: 11, color: 'var(--editor-ink-2)', flex: 'none' }}>7 PM</span>
        </div>
        <div
          style={{
            textAlign: 'center',
            fontSize: 12,
            marginTop: 4,
            display: 'flex',
            justifyContent: 'center',
            gap: 18,
            alignItems: 'center',
          }}
        >
          <b style={{ color: '#f5b942', fontVariantNumeric: 'tabular-nums' }}>{fmtHour(hour)}</b>
          <span style={{ color: 'var(--editor-ink-2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Sunrise size={13} /> {fmtHour(sunrise)}
          </span>
          <span style={{ color: 'var(--editor-ink-2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Sunset size={13} /> {fmtHour(sunset)}
          </span>
        </div>
      </div>
      )}

      {showReport && (
        <EnergyReportSheet onClose={() => setShowReport(false)} project={project} readOnly={readOnly} />
      )}

      {/* ── heatmap: legend + month track bar + progress ── */}
      {heatmap && heatResult && heatResult.cells.length > 0 && (
        <>
          {/* legend */}
          <div
            style={{
              position: 'absolute',
              right: 14,
              bottom: 116,
              zIndex: 30,
              background: 'rgba(20,24,30,0.88)',
              border: '1px solid var(--editor-line)',
              borderRadius: 10,
              padding: '10px 12px',
              color: 'var(--editor-ink)',
              minWidth: 172,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Solar access</div>
            <div
              style={{
                height: 8,
                borderRadius: 4,
                background: 'linear-gradient(90deg,#dc2626,#ca8a04,#16a34a)',
              }}
            />
            {/* qualitative bands under the ramp */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 9,
                color: 'var(--editor-ink-2)',
                marginTop: 3,
              }}
            >
              <span>Poor</span>
              <span>Moderate</span>
              <span>Good</span>
              <span>Excellent</span>
            </div>
            {/* percentage scale */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 9.5,
                color: 'var(--editor-ink-2)',
                marginTop: 2,
              }}
            >
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
            {/* current month summary: % access + band + direct hours */}
            {(() => {
              const t = heatResult.monthlyRoofAvg[heatMonth]; // already 0..1
              return (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--editor-ink)',
                    marginTop: 7,
                    borderTop: '1px solid var(--editor-line)',
                    paddingTop: 6,
                  }}
                >
                  {/* colour + % + sun-hours are GEOMETRIC solar access (shading),
                      independent of climate — so no 'Real' badge here */}
                  <b style={{ color: '#f5b942' }}>{MONTH_NAMES[heatMonth]}</b> ·{' '}
                  <b>{Math.round(t * 100)}%</b> {accessLabel(t)} access
                  <div style={{ fontSize: 10, color: 'var(--editor-ink-2)', marginTop: 1 }}>
                    {heatResult.monthlyRoofHours[heatMonth].toFixed(1)} sun-hours/day avg · geometric
                  </div>
                  {/* the kWh RECEIVED line is the only climate-derived readout —
                      the 'Real · PVGIS' badge belongs to it alone */}
                  {heatResult.monthlyRoofKwh && (
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--editor-ink-2)',
                        marginTop: 3,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <span>{heatResult.monthlyRoofKwh[heatMonth].toFixed(1)} kWh/m²·mo received</span>
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 6px',
                          borderRadius: 999,
                          color: '#16a34a',
                          background: 'rgba(22,163,74,0.15)',
                        }}
                      >
                        Real · PVGIS
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* month track bar */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: '12px 18px 14px',
              background: 'linear-gradient(transparent, rgba(6,9,13,0.92) 34%)',
              zIndex: 30,
              color: 'var(--editor-ink)',
            }}
          >
            <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              {MONTH_NAMES[heatMonth]}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 11, color: 'var(--editor-ink-2)' }}>Jan</span>
              <input
                type="range"
                min={0}
                max={11}
                step={1}
                value={heatMonth}
                aria-label="Month"
                onChange={(e) => setHeatMonth(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#f59e0b', height: 26 }}
              />
              <span style={{ fontSize: 11, color: 'var(--editor-ink-2)' }}>Dec</span>
            </div>
          </div>
        </>
      )}

      {/* heatmap progress */}
      {heatmap && heatProgress && !heatResult && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 40,
            background: 'rgba(20,24,30,0.9)',
            border: '1px solid var(--editor-line)',
            borderRadius: 10,
            padding: '14px 20px',
            color: 'var(--editor-ink)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          Computing solar access…{' '}
          {Math.round((heatProgress.done / Math.max(1, heatProgress.total)) * 100)}%
        </div>
      )}
    </div>
  );
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ─── scene content ──────────────────────────────────────────────────────────

function SceneContent({
  project,
  structEdit,
  structView,
  onViewChange,
  captureMode,
  onStructOpen,
  onStructCommit,
  onStructPatch,
  fmtLen,
  onStructClose,
  onFocusBlocker,
  sunAltitude,
  sunAzimuth,
  solarAccessView,
  showBuildings,
  showSunPath,
  date,
  meshMode,
  focusRoofId,
  heatmap,
  heatResult,
  heatMonth,
  bounds,
  selectedIds,
  onSelectPanels,
  pick,
  hoverPick,
  onPick,
  onHoverPick,
  runOp,
  onSurroundAttribution,
}: {
  project: Project;
  bounds: SceneBounds;
  selectedIds: ReadonlySet<string>;
  onSelectPanels?: (ids: string[], additive: boolean) => void;
  pick: ScenePick | null;
  hoverPick: ScenePick | null;
  onPick: (p: ScenePick | null) => void;
  onHoverPick: (p: ScenePick | null) => void;
  runOp: RunOp;
  onSurroundAttribution?: (text: string) => void;
  sunAltitude: number;
  sunAzimuth: number;
  solarAccessView: boolean;
  showBuildings: boolean;
  showSunPath: boolean;
  date: Date;
  meshMode: boolean;
  focusRoofId?: string;
  heatmap: boolean;
  heatResult: HeatmapResult | null;
  heatMonth: number;
  /** §H on-object structure editing (null = read-only surface) */
  structEdit: { segId: string; anchor: [number, number, number]; panelId?: string } | null;
  onStructOpen: (segId: string, panelId?: string) => void;
  onStructCommit: (c: StructChoice) => void;
  /** Phase 22m — leg-plan patches, applied as ONE undoable step like the rest */
  onStructPatch: (patch: Partial<Project>) => void;
  /** unit formatter, resolved OUTSIDE the Canvas and passed in (see below) */
  fmtLen: (m: number, dp?: number) => string;
  onStructClose: () => void;
  onFocusBlocker?: (kind: string, id: string) => void;
  /** Phase 22l inspection state — view only, never persisted */
  structView: StructureViewState;
  onViewChange: (v: StructureViewState) => void;
  captureMode?: boolean;
}) {
  const loc = project.location!;
  const spec = project.components.panel;
  // sun-path arc and sun disc radius: beyond the design, scaled to the site
  const R = Math.max(70, bounds.r * 2.6);

  // parametric structures (Phase 7): the member graph is the owner — the
  // scene renders it and couples panel heights to the SAME resolved racking.
  // deriveStructures is itself memoised on the design fingerprint (Task 6),
  // so re-deriving every structure on an unrelated patch (a price edit, a
  // note) is no longer a recompute at all — no useMemo needed here.
  const allStructures = deriveStructures(project);

  // ── Phase 22l: structure-inspection view state ────────────────────────────
  // NEVER persisted and never fingerprinted — ghosting a module to look at a
  // rafter is not a design change, and if it keyed layoutFp it would stale
  // every stored capture.
  const selectedSegId = structEdit?.segId ?? null;
  const view = effectiveView(structView, { captureMode });

  // isolate drops every table but the selected one
  const structures = useMemo(() => {
    const keep = visibleStructureIds(
      allStructures.map((s) => s.segmentId),
      selectedSegId,
      view,
    );
    return allStructures.filter((s) => keep.has(s.segmentId));
  }, [allStructures, selectedSegId, view]);
  // A click SELECTS the module (shared with the 2D editor) and, for a plain
  // click, opens its table's on-object card — a flush table has no structure
  // to click, and must stay re-elevatable from 3D. Shift/ctrl adds to the
  // selection without opening anything, like the 2D editor.
  const [hoverId, setHoverId] = useState<string | null>(null);
  // Click = select, nothing more (on-object select-only UX). A plain click on a
  // table's module also opens the table's small chip; the structure card is a
  // second, deliberate step from that chip. It used to open the full card on
  // every click, which turned "pick a module" into "a form pops up".
  const onPanelClickToEdit = useCallback(
    (panelId: string, additive: boolean) => {
      onSelectPanels?.([panelId], additive);
      if (additive) return;
      const pp = project.panels.find((x) => x.id === panelId);
      onPick(pp?.segmentId ? { kind: 'table', id: pp.segmentId } : null);
    },
    [project.panels, onPick, onSelectPanels],
  );


  // stream only the GLB models this project's obstruction types actually use
  useWarmObstructionAssets(project.obstructions.map((o) => o.type));

  // mesh view = studio render; optionally isolate one building via focusRoofId,
  // otherwise show every roof. Either way it's re-centered at origin for framing.
  const focusRoof =
    meshMode && focusRoofId
      ? project.roofs.find((r) => r.id === focusRoofId) ?? null
      : null;
  const shownRoofs = focusRoof ? [focusRoof] : project.roofs;
  const inScope = (roofId: string | null) => !focusRoof || roofId === focusRoof.id;
  // shared eave line per roof → adjacent same-slope roofs form one plane
  const eaveRefs = useMemo(() => computeEaveRefs(project.roofs), [project.roofs]);
  const surfAt = (roofId: string | null, p: XY) => {
    const roof = project.roofs.find((r) => r.id === roofId);
    return roof ? surfaceHeightAt(roof, p, eaveRefs.get(roof.id)) : 3;
  };

  /**
   * Modules split into how each must be drawn (Phase 22l). One pose source
   * feeds all three buckets, so ghosting can never move a module.
   */
  // Memoised on the PROJECT, not recomputed per render: before this, every
  // hour-slider tick and every async solar-access stamp re-posed every module
  // and re-allocated every InstancedMesh — the single biggest frame cost, and
  // the reason hover preview had to be removed.
  const panelParts = useMemo(
    () =>
      spec
        ? partitionPanels(
            project.panels
              .filter((p) => p.enabled && inScope(p.roofId))
              .map((p) => {
                const roof = project.roofs.find((r) => r.id === p.roofId);
                // ONE pose source for the mesh, the analytical shadow slab and the
                // shading engine's rays (§A0) — they cannot drift apart
                const pose = panelPose(project, p, spec, roof, surfAt(p.roofId, p.center));
                return {
                  id: p.id,
                  segmentId: p.segmentId,
                  position: pose.position,
                  yawRad: pose.yawRad,
                  tiltRad: pose.tiltRad,
                  w: pose.w,
                  d: pose.d,
                  flush: pose.flush,
                  legs: pose.structured ? false : undefined, // structure draws real legs
                  access: p.solarAccess ?? 1,
                };
              }),
            selectedSegId,
            view,
          )
        : { normal: [], ghost: [], hidden: [] },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project, spec, selectedSegId, view, focusRoof, eaveRefs],
  );
  // shift so the shown building(s)' collective center sits at the world origin
  const meshCenter =
    meshMode && shownRoofs.length > 0
      ? (() => {
          const cs = shownRoofs.map((r) => polygonCentroid(r.polygon));
          return {
            x: cs.reduce((s, c) => s + c.x, 0) / cs.length,
            y: cs.reduce((s, c) => s + c.y, 0) / cs.length,
          };
        })()
      : { x: 0, y: 0 };
  const originShift: [number, number, number] = meshMode
    ? [-meshCenter.x, 0, meshCenter.y]
    : [0, 0, 0];

  const sunDir = useMemo(() => {
    const x = Math.cos(sunAltitude) * Math.sin(sunAzimuth);
    const y = Math.sin(sunAltitude);
    const z = -Math.cos(sunAltitude) * Math.cos(sunAzimuth);
    return new THREE.Vector3(x, y, z);
  }, [sunAltitude, sunAzimuth]);

  // NOTE: per-panel solar access is computed by the headless engine
  // (lib/shading.ts via useDesignSync) — this scene only VISUALIZES it.

  // projector span carries the site calibration: after a known-distance
  // rescale the imagery must still sit exactly under the corrected geometry
  const spanM =
    metersPerStaticMap(loc.latLng.lat, SAT_ZOOM, 640) * project.calibration.scaleFactor;
  const texUrl = staticSatelliteUrl(loc.latLng.lat, loc.latLng.lng, SAT_ZOOM, 640, 2);
  const groundTex = useMemo(() => {
    const t = new THREE.TextureLoader().load(texUrl);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [texUrl]);
  // GPU texture memory is never reclaimed implicitly — release the previous
  // satellite tile when the URL changes and on unmount
  useEffect(() => () => groundTex.dispose(), [groundTex]);

  const sunVisible = sunAltitude > 0;
  const duskFactor = Math.min(1, Math.max(0, sunAltitude / 0.25));

  // the sun light aims at the design's centre and its shadow frustum wraps the
  // design's footprint — a 300 m site keeps its shadows, a 20 m house gets a
  // sharp map instead of 60 m of wasted texels
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  lightTarget.position.set(bounds.cx, 0, bounds.cz);
  const shadowHalf = Math.max(20, bounds.r * 1.2);
  const sunPos = useMemo(
    () => sunDir.clone().multiplyScalar(Math.max(80, bounds.r * 3)).add(new THREE.Vector3(bounds.cx, 0, bounds.cz)),
    [sunDir, bounds],
  );

  // heatmap mode: flat satellite ground + colored roof-surface cells only —
  // no 3D model, no lighting drama (unlit cells read the true ramp colors)
  if (heatmap) {
    return (
      <group>
        <color attach="background" args={['#0a0d12']} />
        <ambientLight intensity={1} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
          <planeGeometry args={[spanM, spanM]} />
          <meshBasicMaterial map={groundTex} toneMapped={false} />
        </mesh>
        {heatResult && <HeatmapLayer result={heatResult} month={heatMonth} />}
      </group>
    );
  }

  return (
    <group>
      {/* Image-based lighting: a procedural sky dome + ground bounce rendered
          once into a small cube map. Every PBR material finally has something
          to reflect — glass reads as glass, steel as steel — with no HDR file. */}
      <Environment resolution={128} frames={1} background={false}>
        <Lightformer
          form="rect"
          intensity={sunVisible ? 1.4 : 0.35}
          color="#dbe7f7"
          position={[0, 14, 0]}
          rotation-x={Math.PI / 2}
          scale={[40, 40, 1]}
        />
        <Lightformer
          form="rect"
          intensity={sunVisible ? 0.9 : 0.2}
          color="#f6ecd8"
          position={[0, 4, -16]}
          scale={[36, 10, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.3}
          color="#6b6357"
          position={[0, -6, 0]}
          rotation-x={-Math.PI / 2}
          scale={[40, 40, 1]}
        />
      </Environment>
      <primitive object={lightTarget} />

      {meshMode ? (
        <>
          {/* studio background + soft product-render lighting (sun-independent) */}
          <color attach="background" args={['#0c0f15']} />
          <fogExp2 attach="fog" args={['#0c0f15', 0.0022]} />
          <ambientLight intensity={0.35} />
          <hemisphereLight intensity={0.45} groundColor="#12161d" color="#dfe8f5" />
          <directionalLight
            position={[bounds.cx + 24, 40, bounds.cz + 20]}
            target={lightTarget}
            intensity={1.15}
            color="#ffffff"
            castShadow
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-camera-left={-shadowHalf}
            shadow-camera-right={shadowHalf}
            shadow-camera-top={shadowHalf}
            shadow-camera-bottom={-shadowHalf}
            shadow-camera-near={1}
            shadow-camera-far={shadowHalf * 6}
            shadow-bias={-0.00015}
            shadow-normalBias={0.03}
          />
          {/* fill light from the opposite side to lift shadows */}
          <directionalLight position={[-28, 22, -18]} intensity={0.3} color="#b9c9e0" />
        </>
      ) : (
        <>
          {/* atmosphere */}
          {sunVisible ? (
            <Sky
              distance={4500}
              sunPosition={sunDir.clone().multiplyScalar(450).toArray()}
              turbidity={5.5}
              rayleigh={2.0}
              mieCoefficient={0.006}
              mieDirectionalG={0.85}
            />
          ) : (
            <color attach="background" args={['#0a0f1c']} />
          )}
          {/* real haze at site scale is faint: the old 0.0035 washed a whole
              framed design grey once the camera stood 100 m back */}
          <fogExp2 attach="fog" args={[sunVisible ? '#b9c7d8' : '#0a0f1c', 0.0006]} />

          {/* lights — the environment map now carries the sky's ambient share,
              so the flat ambient/hemisphere terms are small */}
          <ambientLight intensity={0.05 + 0.12 * duskFactor} />
          <hemisphereLight intensity={0.06 + 0.16 * duskFactor} groundColor="#2a2f38" color="#cfe0f4" />
          {sunVisible && (
            <directionalLight
              position={sunPos}
              target={lightTarget}
              intensity={0.4 + 1.35 * duskFactor}
              color="#fff4e0"
              castShadow
              shadow-mapSize-width={4096}
              shadow-mapSize-height={4096}
              shadow-camera-left={-shadowHalf}
              shadow-camera-right={shadowHalf}
              shadow-camera-top={shadowHalf}
              shadow-camera-bottom={-shadowHalf}
              shadow-camera-near={1}
              shadow-camera-far={shadowHalf * 8}
              shadow-bias={-0.00015}
              shadow-normalBias={0.03}
            />
          )}
        </>
      )}

      {/* ground: studio grid (mesh) vs base + satellite plane (map) */}
      {meshMode ? (
        <group position={originShift}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
            <planeGeometry args={[300, 300]} />
            <meshStandardMaterial color="#0f141b" roughness={1} />
          </mesh>
          <gridHelper args={[120, 60, '#2b3650', '#1a2130']} position={[0, 0, 0]} />
        </group>
      ) : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, showBuildings ? -1.5 : -0.02, 0]} receiveShadow>
            <planeGeometry args={[300, 300]} />
            <meshStandardMaterial color="#151a21" roughness={1} envMapIntensity={0.2} />
          </mesh>
          {/* the aerial photo is an already-exposed picture, not an albedo: under
              a full sun plus sky it would render ~2.4× too bright, so it is
              scaled down to read as the ground it is, and still takes shadows.
              With the real surround on it sits a hand below grade: the streamed
              terrain wins where it exists, the photo shows where it does not */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, showBuildings ? -0.6 : 0, 0]} receiveShadow>
            <planeGeometry args={[spanM, spanM]} />
            <meshStandardMaterial map={groundTex} color="#767676" roughness={1} envMapIntensity={0.15} />
          </mesh>
        </>
      )}

      <group position={originShift}>
      {/* roofs — pickable: the deck's outline lights up, a click names it */}
      {shownRoofs.map((r) => {
        const picked = pick?.kind === 'roof' && pick.id === r.id;
        const hovered = !picked && hoverPick?.kind === 'roof' && hoverPick.id === r.id;
        const c = polygonCentroid(r.polygon);
        return (
          <group
            key={r.id}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onPick({ kind: 'roof', id: r.id });
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHoverPick({ kind: 'roof', id: r.id });
            }}
            onPointerOut={() => onHoverPick(null)}
          >
            <RoofMesh
              roof={r}
              allRoofs={project.roofs}
              eaveProj={eaveRefs.get(r.id)}
              photoreal={!meshMode}
              outline={picked ? PICK_COLOR : hovered ? HOVER_COLOR : undefined}
            />
            {picked && (
              <EntityLabel
                position={[c.x, r.heightM + 1.2, -c.y]}
                title={r.name}
                lines={[
                  `${Math.round(polygonArea(r.polygon))} m² · ${fmtLen(r.heightM, 1)} eave`,
                  `${r.pitchDeg > 0 ? `${r.pitchDeg}° pitch facing ${Math.round(r.slopeAzimuthDeg)}°` : 'flat'} · ${r.roofType.replace('_', ' ')} · ${r.provenance?.source ?? 'traced by hand'}`,
                  `${project.panels.filter((p) => p.roofId === r.id && p.enabled).length} modules`,
                ]}
                onClose={() => onPick(null)}
              />
            )}
          </group>
        );
      })}

      {/* obstructions — pickable: hover halo, click → label with quick actions */}
      {project.obstructions.filter((o) => inScope(o.roofId)).map((o) => {
        // Resolved from the obstruction's POSITION, not from `o.roofId` alone.
        // A stored anchor can be stale — it used to be captured at placement
        // and left behind by every drag — and `surfaceHeightAt` extrapolates
        // its plane without bound, so a stale anchor silently returned the old
        // roof's plane at the new spot instead of failing. That is what left
        // turbine vents hanging over a pitched roof. `obstructionBaseY` still
        // honours an explicit `roofId: null` as "stands on grade".
        const baseY = obstructionBaseY(o, project.roofs, eaveRefs);
        const picked = pick?.kind === 'obstruction' && pick.id === o.id;
        const hovered = !picked && hoverPick?.kind === 'obstruction' && hoverPick.id === o.id;
        const sx = o.shape === 'circle' ? o.diameterM : o.lengthM;
        const sz = o.shape === 'circle' ? o.diameterM : o.widthM;
        const casts = castsAnalyticalShadow(o);
        const dims =
          o.shape === 'circle'
            ? `Ø ${fmtLen(o.diameterM, 1)} · ${fmtLen(o.heightM, 1)} tall`
            : `${fmtLen(o.lengthM, 1)} × ${fmtLen(o.widthM, 1)} · ${fmtLen(o.heightM, 1)} tall`;
        return (
          <group
            key={o.id}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onPick({ kind: 'obstruction', id: o.id });
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHoverPick({ kind: 'obstruction', id: o.id });
            }}
            onPointerOut={() => onHoverPick(null)}
          >
            <ObstructionMesh o={o} baseY={baseY} />
            {(picked || hovered) && (
              <PickHalo
                center={[o.center.x, baseY + o.heightM / 2, -o.center.y]}
                rotationY={(-o.rotationDeg * Math.PI) / 180}
                size={[sx + 0.3, o.heightM + 0.2, sz + 0.3]}
                picked={picked}
              />
            )}
            {picked && (
              <EntityLabel
                position={[o.center.x, baseY + o.heightM + 0.7, -o.center.y]}
                title={`${o.label} · ${OBSTRUCTION_NAME[o.type]}`}
                lines={[
                  dims,
                  `${casts ? 'Casts shadow' : 'No shadow'} · ${o.blocksPlacement ? 'blocks modules' : 'modules may span it'} · ${o.provenance?.source ?? 'manual'}`,
                ]}
                onClose={() => onPick(null)}
                actions={[
                  { label: 'Rotate 90°', onClick: () => runOp(obstructionRotate, { id: o.id, deltaDeg: 90 }) },
                  {
                    label: casts ? 'Stop casting' : 'Cast shadow',
                    onClick: () => runOp(obstructionSetCastsShadow, { id: o.id, castsShadow: !casts }),
                  },
                  {
                    label: 'Remove',
                    danger: true,
                    onClick: () => {
                      runOp(obstructionRemove, { id: o.id });
                      onPick(null);
                    },
                  },
                ]}
              />
            )}
          </group>
        );
      })}

      {/* panels — instanced: draw calls no longer scale with system size */}
      {spec && (
        <>
          <StructureInstanced
            structures={structures}
            onMemberClick={(segId) => onStructOpen(segId)}
          />
          {/* what every leg actually stands on — pedestal / ballast / pile.
              Nothing drew these before, so a table appeared to float. */}
          <StructureNodesInstanced structures={structures} />
        </>
      )}
      {structEdit && spec && (
        <StructEditPanel
          project={project}
          segId={structEdit.segId}
          panelId={structEdit.panelId}
          anchor={structEdit.anchor}
          onCommit={onStructCommit}
          onPatch={onStructPatch}
          fmtLen={fmtLen}
          onClose={onStructClose}
          onFocusBlocker={onFocusBlocker}
          view={view}
          onViewChange={onViewChange}
        />
      )}
      {spec && (
        <>
          {/* Phase 22l: the SELECTED table's modules can be shown, ghosted or
              hidden so its structure reads. Per-instance alpha is unavailable
              (one material per mesh), so the panel set is partitioned and this
              component renders twice. `hidden` is simply never drawn.
              partitionPanels owns the split; capture mode forces everything
              visible so a proposal hero shot is never a bare frame. */}
          <PanelsInstanced
            accessView={solarAccessView}
            onPanelClick={onPanelClickToEdit}
            onPanelHover={setHoverId}
            selectedIds={selectedIds}
            hoverId={hoverId}
            items={panelParts.normal}
          />
          {panelParts.ghost.length > 0 && (
            <PanelsInstanced
              ghost
              accessView={false}
              onPanelClick={onPanelClickToEdit}
              onPanelHover={setHoverId}
              selectedIds={selectedIds}
              hoverId={hoverId}
              items={panelParts.ghost}
            />
          )}
        </>
      )}

      {/* table chip — the picked table's two numbers and its two actions */}
      {pick?.kind === 'table' &&
        (() => {
          const seg = project.segments.find((s) => s.id === pick.id);
          const roof = seg && project.roofs.find((r) => r.id === seg.roofId);
          const mine = seg ? project.panels.filter((p) => p.segmentId === seg.id && p.enabled) : [];
          if (!seg || !roof || mine.length === 0) return null;
          const cx = mine.reduce((a, pp) => a + pp.center.x, 0) / mine.length;
          const cy = mine.reduce((a, pp) => a + pp.center.y, 0) / mine.length;
          const watt = project.components.panel?.watt ?? 0;
          const kwp = (mine.length * watt) / 1000;
          const tilt = seg.racking.kind === 'flush' ? 'flush on the roof' : `${seg.racking.tiltDeg}° tilt`;
          return (
            <EntityLabel
              position={[cx, roof.heightM + 2.2, -cy]}
              title={`Table ${seg.label}`}
              lines={[
                `${mine.length} modules · ${kwp.toFixed(1)} kWp · ${seg.rows}×${seg.cols}`,
                `${tilt} · facing ${Math.round(seg.azimuthDeg)}° · ${seg.orientation}`,
              ]}
              onClose={() => onPick(null)}
              actions={[
                { label: 'Edit table', onClick: () => onStructOpen(seg.id, selectedPanelOf(mine, selectedIds)) },
                {
                  label: 'Remove table',
                  danger: true,
                  onClick: () => {
                    runOp(segmentDelete, { segmentId: seg.id });
                    onSelectPanels?.([], false);
                    onPick(null);
                  },
                },
              ]}
            />
          );
        })()}

      {/* gizmos — direct manipulation of the picked thing through the ops kernel */}
      {!meshMode &&
        spec &&
        pick?.kind === 'table' &&
        (() => {
          const seg = project.segments.find((s) => s.id === pick.id);
          const roof = seg && project.roofs.find((r) => r.id === seg.roofId);
          if (!seg || !roof) return null;
          return (
            <TableGizmo
              project={project}
              seg={seg}
              roof={roof}
              spec={spec}
              runOp={runOp}
              ghostItemsFor={(next, segId) =>
                next.panels
                  .filter((p) => p.segmentId === segId && p.enabled)
                  .map((p): PanelInstance => {
                    const r = next.roofs.find((x) => x.id === p.roofId);
                    const pose = panelPose(next, p, spec, r, surfAt(p.roofId, p.center));
                    return {
                      id: p.id,
                      position: pose.position,
                      yawRad: pose.yawRad,
                      tiltRad: pose.tiltRad,
                      w: pose.w,
                      d: pose.d,
                      flush: pose.flush,
                      legs: pose.structured ? false : undefined,
                      access: 1,
                    };
                  })
              }
            />
          );
        })()}
      {!meshMode && pick && (pick.kind === 'inverter' || pick.kind === 'battery') && (
        <WallGizmo project={project} kind={pick.kind} id={pick.id} runOp={runOp} />
      )}

      {/* walkways */}
      {project.walkways.filter((w) => inScope(w.roofId)).map((w) => {
        const roof = project.roofs.find((r) => r.id === w.roofId);
        const cx = (w.a.x + w.b.x) / 2;
        const cy = (w.a.y + w.b.y) / 2;
        const h = surfAt(w.roofId, { x: cx, y: cy }) + 0.06;
        const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
        const ang = Math.atan2(-(w.b.y - w.a.y), w.b.x - w.a.x);
        return (
          <mesh key={w.id} position={[cx, h, -cy]} rotation={[0, -ang, 0]} receiveShadow castShadow>
            <boxGeometry args={[len, w.heightMm / 1000, w.widthMm / 1000]} />
            <meshStandardMaterial color="#d9a410" roughness={0.75} />
          </mesh>
        );
      })}

      {/* safety rails: posts + top bar */}
      {project.rails.filter((r) => inScope(r.roofId)).map((r) => {
        const roof = project.roofs.find((x) => x.id === r.roofId);
        const cx = (r.a.x + r.b.x) / 2;
        const cy = (r.a.y + r.b.y) / 2;
        const h = surfAt(r.roofId, { x: cx, y: cy });
        const len = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
        const ang = Math.atan2(-(r.b.y - r.a.y), r.b.x - r.a.x);
        const railH = r.heightMm / 1000;
        const posts = Math.max(2, Math.round(len / 1.5) + 1);
        return (
          <group key={r.id} position={[cx, h, -cy]} rotation={[0, -ang, 0]}>
            <mesh position={[0, railH, 0]} userData={{ shadowCaster: false }}>
              <boxGeometry args={[len, 0.05, 0.05]} />
              <meshStandardMaterial color="#c23b3b" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh position={[0, railH * 0.55, 0]}>
              <boxGeometry args={[len, 0.035, 0.035]} />
              <meshStandardMaterial color="#c23b3b" metalness={0.5} roughness={0.5} />
            </mesh>
            {Array.from({ length: posts }, (_, i) => (
              <mesh key={i} position={[-len / 2 + (i * len) / (posts - 1), railH / 2, 0]}>
                <cylinderGeometry args={[0.025, 0.025, railH, 8]} />
                <meshStandardMaterial color="#a8a8a8" metalness={0.7} roughness={0.4} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* lightning arresters */}
      {project.arresters.filter((la) => inScope(la.roofId)).map((la) => {
        const roof = project.roofs.find((x) => x.id === la.roofId);
        const base = surfAt(la.roofId, la.pos);
        return (
          <group key={la.id} position={[la.pos.x, base, -la.pos.y]}>
            {/* scene = engine: the mast casts in lib/scene-model too (engine v7) */}
            <mesh position={[0, la.heightMm / 2000, 0]} castShadow userData={{ shadowCaster: true }}>
              <cylinderGeometry args={[0.03, 0.055, la.heightMm / 1000, 10]} />
              <meshStandardMaterial color="#b7bcc4" metalness={0.85} roughness={0.3} />
            </mesh>
            <mesh position={[0, la.heightMm / 1000 + 0.07, 0]}>
              <sphereGeometry args={[0.075, 12, 12]} />
              <meshStandardMaterial color="#e3b341" metalness={0.9} roughness={0.25} />
            </mesh>
          </group>
        );
      })}

      {/* wall inverters — pickable */}
      {project.inverterPlacements.filter((ip) => inScope(ip.roofId)).map((ip, idx) => {
        const roof = project.roofs.find((r) => r.id === ip.roofId);
        if (!roof) return null;
        const a = roof.polygon[ip.edgeIndex];
        const b = roof.polygon[(ip.edgeIndex + 1) % roof.polygon.length];
        const px = a.x + (b.x - a.x) * ip.t;
        const py = a.y + (b.y - a.y) * ip.t;
        const wallAng = Math.atan2(-(b.y - a.y), b.x - a.x);
        const picked = pick?.kind === 'inverter' && pick.id === ip.id;
        const hovered = !picked && hoverPick?.kind === 'inverter' && hoverPick.id === ip.id;
        const inv = project.components.inverter;
        // hangs on the OUTSIDE face of the wall, not straddling the wall line
        const out = wallOutward(roof, ip.edgeIndex);
        return (
          <group
            key={ip.id}
            position={[px + out.x * 0.12, ip.heightM, -(py + out.y * 0.12)]}
            rotation={[0, -wallAng, 0]}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onPick({ kind: 'inverter', id: ip.id });
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHoverPick({ kind: 'inverter', id: ip.id });
            }}
            onPointerOut={() => onHoverPick(null)}
          >
            {(picked || hovered) && <PickHalo center={[0, 0, 0]} size={[0.68, 0.86, 0.4]} picked={picked} />}
            {picked && (
              <EntityLabel
                position={[0, 0.75, 0]}
                title={`Inverter ${idx + 1}`}
                lines={[
                  inv ? `${inv.brand} ${inv.model} · ${inv.acKw} kW` : 'No inverter selected',
                  `${fmtLen(ip.heightM, 1)} up the wall · strings route here`,
                ]}
                onClose={() => onPick(null)}
                actions={[
                  {
                    label: 'Remove',
                    danger: true,
                    onClick: () => {
                      runOp(inverterRemove, { id: ip.id });
                      onPick(null);
                    },
                  },
                ]}
              />
            )}
            <mesh userData={{ shadowCaster: false }}>
              <boxGeometry args={[0.48, 0.66, 0.2]} />
              <meshStandardMaterial color="#d64545" roughness={0.45} metalness={0.2} />
            </mesh>
            <mesh position={[0, -0.12, 0.104]}>
              <boxGeometry args={[0.3, 0.18, 0.012]} />
              <meshStandardMaterial color="#22262c" roughness={0.3} />
            </mesh>
            <Html center distanceFactor={30}>
              <div
                style={{
                  fontSize: 10,
                  background: 'rgba(20,24,30,0.85)',
                  color: '#f2f4f6',
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  fontFamily: 'var(--mono)',
                }}
              >
                INV {idx + 1}
              </div>
            </Html>
          </group>
        );
      })}

      {/* battery cabinets — floor-standing at a wall, pickable */}
      {(project.batteryPlacements ?? []).filter((bp) => inScope(bp.roofId)).map((bp, idx) => {
        const roof = project.roofs.find((r) => r.id === bp.roofId);
        const spec = project.components.battery;
        if (!roof || !spec) return null;
        const a = roof.polygon[bp.edgeIndex];
        const b = roof.polygon[(bp.edgeIndex + 1) % roof.polygon.length];
        const px = a.x + (b.x - a.x) * bp.t;
        const py = a.y + (b.y - a.y) * bp.t;
        const wallAng = Math.atan2(-(b.y - a.y), b.x - a.x);
        const w = spec.widthMm / 1000;
        const d = spec.depthMm / 1000;
        const h = spec.heightMm / 1000;
        const picked = pick?.kind === 'battery' && pick.id === bp.id;
        const hovered = !picked && hoverPick?.kind === 'battery' && hoverPick.id === bp.id;
        const coupling = project.components.batteryCoupling ?? 'dc_hybrid';
        // stands against the OUTSIDE face of the wall
        const out = wallOutward(roof, bp.edgeIndex);
        const off = d / 2 + 0.03;
        return (
          <group
            key={bp.id}
            position={[px + out.x * off, bp.heightM + h / 2, -(py + out.y * off)]}
            rotation={[0, -wallAng, 0]}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onPick({ kind: 'battery', id: bp.id });
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHoverPick({ kind: 'battery', id: bp.id });
            }}
            onPointerOut={() => onHoverPick(null)}
          >
            {(picked || hovered) && <PickHalo center={[0, 0, 0]} size={[w + 0.2, h + 0.2, d + 0.2]} picked={picked} />}
            {picked && (
              <EntityLabel
                position={[0, h / 2 + 0.55, 0]}
                title={`Battery ${idx + 1}`}
                lines={[
                  `${spec.brand} ${spec.model}`,
                  `${spec.kwh} kWh · ${spec.powerKw} kW · ${coupling === 'ac_coupled' ? 'AC-coupled' : 'hybrid DC'} · ${spec.weightKg} kg`,
                ]}
                onClose={() => onPick(null)}
                actions={[
                  {
                    label: 'Remove',
                    danger: true,
                    onClick: () => {
                      runOp(batteryRemove, { id: bp.id });
                      onPick(null);
                    },
                  },
                ]}
              />
            )}
            {/* cabinet: dark steel body, a lighter door panel, a status strip */}
            <mesh castShadow userData={{ shadowCaster: false }}>
              <boxGeometry args={[w, h, d]} />
              <meshStandardMaterial color="#2b3038" roughness={0.55} metalness={0.35} />
            </mesh>
            <mesh position={[0, 0, d / 2 + 0.004]}>
              <boxGeometry args={[w * 0.88, h * 0.86, 0.008]} />
              <meshStandardMaterial color="#3a404a" roughness={0.5} metalness={0.3} />
            </mesh>
            <mesh position={[0, h * 0.36, d / 2 + 0.01]}>
              <boxGeometry args={[w * 0.5, 0.02, 0.006]} />
              <meshStandardMaterial color="#4ade80" emissive="#22c55e" emissiveIntensity={1.4} toneMapped={false} />
            </mesh>
            <Html center distanceFactor={30} position={[0, h / 2 + 0.18, 0]}>
              <div
                style={{
                  fontSize: 10,
                  background: 'rgba(20,24,30,0.85)',
                  color: '#f2f4f6',
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                  fontFamily: 'var(--mono)',
                }}
              >
                BAT {idx + 1} · {spec.kwh} kWh
              </div>
            </Html>
          </group>
        );
      })}

      {/* the real neighbourhood — Google's photogrammetry, never invented boxes */}
      {!meshMode && showBuildings && (
        <RealSurround project={project} onAttribution={onSurroundAttribution} />
      )}

      {!meshMode && showSunPath && (
        <SunPath
          lat={loc.latLng.lat}
          lng={loc.latLng.lng}
          date={date}
          radius={R * 0.75}
          northOffsetDeg={project.calibration.northOffsetDeg}
        />
      )}
      {!meshMode && sunVisible && (
        <mesh position={sunDir.clone().multiplyScalar(R * 0.75)}>
          <sphereGeometry args={[2.1, 20, 20]} />
          <meshBasicMaterial color="#fff0c0" />
        </mesh>
      )}
      </group>
    </group>
  );
}

function RoofMesh({
  roof,
  allRoofs,
  eaveProj,
  photoreal,
  outline,
}: {
  roof: Project['roofs'][number];
  allRoofs: Project['roofs'];
  eaveProj?: number;
  photoreal: boolean;
  /** pick/hover colour for the deck outline; undefined = the quiet default */
  outline?: string;
}) {
  const geom = useMemo(
    () => buildRoofSolidGeometry(roof, eaveProj),
    // slope fields change the surface, so rebuild when any of them move
    [roof.polygon, roof.heightM, roof.pitchDeg, roof.slopeAzimuthDeg, eaveProj],
  );

  // explicit top-ring outline (a sloped solid's EdgesGeometry would show every
  // wall vertical — we only want the roof perimeter highlighted)
  const topRing = useMemo(() => {
    const pts = roofTopRing(roof, eaveProj).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    if (pts.length) pts.push(pts[0].clone());
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [roof.polygon, roof.heightM, roof.pitchDeg, roof.slopeAzimuthDeg, eaveProj]);

  const parapetGeoms = useMemo(() => {
    return buildParapetGeometries(roof, allRoofs).map((band) => {
      const g = new THREE.ExtrudeGeometry(band.shape, {
        depth: band.heightM,
        bevelEnabled: false,
      });
      g.rotateX(-Math.PI / 2);
      g.translate(0, roof.heightM, 0);
      return g;
    });
  }, [roof, allRoofs]);

  // every vertex-edit rebuilds these BufferGeometries — without disposal the
  // GPU buffers of every previous shape leak for the life of the tab
  useEffect(() => () => geom.dispose(), [geom]);
  useEffect(() => () => topRing.dispose(), [topRing]);
  useEffect(
    () => () => {
      for (const g of parapetGeoms) g.dispose();
    },
    [parapetGeoms],
  );

  // distinct soft tint per roof in the plain/mesh studio view; photoreal keeps
  // realistic concrete so the final look isn't rainbow-coloured
  const colorIndex = allRoofs.findIndex((r) => r.id === roof.id);
  // weathered RCC reads at ~40% albedo; a near-white deck blows out under sun + sky
  const surfaceColor = photoreal ? '#a8a39a' : lightenHex(roofColor(colorIndex), 0.5);

  return (
    <group>
      <mesh geometry={geom} castShadow receiveShadow userData={{ shadowCaster: true }}>
        <meshStandardMaterial
          color={surfaceColor}
          roughness={0.9}
          envMapIntensity={0.55}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineLoop geometry={topRing} raycast={() => null}>
        <lineBasicMaterial color={outline ?? '#8f8a82'} toneMapped={!outline} />
      </lineLoop>
      {parapetGeoms.map((g, i) => (
        <mesh key={i} geometry={g} castShadow receiveShadow userData={{ shadowCaster: true }}>
          <meshStandardMaterial color="#9f998f" roughness={0.92} envMapIntensity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Deterministic DECORATIVE neighbourhood (shared generator in lib/scene-model).
 * Visual context only, and it casts NO shadows at all: the shading engine
 * excludes decor (audit R6), so a decor shadow sweeping over panels on screen
 * would contradict the numbers. Model real neighbours as 'building'
 * obstructions to make them count in BOTH.
 */
/**
 * Golden sun-path arc with hour markers. Hour labels use drei <Html> chips —
 * deliberately NOT drei <Text>: troika fetches its font at runtime and the
 * suspended subtree used to blank out every sibling (the invisible-panels bug).
 */
function SunPath({
  lat,
  lng,
  date,
  radius,
  northOffsetDeg = 0,
}: {
  lat: number;
  lng: number;
  date: Date;
  radius: number;
  northOffsetDeg?: number;
}) {
  const { points, hours } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const hrs: { pos: THREE.Vector3; label: string }[] = [];
    const offset = (northOffsetDeg * Math.PI) / 180;
    for (let h = 5; h <= 19; h += 0.25) {
      // solar hours — the arc must cross the horizon exactly where the
      // sunrise/sunset labels (already solar) say it does; azimuth shifted
      // into the image frame like every other sun consumer
      const s = sunPosition(simTimeDate(date, h, lng), lat, lng);
      if (s.altitude <= 0) continue;
      const az = s.azimuth + offset;
      const v = new THREE.Vector3(
        Math.cos(s.altitude) * Math.sin(az) * radius,
        Math.sin(s.altitude) * radius,
        -Math.cos(s.altitude) * Math.cos(az) * radius,
      );
      pts.push(v);
      if (h % 1 === 0)
        hrs.push({ pos: v.clone().multiplyScalar(1.05), label: String(h) });
    }
    return { points: pts, hours: hrs };
  }, [lat, lng, date, radius, northOffsetDeg]);

  if (points.length < 2) return null;
  return (
    <group>
      <Line points={points} color="#d4a017" lineWidth={1.6} dashed dashSize={1.2} gapSize={0.6} />
      {hours.map((h, i) => (
        <Html key={i} position={h.pos.toArray()} center zIndexRange={[10, 0]}>
          <span
            style={{
              fontSize: 10,
              color: '#d4a017',
              background: 'rgba(0,0,0,0.5)',
              borderRadius: 4,
              padding: '1px 5px',
              fontFamily: 'var(--mono)',
              pointerEvents: 'none',
              userSelect: 'none',
            }}
          >
            {h.label}
          </span>
        </Html>
      ))}
    </group>
  );
}
