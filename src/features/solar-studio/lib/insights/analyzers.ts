// ─── Copilot analyzer pack v1 (§8.1) — first real rules on the substrate ────
// Pure, deterministic, each citing the datum that triggered it. Registered
// once via registerCoreAnalyzers() (idempotent) from the consuming UI.
import type { Project } from '../../types';
import { registerAnalyzer, listAnalyzers } from './registry';
import type { Insight } from './types';
import { estimateMaxCapacityKwp } from '../layout';
import { shadowFreePitchM } from '../spacing';
import { registerAccessAnalyzers } from './analyzers-access';

function placedKwp(p: Project): number {
  const w = p.components.panel?.watt ?? 0;
  return (p.panels.filter((x) => x.enabled).length * w) / 1000;
}

const roofUtilization = {
  id: 'roof-utilization',
  title: 'Roof utilization',
  analyze(p: Project): Insight[] {
    const spec = p.components.panel;
    if (!spec || p.roofs.length === 0 || p.panels.length === 0) return [];
    const max = estimateMaxCapacityKwp(p, spec);
    const placed = placedKwp(p);
    if (max.kwp <= 0 || placed / max.kwp >= 0.6) return [];
    return [
      {
        key: 'roof-utilization:low',
        analyzerId: 'roof-utilization',
        category: 'utilization',
        severity: 'suggestion',
        impact: Math.min(1, 1 - placed / max.kwp),
        confidence: 0.9,
        title: `Roofs can hold ${max.kwp} kWp — you placed ${Math.round(placed * 100) / 100}`,
        detail: `Only ${Math.round((placed / max.kwp) * 100)}% of the valid panel positions are used. If the customer may expand later, consider documenting the headroom in the proposal.`,
        evidence: [`placed=${placed} kWp`, `maxFit=${max.kwp} kWp (${max.panels} panels)`],
      },
    ];
  },
};

const dcAcRatio = {
  id: 'dc-ac-ratio',
  title: 'DC/AC ratio',
  analyze(p: Project): Insight[] {
    const inv = p.components.inverter;
    const placed = placedKwp(p);
    if (!inv || placed <= 0) return [];
    const ac = inv.acKw * p.components.inverterCount;
    if (ac <= 0) return [];
    const ratio = placed / ac;
    if (ratio >= 0.9 && ratio <= 1.35) return [];
    const high = ratio > 1.35;
    return [
      {
        key: 'dc-ac-ratio:out-of-band',
        analyzerId: 'dc-ac-ratio',
        category: 'electrical',
        severity: 'warning',
        impact: Math.min(1, Math.abs(ratio - 1.15) / 1.15),
        confidence: 1,
        title: `DC/AC ratio ${ratio.toFixed(2)} is ${high ? 'high' : 'low'}`,
        detail: high
          ? `${placed} kWp DC on ${ac} kW AC will clip on clear days. Consider one more inverter or a larger model.`
          : `The ${ac} kW inverter capacity is oversized for ${placed} kWp DC — money spent on unused AC headroom.`,
        evidence: [`dc=${placed} kWp`, `ac=${ac} kW`, `band=0.90–1.35`],
      },
    ];
  },
};

const orientation = {
  id: 'orientation',
  title: 'Panel orientation',
  analyze(p: Project): Insight[] {
    if (!p.location || p.location.latLng.lat <= 0) return []; // northern-hemisphere rule
    const off = p.panels.filter(
      (x) => x.enabled && x.tiltDeg > 3 && Math.abs(((x.azimuthDeg - 180 + 540) % 360) - 180) > 60,
    );
    if (off.length === 0) return [];
    return [
      {
        key: 'orientation:off-south',
        analyzerId: 'orientation',
        category: 'energy',
        severity: 'suggestion',
        impact: Math.min(1, off.length / Math.max(1, p.panels.length)),
        confidence: 0.8,
        title: `${off.length} tilted panel${off.length === 1 ? '' : 's'} face far from south`,
        detail:
          'At this latitude, tilted panels facing >60° away from south collect measurably less annual beam energy. Check the tilt direction of the affected tables.',
        evidence: [`count=${off.length}`, `latitude=${p.location.latLng.lat}`],
        focusIds: off.map((x) => x.id),
      },
    ];
  },
};

const rowSpacing = {
  id: 'row-spacing',
  title: 'Row spacing vs shadow-free pitch',
  analyze(p: Project): Insight[] {
    const spec = p.components.panel;
    const loc = p.location;
    if (!spec || !loc) return [];
    const out: Insight[] = [];
    for (const seg of p.segments) {
      const r = seg.racking;
      if (r.kind === 'flush' || !(r.rowPitchM > 0) || seg.rows < 2) continue;
      const L = (seg.orientation === 'portrait' ? spec.lengthMm : spec.widthMm) / 1000;
      const free = shadowFreePitchM(loc.latLng.lat, loc.latLng.lng, r.tiltDeg, L, seg.azimuthDeg);
      if (r.rowPitchM >= free - 0.05) continue;
      out.push({
        key: `row-spacing:${seg.id}`,
        analyzerId: 'row-spacing',
        category: 'energy',
        severity: 'suggestion',
        impact: Math.min(1, (free - r.rowPitchM) / free),
        confidence: 0.85,
        title: `Table ${seg.label}: rows tighter than the shadow-free pitch`,
        detail: `Pitch ${r.rowPitchM.toFixed(2)} m vs ${free.toFixed(2)} m shadow-free — winter row-shading is being priced as an energy loss in the report. Widen the pitch (or accept the trade-off consciously).`,
        evidence: [`pitch=${r.rowPitchM} m`, `shadowFree=${Math.round(free * 100) / 100} m`, `tilt=${r.tiltDeg}°`],
      });
    }
    return out;
  },
};

/**
 * ONE door for every consumer (health score, Copilot tray, pre-proposal
 * review). Packs are registered together so the registry can never differ
 * between surfaces — a score computed against a different analyzer set than
 * the tray shows would be unexplainable.
 */
export function registerAllAnalyzers(): void {
  registerCoreAnalyzers();
  registerAccessAnalyzers();
}

/** Idempotent registration of the v1 pack (registry state IS the guard,
 *  so tests can clearAnalyzers() and re-register). */
export function registerCoreAnalyzers(): void {
  if (listAnalyzers().some((a) => a.id === 'roof-utilization')) return;
  registerAnalyzer(roofUtilization);
  registerAnalyzer(dcAcRatio);
  registerAnalyzer(orientation);
  registerAnalyzer(rowSpacing);
}
