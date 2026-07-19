// ─── Parametric mounting structure, instanced (Phase 7, sections in 22k) ────
// Renders the member graph from lib/structure.ts — the graph is the OWNER
// (§A0); this component only draws it.
//
// Members are drawn with their REAL extruded cross-section (Phase 22k). Before,
// every member was a scaled unit box with two sizes (0.04 brace / 0.06 rest),
// so picking a C-channel changed the BOM and the spec string but the model kept
// showing a rectangle — the choice was invisible exactly where it should have
// been most legible.
//
// TWO CONSTRAINTS THIS FILE MUST HONOUR
//
//  1. Sections are extruded to UNIT length and stretched by scaling Y ONLY.
//     A box tolerates non-uniform scale; a C-channel does not — scale it across
//     the section and the web thins while the flanges stay put. See
//     three/profile-geometry.ts.
//  2. One geometry per PROFILE, shared across every member using it. Geometry
//     depends only on the section, not on the member kind, so bucketing by
//     profileKey (≤8) rather than by profile × kind (≤48) is both correct and
//     cheaper.
//
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
// reasoning expires and they must join the analytical set. Foundations sit
// UNDER the legs, well inside that envelope, so they inherit the same finding.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Member, SegmentStructure } from '../lib/structure';
import { profileByKey } from '../data/profiles';
import { cachedProfileGeometry } from './profile-geometry';
import { getPanelMaterials } from './textures';

/** Fallback half-size when a member's profile carries no `dims` (legacy). */
function fallbackSectionM(kind: Member['kind']): number {
  return kind === 'brace' ? 0.04 : 0.06;
}

const UP = new THREE.Vector3(0, 1, 0);
const PLAIN = new THREE.Color('#ffffff');
const LIT = new THREE.Color('#ffb454');

interface Bucket {
  geometry: THREE.BufferGeometry;
  /** true when the geometry is a real section (unit length) vs a unit box */
  sectioned: boolean;
  members: Member[];
  /** parallel to `members` — the segment each belongs to */
  segmentIds: string[];
}

export function StructureInstanced({
  structures,
  highlightIds,
  onMemberClick,
}: {
  structures: SegmentStructure[];
  /** member ids to tint — drives BOM↔3D focus (Phase 22n) */
  highlightIds?: ReadonlySet<string>;
  /** §H on-object editing: reports the clicked member AND its segment */
  onMemberClick?: (segmentId: string, memberId: string) => void;
}) {
  // The leg material is SHARED with the panel renderer. Clone it: this mesh
  // sets per-instance colour, and mutating a shared material to support that
  // would reach every panel leg in the scene.
  const material = useMemo(() => getPanelMaterials().leg.clone(), []);
  useEffect(() => () => material.dispose(), [material]);

  const fallbackBox = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  useEffect(() => () => fallbackBox.dispose(), [fallbackBox]);

  const buckets = useMemo(() => {
    const map = new Map<string, Bucket>();
    for (const s of structures) {
      for (const mem of s.members) {
        const profile = profileByKey(mem.profileKey);
        // legacy profiles carry no dims — fall back to the old box so an old
        // project still renders rather than disappearing
        const key = profile?.dims ? mem.profileKey : `box:${mem.kind}`;
        let b = map.get(key);
        if (!b) {
          b = {
            geometry: profile?.dims
              ? cachedProfileGeometry(mem.profileKey, profile.dims)
              : fallbackBox,
            sectioned: Boolean(profile?.dims),
            members: [],
            segmentIds: [],
          };
          map.set(key, b);
        }
        b.members.push(mem);
        b.segmentIds.push(s.segmentId);
      }
    }
    return [...map.values()];
  }, [structures, fallbackBox]);

  const meshes = useMemo(() => {
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const dir = new THREE.Vector3();

    return buckets.map((b) => {
      const m = new THREE.InstancedMesh(b.geometry, material, b.members.length);
      b.members.forEach((mem, i) => {
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
        // Real sections are already at true cross-section size and unit length,
        // so ONLY Y scales. The box fallback still scales all three.
        const s = b.sectioned ? 1 : fallbackSectionM(mem.kind);
        scl.set(s, len, s);
        mat.compose(pos, q, scl);
        m.setMatrixAt(i, mat);
        m.setColorAt(i, highlightIds?.has(mem.id) ? LIT : PLAIN);
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // instances spread beyond the geometry bounds
      return m;
    });
  }, [buckets, material, highlightIds]);

  // InstancedMesh allocates per-instance GPU buffers — always dispose. The
  // GEOMETRIES are cached and shared (see profile-geometry) so they are NOT
  // disposed here; the box fallback has its own effect above.
  useEffect(() => {
    return () => {
      for (const m of meshes) m.dispose();
    };
  }, [meshes]);

  if (meshes.length === 0) return null;

  return (
    <>
      {meshes.map((m, bi) => (
        <primitive
          key={bi}
          object={m}
          onClick={
            onMemberClick &&
            ((e: { instanceId?: number; delta: number; stopPropagation: () => void }) => {
              if (e.delta > 4 || e.instanceId == null) return;
              e.stopPropagation();
              const mem = buckets[bi].members[e.instanceId];
              const segId = buckets[bi].segmentIds[e.instanceId];
              // the member id used to be split back to a segment id and thrown
              // away; both are reported now so a click can focus one member
              if (mem) onMemberClick(segId, mem.id);
            })
          }
        />
      ))}
    </>
  );
}
