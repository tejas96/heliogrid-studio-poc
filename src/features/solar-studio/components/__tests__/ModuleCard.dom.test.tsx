// @vitest-environment jsdom
// ─── The gate: the on-object card renders in plain DOM — no <Canvas> needed ─
// The scene's card lived on drei <Html>, which only works inside r3f. This one
// is the same body as a DOM component, so the plan editor can mount it in a
// <foreignObject>. Pin what it says and what it offers.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModuleCard } from '../ModuleCard';
import { fixtureProject } from '../../lib/__tests__/fixtures/project';
import type { ArraySegment, Project } from '../../types';

afterEach(cleanup);

function site(): Project {
  const p = fixtureProject(4);
  const seg: ArraySegment = {
    id: 'seg_1',
    roofId: 'roof_1',
    label: 'A1',
    polygon: [],
    rows: 2,
    cols: 2,
    orientation: 'portrait',
    azimuthDeg: 180,
    moduleGapM: 0.05,
    removed: [],
    racking: { kind: 'flush' } as ArraySegment['racking'],
  };
  return {
    ...p,
    location: { address: 't', latLng: { lat: 18.52, lng: 73.86 }, confirmed: true, irradiance: 5.3, peakSunHours: 5.3, dataSource: 't' },
    segments: [seg],
    panels: p.panels.map((x, i) => ({ ...x, segmentId: 'seg_1', cellIndex: i })),
    obstructions: [
      {
        id: 'ob_tank',
        type: 'tank',
        label: 'WT1',
        roofId: 'roof_1',
        center: { x: -6, y: -2 },
        shape: 'circle',
        lengthM: 0,
        widthM: 0,
        diameterM: 2,
        heightM: 3,
        rotationDeg: 0,
        setbackM: 0.3,
        castsShadow: true,
        blocksPlacement: true,
      },
    ],
  };
}

describe('ModuleCard', () => {
  it('names the table, its size and pose, the module’s sun share, and offers the table sheet', async () => {
    const onTable = vi.fn();
    const onClose = vi.fn();
    render(<ModuleCard project={site()} panelId="pv_1" onClose={onClose} onTableSettings={onTable} />);
    expect(screen.getByRole('dialog', { name: 'Table A1' })).toBeTruthy();
    expect(screen.getByText(/4 modules · .* kWp · 2×2/)).toBeTruthy();
    expect(screen.getByText(/10° · facing 180° · portrait · Roof 1/)).toBeTruthy();
    expect(screen.getByText('sun')).toBeTruthy(); // the yield headline's unit word
    await userEvent.click(screen.getByRole('button', { name: 'Table…' }));
    expect(onTable).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('turns the biggest obstruction blocker into an Erase action, when there is one', async () => {
    const onErase = vi.fn();
    render(<ModuleCard project={site()} panelId="pv_1" onClose={() => {}} onEraseObstruction={onErase} />);
    const erase = screen.queryByRole('button', { name: /^Erase / });
    // the fixture tank stands 2 m west of the first module: whether it takes
    // beam from it is the engine's call — what is pinned is that IF it does,
    // the card offers to erase exactly that obstruction
    if (erase) {
      await userEvent.click(erase);
      expect(onErase).toHaveBeenCalledWith('ob_tank', 'WT1');
    } else {
      expect(screen.getByText('Nothing blocks this module')).toBeTruthy();
    }
  });
});
