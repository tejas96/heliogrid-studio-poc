import type { BomLine } from '../../../types';
import { PRICE_BOOK } from '../../../data/pricebook';
import type { BomContext } from '../context';
import { line } from '../line';

/** Both project-wide: labour and freight are priced for the SITE, not a roof. */
export function emitCivil(ctx: BomContext): BomLine[] {
  const { kwp } = ctx;
  return [
    line({
      key: 'civil.installation',
      category: 'Civil & Misc',
      item: 'Installation & Commissioning',
      spec: 'Labour, testing, net-meter liaison',
      qty: Math.round(kwp * 10) / 10,
      unit: 'kW',
      unitPriceInr: PRICE_BOOK.installationPerKw,
      formula: `${kwp.toFixed(1)} kWp × ₹${PRICE_BOOK.installationPerKw}/kW`,
    }),
    line({
      key: 'civil.transport',
      category: 'Civil & Misc',
      item: 'Transport & Handling',
      spec: 'To site',
      qty: 1,
      unit: 'lot',
      unitPriceInr: PRICE_BOOK.transportLumpsum,
      formula: 'Lumpsum',
    }),
  ];
}
