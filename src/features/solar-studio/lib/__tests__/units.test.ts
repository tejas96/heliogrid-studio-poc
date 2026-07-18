import { describe, expect, it } from 'vitest';
import { fmtArea, fmtLen, lenValue } from '../units';
import { defaultPanelPose } from '../layout';

describe('units formatting', () => {
  it('formats lengths in the selected system', () => {
    expect(fmtLen(11.71, 'metric')).toBe('11.71 m');
    expect(fmtLen(10, 'imperial')).toBe('32.81 ft');
    expect(lenValue(3, 'imperial', 1)).toBe('9.8');
  });

  it('formats areas in the selected system', () => {
    expect(fmtArea(272, 'metric')).toBe('272 m²');
    expect(fmtArea(272, 'imperial')).toBe('2928 ft²');
  });
});

describe('defaultPanelPose', () => {
  const base = {
    id: 'r',
    name: 'r',
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ],
    heightM: 3,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 0.3,
    perEdgeSetbacksM: null,
    parapet: {
      enabled: false,
      direction: 'inward' as const,
      heightM: 1,
      widthM: 0.3,
      perEdge: null,
      suppressSharedEdges: true,
    },
  };
  it('elevates on RCC flat, flush on metal shed, inherits slope when pitched', () => {
    expect(defaultPanelPose({ ...base, roofType: 'rcc_flat' })).toEqual({ tiltDeg: 10, azimuthDeg: 180 });
    expect(defaultPanelPose({ ...base, roofType: 'metal_shed' })).toEqual({ tiltDeg: 0, azimuthDeg: 180 });
    expect(
      defaultPanelPose({ ...base, roofType: 'metal_shed', pitchDeg: 20, slopeAzimuthDeg: 135 }),
    ).toEqual({ tiltDeg: 20, azimuthDeg: 135 });
  });
});
