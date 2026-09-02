// ─── Taking a whole table into a hand-made string ───────────────────────────
// Hand-wiring was one tap per module. A 40-module table was 40 taps, which is
// the reason nobody wired by hand twice. Shift-clicking any module in a table
// now takes the LOT — and, on a table already fully in, gives it all back, so
// the same gesture undoes itself.
//
// Kept out of the click handler so the arithmetic can be proven on its own.
import type { PlacedPanel } from '../../types';

/**
 * The string after shift-clicking `panelId`, or null when that module belongs
 * to no table and the caller should fall back to taking the single module.
 *
 * Modules go in CELL ORDER, which is the order the installer walks the row, so
 * the string reads the way the cable will actually run.
 */
export function wireTableToggle(
  panels: PlacedPanel[],
  panelId: string,
  wiring: readonly string[],
): string[] | null {
  const me = panels.find((p) => p.id === panelId);
  if (!me?.segmentId) return null;
  const table = panels
    .filter((p) => p.segmentId === me.segmentId && p.enabled)
    .sort((a, b) => (a.cellIndex ?? 0) - (b.cellIndex ?? 0))
    .map((p) => p.id);
  if (table.length === 0) return null;
  const have = new Set(wiring);
  if (table.every((id) => have.has(id))) {
    const drop = new Set(table);
    return wiring.filter((id) => !drop.has(id));
  }
  return [...wiring, ...table.filter((id) => !have.has(id))];
}
