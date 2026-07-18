// ─── Catalog envelope (§8.11 seed) ──────────────────────────────────────────
// One versioned wrapper around the component/pricing databases so every
// consumer reads through resolveCatalog() instead of scattered imports.
// The version joins the design fingerprint later (Phase 10), which makes
// "designed against an outdated catalog" detectable. The underlying DB modules
// keep their exports — this envelope adds identity/provenance, it does not
// change any entry.
import type { InverterSpec, PanelSpec } from '../types';
import { PANEL_DB } from './panels';
import { INVERTER_DB } from './inverters';
import { PRICE_BOOK } from './pricebook';

/** Where a catalog entry's numbers came from — honest-labeling requirement. */
export type CatalogProvenance =
  | 'manufacturer-datasheet'
  | 'installer-pricebook'
  | 'mock-representative';

export interface CatalogEnvelope {
  /** bump on ANY entry change; joins designFp in Phase 10 */
  catalogVersion: string;
  /** ISO date the prices/specs were last confirmed */
  effectiveFrom: string;
  /** default provenance for entries without a specific override */
  provenance: CatalogProvenance;
  /** per-entry provenance overrides, keyed by entry id */
  entryProvenance: Record<string, CatalogProvenance>;
  panels: PanelSpec[];
  inverters: InverterSpec[];
  pricebook: typeof PRICE_BOOK;
}

const ACTIVE_CATALOG: CatalogEnvelope = {
  catalogVersion: '2026.07-1',
  effectiveFrom: '2026-07-01',
  // the bundled DBs are representative Indian-market entries, not confirmed
  // vendor quotes — label them honestly until a real pricebook import lands
  provenance: 'mock-representative',
  entryProvenance: {},
  panels: PANEL_DB,
  inverters: INVERTER_DB,
  pricebook: PRICE_BOOK,
};

/**
 * Catalog resolution point. Today it returns the bundled envelope; the Phase 10
 * management UI swaps this for "active imported version, else bundled".
 */
export function resolveCatalog(): CatalogEnvelope {
  return ACTIVE_CATALOG;
}

/** Provenance for one entry (falls back to the catalog-level label). */
export function catalogProvenance(entryId: string): CatalogProvenance {
  const c = resolveCatalog();
  return c.entryProvenance[entryId] ?? c.provenance;
}
