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
 * Heightfield → relief geometry in scene coordinates (x = E, y = up, z = −N).
 * Only quads with at least one raised corner are kept; their ground corners
 * drop to the skirt so the block's wall continues under the terrain instead
 * of floating where the terrain dips. UVs put the satellite photo (centred on
 * the pin, `spanM` wide, north up) onto every face.
 */
export function buildRelief(g: SurroundHeights, spanM: number): THREE.BufferGeometry | null {
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
      if (Math.abs(pos[a * 3]) > RELIEF_RADIUS_M || Math.abs(pos[a * 3 + 2]) > RELIEF_RADIUS_M) continue;
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
      if (live) setGrid(g);
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

  const geom = useMemo(() => (grid ? buildRelief(grid, spanM) : null), [grid, spanM]);
  useEffect(() => {
    invalidate();
    if (process.env.NODE_ENV !== 'production') {
      (window as unknown as { __relief?: { tris: number } | null }).__relief = geom
        ? { tris: (geom.index?.count ?? 0) / 3 }
        : null;
    }
    return () => geom?.dispose();
  }, [geom, invalidate]);

  if (!geom || !loc) return null;
  return (
    <mesh geometry={geom} name="surround-relief" castShadow receiveShadow userData={{ shadowCaster: false }}>
      <meshStandardMaterial map={tex} color={PHOTO_TINT} roughness={1} metalness={0} envMapIntensity={0.15} />
    </mesh>
  );
}
