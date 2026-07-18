// ─── Shared test fixture: a minimal, valid designed project ─────────────────
// One flat RCC roof, components selected, a small enabled panel grid and one
// committed string — enough for finance/BOM/cascade/SLD tests without any UI.
import type { PlacedPanel, Project, Roof, StringDef } from '../../../types';
import { newProject } from '../../../store/store';
import { PANEL_DB } from '../../../data/panels';
import { INVERTER_DB } from '../../../data/inverters';

export function fixtureRoof(over: Partial<Roof> = {}): Roof {
  return {
    id: 'roof_1',
    name: 'Roof 1',
    polygon: [
      { x: -8, y: -6 },
      { x: 8, y: -6 },
      { x: 8, y: 6 },
      { x: -8, y: 6 },
    ],
    roofType: 'rcc_flat',
    heightM: 3,
    pitchDeg: 0,
    slopeAzimuthDeg: 180,
    setbackM: 0.3,
    perEdgeSetbacksM: null,
    parapet: {
      enabled: false,
      direction: 'inward',
      heightM: 1,
      widthM: 0.3,
      perEdge: null,
      suppressSharedEdges: true,
    },
    ...over,
  };
}

export function fixturePanels(count: number, roofId = 'roof_1'): PlacedPanel[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `pv_${i + 1}`,
    roofId,
    center: { x: -6 + (i % 6) * 2.4, y: -4 + Math.floor(i / 6) * 1.2 },
    orientation: 'portrait' as const,
    azimuthDeg: 180,
    tiltDeg: 10,
    solarAccess: 1,
    enabled: true,
  }));
}

/** A designed project: roof + components + `count` panels + one string. */
export function fixtureProject(count = 8): Project {
  const p = newProject();
  const panels = fixturePanels(count);
  const strings: StringDef[] = [
    {
      id: 'str_1',
      name: 'String 1',
      inverterIndex: 0,
      mpptIndex: 0,
      panelIds: panels.map((x) => x.id),
      color: '#f59e0b',
    },
  ];
  return {
    ...p,
    info: { ...p.info, state: 'Maharashtra', discom: 'MSEDCL' },
    roofs: [fixtureRoof()],
    panels,
    strings,
    components: {
      panel: PANEL_DB.find((x) => x.dcr) ?? PANEL_DB[0],
      inverter: INVERTER_DB[1],
      inverterCount: 1,
      targetKwp: (count * (PANEL_DB[0]?.watt ?? 550)) / 1000,
    },
  };
}
