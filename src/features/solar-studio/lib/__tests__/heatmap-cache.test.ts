// ─── The gate: one roof heatmap per geometry, shared, never re-keyed by a module ─
//
// Both views keyed the roof heatmap on shadingFp, which serialises every
// module centre to the centimetre — yet computeHeatmap has no module
// dependency at all. Nudging one module threw the whole 12-month map away
// (~5.5 × 10⁵ rays) and rebuilt it, and each view held its own one-entry
// cache, so 2D → 3D rebuilt the identical map a second time.
import { describe, expect, it } from 'vitest';
import type { Obstruction, Project } from '../../types';
import { heatmapFp, shadingFp } from '../fingerprints';
import { peekHeatmap, requestHeatmap } from '../heatmap-cache';
import { fixtureProject } from './fixtures/project';

function site(): Project {
  return {
    ...fixtureProject(4),
    location: {
      address: 't',
      latLng: { lat: 18.52, lng: 73.86 },
      confirmed: true,
      irradiance: 5.3,
      peakSunHours: 5.3,
      dataSource: 't',
    },
  };
}

const tank: Obstruction = {
  id: 'ob_1',
  type: 'tank',
  label: 'WT1',
  roofId: 'roof_1',
  center: { x: 2, y: 2 },
  shape: 'circle',
  lengthM: 0,
  widthM: 0,
  diameterM: 1.5,
  heightM: 1.2,
  rotationDeg: 0,
  setbackM: 0.3,
  castsShadow: true,
  blocksPlacement: true,
};

describe('heatmapFp — the map is keyed on what it reads', () => {
  it('a module nudge does not re-key the map; the old key did', () => {
    const p = site();
    const nudged: Project = {
      ...p,
      panels: p.panels.map((x, i) => (i === 0 ? { ...x, center: { x: x.center.x + 0.01, y: x.center.y } } : x)),
    };
    expect(heatmapFp(nudged)).toBe(heatmapFp(p));
    expect(shadingFp(nudged)).not.toBe(shadingFp(p));
  });

  it('a moved obstruction and the neighbour-shade switch DO re-key it', () => {
    const p: Project = { ...site(), obstructions: [tank] };
    const moved: Project = { ...p, obstructions: [{ ...tank, center: { x: 3, y: 2 } }] };
    expect(heatmapFp(moved)).not.toBe(heatmapFp(p));
    const surround = {
      source: 'google-solar',
      imageryDate: '2024-01-01',
      radiusM: 100,
      stepM: 1,
      cols: 10,
      rows: 10,
      blobId: 'blob_1',
    } as unknown as Project['surround'];
    const withGrid: Project = { ...p, surround };
    const gridOff: Project = { ...withGrid, ignoreSurround: true };
    expect(heatmapFp(withGrid)).not.toBe(heatmapFp(p));
    expect(heatmapFp(gridOff)).not.toBe(heatmapFp(withGrid));
  });
});

describe('heatmap-cache — one run, shared, cancelled only when nobody waits', () => {
  it('two views asking for the same key share the run and the result, which is then cached', async () => {
    const p = site();
    let ticksA = 0;
    let ticksB = 0;
    const a = requestHeatmap(p, 'shared-key', () => ticksA++);
    const b = requestHeatmap(p, 'shared-key', () => ticksB++);
    expect(a.promise).toBe(b.promise);
    const res = await a.promise;
    expect(res).not.toBeNull();
    expect(res!.cells.length).toBeGreaterThan(0);
    expect(ticksA).toBeGreaterThan(0);
    expect(ticksB).toBe(ticksA);
    expect(peekHeatmap('shared-key')).toBe(res);
    a.release();
    b.release();
    // a third view, later, gets the same object without a run
    expect(await requestHeatmap(p, 'shared-key').promise).toBe(res);
  });

  it('releasing the only asker cancels the run and keeps nothing', async () => {
    const r = requestHeatmap(site(), 'lonely-key');
    r.release();
    expect(await r.promise).toBeNull();
    expect(peekHeatmap('lonely-key')).toBeNull();
  });
});
