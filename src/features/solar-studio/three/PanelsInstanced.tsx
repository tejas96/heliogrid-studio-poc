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
import { accessHex } from '../lib/shade-ramp';
import type { PanelSpec } from '../types';

/** selected: warm brass — the design system's accent, multiplied over the glass */
const SELECTED = new THREE.Color('#ffc766');
/** hovered: a cool lift, clearly not the accent */
const HOVERED = new THREE.Color('#b8dcff');

/**
 * The dimmest a module's glass gets from soiling, as a fraction of clean.
 *
 * Soiling losses on an uncleaned Indian rooftop run a few per cent to well over
 * ten between washes, and no two modules in a row are ever equally dirty — the
 * one under the parapet's dust shadow, the one below the water tank's overflow
 * and the one in the open are visibly different surfaces. 0.90 is a restrained
 * spread: enough that a row stops reading as a printed pattern, not so much
 * that the array looks neglected.
 *
 * This is a LOOK, not a number anyone may act on. The energy model's soiling
 * assumption lives in the loss stack and is not read from here.
 */
const SOIL_FLOOR = 0.9;

/**
 * Deterministic per-module soiling tint.
 *
 * Keyed on the panel's own id, so a module keeps its own character across
 * reloads, camera moves and re-renders. A random() here would shimmer: the
 * instance colours are rewritten on every selection change.
 *
 * Dust is warm and it scatters blue first, so the tint leans red — a neutral
 * grey multiplier would read as underexposure rather than dirt.
 */
const soilCache = new Map<string, THREE.Color>();
function soilTint(id: string): THREE.Color {
  const hit = soilCache.get(id);
  if (hit) return hit;
  // FNV-1a over the id — stable, well spread, and no dependency
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const t = ((h >>> 0) % 10000) / 10000; // 0..1
  const v = SOIL_FLOOR + (1 - SOIL_FLOOR) * t;
  const c = new THREE.Color(v, v * 0.994, v * 0.982);
  soilCache.set(id, c);
  return c;
}

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

/**
 * The modules used to be painted in three flat steps while the legend beside
 * them drew a smooth gradient. Both now read the one scale in lib/shade-ramp.
 */
function accessColor(access: number): THREE.Color {
  return new THREE.Color(accessHex(access));
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
  const boxGeom = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    /**
     * A white per-vertex colour, so `vertexColors` can be switched on.
     *
     * This is the price of getting `instanceColor` into the fragment at all.
     * three declares the `vColor` varying in the VERTEX shader for
     * `USE_INSTANCING_COLOR`, but `color_pars_fragment` declares it — and
     * `color_fragment` multiplies it in — only for `USE_COLOR`, which comes
     * from `material.vertexColors`. So an InstancedMesh with a fully populated
     * `instanceColor` renders with those colours silently discarded unless the
     * material opts in.
     *
     * And `USE_COLOR` makes `color_vertex` do `vColor.rgb *= color`, reading a
     * `color` ATTRIBUTE. Turn the flag on without supplying one and it reads
     * (0,0,0): every module loses its whole diffuse and the array goes to flat
     * sky reflection with no cells on it. Measured, on the way to this fix.
     *
     * White here is the identity, so the instance colour passes through
     * untouched and nothing else changes.
     */
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    return g;
  }, []);
  const legGeom = useMemo(() => new THREE.CylinderGeometry(0.05, 0.05, 1, 10), []);
  // `vertexColors` is what lets `instanceColor` reach the fragment at all —
  // three declares the vColor varying for USE_INSTANCING_COLOR in the vertex
  // shader but only for USE_COLOR in the fragment. In THIS view the colour IS
  // the data (N6), so without it every module renders the same flat white and
  // the solar-access readout says nothing.
  const accessMat = useMemo(
    () => new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true }),
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

  /**
   * SIX materials for the module box, not one.
   *
   * A BoxGeometry carries six groups and its material index runs
   * `+X, −X, +Y, −Y, +Z, −Z`. Handed a single material, all six faces drew the
   * cell texture: the module's 45 mm EDGE showed a whole panel squashed into a
   * strip, and its underside showed cells where a mono-facial module has an
   * opaque white backsheet. Both are visible — the edge from any low camera
   * angle, the underside from walkthrough under a tilted table.
   *
   * Access view and ghosting still take ONE material each, on purpose: there
   * the flat colour IS the data, and a frame-coloured rim would read as a
   * value.
   */
  const faceMats = useMemo(
    () => ({
      portrait: [
        mats.frame,
        mats.frame,
        mats.glass.portrait,
        mats.back.portrait,
        mats.frame,
        mats.frame,
      ],
      landscape: [
        mats.frame,
        mats.frame,
        mats.glass.landscape,
        mats.back.landscape,
        mats.frame,
        mats.frame,
      ],
    }),
    [mats],
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
          ghost ? ghostMat : accessView ? accessMat : faceMats[o],
          list.length,
        );
        mesh.renderOrder = ghost ? 2 : 0; // ghosts blend over the structure
        list.forEach((p, i) => {
          mesh.setMatrixAt(
            i,
            composeInstance(m, p, true, [0, accessView ? 0.02 : 0, 0], [p.w, 0.045, p.d]),
          );
          // always allocate instanceColor: selection/hover tint it later without a
          // rebuild. Outside access view the resting colour is this module's own
          // soiling, which is what stops a row reading as one repeated sprite.
          mesh.setColorAt(i, accessView ? accessColor(p.access) : soilTint(p.id));
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
    // FOUR legs, front pair short and back pair tall — a tilted table stands on
    // a low front edge and a raised back one.
    //
    // This used to compute ONE `legZ` and reuse it for both instances, which
    // differed only in ±legX. So both legs sat under the SAME edge and the
    // module had no front support at all: it leaned on two posts under its high
    // side. It is also the first thing a user sees, because this heuristic
    // stand is what draws before the parametric structure resolves.
    const LEG_CLEARANCE_M = 0.18;
    const legMesh =
      legs.length > 0 && !ghost
        ? new THREE.InstancedMesh(legGeom, mats.leg, legs.length * 4)
        : null;
    if (legMesh) {
      legs.forEach((p, i) => {
        // the module centre sits at the clearance; the back edge is half the
        // depth × sin(tilt) above that and the front edge the same below
        const rise = Math.sin(p.tiltRad) * (p.d / 2);
        const backLen = LEG_CLEARANCE_M + rise;
        const frontLen = Math.max(0.06, LEG_CLEARANCE_M - rise);
        const legZ = (p.d / 2 - 0.1) * Math.cos(p.tiltRad);
        const legX = Math.max(0.1, p.w / 2 - 0.15);
        const put = (n: number, x: number, z: number, len: number) =>
          legMesh.setMatrixAt(
            n,
            composeInstance(m, p, false, [x, len / 2 - LEG_CLEARANCE_M, z], [1, len, 1]),
          );
        put(i * 4, -legX, legZ, backLen);
        put(i * 4 + 1, legX, legZ, backLen);
        put(i * 4 + 2, -legX, -legZ, frontLen);
        put(i * 4 + 3, legX, -legZ, frontLen);
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
  }, [items, legs, accessView, ghost, boxGeom, legGeom, accessMat, ghostMat, mats, faceMats]);

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
        // back to its OWN soiling when deselected, not to a flat white — this
        // path runs on every selection change and would otherwise scrub the
        // variation off the moment anything was clicked
        const c = selectedIds?.has(p.id) ? SELECTED : p.id === hoverId ? HOVERED : soilTint(p.id);
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
