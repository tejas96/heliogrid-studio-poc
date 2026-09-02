import { describe, expect, it } from 'vitest';
import { roofHeightIssues } from '../surround-check';
import { cutSurroundForRoofs, roofReadingsFor, type SurroundHeights } from '../surround-geometry';
import { fixtureProject, fixtureRoof } from './fixtures/project';

/** A flat 0.5 m grid, 60 × 60 m around the origin, every cell at `h`. */
function flatGrid(h: number): SurroundHeights {
  const cols = 120;
  const rows = 120;
  return {
    cols,
    rows,
    originEN: { x: -30, y: 30 },
    stepCol: { x: 0.5, y: 0 },
    stepRow: { x: 0, y: -0.5 },
    heights: new Float32Array(cols * rows).fill(h),
  };
}

const project = () => ({ ...fixtureProject(0), roofs: [fixtureRoof({ heightM: 3 })] });

describe('roofHeightIssues — the model held against the aerial height map', () => {
  it('warns when the map reads far from the model, in plain words', () => {
    const issues = roofHeightIssues(project(), flatGrid(6.5));
    expect(issues).toHaveLength(1);
    expect(issues[0].level).toBe('warn');
    expect(issues[0].code).toBe('roof_height_vs_map');
    expect(issues[0].message).toContain('3.0 m in the model');
    expect(issues[0].message).toContain('≈ 6.5 m');
    expect(issues[0].message).toContain('taller by 3.5 m');
  });

  it('stays quiet within the tolerance or without a grid', () => {
    expect(roofHeightIssues(project(), flatGrid(4.2))).toEqual([]);
    expect(roofHeightIssues(project(), null)).toEqual([]);
  });

  it('reads the roof from the UNCUT grid and cuts the roof out for the casters', () => {
    const p = project();
    const g = flatGrid(6.5);
    expect(roofReadingsFor(g, p.roofs)).toEqual({ roof_1: 6.5 });
    const cut = cutSurroundForRoofs(g, p.roofs);
    expect(cut).not.toBe(g);
    expect(roofReadingsFor(cut, p.roofs)).toEqual({ roof_1: 0 });
    // outside the roof (and its margin) the raster is untouched
    expect(cut.heights[0]).toBe(6.5);
    expect(cutSurroundForRoofs(g, [])).toBe(g);
  });
});
