// ─── On-object gizmos: move / rotate / tilt a table, slide a wall unit ──────
// Direct manipulation through the ops kernel (spec §7 / Phase 3). Every drag
// is a PREVIEW of one op — the ghost shows where the design will land and the
// readout says what it costs — and the release RUNS that same op, so the 3D
// view can never put the model somewhere the 2D editor would refuse.
//
// Handles are real DOM buttons (drei <Html>): 44 px touch targets, pointer
// capture for the drag, and the canvas never sees the gesture — so the camera
// controls cannot fight the gizmo. The pointer is unprojected onto the plane
// the object lives on (its roof height), which is what makes the drag feel
// like the pointer is holding the object.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Html, useCursor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Move, RotateCw, ArrowUpDown, PlugZap, BatteryCharging, Box, Rows3, Columns3 } from 'lucide-react';
import { layoutGrow, layoutShrink } from '../lib/ops/layout-ops';
import { segmentGrid, type GrowAxis, type GrowSide } from '../lib/segment-ops';
import { rotate } from '../lib/geo';
import type { ArraySegment, PanelSpec, Project, Roof, XY } from '../types';
import type { DesignOp } from '../lib/ops/types';
import { previewOp, type OpPreview } from '../lib/ops/run';
import { summarizeImpact } from '../lib/ops/metrics';
import { panelsNudge, segmentSetAzimuth, segmentSetTilt } from '../lib/ops/layout-ops';
import { inverterMove } from '../lib/ops/electrical-ops';
import { batteryMove } from '../lib/ops/battery-ops';
import { boxMove } from '../lib/ops/box-ops';
import { obstructionMove, obstructionRotate } from '../lib/ops/site-ops';
import { wallOutward } from '../lib/battery';
import { pointSegDist } from '../lib/geo';
import { PanelsInstanced, type PanelInstance } from './PanelsInstanced';

type RunOp = <A>(op: DesignOp<A>, args: A) => OpPreview;

/**
 * Obstruction gizmo: a move handle (drag it across the roof) and a rotate
 * handle (drag it around the centre; Shift snaps to 15°). Every drag previews
 * obstruction.move / obstruction.rotate and runs it on release, like the
 * table gizmo — the kernel decides, the handle only asks.
 */
export function ObstructionGizmo({
  project,
  id,
  planeY,
  runOp,
}: {
  project: Project;
  id: string;
  /** the roof surface under the obstruction — the drag plane */
  planeY: number;
  runOp: RunOp;
}) {
  const toPlane = usePlanePointer();
  const [drag, setDrag] = useState<{ kind: 'move' | 'rotate'; grabAng: number; startDeg: number; pos: XY } | null>(null);
  const [preview, setPreview] = useState<OpPreview | null>(null);
  const o = project.obstructions.find((x) => x.id === id);
  if (!o) return null;
  const size = o.shape === 'circle' ? o.diameterM : Math.max(o.lengthM, o.widthM);
  const top = planeY + o.heightM;
  const angleAt = (p: XY) => Math.atan2(p.y - o.center.y, p.x - o.center.x);

  const startMove = (e: React.PointerEvent) => {
    const p = toPlane(e, planeY);
    if (!p) return;
    setDrag({ kind: 'move', grabAng: 0, startDeg: o.rotationDeg, pos: p });
    setPreview(previewOp(project, obstructionMove, { id, center: o.center }));
  };
  const startRotate = (e: React.PointerEvent) => {
    const p = toPlane(e, planeY);
    if (!p) return;
    setDrag({ kind: 'rotate', grabAng: angleAt(p), startDeg: o.rotationDeg, pos: p });
    setPreview(previewOp(project, obstructionRotate, { id, deltaDeg: 0 }));
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toPlane(e, planeY);
    if (!p) return;
    if (drag.kind === 'move') {
      // the grab point rides with the pointer; the obstruction keeps its offset
      const center = { x: o.center.x + (p.x - drag.pos.x), y: o.center.y + (p.y - drag.pos.y) };
      const snapped = e.shiftKey ? { x: Math.round(center.x * 10) / 10, y: Math.round(center.y * 10) / 10 } : center;
      setPreview(previewOp(project, obstructionMove, { id, center: snapped }));
    } else {
      let delta = ((angleAt(p) - drag.grabAng) * 180) / Math.PI;
      if (e.shiftKey) delta = Math.round(delta / 15) * 15;
      setPreview(previewOp(project, obstructionRotate, { id, deltaDeg: Math.round(delta) }));
    }
  };
  const end = (_e: React.PointerEvent, cancelled: boolean) => {
    const pv = preview;
    const d = drag;
    setDrag(null);
    setPreview(null);
    if (cancelled || !pv || !pv.ok || !d) return;
    const next = pv.next.obstructions.find((x) => x.id === id);
    if (!next) return;
    if (d.kind === 'move') {
      if (next.center.x !== o.center.x || next.center.y !== o.center.y) runOp(obstructionMove, { id, center: next.center });
    } else {
      const delta = next.rotationDeg - o.rotationDeg;
      if (delta) runOp(obstructionRotate, { id, deltaDeg: delta });
    }
  };

  // ghost: the previewed footprint
  const ghost = preview?.ok ? preview.next.obstructions.find((x) => x.id === id) : null;
  const gx = ghost ? ghost.center.x : o.center.x;
  const gy = ghost ? ghost.center.y : o.center.y;
  const gr = ghost ? ghost.rotationDeg : o.rotationDeg;

  return (
    <group>
      {ghost && (
        <mesh position={[gx, planeY + o.heightM / 2, -gy]} rotation={[0, (-gr * Math.PI) / 180, 0]}>
          {o.shape === 'circle' ? (
            <cylinderGeometry args={[o.diameterM / 2, o.diameterM / 2, o.heightM, 24]} />
          ) : (
            <boxGeometry args={[o.lengthM, o.heightM, o.widthM]} />
          )}
          <meshBasicMaterial color="#ffc766" transparent opacity={0.35} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <Handle
        position={[o.center.x, top + 0.5, -o.center.y]}
        title="Drag to move the obstruction (Shift snaps to 0.1 m)"
        active={drag?.kind === 'move'}
        onStart={startMove}
        onMove={move}
        onEnd={end}
      >
        <Move size={20} aria-hidden />
      </Handle>
      <Handle
        position={[o.center.x + size / 2 + 0.9, top + 0.5, -o.center.y]}
        title="Drag to turn the obstruction (Shift snaps to 15°)"
        active={drag?.kind === 'rotate'}
        onStart={startRotate}
        onMove={move}
        onEnd={end}
      >
        <RotateCw size={20} aria-hidden />
      </Handle>
      {drag && preview && (
        <Readout position={[gx + size / 2 + 0.6, top + 0.6, -gy]} preview={preview} />
      )}
    </group>
  );
}

/** plan point (x east, y north-ish) from a pointer event, on the plane y = planeY */
export function usePlanePointer() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const ray = useRef(new THREE.Raycaster());
  const hit = useRef(new THREE.Vector3());
  return (e: { clientX: number; clientY: number }, planeY: number): XY | null => {
    const r = gl.domElement.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.current.setFromCamera(new THREE.Vector2(nx, ny), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const p = ray.current.ray.intersectPlane(plane, hit.current);
    return p ? { x: p.x, y: -p.z } : null;
  };
}

/** A 44 px round handle that owns its drag (pointer capture). */
export function Handle({
  position,
  title,
  children,
  active,
  offsetY,
  onStart,
  onMove,
  onEnd,
}: {
  position: [number, number, number];
  title: string;
  children: ReactNode;
  active: boolean;
  /** screen-space nudge in px, so a handle can sit clear of the object's card */
  offsetY?: number;
  onStart: (e: React.PointerEvent) => void;
  onMove: (e: React.PointerEvent) => void;
  onEnd: (e: React.PointerEvent, cancelled: boolean) => void;
}) {
  const [hover, setHover] = useState(false);
  useCursor(hover, 'grab');
  return (
    <Html
      position={position}
      center
      zIndexRange={[30, 10]}
      style={{ pointerEvents: 'auto', transform: offsetY ? `translateY(${offsetY}px)` : undefined }}
    >
      <button
        type="button"
        data-entity-label
        aria-label={title}
        title={title}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={() => setHover(false)}
        onPointerDown={(e) => {
          e.stopPropagation();
          // capture keeps the moves coming while the pointer leaves the 44 px
          // button; a pointer that cannot be captured (synthetic, or a lost
          // touch) still drags as long as it stays over the handle
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* not capturable */
          }
          onStart(e);
        }}
        onPointerMove={(e) => {
          if (!active) return;
          onMove(e);
        }}
        onPointerUp={(e) => {
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* not captured */
          }
          onEnd(e, false);
        }}
        onPointerCancel={(e) => onEnd(e, true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onEnd(e as unknown as React.PointerEvent, true);
        }}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          display: 'grid',
          placeItems: 'center',
          background: active ? '#ffc766' : 'rgba(20,24,30,0.92)',
          color: active ? '#1b1206' : '#f2f4f6',
          border: `2px solid ${active ? '#ffc766' : 'rgba(255,255,255,0.55)'}`,
          boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
          cursor: active ? 'grabbing' : 'grab',
          touchAction: 'none',
          padding: 0,
        }}
      >
        {children}
      </button>
    </Html>
  );
}

/** The live readout beside a drag: the op's sentence and what it changes. */
export function Readout({
  position,
  preview,
  offsetY = 0,
}: {
  position: [number, number, number];
  preview: OpPreview | null;
  offsetY?: number;
}) {
  if (!preview) return null;
  return (
    <Html position={position} center zIndexRange={[31, 10]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          transform: `translateY(${offsetY - 40}px)`,
          whiteSpace: 'nowrap',
          background: preview.ok ? 'rgba(20,24,30,0.94)' : 'rgba(120,20,20,0.94)',
          color: '#f2f4f6',
          border: `1px solid ${preview.ok ? 'rgba(255,255,255,0.25)' : '#ef4444'}`,
          borderRadius: 10,
          padding: '6px 10px',
          fontSize: 12,
          fontVariantNumeric: 'tabular-nums',
          boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
        }}
      >
        {preview.ok ? summarizeImpact(preview.impact) : `Refused — ${preview.refusal.reason}`}
      </div>
    </Html>
  );
}

// ─── Table gizmo: move (centre), rotate (row end), tilt (other row end) ──────

type TableDrag =
  | { kind: 'move'; start: XY; args: { ids: string[]; dx: number; dy: number } }
  | { kind: 'rotate'; startBearing: number; startAz: number; args: { segmentId: string; azimuthDeg: number } }
  | { kind: 'tilt'; startY: number; startTilt: number; args: { segmentId: string; tiltDeg: number } }
  // an edge handle: whole rows/columns come and go with the drag (count > 0 grows, < 0 shrinks)
  | { kind: 'edge'; axis: GrowAxis; side: GrowSide; start: XY; pitch: number; count: number };

export function TableGizmo({
  project,
  seg,
  roof,
  spec,
  runOp,
  ghostItemsFor,
  onDragging,
}: {
  project: Project;
  seg: ArraySegment;
  roof: Roof;
  spec: PanelSpec;
  runOp: RunOp;
  /** module instances of `seg` inside a previewed project — the ghost */
  ghostItemsFor: (next: Project, segId: string) => PanelInstance[];
  onDragging?: (dragging: boolean) => void;
}) {
  const toPlane = usePlanePointer();
  const [drag, setDrag] = useState<TableDrag | null>(null);
  const [preview, setPreview] = useState<OpPreview | null>(null);
  // a refused release keeps its reason on screen for a moment — otherwise the
  // table just snaps back and the user is left guessing why
  const [notice, setNotice] = useState<OpPreview | null>(null);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => onDragging?.(!!drag), [drag, onDragging]);

  const mine = project.panels.filter((p) => p.segmentId === seg.id && p.enabled);
  if (mine.length === 0) return null;
  const cx = mine.reduce((a, p) => a + p.center.x, 0) / mine.length;
  const cy = mine.reduce((a, p) => a + p.center.y, 0) / mine.length;
  // half-extent along the row direction, so the end handles sit just off the table
  const az = (seg.azimuthDeg * Math.PI) / 180;
  const rowDir = { x: Math.cos(az), y: -Math.sin(az) };
  const halfW =
    mine.reduce((m, p) => Math.max(m, Math.abs((p.center.x - cx) * rowDir.x + (p.center.y - cy) * rowDir.y)), 0) +
    Math.max(spec.lengthMm, spec.widthMm) / 2000 +
    0.9;
  const handleY = roof.heightM + (seg.racking.kind === 'flush' ? 0.6 : 2.4);
  const at = (px: number, py: number): [number, number, number] => [px, handleY, -py];
  const moveAt = at(cx, cy);
  const rotAt = at(cx + rowDir.x * halfW, cy + rowDir.y * halfW);
  const tiltAt = at(cx - rowDir.x * halfW, cy - rowDir.y * halfW);
  const bearing = (p: XY) => (Math.atan2(p.x - cx, p.y - cy) * 180) / Math.PI;
  const elevated = seg.racking.kind !== 'flush';
  const tilt0 = seg.racking.kind === 'flush' ? 0 : seg.racking.tiltDeg;

  // edge handles sit just off the lattice's four sides, in the SAME frame
  // layout.grow / layout.shrink use (segmentGrid), so a drag counts real cells
  const grid = segmentGrid(roof, spec, seg, mine);
  const locals = mine.map((p) => rotate(p.center, -grid.angle));
  const lb = {
    minX: Math.min(...locals.map((l) => l.x)),
    maxX: Math.max(...locals.map((l) => l.x)),
    minY: Math.min(...locals.map((l) => l.y)),
    maxY: Math.max(...locals.map((l) => l.y)),
  };
  const midX = (lb.minX + lb.maxX) / 2;
  const midY = (lb.minY + lb.maxY) / 2;
  const edgeWorld = (side: GrowSide): XY =>
    rotate(
      side === 'top'
        ? { x: midX, y: lb.maxY + grid.pitchY * 0.75 }
        : side === 'bottom'
          ? { x: midX, y: lb.minY - grid.pitchY * 0.75 }
          : side === 'left'
            ? { x: lb.minX - grid.pitchX * 0.75, y: midY }
            : { x: lb.maxX + grid.pitchX * 0.75, y: midY },
      grid.angle,
    );
  const edgeAt = (side: GrowSide): [number, number, number] => {
    const w = edgeWorld(side);
    return at(w.x, w.y);
  };
  /** cells the pointer has crossed, signed: outward = grow */
  const edgeCount = (side: GrowSide, start: XY, now: XY): number => {
    const s = rotate(start, -grid.angle);
    const n = rotate(now, -grid.angle);
    const raw =
      side === 'top'
        ? (n.y - s.y) / grid.pitchY
        : side === 'bottom'
          ? (s.y - n.y) / grid.pitchY
          : side === 'left'
            ? (s.x - n.x) / grid.pitchX
            : (n.x - s.x) / grid.pitchX;
    return Math.round(raw);
  };

  const show = (op: DesignOp<never>, args: unknown) => {
    const pv = previewOp(project, op as DesignOp<unknown>, args);
    setPreview(pv);
    return pv;
  };

  const startMove = (e: React.PointerEvent) => {
    const p = toPlane(e, handleY);
    if (!p) return;
    setDrag({ kind: 'move', start: p, args: { ids: mine.map((m) => m.id), dx: 0, dy: 0 } });
    setPreview(null);
  };
  const startRotate = (e: React.PointerEvent) => {
    const p = toPlane(e, handleY);
    if (!p) return;
    setDrag({
      kind: 'rotate',
      startBearing: bearing(p),
      startAz: seg.azimuthDeg,
      args: { segmentId: seg.id, azimuthDeg: seg.azimuthDeg },
    });
    setPreview(null);
  };
  const startTilt = (e: React.PointerEvent) => {
    setDrag({ kind: 'tilt', startY: e.clientY, startTilt: tilt0, args: { segmentId: seg.id, tiltDeg: tilt0 } });
    setPreview(null);
  };
  const startEdge = (side: GrowSide) => (e: React.PointerEvent) => {
    const p = toPlane(e, handleY);
    if (!p) return;
    const axis: GrowAxis = side === 'top' || side === 'bottom' ? 'row' : 'column';
    setDrag({ kind: 'edge', axis, side, start: p, pitch: axis === 'row' ? grid.pitchY : grid.pitchX, count: 0 });
    setPreview(null);
  };

  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    if (drag.kind === 'move') {
      const p = toPlane(e, handleY);
      if (!p) return;
      // Shift = snap the move to 10 cm, the installer's tape
      const snap = e.shiftKey ? 0.1 : 0.01;
      const dx = Math.round((p.x - drag.start.x) / snap) * snap;
      const dy = Math.round((p.y - drag.start.y) / snap) * snap;
      const args = { ...drag.args, dx, dy };
      setDrag({ ...drag, args });
      show(panelsNudge as DesignOp<never>, args);
    } else if (drag.kind === 'rotate') {
      const p = toPlane(e, handleY);
      if (!p) return;
      let azimuth = drag.startAz + (bearing(p) - drag.startBearing);
      azimuth = ((Math.round(azimuth) % 360) + 360) % 360;
      if (e.shiftKey) azimuth = (Math.round(azimuth / 15) * 15) % 360; // Shift = 15° detents
      const args = { ...drag.args, azimuthDeg: azimuth };
      setDrag({ ...drag, args });
      show(segmentSetAzimuth as DesignOp<never>, args);
    } else if (drag.kind === 'tilt') {
      // lever: 4 px per degree, up = steeper; the setter clamps to 5–35°
      const tiltDeg = Math.max(5, Math.min(35, Math.round(drag.startTilt + (drag.startY - e.clientY) / 4)));
      const args = { ...drag.args, tiltDeg };
      setDrag({ ...drag, args });
      show(segmentSetTilt as DesignOp<never>, args);
    } else {
      const p = toPlane(e, handleY);
      if (!p) return;
      const count = edgeCount(drag.side, drag.start, p);
      if (count === drag.count) return;
      setDrag({ ...drag, count });
      if (count > 0) show(layoutGrow as DesignOp<never>, { segmentId: seg.id, axis: drag.axis, side: drag.side, count });
      else if (count < 0)
        show(layoutShrink as DesignOp<never>, { segmentId: seg.id, axis: drag.axis, side: drag.side, count: -count });
      else setPreview(null);
    }
  };

  const end = (_e: React.PointerEvent, cancelled: boolean) => {
    if (!drag) return;
    const pv = preview;
    setDrag(null);
    setPreview(null);
    if (!cancelled && pv && !pv.ok) setNotice(pv);
    if (cancelled || !pv || !pv.ok) return;
    if (drag.kind === 'move') {
      if (Math.abs(drag.args.dx) < 0.005 && Math.abs(drag.args.dy) < 0.005) return;
      runOp(panelsNudge, drag.args);
    } else if (drag.kind === 'rotate') {
      if (drag.args.azimuthDeg === seg.azimuthDeg) return;
      runOp(segmentSetAzimuth, drag.args);
    } else if (drag.kind === 'tilt') {
      if (drag.args.tiltDeg === tilt0) return;
      runOp(segmentSetTilt, drag.args);
    } else if (drag.count > 0) {
      runOp(layoutGrow, { segmentId: seg.id, axis: drag.axis, side: drag.side, count: drag.count });
    } else if (drag.count < 0) {
      runOp(layoutShrink, { segmentId: seg.id, axis: drag.axis, side: drag.side, count: -drag.count });
    }
  };

  const ghost = preview?.ok ? ghostItemsFor(preview.next, seg.id) : [];

  return (
    <group>
      {ghost.length > 0 && <PanelsInstanced ghost accessView={false} items={ghost} />}
      {/* the table's card sits on the centroid; the move handle hangs just below it */}
      <Handle
        position={moveAt}
        offsetY={MOVE_HANDLE_OFFSET_PX}
        title="Drag to move the table"
        active={drag?.kind === 'move'}
        onStart={startMove}
        onMove={move}
        onEnd={end}
      >
        <Move size={20} aria-hidden />
      </Handle>
      <Handle
        position={rotAt}
        title={`Drag to rotate the table (facing ${drag?.kind === 'rotate' ? drag.args.azimuthDeg : seg.azimuthDeg}°)`}
        active={drag?.kind === 'rotate'}
        onStart={startRotate}
        onMove={move}
        onEnd={end}
      >
        <RotateCw size={20} aria-hidden />
      </Handle>
      {elevated && (
        <Handle
          position={tiltAt}
          title={`Drag up or down to tilt (${drag?.kind === 'tilt' ? drag.args.tiltDeg : tilt0}°)`}
          active={drag?.kind === 'tilt'}
          onStart={startTilt}
          onMove={move}
          onEnd={end}
        >
          <ArrowUpDown size={20} aria-hidden />
        </Handle>
      )}
      {/* edge handles: drag out for more rows/columns, in for fewer */}
      {(['top', 'bottom', 'left', 'right'] as const).map((side) => {
        const rowEdge = side === 'top' || side === 'bottom';
        const live = drag?.kind === 'edge' && drag.side === side;
        return (
          <Handle
            key={side}
            position={edgeAt(side)}
            title={
              live
                ? drag.count > 0
                  ? `+${drag.count} ${rowEdge ? 'row' : 'column'}${drag.count === 1 ? '' : 's'}`
                  : drag.count < 0
                    ? `−${-drag.count} ${rowEdge ? 'row' : 'column'}${drag.count === -1 ? '' : 's'}`
                    : 'Drag out to add, in to remove'
                : `Drag to add or remove ${rowEdge ? 'rows' : 'columns'} on this side`
            }
            active={live}
            onStart={startEdge(side)}
            onMove={move}
            onEnd={end}
          >
            {rowEdge ? <Rows3 size={18} aria-hidden /> : <Columns3 size={18} aria-hidden />}
          </Handle>
        );
      })}
      <Readout
        position={
          drag?.kind === 'rotate'
            ? rotAt
            : drag?.kind === 'tilt'
              ? tiltAt
              : drag?.kind === 'edge'
                ? edgeAt(drag.side)
                : moveAt
        }
        offsetY={drag?.kind === 'move' || (!drag && notice) ? MOVE_HANDLE_OFFSET_PX + 44 : drag?.kind === 'edge' ? 44 : 0}
        preview={preview ?? notice}
      />
    </group>
  );
}

/** px below the table card's anchor — clear of a three-line card with two buttons */
const MOVE_HANDLE_OFFSET_PX = 118;
/** px below a wall unit's top — under the cabinet, clear of its card and tag */
const WALL_HANDLE_OFFSET_PX = 96;

// ─── Wall gizmo: slide an inverter or a battery cabinet along the walls ──────

export function WallGizmo({
  project,
  kind,
  id,
  runOp,
  onDragging,
}: {
  project: Project;
  kind: 'inverter' | 'battery' | 'box';
  id: string;
  runOp: RunOp;
  onDragging?: (dragging: boolean) => void;
}) {
  const toPlane = usePlanePointer();
  const [drag, setDrag] = useState<{ roofId: string; edgeIndex: number; t: number; pos: XY } | null>(null);
  const [preview, setPreview] = useState<OpPreview | null>(null);
  // the grab point on the plane at pointer-down: the drag is RELATIVE to it, so
  // a handle that hangs below the unit does not throw the unit to wherever the
  // handle's own ray meets the ground
  const grab = useRef<{ p0: XY; base: XY } | null>(null);
  useEffect(() => onDragging?.(!!drag), [drag, onDragging]);

  const unit =
    kind === 'inverter'
      ? project.inverterPlacements.find((u) => u.id === id)
      : kind === 'box'
        ? (project.electricalBoxes ?? []).find((u) => u.id === id)
        : (project.batteryPlacements ?? []).find((u) => u.id === id);
  if (!unit) return null;
  const roof = project.roofs.find((r) => r.id === unit.roofId);
  if (!roof) return null;
  const a = roof.polygon[unit.edgeIndex];
  const b = roof.polygon[(unit.edgeIndex + 1) % roof.polygon.length];
  const out = wallOutward(roof, unit.edgeIndex);
  const outOff =
    kind === 'battery' ? (project.components.battery?.depthMm ?? 250) / 2000 + 0.03 : 0.12;
  const px = a.x + (b.x - a.x) * unit.t + out.x * outOff;
  const py = a.y + (b.y - a.y) * unit.t + out.y * outOff;
  const spec = project.components.battery;
  const topY =
    kind === 'battery' ? unit.heightM + (spec ? spec.heightMm / 1000 : 0.9) + 0.25 : unit.heightM + 0.55;
  const planeY = kind === 'battery' ? unit.heightM + 0.4 : unit.heightM;

  /** nearest point on any roof edge to the plan point — the wall the unit will hang on */
  const snapToWall = (m: XY) => {
    let best: { roofId: string; edgeIndex: number; t: number; d: number; pos: XY } | null = null;
    for (const r of project.roofs) {
      for (let i = 0; i < r.polygon.length; i++) {
        const ea = r.polygon[i];
        const eb = r.polygon[(i + 1) % r.polygon.length];
        const { d, t } = pointSegDist(m, ea, eb);
        if (!best || d < best.d)
          best = { roofId: r.id, edgeIndex: i, t, d, pos: { x: ea.x + (eb.x - ea.x) * t, y: ea.y + (eb.y - ea.y) * t } };
      }
    }
    return best;
  };
  const op = (kind === 'inverter' ? inverterMove : kind === 'box' ? boxMove : batteryMove) as DesignOp<{
    id: string;
    roofId: string;
    edgeIndex: number;
    t: number;
  }>;

  const wallPt = { x: a.x + (b.x - a.x) * unit.t, y: a.y + (b.y - a.y) * unit.t };
  const start = (e: React.PointerEvent) => {
    const p0 = toPlane(e, planeY);
    if (!p0) return;
    grab.current = { p0, base: wallPt };
    setDrag({ roofId: unit.roofId, edgeIndex: unit.edgeIndex, t: unit.t, pos: wallPt });
    setPreview(null);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag || !grab.current) return;
    const p = toPlane(e, planeY);
    if (!p) return;
    const m = { x: grab.current.base.x + (p.x - grab.current.p0.x), y: grab.current.base.y + (p.y - grab.current.p0.y) };
    const s = snapToWall(m);
    if (!s || s.d > 6) return; // too far from any wall: hold the last good spot
    const next = { roofId: s.roofId, edgeIndex: s.edgeIndex, t: s.t, pos: s.pos };
    setDrag(next);
    setPreview(previewOp(project, op, { id, roofId: s.roofId, edgeIndex: s.edgeIndex, t: s.t }));
  };
  const end = (_e: React.PointerEvent, cancelled: boolean) => {
    if (!drag) return;
    const d = drag;
    const pv = preview;
    setDrag(null);
    setPreview(null);
    if (cancelled || !pv || !pv.ok) return;
    if (d.roofId === unit.roofId && d.edgeIndex === unit.edgeIndex && Math.abs(d.t - unit.t) < 1e-4) return;
    runOp(op, { id, roofId: d.roofId, edgeIndex: d.edgeIndex, t: d.t });
  };

  const handleAt: [number, number, number] = [px, topY, -py];
  return (
    <group>
      {drag && (
        // where it will hang: a brass ghost at the snapped wall point
        <mesh position={[drag.pos.x, planeY + (kind === 'inverter' ? 0 : 0.05), -drag.pos.y]} raycast={() => null}>
          <boxGeometry args={kind === 'inverter' ? [0.5, 0.68, 0.22] : [0.5, 0.7, 0.28]} />
          <meshBasicMaterial color="#ffc766" transparent opacity={0.55} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {/* the unit's card floats above it; the handle hangs below, clear of both */}
      <Handle
        position={handleAt}
        offsetY={WALL_HANDLE_OFFSET_PX}
        title={
          kind === 'inverter'
            ? 'Drag along a wall to move the inverter'
            : kind === 'box'
              ? 'Drag along a wall to move the box'
              : 'Drag along a wall to move the battery'
        }
        active={!!drag}
        onStart={start}
        onMove={move}
        onEnd={end}
      >
        {kind === 'inverter' ? (
          <PlugZap size={20} aria-hidden />
        ) : kind === 'box' ? (
          <Box size={20} aria-hidden />
        ) : (
          <BatteryCharging size={20} aria-hidden />
        )}
      </Handle>
      <Readout position={drag ? [drag.pos.x, topY, -drag.pos.y] : handleAt} preview={preview} />
    </group>
  );
}
