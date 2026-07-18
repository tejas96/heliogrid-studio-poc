// ─── Gate: Design Health Score v1 (Phase 6, §25c) ────────────────────────────
// The three binding gates from the plan: score determinism, monotonicity
// (fixing an error never lowers the score), and explain-delta correctness.
// Plus the study-derived pins: composite key (designFp alone lies), by-code
// dedupe (imp_high inflation), and the one-source double-count policy.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { PanelSpec, Project, SiteLocation, StringDef } from '../../types';
import {
  bandOf,
  computeHealth,
  describeHealthCode,
  explainDelta,
  healthKey,
  memoizedHealth,
  nextHealthSnapshot,
  resetHealthMemo,
  toSnapshotEntry,
  VALIDATION_CATEGORY,
} from '../health';
import { resolveRules } from '../../data/rules/india';
import { shadingFp } from '../fingerprints';
import { normalizeProject } from '../persistence/normalize';
import { clearAnalyzers, resetInsightMemo } from '../insights/registry';
import { registerCoreAnalyzers } from '../insights/analyzers';
import { fixtureProject } from './fixtures/project';

const PUNE: SiteLocation = {
  address: 'Pune',
  latLng: { lat: 18.5203, lng: 73.8567 },
  confirmed: true,
  irradiance: 5.2,
  peakSunHours: 5.2,
  dataSource: 'test',
};

function baseProject(count = 8): Project {
  const p = fixtureProject(count);
  return { ...p, location: PUNE };
}

function stringOf(ids: string[], n: number): StringDef {
  return {
    id: `str_${n}`,
    name: `String ${n}`,
    inverterIndex: 0,
    mpptIndex: n - 1,
    panelIds: ids,
    color: '#f59e0b',
  };
}

function cat(p: Project, key: 'energy' | 'electrical' | 'utilization') {
  return computeHealth(p).categories.find((c) => c.key === key)!;
}

beforeEach(() => {
  clearAnalyzers();
  registerCoreAnalyzers();
  resetHealthMemo();
  resetInsightMemo();
});
afterEach(() => {
  clearAnalyzers();
  resetHealthMemo();
  resetInsightMemo();
});

describe('computeHealth — determinism', () => {
  it('identical input produces identical output; memo returns the same instance', () => {
    const p = baseProject();
    const a = computeHealth(p);
    const b = computeHealth(p);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const m = memoizedHealth(p);
    expect(memoizedHealth(p)).toBe(m);
  });

  it('an empty project scores nothing — every category "not applicable", total null', () => {
    const p = { ...baseProject(0), panels: [], strings: [] };
    const r = computeHealth(p);
    expect(r.total).toBeNull();
    expect(r.band).toBeNull();
    expect(r.categories.every((c) => c.score === null)).toBe(true);
  });
});

describe('computeHealth — monotonicity (fixing an error never lowers the score)', () => {
  it('splitting an over-voltage string raises electrical and touches nothing else', () => {
    // 15 panels in ONE string: 15 × ~52 V cold Voc ≈ 782 V > 600 V max ⇒ voc_high
    const broken = baseProject(15);
    broken.strings = [stringOf(broken.panels.map((x) => x.id), 1)];
    const fixed: Project = {
      ...broken,
      strings: [
        stringOf(broken.panels.slice(0, 8).map((x) => x.id), 1),
        stringOf(broken.panels.slice(8).map((x) => x.id), 2),
      ],
    };
    const before = computeHealth(broken);
    const after = computeHealth(fixed);
    const el = (r: typeof before) => r.categories.find((c) => c.key === 'electrical')!;
    expect(el(before).deductions.some((d) => d.code === 'voc_high')).toBe(true);
    expect(el(after).deductions.some((d) => d.code === 'voc_high')).toBe(false);
    expect(el(after).score!).toBeGreaterThan(el(before).score!);
    // the fix must not leak into other categories
    for (const key of ['energy', 'utilization'] as const) {
      expect(after.categories.find((c) => c.key === key)!.score).toBe(
        before.categories.find((c) => c.key === key)!.score,
      );
    }
    expect(after.total!).toBeGreaterThan(before.total!);
  });

  it('unshading a panel raises energy (shaded deduction resolves)', () => {
    const shaded = baseProject();
    shaded.panels = shaded.panels.map((x) => ({ ...x, solarAccess: 0.5 }));
    const clear = { ...shaded, panels: shaded.panels.map((x) => ({ ...x, solarAccess: 1 })) };
    const before = cat(shaded, 'energy');
    const after = cat(clear, 'energy');
    expect(before.deductions.some((d) => d.code === 'shaded')).toBe(true);
    expect(after.deductions.some((d) => d.code === 'shaded')).toBe(false);
    expect(after.score!).toBeGreaterThan(before.score!);
  });
});

describe('computeHealth — dedupe and double-count policy', () => {
  it('imp_high emitted once per string is charged ONCE (splitting strings never costs)', () => {
    const hotPanel: PanelSpec = {
      ...baseProject().components.panel!,
      impA: 20, // above every catalog MPPT current limit
    };
    const one = baseProject(8);
    one.components = { ...one.components, panel: hotPanel };
    one.strings = [stringOf(one.panels.map((x) => x.id), 1)];
    const two: Project = {
      ...one,
      strings: [
        stringOf(one.panels.slice(0, 4).map((x) => x.id), 1),
        stringOf(one.panels.slice(4).map((x) => x.id), 2),
      ],
    };
    expect(cat(one, 'electrical').score).toBe(cat(two, 'electrical').score);
    expect(cat(two, 'electrical').deductions.filter((d) => d.code === 'imp_high')).toHaveLength(1);
  });

  it('an out-of-band DC/AC ratio is charged once via the insight, never via validateSystem', () => {
    // 8 × 540 W = 4.32 kWp on TWO 5 kW inverters ⇒ ratio 0.43: validateSystem
    // dc_ac_low fires AND the dc-ac-ratio analyzer fires — one deduction only
    const p = baseProject(8);
    p.components = { ...p.components, inverterCount: 2 };
    const el = cat(p, 'electrical');
    const dcDeductions = el.deductions.filter(
      (d) => d.code.includes('dc_ac') || d.code.includes('dc-ac'),
    );
    expect(dcDeductions).toHaveLength(1);
    expect(dcDeductions[0].source).toBe('insight');
  });

  it('ignoring an insight consciously clears its deduction (and changes the key)', () => {
    const p = baseProject(8);
    p.components = { ...p.components, inverterCount: 2 };
    const before = cat(p, 'electrical');
    const ignored: Project = {
      ...p,
      insightState: { 'dc-ac-ratio:out-of-band': 'ignored' },
    };
    const after = cat(ignored, 'electrical');
    expect(after.score!).toBeGreaterThan(before.score!);
    expect(healthKey(ignored)).not.toBe(healthKey(p));
  });

  it('ACCEPTING an insight re-keys but never re-scores (the asymmetric twin)', () => {
    const p = baseProject(8);
    p.components = { ...p.components, inverterCount: 2 };
    const accepted: Project = {
      ...p,
      insightState: { 'dc-ac-ratio:out-of-band': 'accepted' },
    };
    expect(healthKey(accepted)).not.toBe(healthKey(p)); // snapshot restamps
    expect(cat(accepted, 'electrical').score).toBe(cat(p, 'electrical').score);
    expect(
      cat(accepted, 'electrical').deductions.some((d) => d.code === 'dc-ac-ratio:out-of-band'),
    ).toBe(true); // acknowledged ≠ fixed — the deduction stays
  });

  it('a category buried past 100 points clamps at EXACTLY 0 and recovers monotonically', () => {
    // hot panel (imp_high 10) + one 15-panel string (voc_high 35) + two extra
    // 0-progress strings past the 2 MPPT slots (mppt_overflow 35) + short
    // string (vmp_low 12) + dc-ac insight (12) = 104 points > 100
    const p = baseProject(15);
    p.components = { ...p.components, panel: { ...p.components.panel!, impA: 20 } };
    p.strings = [
      stringOf(p.panels.slice(0, 13).map((x) => x.id), 1),
      stringOf([p.panels[13].id], 2),
      stringOf([p.panels[14].id], 3),
    ];
    const buried = cat(p, 'electrical');
    expect(buried.deductions.reduce((s, d) => s + d.points, 0)).toBeGreaterThan(100);
    expect(buried.score).toBe(0); // exactly 0 — kills a removed-clamp mutant
    // fixing the over-voltage string can only raise the score
    const fixed: Project = {
      ...p,
      strings: [
        stringOf(p.panels.slice(0, 8).map((x) => x.id), 1),
        stringOf(p.panels.slice(8).map((x) => x.id), 2),
      ],
    };
    expect(cat(fixed, 'electrical').score!).toBeGreaterThan(0);
  });
});

describe('healthKey — the composite pin (C1)', () => {
  it('changes when the shading stamp changes, even though designFp does not', () => {
    const p = baseProject();
    const stamped: Project = {
      ...p,
      derived: { ...p.derived, solarAccessFp: 'e3|something' },
    };
    expect(healthKey(stamped)).not.toBe(healthKey(p));
  });

  it('changes when panels change (via designFp)', () => {
    const p = baseProject(8);
    const q = baseProject(6);
    expect(healthKey(p)).not.toBe(healthKey(q));
  });
});

describe('explainDelta — the explain-delta gate', () => {
  it('names the exact code that appeared and the one that resolved', () => {
    const clear = baseProject();
    const shaded = { ...clear, panels: clear.panels.map((x) => ({ ...x, solarAccess: 0.5 })) };
    const prev = toSnapshotEntry(computeHealth(clear));
    const next = toSnapshotEntry(computeHealth(shaded));

    const down = explainDelta(prev, next);
    const energyDown = down.find((d) => d.category === 'energy')!;
    expect(energyDown.added).toContain('shaded');
    expect(energyDown.removed).toHaveLength(0);
    expect(energyDown.to!).toBeLessThan(energyDown.from!);

    const up = explainDelta(next, prev);
    const energyUp = up.find((d) => d.category === 'energy')!;
    expect(energyUp.removed).toContain('shaded');
    expect(energyUp.to!).toBeGreaterThan(energyUp.from!);
  });

  it('reports nothing when nothing changed', () => {
    const p = baseProject();
    const e = toSnapshotEntry(computeHealth(p));
    expect(explainDelta(e, e)).toHaveLength(0);
  });

  it('a prev entry missing a category reads as "newly tracked" (pinned semantics)', () => {
    const p = baseProject();
    const cur = toSnapshotEntry(computeHealth(p));
    const legacyPrev = { ...cur, categories: cur.categories.filter((c) => c.key !== 'energy') };
    const deltas = explainDelta(legacyPrev, cur);
    const energy = deltas.find((d) => d.category === 'energy')!;
    expect(energy.from).toBeNull(); // no baseline — never a fake number
    expect(energy.to).toBe(cur.categories.find((c) => c.key === 'energy')!.score);
  });

  it('an applicability transition (null → scored) emits a delta row', () => {
    const p = baseProject(0);
    const empty = toSnapshotEntry(computeHealth({ ...p, panels: [], strings: [] }));
    const designed = toSnapshotEntry(computeHealth(baseProject(8)));
    const deltas = explainDelta(empty, designed);
    expect(deltas.length).toBeGreaterThan(0);
    for (const d of deltas) expect(d.from).toBeNull();
  });

  it('provisional intermediates are replaced in the prev chain, never chained', () => {
    const p = baseProject(8);
    // settled stamp first (fresh shading)
    const settled: Project = { ...p, derived: { ...p.derived, solarAccessFp: shadingFp(p) } };
    const first = nextHealthSnapshot(settled)!;
    expect(first.current.provisional).toBe(false);
    // geometry edit ⇒ shading stale ⇒ PROVISIONAL stamp with prev = settled
    const edited: Project = {
      ...settled,
      panels: settled.panels.map((x, i) => (i === 0 ? { ...x, center: { x: 0, y: 0 } } : x)),
      derived: { ...settled.derived, healthSnapshot: first },
    };
    const second = nextHealthSnapshot(edited)!;
    expect(second.current.provisional).toBe(true);
    expect(second.prev?.key).toBe(first.current.key);
    // raycast lands ⇒ THIRD stamp must keep the SETTLED first as prev,
    // replacing (not chaining) the provisional intermediate
    const landed: Project = {
      ...edited,
      derived: {
        ...edited.derived,
        healthSnapshot: second,
        solarAccessFp: shadingFp(edited),
      },
    };
    const third = nextHealthSnapshot(landed)!;
    expect(third.current.provisional).toBe(false);
    expect(third.prev?.key).toBe(first.current.key); // provisional skipped
  });
});

describe('provisional flag and context', () => {
  it('marks the score provisional while the shading stamp is stale', () => {
    const p = baseProject(); // panels exist, solarAccessFp null ⇒ stale
    expect(computeHealth(p).provisional).toBe(true);
  });

  it('clears the provisional flag once the shading stamp matches', () => {
    const p = baseProject();
    const fresh: Project = { ...p, derived: { ...p.derived, solarAccessFp: shadingFp(p) } };
    expect(computeHealth(fresh).provisional).toBe(false);
  });

  it('surfaces irradiance provenance as unscored context', () => {
    const r = computeHealth(baseProject());
    expect(r.context.some((c) => c.includes('estimate'))).toBe(true);
  });
});

describe('weighting, clamping and bands', () => {
  it('total equals the single applicable category when the others are N/A', () => {
    // no inverter ⇒ electrical N/A; no roofs ⇒ utilization N/A; energy remains
    const p = baseProject(8);
    p.components = { ...p.components, inverter: null };
    p.roofs = [];
    const r = computeHealth(p);
    const energy = r.categories.find((c) => c.key === 'energy')!;
    expect(r.categories.find((c) => c.key === 'electrical')!.score).toBeNull();
    expect(r.categories.find((c) => c.key === 'utilization')!.score).toBeNull();
    expect(r.total).toBe(energy.score);
  });

  it('clamps a category at 0 and stays monotone at the clamp', () => {
    // shaded panels + a broken string stack deductions; the clamp must hold
    const p = baseProject(15);
    p.panels = p.panels.map((x) => ({ ...x, solarAccess: 0.3 }));
    p.strings = [stringOf(p.panels.map((x) => x.id), 1)];
    const r = computeHealth(p);
    for (const c of r.categories) {
      if (c.score !== null) expect(c.score).toBeGreaterThanOrEqual(0);
    }
    // fixing the string can only raise (or keep) every category
    const fixed: Project = {
      ...p,
      strings: [
        stringOf(p.panels.slice(0, 8).map((x) => x.id), 1),
        stringOf(p.panels.slice(8).map((x) => x.id), 2),
      ],
    };
    const r2 = computeHealth(fixed);
    for (const c of r2.categories) {
      const before = r.categories.find((x) => x.key === c.key)!;
      if (c.score !== null && before.score !== null) {
        expect(c.score).toBeGreaterThanOrEqual(before.score);
      }
    }
  });

  it('band boundaries sit exactly on the rule-config thresholds', () => {
    const { goodMin, fairMin } = resolveRules().health.bands;
    expect(bandOf(goodMin)).toBe('good');
    expect(bandOf(goodMin - 1)).toBe('fair');
    expect(bandOf(fairMin)).toBe('fair');
    expect(bandOf(fairMin - 1)).toBe('poor');
    expect(bandOf(null)).toBeNull();
  });
});

describe('one-source contract and code registry parity', () => {
  it('the utilization RATIO is charged only via the roof-utilization insight', () => {
    const p = baseProject(8); // 8 panels on a 44-panel roof ⇒ well under 60%
    const util = cat(p, 'utilization');
    const ratioDeductions = util.deductions.filter((d) =>
      d.code.startsWith('roof-utilization'),
    );
    expect(ratioDeductions).toHaveLength(1);
    expect(ratioDeductions[0].source).toBe('insight');
    // anything else in utilization must be a geometric validation code
    // (the fixture's hand-rolled grid overlaps — panel_overlap is legitimate),
    // never a second ratio source
    for (const d of util.deductions) {
      if (d.code.startsWith('roof-utilization')) continue;
      expect(d.source).toBe('validation');
      expect(['panel_overlap', 'setback_breach']).toContain(d.code);
    }
  });

  it('every scored validation code has a penalty, a category and a label', () => {
    const rules = resolveRules().health;
    for (const code of Object.keys(VALIDATION_CATEGORY)) {
      expect(rules.validationPenalties[code], `penalty for ${code}`).toBeGreaterThan(0);
      expect(describeHealthCode(code), `label for ${code}`).not.toBe(code);
    }
    for (const code of Object.keys(rules.validationPenalties)) {
      expect(VALIDATION_CATEGORY[code], `category for ${code}`).toBeDefined();
    }
  });

  it('insight keys resolve to readable labels for the delta panel', () => {
    expect(describeHealthCode('dc-ac-ratio:out-of-band')).toMatch(/DC\/AC/);
    expect(describeHealthCode('roof-utilization:low')).toMatch(/capacity/i);
    expect(describeHealthCode('row-spacing:seg_1')).toMatch(/pitch/i);
    expect(describeHealthCode('totally-unknown')).toBe('totally-unknown'); // honest fallback
  });
});

describe('nextHealthSnapshot — the no-write-loop invariant', () => {
  it('stamps once, then returns null forever for the same project state', () => {
    const p = baseProject(8);
    const first = nextHealthSnapshot(p)!;
    expect(first).not.toBeNull();
    expect(first.prev).toBeNull();
    expect(first.current.key).toBe(healthKey(p));
    const stamped: Project = {
      ...p,
      derived: { ...p.derived, healthSnapshot: first },
    };
    expect(nextHealthSnapshot(stamped)).toBeNull(); // in sync ⇒ no write
  });

  it('chains prev across a real change so the delta names it', () => {
    // start from a SETTLED state — provisional stamps are replaced, not chained
    const p0 = baseProject(8);
    const p: Project = { ...p0, derived: { ...p0.derived, solarAccessFp: shadingFp(p0) } };
    const stamped: Project = {
      ...p,
      derived: { ...p.derived, healthSnapshot: nextHealthSnapshot(p)! },
    };
    // model reality: useDesignSync patches fresh solarAccess values TOGETHER
    // with a new derived.solarAccessFp stamp — the stamp is what moves the key
    // (solarAccess alone is deliberately outside every fingerprint layer)
    const shaded: Project = {
      ...stamped,
      panels: stamped.panels.map((x) => ({ ...x, solarAccess: 0.5 })),
      derived: { ...stamped.derived, solarAccessFp: 'e3|fresh-raycast' },
    };
    const next = nextHealthSnapshot(shaded)!;
    expect(next.prev?.key).toBe(healthKey(p));
    const deltas = explainDelta(next.prev!, next.current);
    expect(deltas.find((d) => d.category === 'energy')!.added).toContain('shaded');
  });
});

describe('persistence hardening', () => {
  it('a malformed persisted snapshot resets to null instead of crashing the sheet', () => {
    const p = baseProject(8);
    const broken = {
      ...p,
      derived: { ...p.derived, healthSnapshot: 'garbage' },
    } as unknown as Project;
    expect(normalizeProject(broken).derived.healthSnapshot).toBeNull();
    const halfBroken = {
      ...p,
      derived: { ...p.derived, healthSnapshot: { current: { key: 1 } } },
    } as unknown as Project;
    expect(normalizeProject(halfBroken).derived.healthSnapshot).toBeNull();
    const valid: Project = {
      ...p,
      derived: { ...p.derived, healthSnapshot: nextHealthSnapshot(p)! },
    };
    expect(normalizeProject(valid).derived.healthSnapshot).not.toBeNull();
  });
});
