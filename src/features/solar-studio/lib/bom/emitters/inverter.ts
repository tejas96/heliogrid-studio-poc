import type { BomLine } from '../../../types';
import type { BomContext } from '../context';
import { line } from '../line';

/** Project-wide: an inverter belongs to the system, not to a roof. */
export function emitInverter(ctx: BomContext): BomLine[] {
  const { inv, invCount } = ctx;
  return [
    line({
      key: 'inverter.unit',
      category: 'Inverter',
      confidence: 'measured',
      item: `${inv.brand} ${inv.model}`,
      spec: `${inv.acKw}kW · ${inv.phases}φ · ${inv.mppt.count} MPPT`,
      qty: invCount,
      unit: 'nos',
      unitPriceInr: inv.priceInr,
      formula: 'Selected in Components step',
    }),
  ];
}
