import type { BomLine } from '../../../types';
import type { BomContext } from '../context';
import { line } from '../line';

/** Project-wide: the module count is a count of the whole canvas, not one roof. */
export function emitModules(ctx: BomContext): BomLine[] {
  const { spec, n } = ctx;
  return [
    line({
      key: 'modules.panel',
      category: 'Modules',
      confidence: 'measured',
      item: `${spec.brand} ${spec.model}`,
      spec: `${spec.watt}Wp ${spec.tech}${spec.almm ? ' · ALMM' : ''}${spec.dcr ? ' · DCR' : ''}`,
      qty: n,
      unit: 'nos',
      unitPriceInr: spec.priceInr,
      formula: `${n} enabled panels on canvas`,
    }),
  ];
}
