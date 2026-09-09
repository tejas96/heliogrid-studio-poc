// ─── The gate: the shaded-module cut counts what a cutoff would remove ──────
import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { shadedBelow } from '../shade-cut';
import { fixtureProject, fixtureRoof } from './fixtures/project';

describe('shadedBelow', () => {
  it('cuts enabled modules under the cutoff, groups them by roof, and prices the capacity', () => {
    const p = fixtureProject(6);
    const roof2 = fixtureRoof({ id: 'roof_2', name: 'Mumty 1' });
    const project: Project = {
      ...p,
      roofs: [p.roofs[0], roof2],
      panels: p.panels.map((x, i) => ({
        ...x,
        roofId: i === 5 ? 'roof_2' : x.roofId,
        solarAccess: [1, 0.9, 0.69, 0.5, 0.2, 0.3][i],
        enabled: i !== 4, // the darkest one is already switched off
      })),
    };
    const wp = project.components.panel!.watt;
    const at70 = shadedBelow(project, 70);
    expect(at70.ids).toEqual(['pv_3', 'pv_4', 'pv_6']);
    expect(at70.total).toBe(5);
    expect(at70.byRoof).toEqual([
      { roofId: 'roof_1', name: 'Roof 1', count: 2 },
      { roofId: 'roof_2', name: 'Mumty 1', count: 1 },
    ]);
    expect(at70.kwp).toBeCloseTo((3 * wp) / 1000, 2);
    // the slider moves the answer, and a module exactly at the cutoff stays
    expect(shadedBelow(project, 90).ids).toEqual(['pv_3', 'pv_4', 'pv_6']);
    expect(shadedBelow(project, 91).ids).toEqual(['pv_2', 'pv_3', 'pv_4', 'pv_6']);
    expect(shadedBelow(project, 10).ids).toEqual([]);
  });
});
