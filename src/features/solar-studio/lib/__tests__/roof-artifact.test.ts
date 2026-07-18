import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_VERSION,
  applyArtifact,
  validateArtifact,
  type RoofArtifact,
} from '../roof-ai/artifact';
import { preCleanRing, sanitizeRoofPolygon } from '../roof-factory';
import { fixtureProject, fixtureRoof } from './fixtures/project';
import type { Project } from '../../types';

const PIN = { lat: 18.5158, lng: 73.9272 };

function artifact(over: Partial<RoofArtifact> = {}): RoofArtifact {
  return {
    version: ARTIFACT_VERSION,
    source: 'dataLayers',
    forLatLng: PIN,
    generatedAt: 1,
    roofs: [
      {
        id: 'ar_1',
        polygon: [
          { x: 0, y: 0 },
          { x: 12, y: 0 },
          { x: 12, y: 9 },
          { x: 0, y: 9 },
        ],
        heightM: 6.2,
        pitchDeg: 0,
        slopeAzimuthDeg: null,
        confidence: 0.8,
        rmseM: 0.12,
      },
    ],
    obstructions: [
      {
        id: 'ao_1',
        type: 'other',
        center: { x: 6, y: 4 },
        lengthM: 2,
        widthM: 1.5,
        heightM: 1.1,
        rotationDeg: 0,
        confidence: 0.6,
      },
    ],
    warnings: [],
    ...over,
  };
}

describe('preCleanRing (AI ring pre-clean)', () => {
  it('drops the closing duplicate and merges near-duplicate vertices', () => {
    const ring = preCleanRing([
      { x: 0, y: 0 },
      { x: 0.05, y: 0.05 }, // < 0.15 m from previous — merged away
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
      { x: 0, y: 0 }, // closing duplicate
    ]);
    expect(ring).toHaveLength(4);
  });

  it('collapses near-collinear vertices', () => {
    const ring = preCleanRing([
      { x: 0, y: 0 },
      { x: 5, y: 0.001 }, // on the bottom edge, ~0° turn
      { x: 10, y: 0 },
      { x: 10, y: 8 },
      { x: 0, y: 8 },
    ]);
    expect(ring).toHaveLength(4);
    // still a valid roof afterwards
    expect(sanitizeRoofPolygon(ring).ok).toBe(true);
  });
});

describe('validateArtifact — whole-artifact rejections', () => {
  it('rejects non-objects, wrong versions and unknown sources', () => {
    expect(validateArtifact(null, PIN).ok).toBe(false);
    expect(validateArtifact({ ...artifact(), version: 2 }, PIN).ok).toBe(false);
    expect(validateArtifact({ ...artifact(), source: 'chatgpt' }, PIN).ok).toBe(false);
  });

  it('rejects an artifact generated for a DIFFERENT location (pin guard)', () => {
    const res = validateArtifact(artifact(), { lat: 19.1, lng: 73.9272 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/different location/);
  });
});

describe('validateArtifact — per-entity drops keep siblings', () => {
  it('drops a self-intersecting roof with a reason; the good roof survives', () => {
    const bowtie = {
      id: 'ar_bad',
      polygon: [
        { x: 20, y: 0 },
        { x: 26, y: 6 },
        { x: 26, y: 0 },
        { x: 20, y: 6 },
      ],
      heightM: 3,
      pitchDeg: null,
      slopeAzimuthDeg: null,
      confidence: 0.9,
    };
    const res = validateArtifact(artifact({ roofs: [...artifact().roofs, bowtie] }), PIN);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.artifact.roofs.map((r) => r.id)).toEqual(['ar_1']);
      expect(res.dropped.some((d) => d.id === 'ar_bad')).toBe(true);
    }
  });

  it('drops out-of-extent and implausible entities', () => {
    const res = validateArtifact(
      artifact({
        roofs: [
          {
            ...artifact().roofs[0],
            id: 'ar_far',
            polygon: artifact().roofs[0].polygon.map((p) => ({ x: p.x + 500, y: p.y })),
          },
        ],
        obstructions: [
          { ...artifact().obstructions[0], id: 'ao_huge', lengthM: 400 },
        ],
      }),
      PIN,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.artifact.roofs).toHaveLength(0);
      expect(res.artifact.obstructions).toHaveLength(0);
      expect(res.dropped.map((d) => d.id).sort()).toEqual(['ao_huge', 'ar_far']);
    }
  });

  it('clamps confidence, coerces unknown obstruction types to other, nulls implausible heights', () => {
    const res = validateArtifact(
      artifact({
        roofs: [{ ...artifact().roofs[0], confidence: 7, heightM: 300 }],
        obstructions: [
          {
            ...artifact().obstructions[0],
            type: 'ufo' as unknown as 'other',
            confidence: -2,
          },
        ],
      }),
      PIN,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.artifact.roofs[0].confidence).toBe(1);
      expect(res.artifact.roofs[0].heightM).toBeNull();
      expect(res.artifact.obstructions[0].type).toBe('other');
      expect(res.artifact.obstructions[0].confidence).toBe(0);
    }
  });
});

describe('applyArtifact — accepted entities become REAL project entities', () => {
  const base: Project = { ...fixtureProject(0), panels: [], strings: [] };

  it('imports only the accepted subset as one composable patch', () => {
    const res = validateArtifact(artifact(), PIN);
    if (!res.ok) throw new Error('unexpected');
    const patch = applyArtifact(base, res.artifact, {
      roofIds: new Set(['ar_1']),
      obstructionIds: new Set(), // obstruction NOT accepted
    });
    expect(patch.roofs).toHaveLength(base.roofs.length + 1);
    expect(patch.obstructions).toBeUndefined();
    const imported = patch.roofs![patch.roofs!.length - 1];
    // factory defaults + artifact values + naming counter + provenance
    expect(imported.name).toBe('Roof 2'); // continues after fixture 'Roof 1'
    expect(imported.heightM).toBe(6.2);
    expect(imported.roofType).toBe('rcc_flat');
    expect(imported.setbackM).toBe(0.3);
    expect(imported.provenance).toEqual({ source: 'dataLayers', confidence: 0.8 });
  });

  it('a roof fully inside an existing roof becomes a Mumty on top of it', () => {
    const inner = {
      id: 'ar_m',
      polygon: [
        { x: -2, y: -2 },
        { x: 2, y: -2 },
        { x: 2, y: 2 },
        { x: -2, y: 2 },
      ],
      heightM: null, // unknown → parent + 2.2
      pitchDeg: null,
      slopeAzimuthDeg: null,
      confidence: 0.5,
    };
    const res = validateArtifact(artifact({ roofs: [inner] }), PIN);
    if (!res.ok) throw new Error('unexpected');
    const patch = applyArtifact(base, res.artifact, {
      roofIds: new Set(['ar_m']),
      obstructionIds: new Set(),
    });
    const mumty = patch.roofs![patch.roofs!.length - 1];
    expect(mumty.name).toBe('Mumty 1');
    expect(mumty.heightM).toBeCloseTo(fixtureRoof().heightM + 2.2, 6);
  });

  it('obstructions get factory labels continuing the count and parent to the roof under them', () => {
    const res = validateArtifact(artifact(), PIN);
    if (!res.ok) throw new Error('unexpected');
    const patch = applyArtifact(base, res.artifact, {
      roofIds: new Set(), // roof rejected — obstruction still lands on the FIXTURE roof
      obstructionIds: new Set(['ao_1']),
    });
    const ob = patch.obstructions![patch.obstructions!.length - 1];
    expect(ob.label).toBe('OB1');
    expect(ob.roofId).toBe(base.roofs[0].id); // (6,4) is inside the fixture roof
    expect(ob.provenance?.source).toBe('dataLayers');
    expect(ob.setbackM).toBe(0.5);
    expect(ob.castsShadow).toBe(true);
  });
});
