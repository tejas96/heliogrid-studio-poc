// ─── Where a home run leaves the array ──────────────────────────────────────
// DC cables do not cross an array diagonally. They run under the modules
// ALONG THE ROW (in the tray on the purlins) to the end of that row, and only
// then along the array edge or the roof perimeter to the inverter. This picks
// the row end — the one that leaves the shorter total path to the target —
// in the table's own lattice frame, the frame layout.grow and the fill use.
import type { PlacedPanel, Project, XY } from '../types';
import { segmentGrid } from './segment-ops';
import { COL_STRIDE } from './layout';
import { rotate } from './geo';

export function rowExitPoint(project: Project, end: PlacedPanel, target: XY): XY | null {
  const spec = project.components.panel;
  if (!spec || !end.segmentId) return null;
  const seg = project.segments.find((s) => s.id === end.segmentId);
  const roof = project.roofs.find((r) => r.id === end.roofId);
  if (!seg || !roof) return null;
  const mine = project.panels.filter((p) => p.segmentId === seg.id && p.enabled);
  if (mine.length === 0) return null;
  const { angle } = segmentGrid(roof, spec, seg, mine);
  const row = Math.floor((end.cellIndex ?? 0) / COL_STRIDE);
  const rowPanels = mine.filter((p) => Math.floor((p.cellIndex ?? 0) / COL_STRIDE) === row);
  if (rowPanels.length === 0) return null;
  const locals = rowPanels.map((p) => rotate(p.center, -angle));
  const endL = rotate(end.center, -angle);
  // the module's extent ALONG the row: its short side stands portrait, its long side landscape
  const halfAlong = (seg.orientation === 'portrait' ? spec.widthMm : spec.lengthMm) / 2000;
  const minX = Math.min(...locals.map((l) => l.x)) - halfAlong - 0.3;
  const maxX = Math.max(...locals.map((l) => l.x)) + halfAlong + 0.3;
  const west = rotate({ x: minX, y: endL.y }, angle);
  const east = rotate({ x: maxX, y: endL.y }, angle);
  // the tail follows the array edge and the parapet, never a diagonal: judge
  // it as a Manhattan distance in the lattice frame, or a run that could go
  // straight to the west end picks the east end and walks the whole perimeter
  const tL = rotate(target, -angle);
  const viaWest = endL.x - minX + Math.abs(tL.x - minX) + Math.abs(tL.y - endL.y);
  const viaEast = maxX - endL.x + Math.abs(tL.x - maxX) + Math.abs(tL.y - endL.y);
  return viaWest <= viaEast ? west : east;
}
