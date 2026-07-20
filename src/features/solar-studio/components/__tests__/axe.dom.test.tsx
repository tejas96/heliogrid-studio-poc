// @vitest-environment jsdom
// ─── Phase 22p: axe-core on what jsdom can actually render ──────────────────
// An automated pass catches the mechanical failures — a control with no name,
// a table with no header association, an aria attribute on an element that
// cannot carry it. It does NOT catch whether the thing makes sense to use, so
// this sits alongside the hand-written gates rather than replacing them.
//
// SCOPE, stated plainly: everything inside <Canvas> is out of reach. R3F needs
// WebGL and jsdom has none, so the structure panel and the 3D scene are still
// verified by hand. What is covered is the BOM row, the drawing sheets, the
// modal surfaces and the leg-plan editor.
import { describe, expect, it, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import axe from 'axe-core';
import { BomRow } from '../../screens/Step9Bom/BomRow';
import { Dialog, DataTable, NumberField, Sheet, SR_ONLY, TextField } from '../ui';
import { StructureSheet } from '../drawing/StructureSheet';
import { LegPlanEditor } from '../../three/LegPlanEditor';
import { DEFAULT_FILL, fillRoofAsSegment } from '../../lib/layout';
import { fixtureProject, fixtureRoof } from '../../lib/__tests__/fixtures/project';
import type { BomLine, Project } from '../../types';

afterEach(cleanup);

/** Run axe and return only genuine violations, with readable messages. */
async function violations(container: HTMLElement): Promise<string[]> {
  const results = await axe.run(container, {
    // colour contrast needs real layout and computed styles, which jsdom fakes
    // — running it here produces noise, not findings
    rules: { 'color-contrast': { enabled: false } },
  });
  return results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.length}× e.g. ${v.nodes[0]?.html?.slice(0, 80)})`,
  );
}

function tableProject(): Project {
  const base = fixtureProject(0);
  const p: Project = { ...base, roofs: [fixtureRoof()] };
  const f = fillRoofAsSegment(p, p.roofs[0], p.components.panel!, {
    ...DEFAULT_FILL,
    maxPanels: 8,
  })!;
  return { ...p, segments: [f.segment], panels: f.panels };
}

const line: BomLine = {
  id: 'elec.dc_cable',
  category: 'Electrical BOS',
  item: 'DC Solar Cable',
  spec: '4 sq.mm Cu',
  qty: 100,
  unit: 'm',
  unitPriceInr: 68,
  formula: 'Routed home runs 83 m',
  confidence: 'derived',
  auto: true,
  overridden: false,
  included: true,
  wastePct: 8,
  gstPct: 5,
};

describe('axe-core', () => {
  it('the Step-9 row, inside a real DataTable', async () => {
    const { container } = render(
      <DataTable
        caption="Electrical BOS bill of materials"
        columns={[
          { key: 'item', label: 'Item' },
          { key: 'spec', label: 'Spec' },
          { key: 'qty', label: 'Qty' },
          { key: 'waste', label: 'Waste' },
          { key: 'order', label: 'Order qty' },
          { key: 'rate', label: 'Rate' },
          { key: 'amount', label: 'Amount' },
          { key: 'gstpct', label: 'GST' },
          { key: 'gst', label: 'GST ₹' },
          { key: 'total', label: 'Total' },
          { key: 'actions', label: <span style={SR_ONLY}>Actions</span> },
        ]}
      >
        <BomRow line={line} marginPct={12} onEdit={vi.fn()} onReset={vi.fn()} />
      </DataTable>,
    );
    expect(await violations(container)).toEqual([]);
  });

  it('the form primitives', async () => {
    const { container } = render(
      <div>
        <NumberField value={5} onCommit={vi.fn()} ariaLabel="Waste allowance" />
        <TextField value="Crane hire" onCommit={vi.fn()} ariaLabel="Line name" />
      </div>,
    );
    expect(await violations(container)).toEqual([]);
  });

  it('the modal surfaces', async () => {
    const { container } = render(
      <Dialog title="Discard all BOM edits?" onClose={vi.fn()} actions={<button>Cancel</button>}>
        <p>Body</p>
      </Dialog>,
    );
    expect(await violations(container)).toEqual([]);
  });

  it('the sheet surface', async () => {
    const { container } = render(
      <Sheet title="Structure" onClose={vi.fn()}>
        <button>Inside</button>
      </Sheet>,
    );
    expect(await violations(container)).toEqual([]);
  });

  it('the structure drawing sheet', async () => {
    const { container } = render(<StructureSheet project={tableProject()} />);
    expect(await violations(container)).toEqual([]);
  });

  it('the Legs (2D) editor', async () => {
    const p = tableProject();
    const { container } = render(
      <LegPlanEditor
        project={p}
        roof={p.roofs[0]}
        seg={p.segments[0]}
        spec={p.components.panel!}
        panels={p.panels}
        legSpacingM={2}
        onPatch={vi.fn()}
        fmtLen={(m) => `${m.toFixed(2)} m`}
      />,
    );
    expect(await violations(container)).toEqual([]);
  });
});
