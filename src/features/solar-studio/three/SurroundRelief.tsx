// ─── The neighbourhood's real relief (Google Solar API height map) ──────────
// Google's Photorealistic 3D Tiles carry no building volumes in India: around
// an Indian site the streamed mesh is terrain with a photo draped over it. The
// neighbours the shade engine casts against (the Solar API height map,
// lib/surround) were therefore invisible in the picture. This draws THAT grid
// — the very samples the engine uses — as a relief: every cell that rises off
// the ground becomes a block whose walls reach below the terrain, textured
// with the satellite photo. What shades the design is what you see.
import { useEffect, useMemo, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Project } from '../types';
import { loadSurroundHeights, type SurroundHeights } from '../lib/surround';
import { cutSurroundForRoofs } from '../lib/surround-geometry';
import { metersPerStaticMap, staticSatelliteUrl } from '../lib/maps';

/** Cells lower than this are ground: the streamed terrain (or the photo plane) shows there. */
export const RELIEF_MIN_M = 0.5;
/** Walls run down to here so they meet the terrain wherever it lies (it varies a few metres). */
const SKIRT_Y = -4;
/** Sharp enough to read roofs and tree crowns; at scale 2 it spans ~180 m at Indian latitudes. */
const RELIEF_ZOOM = 19;
/** The photo does not reach the height map's outer band: stop the relief where the photo stops. */
const RELIEF_RADIUS_M = 88;
/** The photo is an exposed picture, not an albedo — same scaling as the ground plane. */
const PHOTO_TINT = '#767676';
/**
 * How steep a face must be before it counts as a WALL — the vertical side of a
 * block, where the photo can only smear.
 *
 * This used to be `smoothstep(0.35, 0.8)`, a band calibrated on a city: a
 * building has a flat roof (upness 1) and a vertical wall (upness 0), and
 * nothing in between. A height map of ordinary ground is not like that. Scrub,
 * a tree line, a field bund — sampled every half metre — is rough everywhere,
 * so most of its area landed inside that band. MEASURED on a farmland site
 * near Sangli: 49% of the relief's 8,722 m² was painted as wall and only 34%
 * kept the photo. Half the neighbourhood was rendered as flat grey.
 *
 * The surface is genuinely two-humped, and these thresholds sit in the trough:
 * 35% of its area is near-vertical (upness 0.1–0.2, the blocks' own sides),
 * 26% is flat top (0.9–1.0), and the 30% between the two is rough ground that
 * must keep its photo. Same site, new band: 76% photo.
 */
export const WALL_UPNESS_FULL = 0.05;
export const WALL_UPNESS_NONE = 0.3;
/**
 * What a wall does to the photo: DARKENS it. A vertical face sees about half
 * the sky a horizontal one does, so this is the physical answer — and, more
 * importantly, it makes it impossible for the relief to out-shine the map it
 * stands in. The old flat concrete (0.58) rendered 2.7× BRIGHTER than the same
 * face with the photo on it, which is why the height map read as a white mass
 * and flashed through every time the streamed photomesh thinned on a zoom.
 */
export const WALL_SHADE = 0.55;

function wallAwareMaterial(map: THREE.Texture): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ map, color: PHOTO_TINT, roughness: 1, metalness: 0, envMapIntensity: 0.15 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vUpness;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvUpness = objectNormal.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUpness;')
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  float wallness = 1.0 - smoothstep( ${WALL_UPNESS_FULL.toFixed(2)}, ${WALL_UPNESS_NONE.toFixed(2)}, vUpness );
  // the same ground seen edge on — never a different, brighter colour
  diffuseColor *= sampledDiffuseColor * mix( 1.0, ${WALL_SHADE.toFixed(2)}, wallness );
#endif`,
      );
  };
  return mat;
}

/**
 * Heightfield → relief geometry in scene coordinates (x = E, y = up, z = −N).
 * Only quads with at least one raised corner are kept; their ground corners
 * drop to the skirt so the block's wall continues under the terrain instead
 * of floating where the terrain dips. UVs put the satellite photo (centred on
 * the pin, `spanM` wide, north up) onto every face.
 */
export function buildRelief(g: SurroundHeights, spanM: number, radiusM = RELIEF_RADIUS_M): THREE.BufferGeometry | null {
  const { cols, rows, heights } = g;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const e = g.originEN.x + c * g.stepCol.x + r * g.stepRow.x;
      const n = g.originEN.y + c * g.stepCol.y + r * g.stepRow.y;
      const h = heights[i];
      pos[i * 3] = e;
      pos[i * 3 + 1] = h >= RELIEF_MIN_M ? h : SKIRT_Y;
      pos[i * 3 + 2] = -n;
      uv[i * 2] = 0.5 + e / spanM;
      uv[i * 2 + 1] = 0.5 + n / spanM;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      if (
        heights[a] < RELIEF_MIN_M &&
        heights[b] < RELIEF_MIN_M &&
        heights[d] < RELIEF_MIN_M &&
        heights[e] < RELIEF_MIN_M
      ) {
        continue;
      }
      if (Math.abs(pos[a * 3]) > radiusM || Math.abs(pos[a * 3 + 2]) > radiusM) continue;
      // counter-clockwise seen from above: the faces look up
      idx.push(a, d, b, b, d, e);
    }
  }
  if (idx.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
  return geom;
}

export function SurroundRelief({ project }: { project: Project }) {
  const loc = project.location;
  const meta = project.surround;
  const invalidate = useThree((s) => s.invalidate);
  const [grid, setGrid] = useState<SurroundHeights | null>(null);
  useEffect(() => {
    let live = true;
    setGrid(null);
    void loadSurroundHeights(meta).then((g) => {
      if (!live) return;
      setGrid(g);
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as { __surroundGrid?: unknown }).__surroundGrid = g;
      }
    });
    return () => {
      live = false;
    };
  }, [meta?.blobId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lat = loc?.latLng.lat ?? 0;
  const lng = loc?.latLng.lng ?? 0;
  // the projector span carries the site calibration, like the ground photo
  const spanM = metersPerStaticMap(lat, RELIEF_ZOOM, 640) * project.calibration.scaleFactor;
  const texUrl = staticSatelliteUrl(lat, lng, RELIEF_ZOOM, 640, 2);
  const tex = useMemo(() => {
    const t = new THREE.TextureLoader().load(texUrl, () => invalidate());
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [texUrl, invalidate]);
  useEffect(() => () => tex.dispose(), [tex]);
  const mat = useMemo(() => wallAwareMaterial(tex), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);

  // the site's own roofs are the model's: cut them out of the raster as they are now;
  // the photo covers spanM, so the relief stops just inside it (no smeared edge)
  const geom = useMemo(
    () => (grid ? buildRelief(cutSurroundForRoofs(grid, project.roofs), spanM, Math.min(RELIEF_RADIUS_M, spanM / 2 - 2)) : null),
    [grid, spanM, project.roofs],
  );
  useEffect(() => {
    invalidate();
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __relief?: { tris: number } | null }).__relief = geom
        ? { tris: (geom.index?.count ?? 0) / 3 }
        : null;
    }
    return () => {
      geom?.dispose();
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as { __relief?: unknown }).__relief = null;
      }
    };
  }, [geom, invalidate]);

  if (!geom || !loc) return null;
  return (
    <mesh
      geometry={geom}
      material={mat}
      name="surround-relief"
      castShadow
      receiveShadow
      userData={{ shadowCaster: false }}
    />
  );
}
