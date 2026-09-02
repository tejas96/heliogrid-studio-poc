import type { Project, ValidationIssue } from '../../types';
import { designFp } from '../fingerprints';
import { memoByKey } from './memo';
import { computeEnergyReport } from '../solar';
import { bomMoney, mergedBomResult } from '../bom';
import { computeFinancials } from '../finance';
import { layoutIssues, structureIssues } from '../drc';
import { routeIssues } from '../routing';
import { roofHeightIssues } from '../surround-check';
import { validateSystem } from '../stringing';
import { resolveDesignTemps } from '../electrical/temps';

/** designFp + the shading stamp: the two things every customer-facing number reads. */
const outputKey = (p: Project) => designFp(p) + '§' + (p.derived.solarAccessFp ?? '');

export const deriveEnergy = memoByKey(outputKey, computeEnergyReport);
export const deriveBomResult = memoByKey(outputKey, mergedBomResult);
export const deriveMoney = memoByKey(outputKey, (p) => bomMoney(deriveBomResult(p).lines, p));
export const deriveFinance = memoByKey(outputKey, (p) => computeFinancials(p, deriveEnergy(p)));

const LEVEL_RANK: Record<ValidationIssue['level'], number> = { error: 0, warn: 1, ok: 2 };

/** Every check Step 6 shows, composed once, errors first — the same list the ops kernel counts. */
export const designIssues = memoByKey(outputKey, (p): ValidationIssue[] => {
  const spec = p.components.panel;
  const inverter = p.components.inverter;
  const enabled = p.panels.filter((x) => x.enabled);
  return [
    ...roofHeightIssues(p),
    ...layoutIssues(p, spec),
    ...structureIssues(p, spec),
    ...routeIssues(p, spec),
    ...(spec && inverter
      ? validateSystem(p.strings, spec, inverter, p.components.inverterCount, enabled.length, resolveDesignTemps(p), enabled.map((x) => x.id))
      : []),
  ].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
});
