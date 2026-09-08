// ─── Gate: orientation and module gap actually re-lay the table ─────────────
// `lib/layout.ts` has honoured `orientation` end to end since the beginning, and
// three/PanelsInstanced.tsx even keeps a separate instanced mesh for landscape
// modules — but five call sites in the editor passed the literal 'portrait', so
// nothing in the product could produce the case the renderer was ready to draw.
// The trap this pins: neither field may be WRITTEN on its own. Both change the
// lattice pitch, so the modules must be re-laid, or the stored grid stops
// describing the panels and reindex/grow/duplicate silently corrupt.
import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { relaySegment, segmentGrid } from '../segment-ops';
import { previewOp } from '../ops/run';
import { segmentSetLayout } from '../ops/layout-ops';
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

describe('relaySegment', () => {
  it('flipping to landscape re-lays every module, not just the flag', () => {
    const p = filled();
    const spec = p.components.panel!;
    const r = relaySegment(p, p.roofs[0], spec, p.segments[0], { orientation: 'landscape' })!;
    expect(r).not.toBeNull();
    expect(r.segment.orientation).toBe('landscape');
    // every module carries the new pose — a flag-only write would leave these portrait
    expect(r.panels.every((x) => x.orientation === 'landscape')).toBe(true);
    // and the stored grid describes the panels it now has
    const g = segmentGrid(p.roofs[0], spec, r.segment, r.panels);
    expect(g.pitchX).toBeGreaterThan(0);
    expect(r.segment.rows * r.segment.cols).toBeGreaterThanOrEqual(r.panels.length);
  });

  it('a wider module gap spreads the lattice and fits fewer modules', () => {
    const p = filled();
    const spec = p.components.panel!;
    const before = p.panels.length;
    const r = relaySegment(p, p.roofs[0], spec, p.segments[0], { moduleGapM: 0.5 })!;
    expect(r).not.toBeNull();
    expect(r.segment.moduleGapM).toBe(0.5);
    // the extent does not grow, so a coarser lattice holds fewer modules —
    // the honest answer, and the one the impact line must report
    expect(r.panels.length).toBeLessThan(before);
  });

  it('changing nothing is refused rather than burning an undo entry', () => {
    const p = filled();
    const seg = p.segments[0];
    expect(relaySegment(p, p.roofs[0], p.components.panel!, seg, { orientation: seg.orientation })).toBeNull();
    const r = previewOp(p, segmentSetLayout, { segmentId: seg.id });
    expect(r.ok).toBe(false);
  });

  it('the op reports the module loss instead of shrinking the table quietly', () => {
    const p = filled();
    const r = previewOp(p, segmentSetLayout, { segmentId: p.segments[0].id, moduleGapM: 0.5 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.impact.delta.modules).toBeLessThan(0);
    expect(r.impact.delta.kwp).toBeLessThan(0);
  });
});
