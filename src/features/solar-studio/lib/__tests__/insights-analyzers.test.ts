// ─── Gate: Copilot analyzer pack v1 (Phase 6, §25c) ──────────────────────────
// Each analyzer fires on a crafted defect fixture and stays silent on a
// healthy one — thresholds and datum citations are the contract.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ArraySegment, Project, SiteLocation } from '../../types';
import { registerCoreAnalyzers } from '../insights/analyzers';
import {
  clearAnalyzers,
  computeInsights,
  listAnalyzers,
  resetInsightMemo,
} from '../insights/registry';
import { estimateMaxCapacityKwp } from '../layout';
import { shadowFreePitchM } from '../spacing';
import { fixtureProject, fixturePanels } from './fixtures/project';

const PUNE: SiteLocation = {
  address: 'Pune',
  latLng: { lat: 18.5203, lng: 73.8567 },
  confirmed: true,
  irradiance: 5.2,
  peakSunHours: 5.2,
  dataSource: 'test',
};

function byAnalyzer(p: Project, id: string) {
  return computeInsights(p).filter((i) => i.analyzerId === id);
}

beforeEach(() => {
  clearAnalyzers();
  registerCoreAnalyzers();
  resetInsightMemo();
});
afterEach(() => {
  clearAnalyzers();
  resetInsightMemo();
});

describe('registerCoreAnalyzers', () => {
  it('registers the v1 pack exactly once (idempotent)', () => {
    registerCoreAnalyzers(); // second call — must not throw or duplicate
    expect(listAnalyzers().map((a) => a.id).sort()).toEqual([
      'dc-ac-ratio',
      'orientation',
      'roof-utilization',
      'row-spacing',
    ]);
  });
});

describe('roof-utilization analyzer', () => {
  it('suggests documenting headroom when under 60% of max capacity is placed', () => {
    const p = fixtureProject(0);
    const max = estimateMaxCapacityKwp(p, p.components.panel!);
    expect(max.panels).toBeGreaterThan(3); // fixture roof sanity
    p.panels = fixturePanels(Math.max(1, Math.floor(max.panels * 0.3)));
    const out = byAnalyzer(p, 'roof-utilization');
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('suggestion');
    expect(out[0].evidence.join(' ')).toContain('maxFit');
  });

  it('stays silent at healthy utilization and on empty designs', () => {
    const p = fixtureProject(0);
    const max = estimateMaxCapacityKwp(p, p.components.panel!);
    p.panels = fixturePanels(Math.ceil(max.panels * 0.7));
    expect(byAnalyzer(p, 'roof-utilization')).toHaveLength(0);
    p.panels = []; // nothing placed yet — no nagging before design starts
    expect(byAnalyzer(p, 'roof-utilization')).toHaveLength(0);
  });
});

describe('dc-ac-ratio analyzer', () => {
  it('warns on clipping-level oversizing (ratio > 1.35)', () => {
    const p = fixtureProject(20); // 20×540 W = 10.8 kWp on a 5 kW inverter
    const out = byAnalyzer(p, 'dc-ac-ratio');
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe('warning');
    expect(out[0].title).toContain('high');
  });

  it('warns on wasteful undersizing (ratio < 0.9)', () => {
    const p = fixtureProject(8); // 4.32 kWp on 5 kW = 0.86
    const out = byAnalyzer(p, 'dc-ac-ratio');
    expect(out).toHaveLength(1);
    expect(out[0].title).toContain('low');
  });

  it('stays silent inside the 0.90–1.35 band', () => {
    const p = fixtureProject(10); // 5.4 kWp on 5 kW = 1.08
    expect(byAnalyzer(p, 'dc-ac-ratio')).toHaveLength(0);
  });
});

describe('orientation analyzer', () => {
  it('flags tilted panels facing far from south, with focus targets', () => {
    const p = fixtureProject(6);
    p.location = PUNE;
    p.panels = p.panels.map((x) => ({ ...x, azimuthDeg: 90 })); // due east
    const out = byAnalyzer(p, 'orientation');
    expect(out).toHaveLength(1);
    expect(out[0].focusIds).toHaveLength(6);
  });

  it('stays silent for south-facing, flat, or southern-hemisphere panels', () => {
    const p = fixtureProject(6);
    p.location = PUNE;
    expect(byAnalyzer(p, 'orientation')).toHaveLength(0); // fixture faces 180

    p.panels = p.panels.map((x) => ({ ...x, azimuthDeg: 90, tiltDeg: 0 }));
    expect(byAnalyzer(p, 'orientation')).toHaveLength(0); // flat — facing moot

    p.panels = p.panels.map((x) => ({ ...x, tiltDeg: 10 }));
    p.location = { ...PUNE, latLng: { lat: -20, lng: 73.8567 } };
    expect(byAnalyzer(p, 'orientation')).toHaveLength(0); // rule is north-hemisphere
  });
});

describe('row-spacing analyzer', () => {
  function segWithPitch(pitch: number, rows = 3): ArraySegment {
    return {
      id: 'seg_1',
      roofId: 'roof_1',
      label: 'A1',
      polygon: [
        { x: -7, y: -5 },
        { x: 7, y: -5 },
        { x: 7, y: 5 },
        { x: -7, y: 5 },
      ],
      rows,
      cols: 5,
      orientation: 'portrait',
      azimuthDeg: 180,
      racking: {
        kind: 'fixed_tilt',
        tiltDeg: 15,
        rowPitchM: pitch,
        frontLegM: 0.3,
        backLegM: 0.89,
        profile: { key: 'c_channel', label: 'C-Channel', kgPerM: 2.5 },
      },
      moduleGapM: 0.02,
      removed: [],
    };
  }

  it('flags rows tighter than the shadow-free pitch', () => {
    const p = fixtureProject(6);
    p.location = PUNE;
    const spec = p.components.panel!;
    const free = shadowFreePitchM(PUNE.latLng.lat, PUNE.latLng.lng, 15, spec.lengthMm / 1000, 180);
    p.segments = [segWithPitch(free - 0.5)];
    const out = byAnalyzer(p, 'row-spacing');
    expect(out).toHaveLength(1);
    expect(out[0].title).toContain('A1');
    expect(out[0].evidence.join(' ')).toContain('shadowFree');
  });

  it('stays silent at shadow-free pitch, on flush racking and single rows', () => {
    const p = fixtureProject(6);
    p.location = PUNE;
    const spec = p.components.panel!;
    const free = shadowFreePitchM(PUNE.latLng.lat, PUNE.latLng.lng, 15, spec.lengthMm / 1000, 180);
    p.segments = [segWithPitch(free + 0.1)];
    expect(byAnalyzer(p, 'row-spacing')).toHaveLength(0);

    p.segments = [segWithPitch(free - 0.5, 1)]; // one row cannot shade itself
    expect(byAnalyzer(p, 'row-spacing')).toHaveLength(0);

    p.segments = [{ ...segWithPitch(free - 0.5), racking: { kind: 'flush' } }];
    expect(byAnalyzer(p, 'row-spacing')).toHaveLength(0);
  });
});
