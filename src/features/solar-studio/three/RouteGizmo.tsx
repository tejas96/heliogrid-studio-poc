// ─── Route gizmo: drag a cable run's corners on the roof ────────────────────
// A picked run shows a handle on every interior corner (drag = move it) and
// a smaller one on every leg's midpoint (drag = add a corner there). Each
// drag previews routes.moveWaypoint — the ghost shows the new path and the
// readout what it does to the cable length — and the release runs it. The run
// becomes hand-routed; the router keeps it until "Re-route automatically".
import { useState } from 'react';
import { Line } from '@react-three/drei';
import { CornerDownRight, Plus } from 'lucide-react';
import type { CableRoute, Project, XY } from '../types';
import type { DesignOp } from '../lib/ops/types';
import { previewOp, type OpPreview } from '../lib/ops/run';
import { routesMoveWaypoint } from '../lib/ops/electrical-ops';
import { Handle, Readout, usePlanePointer } from './Gizmos';

type RunOp = <A>(op: DesignOp<A>, args: A) => OpPreview;
type Vec3 = [number, number, number];

export function RouteGizmo({
  project,
  route,
  planeY,
  toScene,
  runOp,
}: {
  project: Project;
  route: CableRoute;
  /** height the run lies at (deck level) — the drag plane */
  planeY: number;
  /** plan → scene for the ghost line */
  toScene: (p: XY) => Vec3;
  runOp: RunOp;
}) {
  const toPlane = usePlanePointer();
  const [drag, setDrag] = useState<{ index: number; insert: boolean; pos: XY } | null>(null);
  const [preview, setPreview] = useState<OpPreview | null>(null);
  const wps = route.waypoints;
  if (wps.length < 2) return null;

  const start = (index: number, insert: boolean) => (e: React.PointerEvent) => {
    const p = toPlane(e, planeY);
    if (!p) return;
    setDrag({ index, insert, pos: p });
    setPreview(previewOp(project, routesMoveWaypoint, { routeId: route.id, index, pos: p, insert }));
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toPlane(e, planeY);
    if (!p) return;
    const args = { routeId: route.id, index: drag.index, pos: p, insert: drag.insert };
    setDrag({ ...drag, pos: p });
    setPreview(previewOp(project, routesMoveWaypoint, args));
  };
  const end = (_e: React.PointerEvent, cancelled: boolean) => {
    if (!drag) return;
    const d = drag;
    const pv = preview;
    setDrag(null);
    setPreview(null);
    if (cancelled || !pv || !pv.ok) return;
    runOp(routesMoveWaypoint, { routeId: route.id, index: d.index, pos: d.pos, insert: d.insert });
  };

  // the previewed path, when a drag is live
  const ghost: Vec3[] | null =
    preview?.ok ? ((preview.next.cableRoutes ?? []).find((r) => r.id === route.id)?.waypoints.map(toScene) ?? null) : null;

  return (
    <group>
      {ghost && ghost.length >= 2 && (
        <Line points={ghost} color="#ffc766" lineWidth={3} transparent opacity={0.9} raycast={() => null} />
      )}
      {/* interior corners: move */}
      {wps.slice(1, -1).map((w, i) => {
        const index = i + 1;
        const at = toScene(w);
        return (
          <Handle
            key={`c${index}`}
            position={[at[0], at[1] + 0.35, at[2]]}
            title="Drag to move this cable corner"
            active={drag?.index === index && !drag.insert}
            onStart={start(index, false)}
            onMove={move}
            onEnd={end}
          >
            <CornerDownRight size={18} aria-hidden />
          </Handle>
        );
      })}
      {/* leg midpoints: add a corner */}
      {wps.slice(0, -1).map((w, i) => {
        const n = wps[i + 1];
        const mid = { x: (w.x + n.x) / 2, y: (w.y + n.y) / 2 };
        const at = toScene(mid);
        return (
          <Handle
            key={`m${i}`}
            position={[at[0], at[1] + 0.35, at[2]]}
            title="Drag to add a corner here"
            active={drag?.index === i + 1 && drag.insert}
            onStart={start(i + 1, true)}
            onMove={move}
            onEnd={end}
          >
            <Plus size={16} aria-hidden />
          </Handle>
        );
      })}
      {drag && <Readout position={[toScene(drag.pos)[0], planeY + 0.35, toScene(drag.pos)[2]]} preview={preview} />}
    </group>
  );
}
