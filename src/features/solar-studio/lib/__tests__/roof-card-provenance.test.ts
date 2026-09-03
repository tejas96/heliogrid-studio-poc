import { describe, expect, it } from 'vitest';
import { HEIGHT_SOURCE_NAME, OUTLINE_SOURCE_NAME } from '../../three/Scene3D';

/**
 * A roof's HEIGHT and its OUTLINE have separate sources. The owner's tower had
 * its height measured off Google's aerial map while its outline was traced by
 * hand — and the 3D card printed only the outline's word, on the line under
 * the eave height, with nothing to say which number it described. It read
 * "74.7 m eave / flat · rcc flat · traced by hand", so a MEASURED number
 * looked hand-typed.
 *
 * The house rule is that every user-visible number carries its tier. A number
 * wearing somebody else's tier is worse than one wearing none, so the two
 * vocabularies must stay separate and must never overlap.
 */
describe('the roof card cannot confuse a height with an outline', () => {
  it('names every height source, including one that was never recorded', () => {
    expect(Object.keys(HEIGHT_SOURCE_NAME).sort()).toEqual(['aerial_map', 'unknown', 'user']);
    for (const words of Object.values(HEIGHT_SOURCE_NAME)) expect(words.length).toBeGreaterThan(0);
  });

  it('names every outline source and says the word "outline" in each', () => {
    expect(Object.keys(OUTLINE_SOURCE_NAME).sort()).toEqual(['dataLayers', 'gemini', 'manual']);
    for (const words of Object.values(OUTLINE_SOURCE_NAME)) expect(words).toContain('outline');
  });

  it('never gives a height and an outline the same words', () => {
    const heights = Object.values(HEIGHT_SOURCE_NAME);
    const outlines = Object.values(OUTLINE_SOURCE_NAME);
    for (const h of heights) expect(outlines).not.toContain(h);
  });

  it('does not let a measured height read as hand-made', () => {
    expect(HEIGHT_SOURCE_NAME.aerial_map).not.toMatch(/hand/i);
    expect(HEIGHT_SOURCE_NAME.user).toMatch(/hand/i);
  });
});
