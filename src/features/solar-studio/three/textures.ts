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

type ModuleOrientation = 'portrait' | 'landscape';

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
function getModuleTexture(spec: PanelSpec | null, orientation: ModuleOrientation): THREE.CanvasTexture {
  const key = `${spec?.id ?? 'default'}|${spec?.tech ?? ''}|${spec?.lengthMm ?? 0}|${orientation}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(drawModuleFace(spec, orientation));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  faceCache.set(key, tex);
  return tex;
}

/**
 * Tempered module glass is not optically flat.
 *
 * It comes off a float line and through a toughening furnace, and it keeps a
 * gentle long-wavelength waviness — tens of centimetres across, a few tens of
 * microns deep. You never see the glass itself; you see what it does to the
 * REFLECTION. On a real array the sky's reflection ripples and breaks up
 * between modules. On a perfectly flat plane it does not, which is most of why
 * a rendered array reads as plastic: every module mirrors the sky identically.
 *
 * So: one low-frequency height field, converted to a normal map, applied at a
 * deliberately tiny `normalScale`. It must be invisible as texture and visible
 * only as movement in the reflection.
 */
const GLASS_WAVE_N = 64;
/**
 * How hard the waviness bends the reflection.
 *
 * MEASURED against the same frame with the map off: 0.045 moved 0.04 % of the
 * pixels — an inert setting, the kind this file already carries a scar from —
 * 0.15 moved 3.5 %, 0.4 moved 12 % and 1.0 moved 20 %. 0.25 is the value that
 * is clearly doing something while the modules still read as flat glass rather
 * than dented panels.
 */
const GLASS_WAVE_SCALE = 0.25;
/**
 * How much a module's soiling roughens its glass, on top of dimming it.
 *
 * Dust does two things to a sheet of glass: it absorbs (which the per-module
 * tint in PanelsInstanced already does) and it SCATTERS, which a tint cannot
 * express. Without this the dirtiest module still mirrors the sky as sharply as
 * the cleanest one — the reflection gives the game away even when the albedo
 * does not.
 *
 * The soiling amount is read back out of the instance colour rather than
 * carried in a second instanced attribute: it is already there, already
 * per-module, and already deterministic.
 */
const SOIL_ROUGHNESS_GAIN = 0.5;
function glassWavinessTexture(): THREE.CanvasTexture {
  const N = GLASS_WAVE_N;
  const rnd = mulberry(20260909);
  // a few summed sine lobes: smooth, seamless-ish, and no octave noise needed
  // at this scale — waviness is long-wavelength by definition
  const lobes = Array.from({ length: 5 }, () => ({
    ax: (1 + Math.floor(rnd() * 3)) * Math.PI * 2,
    ay: (1 + Math.floor(rnd() * 3)) * Math.PI * 2,
    px: rnd() * Math.PI * 2,
    py: rnd() * Math.PI * 2,
    amp: 0.35 + rnd() * 0.65,
  }));
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N;
      const v = y / N;
      let s = 0;
      for (const l of lobes) s += l.amp * Math.sin(u * l.ax + l.px) * Math.sin(v * l.ay + l.py);
      h[y * N + x] = s;
    }
  }
  const c = document.createElement('canvas');
  c.width = N;
  c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  // central differences on a wrapping grid → tangent-space normal
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * 0.5;
      const ny = (at(x, y - 1) - at(x, y + 1)) * 0.5;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * N + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  return t;
}
let sharedWaviness: THREE.CanvasTexture | null = null;

export interface PanelMaterials {
  glass: Record<ModuleOrientation, THREE.MeshPhysicalMaterial>;
  /**
   * What the UNDERSIDE of the module box shows — an opaque white backsheet, or
   * the muted cells of a bifacial module's rear glass. Per orientation because
   * the bifacial one carries the same face map, which is orientation-specific.
   */
  back: Record<ModuleOrientation, THREE.MeshStandardMaterial>;
  frame: THREE.MeshStandardMaterial;
  leg: THREE.MeshStandardMaterial;
  /** the junction box on the module's back, and the DC tails leaving it */
  jbox: THREE.MeshStandardMaterial;
  cable: THREE.MeshStandardMaterial;
}

const matCache = new Map<string, PanelMaterials>();
let sharedFrame: THREE.MeshStandardMaterial | null = null;
let sharedLeg: THREE.MeshStandardMaterial | null = null;
let sharedBacksheet: THREE.MeshStandardMaterial | null = null;
let sharedJbox: THREE.MeshStandardMaterial | null = null;
let sharedCable: THREE.MeshStandardMaterial | null = null;

/** Shared glass (per orientation) / aluminium-frame / stand-leg materials for placed panels. */
export function getPanelMaterials(spec: PanelSpec | null = null): PanelMaterials {
  const key = `${spec?.id ?? 'default'}|${spec?.tech ?? ''}|${spec?.lengthMm ?? 0}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  sharedFrame ??= new THREE.MeshStandardMaterial({ color: '#cfd3d9', metalness: 0.85, roughness: 0.3, envMapIntensity: 1 });
  sharedLeg ??= new THREE.MeshStandardMaterial({ color: '#a3a9b1', metalness: 0.75, roughness: 0.38, envMapIntensity: 0.9 });
  // moulded PPO/PA junction box: matte black plastic, a shade lighter than the
  // cable so the two read as different parts at inspection zoom
  sharedJbox ??= new THREE.MeshStandardMaterial({ color: '#2b2c2e', metalness: 0, roughness: 0.72 });
  // XLPE DC lead: darker, and glossier because the sheath is smooth
  sharedCable ??= new THREE.MeshStandardMaterial({ color: '#191a1c', metalness: 0, roughness: 0.5 });
  // A mono-facial module's back is an opaque white polymer sheet, not glass:
  // no metalness, and rough enough that it never picks up a highlight.
  sharedBacksheet ??= new THREE.MeshStandardMaterial({ color: '#e7e9ec', metalness: 0, roughness: 0.9 });
  // A BIFACIAL module really does show its cells from below — through rear
  // glass, so dimmer and flatter than the front. `bifacialityPct` is the same
  // datasheet field lib/bifacial-check.ts prices the premium from, so the
  // picture and the quote cannot disagree about which module this is.
  const backFor = (o: ModuleOrientation) =>
    new THREE.MeshStandardMaterial({
      color: '#9aa1ab',
      metalness: 0,
      roughness: 0.35,
      map: getModuleTexture(spec, o),
    });
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
      // Was 0.2, to stop "every cell reading as sky-grey" against the old flat
      // slab environment.
      //
      // MEASURED 2026-09-09: this knob does NOTHING here, at any value. In this
      // three version `material.envMapIntensity` scales a material's OWN
      // `envMap`; a map inherited from `scene.environment` is scaled by
      // `scene.environmentIntensity` instead. Sampling the rendered glass at
      // 0.2, 1.0 and 20 gave byte-identical pixels, while changing this
      // material's colour or roughness moved them immediately. So the 0.2 was
      // never dimming anything — the real lever is in Scene3D.
      //
      // Left at the neutral 1.0 so it stops implying a control that is not
      // wired, and so it is already correct if this material is ever given its
      // own envMap.
      envMapIntensity: 1.0,
      map: getModuleTexture(spec, o),
      /**
       * WITHOUT THIS, `instanceColor` NEVER REACHES THE FRAGMENT.
       *
       * three declares the `vColor` varying in the VERTEX shader for
       * `USE_INSTANCING_COLOR`, but `color_pars_fragment` declares it — and
       * `color_fragment` multiplies it in — only for `USE_COLOR`, which is what
       * this flag sets. So an InstancedMesh with a fully populated
       * `instanceColor` renders with those colours silently discarded unless the
       * material opts in here.
       *
       * Measured 2026-09-09: flipping this on moved 34 % of the frame. Until
       * then `PanelsInstanced`'s per-module soiling, its brass SELECTED tint and
       * its hover tint were all being written to the buffer and thrown away —
       * clicking a module in the 3D scene highlighted nothing.
       *
       * This REQUIRES the geometry to carry a white `color` attribute; see the
       * note on `boxGeom` in PanelsInstanced. Without one, `color_vertex` reads
       * (0,0,0) and every module loses its diffuse entirely.
       */
      vertexColors: true,
      // the waviness that stops every module mirroring the sky identically —
      // see glassWavinessTexture. Kept tiny: it must read as movement in the
      // reflection, never as texture on the glass.
      normalMap: (sharedWaviness ??= glassWavinessTexture()),
      normalScale: new THREE.Vector2(GLASS_WAVE_SCALE, GLASS_WAVE_SCALE),
    });
  /**
   * Dust scatters as well as dims.
   *
   * `PanelsInstanced` gives every module its own soiling tint through
   * `instanceColor`, which three exposes to the fragment shader as `vColor`
   * under USE_INSTANCING_COLOR. Reading the shortfall back out of it costs
   * nothing and needs no second instanced attribute to keep in step.
   *
   * Guarded on the define, because the same cached material is also used by
   * meshes that carry no instance colour — without the guard those fail to
   * compile, and a material that will not compile takes the whole scene white.
   */
  const addSoilScatter = (m: THREE.MeshPhysicalMaterial) => {
    m.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
#ifdef USE_INSTANCING_COLOR
  // vColor.r is 1.0 for a clean module and ~0.9 for the dirtiest one
  roughnessFactor = clamp( roughnessFactor + ( 1.0 - vColor.r ) * ${SOIL_ROUGHNESS_GAIN.toFixed(2)}, 0.0, 1.0 );
#endif`,
      );
    };
    m.customProgramCacheKey = () => 'panelGlass:soilScatter';
    return m;
  };
  const mats: PanelMaterials = {
    glass: {
      portrait: addSoilScatter(glassFor('portrait')),
      landscape: addSoilScatter(glassFor('landscape')),
    },
    back: spec?.bifacialityPct
      ? { portrait: backFor('portrait'), landscape: backFor('landscape') }
      : { portrait: sharedBacksheet, landscape: sharedBacksheet },
    frame: sharedFrame,
    jbox: sharedJbox,
    cable: sharedCable,
    leg: sharedLeg,
  };
  matCache.set(key, mats);
  return mats;
}
