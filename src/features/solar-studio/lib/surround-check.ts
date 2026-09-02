// ─── The model held against the aerial height map ───────────────────────────
// The Solar API height map (lib/surround) reads every roof's real height:
// the median of its uncut samples inside the traced polygon, taken from the
// grid as it is NOW (roofReadingsFor), so a roof traced after the fetch is
// read too. A traced roof whose height is far from that reading shades
// wrong, strings wrong and prices wrong — so the design health says so, in
// plain words, before any of those numbers ship.
import type { Project, ValidationIssue } from '../types';
import { peekSurroundHeights } from './surround';
import { roofReadingsFor, type SurroundHeights } from './surround-geometry';

/** A model further from the height map than this is worth a look (metres). */
export const ROOF_HEIGHT_TOLERANCE_M = 1.5;

/**
 * The height map's reading over each roof, by id. Nothing until the grid is
 * in memory (the design sync loads it before the first shading run).
 */
export function roofReadings(project: Project, grid: SurroundHeights | null = peekSurroundHeights(project.surround)): Record<string, number> {
  if (!grid) return {};
  return roofReadingsFor(grid, project.roofs);
}

export function roofHeightIssues(
  project: Project,
  grid: SurroundHeights | null = peekSurroundHeights(project.surround),
): ValidationIssue[] {
  const read = roofReadings(project, grid);
  const out: ValidationIssue[] = [];
  for (const roof of project.roofs) {
    if (roof.roofType === 'ground') continue;
    const map = read[roof.id];
    if (map === undefined) continue;
    const diff = map - roof.heightM;
    if (Math.abs(diff) <= ROOF_HEIGHT_TOLERANCE_M) continue;
    out.push({
      level: 'warn',
      code: 'roof_height_vs_map',
      message:
        `${roof.name} is ${roof.heightM.toFixed(1)} m in the model; the aerial height map reads ` +
        `≈ ${map.toFixed(1)} m over it (${diff > 0 ? 'taller' : 'lower'} by ${Math.abs(diff).toFixed(1)} m). ` +
        `Check the roof height in Step 2 — it sets the shade, the cable drops and the structure.`,
    });
  }
  return out;
}
