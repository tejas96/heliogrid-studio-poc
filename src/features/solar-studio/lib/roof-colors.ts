// ─── Per-roof colours so multiple roofs are easy to tell apart ──────────────
// Assigned by the roof's index in the project so adjacent roofs always differ.

export const ROOF_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#14b8a6', // teal
  '#ec4899', // pink
  '#f97316', // orange
] as const;

export function roofColor(index: number): string {
  const n = ROOF_PALETTE.length;
  return ROOF_PALETTE[(((index % n) + n) % n)];
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** `hex` as an rgba() string with the given alpha. */
export function roofRgba(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Lighten a hex colour toward white by t (0..1) — soft tint for the 3D studio. */
export function lightenHex(hex: string, t: number): string {
  const [r, g, b] = parseHex(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
