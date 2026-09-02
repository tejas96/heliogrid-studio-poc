// ─── Real-surroundings grid → shading caster geometry (pure, worker-safe) ────
// Kept free of browser storage and raster decoding so the analysis worker
// can build the caster from the grid it is handed without dragging IndexedDB
// or GeoTIFF code into its bundle.
import * as THREE from 'three';
import type { SiteSurround, XY } from '../types';

/** The decoded grid the engine consumes (heights in METRES above grade). */
export interface SurroundHeights {
  cols: number;
  rows: number;
  originEN: XY;
  stepCol: XY;
  stepRow: XY;
  heights: Float32Array;
}

/** Fingerprint ingredient: everything that changes what the engine sees. */
export function surroundKey(s: SiteSurround): string {
  return `${s.source}|${s.imageryDate}|${s.radiusM}|${s.stepM}|${s.cols}x${s.rows}|${s.blobId}`;
}

/**
 * Heightfield mesh geometry in SCENE coordinates (x = E, y = up, z = −N).
 * Cells at grade are kept (a continuous sheet is what a raycast needs); the
 * grid is thinned so the engine never traverses more than ~40k triangles.
 */
export function buildSurroundGeometry(g: SurroundHeights): THREE.BufferGeometry {
  const thin = Math.max(1, Math.ceil(Math.sqrt((g.cols * g.rows) / 40_000)));
  const cols = Math.floor((g.cols - 1) / thin) + 1;
  const rows = Math.floor((g.rows - 1) / thin) + 1;
  const pos = new Float32Array(cols * rows * 3);
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sc = c * thin;
      const sr = r * thin;
      // MAX over the thinned block keeps thin casters (poles, tree tops)
      let h = 0;
      for (let dy = 0; dy < thin; dy++) {
        for (let dx = 0; dx < thin; dx++) {
          const cc = Math.min(g.cols - 1, sc + dx);
          const rr = Math.min(g.rows - 1, sr + dy);
          h = Math.max(h, g.heights[rr * g.cols + cc]);
        }
      }
      const e = g.originEN.x + sc * g.stepCol.x + sr * g.stepRow.x;
      const n = g.originEN.y + sc * g.stepCol.y + sr * g.stepRow.y;
      pos[k++] = e;
      pos[k++] = h;
      pos[k++] = -n;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = a + cols;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  return geom;
}
