// ─── Roof operations that read the aerial height map ─────────────────────────
import { defineOp } from './types';
import { registerOp } from './registry';
import { peekSurroundHeights } from '../surround';
import { guessObstructionType, raisedObjectsNotDrawn, roofMapFit, roofRaisedObjects, roofsWithMapFit } from '../roof-map-fit';
import { makeObstruction } from '../roof-factory';
import { withObstructions } from '../structure-edit';
import type { Obstruction, Project } from '../../types';

function gridOf(p: Project) {
  return p.surround ? peekSurroundHeights(p.surround) : null;
}

/** The roof's height (and pitch and facing when the plane is clean) set from the aerial height map. */
export const roofApplyMapFit = defineOp<{ roofId: string }>({
  id: 'roof.applyMapFit',
  layer: 'geometry',
  label: () => 'Roof height from the aerial height map',
  validate: (p, a) => {
    const roof = p.roofs.find((r) => r.id === a.roofId);
    if (!roof) return { reason: 'Roof not found' };
    const g = gridOf(p);
    if (!g) return { reason: 'No aerial height map loaded for this site' };
    if (!roofMapFit(g, roof, p.calibration.northOffsetDeg)) return { reason: 'The height map has too few samples over this roof' };
    return null;
  },
  // the roofs standing ON this one (mumties, stair rooms) go with it
  apply: (p, a) => ({ roofs: roofsWithMapFit(p.roofs, gridOf(p)!, a.roofId, p.calibration.northOffsetDeg) }),
});

/** What the height map finds standing on the roof, added as obstructions with their measured size. */
export const obstructionsAddFromMap = defineOp<{ roofId: string }>({
  id: 'obstructions.addFromMap',
  layer: 'geometry',
  label: () => 'Add raised objects from the aerial height map',
  validate: (p, a) => {
    const roof = p.roofs.find((r) => r.id === a.roofId);
    if (!roof) return { reason: 'Roof not found' };
    const g = gridOf(p);
    if (!g) return { reason: 'No aerial height map loaded for this site' };
    const fit = roofMapFit(g, roof, p.calibration.northOffsetDeg);
    if (!fit) return { reason: 'The height map has too few samples over this roof' };
    if (raisedObjectsNotDrawn(roofRaisedObjects(g, roof, fit), p.obstructions).length === 0)
      return { reason: 'Nothing new stands on this roof in the height map' };
    return null;
  },
  apply: (p, a) => {
    const g = gridOf(p)!;
    const roof = p.roofs.find((r) => r.id === a.roofId)!;
    const fit = roofMapFit(g, roof, p.calibration.northOffsetDeg)!;
    const found = raisedObjectsNotDrawn(roofRaisedObjects(g, roof, fit), p.obstructions);
    const added: Obstruction[] = [];
    for (const o of found) {
      added.push(
        makeObstruction({
          type: guessObstructionType(o),
          center: o.center,
          existing: [...p.obstructions, ...added],
          roofId: roof.id,
          lengthM: o.lengthM,
          widthM: o.widthM,
          heightM: o.heightM,
          provenance: { source: 'dataLayers', confidence: Math.min(1, o.cells / 16) },
        }),
      );
    }
    return withObstructions(p, [...p.obstructions, ...added]);
  },
});

for (const op of [roofApplyMapFit, obstructionsAddFromMap]) registerOp(op);
