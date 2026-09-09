// ─── Fill one roof from inside the editor, around what is already there ─────
//
// The customer adds a shed; the designer had to go back to Step 5 and re-run
// the whole design, which replaces every module on every roof — the
// hand-placed ones included (lib/auto-design passes `avoidPanels: []` and
// `layoutAutoDesign.apply` returns whole arrays). The editor's own Table tool
// already knew how to fill an AREA additively; this is that fill, for a whole
// roof, as one new table.
//
// A capacity cap keeps the BEST positions, not the first: the roof heatmap
// (lib/solar-heatmap, cached by lib/heatmap-cache) scores every candidate by
// the solar access of the cell under it, so a capped fill lands where the sun
// is. Without a cached map the budget truncates in lattice order and the
// caller says so.
import type { ArraySegment, PanelSpec, PlacedPanel, Project, Roof } from '../types';
import { fillRoofAsSegment, nextSegmentLabel } from './layout';
import { reindexSegment } from './segment-ops';
import type { HeatmapResult } from './solar-heatmap';

export interface RoofFillPlan {
  segment: ArraySegment;
  panels: PlacedPanel[];
  count: number;
  kwp: number;
  /** true when the cap chose by measured sun, not by lattice order */
  bestFirst: boolean;
}

/**
 * Score fill candidates by the roof heatmap: the mean annual access of the
 * nearest cell (cells sit on a 0.5 m-ish grid, so "nearest" is the cell the
 * module stands on). Candidates off the map score 0 and go last.
 */
export function heatmapScorer(heat: HeatmapResult): (candidates: PlacedPanel[]) => Map<string, number> {
  const cells = heat.cells.map((c) => ({
    x: c.world[0],
    y: -c.world[2],
    access: c.monthly.reduce((s, v) => s + v, 0) / Math.max(1, c.monthly.length),
  }));
  return (candidates) => {
    const out = new Map<string, number>();
    for (const p of candidates) {
      let best = 0;
      let bestD2 = Infinity;
      for (const c of cells) {
        const dx = c.x - p.center.x;
        const dy = c.y - p.center.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = c.access;
        }
      }
      out.set(p.id, bestD2 <= heat.stepM * heat.stepM * 2 ? best : 0);
    }
    return out;
  };
}

/**
 * What filling `roof` would add: one table of portrait modules on the roof's
 * own lattice, clear of setbacks, obstructions, walkways, keepouts and every
 * module already placed. Null when nothing fits.
 */
export function planRoofFill(
  project: Project,
  roof: Roof,
  spec: PanelSpec,
  opts: { capKwp?: number; heat?: HeatmapResult | null } = {},
): RoofFillPlan | null {
  const maxPanels =
    opts.capKwp && opts.capKwp > 0 && spec.watt > 0 ? Math.floor((opts.capKwp * 1000) / spec.watt) : undefined;
  if (maxPanels === 0) return null;
  const bestFirst = maxPanels !== undefined && !!opts.heat && opts.heat.cells.length > 0;
  const filled = fillRoofAsSegment(project, roof, spec, {
    orientation: 'portrait',
    gapM: 0.05,
    grouped: true,
    avoidPanels: project.panels,
    ...(maxPanels !== undefined ? { maxPanels } : {}),
    ...(bestFirst ? { scoreCandidates: heatmapScorer(opts.heat!) } : {}),
  });
  if (!filled || filled.panels.length === 0) return null;
  const re = reindexSegment(roof, spec, filled.segment, filled.panels);
  re.segment.label = nextSegmentLabel(project.segments);
  return {
    segment: re.segment,
    panels: re.panels,
    count: re.panels.length,
    kwp: Math.round((re.panels.length * spec.watt) / 10) / 100,
    bestFirst,
  };
}
