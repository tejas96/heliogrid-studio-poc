// ─── The gate: the sun chart sees what the shading engine sees ──────────────
//
// horizonProfile used to build its own skyline from three sources — a march
// across the height map, other roofs as blocks, obstructions as boxes — with
// the eye 1.2 m above the deck. The beam engine raycasts lib/scene-model's
// caster group, which also carries every parapet ring and lightning mast, from
// the module plane. So a 1.2 m parapet lifted every module figure along that
// edge while the chart beside them read "clear sky all day".
//
// The profile now raycasts the same group from the same height. These pin the
// two casters that were missing: a parapet and a mast both lift the horizon.
import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { horizonProfile } from '../sun-chart';
import { fixtureProject, fixtureRoof } from './fixtures/project';

/** One module 2 m inside the south and west edges of a 16 × 12 m flat roof. */
function site(over: Partial<Project> = {}): Project {
  const p = fixtureProject(1);
  return { ...p, panels: [{ ...p.panels[0], center: { x: -6, y: -4 } }], ...over };
}

const at = (prof: ReturnType<typeof horizonProfile>, azDeg: number) => prof.elevDeg[Math.round(azDeg / prof.stepDeg)];

describe('horizonProfile reads the engine’s caster group', () => {
  it('a parapet lifts the horizon over the edge it stands on — and only there', () => {
    const bare = horizonProfile(site(), 3, 'centre');
    const walled = horizonProfile(site({ roofs: [fixtureRoof({ parapet: { ...fixtureRoof().parapet, enabled: true } })] }), 3, 'centre');
    expect(at(bare, 180)).toBeLessThan(1);
    // the module plane sits below a 1 m wall 1.7 m away: ≈ atan(0.6 / 1.7) ≈ 19°
    expect(at(walled, 180)).toBeGreaterThan(10);
    expect(at(walled, 180)).toBeLessThan(40);
    // the far east edge (14 m away) barely registers; the near south edge dominates
    expect(at(walled, 90)).toBeLessThan(at(walled, 180));
    expect(walled.sources.parapets).toBe(1);
  });

  it('a lightning mast lifts the horizon in its own direction', () => {
    const masted = horizonProfile(
      site({ arresters: [{ id: 'la_1', roofId: 'roof_1', pos: { x: -6, y: -2 }, heightMm: 3000 }] } as Partial<Project>),
      3,
      'centre',
    );
    // 3 m mast 2 m due north of the module: ≈ atan(2.6 / 2) ≈ 52°
    expect(at(masted, 0)).toBeGreaterThan(40);
    expect(at(masted, 180)).toBeLessThan(1);
    expect(masted.sources.masts).toBe(1);
  });
});
