// ─── All placed panels as THREE instanced draws ─────────────────────────────
// The per-panel <PanelMesh> tree cost ~3 draw calls + 2-3 objects per panel —
// a 500-panel commercial roof meant >1500 draw calls just for modules. This
// renders EVERY panel with at most 3 instanced meshes (glass, frame, legs),
// so draw-call count no longer scales with system size. Per-panel solar-access
// tint uses instanceColor; matrices reproduce PanelMesh's exact transform
// nesting: T(center) · Ry(yaw) · [Rx(−tilt) for the module | legs untilted].
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useCursor } from '@react-three/drei';
import { getPanelMaterials } from './textures';
import { panelInstanceMatrix } from '../lib/scene-frame';
import type { PanelSpec } from '../types';

const WHITE = new THREE.Color('#ffffff');
/** selected: warm brass — the design system's accent, multiplied over the glass */
const SELECTED = new THREE.Color('#ffc766');
/** hovered: a cool lift, clearly not the accent */
const HOVERED = new THREE.Color('#b8dcff');

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
  onPanelHover,
  selectedIds,
  hoverId = null,
  ghost = false,
  spec = null,
}: {
  items: PanelInstance[];
  accessView: boolean;
  /** the module datasheet the face texture is drawn from (cells, busbars, frame) */
  spec?: PanelSpec | null;
  /** §H on-object editing: reports the clicked panel (ignored while orbiting);
   *  `additive` = shift/ctrl held, the same multi-select gesture as the 2D editor */
  onPanelClick?: (panelId: string, additive: boolean) => void;
  /** null when the pointer leaves the modules */
  onPanelHover?: (panelId: string | null) => void;
  /** the editor's selection — tinted brass so 2D and 3D agree on what is picked */
  selectedIds?: ReadonlySet<string>;
  hoverId?: string | null;
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
  const mats = getPanelMaterials(spec);

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

  const { glassMeshes, frameMesh, legMesh } = useMemo(() => {
    const m = new THREE.Matrix4();

    // module surface: photoreal glass, or flat access tint per instance. The
    // face texture is drawn with the module's LONG edge along one axis, so
    // portrait and landscape modules get their own instanced mesh + material.
    const byOrientation = {
      portrait: items.filter((p) => p.w <= p.d),
      landscape: items.filter((p) => p.w > p.d),
    } as const;
    const glassMeshes = (['portrait', 'landscape'] as const)
      .filter((o) => byOrientation[o].length > 0)
      .map((o) => {
        const list = byOrientation[o];
        const mesh = new THREE.InstancedMesh(
          boxGeom,
          ghost ? ghostMat : accessView ? accessMat : mats.glass[o],
          list.length,
        );
        mesh.renderOrder = ghost ? 2 : 0; // ghosts blend over the structure
        list.forEach((p, i) => {
          mesh.setMatrixAt(
            i,
            composeInstance(m, p, true, [0, accessView ? 0.02 : 0, 0], [p.w, 0.045, p.d]),
          );
          // always allocate instanceColor: selection/hover tint it later without a rebuild
          mesh.setColorAt(i, accessView ? accessColor(p.access) : WHITE);
        });
        // the pick handlers map instanceId back through THIS list
        mesh.userData.items = list;
        return mesh;
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

    for (const mesh of [...glassMeshes, frameMesh, legMesh]) {
      if (!mesh) continue;
      mesh.castShadow = true;
      mesh.receiveShadow = !accessView;
      // instances spread across the site — the unit-geometry bounds are wrong
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return { glassMeshes, frameMesh, legMesh };
  }, [items, legs, accessView, ghost, boxGeom, legGeom, accessMat, ghostMat, mats]);

  // InstancedMesh allocates per-instance GPU buffers — always dispose the
  // mesh objects when a rebuild (or unmount) replaces them
  useEffect(
    () => () => {
      for (const g of glassMeshes) g.dispose();
      frameMesh?.dispose();
      legMesh?.dispose();
    },
    [glassMeshes, frameMesh, legMesh],
  );

  // Selection + hover tint: a per-instance colour write, never a rebuild. In
  // access view the tint is skipped — the colour IS the data there (N6).
  useEffect(() => {
    if (accessView || ghost) return;
    for (const mesh of glassMeshes) {
      if (!mesh.instanceColor) continue;
      const list = mesh.userData.items as PanelInstance[];
      list.forEach((p, i) => {
        const c = selectedIds?.has(p.id) ? SELECTED : p.id === hoverId ? HOVERED : WHITE;
        mesh.setColorAt(i, c);
      });
      mesh.instanceColor.needsUpdate = true;
    }
  }, [glassMeshes, selectedIds, hoverId, accessView, ghost]);

  // A tint alone is too faint on navy glass, so the picked modules also get a
  // HALO: an unlit brass (selected) / sky-blue (hovered) plate just above the
  // glass, the 3D twin of the 2D editor's selection outline. Rebuilt only when
  // the pick changes, and only as large as the pick.
  const haloMat = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false }),
    [],
  );
  useEffect(() => () => haloMat.dispose(), [haloMat]);
  const haloMesh = useMemo(() => {
    if (ghost) return null;
    const picked = items.filter((p) => selectedIds?.has(p.id) || p.id === hoverId);
    if (picked.length === 0) return null;
    const mesh = new THREE.InstancedMesh(boxGeom, haloMat, picked.length);
    const m = new THREE.Matrix4();
    picked.forEach((p, i) => {
      mesh.setMatrixAt(i, composeInstance(m, p, true, [0, 0.035, 0], [p.w + 0.08, 0.012, p.d + 0.08]));
      mesh.setColorAt(i, selectedIds?.has(p.id) ? SELECTED : HOVERED);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    return mesh;
  }, [items, selectedIds, hoverId, ghost, boxGeom, haloMat]);
  useEffect(() => () => haloMesh?.dispose(), [haloMesh]);

  useCursor(!!hoverId && !ghost, 'pointer', 'auto');

  type PickEvent = {
    instanceId?: number;
    delta: number;
    object: THREE.Object3D;
    stopPropagation: () => void;
    nativeEvent: MouseEvent | PointerEvent;
  };
  // the glass meshes carry their own instance list (split by orientation);
  // the frame mesh spans every module in `items` order
  const itemAt = (e: PickEvent) =>
    ((e.object.userData.items as PanelInstance[] | undefined) ?? items)[e.instanceId ?? -1];
  const click =
    onPanelClick &&
    ((e: PickEvent) => {
      if (e.delta > 4 || e.instanceId == null) return; // drag, not a click
      e.stopPropagation();
      const it = itemAt(e);
      if (it) onPanelClick(it.id, e.nativeEvent.shiftKey || e.nativeEvent.ctrlKey || e.nativeEvent.metaKey);
    });
  const move =
    onPanelHover &&
    ((e: PickEvent) => {
      if (e.instanceId == null) return;
      e.stopPropagation();
      const it = itemAt(e);
      if (it && it.id !== hoverId) onPanelHover(it.id);
    });
  const out = onPanelHover && (() => onPanelHover(null));
  return (
    <>
      {glassMeshes.map((g, i) => (
        <primitive key={i} object={g} onClick={click} onPointerMove={move} onPointerOut={out} />
      ))}
      {frameMesh && <primitive object={frameMesh} onClick={click} onPointerMove={move} onPointerOut={out} />}
      {legMesh && <primitive object={legMesh} />}
      {haloMesh && <primitive object={haloMesh} raycast={() => null} />}
    </>
  );
}
