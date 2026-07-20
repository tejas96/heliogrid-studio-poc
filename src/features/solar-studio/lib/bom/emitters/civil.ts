import type { BomLine } from '../../../types';
import type { BomContext } from '../context';
import type { LineKey } from '../registry';
import { line } from '../line';

/** Both project-wide: labour and freight are priced for the SITE, not a roof. */
export function emitCivil(ctx: BomContext): BomLine[] {
  const { kwp, pricebook: PRICE_BOOK } = ctx;
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
    ...prompts(PRICE_BOOK),
  ];
}

/**
 * Site-dependent items a rooftop quote routinely forgets, emitted at qty 0 and
 * EXCLUDED.
 *
 * Everywhere else in this file an item that does not apply is simply not
 * emitted — `safety.ts` guards every optional line with `if (x > 0)`. That is
 * right when the MODEL can decide. It cannot decide any of these: whether a
 * crane can reach the roof, whether the LT run has to be trenched, whether the
 * parapet needs scaffolding are all facts of the site visit. Omitting them
 * silently is how they end up missing from the quote and eaten as margin.
 *
 * Emitted excluded, they cost nothing and change no total — `lineMoney` skips
 * them, `bomMoney` raises no phantom GST bucket, and `bomConfidence` ignores
 * them, so the quote is not marked PRELIMINARY by a line nobody is quoting.
 * They exist to be seen and answered: give one a quantity, tick it in, and it
 * prices itself.
 *
 * `assumed` is the honest tier — a zero here is the absence of an answer, not
 * a measurement — and it becomes 'measured' the moment the user types a real
 * figure, because `rowState` promotes any overridden line.
 */
function prompts(PRICE_BOOK: BomContext['pricebook']): BomLine[] {
  const prompt = (
    key: LineKey,
    item: string,
    spec: string,
    unit: string,
    unitPriceInr: number,
  ) =>
    line({
      key,
      category: 'Civil & Misc',
      item,
      spec,
      qty: 0,
      unit,
      unitPriceInr,
      included: false,
      confidence: 'assumed',
      formula: 'Site-dependent — enter a quantity from the site survey',
    });

  return [
    prompt('civil.crane', 'Crane / Hydra Hire', 'Material lifting to roof', 'day', PRICE_BOOK.cranePerDay),
    prompt('civil.scaffolding', 'Scaffolding', 'Access and edge protection', 'day', PRICE_BOOK.scaffoldingPerDay),
    prompt('civil.civil_works', 'Civil Works', 'Pedestal PCC, chasing, waterproofing', 'lot', PRICE_BOOK.civilWorksLumpsum),
    prompt('civil.trenching', 'Cable Trenching', 'Excavate, sand-bed, backfill', 'm', PRICE_BOOK.trenchingPerM),
  ];
}
