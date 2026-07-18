// ─── Project repository: localStorage(meta + per-project) + IDB images ──────
// One module owns ALL storage I/O. Guarantees the store relies on:
//   · per-project quarantine — one corrupt project NEVER wipes its siblings
//   · quota failures are reported, not swallowed (→ "Not saved" chip)
//   · one-time v1→v2 migration, with the v1 payload kept as a backup key
//   · inline base64 images are hoisted into IndexedDB on load (idempotent)
//   · `storage` events surface other-tab writes for last-writer-wins merge
import type { AppUser, Project } from '../../types';
import {
  META_KEY,
  PROJECT_KEY_PREFIX,
  SCHEMA_VERSION,
  V1_BACKUP_KEY,
  V1_KEY,
  projectKey,
  quarantineKey,
  type StudioMeta,
} from './schema';
import { normalizeProject } from './normalize';
import { putImage } from './blobs';

export interface LoadedState {
  user: AppUser | null;
  projects: Project[];
  activeProjectId: string | null;
  /** projects preserved under quarantine keys this load (recovery possible) */
  quarantinedIds: string[];
}

export type ExternalChange =
  | { kind: 'project'; project: Project }
  | { kind: 'project-deleted'; id: string }
  | { kind: 'meta'; meta: StudioMeta };

/**
 * Hoist any schema-v1 inline base64 images into the blob store. Idempotent —
 * projects already on blob ids pass through untouched. Runs BEFORE
 * normalizeProject (which nulls the deprecated fields). `hoisted` tells the
 * caller image bytes moved, so the slimmed project JSON must be written back
 * immediately (otherwise every boot re-hoists new duplicate blobs).
 */
async function hoistInlineImages(p: Project): Promise<{ project: Project; hoisted: boolean }> {
  let hoisted = false;
  const captures = await Promise.all(
    (Array.isArray(p.captures) ? p.captures : []).map(async (c) => {
      if (c.imageBlobId || !c.imageDataUrl) return { ...c, imageDataUrl: null };
      hoisted = true;
      try {
        return { ...c, imageBlobId: await putImage(c.imageDataUrl), imageDataUrl: null };
      } catch {
        // blob store unavailable — drop the image rather than the project
        return { ...c, imageBlobId: null, imageDataUrl: null };
      }
    }),
  );
  let coverImageBlobId = p.coverImageBlobId ?? null;
  if (!coverImageBlobId && p.coverImage) {
    hoisted = true;
    try {
      coverImageBlobId = await putImage(p.coverImage);
    } catch {
      coverImageBlobId = null;
    }
  }
  return { project: { ...p, captures, coverImageBlobId, coverImage: null }, hoisted };
}

async function parseProject(raw: string): Promise<{ project: Project; hoisted: boolean }> {
  const parsed = JSON.parse(raw) as Project;
  if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.roofs)) {
    throw new Error('not a project payload');
  }
  const { project, hoisted } = await hoistInlineImages(parsed);
  return { project: normalizeProject(project), hoisted };
}

/** True when the write failed because storage is full. */
function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

export type SaveResult = 'ok' | 'quota' | 'error';

function write(key: string, value: string): SaveResult {
  try {
    localStorage.setItem(key, value);
    return 'ok';
  } catch (err) {
    return isQuotaError(err) ? 'quota' : 'error';
  }
}

// ─── Load (with one-time v1→v2 migration) ───────────────────────────────────

async function loadV2(meta: StudioMeta): Promise<LoadedState> {
  const projects: Project[] = [];
  const quarantinedIds: string[] = [];
  for (const id of meta.projectIds) {
    const raw = localStorage.getItem(projectKey(id));
    if (raw == null) continue; // deleted externally; meta heals on next save
    try {
      const { project, hoisted } = await parseProject(raw);
      projects.push(project);
      // image bytes just moved to IDB — persist the slim JSON now, or the
      // next boot re-hoists duplicates and the fat payload stays in the key
      if (hoisted) write(projectKey(id), JSON.stringify(project));
    } catch {
      // preserve the raw payload for recovery; NEVER touch the siblings.
      // The original key is removed ONLY once the quarantine copy is safely
      // down — under quota pressure the project key itself stays the copy.
      quarantinedIds.push(id);
      if (write(quarantineKey(id), raw) === 'ok') {
        localStorage.removeItem(projectKey(id));
      }
    }
  }
  return {
    user: meta.user ? { ...meta.user, units: meta.user.units ?? 'metric' } : null,
    projects,
    activeProjectId: meta.activeProjectId,
    quarantinedIds,
  };
}

async function migrateV1(raw: string): Promise<LoadedState> {
  const quarantinedIds: string[] = [];
  let parsed: { user?: AppUser | null; projects?: Project[]; activeProjectId?: string | null };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // v1 payload unreadable as a whole — keep it as backup, start fresh.
    // If even the backup can't be written, the v1 key itself stays as backup.
    if (write(V1_BACKUP_KEY, raw) === 'ok') localStorage.removeItem(V1_KEY);
    return { user: null, projects: [], activeProjectId: null, quarantinedIds };
  }
  const projects: Project[] = [];
  for (const p of parsed.projects ?? []) {
    try {
      projects.push((await parseProject(JSON.stringify(p))).project);
    } catch {
      const id = (p as { id?: string })?.id ?? `unknown_${projects.length}`;
      quarantinedIds.push(id);
      write(quarantineKey(id), JSON.stringify(p));
    }
  }
  const user = parsed.user ? { ...parsed.user, units: parsed.user.units ?? 'metric' } : null;
  const activeProjectId = parsed.activeProjectId ?? null;
  // write the new layout, THEN swap v1 → backup. The v1 key is removed ONLY
  // when every write of the new layout AND the backup landed — under quota
  // pressure the monolith stays put and migration retries next boot, so no
  // write path can silently delete the only copy of the user's data.
  const results: SaveResult[] = [];
  for (const p of projects) results.push(write(projectKey(p.id), JSON.stringify(p)));
  results.push(
    write(
      META_KEY,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        user,
        activeProjectId,
        projectIds: projects.map((p) => p.id),
      } satisfies StudioMeta),
    ),
  );
  results.push(write(V1_BACKUP_KEY, raw));
  if (results.every((r) => r === 'ok')) {
    localStorage.removeItem(V1_KEY);
  } else {
    // partial write — drop the (possibly incomplete) meta so the next boot
    // re-runs migration from the untouched v1 monolith instead of trusting
    // a half-written index. This session still runs on the full in-memory
    // state, and the store's quota chip surfaces the save failure.
    localStorage.removeItem(META_KEY);
  }
  return { user, projects, activeProjectId, quarantinedIds };
}

/** All ids that currently have a per-project key (index rebuild source). */
function scanProjectKeyIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PROJECT_KEY_PREFIX)) ids.push(key.slice(PROJECT_KEY_PREFIX.length));
  }
  return ids;
}

export async function loadState(): Promise<LoadedState> {
  try {
    const metaRaw = localStorage.getItem(META_KEY);
    if (metaRaw) {
      let meta: StudioMeta | null = null;
      try {
        meta = JSON.parse(metaRaw) as StudioMeta;
      } catch {
        // corrupt index must not orphan intact projects: keep the raw meta
        // for inspection and rebuild the index from the surviving prj: keys
        write(`${META_KEY}-corrupt-backup`, metaRaw);
        meta = {
          schemaVersion: SCHEMA_VERSION,
          user: null,
          activeProjectId: null,
          projectIds: scanProjectKeyIds(),
        };
      }
      if (meta && Array.isArray(meta.projectIds)) return await loadV2(meta);
      // meta parsed but isn't a usable index — same rebuild path
      write(`${META_KEY}-corrupt-backup`, metaRaw);
      return await loadV2({
        schemaVersion: SCHEMA_VERSION,
        user: null,
        activeProjectId: null,
        projectIds: scanProjectKeyIds(),
      });
    }
    const v1 = localStorage.getItem(V1_KEY);
    if (v1) return await migrateV1(v1);
  } catch {
    // storage unreadable — behave like a fresh browser, never crash the app
  }
  return { user: null, projects: [], activeProjectId: null, quarantinedIds: [] };
}

// ─── Save (dirty-key-only) ──────────────────────────────────────────────────

export function saveMeta(
  user: AppUser | null,
  activeProjectId: string | null,
  projectIds: string[],
): SaveResult {
  return write(
    META_KEY,
    JSON.stringify({ schemaVersion: SCHEMA_VERSION, user, activeProjectId, projectIds }),
  );
}

export function saveProject(p: Project): SaveResult {
  return write(projectKey(p.id), JSON.stringify(p));
}

export function removeProject(id: string): void {
  try {
    localStorage.removeItem(projectKey(id));
  } catch {
    /* removing can't fail on quota; ignore exotic errors */
  }
}

/** Ids that currently sit in quarantine (dashboard recovery notice). */
export function quarantinedIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('solar-studio-quarantine:')) {
        ids.push(key.slice('solar-studio-quarantine:'.length));
      }
    }
  } catch {
    /* unreadable storage — nothing to report */
  }
  return ids;
}

/**
 * Blob ids referenced from quarantined raw payloads — the boot-time image
 * sweep must NOT delete these, or a recovered project comes back without its
 * captures. Regex over the raw JSON is deliberate: quarantined payloads by
 * definition may not parse.
 */
export function quarantinedBlobIds(): string[] {
  const ids: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('solar-studio-quarantine:')) continue;
      const raw = localStorage.getItem(key) ?? '';
      for (const m of raw.matchAll(/img_[0-9a-fA-F-]{10,}/g)) ids.push(m[0]);
    }
  } catch {
    /* unreadable storage */
  }
  return ids;
}

/**
 * Remove per-project keys whose id the app no longer knows — used on the
 * post-recovery full flush (persisted snapshot lost), where the normal
 * prev-vs-next diff can't see deletions. `keepIds` must include quarantined
 * ids: a corrupt project whose quarantine copy could not be written still
 * lives in its original key, and that key is its ONLY copy.
 */
export function sweepOrphanProjectKeys(keepIds: Set<string>): void {
  try {
    for (const id of scanProjectKeyIds()) {
      if (!keepIds.has(id)) localStorage.removeItem(projectKey(id));
    }
  } catch {
    /* unreadable storage */
  }
}

// ─── Multi-tab reconciliation ───────────────────────────────────────────────

/**
 * Listen for writes from OTHER tabs (the `storage` event never fires in the
 * writing tab). Project payloads are parsed + normalized before delivery;
 * unparseable external writes are ignored (the writer owns quarantine).
 */
export function subscribeExternalChanges(cb: (change: ExternalChange) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (!e.key) return;
    if (e.key.startsWith(PROJECT_KEY_PREFIX)) {
      const id = e.key.slice(PROJECT_KEY_PREFIX.length);
      if (e.newValue == null) {
        cb({ kind: 'project-deleted', id });
        return;
      }
      parseProject(e.newValue)
        .then(({ project }) => cb({ kind: 'project', project }))
        .catch(() => {});
      return;
    }
    if (e.key === META_KEY && e.newValue) {
      try {
        cb({ kind: 'meta', meta: JSON.parse(e.newValue) as StudioMeta });
      } catch {
        /* ignore malformed external meta */
      }
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
