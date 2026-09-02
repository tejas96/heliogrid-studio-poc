// ─── Derived-state freshness for strings, routes and money ──────────────────
// `solarAccess` already follows the stamp pattern (derived.solarAccessFp vs
// shadingFp). Strings and cable routes were the two derived objects that did
// NOT — they were frozen snapshots with no recompute trigger and no stale
// flag, so moving an inverter left the BOM pricing copper to the old wall.
// This module gives them the same discipline and composes the three into one
// answer for "may this money be shown as final?".
import type { Project } from '../../types';
import { electricalFp, isShadingFresh, layoutFp } from '../fingerprints';
import { shadeTierOf } from '../electrical/grouping';

const r = (v: number, f: number) => Math.round(v * f);

/**
 * Everything the string planner reads: the layout, the components, each
 * enabled module's shade TIER (not its raw access — a 0.96 → 0.97 move must
 * not re-string the array), and the manual strings it must plan around.
 * Auto strings are deliberately NOT inputs: they are the output.
 */
export function stringsInputFp(p: Project): string {
  const c = p.components;
  return (
    layoutFp(p) +
    '|' +
    JSON.stringify([
      c.panel?.id ?? '',
      c.inverter?.id ?? '',
      c.inverterCount,
      c.inverterTopology ?? 'string',
      c.mlpe ?? 'none',
      p.panels.map((x) => (x.enabled ? shadeTierOf(x.solarAccess) : '-')),
      p.strings.filter((s) => s.manual).map((s) => [s.id, s.panelIds]),
    ])
  );
}

/**
 * Everything the router reads: the strings (ids + modules, via electricalFp),
 * the geometry blockers and corridors (via layoutFp ⊂ electricalFp), the
 * inverter placements, the meter, and the hand-routed runs it must keep.
 */
/** Bump when the router's RULES change: stored runs are then stale and re-derive once. */
// 3: a hand-routed leg keeps its sibling — stored runs missing a leg re-derive once
const ROUTER_RULES_VERSION = 3;

export function routesInputFp(p: Project): string {
  return (
    electricalFp(p) +
    `|rv${ROUTER_RULES_VERSION}|` +
    JSON.stringify([
      p.inverterPlacements.map((i) => [
        i.id,
        i.roofId,
        i.edgeIndex,
        r(i.t, 1000),
        i.heightM,
        // free-standing units add their position; wall units stay byte-identical
        ...(i.pos ? [r(i.pos.x, 100), r(i.pos.y, 100), i.level ?? 'roof'] : []),
      ]),
      p.gridConnection?.pos ?? null,
      (p.cableRoutes ?? []).filter((c) => c.manual).map((c) => [c.id, c.fromRef, c.waypoints]),
    ]) +
    // DCDB / ACDB boxes bend the runs — CONDITIONAL suffix, so a project
    // without boxes keeps its route fingerprint byte-identical
    ((p.electricalBoxes?.length ?? 0) > 0
      ? '|box:' +
        JSON.stringify(
          p.electricalBoxes!.map((b) => [
            b.id,
            b.kind,
            b.roofId,
            b.edgeIndex,
            r(b.t, 1000),
            b.heightM,
            ...(b.pos ? [r(b.pos.x, 100), r(b.pos.y, 100), b.level ?? 'roof'] : []),
          ]),
        )
      : '') +
    // battery leads follow the cabinets — same conditional rule
    ((p.batteryPlacements?.length ?? 0) > 0
      ? '|bat:' +
        JSON.stringify(
          p.batteryPlacements!.map((b) => [
            b.id,
            b.roofId,
            b.edgeIndex,
            r(b.t, 1000),
            b.heightM,
            ...(b.pos ? [r(b.pos.x, 100), r(b.pos.y, 100), b.level ?? 'ground'] : []),
          ]),
        )
      : '')
  );
}

function hasElectrical(p: Project): boolean {
  return !!p.components.panel && !!p.components.inverter;
}

/** True when `strings[]` describes the current layout, components and shade. */
export function isStringsFresh(p: Project): boolean {
  if (!hasElectrical(p)) return true; // earlier steps own this
  return p.derived.stringsFp === stringsInputFp(p);
}

/** True when `cableRoutes[]` describes the current strings and placements. */
export function areRoutesFresh(p: Project): boolean {
  if (!hasElectrical(p)) return true;
  return p.derived.routesFp === routesInputFp(p);
}

export interface Freshness {
  shading: boolean;
  strings: boolean;
  routes: boolean;
  /** every derived layer money depends on is current */
  all: boolean;
}

export function designFreshness(p: Project): Freshness {
  const shading = isShadingFresh(p);
  const strings = isStringsFresh(p);
  const routes = areRoutesFresh(p);
  return { shading, strings, routes, all: shading && strings && routes };
}

/** Plain-language reasons a figure is provisional — empty when it is final. */
export function freshnessReasons(p: Project): string[] {
  const f = designFreshness(p);
  const out: string[] = [];
  if (!f.shading) out.push('shading is recalculating');
  if (!f.strings) out.push('strings are being re-derived');
  if (!f.routes) out.push('cable routes are being re-derived');
  return out;
}
