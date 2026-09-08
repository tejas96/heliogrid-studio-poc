// ─── Foundation assemblies, instanced (Phase 22k) ───────────────────────────
// Until now NOTHING under a leg was drawn: StructureInstanced iterates
// `members` only and never touched `nodes`, so a table appeared to stand on
// nothing. Worse, the rooftop default foundation is a bare 8 mm base plate, so
// even drawing nodes would have left the base looking empty — which is why the
// default moves to a cast pedestal (plan D12) alongside this renderer.
//
// The foundation KIND is derived from the node's own `fastenerSpec`, which
// already exists and is already what the BOM counts (§A0 — one source, and the
// model can't disagree with the quote).
//
// ⚠️ Every dimension here is ASSUMED, from rule config. Pedestal size follows
// from wind uplift and overturning, which this app does not calculate (§F).
// Anything derived from it — concrete volume, added dead load — must carry that
// label wherever it is shown.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { tableYawRad, type SegmentStructure } from '../lib/structure';
import {
  foundationAssembly,
  foundationKindOfSpec,
  type FoundationPart,
} from '../lib/foundation';
import { nodeHardware } from '../lib/hardware';
import { getPanelMaterials } from './textures';

interface Placement {
  part: FoundationPart;
  /** node position in EN metres */
  at: { x: number; y: number; z: number };
  nodeId: string;
  /** rotation about three's Y that lays this part along its own table's rails */
  yaw: number;
}

const UP = new THREE.Vector3(0, 1, 0);

const PLAIN = new THREE.Color('#ffffff');
const LIT = new THREE.Color('#ffb454');

export function StructureNodesInstanced({
  structures,
  highlightIds,
}: {
  structures: SegmentStructure[];
  highlightIds?: ReadonlySet<string>;
}) {
  const { box, cylinder, concrete, steel } = useMemo(
    () => ({
      box: new THREE.BoxGeometry(1, 1, 1),
      cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
      // cast concrete: matte, non-metallic — reads as a different material from
      // the galvanised steel above it, which is the point of drawing it at all
      concrete: new THREE.MeshStandardMaterial({
        color: 0x9a9791,
        metalness: 0.02,
        roughness: 0.95,
      }),
      steel: getPanelMaterials().leg.clone(),
    }),
    [],
  );

  useEffect(
    () => () => {
      box.dispose();
      cylinder.dispose();
      concrete.dispose();
      steel.dispose();
    },
    [box, cylinder, concrete, steel],
  );

  // one bucket per (part bucket) — at most six, and a project uses ~3
  const buckets = useMemo(() => {
    const map = new Map<string, Placement[]>();
    for (const s of structures) {
      // one yaw per TABLE, not per node: a table is a rigid frame, so its
      // clamps cannot disagree with each other about which way the rail runs
      const yaw = tableYawRad(s);
      for (const node of s.nodes) {
        // A foundation for a leg base; plain hardware for every other joint.
        // Both yield the same part shape, so one loop places them all — and
        // `nodeHardware` returns [] for roof_anchor, so nothing is drawn twice.
        const parts =
          node.kind === 'roof_anchor'
            ? // kind comes from the node's own hardware; SHAPE from the
              // structure's resolved racking — one answer each, neither
              // re-derived here
              foundationAssembly(foundationKindOfSpec(node.fastenerSpec), s.foundationShape).parts
            : nodeHardware(node.kind);
        for (const part of parts) {
          const list = map.get(part.bucket) ?? [];
          list.push({ part, at: node.position, nodeId: node.id, yaw });
          map.set(part.bucket, list);
        }
      }
    }
    return [...map.entries()];
  }, [structures]);

  const meshes = useMemo(() => {
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const off = new THREE.Vector3();

    return buckets.map(([bucket, places]) => {
      const first = places[0].part;
      const geometry = first.geometry === 'cylinder' ? cylinder : box;
      const material =
        bucket === 'pedestal' || bucket === 'ballast' || bucket === 'grout' ? concrete : steel;
      const m = new THREE.InstancedMesh(geometry, material, places.length);
      places.forEach((p, i) => {
        // Turn the part to face along its own table's rails. This used to be a
        // never-assigned identity quaternion, so every clamp, plate and bolt
        // stood square to the WORLD while the steel it grips ran at the table's
        // azimuth — visible the moment you ghost the modules to inspect the
        // structure, which is the one thing that view exists for.
        q.setFromAxisAngle(UP, p.yaw);
        // the offset is in the assembly's own frame, so its horizontal part
        // turns with it; `offset.y` is height and never does
        off.set(p.part.offset.x, 0, p.part.offset.z).applyQuaternion(q);
        // EN(x east, y north, z up) → three.js (x, z, −y). The assembly's local
        // y = 0 sits at the roof surface under the leg, which is exactly where
        // the roof_anchor node is.
        pos.set(p.at.x + off.x, p.at.z + p.part.offset.y, -p.at.y + off.z);
        scl.set(p.part.size.x, p.part.size.y, p.part.size.z);
        mat.compose(pos, q, scl);
        m.setMatrixAt(i, mat);
        m.setColorAt(i, highlightIds?.has(p.nodeId) ? LIT : PLAIN);
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      return m;
    });
  }, [buckets, box, cylinder, concrete, steel, highlightIds]);

  useEffect(
    () => () => {
      for (const m of meshes) m.dispose();
    },
    [meshes],
  );

  if (meshes.length === 0) return null;
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}
