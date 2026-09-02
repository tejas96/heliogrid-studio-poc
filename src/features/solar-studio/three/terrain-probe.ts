// ─── Where the real ground is, under a plan point ───────────────────────────
// The design's ground is y = 0. Google's photomesh is aligned so the ground
// AROUND the building sits at 0 on average, but real ground rolls by half a
// metre — a tank or a plant-room inverter drawn at exactly 0 sinks into a
// rise or floats over a dip. The surround registers a sampler here once its
// tiles are in; ground-level things read it and stand on the mesh.
//
// Visual only: the analytical model (shade, cable drops) keeps y = 0.
import { useEffect, useState } from 'react';

type Sampler = (x: number, z: number) => number | null;

let sampler: Sampler | null = null;
let generation = 0;
const listeners = new Set<() => void>();

export function setTerrainSampler(fn: Sampler | null): void {
  sampler = fn;
  bumpTerrain();
}

/** the surround calls this whenever more tiles have landed */
export function bumpTerrain(): void {
  generation++;
  for (const l of listeners) l();
}

/** terrain height at a scene x/z, or null when no surround is loaded there */
export function terrainYAt(x: number, z: number): number | null {
  return sampler ? sampler(x, z) : null;
}

/**
 * Height to lift a ground-level object so it stands on the photomesh:
 * the terrain there when known and within a sane band, else 0.
 */
export function useGroundLift(x: number, z: number): number {
  const [lift, setLift] = useState(0);
  useEffect(() => {
    const read = () => {
      const y = terrainYAt(x, z);
      setLift(y !== null && Math.abs(y) < 3 ? y : 0);
    };
    read();
    listeners.add(read);
    return () => {
      listeners.delete(read);
    };
  }, [x, z]);
  return lift;
}

export function terrainGeneration(): number {
  return generation;
}

/** Synchronous lift for render-time use: the terrain height when known and sane, else 0. */
export function groundLiftAt(x: number, z: number): number {
  const y = terrainYAt(x, z);
  return y !== null && Math.abs(y) < 3 ? y : 0;
}

/** Re-renders the caller whenever the surround has more ground to read. */
export function useTerrainGeneration(): number {
  const [gen, setGen] = useState(generation);
  useEffect(() => {
    const l = () => setGen(generation);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return gen;
}
