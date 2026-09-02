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
import { useMemo } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import type { InverterSpec, PanelSpec, Project, StringDef, XY } from '../types';
import type { DesignOp } from '../lib/ops/types';
import { previewOp, type OpPreview } from '../lib/ops/run';
import { stringsAddManual, stringsResetToAuto } from '../lib/ops/electrical-ops';
import { stringRemove } from '../lib/ops/string-ops';
import { resolveDesignTemps, vmpAt, vocAt } from '../lib/electrical/temps';
import { stringSizing } from '../lib/electrical/window';
import { polylineLengthM } from '../lib/routing';
import { EntityLabel } from './EntityLabel';
import type { ScenePick } from './Scene3D';

type RunOp = <A>(op: DesignOp<A>, args: A) => OpPreview;
type Vec3 = [number, number, number];

const RED = '#ef4444';
const DC_PLUS = '#c62828';
const DC_MINUS = '#1f2428';
const AC = '#2e7d32';

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
}: {
  project: Project;
  spec: PanelSpec | null;
  /** module id → scene position of its glass centre (from the rendered instances) */
  panelPositions: ReadonlyMap<string, Vec3>;
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

  const roofHeightAt = (p: XY): number => {
    const roof = project.roofs.find((r) => inPolygon(p, r.polygon));
    return roof ? roof.heightM : 0;
  };

  // ── strings: module-to-module runs, lifted 8 cm above the glass ──
  const stringLines = useMemo(
    () =>
      project.strings.map((s) => {
        const pts: Vec3[] = [];
        for (const id of s.panelIds) {
          const p = panelPositions.get(id);
          if (p) pts.push([p[0], p[1] + 0.08, p[2]]);
        }
        const health = spec && inv ? stringHealth(project, s.panelIds, spec, inv) : null;
        return { s, pts, health };
      }),
    [project, panelPositions, spec, inv],
  );

  // ── cable runs: along the deck, then down the wall to the unit ──
  const routeLines = useMemo(() => {
    const out: { id: string; pts: Vec3[]; color: string; kind: string }[] = [];
    const pairIndex = new Map<string, number>();
    for (const r of routes) {
      if (r.waypoints.length < 2) continue;
      const pts: Vec3[] = [];
      if (r.kind === 'string_homerun') {
        const k = pairIndex.get(r.fromRef) ?? 0;
        pairIndex.set(r.fromRef, k + 1);
        for (const w of r.waypoints) pts.push([w.x, roofHeightAt(w) + 0.05 + k * 0.03, -w.y]);
        // the last waypoint is the inverter's wall point: drop to its mount height
        const ip = project.inverterPlacements.find((x) => x.id === r.toRef) ?? project.inverterPlacements[0];
        const last = r.waypoints[r.waypoints.length - 1];
        if (ip) pts.push([last.x, ip.heightM + 0.3, -last.y]);
        out.push({ id: r.id, pts, color: k === 0 ? DC_PLUS : DC_MINUS, kind: 'DC home run' });
      } else if (r.kind === 'inverter_ac') {
        const ip = project.inverterPlacements[0];
        const first = r.waypoints[0];
        if (ip) pts.push([first.x, ip.heightM - 0.3, -first.y]);
        for (const w of r.waypoints) pts.push([w.x, 0.06, -w.y]);
        out.push({ id: r.id, pts, color: AC, kind: 'AC run to the meter' });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, project.roofs, project.inverterPlacements]);

  const picked = pick?.kind === 'string' ? project.strings.find((s) => s.id === pick.id) : null;

  // ── the wiring readout: live window check on the modules picked so far ──
  const wiringPreview: OpPreview | null =
    wiring && wiring.length > 0 ? previewOp(project, stringsAddManual, { panelIds: wiring }) : null;
  const wiringHealth = wiring && wiring.length > 0 && spec && inv ? stringHealth(project, wiring, spec, inv) : null;
  const wiringAnchor: Vec3 | null = (() => {
    if (!wiring) return null;
    const first = wiring.length > 0 ? panelPositions.get(wiring[0]) : null;
    if (first) return [first[0], first[1] + 1.2, first[2]];
    const any = panelPositions.values().next().value as Vec3 | undefined;
    return any ? [any[0], any[1] + 1.2, any[2]] : [0, 4, 0];
  })();

  return (
    <group>
      {stringLines.map(({ s, pts, health }) => {
        if (pts.length < 2) return null;
        const isPicked = picked?.id === s.id;
        const isHover = !isPicked && hoverPick?.kind === 'string' && hoverPick.id === s.id;
        const bad = health && health.status !== 'ok';
        const color = bad ? RED : s.color;
        // a 2 px line is no touch target: an invisible 25 cm tube along the run
        // takes the clicks and hovers (it sits above the glass, so it wins the ray)
        const curve = new THREE.CatmullRomCurve3(
          pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
          false,
          'centripetal',
          0,
        );
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
              <tubeGeometry args={[curve, Math.max(8, pts.length * 4), 0.13, 6, false]} />
              <meshBasicMaterial visible={false} />
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

      {routeLines.map((r) => (
        <Line key={r.id} points={r.pts} color={r.color} lineWidth={2.5} transparent opacity={0.85} raycast={() => null} />
      ))}

      {picked &&
        spec &&
        inv &&
        (() => {
          const s = picked;
          const health = stringHealth(project, s.panelIds, spec, inv);
          const mid = panelPositions.get(s.panelIds[Math.floor(s.panelIds.length / 2)]);
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
