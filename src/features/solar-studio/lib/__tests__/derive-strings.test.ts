// lib/__tests__/derive-strings.test.ts
import { describe, expect, it } from 'vitest';
import { fixtureProject } from './fixtures/project';
import type { Project, StringDef } from '../../types';
import { deriveStringPlan } from '../electrical/derive-strings';
import { electricalGate } from '../electrical/gate';
import { validateSystem } from '../stringing';
import { resolveDesignTemps } from '../electrical/temps';

function proj(count = 12): Project {
  const p = fixtureProject(count);
  return { ...p, strings: [] };
}

describe('deriveStringPlan', () => {
  it('keeps a valid manual string and plans the auto strings AROUND it', () => {
    const p = proj();
    const manual: StringDef = {
      id: 'str_manual', name: 'String 1', inverterIndex: 0, mpptIndex: 0,
      panelIds: p.panels.slice(0, 4).map((m) => m.id), color: '#000', manual: true,
    };
    const plan = deriveStringPlan({ ...p, strings: [manual] });
    expect(plan.strings.find((s) => s.id === 'str_manual')).toEqual(manual);
    const auto = plan.strings.filter((s) => !s.manual);
    const autoIds = new Set(auto.flatMap((s) => s.panelIds));
    for (const id of manual.panelIds) expect(autoIds.has(id)).toBe(false);
    // the manual string's MPPT slot is not reused by an auto string
    expect(auto.every((s) => !(s.inverterIndex === 0 && s.mpptIndex === 0))).toBe(true);
    expect(auto[0]?.name).toBe('String 2');
  });
});

describe('defect #2 — a module wired into two strings', () => {
  it('is an electrical ERROR and blocks the gate', () => {
    const p = fixtureProject(8);
    const dup: StringDef = { ...p.strings[0], id: 'str_dup', name: 'Dup', mpptIndex: 1 };
    const bad = { ...p, strings: [p.strings[0], dup] };
    const issues = validateSystem(bad.strings, bad.components.panel, bad.components.inverter, 1, 8, resolveDesignTemps(bad), bad.panels.map((m) => m.id));
    expect(issues.some((i) => i.code === 'panel_in_two_strings' && i.level === 'error')).toBe(true);
    expect(electricalGate(bad)).not.toBeNull();
  });
});
