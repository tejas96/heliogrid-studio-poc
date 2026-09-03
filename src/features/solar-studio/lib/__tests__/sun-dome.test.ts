import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

/**
 * The sun marker and its arcs share ONE dome. They were written out separately
 * and drifted: the arcs were lifted to the design's top for tall buildings, the
 * marker was left on a dome centred at y = 0. On the 77 m tower fixture that
 * drew the sun 77 m below its own path — measured at y = 69.3 where the dome
 * puts it at 148 — so it read as sitting beside the building and below the
 * horizon while the badge said Alt 54°.
 *
 * This is the arithmetic the scene now does in one place (three/Scene3D,
 * `sunDomeCentre` + `SUN_DOME_R`): whatever the roof height, the marker must
 * land ON the dome, at the altitude the sun actually has.
 */
function sunMarker(centre: THREE.Vector3, radius: number, altitudeRad: number, azimuthRad: number) {
  // the scene's convention: x east, y up, z = −north
  const dir = new THREE.Vector3(
    Math.cos(altitudeRad) * Math.sin(azimuthRad),
    Math.sin(altitudeRad),
    -Math.cos(altitudeRad) * Math.cos(azimuthRad),
  );
  return dir.multiplyScalar(radius).add(centre);
}

describe('the sun rides the same dome as its arcs', () => {
  const radius = 85.7; // R * 0.75 for the tower fixture

  it.each([0, 5, 76.9, 300])('sits on the dome with the roof at %d m', (roofTop) => {
    const centre = new THREE.Vector3(0.9, roofTop, -5.7);
    const alt = (54 * Math.PI) / 180;
    const p = sunMarker(centre, radius, alt, Math.PI);
    expect(p.distanceTo(centre)).toBeCloseTo(radius, 3);
    // and it is ABOVE the roof it belongs to, by the dome's own rise
    expect(p.y - roofTop).toBeCloseTo(radius * Math.sin(alt), 3);
  });

  it('keeps the sun above the building whenever the sun is up', () => {
    const centre = new THREE.Vector3(0, 76.9, 0);
    for (let deg = 1; deg <= 89; deg++) {
      const p = sunMarker(centre, radius, (deg * Math.PI) / 180, 0);
      expect(p.y).toBeGreaterThan(centre.y);
    }
  });

  it('reports back the altitude it was given', () => {
    const centre = new THREE.Vector3(3, 76.9, -4);
    for (const deg of [10, 30, 54, 80]) {
      const p = sunMarker(centre, radius, (deg * Math.PI) / 180, Math.PI * 0.6);
      const rel = p.clone().sub(centre);
      const measured = (Math.atan2(rel.y, Math.hypot(rel.x, rel.z)) * 180) / Math.PI;
      expect(measured).toBeCloseTo(deg, 6);
    }
  });
});
