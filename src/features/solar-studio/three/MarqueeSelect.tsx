// ─── Box select in 3D ────────────────────────────────────────────────────────
// Shift-drag on the scene draws a rectangle (Scene3D owns the DOM part and
// stops the camera from orbiting). On release the rectangle arrives here, in
// client pixels; every module whose glass centre projects inside it joins the
// selection. Modules behind others count too — from above that is what a box
// on a roof means.
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface MarqueeCommit {
  /** client pixels, any corner order */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** bumps per release, so the same rectangle twice still selects */
  nonce: number;
}

export function MarqueeSelect({
  commit,
  positions,
  onSelect,
}: {
  commit: MarqueeCommit | null;
  positions: ReadonlyMap<string, { position: [number, number, number] }>;
  onSelect: (ids: string[]) => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    if (!commit) return;
    const rect = gl.domElement.getBoundingClientRect();
    const left = Math.min(commit.x0, commit.x1) - rect.left;
    const right = Math.max(commit.x0, commit.x1) - rect.left;
    const top = Math.min(commit.y0, commit.y1) - rect.top;
    const bottom = Math.max(commit.y0, commit.y1) - rect.top;
    if (right - left < 3 || bottom - top < 3) return;
    const v = new THREE.Vector3();
    const ids: string[] = [];
    positions.forEach(({ position }, id) => {
      v.set(position[0], position[1], position[2]).project(camera);
      if (v.z > 1) return; // behind the camera
      const px = ((v.x + 1) / 2) * rect.width;
      const py = ((1 - v.y) / 2) * rect.height;
      if (px >= left && px <= right && py >= top && py <= bottom) ids.push(id);
    });
    if (ids.length) onSelect(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commit?.nonce]);
  return null;
}
