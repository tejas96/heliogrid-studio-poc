// ─── 3D Studio v2: photoreal scene, sun sim, solar access, pro HUD ──────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import {
  CameraControls,
  CameraControlsImpl,
  Environment,
  Html,
  Lightformer,
  Line,
  Sky,
  Stars,
} from '@react-three/drei';
import * as THREE from 'three';
import { designBounds, shadowBounds, type SceneBounds } from './scene-bounds';
import { projectForStage, stageShowsDesign } from '../lib/scene-stage';
import { RadialMenu, type RadialGroup, type RadialItem } from '../components/RadialMenu';
import { ACCESS_GRADIENT_CSS } from '../lib/shade-ramp';
import { PanelYieldCard, usePanelYield } from '../components/PanelYieldCard';
import { PanelLabels } from './PanelLabels';
import { InverterBay, bayInverters } from '../components/InverterBay';
import { wireTableToggle } from '../lib/electrical/wire-table';
import { ScenePost } from './ScenePost';
import { EntityLabel } from './EntityLabel';
import { HOVER_COLOR, PICK_COLOR, PickHalo } from './PickHalo';
import { useOps } from '../store/useOps';
import type { DesignOp } from '../lib/ops/types';
import type { OpPreview } from '../lib/ops/run';
import { inverterPlace, inverterRemove } from '../lib/ops/electrical-ops';
import { layoutGrow, panelsDelete, segmentDelete, segmentDuplicate } from '../lib/ops/layout-ops';
import { batteryPlace, batteryRemove } from '../lib/ops/battery-ops';
import { boxPlace, boxRemove } from '../lib/ops/box-ops';
import { stringRemove } from '../lib/ops/string-ops';
import { ObstructionGizmo, TableGizmo, WallGizmo } from './Gizmos';
import { Measure, type MeasureMode } from './Measure';
import { unitBaseY, unitWhere } from '../lib/unit-pos';
import { clockHour, seasonDates } from '../lib/sun-chart';
import { groundLiftAt, useTerrainGeneration } from './terrain-probe';
import { casterCost } from '../lib/energy/report';
import { useShadeProfileVersion } from '../lib/use-shade-profile';
import { SunChart } from './SunChart';
import { MarqueeSelect, type MarqueeCommit } from './MarqueeSelect';
import { RealSurround } from './RealSurround';
import { SurroundRelief } from './SurroundRelief';
import { ROOF_HEIGHT_TOLERANCE_M, roofReadings } from '../lib/surround-check';
import { surroundSetIgnored } from '../lib/ops/site-ops';
import { obstructionsAddFromMap, roofApplyMapFit } from '../lib/ops/roof-ops';
import { raisedObjectsNotDrawn, roofMapFit, roofRaisedObjects } from '../lib/roof-map-fit';
import { useSurroundGrid } from '../lib/use-surround-grid';
import { clockLabel } from '../lib/sun-chart';
import { getRoofSurface } from './roof-textures';
import { ElectricalOverlay } from './Electrical';
import { wallOutward } from '../lib/battery';
import type { PanelInstance } from './PanelsInstanced';

/** the first selected module of a table, so "Edit table" opens on the module the user picked */
function selectedPanelOf(mine: { id: string }[], selected: ReadonlySet<string>): string | undefined {
  return mine.find((p) => selected.has(p.id))?.id;
}
import { obstructionDuplicate, obstructionRemove, obstructionRotate, obstructionSetCastsShadow } from '../lib/ops/site-ops';
import { castsAnalyticalShadow } from '../lib/capabilities';
import { polygonArea } from '../lib/geo';
import type { EntityProvenance, ObstructionType } from '../types';

/** What the scene can pick besides modules (modules use the shared selection). */
/**
 * Pick order. Cable runs lie under the modules, so from above the glass is
 * always the nearest hit — the run could never be clicked. Objects that ask
 * for priority (`userData.pickPriority`) go first whenever the ray passes
 * through them; everything else keeps the nearest-first order.
 */
function pickFilter(items: THREE.Intersection[]): THREE.Intersection[] {
  if (items.length < 2) return items;
  const pri = (i: THREE.Intersection) => (i.object.userData?.pickPriority as number | undefined) ?? 0;
  if (!items.some((i) => pri(i) > 0)) return items;
  return [...items].sort((a, b) => pri(b) - pri(a) || a.distance - b.distance);
}

/**
 * The steel stand under a free-standing unit: two posts from the surface it
 * stands on up to the unit's base. Drawn in the unit's own group, whose
 * origin is the unit's base at `height` above that surface.
 */
function UnitStand({ width, height }: { width: number; height: number }) {
  if (height < 0.15) return null;
  const legs = [-width * 0.35, width * 0.35];
  return (
    <group>
      {legs.map((x) => (
        <mesh key={x} position={[x, -height / 2, 0]} castShadow userData={{ shadowCaster: false }}>
          <boxGeometry args={[0.05, height, 0.05]} />
          <meshStandardMaterial color="#6b7280" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, -height + 0.02, 0]} userData={{ shadowCaster: false }}>
        <boxGeometry args={[width * 0.9, 0.04, 0.3]} />
        <meshStandardMaterial color="#6b7280" roughness={0.6} metalness={0.5} />
      </mesh>
    </group>
  );
}

/**
 * A ground-level unit stands in the plant room: a concrete pad with a thin
 * kerb under it, drawn in the unit's group at its base. Says "this is a
 * place on the ground, not a thing floating beside the wall".
 */
function PlantPad({ width, depth, baseOffset }: { width: number; depth: number; baseOffset: number }) {
  return (
    <group position={[0, baseOffset, 0]}>
      <mesh position={[0, 0.05, 0]} receiveShadow userData={{ shadowCaster: false }}>
        <boxGeometry args={[width, 0.1, depth]} />
        <meshStandardMaterial color="#9a9a94" roughness={0.9} metalness={0} />
      </mesh>
      <mesh position={[0, 0.11, 0]} userData={{ shadowCaster: false }}>
        <boxGeometry args={[width + 0.12, 0.02, depth + 0.12]} />
        <meshStandardMaterial color="#6b6b66" roughness={0.9} metalness={0} />
      </mesh>
    </group>
  );
}

/**
 * The card for ONE module, anchored on it. Its own component because the hook
 * that works the numbers out cannot be called conditionally, and the card only
 * exists while a module is picked.
 */
function PanelCard({
  project,
  panelId,
  positions,
  onClose,
  onFocusBlocker,
}: {
  project: Project;
  panelId: string;
  positions: globalThis.Map<string, { position: [number, number, number]; lift: number }>;
  onClose: () => void;
  onFocusBlocker?: (kind: string, id: string) => void;
}) {
  const info = usePanelYield(project, panelId);
  const at = positions.get(panelId);
  if (!info || !at) return null;
  // Named the way the 2D editor names it: its table, then its cell. A bare
  // "Module" tells you nothing on a roof holding two hundred of them.
  const p = project.panels.find((x) => x.id === panelId);
  const seg = p?.segmentId ? project.segments.find((s) => s.id === p.segmentId) : undefined;
  const cell =
    p?.cellIndex === undefined
      ? null
      : `R${Math.floor(p.cellIndex / COL_STRIDE) + 1}C${(p.cellIndex % COL_STRIDE) + 1}`;
  return (
    <EntityLabel
      position={[at.position[0], at.position[1] + at.lift + 0.9, at.position[2]]}
      title={seg ? `Module ${seg.label}${cell ? ` · ${cell}` : ''}` : 'Module'}
      lines={[]}
      onClose={onClose}
    >
      <PanelYieldCard info={info} onFocusBlocker={onFocusBlocker} />
    </EntityLabel>
  );
}

/**
 * Atmosphere: the haze and the night background, put on the SCENE.
 *
 * These were declared as `<fogExp2 attach="fog">` and `<color attach="background">`
 * inside SceneContents — which returns a `<group>`, so r3f dutifully attached
 * them to that group. A Group has no fog and no background; the renderer never
 * looks there. Measured: `scene.fog` was null and `scene.background` null with
 * both tags mounted, so the site has never had any aerial perspective at all.
 * That is why the ground ended in a razor-sharp cut with flat grey above it.
 *
 * Setting them through `useThree` names the target explicitly, so this cannot
 * silently attach to the wrong object again.
 */
function Atmosphere({ color, density, background }: { color: string; density: number; background: string | null }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const prev = scene.fog;
    scene.fog = new THREE.FogExp2(color, density);
    return () => {
      scene.fog = prev;
    };
  }, [scene, color, density]);
  useEffect(() => {
    const prev = scene.background;
    scene.background = background ? new THREE.Color(background) : null;
    return () => {
      scene.background = prev;
    };
  }, [scene, background]);
  return null;
}

/** Installs the pick order on the fiber event manager (must live inside the Canvas). */
function PickOrder({ wiring }: { wiring: boolean }) {
  const setEvents = useThree((s) => s.setEvents);
  useEffect(() => {
    // While a string is being built by hand the MODULE is the only thing being
    // clicked at, and the runs sit right under the glass claiming priority —
    // so every other tap picked a cable instead of the module under it. In
    // that mode the nearest hit wins, which is the module.
    setEvents({ filter: wiring ? (items: THREE.Intersection[]) => items : pickFilter });
  }, [setEvents, wiring]);
  return null;
}

/**
 * Dev-only handle on the live scene. A renderer bug — z-fighting, a material
 * that did not take, a mesh drawn at the wrong height — can only be settled by
 * reading the scene graph, and r3f keeps it behind its own store. Costs
 * nothing in production, where the block is stripped.
 */
function DevSceneHandle({ sceneRef }: { sceneRef?: React.RefObject<THREE.Scene | null> }) {
  const three = useThree();
  // The scene ref is NOT dev-only: the .glb export needs the live scene in
  // production too, and r3f keeps it behind its own store.
  useEffect(() => {
    if (!sceneRef) return;
    sceneRef.current = three.scene;
    return () => {
      sceneRef.current = null;
    };
  }, [three, sceneRef]);
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __three?: unknown }).__three = three;
    return () => {
      (window as unknown as { __three?: unknown }).__three = undefined;
    };
  }, [three]);
  return null;
}

// defined in ./scene-pick so the overlays can read it without importing Scene3D
import { exportSceneGlb, glbFilename } from './glb-export';
import type { ScenePick } from './scene-pick';
export type { ScenePick };
type RunOp = <A>(op: DesignOp<A>, args: A) => OpPreview;

/**
 * Where a roof's HEIGHT came from, and separately where its OUTLINE came from.
 *
 * The card used to print one bare word — the outline's provenance — on the
 * line under the eave height, with nothing to say which number it described.
 * On the owner's tower that read "74.7 m eave / flat · rcc flat · traced by
 * hand", so a height MEASURED off Google's aerial map looked hand-typed. The
 * house rule is that every user-visible number carries its tier; a number
 * standing next to somebody else's tier is worse than one carrying none.
 */
export const HEIGHT_SOURCE_NAME: Record<'aerial_map' | 'user' | 'unknown', string> = {
  aerial_map: 'from the aerial map',
  user: 'entered by hand',
  // older projects were saved before the height carried a source at all
  unknown: 'source not recorded',
};

export const OUTLINE_SOURCE_NAME: Record<EntityProvenance['source'], string> = {
  manual: 'outline traced by hand',
  dataLayers: 'outline from Google',
  gemini: 'outline detected by AI',
};

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
  BoxSelect,
  Building2,
  Cable,
  Camera,
  Check,
  Eye,
  Grid3x3,
  Hash,
  Layers,
  Link2,
  Map,
  Orbit,
  Pause,
  Play,
  Route,
  Share2,
  Download,
  SunMedium,
  Sunrise,
  Sunset,
  X,
  ChevronsUp,
  ChevronsLeft,
  ChevronsRight,
  Crosshair,
  Focus,
  Footprints,
  Maximize2,
  Minimize2,
  Ruler,
  Triangle,
  Shapes,
  MoveVertical,
  Eraser,
  Keyboard,
} from 'lucide-react';
import { useActiveProject, useProjectPatch, useStore } from '../store/store';
import { useUnits } from '../store/useUnits';
import { applyStructChoice, type StructChoice } from '../lib/structure-edit';
import { COL_STRIDE } from '../lib/layout';
import { shadingFp } from '../lib/fingerprints';
import {
  accessLabel,
  computeHeatmap,
  type HeatCancel,
  type HeatmapResult,
} from '../lib/solar-heatmap';
import { HeatmapLayer } from './HeatmapLayer';
import type { Project, XY } from '../types';
import { sunPosition, sunriseSunset, fmtHour } from '../lib/solar';
import { simTimeDate } from '../lib/sim-time';
import { polygonCentroid } from '../lib/geo';
import { staticSatelliteUrl, metersPerStaticMap, zoomCovering } from '../lib/maps';
import { SAT_ZOOM } from '../lib/maps';
import { EnergyReportSheet } from '../components/EnergyReportSheet';
import {
  buildParapetGeometries,
  buildRoofSolidGeometry,
  roofTopRing,
} from '../lib/scene-model';
import { computeEaveRefs, surfaceHeightAt } from '../lib/roof-plane';
import { obstructionBaseY } from '../lib/ground';
import { lightenHex, roofColor } from '../lib/roof-colors';
import { PanelsInstanced } from './PanelsInstanced';
import { StructureInstanced } from './StructureInstanced';
import { StructureNodesInstanced } from './StructureNodesInstanced';
import { deriveStructures } from '../lib/derive';
import {
  DEFAULT_STRUCTURE_VIEW,
  effectiveView,
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

type ViewPreset = 'top' | 'iso' | 'front' | 'back' | 'left' | 'right';

/** Unit view directions; the camera director scales them to the design's size. */
const VIEW_DIRS: Record<ViewPreset, [number, number, number]> = {
  top: [0.001, 1, 0.001],
  iso: [0.55, 0.62, 0.55],
  // elevations: front looks north over the site (camera south of it), and so on
  front: [0, 0.3, 1],
  back: [0, 0.3, -1],
  left: [-1, 0.3, 0],
  right: [1, 0.3, 0],
};

/** What the F key flies to: a sphere around the picked entity, in scene units. */
export type FocusSphere = { x: number; y: number; z: number; r: number };

/** What a wall click hangs while a place mode is on. */
export type PlaceKind = 'inverter' | 'battery' | 'dcdb' | 'acdb';
const PLACE_NAME: Record<PlaceKind, string> = { inverter: 'inverter', battery: 'battery', dcdb: 'DCDB', acdb: 'ACDB' };

/** Eye height of the walkthrough camera above the deck it stands on. */
const WALK_EYE_M = 1.7;
/**
 * How far above the site's datum the orbit camera and its target must stay.
 *
 * `minDistance` bounds the camera's distance to its TARGET, not to the ground,
 * and `dollyToCursor` walks that target towards whatever the pointer is over —
 * so dollying at the ground marched the target down through the terrain and
 * took the camera with it. Measured: the camera reached y = −3.92 with every
 * ground surface at −1.5 or above. Underneath, the single-sided ground planes
 * cull away and you are left looking at sky through the floor.
 *
 * Eye height is the natural floor: you can stand on the site, never inside it.
 */
const CAMERA_FLOOR_M = 1.7;
/**
 * The closest the orbit camera may come to what it is looking at.
 *
 * At 1.5 m the camera could press against the Google photomesh — measured at
 * 0.9 m from the lens — whose imagery here is about half a metre per texel and,
 * in India, carries no buildings at all. That close it is a wall of pale blocks
 * with stair-stepped edges, and the tile streamer swapping LOD levels underneath
 * makes those blocks jump about: the flicker. A module is 1–2 m, so three metres
 * still fills a third of the frame with it.
 */
const MIN_ORBIT_M = 3;

/** Side of the scene's ground plane, metres — the aerial picture must cover it. */
const GROUND_PLANE_M = 300;
/**
 * How far the plain ground runs — the backstop under everything, far enough
 * out that the haze has entirely taken it over (FogExp2 at 0.0006 is ~99% by
 * 4 km), so the world arrives at the sky's own colour rather than stopping.
 */
const HORIZON_PLANE_M = 8000;
/**
 * How far the ground stays a PHOTOGRAPH.
 *
 * The first attempt at a horizon backed the imagery with a plain grey plane,
 * which swapped a hard edge for something worse: a vast dead plate filling the
 * middle distance. Ground has to stay ground. The aerial layers are therefore
 * a hand-built mip pyramid — the sharp site tile (~70 m), the neighbourhood
 * (~560 m), and this one — each about five times the last, so the eye never
 * meets a boundary between a picture and a blank.
 *
 * Three kilometres is where the haze reaches ~89% and takes over honestly.
 */
const FAR_GROUND_M = 3000;
/**
 * Gap between the stacked ground pictures. Not cosmetic: two coplanar surfaces
 * closer than the depth buffer can resolve alternate as the camera moves, and
 * the bottom one here is near black. Depth precision runs about z²/(near·2²⁴),
 * so at 600 m it is already 8 cm — half a metre keeps a comfortable margin at
 * every distance the studio is used at.
 */
const GROUND_STACK_M = 0.75;

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

/**
 * Where the camera was last left, per project.
 *
 * `presetPose` recomputes every preset from the design's bounding sphere on each
 * mount, and the framing effect ran it on first mount unconditionally — so you
 * never returned to the angle you left. Leave Step 6 to price the BOM, come
 * back, and the view you had lined up on the north-light purlins was gone.
 *
 * Keyed by project id AND by the bounds key, so this only restores a pose that
 * still frames the same design: change the footprint and the scene re-frames as
 * it always did, which is the behaviour that stops a 300 m site opening
 * off-screen. Module-level rather than in the project, because a camera angle is
 * not part of the engineering record — it must never enter a fingerprint or
 * stale a capture. It lives as long as the tab.
 *
 * Not the same thing as SAVED NAMED VIEWS, which the gap report also asks for;
 * this is only "put me back where I was".
 */
// (a plain record, not a Map — `Map` in this module is the lucide icon)
interface CameraPose {
  pos: readonly [number, number, number];
  target: readonly [number, number, number];
  key: string;
}
const lastPose: Record<string, CameraPose> = {};

export function Scene3D({
  onClose,
  captureMode = false,
  onCapture,
  initial,
  readOnly = false,
  projectOverride,
  stage,
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
  /**
   * The wizard step this scene was opened from. It scopes what the scene may
   * show to what that step owns (lib/scene-stage). Absent = the full studio.
   */
  stage?: number;
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
  const fullProject = projectOverride ?? storeProject!;
  // ONE scope for the whole scene — meshes, camera bounds, picking and shading
  // all read this, so an early step cannot show a later step's work.
  const project = useMemo(() => projectForStage(fullProject, stage), [fullProject, stage]);
  const designStage = stageShowsDesign(stage);
  const loc = project.location!;
  const patchProject = useProjectPatch();
  const ops = useOps();
  // non-module picks (obstruction / inverter / roof) — view state, never persisted
  const [pick, setPick] = useState<ScenePick | null>(null);
  // a refused op says why, briefly, next to the rails
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = (text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2600);
  };
  const { dispatch } = useStore();
  // measure / place / keyboard help — view state only
  const [measure, setMeasure] = useState<MeasureMode>('off');
  const [measureClear, setMeasureClear] = useState(0);
  const [measureCount, setMeasureCount] = useState(0);
  const [placeKind, setPlaceKind] = useState<PlaceKind | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  // box select: a drag on the canvas with Shift held, or with Select mode on.
  // The rectangle lives here (DOM); the projection test lives inside the Canvas
  // (MarqueeSelect).
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [marqueeCommit, setMarqueeCommit] = useState<MarqueeCommit | null>(null);
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /**
   * Select mode — the touch way into a multi-module selection. Every route to
   * more than one module went through Shift: the box, and adding a module to
   * what is already picked. A phone has no Shift key, so a touch user could
   * select exactly one module and no more, and half the toolbar (delete,
   * rotate, tilt, group) was unreachable for a block of forty.
   *
   * A MODE rather than a gesture, because every free gesture on the canvas is
   * already spoken for: one finger orbits, two pinch. While it is on, a drag
   * draws the box and a tap adds; off, the camera has everything back. Shift
   * still works on a keyboard, mode or no mode.
   */
  const [boxSelect, setBoxSelect] = useState(false);
  const onWrapPointerDownCapture = (e: React.PointerEvent) => {
    if (!(e.shiftKey || boxSelect) || e.button !== 0) return;
    if ((e.target as HTMLElement).tagName !== 'CANVAS') return; // rails and cards keep their clicks
    // The camera must not orbit under the box — but this used to be done by
    // stopping the press dead, which meant the canvas never saw it and NO
    // shift gesture could ever reach a module. Shift-click-takes-a-table
    // silently did nothing. Disabling the controls in the capture phase, before
    // they see the event, stops the orbit just as well and leaves the press and
    // the click to travel on to the modules underneath.
    const controls = controlsRef.current;
    const wasEnabled = controls?.enabled ?? true;
    if (controls) controls.enabled = false;
    const pointerId = e.pointerId;
    const start = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
    marqueeRef.current = start;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const m = marqueeRef.current;
      if (!m) return;
      const next = { ...m, x1: ev.clientX, y1: ev.clientY };
      marqueeRef.current = next;
      // only draw the rectangle once this is plainly a DRAG; below that it is
      // still a click, and a flickering 2 px box would only be noise
      if (Math.abs(next.x1 - next.x0) > 3 || Math.abs(next.y1 - next.y0) > 3) setMarquee(next);
    };
    const onUp = (ev?: Event) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('blur', onUp);
      window.removeEventListener('pointerdown', onSecondPointer, true);
      // ALWAYS give the camera back. A gesture that ends off-window, or is
      // cancelled by the OS, would otherwise leave the controls switched off
      // for good and the scene frozen with no way to recover but a reload.
      if (controls) controls.enabled = wasEnabled;
      const m = marqueeRef.current;
      marqueeRef.current = null;
      setMarquee(null);
      // A press that never moved is a CLICK — the module under it handles
      // itself, and committing a zero-size box on top would be a second,
      // conflicting answer to the same gesture.
      if (ev?.type === 'pointerup' && m && (Math.abs(m.x1 - m.x0) > 3 || Math.abs(m.y1 - m.y0) > 3)) {
        setMarqueeCommit({ ...m, nonce: Date.now() });
      }
    };
    // A SECOND finger means the user wants the CAMERA, not a box. Select mode
    // stays on for as long as the user leaves it on, so without this it would
    // swallow pinch-zoom the whole time — the mode would cost them the scene.
    // Handing the gesture back in the capture phase lets the controls see that
    // second press: the pinch itself is lost (they never saw the first finger),
    // but the camera answers again on the next touch instead of being frozen.
    function onSecondPointer(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) onUp();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('blur', onUp);
    window.addEventListener('pointerdown', onSecondPointer, true);
  };
  const [hoverPick, setHoverPick] = useState<ScenePick | null>(null);
  // Phase 5: strings and cable runs on the model; `wiring` = module ids being
  // wired by hand (module clicks toggle membership while it is set)
  const [showElectrical, setShowElectrical] = useState(true);
  const [wiring, setWiring] = useState<string[] | null>(null);
  // which inverter the next hand-made string lands on; null = let the balancer
  // choose, which is what it always did and stays the default
  const [wireTarget, setWireTarget] = useState<number | null>(null);
  const wiringSet = useMemo(() => (wiring ? new Set(wiring) : null), [wiring]);
  // Google's data attribution for the streamed surroundings (terms of use)
  const [surroundAttribution, setSurroundAttribution] = useState('');
  const runOp: RunOp = (op, args) => {
    const r = ops.run(op, args);
    if (!r.ok) showNotice(r.refusal.reason);
    return r;
  };
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
    if (!structEdit && !pick && !wiring) return;
    const inCard = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest('[data-struct-edit-card],[data-entity-label]');
    let down: { x: number; y: number; inCard: boolean } | null = null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeStructEdit();
        setPick(null);
        setWiring(null);
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
  }, [structEdit, pick, wiring]);
  // the edited table can vanish under us (undo, delete in the 2D tab)
  useEffect(() => {
    if (structEdit && !project.segments.some((sg) => sg.id === structEdit.segId)) {
      closeStructEdit();
    }
  }, [project.segments, structEdit]);

  const [preset, setPreset] = useState<SeasonPreset>('today');
  const [date, setDate] = useState<Date>(initial?.date ?? new Date());
  const [hour, setHour] = useState(initial?.hour ?? 12);
  const [playing, setPlaying] = useState(false);
  const [solarAccessView, setSolarAccessView] = useState(initial?.solarAccess ?? false);
  // the sun figure written on each module — OFF by default, because a 200
  // module roof wearing 200 numbers is a wall of text, not an answer
  const [showLabels, setShowLabels] = useState(false);
  const labelLayer = useRef<HTMLDivElement>(null);
  // false = the mode is on but the camera is too far out for any figure to be
  // readable, so the scene says "zoom in" rather than looking broken
  const [labelsVisible, setLabelsVisible] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'mesh'>(initialViewMode);
  // ONE switch for the real surroundings: the same flag hides them and takes
  // them out of the shading, so the picture and the numbers always agree. It
  // lives on the project, so the choice survives a reload.
  const showBuildings = !project.ignoreSurround;
  const [showSunPath, setShowSunPath] = useState(true);
  const [showSunChart, setShowSunChart] = useState(false);
  // ── inspect: isolate the picked entity, fly to it, walk the site ──────────
  // View state only: never persisted, never fingerprinted.
  const [isolate, setIsolate] = useState(false);
  const [walk, setWalk] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const pickFocusRef = useRef<FocusSphere | null>(null);
  const walkSaved = useRef<{
    pos: THREE.Vector3;
    target: THREE.Vector3;
    minDistance: number;
    maxDistance: number;
    maxPolarAngle: number;
    azimuthRotateSpeed: number;
    polarRotateSpeed: number;
  } | null>(null);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // isolation follows the pick: losing the pick shows everything again
  useEffect(() => {
    if (!pick) setIsolate(false);
  }, [pick]);
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
  // the SHADOW box is wider than the camera's: it has to hold the neighbours
  // that shade the design, which the camera has no business framing
  const shadowFit = useMemo(
    () => shadowBounds(project, focusRoofForBounds && focusRoofForBounds.length ? focusRoofForBounds : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.roofs, project.panels, project.obstructions, focusRoofId],
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
  const heatFp = useMemo(() => shadingFp(project), [project]);
  useEffect(() => {
    if (heatmap) {
      // present flat, top-down over the satellite (not the 3D model)
      setViewMode('map');
      goView('top');
      // no modules are drawn in here, so a select mode left on would only be a
      // hint bar promising something the view cannot do
      setBoxSelect(false);
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
  // re-frame when the design's footprint changes shape.
  // <Canvas> mounts its children in its own React root, so the controls arrive
  // AFTER this component's effects — a fixed 2 s poll used to give up on a slow
  // first open (tile streaming, texture bakes) and leave the camera at the raw
  // default pose: a horizon view with the building off to one side. The
  // controls now announce themselves through state instead.
  /** The live scene, for the .glb export — r3f keeps it inside its own store. */
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [glbBusy, setGlbBusy] = useState(false);
  const [controlsReady, setControlsReady] = useState(false);
  const attachControls = useCallback((c: CameraControlsImpl | null) => {
    controlsRef.current = c;
    if (c) setControlsReady(true);
  }, []);
  /**
   * The floor. CameraControls' own boundary is the right tool: it clamps the
   * TARGET, and with `boundaryEnclosesCamera` the camera too, so the dolly can
   * no longer march either of them down through the terrain.
   *
   * Not applied while WALKING — a walkthrough is deliberately at eye height on
   * the deck, and it carries its own clamps (enterWalk pins the distance and
   * opens the polar angle). Boxing it in as well would fight those.
   */
  useEffect(() => {
    const c = controlsRef.current;
    if (!controlsReady || !c) return;
    if (walk) {
      c.setBoundary(undefined);
      c.boundaryEnclosesCamera = false;
      return;
    }
    // wide enough in plan that the boundary never limits a pan across the site
    const reach = Math.max(1000, bounds.r * 20);
    c.setBoundary(
      new THREE.Box3(
        new THREE.Vector3(bounds.cx - reach, bounds.yMin + CAMERA_FLOOR_M, bounds.cz - reach),
        new THREE.Vector3(bounds.cx + reach, bounds.yMin + CAMERA_FLOOR_M + 4000, bounds.cz + reach),
      ),
    );
    c.boundaryEnclosesCamera = true;
  }, [controlsReady, walk, bounds]);

  const boundsKey = `${bounds.cx.toFixed(1)}|${bounds.cz.toFixed(1)}|${bounds.r.toFixed(1)}`;
  const framedFor = useRef<string>('');
  useEffect(() => {
    const c = controlsRef.current;
    if (!controlsReady || !c) return;
    if (framedFor.current === boundsKey) return;
    const first = framedFor.current === '';
    framedFor.current = boundsKey;
    // On the FIRST mount, go back to the angle this design was left at — but
    // only if it still frames the same design. A changed footprint re-frames,
    // which is what keeps a 300 m site from opening off-screen.
    const saved = first ? lastPose[project.id] : undefined;
    if (saved && saved.key === boundsKey) {
      void c.setLookAt(
        saved.pos[0], saved.pos[1], saved.pos[2],
        saved.target[0], saved.target[1], saved.target[2],
        false,
      );
      return;
    }
    goView('iso', !first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bounds, boundsKey, controlsReady, project.id]);

  /**
   * Remember the pose whenever the camera comes to rest, and once more on the
   * way out. 'rest' fires after an orbit or a fly-to settles, so what is stored
   * is a pose the user actually chose rather than a frame mid-animation.
   *
   * Skipped for capture and read-only mounts: a screenshot pass or a shared
   * viewer drives the camera itself, and letting it overwrite the EPC's working
   * angle would be a worse bug than the one this fixes.
   */
  useEffect(() => {
    const c = controlsRef.current;
    if (!controlsReady || !c || captureMode || readOnly) return;
    const save = () => {
      const p = c.getPosition(new THREE.Vector3());
      const t = c.getTarget(new THREE.Vector3());
      lastPose[project.id] = { pos: [p.x, p.y, p.z], target: [t.x, t.y, t.z], key: boundsKey };
    };
    c.addEventListener('rest', save);
    return () => {
      c.removeEventListener('rest', save);
      save(); // the pose on the way out, even if it never came to rest
    };
  }, [controlsReady, captureMode, readOnly, project.id, boundsKey]);

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

  /** Object focus: fly to the picked entity, keeping the current viewing angle. */
  function focusPick() {
    const c = controlsRef.current;
    const f = pickFocusRef.current;
    if (!c || !f) return;
    void c.fitToSphere(new THREE.Sphere(new THREE.Vector3(f.x, f.y, f.z), Math.max(1.5, f.r)), true);
  }

  /**
   * Walkthrough: the camera becomes a person standing on the site. The
   * orbit target sits one metre in front of the eye, so the mouse looks
   * around instead of orbiting; W/S/A/D walk, Q/E climb, arrows turn.
   * Entering saves the orbit pose and the controls' clamps; leaving puts
   * every one of them back.
   */
  function enterWalk() {
    const c = controlsRef.current;
    if (!c || walkSaved.current) return;
    walkSaved.current = {
      pos: c.getPosition(new THREE.Vector3()),
      target: c.getTarget(new THREE.Vector3()),
      minDistance: c.minDistance,
      maxDistance: c.maxDistance,
      maxPolarAngle: c.maxPolarAngle,
      azimuthRotateSpeed: c.azimuthRotateSpeed,
      polarRotateSpeed: c.polarRotateSpeed,
    };
    c.minDistance = 1;
    c.maxDistance = 1;
    c.maxPolarAngle = Math.PI * 0.95;
    // negative speeds: drag left looks left, like every first-person camera
    c.azimuthRotateSpeed = -0.3;
    c.polarRotateSpeed = -0.3;
    // stand at the near edge of the design, eye height above its deck, looking in
    const from = walkSaved.current.pos;
    const dx = from.x - bounds.cx;
    const dz = from.z - bounds.cz;
    const n = Math.hypot(dx, dz) || 1;
    const ex = bounds.cx + (dx / n) * bounds.r * 0.9;
    const ez = bounds.cz + (dz / n) * bounds.r * 0.9;
    const ey = bounds.cy + WALK_EYE_M;
    void c.setLookAt(ex, ey, ez, ex - (dx / n), ey, ez - (dz / n), true);
    setWalk(true);
  }
  function exitWalk() {
    const c = controlsRef.current;
    const s = walkSaved.current;
    walkSaved.current = null;
    setWalk(false);
    if (!c || !s) return;
    c.minDistance = s.minDistance;
    c.maxDistance = s.maxDistance;
    c.maxPolarAngle = s.maxPolarAngle;
    c.azimuthRotateSpeed = s.azimuthRotateSpeed;
    c.polarRotateSpeed = s.polarRotateSpeed;
    void c.setLookAt(s.pos.x, s.pos.y, s.pos.z, s.target.x, s.target.y, s.target.z, true);
  }
  function walkStep(forwardM: number, sideM: number, upM: number, turnRad: number) {
    const c = controlsRef.current;
    if (!c) return;
    if (forwardM) void c.forward(forwardM, true);
    if (sideM) void c.truck(sideM, 0, true);
    if (upM) void c.elevate(upM, true);
    if (turnRad) void c.rotate(turnRad, 0, true);
  }
  function toggleFullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
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
    const PACE = e.shiftKey ? 0.25 : 0.8; // metres per key press while walking
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const map: Record<string, () => void> = walk
      ? {
          // first person: keys move the body, the mouse turns the head
          w: () => walkStep(PACE, 0, 0, 0),
          ArrowUp: () => walkStep(PACE, 0, 0, 0),
          s: () => walkStep(-PACE, 0, 0, 0),
          ArrowDown: () => walkStep(-PACE, 0, 0, 0),
          a: () => walkStep(0, -PACE, 0, 0),
          d: () => walkStep(0, PACE, 0, 0),
          ArrowLeft: () => walkStep(0, 0, 0, -STEP),
          ArrowRight: () => walkStep(0, 0, 0, STEP),
          q: () => walkStep(0, 0, -PACE / 2, 0),
          e: () => walkStep(0, 0, PACE / 2, 0),
        }
      : {
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
          '4': () => goView('back'),
          '5': () => goView('left'),
          '6': () => goView('right'),
          w: () => enterWalk(),
        };
    // inspect keys work in both modes
    map.f = focusPick;
    map.i = () => {
      if (pick) setIsolate((v) => !v);
    };
    map.m = () => setMeasure((v) => (v === 'distance' ? 'off' : 'distance'));
    map['?'] = () => setShowKeys((v) => !v);
    map['/'] = map['?'];
    map.h = map['?'];
    // Undo / redo, as in the 2D editor. Only a TEXT field may keep these keys:
    // after a click on a card or panel BUTTON that button holds focus, and
    // treating it as "in a control" made Cmd+Z do nothing right after the one
    // click a user most wants to take back (a racking option, a remove).
    const inTextField = !!t.closest?.('input,select,textarea,[contenteditable="true"],[role="slider"]');
    if ((e.metaKey || e.ctrlKey) && key === 'z' && !inTextField) {
      e.preventDefault();
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' });
      return;
    }
    // Delete removes the selected modules, else the picked thing
    if ((e.key === 'Delete' || e.key === 'Backspace') && !inTextField && structInteractive) {
      e.preventDefault();
      if (selectedSet.size > 0 && !wiring) {
        runOp(panelsDelete, { ids: [...selectedSet] });
        onSelectPanels?.([], false);
        setPick(null);
        return;
      }
      if (!pick) return;
      const done = (() => {
        switch (pick.kind) {
          case 'table':
            return runOp(segmentDelete, { segmentId: pick.id }).ok;
          case 'obstruction':
            return runOp(obstructionRemove, { id: pick.id }).ok;
          case 'inverter':
            return runOp(inverterRemove, { id: pick.id }).ok;
          case 'battery':
            return runOp(batteryRemove, { id: pick.id }).ok;
          case 'box':
            return runOp(boxRemove, { id: pick.id }).ok;
          case 'string':
            return runOp(stringRemove, { id: pick.id }).ok;
          default:
            showNotice('That cannot be deleted — a roof is drawn in Step 2, a run is re-routed from its card');
            return false;
        }
      })();
      if (done) setPick(null);
      return;
    }
    const fn = inControl ? undefined : map[key];
    if (fn) {
      e.preventDefault();
      fn();
      return;
    }
    // Escape peels one layer at a time: a tool mode stops first (measure,
    // place, the key sheet), then walking, then isolation, then an open card
    // (its own listener does that); only a bare scene leaves the 3D view
    if (e.key === 'Escape' && (measure !== 'off' || placeKind || showKeys || boxSelect)) {
      e.preventDefault();
      setMeasure('off');
      setPlaceKind(null);
      setShowKeys(false);
      setBoxSelect(false);
      return;
    }
    if (e.key === 'Escape' && walk) {
      e.preventDefault();
      exitWalk();
      return;
    }
    if (e.key === 'Escape' && isolate) {
      e.preventDefault();
      setIsolate(false);
      return;
    }
    if (e.key === 'Escape' && onClose && !structEdit && !pick && !wiring) {
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

  // ── the Halo menu's contents ──────────────────────────────────────────────
  // These four groups were four separate vertical rails, one per corner of the
  // scene. Every condition below is the condition that used to hide a button
  // or a whole rail; a group with no items left is dropped by the menu, so the
  // heatmap still collapses the controls down to the heatmap toggle itself.
  const haloGroups: RadialGroup[] = useMemo(() => {
    const scene: RadialItem[] = [
      {
        id: 'heatmap',
        icon: <Grid3x3 />,
        label: 'Heat',
        tip: 'Solar access heatmap\nSun-hours on the roof, by month',
        active: heatmap,
        accent: true,
        onClick: () => setHeatmap((v) => !v),
      },
    ];
    if (!heatmap) {
      if (designStage) {
        scene.push(
          {
            id: 'access',
            icon: <SunMedium />,
            label: 'Shade',
            tip: 'Solar access view\nPer-panel shading %',
            active: solarAccessView,
            accent: true,
            onClick: () => setSolarAccessView((v) => !v),
          },
          {
            id: 'labels',
            icon: <Hash />,
            label: 'Figures',
            tip: 'Write each module’s sun figure on it',
            active: showLabels,
            onClick: () => setShowLabels((v) => !v),
          },
          {
            id: 'report',
            icon: <BarChart3 />,
            label: 'Report',
            tip: 'Energy report',
            oneShot: true,
            onClick: () => setShowReport(true),
          },
        );
      }
      scene.push({
        id: 'view-mode',
        icon: meshMode ? <Map /> : <Box />,
        label: meshMode ? 'Map' : 'Mesh',
        tip: meshMode ? 'Switch to map view' : 'Switch to mesh view\nIsolated studio render',
        active: meshMode,
        onClick: () => setViewMode((v) => (v === 'mesh' ? 'map' : 'mesh')),
      });
      if (!meshMode) {
        scene.push({
          id: 'surround',
          icon: <Building2 />,
          label: 'Around',
          tip: showBuildings
            ? 'Hide the real surroundings — they stop shading the design too'
            : 'Show the real surroundings — they shade the design again',
          active: !showBuildings,
          onClick: () => runOp(surroundSetIgnored, { ignore: showBuildings }),
        });
      }
      scene.push({
        id: 'sun-path',
        icon: <Route />,
        label: 'Sun',
        tip: showSunPath ? 'Hide sun path' : 'Show sun path',
        active: !showSunPath,
        onClick: () => setShowSunPath((v) => !v),
      });
      if (designStage) {
        scene.push({
          id: 'electrical',
          icon: <Link2 />,
          label: 'Cables',
          tip: showElectrical ? 'Hide strings and cables' : 'Show strings and cables',
          active: !showElectrical,
          onClick: () => setShowElectrical((v) => !v),
        });
        // Starting a NEW hand-made string had no way in at all: the only route
        // was to pick an existing string and choose "Wire by hand", so a fresh
        // one could never be built in the 3D. This is that way in.
        if (!readOnly && project.panels.some((p) => p.enabled)) {
          scene.push({
            id: 'wire',
            icon: <Cable />,
            label: 'Wire',
            tip: 'Wire a string by hand\nPick the inverter, then click modules',
            active: wiring !== null,
            onClick: () => setWiring((v) => (v === null ? [] : null)),
          });
        }
      }
    }
    if (!readOnly && !heatmap) {
      scene.push({
        id: 'share',
        icon: copied ? <Check /> : <Share2 />,
        label: copied ? 'Copied' : 'Share',
        tip: copied ? 'Link copied' : 'Copy customer share link',
        onClick: () => {
          const url = `${location.origin}/share/${project.shareId}`;
          navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          });
        },
      });
      // The model a C&I client's architect asks for once the design is agreed.
      // GLTFExporter already ships inside `three`; nothing exposed it.
      scene.push({
        id: 'glb',
        icon: <Download />,
        label: glbBusy ? 'Saving…' : 'Export 3D',
        tip: 'Save the design as a .glb model\nThe streamed surroundings are NOT included — they are Google’s data',
        onClick: () => {
          const s = sceneRef.current;
          if (!s || glbBusy) return;
          setGlbBusy(true);
          exportSceneGlb(s, glbFilename(project.info.name))
            .catch(() => undefined)
            .finally(() => setGlbBusy(false));
        },
      });
    }

    const views: RadialItem[] = heatmap
      ? []
      : (
          [
            { id: 'top', icon: <ArrowDown />, label: 'Top', tip: 'Top view' },
            { id: 'iso', icon: <Axis3d />, label: 'Iso', tip: 'Isometric view' },
            { id: 'front', icon: <Orbit />, label: 'Front', tip: 'Front view' },
            { id: 'back', icon: <ChevronsUp />, label: 'Back', tip: 'Back view' },
            { id: 'left', icon: <ChevronsLeft />, label: 'Left', tip: 'Left view' },
            { id: 'right', icon: <ChevronsRight />, label: 'Right', tip: 'Right view' },
          ] as const
        ).map((v) => ({ ...v, oneShot: true, onClick: () => goView(v.id as ViewPreset) }));

    const inspect: RadialItem[] = heatmap
      ? []
      : [
          // the touch way into a multi-module selection; Shift is the other one
          ...(structInteractive
            ? [
                {
                  id: 'box-select',
                  icon: <BoxSelect />,
                  label: 'Select',
                  tip: boxSelect
                    ? 'Stop selecting (Esc) — one finger orbits again'
                    : 'Select modules — drag a box, tap to add\nSame as holding Shift on a keyboard',
                  active: boxSelect,
                  onClick: () => setBoxSelect((v) => !v),
                } satisfies RadialItem,
              ]
            : []),
          {
            id: 'fly',
            icon: <Crosshair />,
            label: 'Fly',
            tip: pick ? 'Fly to the selection (F)' : 'Select something, then fly to it (F)',
            disabled: !pick,
            oneShot: true,
            onClick: focusPick,
          },
          {
            id: 'isolate',
            icon: <Focus />,
            label: 'Isolate',
            tip: isolate && pick
              ? 'Show everything again (I)'
              : pick
                ? 'Isolate the selection (I)'
                : 'Select something, then isolate it (I)',
            active: isolate && !!pick,
            disabled: !pick,
            onClick: () => setIsolate((v) => !v),
          },
          {
            id: 'walk',
            icon: <Footprints />,
            label: 'Walk',
            tip: walk ? 'Leave the walkthrough (Esc)' : 'Walk the site (W)',
            active: walk,
            onClick: () => (walk ? exitWalk() : enterWalk()),
          },
          {
            id: 'fullscreen',
            icon: fullscreen ? <Minimize2 /> : <Maximize2 />,
            label: 'Full',
            tip: fullscreen ? 'Leave full screen' : 'Full screen',
            active: fullscreen,
            onClick: toggleFullscreen,
          },
        ];

    const measureItems: RadialItem[] =
      heatmap || meshMode
        ? []
        : [
            ...(
              [
                { id: 'distance', icon: <Ruler />, label: 'Dist', on: 'Measure a distance (M)' },
                { id: 'angle', icon: <Triangle />, label: 'Angle', on: 'Measure an angle: arm, corner, arm' },
                { id: 'area', icon: <Shapes />, label: 'Area', on: 'Measure an area: click the corners' },
                {
                  id: 'elevation',
                  icon: <MoveVertical />,
                  label: 'Height',
                  on: 'Read a height above ground and deck',
                },
              ] as const
            ).map((m) => ({
              id: m.id,
              icon: m.icon,
              label: m.label,
              tip: measure === m.id ? 'Stop measuring (Esc)' : m.on,
              active: measure === m.id,
              onClick: () => setMeasure((v) => (v === m.id ? 'off' : (m.id as MeasureMode))),
            })),
            ...(measureCount > 0
              ? [
                  {
                    id: 'clear',
                    icon: <Eraser />,
                    label: 'Clear',
                    tip: `Clear ${measureCount} measurement${measureCount === 1 ? '' : 's'}`,
                    oneShot: true,
                    onClick: () => setMeasureClear((n) => n + 1),
                  } satisfies RadialItem,
                ]
              : []),
            {
              id: 'keys',
              icon: <Keyboard />,
              label: 'Keys',
              tip: 'Keyboard shortcuts (?)',
              active: showKeys,
              onClick: () => setShowKeys((v) => !v),
            },
          ];

    return [
      { id: 'scene', label: 'Scene', icon: <Layers />, items: scene },
      { id: 'view', label: 'View', icon: <Axis3d />, items: views },
      { id: 'inspect', label: 'Inspect', icon: <Eye />, items: inspect },
      { id: 'measure', label: 'Measure', icon: <Ruler />, items: measureItems },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    heatmap,
    designStage,
    solarAccessView,
    meshMode,
    showBuildings,
    showSunPath,
    showElectrical,
    showLabels,
    wiring,
    project.panels,
    readOnly,
    structInteractive,
    boxSelect,
    copied,
    project.shareId,
    pick,
    isolate,
    walk,
    fullscreen,
    measure,
    measureCount,
    showKeys,
  ]);

  return (
    <div
      ref={wrapRef}
      // Phase 22p: a tab stop on the scene itself. Without one the 3D view was
      // unreachable by keyboard — you could open it and then not move it.
      tabIndex={0}
      role="application"
      aria-label="3D scene. Arrow keys orbit, Shift for finer steps, plus and minus zoom, 1 top view, 2 isometric, 3 front, Shift-drag box-selects modules — or turn on Select mode in the menu and drag, for a touch screen. Escape closes."
      onKeyDown={onSceneKeyDown}
      onPointerDownCapture={structInteractive ? onWrapPointerDownCapture : undefined}
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
        <PickOrder wiring={wiring !== null} />
        <DevSceneHandle sceneRef={sceneRef} />
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
          showLabels={showLabels}
          labelLayer={labelLayer}
          onLabelsVisible={setLabelsVisible}
          showBuildings={showBuildings}
          showSunPath={showSunPath}
          isolate={isolate && pick ? pick : null}
          onPickFocus={(f) => {
            pickFocusRef.current = f;
          }}
          measure={measure}
          measureClear={measureClear}
          onMeasureCount={setMeasureCount}
          placeKind={structInteractive ? placeKind : null}
          onPlaced={() => setPlaceKind(null)}
          onPlaceKind={structInteractive ? setPlaceKind : null}
          marqueeCommit={marqueeCommit}
          date={date}
          meshMode={meshMode}
          focusRoofId={focusRoofId}
          heatmap={heatmap}
          heatResult={heatResult}
          heatMonth={heatMonth}
          bounds={bounds}
          shadowFit={shadowFit}
          boxSelect={structInteractive && boxSelect}
          selectedIds={wiringSet ?? selectedSet}
          onSelectPanels={onSelectPanels}
          showElectrical={showElectrical}
          wiring={structInteractive ? wiring : null}
          wireTarget={wireTarget}
          onWiringChange={setWiring}
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
          ref={attachControls}
          makeDefault
          minDistance={MIN_ORBIT_M}
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

      {/* the per-module figures live in ONE plain DOM node over the canvas —
          see three/PanelLabels for why it is not an <Html> each */}
      <div
        ref={labelLayer}
        aria-hidden
        style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}
      />

      {/* ── leaving the scene is not a tool, so it keeps its own button ── */}
      {onClose && (
        <div className="tool-rail dark" style={{ left: 14, top: 14 }}>
          <button className="tool-btn" data-tip="Back to 2D editor" data-tip-right="" aria-label="Back to 2D editor" onClick={onClose}>
            <X />
          </button>
        </div>
      )}

      {/* ── every scene tool, in one radial menu (see components/RadialMenu) ── */}
      <RadialMenu groups={haloGroups} ariaLabel="Scene tools" style={{ left: 64, top: '50%' }} />

      {/* ── box select rectangle (Shift-drag) ── */}
      {marquee &&
        wrapRef.current &&
        (() => {
          const r = wrapRef.current.getBoundingClientRect();
          const left = Math.min(marquee.x0, marquee.x1) - r.left;
          const top = Math.min(marquee.y0, marquee.y1) - r.top;
          return (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left,
                top,
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
                border: '1px solid var(--accent, #c9a24a)',
                background: 'rgba(201,162,74,0.14)',
                pointerEvents: 'none',
                zIndex: 25,
              }}
            />
          );
        })()}

      {/* ── walkthrough hint ── */}
      {walk && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 140,
            transform: 'translateX(-50%)',
            background: 'rgba(20,24,30,0.88)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--editor-line)',
            borderRadius: 999,
            color: 'var(--editor-ink)',
            padding: '6px 14px',
            fontSize: 12,
            zIndex: 30,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          Walking · W A S D move · Q E climb · drag to look · Shift = small steps · Esc leaves
        </div>
      )}

      {/* ── mode hints and refusals ── */}
      {(measure !== 'off' || placeKind || notice || boxSelect) && !walk && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 140,
            transform: 'translateX(-50%)',
            background: notice ? 'rgba(120,32,32,0.92)' : 'rgba(20,24,30,0.88)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--editor-line)',
            borderRadius: 999,
            color: 'var(--editor-ink)',
            padding: '6px 14px',
            fontSize: 12,
            zIndex: 30,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {notice
            ? notice
            : placeKind
              ? `Tap a wall to hang the ${PLACE_NAME[placeKind]}, or the roof deck to stand it there · Esc cancels`
              : measure === 'off'
                ? 'Selecting modules · drag a box · tap a module to add or drop it · Esc stops'
                : measure === 'distance'
                  ? 'Distance · click two points on the model · Esc stops'
                  : measure === 'angle'
                    ? 'Angle · click an arm, the corner, the other arm · Esc stops'
                    : measure === 'area'
                      ? 'Area · click the corners, then the first corner again (or double-click) · Esc stops'
                      : 'Elevation · click a point to read its height · Esc stops'}
        </div>
      )}

      {/* ── keyboard sheet ── */}
      {showKeys && (
        <div
          role="dialog"
          aria-label="Keyboard shortcuts"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(20,24,30,0.94)',
            backdropFilter: 'blur(12px)',
            border: '1px solid var(--editor-line)',
            borderRadius: 12,
            color: 'var(--editor-ink)',
            padding: '14px 18px',
            fontSize: 12,
            lineHeight: 1.7,
            zIndex: 40,
            minWidth: 300,
            fontFamily: 'var(--mono)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Keys · Esc closes</div>
          <div>1 2 3 4 5 6 — top · iso · front · back · left · right</div>
          <div>arrows · + − — orbit · zoom</div>
          <div>click · shift-click — select a module · add to the selection</div>
          <div>shift-drag — box-select modules (or Select mode, with no keyboard)</div>
          <div>table edge handles — drag out to add rows or columns, in to remove them</div>
          <div>F — fly to the selection · I — isolate it · W — walk the site</div>
          <div>M — measure a distance · ? — this sheet</div>
          <div>Delete — remove the selected modules or the picked thing</div>
          <div>⌘/Ctrl Z · ⇧⌘ Z — undo · redo</div>
          <div>Shift while dragging a handle — snap (0.1 m · 5° · 15°)</div>
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
        aria-label={`Sun position: azimuth ${azDeg} degrees, altitude ${Math.max(0, altDeg)} degrees. Click for the sun chart.`}
        role="button"
        tabIndex={0}
        title="Sun chart: the year's sun paths over this site's own skyline"
        onClick={() => setShowSunChart((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setShowSunChart((v) => !v);
          }
        }}
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
          {simDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {fmtHour(clockHour(hour, loc.latLng.lng, loc.latLng.lat, simDate))}{' '}
          {clockLabel(loc.latLng, simDate)}
        </div>
        <div style={{ fontSize: 9, color: 'var(--editor-ink-2)', marginTop: 3, fontFamily: 'var(--mono)' }}>
          {Math.abs(loc.latLng.lat).toFixed(4)}°{loc.latLng.lat >= 0 ? 'N' : 'S'} {Math.abs(loc.latLng.lng).toFixed(4)}°
          {loc.latLng.lng >= 0 ? 'E' : 'W'}
        </div>
        <div style={{ fontSize: 9, color: 'var(--editor-ink-2)', marginTop: 1 }}>
          {project.surround
            ? `≈ ${Math.round(project.surround.gradeM)} m above sea level`
            : project.surround === null
              ? 'elevation: no aerial data for this site'
              : 'elevation: reading the surroundings…'}
        </div>
        <div style={{ fontSize: 9, color: '#f5b942', marginTop: 4, opacity: 0.9 }}>{showSunChart ? 'close sun chart' : 'sun chart ▸'}</div>
      </div>
      )}

      {/* ── sun chart: the year's sun paths over the site's own skyline ── */}
      {showSunChart && !meshMode && !heatmap && (
        <SunChart project={project} date={simDate} hour={hour} onClose={() => setShowSunChart(false)} />
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

      {/* ── provenance of the neighbour shade in the numbers (DESIGN-SYSTEM §12) ── */}
      {project.surround && !meshMode && !heatmap && (
        <div
          style={{
            position: 'absolute',
            right: 64, // clear of the Measure rail
            bottom: 124,
            zIndex: 12,
            fontSize: 9.5,
            lineHeight: 1.3,
            color: project.ignoreSurround ? '#f5c16c' : 'rgba(255,255,255,0.78)',
            background: 'rgba(10,13,18,0.55)',
            padding: '2px 7px',
            borderRadius: 4,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {project.ignoreSurround
            ? 'Neighbour shade: OFF by your choice — the real surroundings are hidden'
            : `Neighbour shade: Google aerial height map ${project.surround.imageryDate} · ${project.surround.stepM.toFixed(1)} m grid`}
        </div>
      )}
      {/* no aerial height map here: say so, or a reader assumes the neighbours are in the numbers */}
      {project.surround === null && !meshMode && !heatmap && (
        <div
          style={{
            position: 'absolute',
            right: 64,
            bottom: 124,
            zIndex: 12,
            fontSize: 9.5,
            lineHeight: 1.3,
            color: '#f5c16c',
            background: 'rgba(10,13,18,0.55)',
            padding: '2px 7px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
          }}
        >
          Neighbour shade: no aerial height map for this site · only the neighbours you draw shade the design
        </div>
      )}

      {/* Figures are on, but the camera is too far out for a module to carry a
          readable number. Saying so beats a toggle that appears to do nothing. */}
      {showLabels && !labelsVisible && !heatmap && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 140,
            transform: 'translateX(-50%)',
            background: 'rgba(20,24,30,0.88)',
            backdropFilter: 'blur(10px)',
            border: '1px solid var(--editor-line)',
            borderRadius: 999,
            color: 'var(--editor-ink)',
            padding: '6px 14px',
            fontSize: 12,
            zIndex: 30,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          Zoom in to read the module figures
        </div>
      )}

      {/* ── the Inverter Bay ──
          A CHOICE while a string is being wired. Otherwise the readout: how
          the DC has landed across the inverters. It only appears when there is
          more than one, because a single inverter has no balance to look at —
          the string card already says everything about it. It rides the Cables
          toggle, so hiding the electrics hides this too. */}
      {(wiring || (showElectrical && project.components.inverterCount > 1 && !readOnly && !captureMode)) &&
        !heatmap &&
        project.components.inverter &&
        project.components.panel && (
        <InverterBay
          spec={project.components.inverter}
          live={wiring !== null}
          target={wireTarget}
          onTarget={setWireTarget}
          inverters={bayInverters(
            project.strings,
            project.components.inverter,
            project.components.inverterCount,
            project.components.panel.watt,
            project.inverterPlacements.length,
          )}
        />
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
          {/* the bar and the modules read the ONE scale in lib/shade-ramp — this
              gradient used to promise a smooth ramp the modules never drew */}
          <div
            style={{
              width: 120,
              height: 8,
              borderRadius: 999,
              background: ACCESS_GRADIENT_CSS,
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
          <span style={{ fontSize: 11, color: 'var(--editor-ink-2)', flex: 'none' }}>
            {fmtHour(clockHour(5, loc.latLng.lng, loc.latLng.lat, simDate)).replace(':', ':')}
          </span>
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
          <span style={{ fontSize: 11, color: 'var(--editor-ink-2)', flex: 'none' }}>
            {fmtHour(clockHour(19, loc.latLng.lng, loc.latLng.lat, simDate))}
          </span>
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
          <b style={{ color: '#f5b942', fontVariantNumeric: 'tabular-nums' }} title={`solar time ${fmtHour(hour)}`}>
            {fmtHour(clockHour(hour, loc.latLng.lng, loc.latLng.lat, simDate))} {clockLabel(loc.latLng, simDate)}
          </b>
          <span style={{ color: 'var(--editor-ink-2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Sunrise size={13} /> {fmtHour(clockHour(sunrise, loc.latLng.lng, loc.latLng.lat, simDate))}
          </span>
          <span style={{ color: 'var(--editor-ink-2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Sunset size={13} /> {fmtHour(clockHour(sunset, loc.latLng.lng, loc.latLng.lat, simDate))}
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
  showLabels,
  labelLayer,
  onLabelsVisible,
  showBuildings,
  showSunPath,
  isolate,
  onPickFocus,
  measure,
  measureClear,
  onMeasureCount,
  placeKind,
  onPlaced,
  onPlaceKind,
  marqueeCommit,
  date,
  meshMode,
  focusRoofId,
  heatmap,
  heatResult,
  heatMonth,
  bounds,
  shadowFit,
  boxSelect,
  selectedIds,
  onSelectPanels,
  pick,
  hoverPick,
  onPick,
  onHoverPick,
  runOp,
  onSurroundAttribution,
  showElectrical,
  wiring,
  wireTarget,
  onWiringChange,
}: {
  project: Project;
  bounds: SceneBounds;
  /** the same box grown to hold the obstructions that shade the design */
  shadowFit: SceneBounds;
  /** Select mode is on: a tap ADDS to the selection, as Shift-click does */
  boxSelect: boolean;
  selectedIds: ReadonlySet<string>;
  onSelectPanels?: (ids: string[], additive: boolean) => void;
  pick: ScenePick | null;
  hoverPick: ScenePick | null;
  onPick: (p: ScenePick | null) => void;
  onHoverPick: (p: ScenePick | null) => void;
  runOp: RunOp;
  onSurroundAttribution?: (text: string) => void;
  showElectrical: boolean;
  wiring: string[] | null;
  /** the inverter the Bay says the next hand-made string belongs on */
  wireTarget: number | null;
  onWiringChange: (ids: string[] | null) => void;
  sunAltitude: number;
  sunAzimuth: number;
  solarAccessView: boolean;
  /** write each module's sun figure on it */
  showLabels: boolean;
  /** the DOM node over the canvas those figures are written into */
  labelLayer: React.RefObject<HTMLDivElement | null>;
  /** whether any figure is currently readable — drives the "zoom in" hint */
  onLabelsVisible: (any: boolean) => void;
  showBuildings: boolean;
  showSunPath: boolean;
  /** show only this entity (and the roofs) — object isolation */
  isolate: ScenePick | null;
  /** where the F key should fly: a sphere around the picked entity */
  onPickFocus: (f: FocusSphere | null) => void;
  measure: MeasureMode;
  measureClear: number;
  onMeasureCount: (n: number) => void;
  /** a wall click hangs this instead of picking the roof */
  placeKind: PlaceKind | null;
  onPlaced: () => void;
  /** the roof card asks to start placing (null = read-only scene) */
  onPlaceKind: ((k: PlaceKind) => void) | null;
  /** a released box drag (Shift, or Select mode), in client px */
  marqueeCommit: MarqueeCommit | null;
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
  /**
   * The sun dome: ONE centre and ONE radius, shared by the arcs and the sun
   * marker. They used to be written out separately and drifted apart — the
   * arcs at the design's top, the marker at ground level — which put the sun
   * below its own path by the height of the building.
   *
   * The dome is the SITE'S OWN SKY, so it is centred on the ground the site
   * stands on and its horizon ring lies in that ground. It used to be centred
   * on the design's TOP instead, to stop a tall building swallowing the path —
   * but that floats the whole sky: measured on the 77 m tower, every arc
   * bottomed out at 81 m with the ground at 0, so sunrise and sunset hung in
   * mid-air and the path belonged to nothing.
   *
   * Height is bought with RADIUS, not by lifting the centre. The dome is grown
   * until it encloses the design, so the midday arc passes over the building
   * with room to spare. Near sunrise and sunset it drops behind the building
   * instead — which is exactly right, and is the whole point of a sun path: a
   * low sun really is blocked by what stands in front of it.
   */
  const sunDomeCentre = useMemo(
    () => new THREE.Vector3(bounds.cx, bounds.yMin, bounds.cz),
    [bounds],
  );
  const SUN_DOME_R = Math.max(
    R * 0.75,
    Math.hypot(bounds.r, bounds.yMax - bounds.yMin) * 1.25,
  );

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
    return allStructures.filter(
      (s) => keep.has(s.segmentId) && (!isolate || (isolate.kind === 'table' && isolate.id === s.segmentId)),
    );
  }, [allStructures, selectedSegId, view, isolate]);
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
      // wiring by hand: a click puts the module into the string, or takes it out
      if (wiring) {
        // Shift takes the WHOLE table (lib/electrical/wire-table)
        if (additive) {
          const next = wireTableToggle(project.panels, panelId, wiring);
          if (next) {
            onWiringChange(next);
            return;
          }
        }
        onWiringChange(wiring.includes(panelId) ? wiring.filter((id) => id !== panelId) : [...wiring, panelId]);
        return;
      }
      // Select mode is the touch equivalent of holding Shift: without it a
      // phone could hold exactly one module selected. It deliberately does NOT
      // reach the wiring branch above — there Shift means "take the whole
      // table", and a mode that silently swallowed forty modules per tap is a
      // different thing entirely.
      const add = additive || boxSelect;
      onSelectPanels?.([panelId], add);
      if (add) return;
      // In shading view the question being asked is about THIS module — what it
      // makes and what is taking the rest — so the click opens the module card
      // rather than its table's. Everywhere else a module still stands for its
      // table, which is what you are editing when you are laying modules out.
      if (solarAccessView) {
        onPick({ kind: 'panel', id: panelId });
        return;
      }
      const pp = project.panels.find((x) => x.id === panelId);
      onPick(pp?.segmentId ? { kind: 'table', id: pp.segmentId } : null);
    },
    [project.panels, onPick, onSelectPanels, wiring, onWiringChange, solarAccessView, boxSelect],
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
  // ground-level things re-read the photomesh height whenever more tiles land
  useTerrainGeneration();
  // cards that quote shade costs re-render when the full analysis lands
  useShadeProfileVersion();
  // the aerial height map, for the roof card's measured height and raised objects
  const surroundGrid = useSurroundGrid(project.surround);
  // object isolation: only the picked entity (and the roofs) stay drawn
  const isoOk = (kind: ScenePick['kind'], id: string) => !isolate || (isolate.kind === kind && isolate.id === id);
  // isolating a table keeps its modules; a string keeps its own modules; a
  // cable run keeps the array it crosses; anything else hides the array
  const isoPanel = (p: { id: string; segmentId?: string | null }) => {
    if (!isolate) return true;
    if (isolate.kind === 'table') return p.segmentId === isolate.id;
    if (isolate.kind === 'string') return !!project.strings.find((s) => s.id === isolate.id)?.panelIds.includes(p.id);
    return isolate.kind === 'route';
  };
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
  //
  // A TRACKER is the one exception, because its modules genuinely move with the
  // hour and an array drawn flat while the timeline runs would be a lie. So the
  // sun enters the dependencies ONLY when a tracker is in the design, rounded
  // to half a degree so a slider drag does not thrash the instanced meshes.
  // Every other project keeps exactly the old cost.
  const hasTracker = useMemo(
    () => project.segments.some((s) => s.racking.kind === 'tracker_hsat'),
    [project.segments],
  );
  // `sunAzimuth` is already the SCENE frame (true north + the imagery's
  // calibration offset) — the same basis the shading engine's samples use
  const trackerSun = hasTracker
    ? {
        altitudeDeg: Math.round(((sunAltitude * 180) / Math.PI) * 2) / 2,
        azimuthDeg: Math.round(((((((sunAzimuth * 180) / Math.PI) % 360) + 360) % 360) * 2)) / 2,
      }
    : undefined;
  const panelParts = useMemo(
    () =>
      spec
        ? partitionPanels(
            project.panels
              .filter((p) => p.enabled && inScope(p.roofId) && isoPanel(p))
              .map((p) => {
                const roof = project.roofs.find((r) => r.id === p.roofId);
                // ONE pose source for the mesh, the analytical shadow slab and the
                // shading engine's rays (§A0) — they cannot drift apart
                const pose = panelPose(project, p, spec, roof, surfAt(p.roofId, p.center), trackerSun);
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
    [project, spec, selectedSegId, view, focusRoof, eaveRefs, isolate, trackerSun?.altitudeDeg, trackerSun?.azimuthDeg],
  );
  // Object focus: a sphere around whatever is picked, reported up for the F
  // key / Focus button. View-only; computed from the same poses the scene draws.
  useEffect(() => {
    if (!pick) {
      onPickFocus(null);
      return;
    }
    const all = [...panelParts.normal, ...panelParts.ghost];
    const sphereOf = (pts: [number, number, number][], pad: number): FocusSphere | null => {
      if (!pts.length) return null;
      const c = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
      const r = Math.max(...pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])));
      return { x: c[0], y: c[1], z: c[2], r: r + pad };
    };
    const wallPoint = (u: { roofId: string; edgeIndex: number; t: number; heightM: number }): FocusSphere | null => {
      const roof = project.roofs.find((r) => r.id === u.roofId);
      if (!roof) return null;
      const a = roof.polygon[u.edgeIndex % roof.polygon.length];
      const b = roof.polygon[(u.edgeIndex + 1) % roof.polygon.length];
      return { x: a.x + (b.x - a.x) * u.t, y: u.heightM, z: -(a.y + (b.y - a.y) * u.t), r: 2 };
    };
    let f: FocusSphere | null = null;
    switch (pick.kind) {
      case 'table':
        f = sphereOf(all.filter((p) => p.segmentId === pick.id).map((p) => p.position), 1.5);
        break;
      case 'string': {
        const ids = new Set(project.strings.find((s) => s.id === pick.id)?.panelIds ?? []);
        f = sphereOf(all.filter((p) => ids.has(p.id)).map((p) => p.position), 1.5);
        break;
      }
      case 'obstruction': {
        const o = project.obstructions.find((x) => x.id === pick.id);
        if (o) {
          const size = o.shape === 'circle' ? o.diameterM : Math.max(o.lengthM, o.widthM);
          const base = surfAt(o.roofId, o.center);
          f = { x: o.center.x, y: base + o.heightM / 2, z: -o.center.y, r: Math.max(size, o.heightM) / 2 + 1 };
        }
        break;
      }
      case 'inverter': {
        const u = project.inverterPlacements.find((x) => x.id === pick.id);
        if (u) f = wallPoint(u);
        break;
      }
      case 'battery': {
        const u = (project.batteryPlacements ?? []).find((x) => x.id === pick.id);
        if (u) f = wallPoint(u);
        break;
      }
      case 'box': {
        const u = (project.electricalBoxes ?? []).find((x) => x.id === pick.id);
        if (u) f = wallPoint(u);
        break;
      }
      case 'route': {
        const r = (project.cableRoutes ?? []).find((x) => x.id === pick.id);
        const roofId = project.inverterPlacements[0]?.roofId ?? project.roofs[0]?.id ?? null;
        if (r && r.waypoints.length)
          f = sphereOf(
            r.waypoints.map((w) => [w.x, surfAt(roofId, w) + 0.3, -w.y] as [number, number, number]),
            2,
          );
        break;
      }
      case 'roof': {
        const roof = project.roofs.find((x) => x.id === pick.id);
        if (roof) {
          const b = designBounds(project, [roof]);
          f = { x: b.cx, y: b.cy, z: b.cz, r: b.r };
        }
        break;
      }
    }
    onPickFocus(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pick, panelParts, project]);
  // module id → glass centre, for the string runs drawn on top of the modules
  // (globalThis.Map: the lucide `Map` icon shadows the global in this file)
  // what the label layer needs, and nothing else — rebuilt only when the poses
  // or the access figures change, never on a camera move
  const panelLabelItems = useMemo(
    () =>
      showLabels
        ? panelParts.normal.map((p) => ({
            id: p.id,
            position: p.position,
            access: p.access,
            lift: 0.1 + Math.sin(p.tiltRad) * (p.d / 2),
            w: p.w,
          }))
        : [],
    [panelParts, showLabels],
  );

  const panelPositions = useMemo(() => {
    const m = new globalThis.Map<string, { position: [number, number, number]; lift: number }>();
    for (const p of [...panelParts.normal, ...panelParts.ghost]) {
      // a tilted module's high edge rises above its centre — the string run
      // must clear it or it disappears into the glass
      m.set(p.id, { position: p.position, lift: 0.1 + Math.sin(p.tiltRad) * (p.d / 2) });
    }
    return m;
  }, [panelParts]);
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

  // A zoom-20 tile spans only ~70 m — barely wider than the building — so with
  // the streamed surroundings hidden the map used to collapse to one small
  // square in a black field. A wider (coarser) picture underneath covers the
  // whole ground plane; the sharp tile above still carries the detail on site.
  const wideZoom = zoomCovering(loc.latLng.lat, GROUND_PLANE_M);
  const wideSpanM =
    metersPerStaticMap(loc.latLng.lat, wideZoom, 640) * project.calibration.scaleFactor;
  const wideTexUrl = staticSatelliteUrl(loc.latLng.lat, loc.latLng.lng, wideZoom, 640, 2);
  const wideGroundTex = useMemo(() => {
    const t = new THREE.TextureLoader().load(wideTexUrl);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [wideTexUrl]);
  useEffect(() => () => wideGroundTex.dispose(), [wideGroundTex]);

  // the far picture: keeps the middle distance PHOTOGRAPHIC out to where the
  // haze takes over, so the horizon is land fading into sky rather than the
  // imagery stopping and a blank plate carrying on
  const farZoom = zoomCovering(loc.latLng.lat, FAR_GROUND_M);
  const farSpanM =
    metersPerStaticMap(loc.latLng.lat, farZoom, 640) * project.calibration.scaleFactor;
  const farTexUrl = staticSatelliteUrl(loc.latLng.lat, loc.latLng.lng, farZoom, 640, 2);
  const farGroundTex = useMemo(() => {
    const t = new THREE.TextureLoader().load(farTexUrl);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [farTexUrl]);
  useEffect(() => () => farGroundTex.dispose(), [farGroundTex]);
  // GPU texture memory is never reclaimed implicitly — release the previous
  // satellite tile when the URL changes and on unmount
  useEffect(() => () => groundTex.dispose(), [groundTex]);

  // The same photo on the deck as on the ground — the real roof under the
  // modules, with its skylights, stains and kit. A roof wider than the ground
  // tile gets a wider (coarser) tile so the picture never runs out under it.
  const roofReach = useMemo(
    () => Math.max(0, ...project.roofs.flatMap((r) => r.polygon.map((p) => Math.hypot(p.x, p.y)))),
    [project.roofs],
  );
  const roofZoom =
    [SAT_ZOOM, SAT_ZOOM - 1, SAT_ZOOM - 2].find(
      (z) => (metersPerStaticMap(loc.latLng.lat, z, 640) * project.calibration.scaleFactor) / 2 >= roofReach + 4,
    ) ?? SAT_ZOOM - 2;
  const roofSpanM = metersPerStaticMap(loc.latLng.lat, roofZoom, 640) * project.calibration.scaleFactor;
  const roofTexUrl =
    roofZoom === SAT_ZOOM ? null : staticSatelliteUrl(loc.latLng.lat, loc.latLng.lng, roofZoom, 640, 2);
  const roofTexOwn = useMemo(() => {
    if (!roofTexUrl) return null;
    const t = new THREE.TextureLoader().load(roofTexUrl);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [roofTexUrl]);
  useEffect(() => () => roofTexOwn?.dispose(), [roofTexOwn]);
  const roofPhoto = useMemo(
    () => ({ tex: roofTexOwn ?? groundTex, spanM: roofSpanM }),
    [roofTexOwn, groundTex, roofSpanM],
  );

  const sunVisible = sunAltitude > 0;
  const duskFactor = Math.min(1, Math.max(0, sunAltitude / 0.25));

  // the sun light aims at the design's centre and its shadow frustum wraps the
  // design's footprint — a 300 m site keeps its shadows, a 20 m house gets a
  // sharp map instead of 60 m of wasted texels
  const lightTarget = useMemo(() => new THREE.Object3D(), []);
  /**
   * The sun light and its target share ONE anchor, so the light's direction is
   * exactly the sun's.
   *
   * They used to disagree: the light was placed at `sunDir × D` from a point
   * lifted to `bounds.yMax`, while the target sat at ground level. Adding a
   * vertical offset to one end and not the other TILTS the beam. Measured on
   * the 77 m tower with the sun at 54°: the light shone from 67.7°, so the
   * drawn shadow was 32 m long where 56 m is right — 43% short, and worse the
   * taller the building. On a flat site yMax is ~0 and nothing shows, which is
   * why this only ever appeared on the big one.
   *
   * The shading ENGINE is unaffected — it casts its own rays from
   * `sunPosition()` (lib/shading) and never reads this light. The energy
   * numbers were right; the picture was not.
   */
  const lightAnchor = useMemo(
    () => new THREE.Vector3(bounds.cx, bounds.cy, bounds.cz),
    [bounds],
  );
  lightTarget.position.copy(lightAnchor);
  /**
   * The shadow frustum must hold the design AND the shadow it throws. A tall
   * building's shadow reaches `height / tan(altitude)` beyond its own footprint
   * — 56 m for this 77 m tower with the sun at 54°, and further as the sun
   * drops — so a box sized to the footprint alone cut the shadow off partway
   * across the ground.
   *
   * The allowance is 1.5 × the design's height, which holds the whole shadow
   * down to a sun altitude of about 34°. Lower than that it clips again, and
   * that is a deliberate trade: the 4096 map has to cover whatever this box
   * spans, so buying the last few degrees costs sharpness everywhere else.
   *
   * It is sized on `shadowFit`, not `bounds`: the CASTERS include the
   * obstructions — the neighbouring block, the tree over the parapet — and a
   * caster outside the frustum draws no shadow at all while the engine goes on
   * charging the customer for its shade. Same centre, so the light target does
   * not move; a distant tall neighbour does widen the box and therefore
   * coarsens every shadow in the scene, which is the honest cost of drawing
   * the shade the quote already assumes.
   */
  const shadowHalf = Math.max(20, shadowFit.r * 1.2 + (shadowFit.yMax - shadowFit.yMin) * 1.5);
  const sunPos = useMemo(
    () => sunDir.clone().multiplyScalar(Math.max(80, shadowFit.r * 3 + shadowFit.yMax)).add(lightAnchor),
    [sunDir, shadowFit, lightAnchor],
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
            /* night: the sun is below the horizon, so the sky is stars */
            <Stars radius={400} depth={80} count={2400} factor={5} saturation={0} fade speed={0} />
          )}
          {/* Real haze at site scale is faint: the old 0.0035 washed a whole
              framed design grey once the camera stood 100 m back. It carries
              the far ground into the sky's own colour, which is what makes a
              horizon instead of an edge. */}
          <Atmosphere
            color={sunVisible ? '#b9c7d8' : '#0a0f1c'}
            density={0.0006}
            background={sunVisible ? null : '#0a0f1c'}
          />

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
          {/* The three ground pictures are STACKED, and how far apart they sit
              is load-bearing. They used to be a CENTIMETRE apart with the
              surround off (−0.02 / −0.01 / 0): at any normal viewing distance
              the depth buffer cannot separate two surfaces that close — at
              160 m it resolves about 5 mm, at 600 m about 8 cm — so the
              near-black base plane fought through the aerial photo and painted
              the map with black patches and stripes (owner, 2026-09-03). They
              are half a metre apart now, whether the surround is on or off. */}
          {/* The backstop, running past sight under everything else. It used to
              be 300 m — narrower than the 560 m photo above it — so where the
              photo ended there was nothing at all. It is never really SEEN now:
              by the distance it shows past the far photo the haze owns it. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, showBuildings ? -2.2 : -2.2, 0]} receiveShadow>
            <planeGeometry args={[HORIZON_PLANE_M, HORIZON_PLANE_M]} />
            <meshStandardMaterial
              color={sunVisible ? '#6f7378' : '#0d1219'}
              roughness={1}
              envMapIntensity={0.2}
            />
          </mesh>
          {/* the far picture — the middle distance stays LAND, not a blank
              plate, all the way out to where the haze takes over */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, showBuildings ? -1.5 : -1.5, 0]} receiveShadow>
            <planeGeometry args={[farSpanM, farSpanM]} />
            <meshStandardMaterial map={farGroundTex} color="#767676" roughness={1} envMapIntensity={0.15} />
          </mesh>
          {/* the wide, coarse picture: the neighbourhood is still a map when
              the streamed surroundings are off */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, showBuildings ? -1.0 : -GROUND_STACK_M, 0]} receiveShadow>
            <planeGeometry args={[wideSpanM, wideSpanM]} />
            <meshStandardMaterial map={wideGroundTex} color="#767676" roughness={1} envMapIntensity={0.15} />
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
              if (placeKind) {
                // hang the unit on the wall edge nearest the click
                const lx = e.point.x - originShift[0];
                const ly = -(e.point.z - originShift[2]);
                let best: { edgeIndex: number; t: number; d: number } | null = null;
                for (let i = 0; i < r.polygon.length; i++) {
                  const a = r.polygon[i];
                  const b = r.polygon[(i + 1) % r.polygon.length];
                  const vx = b.x - a.x;
                  const vy = b.y - a.y;
                  const t = Math.max(0.02, Math.min(0.98, ((lx - a.x) * vx + (ly - a.y) * vy) / (vx * vx + vy * vy || 1)));
                  const d = Math.hypot(a.x + vx * t - lx, a.y + vy * t - ly);
                  if (!best || d < best.d) best = { edgeIndex: i, t, d };
                }
                if (best) {
                  // near the edge → on that wall; further onto the deck → free-standing on a stand
                  const onWall = best.d < 1.5;
                  const at = {
                    roofId: r.id,
                    edgeIndex: best.edgeIndex,
                    t: best.t,
                    ...(onWall ? {} : { pos: { x: lx, y: ly }, level: 'roof' as const }),
                  };
                  const res =
                    placeKind === 'inverter'
                      ? runOp(inverterPlace, { ...at, heightM: 1.5 })
                      : placeKind === 'battery'
                        ? runOp(batteryPlace, { ...at, heightM: 0 })
                        : runOp(boxPlace, { ...at, kind: placeKind, heightM: 1.2 });
                  if (res.ok) onPlaced();
                }
                return;
              }
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
              photo={meshMode ? null : roofPhoto}
              outline={picked ? PICK_COLOR : hovered ? HOVER_COLOR : undefined}
            />
            {picked && (
              <EntityLabel
                position={[c.x, r.heightM + 1.2, -c.y]}
                title={r.name}
                lines={[
                  `${Math.round(polygonArea(r.polygon))} m² · ${fmtLen(r.heightM, 1)} eave · ${HEIGHT_SOURCE_NAME[r.heightSource ?? 'unknown']}`,
                  `${r.pitchDeg > 0 ? `${r.pitchDeg}° pitch facing ${Math.round(r.slopeAzimuthDeg)}°` : 'flat'} · ${r.roofType.replace('_', ' ')} · ${OUTLINE_SOURCE_NAME[r.provenance?.source ?? 'manual']}`,
                  `${project.panels.filter((p) => p.roofId === r.id && p.enabled).length} modules`,
                  // what Google's height map reads over this polygon (only while the card is open)
                  ...(() => {
                    const read = roofReadings(project)[r.id];
                    return read === undefined
                      ? []
                      : [
                          `aerial height map reads ≈ ${fmtLen(read, 1)}` +
                            (Math.abs(read - r.heightM) > ROOF_HEIGHT_TOLERANCE_M ? ' — check the eave height' : ''),
                        ];
                  })(),
                ]}
                onClose={() => onPick(null)}
                // on-object placement: choose here, then tap the wall it goes on
                actions={
                  onPlaceKind && !meshMode
                    ? [
                        // what the aerial height map says this roof is — one tap to take it
                        ...(() => {
                          const g = surroundGrid;
                          const fit = g ? roofMapFit(g, r, project.calibration.northOffsetDeg) : null;
                          if (!g || !fit) return [];
                          const acts: { label: string; onClick: () => void }[] = [];
                          if (Math.abs(fit.heightM - r.heightM) > ROOF_HEIGHT_TOLERANCE_M) {
                            acts.push({
                              label: `Use map height (${fmtLen(fit.heightM, 1)}${fit.pitchDeg ? `, ${fit.pitchDeg}°` : ''})`,
                              onClick: () => runOp(roofApplyMapFit, { roofId: r.id }),
                            });
                          }
                          const raised = raisedObjectsNotDrawn(roofRaisedObjects(g, r, fit), project.obstructions);
                          if (raised.length > 0) {
                            acts.push({
                              label: `Add ${raised.length} raised object${raised.length === 1 ? '' : 's'} from map`,
                              onClick: () => runOp(obstructionsAddFromMap, { roofId: r.id }),
                            });
                          }
                          return acts;
                        })(),
                        {
                          label: 'Hang inverter',
                          onClick: () => {
                            onPlaceKind('inverter');
                            onPick(null);
                          },
                        },
                        ...(project.components.battery
                          ? [
                              {
                                label: 'Stand battery',
                                onClick: () => {
                                  onPlaceKind('battery');
                                  onPick(null);
                                },
                              },
                            ]
                          : []),
                        {
                          label: 'Hang DCDB',
                          onClick: () => {
                            onPlaceKind('dcdb');
                            onPick(null);
                          },
                        },
                        {
                          label: 'Hang ACDB',
                          onClick: () => {
                            onPlaceKind('acdb');
                            onPick(null);
                          },
                        },
                      ]
                    : []
                }
              />
            )}
          </group>
        );
      })}

      {/* obstructions — pickable: hover halo, click → label with quick actions */}
      {project.obstructions.filter((o) => inScope(o.roofId) && isoOk('obstruction', o.id)).map((o) => {
        // Resolved from the obstruction's POSITION, not from `o.roofId` alone.
        // A stored anchor can be stale — it used to be captured at placement
        // and left behind by every drag — and `surfaceHeightAt` extrapolates
        // its plane without bound, so a stale anchor silently returned the old
        // roof's plane at the new spot instead of failing. That is what left
        // turbine vents hanging over a pitched roof. `obstructionBaseY` still
        // honours an explicit `roofId: null` as "stands on grade".
        const groundBase = obstructionBaseY(o, project.roofs, eaveRefs);
        // on grade: stand on the photomesh where it actually is (visual only)
        const baseY = groundBase === 0 ? groundLiftAt(o.center.x, -o.center.y) : groundBase;
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
            {picked && !meshMode && <ObstructionGizmo project={project} id={o.id} planeY={baseY} runOp={runOp} />}
            {picked && (
              <EntityLabel
                position={[o.center.x, baseY + o.heightM + 0.7, -o.center.y]}
                title={`${o.label} · ${OBSTRUCTION_NAME[o.type]}`}
                lines={[
                  dims,
                  `${casts ? 'Casts shadow' : 'No shadow'} · ${o.blocksPlacement ? 'blocks modules' : 'modules may span it'} · ${o.provenance?.source ?? 'manual'}`,
                  // before/after in one line: what the plant makes with it, and without it
                  ...(() => {
                    if (!casts) return [];
                    const cost = casterCost(project, `obstruction:${o.id}`);
                    if (!cost) return ['shade cost: run the analysis to see it'];
                    return [
                      cost.modules === 0
                        ? 'shades no module — costs nothing'
                        : `shades ${cost.modules} module${cost.modules === 1 ? '' : 's'} · costs ≈ ${cost.kwhPerYear.toLocaleString('en-IN')} kWh/yr (${cost.pct}%) — remove it and the plant gains that`,
                    ];
                  })(),
                ]}
                onClose={() => onPick(null)}
                actions={[
                  { label: 'Rotate 90°', onClick: () => runOp(obstructionRotate, { id: o.id, deltaDeg: 90 }) },
                  { label: 'Duplicate', onClick: () => runOp(obstructionDuplicate, { id: o.id }) },
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
            spec={spec}
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
              spec={spec}
            />
          )}
        </>
      )}

      {/* the sun figure on each module (three/PanelLabels) */}
      <PanelLabels
        layer={labelLayer}
        enabled={showLabels}
        items={panelLabelItems}
        onAnyVisible={onLabelsVisible}
      />

      {/* module card — what THIS module makes, and what is taking the rest.
          Anchored on the module itself: the numbers used to be buried three
          clicks deep inside the racking editor, which is a card about rafters. */}
      {pick?.kind === 'panel' && <PanelCard project={project} panelId={pick.id} positions={panelPositions} onClose={() => onPick(null)} onFocusBlocker={onFocusBlocker} />}

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
                // grow the table in place; the kernel refuses when the roof has no room
                { label: '+ row', onClick: () => runOp(layoutGrow, { segmentId: seg.id, axis: 'row', side: 'bottom', count: 1 }) },
                { label: '+ column', onClick: () => runOp(layoutGrow, { segmentId: seg.id, axis: 'column', side: 'right', count: 1 }) },
                { label: 'Duplicate', onClick: () => runOp(segmentDuplicate, { segmentId: seg.id }) },
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

      {/* strings + cable runs on the model, the string card, the wiring readout */}
      {!meshMode && showElectrical && (!isolate || isolate.kind === 'string' || isolate.kind === 'route') && (
        <ElectricalOverlay
          project={project}
          spec={spec}
          panelPositions={panelPositions}
          pick={pick}
          hoverPick={hoverPick}
          onPick={onPick}
          onHoverPick={onHoverPick}
          runOp={runOp}
          wiring={wiring}
          wireTarget={wireTarget}
          onWiringChange={onWiringChange}
          isolate={isolate}
        />
      )}

      {/* box select: the released rectangle picks every module centre inside it */}
      {/* box select: the released rectangle takes every module centre inside it.
          While a string is being wired those modules join the STRING instead of
          the selection — sweeping a box over a block is the fastest way to take
          forty modules, and selecting them mid-wiring would mean nothing. */}
      <MarqueeSelect
        commit={marqueeCommit}
        positions={panelPositions}
        onSelect={(ids) => {
          if (wiring) {
            const have = new Set(wiring);
            const add = ids.filter((id) => !have.has(id));
            if (add.length) onWiringChange([...wiring, ...add]);
            return;
          }
          onSelectPanels?.(ids, true);
        }}
      />

      {/* measurements: distance / angle / area / elevation on the real geometry */}
      <Measure
        mode={measure}
        clearSignal={measureClear}
        onCount={onMeasureCount}
        deckHeightAt={(p) => {
          for (const r of project.roofs) {
            const poly = r.polygon;
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
              const a = poly[i];
              const b = poly[j];
              if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
            }
            if (inside) return surfAt(r.id, p);
          }
          return null;
        }}
      />

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
      {!meshMode && pick && (pick.kind === 'inverter' || pick.kind === 'battery' || pick.kind === 'box') && (
        <WallGizmo project={project} kind={pick.kind} id={pick.id} runOp={runOp} />
      )}

      {/* walkways */}
      {project.walkways.filter((w) => inScope(w.roofId)).map((w) => {
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
        const cx = (r.a.x + r.b.x) / 2;
        const cy = (r.a.y + r.b.y) / 2;
        const h = surfAt(r.roofId, { x: cx, y: cy });
        const len = Math.hypot(r.b.x - r.a.x, r.b.y - r.a.y);
        const ang = Math.atan2(-(r.b.y - r.a.y), r.b.x - r.a.x);
        const railH = r.heightMm / 1000;
        const posts = Math.max(2, Math.round(len / 1.5) + 1);
        return (
          // scene = engine: these three now cast in lib/scene-model too, so the
          // shadow you can see and the loss in the energy figure are the same
          // object. They used to cast in NEITHER.
          <group key={r.id} position={[cx, h, -cy]} rotation={[0, -ang, 0]}>
            <mesh position={[0, railH, 0]} castShadow userData={{ shadowCaster: true }}>
              <boxGeometry args={[len, 0.05, 0.05]} />
              <meshStandardMaterial color="#c23b3b" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh position={[0, railH * 0.55, 0]} castShadow userData={{ shadowCaster: true }}>
              <boxGeometry args={[len, 0.035, 0.035]} />
              <meshStandardMaterial color="#c23b3b" metalness={0.5} roughness={0.5} />
            </mesh>
            {Array.from({ length: posts }, (_, i) => (
              <mesh
                key={i}
                position={[-len / 2 + (i * len) / (posts - 1), railH / 2, 0]}
                castShadow
                userData={{ shadowCaster: true }}
              >
                <cylinderGeometry args={[0.025, 0.025, railH, 8]} />
                <meshStandardMaterial color="#a8a8a8" metalness={0.7} roughness={0.4} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* lightning arresters */}
      {project.arresters.filter((la) => inScope(la.roofId)).map((la) => {
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
      {project.inverterPlacements.filter((ip) => inScope(ip.roofId) && isoOk('inverter', ip.id)).map((ip, idx) => {
        const roof = project.roofs.find((r) => r.id === ip.roofId);
        if (!roof) return null;
        const a = roof.polygon[ip.edgeIndex];
        const b = roof.polygon[(ip.edgeIndex + 1) % roof.polygon.length];
        const free = !!ip.pos;
        const px = free ? ip.pos!.x : a.x + (b.x - a.x) * ip.t;
        const py = free ? ip.pos!.y : a.y + (b.y - a.y) * ip.t;
        const wallAng = free ? 0 : Math.atan2(-(b.y - a.y), b.x - a.x);
        const picked = pick?.kind === 'inverter' && pick.id === ip.id;
        const hovered = !picked && hoverPick?.kind === 'inverter' && hoverPick.id === ip.id;
        const inv = project.components.inverter;
        // hangs on the OUTSIDE face of the wall, not straddling the wall line;
        // a free-standing unit sits on a stand on the deck or at ground level
        const out = free ? { x: 0, y: 0 } : wallOutward(roof, ip.edgeIndex);
        const baseY = unitBaseY(project, ip) + (free && ip.level === 'ground' ? groundLiftAt(px, -py) : 0);
        return (
          <group
            key={ip.id}
            position={[px + out.x * 0.12, baseY + ip.heightM, -(py + out.y * 0.12)]}
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
            {free && <UnitStand width={0.5} height={ip.heightM} />}
            {free && ip.level === 'ground' && <PlantPad width={1.6} depth={1.2} baseOffset={-ip.heightM} />}
            {(picked || hovered) && <PickHalo center={[0, 0, 0]} size={[0.68, 0.86, 0.4]} picked={picked} />}
            {picked && (
              <EntityLabel
                position={[0, 0.75, 0]}
                title={`Inverter ${idx + 1}`}
                lines={[
                  inv ? `${inv.brand} ${inv.model} · ${inv.acKw} kW` : 'No inverter selected',
                  `${unitWhere(ip)} · ${fmtLen(ip.heightM, 1)} up · its strings route here`,
                ]}
                onClose={() => onPick(null)}
                actions={[
                  // the AC run is a thin line on the ground — reach it from here
                  ...(idx === 0 && (project.cableRoutes ?? []).some((r) => r.id === 'ac/main')
                    ? [{ label: 'AC run', onClick: () => onPick({ kind: 'route' as const, id: 'ac/main' }) }]
                    : []),
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
            {/* the tag is the click target: a half-metre box is hard to hit from any distance */}
            <Html center distanceFactor={30}>
              <div
                role="button"
                title="Select this inverter"
                onClick={(e) => {
                  e.stopPropagation();
                  onPick({ kind: 'inverter', id: ip.id });
                }}
                style={{
                  fontSize: 10,
                  background: 'rgba(20,24,30,0.85)',
                  color: '#f2f4f6',
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
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
      {(project.batteryPlacements ?? []).filter((bp) => inScope(bp.roofId) && isoOk('battery', bp.id)).map((bp, idx) => {
        const roof = project.roofs.find((r) => r.id === bp.roofId);
        const spec = project.components.battery;
        if (!roof || !spec) return null;
        const a = roof.polygon[bp.edgeIndex];
        const b = roof.polygon[(bp.edgeIndex + 1) % roof.polygon.length];
        const free = !!bp.pos;
        const px = free ? bp.pos!.x : a.x + (b.x - a.x) * bp.t;
        const py = free ? bp.pos!.y : a.y + (b.y - a.y) * bp.t;
        const wallAng = free ? 0 : Math.atan2(-(b.y - a.y), b.x - a.x);
        const w = spec.widthMm / 1000;
        const d = spec.depthMm / 1000;
        const h = spec.heightMm / 1000;
        const picked = pick?.kind === 'battery' && pick.id === bp.id;
        const hovered = !picked && hoverPick?.kind === 'battery' && hoverPick.id === bp.id;
        const coupling = project.components.batteryCoupling ?? 'dc_hybrid';
        // stands against the OUTSIDE face of the wall, or free on the deck / the ground
        const out = free ? { x: 0, y: 0 } : wallOutward(roof, bp.edgeIndex);
        const off = d / 2 + 0.03;
        const baseY = unitBaseY(project, bp) + (free && bp.level === 'ground' ? groundLiftAt(px, -py) : 0);
        return (
          <group
            key={bp.id}
            position={[px + out.x * off, baseY + bp.heightM + h / 2, -(py + out.y * off)]}
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
            {free && bp.level === 'ground' && <PlantPad width={w + 0.8} depth={d + 0.8} baseOffset={-h / 2} />}
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
                role="button"
                title="Select this battery"
                onClick={(e) => {
                  e.stopPropagation();
                  onPick({ kind: 'battery', id: bp.id });
                }}
                style={{
                  fontSize: 10,
                  background: 'rgba(20,24,30,0.85)',
                  color: '#f2f4f6',
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
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
      {/* DCDB / ACDB enclosures — wall-mounted, pickable, slide along the wall */}
      {(project.electricalBoxes ?? []).filter((bx) => inScope(bx.roofId) && isoOk('box', bx.id)).map((bx) => {
        const roof = project.roofs.find((r) => r.id === bx.roofId);
        if (!roof) return null;
        const a = roof.polygon[bx.edgeIndex];
        const b = roof.polygon[(bx.edgeIndex + 1) % roof.polygon.length];
        const free = !!bx.pos;
        const px = free ? bx.pos!.x : a.x + (b.x - a.x) * bx.t;
        const py = free ? bx.pos!.y : a.y + (b.y - a.y) * bx.t;
        const wallAng = free ? 0 : Math.atan2(-(b.y - a.y), b.x - a.x);
        const out = free ? { x: 0, y: 0 } : wallOutward(roof, bx.edgeIndex);
        const baseY = unitBaseY(project, bx) + (free && bx.level === 'ground' ? groundLiftAt(px, -py) : 0);
        const picked = pick?.kind === 'box' && pick.id === bx.id;
        const hovered = !picked && hoverPick?.kind === 'box' && hoverPick.id === bx.id;
        const dc = bx.kind === 'dcdb';
        const w = dc ? 0.4 : 0.5;
        const h = dc ? 0.5 : 0.6;
        return (
          <group
            key={bx.id}
            position={[px + out.x * 0.12, baseY + bx.heightM, -(py + out.y * 0.12)]}
            rotation={[0, -wallAng, 0]}
            onClick={(e) => {
              if (e.delta > 4) return;
              e.stopPropagation();
              onPick({ kind: 'box', id: bx.id });
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              onHoverPick({ kind: 'box', id: bx.id });
            }}
            onPointerOut={() => onHoverPick(null)}
          >
            {(picked || hovered) && <PickHalo center={[0, 0, 0]} size={[w + 0.2, h + 0.2, 0.42]} picked={picked} />}
            {picked && (
              <EntityLabel
                position={[0, h / 2 + 0.55, 0]}
                title={dc ? 'DCDB' : 'ACDB'}
                lines={[
                  dc
                    ? 'String fuses, DC SPD, DC isolator — its inverter’s home runs land here'
                    : 'MCCB, AC SPD, isolator — the AC runs pass through here',
                  `${unitWhere(bx)} · ${fmtLen(bx.heightM, 1)} up`,
                ]}
                onClose={() => onPick(null)}
                actions={[
                  {
                    label: 'Remove',
                    danger: true,
                    onClick: () => {
                      runOp(boxRemove, { id: bx.id });
                      onPick(null);
                    },
                  },
                ]}
              />
            )}
            <mesh castShadow userData={{ shadowCaster: false }}>
              <boxGeometry args={[w, h, 0.22]} />
              <meshStandardMaterial color="#8e959d" roughness={0.5} metalness={0.4} />
            </mesh>
            {free && <UnitStand width={w} height={bx.heightM} />}
            {free && bx.level === 'ground' && <PlantPad width={1.2} depth={1.0} baseOffset={-bx.heightM} />}
            <mesh position={[0, 0, 0.114]}>
              <boxGeometry args={[w * 0.9, h * 0.9, 0.01]} />
              <meshStandardMaterial color="#b8bfc7" roughness={0.45} metalness={0.35} />
            </mesh>
            <Html center distanceFactor={30} position={[0, h / 2 + 0.16, 0]}>
              <div
                role="button"
                title={dc ? 'Select the DCDB' : 'Select the ACDB'}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick({ kind: 'box', id: bx.id });
                }}
                style={{
                  fontSize: 10,
                  background: 'rgba(20,24,30,0.85)',
                  color: '#f2f4f6',
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                }}
              >
                {dc ? 'DCDB' : 'ACDB'}
              </div>
            </Html>
          </group>
        );
      })}

      {!meshMode && showBuildings && !isolate && (
        <>
          <RealSurround project={project} onAttribution={onSurroundAttribution} />
          {/* the tiles are flat where Google has no 3D buildings (all of India):
              the neighbours' real heights come from the same height map the
              shade engine casts against */}
          {project.surround && !project.ignoreSurround && <SurroundRelief project={project} />}
        </>
      )}

      {!meshMode && showSunPath && (
        // centred on the DESIGN, not the scene origin: a building 25 m from
        // the origin had its sun arc drawn 25 m beside it — and at the design's
        // TOP, so a 75 m tower does not swallow its own sun path
        <group position={sunDomeCentre.toArray()}>
          {/* the year's envelope: solstices and the equinox, faint, so a
              glance shows how far the sun swings between seasons */}
          {seasonDates(date.getFullYear()).map((s) => (
            <SunPath
              key={s.label}
              lat={loc.latLng.lat}
              lng={loc.latLng.lng}
              date={s.date}
              radius={SUN_DOME_R}
              northOffsetDeg={project.calibration.northOffsetDeg}
              faint
              label={s.label}
            />
          ))}
          <SunPath
            lat={loc.latLng.lat}
            lng={loc.latLng.lng}
            date={date}
            radius={SUN_DOME_R}
            northOffsetDeg={project.calibration.northOffsetDeg}
          />
        </group>
      )}
      {/* The sun rides the SAME dome as its arcs — one centre, one radius. It
          used to be placed on a dome centred at y = 0 while the arcs sat at
          the design's top, so on this 77 m tower the marker was drawn 77 m
          below its own path: measured at y = 69.3 where the dome puts it at
          148, which reads as the sun sitting beside the building and below the
          horizon while the badge says Alt 54°. Whoever lifted the arcs for
          tall buildings did not lift the sun with them. */}
      {!meshMode && sunVisible && (
        <mesh position={sunDir.clone().multiplyScalar(SUN_DOME_R).add(sunDomeCentre)}>
          <sphereGeometry args={[2.1, 20, 20]} />
          <meshBasicMaterial color="#fff0c0" />
        </mesh>
      )}
      </group>
    </group>
  );
}

/**
 * The satellite photo on the deck, projected from above by WORLD position
 * (so any roof — flat, pitched, a mumty — shows what the aerial picture shows
 * there), with flat concrete on the walls. The photo is an exposed picture,
 * not an albedo, so it is scaled like the ground plane's.
 */
function roofPhotoMaterial(tex: THREE.Texture, spanM: number): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    color: '#ffffff',
    roughness: 0.95,
    metalness: 0,
    envMapIntensity: 0.3,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPhotoSpan = { value: spanM };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPhotoSpan;\nvarying vec2 vPhotoUv;\nvarying float vUpness;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvec4 photoWp = modelMatrix * vec4( transformed, 1.0 );\nvPhotoUv = vec2( 0.5 + photoWp.x / uPhotoSpan, 0.5 - photoWp.z / uPhotoSpan );\nvUpness = normal.y;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vPhotoUv;\nvarying float vUpness;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 photo = texture2D( map, vPhotoUv ) * vec4( 0.46, 0.46, 0.46, 1.0 );
  float deck = smoothstep( 0.4, 0.8, vUpness );
  diffuseColor *= mix( vec4( 0.66, 0.64, 0.60, 1.0 ), photo, deck );
#endif`,
      );
  };
  return mat;
}

function RoofMesh({
  roof,
  allRoofs,
  eaveProj,
  photoreal,
  photo,
  outline,
}: {
  roof: Project['roofs'][number];
  allRoofs: Project['roofs'];
  eaveProj?: number;
  photoreal: boolean;
  /** the aerial photo for the deck (null = the covering material) */
  photo?: { tex: THREE.Texture; spanM: number } | null;
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
  // the real covering — concrete, coated sheet or clay tile — drawn at true
  // size on the deck's plan-metre UVs (three/roof-textures)
  const surface = photoreal ? getRoofSurface(roof.roofType) : null;
  // the real roof: the aerial photo on the deck, concrete on the walls
  const photoMat = useMemo(
    () => (photoreal && photo ? roofPhotoMaterial(photo.tex, photo.spanM) : null),
    [photoreal, photo],
  );
  useEffect(() => () => photoMat?.dispose(), [photoMat]);

  return (
    <group>
      <mesh geometry={geom} material={photoMat ?? undefined} castShadow receiveShadow userData={{ shadowCaster: true }}>
        {photoMat ? null : surface ? (
          <meshStandardMaterial
            color={surface.color}
            map={surface.map}
            normalMap={surface.normalMap ?? undefined}
            normalScale={new THREE.Vector2(surface.normalScale, surface.normalScale)}
            roughness={surface.roughness}
            metalness={surface.metalness}
            envMapIntensity={surface.metalness > 0.3 ? 0.9 : 0.45}
            side={THREE.DoubleSide}
          />
        ) : (
          <meshStandardMaterial
            color={surfaceColor}
            roughness={0.9}
            envMapIntensity={0.55}
            side={THREE.DoubleSide}
          />
        )}
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
  faint = false,
  label,
}: {
  lat: number;
  lng: number;
  date: Date;
  radius: number;
  northOffsetDeg?: number;
  /** a season's arc: thin, no hour marks, one label at its top */
  faint?: boolean;
  label?: string;
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
  if (faint) {
    const top = points.reduce((a, p) => (p.y > a.y ? p : a), points[0]);
    return (
      <group>
        <Line
          points={points}
          color="#d4a017"
          lineWidth={1}
          transparent
          opacity={0.45}
          dashed
          dashSize={0.8}
          gapSize={0.8}
          // an overlay: the sun's path is never hidden behind a tower or a tree
          depthTest={false}
          renderOrder={20}
        />
        {label && (
          <Html position={[top.x, top.y + 1.5, top.z]} center zIndexRange={[10, 0]}>
            <span
              style={{
                fontSize: 9.5,
                color: '#d4a017',
                background: 'rgba(0,0,0,0.45)',
                borderRadius: 4,
                padding: '1px 5px',
                fontFamily: 'var(--mono)',
                pointerEvents: 'none',
                userSelect: 'none',
                whiteSpace: 'nowrap',
                opacity: 0.85,
              }}
            >
              {label}
            </span>
          </Html>
        )}
      </group>
    );
  }
  return (
    <group>
      <Line
        points={points}
        color="#d4a017"
        lineWidth={1.6}
        dashed
        dashSize={1.2}
        gapSize={0.6}
        depthTest={false}
        renderOrder={20}
      />
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
