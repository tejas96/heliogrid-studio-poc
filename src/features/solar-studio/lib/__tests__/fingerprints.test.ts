import { describe, expect, it } from 'vitest';
import {
  capturesFresh,
  designFp,
  electricalFp,
  geometryFp,
  isCaptureFresh,
  isShadingFresh,
  layoutFp,
  shadingFp,
  siteFp,
} from '../fingerprints';
import { fixtureProject } from './fixtures/project';
import type { Project, ShadowCapture } from '../../types';

/** Designed fixture + a confirmed location (fingerprints need the site pin). */
function proj(): Project {
  return {
    ...fixtureProject(8),
    location: {
      address: 'Pune, MH',
      latLng: { lat: 18.5204, lng: 73.8567 },
      confirmed: true,
      irradiance: 5.4,
      peakSunHours: 5.4,
      dataSource: 'estimate',
    },
  };
}

type Layer = 'site' | 'geometry' | 'layout' | 'electrical' | 'design' | 'shading';
const LAYERS: Record<Layer, (p: Project) => string> = {
  site: siteFp,
  geometry: geometryFp,
  layout: layoutFp,
  electrical: electricalFp,
  design: designFp,
  shading: shadingFp as (p: Project) => string,
};

/**
 * The invalidation matrix gate: one edit ⇒ exactly the expected layers change.
 * `changed` lists layers that MUST differ; every other layer MUST be identical.
 */
function expectInvalidates(edit: (p: Project) => Project, changed: Layer[], label: string) {
  const before = proj();
  const after = edit(structuredClone(before));
  for (const layer of Object.keys(LAYERS) as Layer[]) {
    const was = LAYERS[layer](before);
    const now = LAYERS[layer](after);
    if (changed.includes(layer)) {
      expect(now, `${label}: expected ${layer}Fp to CHANGE`).not.toBe(was);
    } else {
      expect(now, `${label}: expected ${layer}Fp to stay identical`).toBe(was);
    }
  }
}

describe('fingerprint graph: determinism & nesting', () => {
  it('is deterministic — same project, same strings', () => {
    const a = proj();
    const b = structuredClone(a);
    for (const fp of Object.values(LAYERS)) expect(fp(a)).toBe(fp(b));
  });

  it('layers are strictly nested prefixes (site ⊂ geometry ⊂ layout ⊂ electrical ⊂ design)', () => {
    const p = proj();
    expect(geometryFp(p).startsWith(siteFp(p))).toBe(true);
    expect(layoutFp(p).startsWith(geometryFp(p))).toBe(true);
    expect(electricalFp(p).startsWith(layoutFp(p))).toBe(true);
    expect(designFp(p).startsWith(electricalFp(p))).toBe(true);
    // shadingFp = engine-version tag + geometryFp + sample points, so a
    // shading-engine change (not just geometry) also invalidates stamps
    expect(shadingFp(p)).toMatch(/^e\d+\|/);
    expect(shadingFp(p).includes(geometryFp(p))).toBe(true);
  });
});

describe('invalidation matrix', () => {
  it('moving the location pin invalidates every layer', () => {
    expectInvalidates(
      (p) => ({ ...p, location: { ...p.location!, latLng: { lat: 19.0, lng: 73.8567 } } }),
      ['site', 'geometry', 'layout', 'electrical', 'design', 'shading'],
      'move pin',
    );
  });

  it('new weather data invalidates every layer', () => {
    expectInvalidates(
      (p) => ({
        ...p,
        location: {
          ...p.location!,
          weather: {
            monthlyGhi: Array(12).fill(5),
            monthlyDiffuseFrac: Array(12).fill(0.3),
            annualGhi: 5,
            forLatLng: p.location!.latLng,
            source: 'pvgis' as const,
            fetchedAt: 42,
          },
        },
      }),
      ['site', 'geometry', 'layout', 'electrical', 'design', 'shading'],
      'weather landed',
    );
  });

  it('moving a roof vertex invalidates geometry and above + shading, not site', () => {
    expectInvalidates(
      (p) => ({
        ...p,
        roofs: [{ ...p.roofs[0], polygon: p.roofs[0].polygon.map((v, i) => (i === 0 ? { x: v.x - 1, y: v.y } : v)) }],
      }),
      ['geometry', 'layout', 'electrical', 'design', 'shading'],
      'roof vertex',
    );
  });

  it('toggling a parapet invalidates geometry and above + shading', () => {
    expectInvalidates(
      (p) => ({
        ...p,
        roofs: [{ ...p.roofs[0], parapet: { ...p.roofs[0].parapet, enabled: true } }],
      }),
      ['geometry', 'layout', 'electrical', 'design', 'shading'],
      'parapet toggle',
    );
  });

  it('adding an obstruction invalidates geometry and above + shading', () => {
    expectInvalidates(
      (p) => ({
        ...p,
        obstructions: [
          {
            id: 'obs_1',
            type: 'tank',
            label: 'WT1',
            roofId: p.roofs[0].id,
            center: { x: 4, y: 4 },
            shape: 'circle',
            lengthM: 0,
            widthM: 0,
            diameterM: 1.5,
            heightM: 1.2,
            rotationDeg: 0,
            setbackM: 0.3,
            castsShadow: true,
            blocksPlacement: true,
          },
        ],
      }),
      ['geometry', 'layout', 'electrical', 'design', 'shading'],
      'obstruction added',
    );
  });

  it('moving a panel invalidates layout and above + shading, not geometry', () => {
    expectInvalidates(
      (p) => ({
        ...p,
        panels: p.panels.map((x, i) => (i === 0 ? { ...x, center: { x: x.center.x + 0.5, y: x.center.y } } : x)),
      }),
      ['layout', 'electrical', 'design', 'shading'],
      'panel moved',
    );
  });

  // v5 SCOPE CHANGE (Phase 8): panels became shadow CASTERS, so a panel's
  // tilt/enabled state now changes what its NEIGHBOURS receive. These two once
  // pinned the opposite ("sample point unmoved ⇒ no shading rerun") — that
  // exclusion is unsound under Tier-2 and would stamp stale access as fresh.
  it('disabling a panel invalidates shading too (it stops casting on its neighbours)', () => {
    expectInvalidates(
      (p) => ({ ...p, panels: p.panels.map((x, i) => (i === 0 ? { ...x, enabled: false } : x)) }),
      ['layout', 'electrical', 'design', 'shading'],
      'panel disabled',
    );
  });

  it('changing panel tilt invalidates shading too (a tilted plate casts differently)', () => {
    expectInvalidates(
      (p) => ({ ...p, panels: p.panels.map((x) => ({ ...x, tiltDeg: 25 })) }),
      ['layout', 'electrical', 'design', 'shading'],
      'tilt change',
    );
  });

  it('restringing invalidates electrical and design only', () => {
    expectInvalidates(
      (p) => ({
        ...p,
        strings: [
          { ...p.strings[0], panelIds: p.strings[0].panelIds.slice(0, 4) },
          { ...p.strings[0], id: 'str_2', name: 'String 2', mpptIndex: 1, panelIds: p.strings[0].panelIds.slice(4) },
        ],
      }),
      ['electrical', 'design'],
      'restring',
    );
  });

  it('changing inverter count invalidates electrical and design only', () => {
    expectInvalidates(
      (p) => ({ ...p, components: { ...p.components, inverterCount: 2 } }),
      ['electrical', 'design'],
      'inverter count',
    );
  });

  it('changing the margin invalidates design only', () => {
    expectInvalidates(
      (p) => ({ ...p, pricing: { marginPct: 20 } }),
      ['design'],
      'margin',
    );
  });

  it('a BOM override invalidates design only', () => {
    expectInvalidates(
      (p) => ({
        ...p,
        bomOverrides: [
          {
            id: 'bom_x',
            category: 'Electrical BOS',
            item: 'DC cable',
            spec: '4mm²',
            qty: 90,
            unit: 'm',
            unitPriceInr: 68,
            formula: 'manual',
            auto: false,
            confidence: 'derived',
            overridden: true,
          },
        ],
      }),
      ['design'],
      'bom override',
    );
  });

  it('renaming the project invalidates design only (captures must NOT go stale)', () => {
    expectInvalidates(
      (p) => ({ ...p, info: { ...p.info, name: 'Renamed Villa' } }),
      ['design'],
      'rename',
    );
  });

  it('recomputed solarAccess values change NO fingerprint (derived data)', () => {
    expectInvalidates(
      (p) => ({ ...p, panels: p.panels.map((x) => ({ ...x, solarAccess: 0.42 })) }),
      [],
      'solarAccess update',
    );
  });
});

describe('freshness helpers', () => {
  it('isShadingFresh: empty design is fresh; stamp match is fresh; mismatch is stale', () => {
    const p = proj();
    expect(isShadingFresh({ ...p, panels: [] })).toBe(true);
    expect(isShadingFresh(p)).toBe(false); // never stamped
    const stamped: Project = { ...p, derived: { ...p.derived, solarAccessFp: shadingFp(p) } };
    expect(isShadingFresh(stamped)).toBe(true);
    const edited: Project = {
      ...stamped,
      roofs: [{ ...stamped.roofs[0], heightM: 6 }],
    };
    expect(isShadingFresh(edited)).toBe(false);
  });

  it('capture freshness follows layoutFp; legacy (null) stamps are stale', () => {
    const p = proj();
    const cap: ShadowCapture = {
      id: 'sum_noon',
      label: 'Summer Noon',
      dateIso: '2026-06-21',
      hour: 12,
      mode: 'shadow',
      imageBlobId: 'img_test',
      forLayoutFp: layoutFp(p),
    };
    expect(isCaptureFresh(p, cap)).toBe(true);
    expect(isCaptureFresh(p, { ...cap, forLayoutFp: null })).toBe(false);
    const moved: Project = {
      ...p,
      panels: p.panels.map((x, i) => (i === 0 ? { ...x, center: { x: 0, y: 0 } } : x)),
    };
    expect(isCaptureFresh(moved, cap)).toBe(false);
    // renaming the project does NOT stale a capture
    expect(isCaptureFresh({ ...p, info: { ...p.info, name: 'Other' } }, cap)).toBe(true);
  });

  it('capturesFresh covers the cover image stamp', () => {
    const p = proj();
    const withCover: Project = {
      ...p,
      coverImageBlobId: 'img_cover',
      coverForLayoutFp: layoutFp(p),
    };
    expect(capturesFresh(withCover)).toBe(true);
    expect(capturesFresh({ ...withCover, coverForLayoutFp: null })).toBe(false);
    expect(capturesFresh(p)).toBe(true); // no images at all = nothing stale
  });
});
