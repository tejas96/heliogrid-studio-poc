// ─── Gate: a grown row can be narrower than the table ───────────────────────
// growCandidates always emitted a FULL lattice row — `for (c = 0; c < cols)` —
// so a row that must be 6 wide beside a 9-wide table meant adding 9 and erasing
// 3, one module per tap. Real roofs step in and out around a stair head.
// The default must stay full width, because five existing call sites rely on it.
import { describe, expect, it } from 'vitest';
import type { Project } from '../../types';
import { COL_STRIDE, DEFAULT_FILL, fillRoofAsSegment } from '../layout';
import { growCandidates, growSegment } from '../segment-ops';
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
  // shrink the table by one row so there is always room to grow into
  const keep = f.panels.filter((p) => Math.floor((p.cellIndex ?? 0) / COL_STRIDE) > 0);
  return { ...base, segments: [f.segment], panels: keep };
}

describe('growCandidates span', () => {
  it('defaults to the full width, exactly as before', () => {
    const p = filled();
    const spec = p.components.panel!;
    const seg = p.segments[0];
    const full = growCandidates(p, p.roofs[0], spec, seg, 'row', 'bottom', 1);
    const same = growCandidates(p, p.roofs[0], spec, seg, 'row', 'bottom', 1, {});
    expect(full.length).toBeGreaterThan(1);
    expect(same.length).toBe(full.length);
  });

  it('a narrower span adds fewer modules, and the op reports the width it added', () => {
    const p = filled();
    const spec = p.components.panel!;
    const seg = p.segments[0];
    const full = growCandidates(p, p.roofs[0], spec, seg, 'row', 'bottom', 1);
    const narrow = growCandidates(p, p.roofs[0], spec, seg, 'row', 'bottom', 1, { span: 2 });
    expect(narrow.length).toBeLessThan(full.length);
    expect(narrow.length).toBeLessThanOrEqual(2);
    // the offset slides the same-width row along the table
    const shifted = growCandidates(p, p.roofs[0], spec, seg, 'row', 'bottom', 1, { span: 2, offset: 1 });
    expect(shifted.length).toBeLessThanOrEqual(2);
    if (narrow.length === 2 && shifted.length === 2) {
      expect(shifted[0].center).not.toEqual(narrow[0].center);
    }
    // and growSegment threads it through rather than quietly widening
    const grown = growSegment(p, p.roofs[0], spec, seg, 'row', 'bottom', 1, { span: 2 });
    expect(grown.added).toBe(narrow.length);
  });
});
