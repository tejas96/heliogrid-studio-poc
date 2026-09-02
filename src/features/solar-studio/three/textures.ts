// ─── Shared 3D assets: photoreal module face + panel materials (module cache) ─
// One CanvasTexture per module spec and orientation is shared by every placed
// panel of that kind, so 150 panels cost a couple of texture uploads and a
// handful of GPU programs.
//
// The face is drawn from the DATASHEET, not from a stock picture: cell count
// from the module length (60 / 120 / 132 / 144 half-cut), cell colour and
// crystal structure from the cell technology, multi-busbar count from the
// technology, the half-cut centre gap, the anodised frame. Nothing here is a
// photo of some other module.
import * as THREE from 'three';
import type { PanelSpec } from '../types';

export type ModuleOrientation = 'portrait' | 'landscape';

// ── deterministic noise (seeded), so every reload draws the same module ──
function mulberry(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Layout {
  /** cells across the SHORT side */
  nShort: number;
  /** cells along the LONG side */
  nLong: number;
  halfCut: boolean;
  busbars: number;
  poly: boolean;
}

function layoutFor(spec: PanelSpec | null): Layout {
  const lengthMm = spec?.lengthMm ?? 2278;
  const poly = spec?.tech === 'Poly';
  const nLong = lengthMm >= 2200 ? 24 : lengthMm >= 2000 ? 22 : lengthMm >= 1650 ? 20 : 10;
  return { nShort: 6, nLong, halfCut: nLong >= 20, busbars: poly ? 5 : spec?.tech === 'HJT' ? 12 : 10, poly };
}

/**
 * Draw the module face into a canvas whose LONG axis is `long` px and short
 * axis `short` px, laid out so the long module edge runs along `landscape ?
 * width : height` of the canvas.
 */
function drawModuleFace(spec: PanelSpec | null, orientation: ModuleOrientation): HTMLCanvasElement {
  const L = 2048;
  const S = 1024;
  const landscape = orientation === 'landscape';
  const c = document.createElement('canvas');
  c.width = landscape ? L : S;
  c.height = landscape ? S : L;
  const ctx = c.getContext('2d')!;
  const rnd = mulberry(spec ? spec.id.length * 7919 + spec.watt : 12345);
  const lay = layoutFor(spec);

  // work in a (u along long axis, v along short axis) frame and map to canvas
  const px = (u: number, v: number): [number, number] => (landscape ? [u, v] : [v, u]);
  const rect = (u: number, v: number, du: number, dv: number) => {
    const [x, y] = px(u, v);
    if (landscape) ctx.fillRect(x, y, du, dv);
    else ctx.fillRect(x, y, dv, du);
  };

  // ── frame (anodised aluminium) — the box's sides borrow this edge ──
  const frameW = Math.round(S * 0.028); // ~30 mm on a 1.1 m short side
  const g = ctx.createLinearGradient(0, 0, c.width, c.height);
  g.addColorStop(0, '#d6d9de');
  g.addColorStop(0.5, '#b9bec6');
  g.addColorStop(1, '#cfd3d9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);

  // ── backsheet / glass margin inside the frame — white behind the cells, but
  // only 2–3 mm of it shows between cells, so keep it off-white, not paper ──
  const backsheet = lay.poly ? '#b3b9c2' : '#b8b8b8';
  ctx.fillStyle = backsheet;
  rect(frameW, frameW, L - 2 * frameW, S - 2 * frameW);
  // dark inner frame line
  ctx.fillStyle = '#6f7378';
  rect(frameW - 2, frameW - 2, L - 2 * frameW + 4, 2);
  rect(frameW - 2, S - frameW, L - 2 * frameW + 4, 2);
  rect(frameW - 2, frameW - 2, 2, S - 2 * frameW + 4);
  rect(L - frameW, frameW - 2, 2, S - 2 * frameW + 4);

  // ── cell lattice ──
  const margin = frameW + Math.round(S * 0.012);
  const gap = Math.max(2, Math.round(S * 0.0025)); // ~2.5 mm between cells
  const midGap = lay.halfCut ? Math.round(S * 0.012) : 0; // the half-cut centre gap
  const innerL = L - 2 * margin - midGap;
  const innerS = S - 2 * margin;
  const cellL = (innerL - gap * (lay.nLong - 1)) / lay.nLong;
  const cellS = (innerS - gap * (lay.nShort - 1)) / lay.nShort;
  const chamfer = lay.poly ? 0 : Math.min(cellL, cellS) * 0.07; // mono pseudo-square corners

  for (let i = 0; i < lay.nLong; i++) {
    for (let j = 0; j < lay.nShort; j++) {
      const u0 = margin + i * (cellL + gap) + (lay.halfCut && i >= lay.nLong / 2 ? midGap : 0);
      const v0 = margin + j * (cellS + gap);
      const [x0, y0] = px(u0, v0);
      const w = landscape ? cellL : cellS;
      const h = landscape ? cellS : cellL;
      // cell body: near-black navy for mono/TOPCon/HJT, crystalline blue for poly,
      // with a per-cell tone wobble so the lattice does not read as a flat print
      const tone = (rnd() - 0.5) * 0.08;
      const base = lay.poly ? [30 + tone * 60, 63 + tone * 60, 134 + tone * 60] : [12 + tone * 20, 20 + tone * 20, 36 + tone * 30];
      ctx.fillStyle = `rgb(${base[0] | 0},${base[1] | 0},${base[2] | 0})`;
      ctx.beginPath();
      if (chamfer > 0) {
        ctx.moveTo(x0 + chamfer, y0);
        ctx.lineTo(x0 + w - chamfer, y0);
        ctx.lineTo(x0 + w, y0 + chamfer);
        ctx.lineTo(x0 + w, y0 + h - chamfer);
        ctx.lineTo(x0 + w - chamfer, y0 + h);
        ctx.lineTo(x0 + chamfer, y0 + h);
        ctx.lineTo(x0, y0 + h - chamfer);
        ctx.lineTo(x0, y0 + chamfer);
        ctx.closePath();
      } else {
        ctx.rect(x0, y0, w, h);
      }
      ctx.fill();
      // poly: crystal flakes
      if (lay.poly) {
        ctx.save();
        ctx.clip();
        for (let k = 0; k < 28; k++) {
          const fx = x0 + rnd() * w;
          const fy = y0 + rnd() * h;
          const fr = 6 + rnd() * 22;
          ctx.fillStyle = `rgba(${90 + rnd() * 60 | 0},${120 + rnd() * 60 | 0},${200 + rnd() * 40 | 0},${0.08 + rnd() * 0.1})`;
          ctx.beginPath();
          ctx.moveTo(fx + fr, fy);
          for (let s = 1; s < 5; s++) {
            const a = (s / 5) * Math.PI * 2;
            ctx.lineTo(fx + Math.cos(a) * fr * (0.6 + rnd() * 0.6), fy + Math.sin(a) * fr * (0.6 + rnd() * 0.6));
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      // fingers: fine collector lines ACROSS the busbars (perpendicular to the
      // long axis). Faint on purpose: from a few metres a real module reads
      // near-black, and a mipmap averages every bright line into grey.
      ctx.fillStyle = 'rgba(150,160,178,0.05)';
      const fingerStep = 5;
      if (landscape) for (let fx = x0 + 3; fx < x0 + w - 2; fx += fingerStep) ctx.fillRect(fx, y0 + 1, 1, h - 2);
      else for (let fy = y0 + 3; fy < y0 + h - 2; fy += fingerStep) ctx.fillRect(x0 + 1, fy, w - 2, 1);
      // busbars: 0.7 mm ribbons ALONG the long axis — one texel, half-bright
      ctx.fillStyle = 'rgba(190,196,206,0.5)';
      for (let b = 0; b < lay.busbars; b++) {
        const t = (b + 0.5) / lay.busbars;
        if (landscape) ctx.fillRect(x0 + 1, Math.round(y0 + t * h), w - 2, 1);
        else ctx.fillRect(Math.round(x0 + t * w), y0 + 1, 1, h - 2);
      }
    }
  }

  // ── glass: a soft diagonal sheen and a faint anti-reflective blue cast ──
  const sheen = ctx.createLinearGradient(0, 0, c.width, c.height);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  sheen.addColorStop(1, 'rgba(120,160,220,0.06)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

const faceCache = new Map<string, THREE.CanvasTexture>();

/** Photoreal module face for this spec and orientation (cached). */
export function getModuleTexture(spec: PanelSpec | null, orientation: ModuleOrientation): THREE.CanvasTexture {
  const key = `${spec?.id ?? 'default'}|${spec?.tech ?? ''}|${spec?.lengthMm ?? 0}|${orientation}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(drawModuleFace(spec, orientation));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  faceCache.set(key, tex);
  return tex;
}

/** Back-compat alias — the old flat grid is gone; this is the default-spec landscape face. */
export function getCellGridTexture(): THREE.CanvasTexture {
  return getModuleTexture(null, 'landscape');
}

export interface PanelMaterials {
  glass: Record<ModuleOrientation, THREE.MeshPhysicalMaterial>;
  frame: THREE.MeshStandardMaterial;
  leg: THREE.MeshStandardMaterial;
}

const matCache = new Map<string, PanelMaterials>();
let sharedFrame: THREE.MeshStandardMaterial | null = null;
let sharedLeg: THREE.MeshStandardMaterial | null = null;

/** Shared glass (per orientation) / aluminium-frame / stand-leg materials for placed panels. */
export function getPanelMaterials(spec: PanelSpec | null = null): PanelMaterials {
  const key = `${spec?.id ?? 'default'}|${spec?.tech ?? ''}|${spec?.lengthMm ?? 0}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  sharedFrame ??= new THREE.MeshStandardMaterial({ color: '#cfd3d9', metalness: 0.85, roughness: 0.3, envMapIntensity: 1 });
  sharedLeg ??= new THREE.MeshStandardMaterial({ color: '#a3a9b1', metalness: 0.75, roughness: 0.38, envMapIntensity: 0.9 });
  const glassFor = (o: ModuleOrientation) =>
    // Tempered low-iron glass over the cells: a hard clearcoat that reflects
    // the environment map, low base roughness so the sky reads in it at
    // glancing angles, near-zero metalness (glass, not steel). The map carries
    // the cell colour, so the base colour stays white.
    // Anti-reflective glass reflects ~2–4 % head-on and only turns mirror-like
    // at grazing angles; a full-strength environment map made every module a
    // white mirror of the sky from the usual bird's-eye view.
    // Smooth glass: a TIGHT sun highlight (low roughness) instead of a broad
    // sheen that lit the whole array grey under an overhead sun.
    new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      metalness: 0.0,
      roughness: 0.08,
      clearcoat: 0.5,
      clearcoatRoughness: 0.06,
      // the environment's overhead light panel fills a module's whole mirror
      // image; at full strength every cell read as sky-grey
      envMapIntensity: 0.2,
      map: getModuleTexture(spec, o),
    });
  const mats: PanelMaterials = {
    glass: { portrait: glassFor('portrait'), landscape: glassFor('landscape') },
    frame: sharedFrame,
    leg: sharedLeg,
  };
  matCache.set(key, mats);
  return mats;
}
