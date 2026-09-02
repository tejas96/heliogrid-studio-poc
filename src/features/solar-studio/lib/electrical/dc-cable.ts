// ─── The DC cable of every string, sized for its real run ───────────────────
// One place that answers "which cable does this string get, and how much of
// it": the fuse-rated minimum until the string's home runs are routed, then
// the thicker of the fuse rating and the drop over the routed loop
// (`sizeDcCable`). The BOM, the cable schedule, the SLD, the 3D string card
// and the energy engine all read this — the same string can never be quoted
// at one size and simulated at another.
import type { Project, StringDef } from '../../types';
import { dcCableSizeMm2, sizeDcCable, type DcCableSizing } from '../electrical-sizing';
import { intraStringExtraM, routeLengthM, stringLoopM } from '../routing';
import { resolveRules } from '../../data/rules/india';

export interface StringCable {
  string: StringDef;
  /** electrical loop length (both legs, no slack); null until a leg is routed */
  loopM: number | null;
  /** the full sizing once routed; null before (mm2 is then the fuse-rated size) */
  sizing: DcCableSizing | null;
  mm2: number;
}

export function dcStringCables(project: Project): StringCable[] {
  const panel = project.components.panel;
  if (!panel) return [];
  const minMm2 = dcCableSizeMm2(panel);
  return project.strings.map((s) => {
    const loopM = stringLoopM(project, s.id);
    const sizing = loopM === null ? null : sizeDcCable(panel, s.panelIds.length, loopM);
    return { string: s, loopM, sizing, mm2: sizing ? sizing.mm2 : minMm2 };
  });
}

/** Distinct sizes in use, ascending — the fuse-rated size alone before routing. */
export function dcCableSizesInUse(project: Project): number[] {
  const panel = project.components.panel;
  if (!panel) return [];
  const sizes = new Set<number>(dcStringCables(project).map((c) => c.mm2));
  if (sizes.size === 0) sizes.add(dcCableSizeMm2(panel));
  return [...sizes].sort((a, b) => a - b);
}

/** "4" · "4 + 6" — a label that names every size on the job. */
export function dcSizeLabel(sizes: number[]): string {
  return sizes.join(' + ');
}

export interface DcCableBySize {
  mm2: number;
  /** metres to buy: routed home runs with slack + the long intra-string hops */
  meters: number;
  homeRunM: number;
  intraM: number;
  strings: StringCable[];
  /** strings on this size only because of the drop over their loop */
  dropGoverned: number;
  /** the longest loop on this size and the worst drop, for the derivation line */
  longestLoopM: number;
  worstDropPct: number;
}

/**
 * The routed DC cable split by size — one BOM line per size. Every string is
 * counted (a string with no legs yet still owes its long hops), and each size
 * rounds its parts the way `dcCableFromRoutes` rounds the whole, so the lines
 * add up to a figure a reviewer can check against the schedule.
 */
export function dcCableBySize(project: Project): DcCableBySize[] {
  const routes = (project.cableRoutes ?? []).filter((r) => r.kind === 'string_homerun');
  const slack = 1 + resolveRules().cable.slackPct;
  const out = new Map<number, DcCableBySize>();
  for (const c of dcStringCables(project)) {
    const legs = routes.filter((r) => r.fromRef === c.string.id);
    const homeRunM = legs.reduce((sum, r) => sum + routeLengthM(r), 0);
    const intraM = intraStringExtraM(c.string, project) * slack;
    const row =
      out.get(c.mm2) ??
      ({ mm2: c.mm2, meters: 0, homeRunM: 0, intraM: 0, strings: [], dropGoverned: 0, longestLoopM: 0, worstDropPct: 0 } satisfies DcCableBySize);
    row.homeRunM += homeRunM;
    row.intraM += intraM;
    row.strings.push(c);
    if (c.sizing?.governedBy === 'voltage-drop') row.dropGoverned++;
    if (c.loopM !== null && c.loopM > row.longestLoopM) row.longestLoopM = c.loopM;
    if (c.sizing) row.worstDropPct = Math.max(row.worstDropPct, c.sizing.dropPct);
    out.set(c.mm2, row);
  }
  return [...out.values()]
    .map((r) => {
      const homeRunM = Math.round(r.homeRunM);
      const intraM = Math.round(r.intraM);
      return { ...r, homeRunM, intraM, meters: homeRunM + intraM };
    })
    .sort((a, b) => a.mm2 - b.mm2);
}
