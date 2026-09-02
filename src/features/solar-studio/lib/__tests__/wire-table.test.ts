import { describe, expect, it } from 'vitest';
import { wireTableToggle } from '../electrical/wire-table';
import type { PlacedPanel } from '../../types';

function panel(id: string, segmentId: string | undefined, cellIndex: number, enabled = true) {
  return { id, segmentId, cellIndex, enabled } as unknown as PlacedPanel;
}

// one table of four, laid out out of order on purpose, plus a loose module
const panels = [
  panel('c', 'segA', 2),
  panel('a', 'segA', 0),
  panel('d', 'segA', 3),
  panel('b', 'segA', 1),
  panel('off', 'segA', 4, false),
  panel('loose', undefined, 0),
  panel('other', 'segB', 0),
];

/**
 * The gate for the tap count. Hand-wiring was one tap per module, so a
 * 40-module table cost 40 taps and nobody used it twice.
 */
describe('shift-clicking a module takes its whole table', () => {
  it('takes every enabled module of that table, in cell order', () => {
    expect(wireTableToggle(panels, 'c', [])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves a disabled module out — it cannot be wired', () => {
    expect(wireTableToggle(panels, 'a', [])).not.toContain('off');
  });

  it('keeps what is already in the string and adds only the rest', () => {
    expect(wireTableToggle(panels, 'a', ['other', 'b'])).toEqual(['other', 'b', 'a', 'c', 'd']);
  });

  it('gives the table back when it is already all in — the gesture undoes itself', () => {
    expect(wireTableToggle(panels, 'a', ['other', 'a', 'b', 'c', 'd'])).toEqual(['other']);
  });

  it('never touches another table', () => {
    expect(wireTableToggle(panels, 'a', ['other'])).toContain('other');
    expect(wireTableToggle(panels, 'other', [])).toEqual(['other']);
  });

  it('refuses a loose module, so the caller takes just that one', () => {
    expect(wireTableToggle(panels, 'loose', [])).toBeNull();
  });
});
