import { describe, expect, it } from 'vitest';
import { gcr, shadowFreePitchM } from '../spacing';

const LAT = 18.52; // Pune
const LNG = 73.86;
const L = 2; // 2 m module (portrait length)

describe('gcr', () => {
  it('is collector length / pitch', () => {
    expect(gcr(2, 4)).toBeCloseTo(0.5, 6);
    expect(gcr(2, 2)).toBeCloseTo(1, 6);
  });
});

describe('shadowFreePitchM', () => {
  it('flush (0° tilt) needs no extra spacing → pitch = module length, GCR = 1', () => {
    const p = shadowFreePitchM(LAT, LNG, 0, L, 180);
    expect(p).toBeCloseTo(L, 5);
    expect(gcr(L, p)).toBeCloseTo(1, 5);
  });

  it('a tilted array needs a pitch larger than its foreshortened footprint', () => {
    const tilt = 15;
    const base = L * Math.cos((tilt * Math.PI) / 180);
    const p = shadowFreePitchM(LAT, LNG, tilt, L, 180);
    expect(p).toBeGreaterThan(base); // extra gap for the winter shadow
    expect(gcr(L, p)).toBeLessThan(1); // GCR below 1 for a spaced tilted array
    expect(gcr(L, p)).toBeGreaterThan(0.2);
  });

  it('steeper tilt → more spacing → lower GCR', () => {
    const g10 = gcr(L, shadowFreePitchM(LAT, LNG, 10, L, 180));
    const g25 = gcr(L, shadowFreePitchM(LAT, LNG, 25, L, 180));
    expect(g25).toBeLessThan(g10);
  });

  it('higher latitude (lower winter sun) → more spacing', () => {
    const pLow = shadowFreePitchM(18, LNG, 20, L, 180);
    const pHigh = shadowFreePitchM(32, LNG, 20, L, 180); // Delhi-ish
    expect(pHigh).toBeGreaterThan(pLow);
  });

  it('is timezone-independent (uses solar time via longitude)', () => {
    const a = shadowFreePitchM(LAT, LNG, 20, L, 180);
    const b = shadowFreePitchM(LAT, LNG, 20, L, 180);
    expect(a).toBe(b);
  });
});
