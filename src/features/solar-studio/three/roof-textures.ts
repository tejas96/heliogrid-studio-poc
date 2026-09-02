// ─── Roof coverings: procedural albedo + normal maps per roof type ───────────
// Drawn in WORLD units (the roof geometry carries plan-metre UVs), so a tile
// is a tile-sized tile and a sheet rib is 250 mm apart no matter how big the
// roof is. Concrete, colour-coated trapezoidal sheet and Mangalore clay tile
// are the three coverings the Indian market actually puts modules on.
import * as THREE from 'three';
import type { RoofType } from '../types';

export interface RoofSurface {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture | null;
  normalScale: number;
  roughness: number;
  metalness: number;
  /** colour multiplier over the map (the map is drawn at true albedo) */
  color: string;
}

function seeded(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Height field (0..1) → tangent-space normal map canvas. */
function normalFromHeight(h: Float32Array, w: number, hgt: number, strength: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, hgt);
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const l = h[y * w + ((x - 1 + w) % w)];
      const r = h[y * w + ((x + 1) % w)];
      const u = h[((y - 1 + hgt) % hgt) * w + x];
      const d = h[((y + 1) % hgt) * w + x];
      const nx = (l - r) * strength;
      const ny = (u - d) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function makeTex(c: HTMLCanvasElement, metresPerTile: number, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metresPerTile, 1 / metresPerTile);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ── RCC: weathered concrete, 4 m tile ──
function concrete(): RoofSurface {
  const N = 512;
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d')!;
  const rnd = seeded(101);
  ctx.fillStyle = '#b3aea5';
  ctx.fillRect(0, 0, N, N);
  // aggregate speckle + damp patches
  for (let i = 0; i < 9000; i++) {
    const v = 150 + rnd() * 60;
    ctx.fillStyle = `rgba(${v | 0},${(v - 4) | 0},${(v - 10) | 0},${0.25 + rnd() * 0.4})`;
    ctx.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  for (let i = 0; i < 26; i++) {
    const g = ctx.createRadialGradient(rnd() * N, rnd() * N, 0, 0, 0, 0);
    const x = rnd() * N;
    const y = rnd() * N;
    const r = 30 + rnd() * 90;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(60,58,52,${0.05 + rnd() * 0.12})`);
    gr.addColorStop(1, 'rgba(60,58,52,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    void g;
  }
  // a faint screed joint grid every 2 m
  ctx.strokeStyle = 'rgba(70,66,60,0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(N / 2, 0);
  ctx.lineTo(N / 2, N);
  ctx.moveTo(0, N / 2);
  ctx.lineTo(N, N / 2);
  ctx.stroke();
  // bump: fine noise
  const h = new Float32Array(N * N);
  const r2 = seeded(7);
  for (let i = 0; i < h.length; i++) h[i] = r2() * 0.5;
  return {
    map: makeTex(c, 4, true),
    normalMap: makeTex(normalFromHeight(h, N, N, 0.6), 4, false),
    normalScale: 0.35,
    roughness: 0.95,
    metalness: 0,
    color: '#ffffff',
  };
}

// ── colour-coated trapezoidal sheet: rib pitch 250 mm, 1 m tile ──
function metalSheet(): RoofSurface {
  const N = 512; // 1 m
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d')!;
  const rnd = seeded(31);
  ctx.fillStyle = '#c7ccd2'; // galvalume-grey coated sheet
  ctx.fillRect(0, 0, N, N);
  const pitch = N / 4; // 250 mm
  const h = new Float32Array(N * N);
  for (let x = 0; x < N; x++) {
    const t = (x % pitch) / pitch; // 0..1 across one rib pitch
    // trapezoid: flat 0..0.55, up-flank 0.55..0.65, crown 0.65..0.9, down-flank 0.9..1
    let z = 0;
    if (t < 0.55) z = 0;
    else if (t < 0.65) z = (t - 0.55) / 0.1;
    else if (t < 0.9) z = 1;
    else z = 1 - (t - 0.9) / 0.1;
    for (let y = 0; y < N; y++) h[y * N + x] = z;
    // shading in the albedo so the ribs read even without strong light
    const shade = z === 1 ? 6 : z === 0 ? 0 : t < 0.65 ? -18 : 12;
    ctx.fillStyle = `rgb(${199 + shade},${204 + shade},${210 + shade})`;
    ctx.fillRect(x, 0, 1, N);
  }
  // fixings every 1 m on crowns + light weathering streaks along the ribs
  for (let i = 0; i < 4; i++) {
    const cx = i * pitch + pitch * 0.775;
    ctx.fillStyle = '#8f949b';
    ctx.beginPath();
    ctx.arc(cx, N * 0.5, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `rgba(120,110,95,${0.03 + rnd() * 0.05})`;
    ctx.fillRect(rnd() * N, rnd() * N, 1, 4 + rnd() * 30);
  }
  return {
    map: makeTex(c, 1, true),
    normalMap: makeTex(normalFromHeight(h, N, N, 2.2), 1, false),
    normalScale: 0.9,
    roughness: 0.42,
    metalness: 0.55,
    color: '#ffffff',
  };
}

// ── Mangalore clay tiles: 420 × 260 mm, 1.68 × 1.56 m tile (4 × 6 tiles) ──
function clayTile(): RoofSurface {
  const W = 512;
  const H = 480;
  const cols = 4;
  const rows = 6;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const rnd = seeded(77);
  const tw = W / cols;
  const th = H / rows;
  const h = new Float32Array(W * H);
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const tone = (rnd() - 0.5) * 30;
      ctx.fillStyle = `rgb(${176 + tone | 0},${88 + tone * 0.6 | 0},${56 + tone * 0.4 | 0})`;
      ctx.fillRect(k * tw, r * th, tw, th);
      // overlap shadow at the tile's top edge and the interlocking ridge on the left
      const g = ctx.createLinearGradient(0, r * th, 0, r * th + th * 0.22);
      g.addColorStop(0, 'rgba(40,20,10,0.45)');
      g.addColorStop(1, 'rgba(40,20,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect(k * tw, r * th, tw, th * 0.22);
      ctx.fillStyle = 'rgba(255,220,190,0.18)';
      ctx.fillRect(k * tw + tw * 0.12, r * th, 3, th);
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const u = x / tw;
          const v = y / th;
          // curved profile across the tile + a step at the overlap
          const curve = 0.5 + 0.5 * Math.cos((u - 0.5) * Math.PI * 1.6);
          const z = curve * 0.8 + (v < 0.12 ? 0.6 : 0) - (v > 0.94 ? 0.5 : 0);
          h[(r * th + y | 0) * W + (k * tw + x | 0)] = z;
        }
      }
    }
  }
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = `rgba(60,40,30,${0.05 + rnd() * 0.15})`;
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const tex = makeTex(c, 1.68, true);
  tex.repeat.set(1 / 1.68, 1 / 1.56);
  const nm = makeTex(normalFromHeight(h, W, H, 1.6), 1.68, false);
  nm.repeat.set(1 / 1.68, 1 / 1.56);
  return { map: tex, normalMap: nm, normalScale: 0.8, roughness: 0.85, metalness: 0, color: '#ffffff' };
}

const cache = new Map<RoofType, RoofSurface | null>();

/** The covering for a roof type — null for 'ground' (no roof surface). */
export function getRoofSurface(type: RoofType): RoofSurface | null {
  if (cache.has(type)) return cache.get(type)!;
  let s: RoofSurface | null = null;
  if (type === 'rcc_flat') s = concrete();
  else if (type === 'metal_shed') s = metalSheet();
  else if (type === 'tile') s = clayTile();
  cache.set(type, s);
  return s;
}
