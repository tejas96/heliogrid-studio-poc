import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildShadowCasters, buildParapetGeometries, disposeGroup } from '../scene-model';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import { CAPABILITY_PRESETS } from '../capabilities';
import type { Obstruction, Project } from '../../types';

function obstruction(over: Partial<Obstruction>): Obstruction {
  return {
    id: 'obs_1',
    type: 'tank',
    label: 'WT1',
    roofId: 'roof_1',
    center: { x: 2, y: 2 },
    shape: 'circle',
    lengthM: 0,
    widthM: 0,
    diameterM: 1.5,
    heightM: 1.2,
    rotationDeg: 0,
    setbackM: 0.3,
    castsShadow: true,
    blocksPlacement: true,
    ...over,
  };
}

describe('buildShadowCasters: the analytic caster set (parity gate)', () => {
  it('contains EXACTLY roofs + parapet bands + casting obstructions — nothing else', () => {
    const roofPlain = fixtureRoof();
    const roofParapet = fixtureRoof({
      id: 'roof_2',
      polygon: [
        { x: 20, y: -6 },
        { x: 32, y: -6 },
        { x: 32, y: 6 },
        { x: 20, y: 6 },
      ],
      parapet: {
        enabled: true,
        direction: 'inward',
        heightM: 1,
        widthM: 0.3,
        perEdge: null,
        suppressSharedEdges: true,
      },
    });
    const project: Project = {
      ...fixtureProject(4),
      roofs: [roofPlain, roofParapet],
      obstructions: [
        obstruction({ id: 'obs_cast', castsShadow: true }),
        obstruction({ id: 'obs_decor', castsShadow: false, center: { x: -4, y: -4 } }),
      ],
    };
    const bands = buildParapetGeometries(roofParapet, project.roofs).length;
    expect(bands).toBeGreaterThan(0);

    const { group, meshes } = buildShadowCasters(project);
    try {
      // 2 roof solids + parapet bands + ONE casting obstruction. The
      // castsShadow=false obstruction, walkways and decor buildings must NOT
      // be in the analytic set. Panels are absent BY DEFAULT — they join only
      // under { includePanels: true } (see the Tier-2 gates below).
      expect(meshes.length).toBe(2 + bands + 1);
    } finally {
      disposeGroup(group);
    }
  });

  it('includePanels adds ONE id-tagged slab per ENABLED panel (Tier-2)', () => {
    const project: Project = { ...fixtureProject(4), obstructions: [] };
    const disabled = {
      ...project,
      panels: project.panels.map((p, i) => (i === 0 ? { ...p, enabled: false } : p)),
    };
    const bare = buildShadowCasters(project);
    const withPanels = buildShadowCasters(project, { includePanels: true });
    const withDisabled = buildShadowCasters(disabled, { includePanels: true });
    try {
      expect(withPanels.meshes.length).toBe(bare.meshes.length + 4);
      // every added mesh carries its panel id — the engine excludes a panel's
      // own slab from its own rays by THIS tag (never by geometry epsilon)
      const tagged = withPanels.meshes.filter((m) => m.userData.panelId);
      expect(tagged.length).toBe(4);
      expect(new Set(tagged.map((m) => m.userData.panelId)).size).toBe(4);
      // a disabled panel produces no energy and no shadow
      expect(withDisabled.meshes.length).toBe(bare.meshes.length + 3);
    } finally {
      disposeGroup(bare.group);
      disposeGroup(withPanels.group);
      disposeGroup(withDisabled.group);
    }
  });

  it('the ROOF HEATMAP deliberately excludes panels (it answers a different question)', () => {
    // The heatmap asks "how much sun reaches this roof SURFACE" — a placement
    // question, answered before/independently of the array standing on it.
    // Counting the modules would paint their own footprint dark and make the
    // map useless for deciding where to put them. This asymmetry is a design
    // decision, not an oversight: pin it so it can't be "fixed" by accident.
    const project: Project = { ...fixtureProject(4), obstructions: [] };
    const { group, meshes } = buildShadowCasters(project); // exactly the heatmap's call
    try {
      expect(meshes.some((m) => m.userData.panelId)).toBe(false);
    } finally {
      disposeGroup(group);
    }
  });

  it('the CAPABILITY owns casting, not the legacy boolean (§A0 one source)', () => {
    // Regression: buildShadowCasters read `o.castsShadow` directly, so
    // `capabilities.castsAnalyticalShadow = false` was silently dead — the
    // object kept shading the design while the inspector claimed otherwise.
    const off: Project = {
      ...fixtureProject(4),
      obstructions: [
        obstruction({
          id: 'obs_quiet',
          castsShadow: true, // legacy boolean still says "cast"…
          capabilities: { ...CAPABILITY_PRESETS.tank, castsAnalyticalShadow: false }, // …capability says no
        }),
      ],
    };
    const on: Project = {
      ...off,
      obstructions: [
        obstruction({
          id: 'obs_quiet',
          castsShadow: false, // …and the inverse: legacy says no…
          capabilities: { ...CAPABILITY_PRESETS.tank, castsAnalyticalShadow: true }, // …capability says cast
        }),
      ],
    };
    const a = buildShadowCasters(off);
    const b = buildShadowCasters(on);
    try {
      expect(a.meshes.some((m) => m.userData.casterKind === 'obstruction')).toBe(false);
      expect(b.meshes.some((m) => m.userData.casterKind === 'obstruction')).toBe(true);
    } finally {
      disposeGroup(a.group);
      disposeGroup(b.group);
    }
  });

  it('legacy objects (no capabilities) still resolve from castsShadow', () => {
    const p: Project = {
      ...fixtureProject(4),
      obstructions: [obstruction({ id: 'obs_legacy', castsShadow: true })],
    };
    const { group, meshes } = buildShadowCasters(p);
    try {
      expect(meshes.some((m) => m.userData.casterKind === 'obstruction')).toBe(true);
    } finally {
      disposeGroup(group);
    }
  });

  it('raycast material is DoubleSide — backface hits (parapet inner walls) register', () => {
    const project: Project = { ...fixtureProject(4), obstructions: [obstruction({})] };
    const { group, meshes } = buildShadowCasters(project);
    try {
      for (const m of meshes) {
        const mat = (m as THREE.Mesh).material as THREE.Material;
        expect(mat.side).toBe(THREE.DoubleSide);
      }
    } finally {
      disposeGroup(group);
    }
  });

  it('a ray leaving THROUGH a caster from behind still intersects (the FrontSide bug)', () => {
    const project: Project = {
      ...fixtureProject(0),
      obstructions: [
        obstruction({ shape: 'rect', lengthM: 4, widthM: 4, heightM: 3, center: { x: 0, y: 0 } }),
      ],
    };
    const { group, meshes } = buildShadowCasters(project);
    try {
      void group;
      const ray = new THREE.Raycaster(
        // origin INSIDE the box volume (roof top 3m + half height): rays out
        // of it cross its walls from the inside = pure backface hits
        new THREE.Vector3(0, 4.2, 0),
        new THREE.Vector3(1, 0.2, 0).normalize(),
      );
      const boxMesh = meshes[meshes.length - 1];
      expect(ray.intersectObject(boxMesh, false).length).toBeGreaterThan(0);
    } finally {
      disposeGroup(group);
    }
  });
});
