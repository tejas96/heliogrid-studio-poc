// ─── Gate: deleting whole rows keeps the table, and says what it cost ───────
// The MECHANISM was never missing — cascadeDeletePanels already reindexes the
// table, prunes the strings and prunes the routes, and a marquee plus Delete
// always reached it. What was missing was a way to say "these rows" and a number
// before committing. So this pins the two things that are actually new: the
// lines are addressable, and emptying a table is refused rather than silently
// leaving a segment with no modules.
import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { segmentLines } from '../segment-ops';
import { previewOp } from '../ops/run';
import { layoutDeleteLines } from '../ops/layout-ops';
import { fixtureProject, fixtureRoof } from './fixtures/project';

function filled(): Project {
  const base: Project = {
    ...fixtureProject(0),
    roofs: [fixtureRoof()],
    obstructions: [],
    walkways: [],
    keepouts: [],
    panels: [],
    segments: [],
    strings: [],
  };
  const f = fillRoofAsSegment(base, base.roofs[0], base.components.panel!, DEFAULT_FILL)!;
  return { ...base, segments: [f.segment], panels: f.panels };
}

describe('layoutDeleteLines', () => {
  it('addresses real lattice rows, and every module belongs to exactly one', () => {
    const p = filled();
    const lines = segmentLines(p, p.roofs[0], p.components.panel!, p.segments[0], 'row');
    expect(lines.length).toBeGreaterThan(1);
    const all = lines.flatMap((l) => l.panelIds);
    expect(new Set(all).size).toBe(all.length); // no module in two rows
    expect(all.length).toBe(p.panels.length);
    expect(lines.every((l) => l.corners.length === 4)).toBe(true);
  });

  it('deletes an INTERIOR row, keeps the table, and reports the loss', () => {
    const p = filled();
    const lines = segmentLines(p, p.roofs[0], p.components.panel!, p.segments[0], 'row');
    const middle = lines[Math.floor(lines.length / 2)];
    const r = previewOp(p, layoutDeleteLines, {
      segmentId: p.segments[0].id,
      axis: 'row',
      indices: [middle.index],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.next.panels.length).toBe(p.panels.length - middle.panelIds.length);
    expect(r.next.segments).toHaveLength(1); // the table survives
    expect(r.impact.delta.modules).toBe(-middle.panelIds.length);
    expect(r.impact.delta.kwp).toBeLessThan(0);
    expect(r.impact.label).toBe('Delete 1 row');
  });

  it('refuses to empty the table that way, and refuses an empty mark', () => {
    const p = filled();
    const lines = segmentLines(p, p.roofs[0], p.components.panel!, p.segments[0], 'row');
    const all = previewOp(p, layoutDeleteLines, {
      segmentId: p.segments[0].id,
      axis: 'row',
      indices: lines.map((l) => l.index),
    });
    expect(all.ok).toBe(false);
    const none = previewOp(p, layoutDeleteLines, {
      segmentId: p.segments[0].id,
      axis: 'row',
      indices: [],
    });
    expect(none.ok).toBe(false);
  });
});
