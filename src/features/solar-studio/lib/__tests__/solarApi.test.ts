import { describe, expect, it } from 'vitest';
import { mapBuildingInsights, type ApiBuildingInsights } from '../solarApi';

// Mapping parity gate (Phase 5 task 22): the proxy serves EXACTLY what the
// old client-side mapper produced — the stored SolarInsights shape must not
// drift when the fetch moved server-side.
const RAW: ApiBuildingInsights = {
  imageryDate: { year: 2025, month: 5, day: 4 },
  imageryQuality: 'MEDIUM',
  solarPotential: {
    maxArrayPanelsCount: 42,
    maxArrayAreaMeters2: 83.7,
    maxSunshineHoursPerYear: 2145.6,
    carbonOffsetFactorKgPerMwh: 713.2,
    panelCapacityWatts: 250,
    wholeRoofStats: { areaMeters2: 141.9 },
    roofSegmentStats: [
      {
        pitchDegrees: 18.2,
        azimuthDegrees: 178.9,
        stats: { areaMeters2: 61.23 },
        center: { latitude: 18.5158, longitude: 73.9272 },
      },
      { pitchDegrees: 4.1, azimuthDegrees: 92.4, stats: { areaMeters2: 30.11 } },
      // unusable: missing azimuth — must be filtered, not zero-filled
      { pitchDegrees: 30 },
    ],
  },
};

describe('mapBuildingInsights (proxy ↔ stored-shape parity)', () => {
  const m = mapBuildingInsights(RAW);

  it('formats the imagery date and passes quality through', () => {
    expect(m.imageryDate).toBe('2025-05-04');
    expect(m.imageryQuality).toBe('MEDIUM');
  });

  it('rounds area/sunshine/carbon; passes counts and watts raw', () => {
    expect(m.maxArrayAreaM2).toBe(84);
    expect(m.maxSunshineHoursPerYear).toBe(2146);
    expect(m.carbonOffsetFactorKgPerMwh).toBe(713);
    expect(m.roofAreaM2).toBe(142);
    expect(m.maxPanels).toBe(42);
    expect(m.panelCapacityWatts).toBe(250);
  });

  it('keeps ONLY segments with pitch AND azimuth; azimuth passes unconverted', () => {
    expect(m.roofSegments).toHaveLength(2);
    expect(m.roofSegmentCount).toBe(2); // usable count, not raw count (3)
    expect(m.roofSegments![0]).toEqual({
      pitchDeg: 18,
      azimuthDeg: 179, // 0=N clockwise — already the app convention
      areaM2: 61.2,
      center: { lat: 18.5158, lng: 73.9272 },
    });
    expect(m.roofSegments![1].center).toBeUndefined();
  });

  it('an empty body maps to all-undefined fields (never throws)', () => {
    const empty = mapBuildingInsights({});
    expect(empty.roofSegments).toBeUndefined();
    expect(empty.imageryDate).toBeUndefined();
    expect(empty.maxPanels).toBeUndefined();
  });
});
