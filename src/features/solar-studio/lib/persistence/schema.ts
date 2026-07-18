// ─── Persistence schema: versioned envelope + per-project keys ──────────────
// Layout in localStorage (schema v2):
//   solar-studio-meta            { schemaVersion, user, activeProjectId, projectIds }
//   solar-studio-prj:<id>        one Project JSON per key
//   solar-studio-quarantine:<id> raw string of a project that failed to parse —
//                                preserved for recovery, never auto-deleted
// Images (captures/cover) live in IndexedDB (blobs.ts), referenced by id, so
// a keystroke never re-serializes megabytes of base64 and quota failures on
// one project can't take the whole app down.
//
// v1 (legacy): everything — user + ALL projects + inline base64 — under one
// 'solar-studio-v1' key. The one-time migration splits it and keeps a backup.
import type { AppUser } from '../../types';

export const META_KEY = 'solar-studio-meta';
export const PROJECT_KEY_PREFIX = 'solar-studio-prj:';
export const QUARANTINE_KEY_PREFIX = 'solar-studio-quarantine:';
export const V1_KEY = 'solar-studio-v1';
export const V1_BACKUP_KEY = 'solar-studio-v1-backup';
export const SCHEMA_VERSION = 2;

export interface StudioMeta {
  schemaVersion: number;
  user: AppUser | null;
  activeProjectId: string | null;
  /** load order + existence — the authoritative project index */
  projectIds: string[];
}

export const projectKey = (id: string) => `${PROJECT_KEY_PREFIX}${id}`;
export const quarantineKey = (id: string) => `${QUARANTINE_KEY_PREFIX}${id}`;
