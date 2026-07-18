// ─── Duplicating a project ──────────────────────────────────────────────────
// "Save as a variant" — the usual reason is to price Option B against Option A
// on the same roof. The design copies in full; three things deliberately do NOT:
//
//   1. `shareId` — a share link identifies ONE document. Reusing it would make
//      the copy silently overwrite what a customer already received.
//   2. captures + cover — these are IndexedDB blob REFERENCES, and blob GC is
//      driven by `projectBlobIds(project)` on delete (persistence/blobs.ts:94).
//      A copy sharing those ids would have its images deleted out from under it
//      the moment either project was removed. Dropping them is honest: captures
//      are stamped `forDesignFp` and get retaken per variant anyway.
//   3. `status` — a copy with no captures is not proposal-ready, whatever the
//      original claimed.
import type { Project } from '../types';

export interface DuplicateIds {
  id: string;
  shareId: string;
  now: number;
}

/** Name a copy without stacking "(copy) (copy)" on repeated duplication. */
export function copyName(name: string, existing: string[]): string {
  const base = name.replace(/ \(copy( \d+)?\)$/, '');
  if (!existing.includes(`${base} (copy)`)) return `${base} (copy)`;
  for (let n = 2; ; n++) {
    const candidate = `${base} (copy ${n})`;
    if (!existing.includes(candidate)) return candidate;
  }
}

/**
 * A pure copy of `p`. Ids and the clock are injected so this stays testable —
 * the caller supplies `crypto.randomUUID()` values and `Date.now()`.
 */
export function duplicateProject(
  p: Project,
  ids: DuplicateIds,
  existingNames: string[] = [],
): Project {
  return {
    ...p,
    id: ids.id,
    shareId: ids.shareId,
    createdAt: ids.now,
    updatedAt: ids.now,
    status: 'in_progress',
    info: { ...p.info, name: copyName(p.info.name, existingNames) },
    captures: [],
    coverImageBlobId: null,
    coverImage: null,
    coverForLayoutFp: null,
  };
}
