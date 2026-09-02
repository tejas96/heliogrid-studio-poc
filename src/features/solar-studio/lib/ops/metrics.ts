// ─── Design metrics and op impact ───────────────────────────────────────────
// The numbers an engineer watches while editing, computed through the
// memoised derivation graph so a preview costs one selector walk, not a
// re-derivation of everything.
import type { Project } from '../../types';
import { designFreshness, type Freshness } from '../derive/freshness';
import { deriveStructures } from '../derive/structures';
import { deriveBomResult, deriveEnergy, deriveMoney, designIssues } from '../derive/outputs';

export interface DesignMetrics {
  modules: number;
  kwp: number;
  strings: number;
  unstrungModules: number;
  dcCableM: number;
  steelKg: number;
  bomTotalInr: number;
  annualKwh: number;
  errors: number;
  freshness: Freshness;
}

const NUMERIC = [
  'modules',
  'kwp',
  'strings',
  'unstrungModules',
  'dcCableM',
  'steelKg',
  'bomTotalInr',
  'annualKwh',
  'errors',
] as const;
export type NumericMetric = (typeof NUMERIC)[number];

export function designMetrics(p: Project): DesignMetrics {
  const enabled = p.panels.filter((m) => m.enabled);
  const strung = new Set(p.strings.flatMap((s) => s.panelIds));
  const lines = deriveBomResult(p).lines;
  // one DC cable line per size once the runs are routed — sum them all
  const dcCableM = lines
    .filter((l) => l.id === 'elec.dc_cable' || l.id.startsWith('elec.dc_cable:'))
    .reduce((s, l) => s + l.qty, 0);
  return {
    modules: enabled.length,
    kwp: Math.round(((enabled.length * (p.components.panel?.watt ?? 0)) / 1000) * 100) / 100,
    strings: p.strings.length,
    unstrungModules: enabled.filter((m) => !strung.has(m.id)).length,
    dcCableM,
    steelKg: Math.round(deriveStructures(p).reduce((s, st) => s + st.steelKg, 0)),
    bomTotalInr: deriveMoney(p).total,
    annualKwh: Math.round(deriveEnergy(p).annualKwh),
    errors: designIssues(p).filter((i) => i.level === 'error').length,
    freshness: designFreshness(p),
  };
}

export interface OpImpact {
  label: string;
  before: DesignMetrics;
  after: DesignMetrics;
  delta: Record<NumericMetric, number>;
}

export function impactOf(before: Project, after: Project, label: string): OpImpact {
  const b = designMetrics(before);
  const a = designMetrics(after);
  const delta = Object.fromEntries(NUMERIC.map((k) => [k, a[k] - b[k]])) as Record<NumericMetric, number>;
  return { label, before: b, after: a, delta };
}

const inr = (v: number) => `₹ ${v < 0 ? '−' : '+'}${Math.abs(Math.round(v)).toLocaleString('en-IN')}`;
const signed = (v: number, unit = '') => `${v < 0 ? '−' : '+'}${Math.abs(v)}${unit}`;

/** One line for a toast: the label, then only the numbers that moved. */
export function summarizeImpact(i: OpImpact): string {
  const parts: string[] = [i.label];
  const d = i.delta;
  if (d.modules) parts.push(`modules ${signed(d.modules)}`);
  if (d.kwp) parts.push(signed(Math.round(d.kwp * 100) / 100, ' kWp'));
  if (d.annualKwh && i.before.annualKwh > 0) {
    parts.push(`kWh ${signed(Math.round((d.annualKwh / i.before.annualKwh) * 1000) / 10, '%')}`);
  }
  if (d.strings) parts.push(`strings ${signed(d.strings)}`);
  if (d.unstrungModules) parts.push(`unstrung ${signed(d.unstrungModules)}`);
  if (d.dcCableM) parts.push(`DC cable ${signed(Math.round(d.dcCableM), ' m')}`);
  if (d.steelKg) parts.push(`steel ${signed(d.steelKg, ' kg')}`);
  if (d.bomTotalInr) parts.push(inr(d.bomTotalInr));
  if (d.errors) parts.push(`errors ${signed(d.errors)}`);
  return parts.join(' · ');
}
