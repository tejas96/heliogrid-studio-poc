// ─── Electrical in 3D: strings and cable runs on the model (Phase 5) ────────
// A string is a coloured run from module to module in wiring order, drawn on
// the glass. It is real geometry: hover lifts it, a click opens its card —
// count, cold Voc against the inverter's DC limit, hot Vmp against the MPPT
// window, the home run and its drop, the inverter's DC loading. A string that
// breaks the window draws RED on the roof, before anyone opens a sheet.
//
// Home runs and the AC run are drawn as cable along the deck and down the
// wall: what the BOM bills, where it will actually lie.
//
// "Wire by hand" turns module clicks into membership toggles with a live
// readout; Save runs strings.addManual, so the planner strings the rest
// around it (lib/derive/electrical-sync).
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import type { InverterSpec, PanelSpec, Project, StringDef, XY } from '../types';
import type { DesignOp } from '../lib/ops/types';
import { previewOp, type OpPreview } from '../lib/ops/run';
import { stringsAddManual, stringsResetToAuto } from '../lib/ops/electrical-ops';
import { stringRemove } from '../lib/ops/string-ops';
import { routeResetToAuto } from '../lib/ops/route-ops';
import { RouteGizmo } from './RouteGizmo';
import { resolveDesignTemps, vmpAt, vocAt } from '../lib/electrical/temps';
import { stringSizing } from '../lib/electrical/window';
import { dcdbForInverter, polylineLengthM } from '../lib/routing';
import { EntityLabel } from './EntityLabel';
import type { ScenePick } from './Scene3D';

type RunOp = <A>(op: DesignOp<A>, args: A) => OpPreview;
type Vec3 = [number, number, number];

const RED = '#ef4444';
const DC_PLUS = '#c62828';
const DC_MINUS = '#1f2428';
const AC = '#2e7d32';
const BATTERY = '#d97706';

export interface StringHealth {
  n: number;
  vocCold: number;
  vmpHot: number;
  minPanels: number;
  maxPanels: number;
  status: 'ok' | 'over' | 'under';
  why: string;
}

/** The numbers behind a string's colour: cold Voc vs DC limit, hot Vmp vs MPPT floor. */
export function stringHealth(project: Project, panelIds: string[], spec: PanelSpec, inv: InverterSpec): StringHealth {
  const temps = resolveDesignTemps(project);
  const sizing = stringSizing(spec, inv, temps);
  const n = panelIds.length;
  const vocCold = Math.round(vocAt(spec, temps.minCellC) * n);
  const vmpHot = Math.round(vmpAt(spec, temps.maxCellC) * n);
  if (n > sizing.maxPanels) {
    return {
      n,
      vocCold,
      vmpHot,
      minPanels: sizing.minPanels,
      maxPanels: sizing.maxPanels,
      status: 'over',
      why: `${vocCold} V cold Voc is over the inverter's ${inv.maxDcV} V DC limit — max ${sizing.maxPanels} modules`,
    };
  }
  if (n < sizing.minPanels) {
    return {
      n,
      vocCold,
      vmpHot,
      minPanels: sizing.minPanels,
      maxPanels: sizing.maxPanels,
      status: 'under',
      why: `${vmpHot} V hot Vmp falls under the MPPT floor of ${inv.mppt.minV} V — min ${sizing.minPanels} modules`,
    };
  }
  return {
    n,
    vocCold,
    vmpHot,
    minPanels: sizing.minPanels,
    maxPanels: sizing.maxPanels,
    status: 'ok',
    why: `inside the window: ${inv.mppt.minV}–${inv.mppt.maxV} V MPPT, ${inv.maxDcV} V max`,
  };
}

function inPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function ElectricalOverlay({
  project,
  spec,
  panelPositions,
  pick,
  hoverPick,
  onPick,
  onHoverPick,
  runOp,
  wiring,
  onWiringChange,
  isolate = null,
}: {
  project: Project;
  spec: PanelSpec | null;
  /** object isolation: draw only this string (with its runs) or this run */
  isolate?: ScenePick | null;
  /** module id → glass centre and how far above it a run must sit to clear the tilted high edge */
  panelPositions: ReadonlyMap<string, { position: Vec3; lift: number }>;
  pick: ScenePick | null;
  hoverPick: ScenePick | null;
  onPick: (p: ScenePick | null) => void;
  onHoverPick: (p: ScenePick | null) => void;
  runOp: RunOp;
  /** module ids being wired by hand, or null when not wiring */
  wiring: string[] | null;
  onWiringChange: (ids: string[] | null) => void;
}) {
  const inv = project.components.inverter;
  const routes = project.cableRoutes ?? [];
  // isolation is a render-time filter, so the memoised geometry below is untouched
  const stringVisible = (id: string) => !isolate || (isolate.kind === 'string' && isolate.id === id);
  const routeVisible = (id: string) =>
    !isolate ||
    (isolate.kind === 'route' && isolate.id === id) ||
    (isolate.kind === 'string' && routes.some((r) => r.id === id && r.fromRef === isolate.id));

  // A run's row-end exits and its wall landings sit ON the roof outline (or a
  // hand's width past it, on the parapet). "Inside the polygon" is false there,
  // and drawing those points at ground level painted a red ring around the
  // building. Anything within a parapet's reach of an edge is on the roof.
  const nearEdge = (p: XY, poly: XY[], tol: number): boolean => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
      if (Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y) <= tol) return true;
    }
    return false;
  };
  const roofHeightAt = (p: XY): number => {
    const roof = project.roofs.find((r) => inPolygon(p, r.polygon) || nearEdge(p, r.polygon, 0.8));
    return roof ? roof.heightM : 0;
  };
  const wallPos = (u: { roofId: string; edgeIndex: number; t: number }): XY => {
    const roof = project.roofs.find((r) => r.id === u.roofId);
    if (!roof) return { x: 0, y: 0 };
    const a = roof.polygon[u.edgeIndex % roof.polygon.length];
    const b = roof.polygon[(u.edgeIndex + 1) % roof.polygon.length];
    return { x: a.x + (b.x - a.x) * u.t, y: a.y + (b.y - a.y) * u.t };
  };

  // ── strings: module-to-module runs, lifted clear of the tilted glass. The
  // pick tube is built HERE, once per change: rebuilding it inside render left
  // a pointer ray a mesh without a geometry (boundingSphere of undefined).
  const stringLines = useMemo(
    () =>
      project.strings.map((s) => {
        const pts: Vec3[] = [];
        for (const id of s.panelIds) {
          const p = panelPositions.get(id);
          if (p) pts.push([p.position[0], p.position[1] + p.lift, p.position[2]]);
        }
        const health = spec && inv ? stringHealth(project, s.panelIds, spec, inv) : null;
        let tube: THREE.TubeGeometry | null = null;
        if (pts.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(
            pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
            false,
            'centripetal',
            0,
          );
          tube = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 4), 0.13, 6, false);
        }
        return { s, pts, health, tube };
      }),
    [project, panelPositions, spec, inv],
  );
  useEffect(
    () => () => {
      for (const l of stringLines) l.tube?.dispose();
    },
    [stringLines],
  );

  // ── cable runs: along the deck, then down the wall to the unit ──
  const routeLines = useMemo(() => {
    const out: { id: string; pts: Vec3[]; color: string; kind: string; tube: THREE.TubeGeometry | null }[] = [];
    const pairIndex = new Map<string, number>();
    const stringIdx = new Map(project.strings.map((s, i) => [s.id, i]));
    const placementAt = (ref: string) => {
      const m = /^inverter\/(\d+)$/.exec(ref);
      return m ? project.inverterPlacements[Number(m[1])] : undefined;
    };
    for (const r of routes) {
      if (r.waypoints.length < 2) continue;
      const pts: Vec3[] = [];
      let color = AC;
      let kind = 'AC run to the meter';
      if (r.kind === 'string_homerun') {
        const k = pairIndex.get(r.fromRef) ?? 0;
        pairIndex.set(r.fromRef, k + 1);
        // runs that share a tray are drawn a few centimetres apart — a bundle,
        // not one line on top of another (the metres come from the waypoints)
        const lane = ((stringIdx.get(r.fromRef) ?? 0) % 6) * 0.06;
        for (const w of r.waypoints) pts.push([w.x + lane, roofHeightAt(w) + 0.05 + k * 0.03, -(w.y + lane)]);
        // the last waypoint is the wall point of the DCDB / inverter: drop to its mount height
        const ip = placementAt(r.toRef) ?? project.inverterPlacements[0];
        const last = r.waypoints[r.waypoints.length - 1];
        const box = (project.electricalBoxes ?? []).find(
          (b) => b.kind === 'dcdb' && Math.hypot(wallPos(b).x - last.x, wallPos(b).y - last.y) < 0.5,
        );
        const landH = box ? box.heightM + 0.25 : ip ? ip.heightM + 0.3 : null;
        if (landH !== null) pts.push([last.x + lane, landH, -(last.y + lane)]);
        color = k === 0 ? DC_PLUS : DC_MINUS;
        kind = k === 0 ? 'DC home run (+)' : 'DC home run (−)';
      } else if (r.kind === 'inverter_ac') {
        const first = r.waypoints[0];
        const ip = placementAt(r.fromRef);
        const acdb = (project.electricalBoxes ?? []).find((b) => b.kind === 'acdb');
        // starts at the inverter's AC terminals or the ACDB, runs at ground level
        const startH = ip ? ip.heightM - 0.3 : r.fromRef === 'acdb' && acdb ? acdb.heightM - 0.2 : null;
        if (startH !== null) pts.push([first.x, startH, -first.y]);
        for (const w of r.waypoints) pts.push([w.x, 0.06, -w.y]);
        if (r.toRef === 'acdb' && acdb) {
          const last = r.waypoints[r.waypoints.length - 1];
          pts.push([last.x, acdb.heightM - 0.2, -last.y]);
        }
        kind = r.fromRef === 'acdb' ? 'AC run · ACDB to the meter' : r.toRef === 'acdb' ? 'AC run · inverter to the ACDB' : 'AC run to the meter';
      } else if (r.kind === 'battery_dc') {
        // cabinet base to the inverter's DC terminals, along the wall
        const ip = placementAt(r.toRef);
        const first = r.waypoints[0];
        pts.push([first.x, 0.35, -first.y]);
        for (const w of r.waypoints) pts.push([w.x, 0.12, -w.y]);
        if (ip) {
          const last = r.waypoints[r.waypoints.length - 1];
          pts.push([last.x, ip.heightM - 0.2, -last.y]);
        }
        color = BATTERY;
        kind = 'Battery DC leads';
      } else {
        continue;
      }
      let tube: THREE.TubeGeometry | null = null;
      // the pick sleeve stops short of the landing drop: a sleeve down the
      // wall sat on the inverter / box and stole every click meant for it
      const sleevePts = pts.length > r.waypoints.length ? pts.slice(0, r.waypoints.length) : pts;
      if (sleevePts.length >= 2) {
        const curve = new THREE.CatmullRomCurve3(sleevePts.map((p) => new THREE.Vector3(p[0], p[1], p[2])), false, 'centripetal', 0);
        // a fat, faint sleeve: the drawn line stays thin, the click target is a hand's width
        tube = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 4), 0.2, 6, false);
      }
      out.push({ id: r.id, pts, color, kind, tube });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, project.roofs, project.inverterPlacements, project.electricalBoxes]);
  useEffect(
    () => () => {
      for (const l of routeLines) l.tube?.dispose();
    },
    [routeLines],
  );

  const picked = pick?.kind === 'string' ? project.strings.find((s) => s.id === pick.id) : null;

  // ── the wiring readout: live window check on the modules picked so far ──
  const wiringPreview: OpPreview | null =
    wiring && wiring.length > 0 ? previewOp(project, stringsAddManual, { panelIds: wiring }) : null;
  const wiringHealth = wiring && wiring.length > 0 && spec && inv ? stringHealth(project, wiring, spec, inv) : null;
  const wiringAnchor: Vec3 | null = (() => {
    if (!wiring) return null;
    const first = wiring.length > 0 ? panelPositions.get(wiring[0]) : null;
    if (first) return [first.position[0], first.position[1] + first.lift + 1.1, first.position[2]];
    const any = panelPositions.values().next().value as { position: Vec3; lift: number } | undefined;
    return any ? [any.position[0], any.position[1] + any.lift + 1.1, any.position[2]] : [0, 4, 0];
  })();

  return (
    <group>
      {stringLines.filter(({ s }) => stringVisible(s.id)).map(({ s, pts, health, tube }) => {
        if (pts.length < 2 || !tube) return null;
        const isPicked = picked?.id === s.id;
        const isHover = !isPicked && hoverPick?.kind === 'string' && hoverPick.id === s.id;
        const bad = health && health.status !== 'ok';
        const color = bad ? RED : s.color;
        // a 2 px line is no touch target: an invisible 25 cm tube along the run
        // takes the clicks and hovers (it sits above the glass, so it wins the ray)
        return (
          <group key={s.id}>
            <Line
              points={pts}
              color={color}
              lineWidth={isPicked ? 5 : isHover ? 4 : bad ? 3.5 : 2.5}
              transparent
              opacity={isPicked || isHover ? 1 : 0.9}
              raycast={() => null}
            />
            <mesh
              geometry={tube}
              onClick={(e) => {
                if (e.delta > 4) return;
                e.stopPropagation();
                onPick({ kind: 'string', id: s.id });
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                onHoverPick({ kind: 'string', id: s.id });
              }}
              onPointerOut={() => onHoverPick(null)}
            >
              {/* a faint sleeve: the pick target, and a hint that the run is a thing */}
              <meshBasicMaterial color={color} transparent opacity={isPicked || isHover ? 0.45 : 0.22} depthWrite={false} toneMapped={false} />
            </mesh>
            {/* the + end: where the run starts */}
            <mesh position={pts[0]} raycast={() => null}>
              <sphereGeometry args={[0.09, 10, 10]} />
              <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
            {(isPicked || isHover || bad) && (
              <Html position={pts[0]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
                <div
                  style={{
                    transform: 'translateY(-16px)',
                    fontSize: 10,
                    fontFamily: 'var(--mono)',
                    background: bad ? 'rgba(127,29,29,0.92)' : 'rgba(20,24,30,0.85)',
                    color: '#f2f4f6',
                    padding: '1px 6px',
                    borderRadius: 4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.name}
                  {bad ? ` · ${health!.status === 'over' ? 'over voltage' : 'under MPPT'}` : ''}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {routeLines.filter((r) => routeVisible(r.id)).map((r) => {
        const isPicked = pick?.kind === 'route' && pick.id === r.id;
        const isHover = !isPicked && hoverPick?.kind === 'route' && hoverPick.id === r.id;
        return (
          <group key={r.id}>
            <Line
              points={r.pts}
              color={r.color}
              lineWidth={isPicked ? 4.5 : isHover ? 3.5 : 2.5}
              transparent
              opacity={0.9}
              raycast={() => null}
            />
            {r.tube && (
              <mesh
                geometry={r.tube}
                // Runs lie under the modules. Letting the sleeve win through
                // the glass (pickPriority) stole a third of every module's
                // clicks, so a run is picked only where it is exposed — the
                // string card's "Cable run" and the inverter's "AC run" reach
                // the rest.
                onClick={(e) => {
                  if (e.delta > 4) return;
                  e.stopPropagation();
                  onPick({ kind: 'route', id: r.id });
                }}
                onPointerOver={(e) => {
                  e.stopPropagation();
                  onHoverPick({ kind: 'route', id: r.id });
                }}
                onPointerOut={() => onHoverPick(null)}
              >
                {/* faint: eighteen sleeves share the parapet tray and used to read as one solid red band */}
                <meshBasicMaterial color={r.color} transparent opacity={isPicked || isHover ? 0.4 : 0.05} depthWrite={false} toneMapped={false} />
              </mesh>
            )}
          </group>
        );
      })}

      {/* the picked run: its card and the corner handles */}
      {pick?.kind === 'route' &&
        (() => {
          const r = routes.find((x) => x.id === pick.id);
          const drawn = routeLines.find((x) => x.id === pick.id);
          if (!r || !drawn) return null;
          const planM = polylineLengthM(r.waypoints);
          const totalM = Math.round((planM + r.verticalDropM) * (1 + r.slackPct));
          const invNo = (ref: string) => {
            const m = /^inverter\/(\d+)$/.exec(ref);
            return m ? `INV ${Number(m[1]) + 1}` : 'Inverter';
          };
          const fromName =
            r.kind === 'string_homerun'
              ? (project.strings.find((s) => s.id === r.fromRef)?.name ?? 'string')
              : r.kind === 'battery_dc'
                ? `Battery ${(project.batteryPlacements ?? []).findIndex((b) => b.id === r.fromRef) + 1}`
                : r.fromRef === 'acdb'
                  ? 'ACDB'
                  : invNo(r.fromRef);
          const toName =
            r.kind === 'string_homerun'
              ? dcdbForInverter(project, Number(/\d+$/.exec(r.toRef)?.[0] ?? 0))
                ? `DCDB of ${invNo(r.toRef)}`
                : invNo(r.toRef)
              : r.toRef === 'acdb'
                ? 'ACDB'
                : r.toRef === 'grid'
                  ? 'Meter'
                  : invNo(r.toRef);
          const mid = drawn.pts[Math.floor(drawn.pts.length / 2)];
          const deckY = drawn.pts[0][1];
          const toScene = (p: XY): Vec3 => [p.x, roofHeightAt(p) + 0.05, -p.y];
          return (
            <group>
              <EntityLabel
                position={[mid[0], mid[1] + 0.9, mid[2]]}
                title={`${drawn.kind}${r.manual ? ' · hand-routed' : ''}`}
                lines={[
                  `${fromName} → ${toName}`,
                  `${Math.round(planM)} m on the roof + ${Math.round(r.verticalDropM)} m drop · +${Math.round(r.slackPct * 100)}% slack = ${totalM} m to buy`,
                  'Drag a corner to move it · drag a + to add one',
                ]}
                onClose={() => onPick(null)}
                actions={
                  r.manual
                    ? [{ label: 'Re-route automatically', onClick: () => runOp(routeResetToAuto, { id: r.id }) }]
                    : []
                }
              />
              <RouteGizmo project={project} route={r} planeY={deckY} toScene={toScene} runOp={runOp} />
            </group>
          );
        })()}

      {picked &&
        spec &&
        inv &&
        (() => {
          const s = picked;
          const health = stringHealth(project, s.panelIds, spec, inv);
          const midEntry = panelPositions.get(s.panelIds[Math.floor(s.panelIds.length / 2)]);
          const mid = midEntry ? [midEntry.position[0], midEntry.position[1] + midEntry.lift, midEntry.position[2]] : null;
          const mine = routes.filter((r) => r.kind === 'string_homerun' && r.fromRef === s.id);
          const longest = mine.length ? Math.max(...mine.map((r) => polylineLengthM(r.waypoints) + r.verticalDropM)) : 0;
          const invLoadKw =
            (project.strings
              .filter((x) => x.inverterIndex === s.inverterIndex)
              .reduce((a, x) => a + x.panelIds.length, 0) *
              spec.watt) /
            1000;
          return (
            <EntityLabel
              position={mid ? [mid[0], mid[1] + 1.0, mid[2]] : [0, 4, 0]}
              title={`${s.name}${s.manual ? ' · by hand' : ''}`}
              lines={[
                `${health.n} modules · INV ${s.inverterIndex + 1} · MPPT ${s.mpptIndex + 1} · ${spec.impA} A`,
                `Voc cold ${health.vocCold} V of ${inv.maxDcV} V · Vmp hot ${health.vmpHot} V (MPPT ${inv.mppt.minV}–${inv.mppt.maxV} V)`,
                health.status === 'ok' ? `OK — ${health.why}` : `PROBLEM — ${health.why}`,
                `${longest > 0 ? `home run ${Math.round(longest)} m` : 'not routed yet'} · INV ${s.inverterIndex + 1} carries ${invLoadKw.toFixed(1)} kWp on ${inv.acKw} kW AC (${(invLoadKw / inv.acKw).toFixed(2)})`,
              ]}
              onClose={() => onPick(null)}
              actions={[
                {
                  label: 'Wire by hand',
                  onClick: () => {
                    onPick(null);
                    onWiringChange([...s.panelIds]);
                  },
                },
                // the run itself is a thin line under the glass — reach it from here
                ...(mine.length ? [{ label: 'Cable run', onClick: () => onPick({ kind: 'route', id: mine[0].id }) }] : []),
                { label: 'Re-plan all strings', onClick: () => runOp(stringsResetToAuto, {}) },
                ...(s.manual
                  ? [
                      {
                        label: 'Un-wire',
                        danger: true,
                        onClick: () => {
                          runOp(stringRemove, { id: s.id });
                          onPick(null);
                        },
                      },
                    ]
                  : []),
              ]}
            />
          );
        })()}

      {wiring && wiringAnchor && (
        <EntityLabel
          position={wiringAnchor}
          title="Wiring by hand — click modules"
          lines={
            wiringHealth && inv
              ? [
                  `${wiringHealth.n} modules · Voc cold ${wiringHealth.vocCold} V of ${inv.maxDcV} V · Vmp hot ${wiringHealth.vmpHot} V`,
                  wiringHealth.status === 'ok'
                    ? `OK — ${wiringHealth.minPanels}–${wiringHealth.maxPanels} modules fit the window`
                    : `NOT YET — ${wiringHealth.why}`,
                  ...(wiringPreview && !wiringPreview.ok ? [`Cannot save: ${wiringPreview.refusal.reason}`] : []),
                ]
              : ['Click a module to start. Click again to take it out.']
          }
          onClose={() => onWiringChange(null)}
          actions={[
            {
              label: 'Save string',
              onClick: () => {
                if (!wiring.length) return;
                const r = runOp(stringsAddManual, { panelIds: wiring });
                if (r.ok) onWiringChange(null);
              },
            },
            { label: 'Cancel', onClick: () => onWiringChange(null) },
          ]}
        />
      )}
    </group>
  );
}
