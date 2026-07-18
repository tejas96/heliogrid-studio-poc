import { describe, expect, it } from 'vitest';
import { cascadeDeletePanels, cascadeDeleteRoof } from '../cascade';
import { computeEnergyReport } from '../solar';
import { deriveBom } from '../bom';
import { fixtureProject, fixtureRoof, fixturePanels } from './fixtures/project';
import type { Obstruction, Project, Walkway } from '../../types';

function fixtureObstruction(roofId: string | null, id = 'ob_1'): Obstruction {
  return {
    id,
    type: 'tank',
    label: 'WT1',
    roofId,
    center: { x: 0, y: 0 },
    shape: 'rect',
    lengthM: 2,
    widthM: 1.5,
    diameterM: 2,
    heightM: 1.2,
    rotationDeg: 0,
    setbackM: 0.5,
    castsShadow: true,
    blocksPlacement: true,
  };
}

/** two roofs, panels on both, string across roof_1's panels, deps on roof_1 */
function twoRoofProject(): Project {
  const base = fixtureProject(8); // 8 panels + 1 string on roof_1
  const roof2 = fixtureRoof({ id: 'roof_2', name: 'Roof 2' });
  const roof2Panels = fixturePanels(4, 'roof_2').map((p, i) => ({
    ...p,
    id: `pv2_${i + 1}`,
  }));
  const walkway: Walkway = {
    id: 'wk_1',
    roofId: 'roof_1',
    a: { x: -5, y: 0 },
    b: { x: 5, y: 0 },
    widthMm: 600,
    heightMm: 50,
  };
  return {
    ...base,
    roofs: [...base.roofs, roof2],
    panels: [...base.panels, ...roof2Panels],
    obstructions: [fixtureObstruction('roof_1'), fixtureObstruction(null, 'ob_ground')],
    walkways: [walkway],
    rails: [{ id: 'rl_1', roofId: 'roof_1', a: { x: -5, y: 2 }, b: { x: 5, y: 2 }, heightMm: 1000 }],
    arresters: [{ id: 'la_1', roofId: 'roof_1', pos: { x: 0, y: 3 }, heightMm: 2000 }],
    inverterPlacements: [{ id: 'ip_1', roofId: 'roof_1', edgeIndex: 0, t: 0.5, heightM: 1.5 }],
  };
}

describe('cascadeDeleteRoof — zero orphans', () => {
  it('removes every entity living on the roof and prunes strings', () => {
    const project = twoRoofProject();
    const patch = cascadeDeleteRoof(project, 'roof_1');
    const next = { ...project, ...patch };

    expect(next.roofs.map((r) => r.id)).toEqual(['roof_2']);
    expect(next.panels.every((p) => p.roofId === 'roof_2')).toBe(true);
    expect(next.obstructions.map((o) => o.id)).toEqual(['ob_ground']); // ground survives
    expect(next.walkways).toHaveLength(0);
    expect(next.rails).toHaveLength(0);
    expect(next.arresters).toHaveLength(0);
    expect(next.inverterPlacements).toHaveLength(0);
    // the string contained only roof_1 panels → dropped entirely
    expect(next.strings).toHaveLength(0);
  });

  it('energy report and BOM no longer count the deleted roof panels', () => {
    const project = twoRoofProject();
    const next = { ...project, ...cascadeDeleteRoof(project, 'roof_1') };
    const report = computeEnergyReport(next);
    const watt = project.components.panel!.watt;
    expect(report.panelCount).toBe(4);
    expect(report.capacityKwp).toBeCloseTo((4 * watt) / 1000, 3);
    const modules = deriveBom(next).find((l) => l.category === 'Modules')!;
    expect(modules.qty).toBe(4);
  });

  it('strings keep panels from surviving roofs', () => {
    const project = twoRoofProject();
    // one string mixing both roofs' panels
    const mixed = {
      ...project,
      strings: [
        {
          id: 'str_m',
          name: 'S',
          inverterIndex: 0,
          mpptIndex: 0,
          panelIds: ['pv_1', 'pv2_1', 'pv2_2'],
          color: '#000',
        },
      ],
    };
    const next = { ...mixed, ...cascadeDeleteRoof(mixed, 'roof_1') };
    expect(next.strings).toHaveLength(1);
    expect(next.strings[0].panelIds).toEqual(['pv2_1', 'pv2_2']);
  });
});

describe('cascadeDeletePanels — strings pruned, not wiped', () => {
  it('removes only the dead ids from strings and drops emptied strings', () => {
    const project = fixtureProject(8);
    const next = { ...project, ...cascadeDeletePanels(project, ['pv_1', 'pv_2']) };
    expect(next.panels.map((p) => p.id)).not.toContain('pv_1');
    expect(next.strings).toHaveLength(1);
    expect(next.strings[0].panelIds).toHaveLength(6);
    const all = { ...project, ...cascadeDeletePanels(project, project.panels.map((p) => p.id)) };
    expect(all.panels).toHaveLength(0);
    expect(all.strings).toHaveLength(0);
  });
});
