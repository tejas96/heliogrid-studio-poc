// ─── All placed panels as THREE instanced draws ─────────────────────────────
// The per-panel <PanelMesh> tree cost ~3 draw calls + 2-3 objects per panel —
// a 500-panel commercial roof meant >1500 draw calls just for modules. This
// renders EVERY panel with at most 3 instanced meshes (glass, frame, legs),
// so draw-call count no longer scales with system size. Per-panel solar-access
// tint uses instanceColor; matrices reproduce PanelMesh's exact transform
// nesting: T(center) · Ry(yaw) · [Rx(−tilt) for the module | legs untilted].
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getPanelMaterials } from './textures';
import { panelInstanceMatrix } from '../lib/scene-frame';

export interface PanelInstance {
  id: string;
  position: [number, number, number];
  yawRad: number;
  tiltRad: number;
  /** module width along local x, meters */
  w: number;
  /** module depth along local z, meters */
  d: number;
  /** true = lies flat ON the surface (no legs, no tilt stand) */
  flush: boolean;
  /** false = a parametric structure renders the real legs — skip heuristics */
  legs?: boolean;
  /** solar access 0..1 (drives the access-view tint) */
  access: number;
}

function accessColor(access: number): THREE.Color {
  return new THREE.Color(access > 0.95 ? '#16a34a' : access > 0.85 ? '#ca8a04' : '#dc2626');
}

// The matrix moved to lib/scene-frame.ts so the one-frame gate can exercise
// the SAME composition the scene draws with, rather than a second copy of it
// that would be free to drift from the model alongside this one.
const composeInstance = panelInstanceMatrix;

export function PanelsInstanced({
  items,
  accessView,
  onPanelClick,
  ghost = false,
}: {
  items: PanelInstance[];
  accessView: boolean;
  /** §H on-object editing: reports the clicked panel (ignored while orbiting) */
  onPanelClick?: (panelId: string) => void;
  /**
   * Draw these modules translucent so the structure beneath reads (Phase 22l).
   *
   * Per-instance alpha is not available — one material serves the whole mesh —
   * so the CALLER partitions its panels and renders this component twice, once
   * plain and once ghosted. `partitionPanels` in lib/structure-view.ts owns
   * that split; here we only need to know which half we are.
   */
  ghost?: boolean;
}) {
  const mats = getPanelMaterials();

  // unit geometries, scaled per instance
  const boxGeom = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const legGeom = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 1, 10), []);
  const accessMat = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false }),
    [],
  );
  // Own material, not a mutated clone of the shared glass — mutating that would
  // turn every panel in the scene translucent.
  const ghostMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x8fb8e8,
        transparent: true,
        opacity: 0.22,
        depthWrite: false, // so structure behind it is not z-clipped away
        metalness: 0,
        roughness: 1,
      }),
    [],
  );
  useEffect(
    () => () => {
      boxGeom.dispose();
      legGeom.dispose();
      accessMat.dispose();
      ghostMat.dispose();
    },
    [boxGeom, legGeom, accessMat, ghostMat],
  );

  const legs = useMemo(
    () => items.filter((p) => !p.flush && p.tiltRad > 0.001 && (p.legs ?? true)),
    [items],
  );

  const { glassMesh, frameMesh, legMesh } = useMemo(() => {
    const m = new THREE.Matrix4();

    // module surface: photoreal glass, or flat access tint per instance
    const glassMesh = new THREE.InstancedMesh(
      boxGeom,
      ghost ? ghostMat : accessView ? accessMat : mats.glass,
      items.length,
    );
    glassMesh.renderOrder = ghost ? 2 : 0; // ghosts blend over the structure
    items.forEach((p, i) => {
      glassMesh.setMatrixAt(
        i,
        composeInstance(m, p, true, [0, accessView ? 0.02 : 0, 0], [p.w, 0.045, p.d]),
      );
      if (accessView) glassMesh.setColorAt(i, accessColor(p.access));
    });

    // aluminum frame — hidden in access view so gray doesn't wash the tint, and
    // hidden when ghosting because a solid frame outlines the very modules we
    // are trying to see past
    const frameMesh =
      accessView || ghost ? null : new THREE.InstancedMesh(boxGeom, mats.frame, items.length);
    if (frameMesh) {
      items.forEach((p, i) => {
        frameMesh.setMatrixAt(
          i,
          composeInstance(m, p, true, [0, -0.032, 0], [p.w + 0.04, 0.02, p.d + 0.04]),
        );
      });
    }

    // stand legs under the raised edge (elevated mounts only, 2 per panel)
    // heuristic legs are suppressed while ghosting: they belong to the modules
    // we are seeing past, and would clutter the real structure underneath
    const legMesh =
      legs.length > 0 && !ghost
        ? new THREE.InstancedMesh(legGeom, mats.leg, legs.length * 2)
        : null;
    if (legMesh) {
      legs.forEach((p, i) => {
        const legLen = 0.18 + Math.sin(p.tiltRad) * (p.d / 2);
        const legZ = (p.d / 2 - 0.1) * Math.cos(p.tiltRad);
        const legX = Math.max(0.1, p.w / 2 - 0.15);
        legMesh.setMatrixAt(
          i * 2,
          composeInstance(m, p, false, [-legX, legLen / 2 - 0.18, legZ], [1, legLen, 1]),
        );
        legMesh.setMatrixAt(
          i * 2 + 1,
          composeInstance(m, p, false, [legX, legLen / 2 - 0.18, legZ], [1, legLen, 1]),
        );
      });
    }

    for (const mesh of [glassMesh, frameMesh, legMesh]) {
      if (!mesh) continue;
      mesh.castShadow = true;
      mesh.receiveShadow = !accessView;
      // instances spread across the site — the unit-geometry bounds are wrong
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return { glassMesh, frameMesh, legMesh };
  }, [items, legs, accessView, ghost, boxGeom, legGeom, accessMat, ghostMat, mats]);

  // InstancedMesh allocates per-instance GPU buffers — always dispose the
  // mesh objects when a rebuild (or unmount) replaces them
  useEffect(
    () => () => {
      glassMesh.dispose();
      frameMesh?.dispose();
      legMesh?.dispose();
    },
    [glassMesh, frameMesh, legMesh],
  );

  const click =
    onPanelClick &&
    ((e: { instanceId?: number; delta: number; stopPropagation: () => void }) => {
      if (e.delta > 4 || e.instanceId == null) return; // drag, not a click
      e.stopPropagation();
      const it = items[e.instanceId];
      if (it) onPanelClick(it.id);
    });
  return (
    <>
      <primitive object={glassMesh} onClick={click} />
      {frameMesh && <primitive object={frameMesh} onClick={click} />}
      {legMesh && <primitive object={legMesh} />}
    </>
  );
}
