// ─── One colour scale for solar access, used by everything that shows it ────
// The 3D painted modules in THREE flat bands while the legend beside them drew
// a SMOOTH gradient, and the yield readout used a third set of hexes again. So
// the picture, its key and its numbers disagreed about what a colour meant.
//
// This is now the only place that turns an access fraction into a colour. The
// instanced modules, the legend and the module card all call it, so they cannot
// drift apart again.
//
// The domain is FIXED at 85–100%, not stretched to each design. Those are the
// industry's own thresholds, and a fixed scale means two projects can be put
// side by side; the cost is that a badly shaded roof reads mostly red, with
// less contrast inside the bad part. Comparability is worth more here.

/** Access at or below this is as red as the scale goes. */
const ACCESS_POOR = 0.85;
/** The scale's midpoint — the amber knot. */
const ACCESS_FAIR = 0.95;
/** Full sun. */
const ACCESS_GOOD = 1;

/** The three stops, in order. The legend draws exactly these. */
export const ACCESS_STOPS = ['#ef4444', '#eab308', '#22c55e'] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/**
 * Solar access (0..1) → its colour on the scale.
 *
 * Piecewise linear with the amber knot at 95%, which is what the legend bar
 * draws: red at its left end, amber at its MIDDLE, green at its right. The two
 * halves therefore cover 10 points of access and 5 — uneven on purpose, so a
 * module at 97% is visibly better than one at 96%, where most roofs live.
 */
export function accessHex(access: number): string {
  if (!Number.isFinite(access)) return ACCESS_STOPS[2];
  const a = Math.min(ACCESS_GOOD, Math.max(ACCESS_POOR, access));
  if (a <= ACCESS_FAIR) {
    return mix(ACCESS_STOPS[0], ACCESS_STOPS[1], (a - ACCESS_POOR) / (ACCESS_FAIR - ACCESS_POOR));
  }
  return mix(ACCESS_STOPS[1], ACCESS_STOPS[2], (a - ACCESS_FAIR) / (ACCESS_GOOD - ACCESS_FAIR));
}

/** The legend's bar, as a CSS gradient. Same stops, same order, same meaning. */
export const ACCESS_GRADIENT_CSS = `linear-gradient(90deg,${ACCESS_STOPS[0]},${ACCESS_STOPS[1]},${ACCESS_STOPS[2]})`;
