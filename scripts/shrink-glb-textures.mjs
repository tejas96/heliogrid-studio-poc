// ─── Texture downscaling for the obstruction props (RESLINK-GAP-REPORT #11) ───
//
// The companion to scripts/decimate-glb.mjs. Once the meshes stopped being the
// problem (4.77M triangles and 169 MB → 148k and 38 MB), the TEXTURES became
// it: 86–96 % of every remaining byte is a 2048² JPEG, on props that draw a
// couple of hundred pixels wide on a rooftop.
//
// This resamples them to 1024², which is the size the obstruction README already
// asks for ("ideally 1K or 2K"), and re-encodes in the source's own format.
//
// WHAT IT TOUCHES AND WHAT IT DOES NOT
//   · ONLY the image bufferViews are rewritten. Every other bufferView — every
//     POSITION, NORMAL, TEXCOORD and index buffer — is copied BYTE FOR BYTE, so
//     the geometry this pass ships is bit-identical to the geometry the
//     decimation pass produced. Accessor byteOffsets are relative to their view,
//     so moving a view within the buffer cannot invalidate them.
//   · The glTF JSON keeps its accessors, meshes, materials, textures, nodes and
//     extension declarations. tree.glb's REQUIRED EXT_texture_webp survives, and
//     its webp images are re-encoded as webp, not silently turned into JPEG.
//
// NORMAL MAPS GET A HIGHER QUALITY. A normal map is not a picture, it is a
// vector field: JPEG chroma subsampling on one bends the lighting rather than
// blurring a detail. The script resolves which images are normal maps through
// materials[].normalTexture → textures[] → images[] and encodes those at 92 with
// subsampling off, everything else at 85.
//
// Usage:
//   node scripts/shrink-glb-textures.mjs --check     report only, write nothing
//   node scripts/shrink-glb-textures.mjs             rewrite the props in place
//   node scripts/shrink-glb-textures.mjs --max 512   a different edge budget
import { readFileSync, writeFileSync } from 'node:fs';

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error(
    'sharp is not installed. It normally arrives with next; run `npm install` first.\n' +
      'It is only needed by this script — nothing in src/ imports it.',
  );
  process.exit(1);
}

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const MODELS = ['turbine-vent', 'chimney', 'tank', 'dish', 'solar-wh', 'tree'];

/** Long edge, in pixels, that a prop texture is resampled to. */
const DEFAULT_MAX_EDGE = 1024;

/**
 * The encoder does not use a fixed quality — it MEASURES.
 *
 * A flat fixed quality is a guess that is wrong in both directions. At 85 the
 * detailed photogrammetry base colours (chimney brick, the solar heater's tank)
 * came out at 35.1 dB and 36.6 dB PSNR against a lossless resample — below the
 * ~38 dB where JPEG blocking starts to be visible — while the near-flat
 * roughness maps sailed past 70 dB and could have been squeezed much harder.
 *
 * So each image is encoded at rising quality until it clears its floor,
 * measured against the SAME image resampled losslessly. That isolates the
 * compression loss from the resolution loss and gives a number to check, rather
 * than a magic constant to trust.
 */
const PSNR_FLOOR = { colour: 40, normal: 42 };
const QUALITY_LADDER = [85, 90, 94, 97];

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

/** Image indices used as a normal map by any material. */
function normalMapImages(json) {
  const out = new Set();
  for (const m of json.materials ?? []) {
    const ti = m.normalTexture?.index;
    if (ti == null) continue;
    const t = json.textures?.[ti];
    const src = t?.source ?? t?.extensions?.EXT_texture_webp?.source;
    if (src != null) out.add(src);
  }
  return out;
}

const mb = (v) => `${(v / 1048576).toFixed(2)} MB`;

/** Peak signal-to-noise ratio over two equal-length raw byte planes, in dB. */
function psnr(a, b) {
  let se = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    se += d * d;
  }
  const mse = se / a.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

/**
 * Resample to `maxEdge` and encode at the lowest quality on the ladder that
 * still clears the PSNR floor for this image's role.
 *
 * `fit: 'inside'` keeps the aspect ratio — these are square in practice, but
 * stretching a non-square map would put every UV off its texel.
 */
async function encodeToFloor(src, maxEdge, isNormal, mime) {
  const resize = () => sharp(src).resize({ width: maxEdge, height: maxEdge, fit: 'inside', kernel: 'lanczos3' });
  const fmt = (mime ?? '').replace('image/', '');

  // PNG is lossless — there is nothing to tune, so encode once and report it.
  if (fmt === 'png') {
    const out = await resize().png({ compressionLevel: 9 }).toBuffer();
    return { out, quality: null, db: Infinity };
  }

  const reference = await resize().removeAlpha().raw().toBuffer();
  const floor = isNormal ? PSNR_FLOOR.normal : PSNR_FLOOR.colour;
  let last = null;
  for (const quality of QUALITY_LADDER) {
    const out =
      fmt === 'webp'
        ? await resize().webp({ quality }).toBuffer()
        : await resize()
            .jpeg({ quality, chromaSubsampling: isNormal ? '4:4:4' : '4:2:0', mozjpeg: true })
            .toBuffer();
    const db = psnr(reference, await sharp(out).removeAlpha().raw().toBuffer());
    last = { out, quality, db };
    if (db >= floor) return last;
  }
  return last; // ladder exhausted — report the number so it is visible, not silent
}

async function shrink(path, name, maxEdge, write) {
  const { json, bin, bytes } = parseGlb(path);
  const images = json.images ?? [];
  if (!images.length) {
    console.log(`\n=== ${name}\n  no embedded images — nothing to do`);
    return { before: bytes, after: bytes };
  }
  const normals = normalMapImages(json);

  // ── re-encode each image, keeping its own format ──
  const replacement = new Map(); // bufferView index -> Buffer
  const rows = [];
  for (const [i, im] of images.entries()) {
    if (im.bufferView == null) throw new Error(`${name}: image ${i} is a URI, not embedded`);
    const v = json.bufferViews[im.bufferView];
    const start = v.byteOffset ?? 0;
    const src = Buffer.from(bin.subarray(start, start + v.byteLength));
    const meta = await sharp(src).metadata();
    const isNormal = normals.has(i);
    const longest = Math.max(meta.width, meta.height);

    if (longest <= maxEdge) {
      rows.push({ i, from: `${meta.width}×${meta.height}`, to: '(unchanged)', before: src.length, after: src.length, role: isNormal ? 'normal' : 'colour', quality: null, db: null });
      continue;
    }

    const { out, quality, db } = await encodeToFloor(src, maxEdge, isNormal, im.mimeType ?? `image/${meta.format}`);
    replacement.set(im.bufferView, out);
    rows.push({ i, from: `${meta.width}×${meta.height}`, to: `${maxEdge}×${maxEdge}`, before: src.length, after: out.length, role: isNormal ? 'normal' : 'colour', quality, db });
  }

  // ── rebuild the binary chunk: every view copied verbatim except the images ──
  const chunks = [];
  const views = [];
  let cursor = 0;
  for (const [i, v] of json.bufferViews.entries()) {
    const swap = replacement.get(i);
    const src = swap ?? Buffer.from(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength));
    const pad = (4 - (cursor % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); cursor += pad; }
    chunks.push(src);
    // keep target/byteStride/name — only the position and length move
    views.push({ ...v, byteOffset: cursor, byteLength: src.length });
    cursor += src.length;
  }

  const outJson = { ...json, bufferViews: views, buffers: [{ ...(json.buffers?.[0] ?? {}), byteLength: cursor }] };
  delete outJson.buffers[0].uri;

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

  const imgBefore = rows.reduce((s, r) => s + r.before, 0);
  const imgAfter = rows.reduce((s, r) => s + r.after, 0);
  console.log(`\n=== ${name}`);
  let worst = Infinity;
  for (const r of rows) {
    if (r.db != null && r.db < worst) worst = r.db;
    const q = r.quality == null ? '' : ` q${r.quality}`;
    const db = r.db == null ? '' : r.db === Infinity ? '  lossless' : `  ${r.db.toFixed(1)} dB`;
    console.log(
      `  image ${r.i} ${r.role.padEnd(6)} ${r.from.padStart(9)} → ${r.to.padEnd(11)} ` +
        `${mb(r.before).padStart(8)} → ${mb(r.after).padStart(8)}${q.padEnd(5)}${db}`,
    );
  }
  if (worst !== Infinity) console.log(`  worst PSNR ${worst.toFixed(1)} dB (floor: colour ${PSNR_FLOOR.colour}, normal ${PSNR_FLOOR.normal})`);
  console.log(`  textures   ${mb(imgBefore)} → ${mb(imgAfter)}`);
  console.log(`  file       ${mb(bytes)} → ${mb(out.length)}   (${(100 - (100 * out.length) / bytes).toFixed(1)}% smaller)`);

  if (write) {
    writeFileSync(path, out);
    console.log(`  WROTE ${path}`);
  }
  return { before: bytes, after: out.length };
}

const args = process.argv.slice(2);
const write = !args.includes('--check');
const mi = args.indexOf('--max');
const maxEdge = mi >= 0 ? Number(args[mi + 1]) : DEFAULT_MAX_EDGE;
if (!Number.isFinite(maxEdge) || maxEdge < 64) throw new Error(`bad --max ${args[mi + 1]}`);

let before = 0;
let after = 0;
for (const name of MODELS) {
  const r = await shrink(`public/models/obstructions/${name}/${name}.glb`, name, maxEdge, write);
  before += r.before;
  after += r.after;
}
console.log(`\nTOTAL ${mb(before)} → ${mb(after)}  (${(100 - (100 * after) / before).toFixed(1)}% smaller)`);
console.log(write ? 'Files rewritten.' : 'Nothing written (--check).');
