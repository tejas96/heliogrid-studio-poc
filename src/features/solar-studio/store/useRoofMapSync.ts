// ─── Roof heights follow the aerial height map ──────────────────────────────
// A typed roof height is a guess; the height map is a measurement. Once the
// map is in memory, every roof the user has not set by hand takes what the
// map reads — height, and pitch/facing when the plane is clean — and is
// marked 'aerial_map'. A roof the user edits becomes 'user' and is never
// touched again. Derived from the site, like the surround: never an undo step.
import { useEffect } from 'react';
import { useActiveProject, useProjectPatch } from './store';
import { useSurroundGrid } from '../lib/use-surround-grid';
import { roofsAdoptingMap } from '../lib/roof-map-fit';

export function useRoofMapSync() {
  const project = useActiveProject();
  const patch = useProjectPatch();
  const grid = useSurroundGrid(project?.surround);
  const roofs = project?.roofs;
  const northOffsetDeg = project?.calibration.northOffsetDeg ?? 0;
  useEffect(() => {
    if (!grid || !roofs || roofs.length === 0) return;
    const next = roofsAdoptingMap(roofs, grid, northOffsetDeg);
    if (next) patch({ roofs: next }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, roofs, northOffsetDeg]);
}
