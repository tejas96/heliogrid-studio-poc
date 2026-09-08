// ─── Export the design as a .glb ────────────────────────────────────────────
// What a C&I client's architect asks for the moment the design is agreed: the
// building and the array as a model they can drop into their own scene.
// `GLTFExporter` ships inside the `three` we already depend on, so this is a
// wiring job, not a new capability — there was simply no way to reach it.
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/**
 * Things that must NOT travel in a customer's file.
 *
 * `real-surround` is Google's streamed 3D Tiles and `surround-relief` is the
 * Solar API height map. Both are THIRD-PARTY DATA under their own licences —
 * baking them into a file we hand a client would be redistributing someone
 * else's imagery, and they would dwarf the design in the bytes besides. The
 * neighbours' shadows are already in the numbers; their geometry is not ours
 * to give away.
 */
const EXCLUDED_NAMES = ['real-surround', 'surround-relief'];

/**
 * Editor chrome, which is a picture of the tool rather than of the design:
 * gizmo rings, the marquee, the sun path, drag ghosts, helpers. These are all
 * lines, sprites and points — the design itself is meshes — so the type is a
 * more reliable filter than trying to name every overlay component.
 */
function isChrome(o: THREE.Object3D): boolean {
  const t = o.type;
  return (
    t === 'Line' ||
    t === 'Line2' ||
    t === 'LineLoop' ||
    t === 'LineSegments' ||
    t === 'Points' ||
    t === 'Sprite' ||
    t.endsWith('Helper')
  );
}

/** Whether this subtree belongs in the exported model at all. */
function keep(o: THREE.Object3D): boolean {
  if (!o.visible) return false; // what you see is what you get
  if (EXCLUDED_NAMES.includes(o.name)) return false;
  if (o.userData?.noExport) return false;
  if (isChrome(o)) return false;
  return true;
}

/**
 * Everything worth exporting, gathered into a fresh group.
 *
 * A shallow prune of the real scene would mutate what the user is looking at,
 * and cloning the whole scene first would clone the tile cache with it. So walk
 * once and re-attach only the meshes that pass, cloned, at their WORLD transform
 * — the group hierarchy carries no meaning to the receiving application.
 */
export function collectExportable(scene: THREE.Object3D): THREE.Group {
  const out = new THREE.Group();
  out.name = 'HelioGrid design';
  scene.updateMatrixWorld(true);
  const walk = (o: THREE.Object3D) => {
    if (!keep(o)) return;
    if ((o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh) {
      const c = o.clone();
      // flatten: bake the world transform, drop the parent chain
      c.position.setFromMatrixPosition(o.matrixWorld);
      c.quaternion.setFromRotationMatrix(o.matrixWorld);
      c.scale.setFromMatrixScale(o.matrixWorld);
      c.children.length = 0;
      out.add(c);
    }
    o.children.forEach(walk);
  };
  scene.children.forEach(walk);
  return out;
}

/** How many meshes an export would contain — for the label, before committing. */
export function exportableCount(scene: THREE.Object3D): number {
  let n = 0;
  const walk = (o: THREE.Object3D) => {
    if (!keep(o)) return;
    if ((o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh) n += 1;
    o.children.forEach(walk);
  };
  scene.children.forEach(walk);
  return n;
}

/**
 * Write the design to a binary .glb and hand it to the browser as a download.
 * Binary rather than .gltf+bin because it is ONE file: an architect who is sent
 * two files loses one.
 */
export async function exportSceneGlb(scene: THREE.Object3D, filename: string): Promise<number> {
  const group = collectExportable(scene);
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    new GLTFExporter().parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('Expected a binary glTF'));
      },
      (err) => reject(err instanceof Error ? err : new Error(String(err))),
      { binary: true, onlyVisible: true },
    );
  });
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.glb') ? filename : `${filename}.glb`;
  a.click();
  URL.revokeObjectURL(url);
  return buffer.byteLength;
}

/** A filename that names the job, not "scene.glb" in everyone's downloads. */
export function glbFilename(projectName: string): string {
  const safe = projectName.replace(/[^\w\- ]+/g, '').trim() || 'design';
  return `${safe} — 3D model.glb`;
}
