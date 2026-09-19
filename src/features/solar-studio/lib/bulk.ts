// ─── Operations on arrays as big as the DESIGN, without the argument spread ─
// `Math.min(...xs)` and `xs.push(...ys)` pass every element as a separate
// function ARGUMENT. The
// JS engine puts arguments on the call stack, so past roughly 60,000–125,000
// elements (the exact number is engine- and frame-dependent, which is what
// makes it so nasty) the call throws:
//
//     RangeError: Maximum call stack size exceeded
//
// Measured in this repo, not theorised: auto-designing a 600 m × 600 m field —
// 36 ha, entirely ordinary for an Indian ground-mount job — produced ~128,000
// modules and `fillRoofAsSegment` threw exactly that, from
//
//     Math.max(...panels.map((p) => Math.floor((p.cellIndex ?? 0) / COL_STRIDE)))
//
// Fixing that one line moved the crash three frames up, to `auto-design.ts`:
//
//     panels.push(...re.panels);
//
// — the same hazard wearing different clothes. That is why this is a module
// and not two inline loops: the bug is the SPREAD, not the callee, and it will
// keep reappearing wherever someone reaches for the idiomatic form on a list
// whose length is set by how much land the customer owns.
//
// The failure mode is the reason this file exists rather than a code-review
// note. It is not a slowdown that a progress bar could cover: the design is
// already computed — the fill itself took 61 ms for 72,000 modules — and then
// the very last step throws it all away. And it is invisible until the day a
// customer has enough land, because every roof, and every field up to about
// 450 m, passes straight through.
//
// The loops below are also FASTER than the spread at every size, because they
// allocate no argument list. There is no case where the spread is preferable.
//
// Scope: use these wherever the array length follows the DESIGN (modules,
// their local coordinates, their 3D parts, the panels of a roof or a string
// group). Polygon corners, monthly totals and structure nodes are bounded by
// the physical thing they describe and are left with the spread, which reads
// better for four points.

/**
 * Append every item of `src` to `dst`, in place.
 *
 * The idiomatic `dst.push(...src)` is the same argument-spread trap: measured,
 * `panels.push(...re.panels)` in the auto-designer threw RangeError on a 36 ha
 * field. `concat` would be correct but allocates a whole new array each call,
 * which inside a per-roof loop is quadratic in the number of modules.
 */
export function pushAll<T>(dst: T[], src: readonly T[]): void {
  for (let i = 0; i < src.length; i++) dst.push(src[i]);
}

/**
 * Smallest / largest of `f` over `items`, without building the intermediate
 * array at all. The common shape at module scale is `Math.min(...xs.map(f))`,
 * which allocates a second array of 128,000 numbers purely to throw it away.
 *
 * There is no bare `minOf(numbers)` here on purpose: every call site in this
 * codebase is measuring something ABOUT a module — a local coordinate, a cell
 * index, a distance — so the projection is always wanted, and a second
 * near-identical helper would just be a thing to pick wrongly.
 */
export function minBy<T>(items: readonly T[], f: (item: T) => number, fallback = Infinity): number {
  if (items.length === 0) return fallback;
  let m = f(items[0]);
  for (let i = 1; i < items.length; i++) {
    const v = f(items[i]);
    if (v < m) m = v;
  }
  return m;
}

export function maxBy<T>(items: readonly T[], f: (item: T) => number, fallback = -Infinity): number {
  if (items.length === 0) return fallback;
  let m = f(items[0]);
  for (let i = 1; i < items.length; i++) {
    const v = f(items[i]);
    if (v > m) m = v;
  }
  return m;
}

/**
 * Axis-aligned bounds of a list of points in ONE pass.
 *
 * Four separate `Math.min(...locals.map(…))` calls — the shape this codebase
 * reaches for when it wants a table's extent — walk the list eight times and
 * build four throwaway arrays. This walks it once. Empty input gives an
 * inverted box, so a caller that forgets to guard gets obviously-wrong numbers
 * rather than a plausible zero-sized box at the origin.
 */
export function boundsOf<T>(
  items: readonly T[],
  x: (item: T) => number,
  y: (item: T) => number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  if (items.length === 0) {
    return { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const it of items) {
    const px = x(it);
    const py = y(it);
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  return { minX, maxX, minY, maxY };
}
