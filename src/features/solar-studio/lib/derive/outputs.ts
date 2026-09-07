import type { Project, ValidationIssue } from '../../types';
import { designFp } from '../fingerprints';
import { tmyVersion } from '../energy/tmy';
import { shadeProfileVersion } from '../shade-profile-cache';
import { memoByKey } from './memo';
import { computeEnergyReport } from '../energy/report';
import { bomMoney, mergedBomResult } from '../bom';
import { computeFinancials } from '../finance';
import { layoutIssues, structureIssues } from '../drc';
import { routeIssues } from '../routing';
import { roofHeightIssues } from '../surround-check';
import { bifacialIssues } from '../bifacial-check';
import { validateSystem } from '../stringing';
import { resolveDesignTemps } from '../electrical/temps';

/** designFp + the shading stamp: the two things every customer-facing number reads. */
// …plus the typical year: its identity, and whether it is in memory yet (the
// engine switches from the monthly estimate to the hourly run when it lands)
// …and the shade profile, for the SAME reason. It is the other input that lives
// only in memory: the stamp says WHICH geometry was analysed, not whether the
// per-sample detail is still loaded. A page load wipes it, and a report built
// without it uses each module's annual mean access instead of shade by the hour
// AND drops the "Shading — electrical (strings)" loss line entirely. Leaving the
// version out cached that colder report under a key that never changed again, so
// /proposal opened by URL quoted a different annual yield for the same design —
// permanently, because re-rendering just returned the same memo entry.
const outputKey = (p: Project) =>
  designFp(p) +
  '§' + (p.derived.solarAccessFp ?? '') +
  '§' + (p.location?.tmy?.blobId ?? '') +
  '#' + tmyVersion() +
  '~' + shadeProfileVersion();

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
    ...bifacialIssues(p),
    ...layoutIssues(p, spec),
    ...structureIssues(p, spec),
    ...routeIssues(p, spec),
    ...(spec && inverter
      ? validateSystem(p.strings, spec, inverter, p.components.inverterCount, enabled.length, resolveDesignTemps(p), enabled.map((x) => x.id))
      : []),
  ].sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
});
