import { describe, expect, it } from 'vitest';
import { poaFactor } from '../poa';

// Sangli, Maharashtra — northern-hemisphere tropical site used across the POC
const LAT = 16.85;
const LNG = 74.58;

describe('poaFactor', () => {
  it('is 1.0 for a horizontal panel', () => {
    expect(poaFactor(LAT, LNG, 0, 180)).toBeCloseTo(1, 2);
  });

  it('south-facing tilt beats flat, which beats north-facing tilt', () => {
    const south = poaFactor(LAT, LNG, 15, 180);
    const flat = poaFactor(LAT, LNG, 0, 180);
    const north = poaFactor(LAT, LNG, 15, 0);
    expect(south).toBeGreaterThan(flat);
    expect(flat).toBeGreaterThan(north);
  });

  it('east and west tilts are roughly symmetric', () => {
    const east = poaFactor(LAT, LNG, 10, 90);
    const west = poaFactor(LAT, LNG, 10, 270);
    expect(Math.abs(east - west)).toBeLessThan(0.05);
  });

  it('orientation genuinely moves the factor (guards solar-time sampling)', () => {
    // Regression for the timezone bug: sampling by machine-local Date culled
    // every daytime sample when the run TZ was far from the site, collapsing
    // south/north/flat all to 1.0. Solar-time sampling keeps a real spread in
    // ANY timezone — so this fails on a UTC/US CI if the fix is reverted.
    const south = poaFactor(LAT, LNG, 20, 180);
    const north = poaFactor(LAT, LNG, 20, 0);
    expect(south - north).toBeGreaterThan(0.1);
    expect(south).toBeGreaterThan(1.01); // equator-facing tilt genuinely gains
  });

  it('stays within physically sane bounds for rooftop tilts', () => {
    for (const tilt of [0, 5, 10, 15, 20, 30]) {
      for (const az of [0, 90, 180, 270]) {
        const f = poaFactor(LAT, LNG, tilt, az);
        expect(f).toBeGreaterThan(0.6);
        expect(f).toBeLessThan(1.25);
      }
    }
  });
});
