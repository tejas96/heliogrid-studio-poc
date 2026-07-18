// ─── String-combiner boxes for central / C&I topology (Phase 11 · 30e-model) ─
// In a large C&I or ground-mount plant, strings don't land on individual MPPTs —
// they're paralleled through fused String Combiner Boxes (SCB/AJB), and the
// combined feeders run to a central inverter's DC bus. This models the boxes:
// how many, how many string inputs each, the per-string gPV fuse (≥1.56×Isc,
// the SAME ladder the DCDB uses) and the combined output current. The SLD
// combiner BLOCKS + BOM rendering consume this (30e-draw); the electrical model
// is here. String topology (default) needs no combiners and returns an empty ok.
import type { PanelSpec, StringDef } from '../../types';
import { resolveRules } from '../../data/rules/india';
import { dcFuseA } from '../electrical-sizing';

export interface CombinerBox {
  id: string;
  label: string; // 'SCB-1'
  stringIds: string[]; // the strings paralleled into this box
  inputCount: number;
  stringFuseA: number; // per-string gPV fuse
  outputCurrentA: number; // ΣIsc × continuous-duty factor
}

export interface CombinerPlan {
  ok: boolean;
  reason?: string;
  boxes: CombinerBox[];
  totalStrings: number;
  stringFuseA: number;
}

/**
 * Fan the project's strings into balanced combiner boxes. Pure. Every string is
 * assigned exactly once (Σ inputs === totalStrings — the reconciliation gate).
 */
export function combinerPlan(strings: StringDef[], panel: PanelSpec): CombinerPlan {
  const { maxStringsPerBox, outputFactor } = resolveRules().combiner;
  const total = strings.length;
  const fuse = dcFuseA(panel);
  if (total === 0) {
    return { ok: false, reason: 'No strings to combine — string the array first.', boxes: [], totalStrings: 0, stringFuseA: fuse };
  }
  const nBoxes = Math.ceil(total / maxStringsPerBox);
  // spread strings as evenly as possible: the first `rem` boxes get one extra
  const base = Math.floor(total / nBoxes);
  const rem = total % nBoxes;
  const boxes: CombinerBox[] = [];
  let cursor = 0;
  for (let b = 0; b < nBoxes; b++) {
    const size = base + (b < rem ? 1 : 0);
    const slice = strings.slice(cursor, cursor + size);
    cursor += size;
    if (slice.length === 0) continue;
    boxes.push({
      id: `scb_${b + 1}`,
      label: `SCB-${b + 1}`,
      stringIds: slice.map((s) => s.id),
      inputCount: slice.length,
      stringFuseA: fuse,
      outputCurrentA: Math.round(slice.length * panel.iscA * outputFactor * 10) / 10,
    });
  }
  const assigned = boxes.reduce((s, b) => s + b.inputCount, 0);
  if (assigned !== total) {
    return { ok: false, reason: 'Combiner planning error — strings not all assigned', boxes, totalStrings: total, stringFuseA: fuse };
  }
  if (boxes.some((b) => b.inputCount > maxStringsPerBox)) {
    return { ok: false, reason: `A combiner exceeds ${maxStringsPerBox} string inputs`, boxes, totalStrings: total, stringFuseA: fuse };
  }
  return { ok: true, boxes, totalStrings: total, stringFuseA: fuse };
}
