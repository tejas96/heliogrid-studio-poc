// The steel cut list under Mechanical BOS — what a fabricator orders. The
// steel line prices one weight; this says what that weight IS: pieces of each
// section at each cut length, read from the same member graph the line weighs.
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Project } from '../../types';
import { deriveStructures } from '../../lib/derive';
import { cutList, steelTakeoff } from '../../lib/structure-step';

export function CutList({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const structures = deriveStructures(project);
  const rows = cutList(structures);
  if (rows.length === 0) return null;
  const steel = steelTakeoff(structures);
  return (
    <div className="ds mt-2 rounded-md border border-border bg-surface-raised text-text">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-8 w-full items-center gap-2 px-3 text-left text-sm"
      >
        <ChevronDown size={16} aria-hidden className={open ? 'rotate-180' : ''} />
        <span className="font-semibold">Steel cut list</span>
        <span className="text-xs text-muted">what the fabricator orders · from the structure model · derived</span>
        <span className="flex-1" />
        <span className="text-xs tabular-nums text-muted">
          {rows.reduce((a, r) => a + r.pieces, 0)} pieces · {steel.netKg.toFixed(1)} kg net
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-3 pb-3">
          <table className="w-full text-xs tabular-nums">
            <caption className="sr-only">Steel cut list</caption>
            <thead>
              <tr className="text-muted">
                <th className="py-2 text-left font-normal">Member</th>
                <th className="py-2 text-left font-normal">Section</th>
                <th className="py-2 text-right font-normal">Pieces</th>
                <th className="py-2 text-right font-normal">Cut length</th>
                <th className="py-2 text-right font-normal">Total</th>
                <th className="py-2 text-right font-normal">Weight</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border-subtle">
                  <td className="py-1">{r.label}</td>
                  <td className="py-1">{r.profileLabel}</td>
                  <td className="py-1 text-right">{r.pieces}</td>
                  <td className="py-1 text-right">{r.cutM.toFixed(2)} m</td>
                  <td className="py-1 text-right">{r.totalM.toFixed(1)} m</td>
                  <td className="py-1 text-right">{r.kg.toFixed(1)} kg</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border-strong">
                <td className="py-1 font-semibold" colSpan={5}>
                  Net steel
                </td>
                <td className="py-1 text-right font-semibold">{steel.netKg.toFixed(1)} kg</td>
              </tr>
              <tr>
                <td className="py-1 text-muted" colSpan={5}>
                  Waste allowance {steel.wastePct} %
                </td>
                <td className="py-1 text-right text-muted">+{steel.wasteKg.toFixed(1)} kg</td>
              </tr>
              <tr>
                <td className="py-1 font-semibold" colSpan={5}>
                  To order — the steel line&apos;s order quantity
                </td>
                <td className="py-1 text-right font-semibold">{steel.orderKg.toFixed(1)} kg</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
