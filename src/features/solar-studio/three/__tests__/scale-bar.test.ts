// ─── The gate: the elevations carry a scale that is right for the zoom ───────
// "Front / Back / Left / Right" used to be a 40° lens tilted 17° down — print
// one and nothing on it could be measured. They are parallel projections now,
// and this pins the bar that makes a print measurable: a round length in the
// user's own unit, the longest that fits the bar's on-screen budget.
import { describe, expect, it } from 'vitest';
import { scaleBarLength } from '../ScaleBar';

describe('scaleBarLength', () => {
  it('picks the longest round length that fits 260 px, in metres', () => {
    // r3f sizes the orthographic frustum in CSS px, so zoom is px per metre
    expect(scaleBarLength(4, false)).toBe(50); // 200 px; 100 m would be 400
    expect(scaleBarLength(18, false)).toBe(10); // 180 px, as seen live on the 16 m roof
    expect(scaleBarLength(250, false)).toBe(1); // 250 px
    expect(scaleBarLength(2000, false)).toBe(0.2); // the smallest step, even past budget
  });

  it('picks round feet for an imperial user', () => {
    const ft = 0.3048;
    expect(scaleBarLength(18, true)).toBeCloseTo(20 * ft, 9); // 110 px; 50 ft would be 274
    expect(scaleBarLength(4, true)).toBeCloseTo(200 * ft, 9); // 244 px
  });
});
