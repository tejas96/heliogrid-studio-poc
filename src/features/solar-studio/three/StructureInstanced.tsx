// ─── Parametric mounting structure, instanced (Phase 7) ─────────────────────
// Renders the member graph from lib/structure.ts — the graph is the OWNER
// (§A0); this component only draws it. ONE InstancedMesh for every member
// (unit box scaled per member) keeps a 400-panel array at a single draw call.
// castShadow=true is VISUAL only — members never join buildShadowCasters, and
// that is a physics judgement, not an oversight (re-checked Phase 8, when the
// modules DID become analytical casters):
//   · every member of a table sits at or below its own module plane, and the
//     module overhangs them, so a member's shadow is contained by the shadow
//     the panel above it already casts — adding them would change no panel's
//     access, only the cost of the 288-sample raycast;
//   · where a table has holes (removed panels) the members do darken the ROOF
//     with nothing above them — but roof-surface shade is the heatmap's
//     question, and the heatmap deliberately excludes the array standing on it
//     (see buildShadowCasters). So nothing reads a number this could bias.
// If members ever extend BEYOND their modules (canopies, walkway frames), this
// reasoning expires and they must join the analytical set.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Member, SegmentStructure } from '../lib/structure';
import { getPanelMaterials } from './textures';

/** cross-section half-size per member kind (visual, meters) */
function sectionM(kind: Member['kind']): number {
  return kind === 'brace' ? 0.04 : 0.06;
}

const UP = new THREE.Vector3(0, 1, 0);

export function StructureInstanced({
  structures,
  onMemberClick,
}: {
  structures: SegmentStructure[];
  /** §H on-object editing: reports the clicked member's segment */
  onMemberClick?: (segmentId: string) => void;
}) {
  const { unitBox, material } = useMemo(
    () => ({
      unitBox: new THREE.BoxGeometry(1, 1, 1),
      material: getPanelMaterials().leg,
    }),
    [],
  );
  useEffect(() => () => unitBox.dispose(), [unitBox]);

  const mesh = useMemo(() => {
    const members = structures.flatMap((s) => s.members);
    if (members.length === 0) return null;
    const m = new THREE.InstancedMesh(unitBox, material, members.length);
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const dir = new THREE.Vector3();
    members.forEach((mem, i) => {
      // EN(x east, y north, z up) → three.js (x, z, −y). Members render at
      // their true axes; the MODULES are lifted by MODULE_STANDOFF_M instead
      // (see structure.ts) so rafter/purlin tops never pierce the glass.
      const ax = mem.a.x;
      const ay = mem.a.z;
      const az = -mem.a.y;
      const bx = mem.b.x;
      const by = mem.b.z;
      const bz = -mem.b.y;
      pos.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      dir.set(bx - ax, by - ay, bz - az);
      const len = Math.max(0.01, dir.length());
      q.setFromUnitVectors(UP, dir.normalize());
      const s = sectionM(mem.kind);
      scl.set(s, len, s);
      mat.compose(pos, q, scl);
      m.setMatrixAt(i, mat);
    });
    m.instanceMatrix.needsUpdate = true;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false; // instances spread beyond the unit-box bounds
    return m;
  }, [structures, unitBox, material]);

  // InstancedMesh allocates per-instance GPU buffers — always dispose
  useEffect(() => {
    return () => {
      mesh?.dispose();
    };
  }, [mesh]);

  const click =
    onMemberClick &&
    ((e: { instanceId?: number; delta: number; stopPropagation: () => void }) => {
      if (e.delta > 4 || e.instanceId == null) return;
      e.stopPropagation();
      const mem = structures.flatMap((st) => st.members)[e.instanceId];
      if (mem) onMemberClick(mem.id.split('/m/')[0]);
    });
  return mesh ? <primitive object={mesh} onClick={click} /> : null;
}
