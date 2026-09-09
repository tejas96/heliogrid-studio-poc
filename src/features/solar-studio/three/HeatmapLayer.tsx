// ─── Flat solar-access heatmap: instanced ground quads coloured per month ───
// Renders one small flat square per sampled roof point at ground level, over
// the satellite plane. Colours update instantly when the month scrubs (a single
// instance-colour buffer write) — no geometry rebuild, no React churn.
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { heatColor, type HeatmapResult } from '../lib/solar-heatmap';

export function HeatmapLayer({
  result,
  month,
}: {
  result: HeatmapResult;
  month: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  // the buffer writes below are invisible to r3f — ask for the frame that shows them
  const invalidate = useThree((s) => s.invalidate);

  const geom = useMemo(() => {
    const g = new THREE.PlaneGeometry(result.stepM * 0.98, result.stepM * 0.98);
    g.rotateX(-Math.PI / 2); // lie flat on the ground plane
    return g;
  }, [result.stepM]);

  useEffect(() => () => geom.dispose(), [geom]);

  // per-instance transform (position + roof-aligned yaw) — set once per result
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    result.cells.forEach((c, i) => {
      dummy.position.set(c.world[0], c.world[1], c.world[2]);
      dummy.rotation.set(0, c.yawRad, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    invalidate();
  }, [result, invalidate]);

  // recolour on month scrub — instant
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    result.cells.forEach((c, i) => {
      mesh.setColorAt(i, heatColor(c.monthly[month])); // already an access fraction 0..1
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    invalidate();
  }, [result, month, invalidate]);

  if (result.cells.length === 0) return null;
  return (
    <instancedMesh
      key={result.cells.length}
      ref={meshRef}
      args={[geom, undefined, result.cells.length]}
      // three culls an instanced mesh by the bounds it computes at FIRST
      // render — before the effect above has placed a single cell, so that
      // is one cell-sized sphere at the world origin. It happened to sit
      // inside every perspective frustum; the orthographic plan culled the
      // whole map by it. The cells spread across the roof: never cull by them.
      frustumCulled={false}
    >
      {/* white base × per-instance color (instanceColor) = the ramp color;
          NOT vertexColors — PlaneGeometry has no per-vertex color attribute */}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
