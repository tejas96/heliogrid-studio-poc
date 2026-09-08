// ─── Gate: a safety rail casts a shadow, and it is not a wall ───────────────
// The scene has always DRAWN rails; the engine never knew they existed. A
// 1100 mm guardrail along the south parapet shades the first row every winter
// morning and no number said so.
//
// The second half of this gate matters as much as the first: a guardrail is
// mostly air. Modelling it as a solid slab at rail height would behave like a
// parapet and over-shade by roughly the ratio of bar to gap — trading a silent
// under-count for a silent over-count.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Project, SafetyRail } from '../../types';
import { buildShadowCasters, disposeGroup } from '../scene-model';
import { geometryFp, shadingFp } from '../fingerprints';

/** some fixtures carry a location, some do not; shadingFp returns '' without one */
const locatedFixture = fixtureProject(8);
import { fixtureProject, fixtureRoof } from './fixtures/project';

const rail = (over: Partial<SafetyRail> = {}): SafetyRail => ({
  id: 'rl_1',
  roofId: 'roof_1',
  a: { x: -6, y: -5 },
  b: { x: 6, y: -5 },
  heightMm: 1100,
  ...over,
});

function withRails(rails: SafetyRail[]): Project {
  return { ...fixtureProject(0), roofs: [fixtureRoof()], obstructions: [], rails };
}

describe('safety rails as shadow casters', () => {
  it('a rail produces casters; no rail produces none', () => {
    const none = buildShadowCasters(withRails([]));
    expect(none.meshes.some((m) => m.userData.casterKind === 'rail')).toBe(false);
    disposeGroup(none.group);

    const one = buildShadowCasters(withRails([rail()]));
    const railMeshes = one.meshes.filter((m) => m.userData.casterKind === 'rail');
    expect(railMeshes.length).toBeGreaterThan(2); // two bars plus posts
    // identity travels, so the per-panel inspector can name what blocked a ray
    expect(railMeshes.every((m) => m.userData.casterId === 'rl_1')).toBe(true);
    expect(railMeshes[0].userData.casterLabel).toBe('Safety rail');
    disposeGroup(one.group);
  });

  it('stands ON the roof at the stored height, not at ground level', () => {
    const p = withRails([rail()]);
    const { group, meshes } = buildShadowCasters(p);
    group.updateMatrixWorld(true);
    const rails = meshes.filter((m) => m.userData.casterKind === 'rail');
    const tops = rails.map((m) => new THREE.Box3().setFromObject(m).max.y);
    const roofY = p.roofs[0].heightM; // 3 m
    // the top rail sits at roof + 1.1 m, within its own 50 mm thickness
    expect(Math.max(...tops)).toBeGreaterThan(roofY + 1.0);
    expect(Math.max(...tops)).toBeLessThan(roofY + 1.2);
    // and nothing has fallen through the roof
    const bottoms = rails.map((m) => new THREE.Box3().setFromObject(m).min.y);
    expect(Math.min(...bottoms)).toBeGreaterThanOrEqual(roofY - 0.01);
    disposeGroup(group);
  });

  it('is MOSTLY AIR — a low sun passes between the bars far more often than not', () => {
    const p = withRails([rail()]);
    const { group, meshes } = buildShadowCasters(p);
    group.updateMatrixWorld(true);
    const rails = meshes.filter((m) => m.userData.casterKind === 'rail');
    const roofY = p.roofs[0].heightM;

    // fire level rays north across the rail line, sampling the full height a
    // module's neighbours would occupy, and count how many the rail stops
    const ray = new THREE.Raycaster();
    let blocked = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      const x = -6 + (12 * i) / (N - 1);
      const y = roofY + 0.05 + (1.0 * (i % 20)) / 19; // sweep heights too
      ray.set(new THREE.Vector3(x, y, 8), new THREE.Vector3(0, 0, -1));
      if (ray.intersectObjects(rails, false).length > 0) blocked += 1;
    }
    const fraction = blocked / N;
    // it must block SOMETHING — that is the bug being fixed
    expect(fraction).toBeGreaterThan(0);
    // ...and nothing like a wall, which would stop essentially every ray
    expect(fraction).toBeLessThan(0.5);
    disposeGroup(group);
  });

  it('moves the shading fingerprint, or the new caster would never run', () => {
    // The caster alone is not enough and this is the half that would have made
    // it dead on arrival: geometryFp tracked roofs and obstructions but not
    // rails, so drawing one left the key unchanged, the cached access was
    // stamped fresh, and the engine never re-ran. Found in the browser — the
    // rail existed, the numbers did not move.
    const none = withRails([]);
    const one = withRails([rail()]);
    // geometryFp is the key the rails were missing from; shadingFp builds on it
    expect(geometryFp(one)).not.toBe(geometryFp(none));
    // moving or resizing a rail must re-run it too
    expect(geometryFp(withRails([rail({ heightMm: 1500 })]))).not.toBe(geometryFp(one));
    expect(geometryFp(withRails([rail({ a: { x: -6, y: -2 } })]))).not.toBe(geometryFp(one));
    // ...and a project with NO rails keeps its key byte-identical, so existing
    // designs do not lose their captures over a feature they never used
    expect(geometryFp(none)).toBe(geometryFp({ ...none, rails: [] }));
    // the same must hold through shadingFp, which is what actually gates the run
    const located = (p: Project): Project => ({ ...p, location: locatedFixture.location });
    if (locatedFixture.location) {
      expect(shadingFp(located(one))).not.toBe(shadingFp(located(none)));
      expect(shadingFp(located(none))).not.toBe('');
    }
  });

  it('does not displace modules — a rail is a barrier, not a surface', () => {
    // deliberate: the fill does not avoid rails either, and removing modules
    // here without matching avoidance in layout.ts would re-create exactly the
    // inconsistency the walkway resolver removed
    const p = { ...withRails([rail()]), panels: fixtureProject(8).panels };
    const before = p.panels.filter((m) => m.enabled).length;
    expect(before).toBeGreaterThan(0);
    const after = buildShadowCasters(p).meshes;
    expect(p.panels.filter((m) => m.enabled).length).toBe(before);
    expect(after.length).toBeGreaterThan(0);
  });
});
