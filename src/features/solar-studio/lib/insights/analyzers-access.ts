// ─── Phase 15: maintenance & constructability analyzers (§8.4, §8.5) ────────
// Rules over geometry that ALREADY exists — no new systems, per the plan. Each
// one answers a question an installer or an O&M crew asks on site and the
// design silently ignores today:
//
//   cleaning-access      can a cleaner physically reach this module?
//   module-replacement   can a failed module come out without dismantling rows?
//   ladder-access        is there anywhere to land a ladder on this roof?
//   inverter-access      can a technician stand in front of the inverter?
//
// Every threshold is an ASSUMED O&M convention from rule config, not a code
// minimum, so all of these WARN — none of them block (§8.4 risk note).
import type { PanelSpec, PlacedPanel, Project, Roof, XY } from '../../types';
import { dist, pointSegDist } from '../geo';
import { panelCornersOnRoof } from '../layout';
import { resolveRules } from '../../data/rules/india';
import { registerAnalyzer, listAnalyzers } from './registry';
import type { Insight, InsightAnalyzer } from './types';

/** Confidence is capped: these rules are conventions, not measurements. */
const CONVENTION_CONFIDENCE = 0.6;

function enabledOn(p: Project, roofId: string): PlacedPanel[] {
  return p.panels.filter((x) => x.enabled && x.roofId === roofId);
}

/** Shortest distance from a point to any edge of a closed ring. */
function distToRing(pt: XY, ring: XY[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const d = pointSegDist(pt, ring[i], ring[(i + 1) % ring.length]).d;
    if (d < best) best = d;
  }
  return best;
}

/** Shortest distance from a point to any walkway centreline on this roof. */
function distToWalkways(pt: XY, p: Project, roofId: string): number {
  let best = Infinity;
  for (const w of p.walkways) {
    if (w.roofId !== roofId) continue;
    const d = pointSegDist(pt, w.a, w.b).d;
    if (d < best) best = d;
  }
  return best;
}

// ── 1. Cleaning access ──────────────────────────────────────────────────────
// Soiling loss is already priced into the energy model; this asks whether the
// cleaning that assumption depends on is physically possible.
const cleaningAccess: InsightAnalyzer = {
  id: 'cleaning-access',
  title: 'Cleaning access',
  analyze(p: Project): Insight[] {
    const reach = resolveRules().defaults.cleaningReachM;
    const out: Insight[] = [];
    for (const roof of p.roofs) {
      const panels = enabledOn(p, roof.id);
      if (panels.length === 0) continue;
      const unreachable = panels.filter((pn) => {
        const toEdge = distToRing(pn.center, roof.polygon);
        const toWalk = distToWalkways(pn.center, p, roof.id);
        return Math.min(toEdge, toWalk) > reach;
      });
      if (unreachable.length === 0) continue;
      out.push({
        key: `cleaning-access:${roof.id}`,
        analyzerId: 'cleaning-access',
        category: 'maintenance',
        severity: 'warning',
        impact: Math.min(1, unreachable.length / panels.length),
        confidence: CONVENTION_CONFIDENCE,
        title: `${roof.name}: ${unreachable.length} module${unreachable.length > 1 ? 's' : ''} beyond cleaning reach`,
        detail: `These modules sit more than ${reach} m from any roof edge or walkway, so a cleaner cannot reach them without walking on the array. The energy report already assumes the array gets cleaned — add a walkway, or the soiling loss will be worse than modelled.`,
        evidence: [
          `${unreachable.length} of ${panels.length} modules on ${roof.name}`,
          `reach threshold = ${reach} m (ASSUMED O&M convention)`,
          `walkways on this roof = ${p.walkways.filter((w) => w.roofId === roof.id).length}`,
        ],
        focusIds: unreachable.map((x) => x.id),
        action: { label: 'Add a walkway in Step 6' },
      });
    }
    return out;
  },
};

// ── 2. Module replacement ───────────────────────────────────────────────────
// A module fails under warranty and has to come OUT. If it is boxed in on all
// four sides, the crew dismantles working modules to reach it.
const moduleReplacement: InsightAnalyzer = {
  id: 'module-replacement',
  title: 'Module replacement path',
  analyze(p: Project): Insight[] {
    const spec: PanelSpec | null = p.components.panel;
    if (!spec) return [];
    const out: Insight[] = [];
    for (const roof of p.roofs) {
      const panels = enabledOn(p, roof.id);
      if (panels.length < 5) continue; // too small to box anything in
      const boxed = panels.filter((pn) => boxedIn(pn, panels, spec, roof));
      if (boxed.length === 0) continue;
      out.push({
        key: `module-replacement:${roof.id}`,
        analyzerId: 'module-replacement',
        category: 'maintenance',
        severity: 'suggestion',
        impact: Math.min(1, boxed.length / panels.length),
        confidence: CONVENTION_CONFIDENCE,
        title: `${roof.name}: ${boxed.length} module${boxed.length > 1 ? 's' : ''} enclosed on all sides`,
        detail: `Replacing one of these means unclamping the modules around it first. That is normal in a dense commercial array — flag it to the O&M team rather than redesign, unless a walkway is cheap here.`,
        evidence: [`${boxed.length} of ${panels.length} modules fully surrounded on ${roof.name}`],
        focusIds: boxed.map((x) => x.id),
      });
    }
    return out;
  },
};

/** Neighbours within ~1 module pitch in all four in-plane directions. */
function boxedIn(
  target: PlacedPanel,
  panels: PlacedPanel[],
  spec: PanelSpec,
  roof: Roof,
): boolean {
  const corners = panelCornersOnRoof(target, spec, roof);
  // module extent from its own footprint — orientation/foreshortening safe
  const w = dist(corners[0], corners[1]);
  const h = dist(corners[1], corners[2]);
  const near = Math.max(w, h) * 1.35;
  let left = false, right = false, up = false, down = false;
  for (const o of panels) {
    if (o.id === target.id) continue;
    const dx = o.center.x - target.center.x;
    const dy = o.center.y - target.center.y;
    if (Math.hypot(dx, dy) > near) continue;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) right = true;
      else left = true;
    } else {
      if (dy > 0) down = true;
      else up = true;
    }
  }
  return left && right && up && down;
}

// ── 3. Ladder / crane access ────────────────────────────────────────────────
// Materials and people have to get ONTO the roof. If every edge is crowded by
// modules there is nowhere to land a ladder.
const ladderAccess: InsightAnalyzer = {
  id: 'ladder-access',
  title: 'Ladder / material access',
  analyze(p: Project): Insight[] {
    const spec = p.components.panel;
    if (!spec) return [];
    const need = resolveRules().defaults.ladderEdgeM;
    const out: Insight[] = [];
    for (const roof of p.roofs) {
      const panels = enabledOn(p, roof.id);
      if (panels.length === 0) continue;
      // an edge is usable when some point along it has no module within `need`
      const usable = roof.polygon.some((a, i) => {
        const b = roof.polygon[(i + 1) % roof.polygon.length];
        if (dist(a, b) < need) return false;
        const samples = Math.max(2, Math.ceil(dist(a, b) / 1));
        for (let s = 0; s <= samples; s++) {
          const t = s / samples;
          const pt = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
          const clear = panels.every((pn) => dist(pn.center, pt) > need);
          if (clear) return true;
        }
        return false;
      });
      if (usable) continue;
      out.push({
        key: `ladder-access:${roof.id}`,
        analyzerId: 'ladder-access',
        category: 'constructability',
        severity: 'warning',
        impact: 0.5,
        confidence: CONVENTION_CONFIDENCE,
        title: `${roof.name}: no clear edge to land a ladder or hoist materials`,
        detail: `Every edge of this roof has modules within ${need} m of it. The crew needs somewhere to get people and panels onto the roof — leave one edge clear, or plan access from an adjacent roof.`,
        evidence: [
          `${panels.length} modules on ${roof.name}`,
          `clear-edge requirement = ${need} m (ASSUMED site convention)`,
        ],
        focusIds: [roof.id],
      });
    }
    return out;
  },
};

// ── 4. Inverter access ──────────────────────────────────────────────────────
const inverterAccess: InsightAnalyzer = {
  id: 'inverter-access',
  title: 'Inverter working clearance',
  analyze(p: Project): Insight[] {
    const need = resolveRules().defaults.inverterClearanceM;
    const out: Insight[] = [];
    for (const inv of p.inverterPlacements) {
      const roof = p.roofs.find((r) => r.id === inv.roofId);
      if (!roof) continue;
      const edge = roof.polygon[inv.edgeIndex];
      const next = roof.polygon[(inv.edgeIndex + 1) % roof.polygon.length];
      if (!edge || !next) continue;
      const at = {
        x: edge.x + (next.x - edge.x) * inv.t,
        y: edge.y + (next.y - edge.y) * inv.t,
      };
      const blockers = p.obstructions.filter(
        (o) => o.roofId === roof.id && dist(o.center, at) < need + o.setbackM,
      );
      const panelsClose = p.panels.filter(
        (pn) => pn.enabled && pn.roofId === roof.id && dist(pn.center, at) < need,
      );
      if (blockers.length === 0 && panelsClose.length === 0) continue;
      out.push({
        key: `inverter-access:${inv.id}`,
        analyzerId: 'inverter-access',
        category: 'maintenance',
        severity: 'warning',
        impact: 0.4,
        confidence: CONVENTION_CONFIDENCE,
        title: 'Inverter has no clear working space in front of it',
        detail: `A technician needs roughly ${need} m of standing room to commission and service the inverter. Move the inverter along the wall, or clear what is in front of it.`,
        evidence: [
          `clearance requirement = ${need} m (ASSUMED — not a code minimum)`,
          ...blockers.map((b) => `obstruction ${b.label} within reach`),
          ...(panelsClose.length > 0 ? [`${panelsClose.length} modules within ${need} m`] : []),
        ],
        focusIds: [...blockers.map((b) => b.id), ...panelsClose.map((x) => x.id)],
      });
    }
    return out;
  },
};

/** Idempotent registration of the Phase 15 pack. */
export function registerAccessAnalyzers(): void {
  if (listAnalyzers().some((a) => a.id === 'cleaning-access')) return;
  registerAnalyzer(cleaningAccess);
  registerAnalyzer(moduleReplacement);
  registerAnalyzer(ladderAccess);
  registerAnalyzer(inverterAccess);
}
