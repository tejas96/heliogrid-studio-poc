// Indian states/UTs and their electricity distribution companies (mock subset).
import { resolveRules } from './rules/india';
import type { SiteType } from '../types';

export const INDIAN_STATES: string[] = [
  'Andaman & Nicobar', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar',
  'Chandigarh', 'Chhattisgarh', 'Dadra & Nagar Haveli', 'Daman & Diu', 'Delhi',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim',
  'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
];

export const DISCOMS: Record<string, string[]> = {
  Maharashtra: ['MSEDCL', 'Tata Power Mumbai', 'Adani Electricity Mumbai', 'BEST'],
  Gujarat: ['UGVCL', 'MGVCL', 'DGVCL', 'PGVCL', 'Torrent Power'],
  Delhi: ['BSES Rajdhani', 'BSES Yamuna', 'Tata Power DDL'],
  Karnataka: ['BESCOM', 'MESCOM', 'HESCOM', 'GESCOM', 'CESC Mysore'],
  'Tamil Nadu': ['TANGEDCO'],
  Telangana: ['TSSPDCL', 'TSNPDCL'],
  'Andhra Pradesh': ['APSPDCL', 'APEPDCL', 'APCPDCL'],
  'Uttar Pradesh': ['PUVVNL', 'MVVNL', 'DVVNL', 'PVVNL', 'KESCO', 'NPCL'],
  Rajasthan: ['JVVNL', 'AVVNL', 'JdVVNL'],
  'Madhya Pradesh': ['MPPKVVCL East', 'MPPKVVCL Central', 'MPPKVVCL West'],
  Kerala: ['KSEB'],
  Punjab: ['PSPCL'],
  Haryana: ['UHBVN', 'DHBVN'],
  'West Bengal': ['WBSEDCL', 'CESC Kolkata'],
  Bihar: ['NBPDCL', 'SBPDCL'],
  Odisha: ['TPCODL', 'TPWODL', 'TPNODL', 'TPSODL'],
  Assam: ['APDCL'],
  Chhattisgarh: ['CSPDCL'],
  Jharkhand: ['JBVNL'],
  Goa: ['Goa Electricity Dept'],
  Uttarakhand: ['UPCL'],
  'Himachal Pradesh': ['HPSEB'],
  Chandigarh: ['CPDL'],
};

export function discomsForState(state: string): string[] {
  return DISCOMS[state] ?? ['State DISCOM'];
}

// ─── Tariffs (₹/kWh) — MOCK REPRESENTATIVE, not a live tariff feed ──────────
// Slabs vary by DISCOM, category (residential vs commercial/C&I) and monthly
// consumption; a real deployment wires a maintained tariff table (or the CEA /
// state-ERC schedules). These are round representative energy rates for the
// savings model; the user can always override the auto-filled value.
type TariffPair = { residential: number; commercial: number };

const STATE_TARIFFS: Record<string, TariffPair> = {
  Maharashtra: { residential: 8.8, commercial: 12.5 },
  Gujarat: { residential: 6.6, commercial: 9.2 },
  Delhi: { residential: 7.0, commercial: 11.0 },
  Karnataka: { residential: 7.6, commercial: 10.5 },
  'Tamil Nadu': { residential: 6.8, commercial: 9.8 },
  'Uttar Pradesh': { residential: 7.2, commercial: 10.0 },
  Rajasthan: { residential: 7.9, commercial: 10.8 },
  Kerala: { residential: 7.4, commercial: 10.2 },
  'West Bengal': { residential: 8.0, commercial: 11.5 },
  Telangana: { residential: 7.5, commercial: 10.6 },
};

// Per-DISCOM overrides where a private/city licensee diverges from the state
// average (e.g. the Mumbai licensees run well above MSEDCL).
const DISCOM_TARIFFS: Record<string, TariffPair> = {
  'Tata Power Mumbai': { residential: 9.4, commercial: 13.5 },
  'Adani Electricity Mumbai': { residential: 9.1, commercial: 13.0 },
  BEST: { residential: 8.6, commercial: 12.2 },
  'BSES Rajdhani': { residential: 7.2, commercial: 11.3 },
  'BSES Yamuna': { residential: 7.1, commercial: 11.2 },
  'Tata Power DDL': { residential: 6.9, commercial: 10.9 },
  BESCOM: { residential: 7.8, commercial: 10.7 },
  TANGEDCO: { residential: 6.8, commercial: 9.8 },
  'Torrent Power': { residential: 7.0, commercial: 9.6 },
};

/**
 * Representative tariff (₹/kWh) resolved most-specific-first: the selected
 * DISCOM's rate for the site category → the state's rate → the unknown-state
 * default (scaled up for commercial). Manual edits in the UI always override it.
 */
export function tariffFor(state: string, discom: string, siteType: SiteType): number {
  const byDiscom = DISCOM_TARIFFS[discom];
  if (byDiscom) return byDiscom[siteType];
  const byState = STATE_TARIFFS[state];
  if (byState) return byState[siteType];
  const base = resolveRules().defaults.tariffUnknownStateInrPerKwh;
  return siteType === 'commercial' ? Math.round(base * 1.4 * 10) / 10 : base;
}

/** Back-compat residential-by-state helper (delegates to tariffFor). */
export function tariffForState(state: string): number {
  return tariffFor(state, '', 'residential');
}
