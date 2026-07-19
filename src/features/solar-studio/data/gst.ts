// ─── GST rates for a rooftop solar quote — India (Phase 22d) ────────────────
// Two rates carry almost every line on an Indian solar BOM:
//
//   5%   renewable-energy DEVICES and their parts — modules, inverters, the
//        mounting structure, cabling, protection, earthing. (Renewable devices
//        moved to 5% in the Sept-2025 reform.)
//   18%  CIVIL WORK and SERVICES — concrete, waterproofing, scaffolding,
//        installation, commissioning, transport.
//
// These are DEFAULTS, not law. Rates change, classifications are argued, and a
// works-contract split is common on C&I jobs — so every line's rate stays
// editable and the value used is always the line's own, never this table read
// at print time.
import type { BomCategory } from '../types';

export const GST_EQUIPMENT_PCT = 5;
export const GST_SERVICE_PCT = 18;

/** Default rate by category. Overridable per line in the BOM screen. */
export const GST_BY_CATEGORY: Record<BomCategory, number> = {
  Modules: GST_EQUIPMENT_PCT,
  Inverter: GST_EQUIPMENT_PCT,
  'Electrical BOS': GST_EQUIPMENT_PCT,
  'Mechanical BOS': GST_EQUIPMENT_PCT,
  Safety: GST_EQUIPMENT_PCT,
  // civil work + installation + transport are services
  'Civil & Misc': GST_SERVICE_PCT,
};

/**
 * Per-line exceptions, where a line sits in an equipment category but is
 * bought as work — or vice versa. Keyed by LineKey PREFIX (before any
 * `:instance` suffix).
 */
export const GST_BY_LINE: Record<string, number> = {
  // cast in place by a civil crew, not bought as a device
  'mech.pedestal': GST_SERVICE_PCT,
};

export function gstPctFor(category: BomCategory, lineKey: string): number {
  const base = lineKey.split(':')[0];
  return GST_BY_LINE[base] ?? GST_BY_CATEGORY[category];
}
