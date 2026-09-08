// ─── Mesh decimation for the obstruction props (RESLINK-GAP-REPORT item #54) ──
//
// The six prop GLBs shipped as raw photogrammetry scans: 4.77 MILLION triangles
// and 169 MB for objects that render maybe 100 px across on a rooftop. A single
// turbine vent was 1,128,385 triangles and 39 MB. That is the whole 3D studio's
// first-load budget spent on props nobody looks at closely.
//
// This collapses the triangle count with meshoptimizer (already a dependency)
// and leaves everything else — materials, textures, image bytes, the node graph
// — byte-for-byte alone.
//
// WHAT IT WILL NOT DO
//   · touch the images. They are 2048² JPEG, which is inside the rule the
//     obstruction README already sets ("ideally 1K or 2K"), and re-encoding them
//     needs an image library this repo does not have. After decimation the
//     textures ARE the remaining weight; that is the next thing to look at.
//   · handle anything but a single triangle-list primitive. Every current prop
//     is one mesh, one primitive, one material — the script asserts that rather
//     than quietly mangling a file that is not.
//
// THE BOUNDING BOX IS LOAD-BEARING. three/ObstructionMesh.tsx carries hardcoded
// reference dimensions (TANK_REF, CHIMNEY_REF, DISH_REF, SOLAR_WH_REF,
// TURBINE_VENT_REF, TREE_REF) and scales each prop from them to the surveyed
// size. If decimation moves the box, those constants are wrong and every prop
// draws the wrong size. So the script prints the box before and after, and the
// drift, on every run — check it.
//
// Usage:
//   node scripts/decimate-glb.mjs --check           report only, write nothing
//   node scripts/decimate-glb.mjs                   rewrite the props in place
//   node scripts/decimate-glb.mjs --only tank,dish  a subset
import { readFileSync, writeFileSync } from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/**
 * Triangle budget per prop.
 *
 * Chosen from how large each object actually draws: a vent, a dish or a tank is
 * a smooth manufactured shape a few hundred pixels across at most, and its
 * detail lives in the 2K texture, not the mesh. The tree gets more because
 * foliage is genuinely high-frequency geometry and reads as a blob below it.
 */
const BUDGET = {
  'turbine-vent': 8000,
  chimney: 6000,
  tank: 5000,
  dish: 5000,
  'solar-wh': 8000,
  tree: 20000,
};

const COMPONENT = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function parseGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`not a GLB: ${path}`);
  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8'));
    else if (type === CHUNK_BIN) bin = data;
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json || !bin) throw new Error(`GLB missing a chunk: ${path}`);
  return { json, bin, bytes: buf.length };
}

/** An accessor's data as a flat typed array. Interleaved bufferViews are de-interleaved. */
function readAccessor(json, bin, index) {
  const acc = json.accessors[index];
  const comp = COMPONENT[acc.componentType];
  const n = NUM_COMPONENTS[acc.type];
  const out = new comp.array(acc.count * n);
  const view = json.bufferViews[acc.bufferView];
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const stride = view.byteStride ?? comp.size * n;
  for (let i = 0; i < acc.count; i++) {
    const at = base + i * stride;
    for (let c = 0; c < n; c++) {
      const o = at + c * comp.size;
      switch (acc.componentType) {
        case 5120: out[i * n + c] = bin.readInt8(o); break;
        case 5121: out[i * n + c] = bin.readUInt8(o); break;
        case 5122: out[i * n + c] = bin.readInt16LE(o); break;
        case 5123: out[i * n + c] = bin.readUInt16LE(o); break;
        case 5125: out[i * n + c] = bin.readUInt32LE(o); break;
        case 5126: out[i * n + c] = bin.readFloatLE(o); break;
        default: throw new Error(`componentType ${acc.componentType}`);
      }
    }
  }
  return { data: out, n, componentType: acc.componentType, normalized: !!acc.normalized, type: acc.type };
}

function boundingBox(positions) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c];
      if (v < lo[c]) lo[c] = v;
      if (v > hi[c]) hi[c] = v;
    }
  }
  return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}

const f5 = (v) => v.toFixed(5);
const mb = (v) => `${(v / 1048576).toFixed(1)} MB`;

async function decimate(path, name, budget, write) {
  const { json, bin, bytes } = parseGlb(path);

  if ((json.meshes?.length ?? 0) !== 1) throw new Error(`${name}: expected 1 mesh, got ${json.meshes?.length}`);
  if (json.meshes[0].primitives.length !== 1) throw new Error(`${name}: expected 1 primitive`);
  const prim = json.meshes[0].primitives[0];
  if (prim.mode != null && prim.mode !== 4) throw new Error(`${name}: not a triangle list (mode ${prim.mode})`);
  if (prim.targets) throw new Error(`${name}: morph targets are not handled`);
  if (json.animations?.length) throw new Error(`${name}: animations are not handled`);
  if (prim.indices == null) throw new Error(`${name}: non-indexed geometry is not handled`);

  // ── read every attribute, and the indices ──
  const attrs = {};
  for (const [key, accIdx] of Object.entries(prim.attributes)) attrs[key] = readAccessor(json, bin, accIdx);
  const positions = attrs.POSITION.data;
  const vertexCount = positions.length / 3;
  const indices = Uint32Array.from(readAccessor(json, bin, prim.indices).data);
  const beforeTris = indices.length / 3;
  const beforeBox = boundingBox(positions);

  // NOT IDEMPOTENT. A second pass decimates the already-decimated mesh — the
  // props in this repo are the OUTPUT of this script, so re-running it without
  // this guard would quietly grind them down every time. Skip anything already
  // at or near its budget; --force is there for a deliberate re-cut.
  if (beforeTris <= budget * 6 && !process.argv.includes('--force')) {
    console.log(`\n=== ${name}`);
    console.log(`  ${beforeTris.toLocaleString()} triangles — already decimated, skipping (--force to re-cut)`);
    return { before: bytes, after: bytes, driftPct: [0, 0, 0], skipped: true };
  }

  // ── simplify, steering by normal and UV as well as position ──
  // Position alone would collapse a UV seam and smear the texture across it,
  // and on a photogrammetry prop the texture is where all the detail lives.
  await MeshoptSimplifier.ready;
  const normals = attrs.NORMAL?.data;
  const uvs = attrs.TEXCOORD_0?.data;
  const attrStride = (normals ? 3 : 0) + (uvs ? 2 : 0);
  let simplified;
  if (attrStride > 0) {
    const packed = new Float32Array(vertexCount * attrStride);
    for (let i = 0; i < vertexCount; i++) {
      let o = i * attrStride;
      if (normals) { packed[o++] = normals[i * 3]; packed[o++] = normals[i * 3 + 1]; packed[o++] = normals[i * 3 + 2]; }
      if (uvs) { packed[o++] = uvs[i * 2]; packed[o++] = uvs[i * 2 + 1]; }
    }
    const weights = [];
    if (normals) weights.push(0.2, 0.2, 0.2);
    if (uvs) weights.push(0.5, 0.5);
    simplified = MeshoptSimplifier.simplifyWithAttributes(
      indices, positions, 3, packed, attrStride, weights, null, budget * 3, 1.0, ['LockBorder'],
    );
  } else {
    simplified = MeshoptSimplifier.simplify(indices, positions, 3, budget * 3, 1.0, ['LockBorder']);
  }
  const [newIndices, error] = simplified;

  // ── drop the vertices nothing references any more ──
  // Without this the triangle count falls but the FILE does not: on these props
  // the vertex attributes are the majority of the bytes.
  const [remap, uniqueVerts] = MeshoptSimplifier.compactMesh(newIndices);
  const gathered = {};
  for (const [key, a] of Object.entries(attrs)) {
    const out = new COMPONENT[a.componentType].array(uniqueVerts * a.n);
    for (let i = 0; i < remap.length; i++) {
      const to = remap[i];
      if (to === 0xffffffff) continue;
      for (let c = 0; c < a.n; c++) out[to * a.n + c] = a.data[i * a.n + c];
    }
    gathered[key] = { ...a, data: out };
  }
  // ── put the authored bounding box back, exactly ──
  //
  // Simplification removes the extreme vertices along with everything else, so
  // the box shrinks a little — up to 2 % on the tree. That is not cosmetic:
  // ObstructionMesh scales every prop by `heightM` on the promise that the asset
  // is EXACTLY 1 m tall with its origin at Y=0, and divides the surveyed length
  // by a hardcoded *_REF footprint. three/__tests__/obstruction-assets.test.ts
  // asserts both to three decimals, and it is right to.
  //
  // So rescale per axis back onto the original box. The correction is under 2 %
  // and it restores the silhouette the simplifier trimmed, rather than leaving
  // every prop of that type slightly undersized on a real roof.
  //
  // The NORMALS are deliberately not corrected for it. A non-uniform scale skews
  // normals in principle, but at 2 % anisotropy the worst-case error is around a
  // degree — below what any shading here can show, and well below the error the
  // simplification itself introduced. Correcting them would mean re-normalising
  // by the inverse-transpose and re-quantising, for nothing visible.
  const shrunk = boundingBox(gathered.POSITION.data);
  const driftPct = shrunk.size.map((s, i) => (beforeBox.size[i] ? (100 * (s - beforeBox.size[i])) / beforeBox.size[i] : 0));
  const pos = gathered.POSITION.data;
  for (let c = 0; c < 3; c++) {
    const span = shrunk.size[c];
    const k = span > 1e-9 ? beforeBox.size[c] / span : 1;
    for (let i = c; i < pos.length; i += 3) pos[i] = (pos[i] - shrunk.lo[c]) * k + beforeBox.lo[c];
  }
  const afterBox = boundingBox(pos);

  // ── rebuild the binary chunk: images verbatim, then the new mesh data ──
  const views = [];
  const chunks = [];
  let cursor = 0;
  const push = (buf, extra = {}) => {
    const pad = (4 - (cursor % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); cursor += pad; }
    chunks.push(buf);
    views.push({ buffer: 0, byteOffset: cursor, byteLength: buf.length, ...extra });
    cursor += buf.length;
    return views.length - 1;
  };

  const newImages = (json.images ?? []).map((im) => {
    const v = json.bufferViews[im.bufferView];
    const start = v.byteOffset ?? 0;
    return { ...im, bufferView: push(Buffer.from(bin.subarray(start, start + v.byteLength))) };
  });

  const accessors = [];
  const newAttributes = {};
  for (const [key, a] of Object.entries(gathered)) {
    const bv = push(Buffer.from(a.data.buffer, a.data.byteOffset, a.data.byteLength), { target: 34962 });
    const acc = { bufferView: bv, componentType: a.componentType, count: uniqueVerts, type: a.type };
    if (a.normalized) acc.normalized = true;
    if (key === 'POSITION') { acc.min = afterBox.lo.map(Number); acc.max = afterBox.hi.map(Number); }
    newAttributes[key] = accessors.push(acc) - 1;
  }
  // 16-bit indices whenever they fit — half the index bytes, for free
  const idx = uniqueVerts > 65535 ? new Uint32Array(newIndices) : new Uint16Array(newIndices);
  const idxView = push(Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength), { target: 34963 });
  const idxAcc = accessors.push({
    bufferView: idxView,
    componentType: uniqueVerts > 65535 ? 5125 : 5123,
    count: newIndices.length,
    type: 'SCALAR',
  }) - 1;

  const outJson = {
    ...json,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: cursor }],
    images: newImages,
    meshes: [{ ...json.meshes[0], primitives: [{ ...prim, attributes: newAttributes, indices: idxAcc }] }],
  };
  // extensionsUsed / extensionsRequired are carried through by the spread above,
  // and MUST be: tree.glb declares EXT_texture_webp as REQUIRED, and its texture
  // objects reach their image through that extension. Drop the declaration and
  // the tree loads untextured.

  const jsonBuf = Buffer.from(JSON.stringify(outJson), 'utf8');
  const jsonPad = Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20);
  const binBuf = Buffer.concat(chunks);
  const binPad = Buffer.alloc((4 - (binBuf.length % 4)) % 4);
  const total = 12 + 8 + jsonBuf.length + jsonPad.length + 8 + binBuf.length + binPad.length;
  const head = Buffer.alloc(12);
  head.writeUInt32LE(GLB_MAGIC, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length + jsonPad.length, 0); jh.writeUInt32LE(CHUNK_JSON, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(binBuf.length + binPad.length, 0); bh.writeUInt32LE(CHUNK_BIN, 4);
  const out = Buffer.concat([head, jh, jsonBuf, jsonPad, bh, binBuf, binPad]);

  console.log(`\n=== ${name}`);
  console.log(`  triangles  ${beforeTris.toLocaleString().padStart(11)} → ${(newIndices.length / 3).toLocaleString().padStart(9)}   (${(100 - (100 * newIndices.length) / indices.length).toFixed(1)}% fewer)`);
  console.log(`  vertices   ${vertexCount.toLocaleString().padStart(11)} → ${uniqueVerts.toLocaleString().padStart(9)}`);
  console.log(`  file       ${mb(bytes).padStart(11)} → ${mb(out.length).padStart(9)}   (${(100 - (100 * out.length) / bytes).toFixed(1)}% smaller)`);
  console.log(`  geometric error ${error.toExponential(2)} of mesh scale`);
  console.log(`  box shrank by  x ${driftPct[0].toFixed(3)}%  y ${driftPct[1].toFixed(3)}%  z ${driftPct[2].toFixed(3)}%  — then rescaled back`);
  const residual = afterBox.size.map((s, i) => Math.abs(s - beforeBox.size[i]));
  const originOff = Math.abs(afterBox.lo[1] - beforeBox.lo[1]);
  console.log(`  box now  ${f5(afterBox.size[0])} × ${f5(afterBox.size[1])} × ${f5(afterBox.size[2])}   (was ${f5(beforeBox.size[0])} × ${f5(beforeBox.size[1])} × ${f5(beforeBox.size[2])})`);
  console.log(`  residual ${residual.map((r) => r.toExponential(1)).join(' / ')}   base Y off by ${originOff.toExponential(1)}`);

  if (write) {
    writeFileSync(path, out);
    console.log(`  WROTE ${path}`);
  }
  return { before: bytes, after: out.length, driftPct };
}

const args = process.argv.slice(2);
const write = !args.includes('--check');
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? args[onlyArg + 1].split(',') : null;

const targets = Object.entries(BUDGET)
  .filter(([name]) => !only || only.includes(name))
  .map(([name, budget]) => ({ name, budget, path: `public/models/obstructions/${name}/${name}.glb` }));

let before = 0;
let after = 0;
let worstDrift = 0;
for (const t of targets) {
  const r = await decimate(t.path, t.name, t.budget, write);
  before += r.before;
  after += r.after;
  worstDrift = Math.max(worstDrift, ...r.driftPct.map(Math.abs));
}
console.log(`\nTOTAL ${mb(before)} → ${mb(after)}  (${(100 - (100 * after) / before).toFixed(1)}% smaller)`);
console.log(`Worst shrink before the rescale, on any axis: ${worstDrift.toFixed(3)}%`);
console.log(write ? 'Files rewritten.' : 'Nothing written (--check).');
