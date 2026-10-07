// ─── Step 7 · Structure & BOM ───────────────────────────────────────────────
// What holds the panels up, and what it all costs. The editor (Step 6) decides
// where the panels go; this step owns the structure and the price, and it sits
// BEFORE the proposal so the quote the customer sees has been looked at.
import { BomView } from './BomView';

export function StructureBomStep() {
  return <BomView />;
}
