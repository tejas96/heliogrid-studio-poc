// ─── BOM edit actions (Phase 22c) ───────────────────────────────────────────
// The screen calls these; each returns a project PATCH, so every BOM edit is
// one undoable step like every other §H action.
//
// MIGRATION IS LAZY, and deliberately so. Converting legacy whole-line
// overrides requires re-deriving the BOM to resolve the old `category|item`
// key, which is far too heavy for normalize.ts (it runs on every load of every
// project). Instead the first edit converts, exactly once:
//
//   · a project that never touches its BOM is never migrated, so its designFp
//     — and every capture stamped against it — stays byte-identical forever;
//   · a project that does gets converted in the same patch as the edit, so the
//     conversion is undoable together with the thing that triggered it.
import type { BomLine, BomState, Project } from '../../types';
import { deriveBom } from '../bom';
import {
  clearFieldOverride,
  clearOverrides,
  migrateLegacyOverrides,
  setFieldOverride,
  type OverridableField,
} from './merge';

export interface BomPatch {
  bom: BomState;
  /** always cleared once migrated — the legacy array must not double-apply */
  bomOverrides: BomLine[];
}

/** The project's BOM state, converting the legacy array on first touch. */
function ensureState(project: Project): BomState {
  if (project.bom) return project.bom;
  const { overrides, custom } = migrateLegacyOverrides(project);
  return { overrides, custom };
}

function patch(state: BomState): BomPatch {
  return { bom: state, bomOverrides: [] };
}

/** Override one field, stamping what the engine says right now (for staleness). */
export function editBomField(
  project: Project,
  lineKey: string,
  field: OverridableField,
  value: unknown,
): BomPatch {
  const auto = deriveBom(project).find((l) => l.id === lineKey);
  const autoNow = auto ? (auto as unknown as Record<string, unknown>)[field] : undefined;
  return patch(setFieldOverride(ensureState(project), lineKey, field, value, autoNow));
}

/** The ↻ reset on a single field. */
export function resetBomField(project: Project, lineKey: string, field: string): BomPatch {
  return patch(clearFieldOverride(ensureState(project), lineKey, field));
}

/** "Refresh from design" over a set of lines (one section, or all of them). */
export function refreshBomLines(project: Project, lineKeys: string[]): BomPatch {
  return patch(clearOverrides(ensureState(project), lineKeys));
}

/** Add a hand-entered line. */
export function addCustomBomLine(project: Project, line: BomLine): BomPatch {
  const s = ensureState(project);
  return patch({ ...s, custom: [...s.custom, { ...line, auto: false, overridden: false }] });
}

export function removeCustomBomLine(project: Project, id: string): BomPatch {
  const s = ensureState(project);
  return patch({ ...s, custom: s.custom.filter((c) => c.id !== id) });
}

/**
 * Keep an orphaned edit as a hand-entered line instead of discarding it.
 * The alternative — silently dropping pricing work the user did — is precisely
 * what the old model got wrong.
 */
export function adoptOrphanAsCustom(project: Project, lineKey: string, line: BomLine): BomPatch {
  const s = clearOverrides(ensureState(project), [lineKey]);
  return patch({ ...s, custom: [...s.custom, { ...line, auto: false, overridden: false }] });
}

/** Discard an orphaned edit outright (explicit user choice, never automatic). */
export function discardOrphan(project: Project, lineKey: string): BomPatch {
  return patch(clearOverrides(ensureState(project), [lineKey]));
}

/** Section-level derivation inputs (Phase 22e). */
export function setBomInput(
  project: Project,
  key: keyof NonNullable<BomState['inputs']>,
  value: number | undefined,
): BomPatch {
  const s = ensureState(project);
  const inputs = { ...(s.inputs ?? {}), [key]: value };
  const empty = Object.values(inputs).every((v) => v === undefined);
  return patch({ ...s, inputs: empty ? undefined : inputs });
}
