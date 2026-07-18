// ─── Persistence gates: v1→v2 migration, quarantine, blobs, quota, LWW ──────
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadState, saveProject } from '../persistence/repository';
import { getImage, resetBlobCacheForTests } from '../persistence/blobs';
import {
  META_KEY,
  V1_BACKUP_KEY,
  V1_KEY,
  projectKey,
  quarantineKey,
  type StudioMeta,
} from '../persistence/schema';
import { newProject, reducer, type AppState } from '../../store/store';
import { fixtureProject } from './fixtures/project';
import type { Project } from '../../types';

// ── minimal localStorage for the node test env ──────────────────────────────
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  quotaFull = false;
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    if (this.quotaFull) throw new DOMException('quota', 'QuotaExceededError');
    this.map.set(key, value);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

beforeEach(async () => {
  storage.quotaFull = false;
  storage.clear();
  // close the cached connection FIRST or deleteDatabase blocks forever
  await resetBlobCacheForTests();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase('solar-studio-blobs');
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

/** A realistic schema-v1 project: inline images, sldParams, no new fields. */
function v1Project(id: string): Record<string, unknown> {
  const p = fixtureProject() as unknown as Record<string, unknown>;
  const clone = structuredClone(p);
  clone.id = id;
  delete clone.derived;
  delete clone.insightState;
  delete clone.coverImageBlobId;
  delete clone.coverForLayoutFp;
  clone.coverImage = 'data:image/png;base64,COVER';
  clone.captures = [
    {
      id: 'sum_noon',
      label: 'Summer Noon',
      dateIso: '2026-06-21',
      hour: 12,
      mode: 'shadow',
      imageDataUrl: 'data:image/png;base64,CAPTURE1',
    },
  ];
  return clone;
}

describe('v1 → v2 migration', () => {
  it('splits the monolith, hoists images to IDB, keeps a backup, quarantines bad projects', async () => {
    const good = v1Project('prj_good');
    const raw = JSON.stringify({
      user: { phone: '9999', companyName: 'Acme Solar', language: 'en' },
      activeProjectId: 'prj_good',
      projects: [good, { id: 'prj_bad', roofs: 'NOT-AN-ARRAY' }],
    });
    storage.setItem(V1_KEY, raw);

    const loaded = await loadState();

    // user + the good project survive; units defaulted
    expect(loaded.user?.companyName).toBe('Acme Solar');
    expect(loaded.user?.units).toBe('metric');
    expect(loaded.projects.map((p) => p.id)).toEqual(['prj_good']);
    expect(loaded.activeProjectId).toBe('prj_good');

    // the corrupt sibling is preserved for recovery, not silently dropped
    expect(loaded.quarantinedIds).toEqual(['prj_bad']);
    expect(storage.getItem(quarantineKey('prj_bad'))).toContain('NOT-AN-ARRAY');

    // images hoisted: project JSON holds only blob ids; bytes live in IDB
    const prj = loaded.projects[0];
    expect(prj.coverImage).toBeNull();
    expect(prj.coverImageBlobId).toBeTruthy();
    expect(prj.captures[0].imageDataUrl).toBeNull();
    expect(prj.captures[0].imageBlobId).toBeTruthy();
    expect(await getImage(prj.captures[0].imageBlobId!)).toBe('data:image/png;base64,CAPTURE1');
    expect(await getImage(prj.coverImageBlobId!)).toBe('data:image/png;base64,COVER');

    // new layout written; v1 renamed to backup
    const meta = JSON.parse(storage.getItem(META_KEY)!) as StudioMeta;
    expect(meta.schemaVersion).toBe(2);
    expect(meta.projectIds).toEqual(['prj_good']);
    expect(storage.getItem(projectKey('prj_good'))).toBeTruthy();
    expect(storage.getItem(V1_KEY)).toBeNull();
    expect(storage.getItem(V1_BACKUP_KEY)).toBe(raw);
  });

  it('round-trips: a second load (now v2 path) returns the same projects', async () => {
    storage.setItem(
      V1_KEY,
      JSON.stringify({ user: null, activeProjectId: null, projects: [v1Project('prj_1')] }),
    );
    const first = await loadState();
    const second = await loadState();
    expect(second.projects.map((p) => p.id)).toEqual(first.projects.map((p) => p.id));
    expect(second.projects[0].panels).toEqual(first.projects[0].panels);
    expect(second.quarantinedIds).toEqual([]);
    // sldParams migration applied and stable across loads
    expect(second.projects[0].sldParams).toBeNull();
  });

  it('an unreadable v1 payload becomes a backup and the app starts fresh', async () => {
    storage.setItem(V1_KEY, '{corrupt json');
    const loaded = await loadState();
    expect(loaded.projects).toEqual([]);
    expect(storage.getItem(V1_BACKUP_KEY)).toBe('{corrupt json');
    expect(storage.getItem(V1_KEY)).toBeNull();
  });
});

describe('v2 loading: per-project quarantine', () => {
  it('one corrupt project never wipes its siblings', async () => {
    const a = fixtureProject();
    const b = { ...newProject(), id: 'prj_b' };
    storage.setItem(projectKey(a.id), JSON.stringify(a));
    storage.setItem(projectKey('prj_broken'), '{not json');
    storage.setItem(projectKey('prj_b'), JSON.stringify(b));
    storage.setItem(
      META_KEY,
      JSON.stringify({
        schemaVersion: 2,
        user: null,
        activeProjectId: a.id,
        projectIds: [a.id, 'prj_broken', 'prj_b'],
      } satisfies StudioMeta),
    );

    const loaded = await loadState();
    expect(loaded.projects.map((p) => p.id).sort()).toEqual([a.id, 'prj_b'].sort());
    expect(loaded.quarantinedIds).toEqual(['prj_broken']);
    expect(storage.getItem(quarantineKey('prj_broken'))).toBe('{not json');
    expect(storage.getItem(projectKey('prj_broken'))).toBeNull();
  });
});

describe('quota failures are reported, not swallowed', () => {
  it('saveProject returns "quota" when storage is full', () => {
    storage.quotaFull = true;
    expect(saveProject(fixtureProject())).toBe('quota');
    storage.quotaFull = false;
    expect(saveProject(fixtureProject())).toBe('ok');
  });

  it('quarantine under quota keeps the original project key (only copy survives)', async () => {
    storage.setItem(projectKey('prj_broken'), '{not json');
    storage.setItem(
      META_KEY,
      JSON.stringify({
        schemaVersion: 2,
        user: null,
        activeProjectId: null,
        projectIds: ['prj_broken'],
      } satisfies StudioMeta),
    );
    storage.quotaFull = true; // quarantine copy cannot be written
    const loaded = await loadState();
    expect(loaded.quarantinedIds).toEqual(['prj_broken']);
    // the raw payload must still exist SOMEWHERE — here, its original key
    expect(storage.getItem(projectKey('prj_broken'))).toBe('{not json');
  });

  it('migration under quota never deletes the v1 monolith', async () => {
    const raw = JSON.stringify({
      user: null,
      activeProjectId: null,
      projects: [v1Project('prj_1')],
    });
    storage.setItem(V1_KEY, raw);
    storage.quotaFull = true; // every write of the new layout fails
    const loaded = await loadState();
    // the session still runs on the fully-migrated in-memory state…
    expect(loaded.projects.map((p) => p.id)).toEqual(['prj_1']);
    // …but the only durable copy (v1) is untouched, and no half-written
    // index can shadow it on the next boot
    expect(storage.getItem(V1_KEY)).toBe(raw);
    expect(storage.getItem(META_KEY)).toBeNull();
    // with space freed, the next boot migrates cleanly
    storage.quotaFull = false;
    const retry = await loadState();
    expect(retry.projects.map((p) => p.id)).toEqual(['prj_1']);
    expect(storage.getItem(V1_KEY)).toBeNull();
    expect(storage.getItem(V1_BACKUP_KEY)).toBe(raw);
  });
});

describe('index resilience and hoist idempotency', () => {
  it('a corrupt meta key rebuilds the index from surviving prj: keys', async () => {
    const a = fixtureProject();
    const b = { ...newProject(), id: 'prj_b' };
    storage.setItem(projectKey(a.id), JSON.stringify(a));
    storage.setItem(projectKey('prj_b'), JSON.stringify(b));
    storage.setItem(META_KEY, '{corrupt meta');
    const loaded = await loadState();
    expect(loaded.projects.map((p) => p.id).sort()).toEqual([a.id, 'prj_b'].sort());
    expect(storage.getItem(`${META_KEY}-corrupt-backup`)).toBe('{corrupt meta');
  });

  it('inline images hoist ONCE: the slim JSON is written back immediately', async () => {
    const p = v1Project('prj_hoist');
    storage.setItem(projectKey('prj_hoist'), JSON.stringify(p));
    storage.setItem(
      META_KEY,
      JSON.stringify({
        schemaVersion: 2,
        user: null,
        activeProjectId: null,
        projectIds: ['prj_hoist'],
      } satisfies StudioMeta),
    );
    const first = await loadState();
    const storedAfterFirst = storage.getItem(projectKey('prj_hoist'))!;
    expect(storedAfterFirst).not.toContain('data:image'); // bytes moved to IDB
    const firstBlobId = first.projects[0].captures[0].imageBlobId;
    expect(firstBlobId).toBeTruthy();
    // a second boot must reuse the SAME blob, not hoist a duplicate
    const second = await loadState();
    expect(second.projects[0].captures[0].imageBlobId).toBe(firstBlobId);
    expect(storage.getItem(projectKey('prj_hoist'))).toBe(storedAfterFirst);
  });
});

describe('multi-tab last-writer-wins (reducer)', () => {
  function base(p: Project): AppState {
    return {
      user: null,
      projects: [p],
      activeProjectId: p.id,
      hydrated: true,
      quarantinedIds: [],
      externalConflictAt: null,
      undoStack: [p],
      redoStack: [],
    };
  }

  it('a strictly newer external version replaces, clears undo, flags the conflict', () => {
    const mine = { ...fixtureProject(), updatedAt: 1000 };
    const theirs = { ...mine, updatedAt: 2000, wizardStep: 9 };
    const next = reducer(base(mine), { type: 'external-project-update', project: theirs });
    expect(next.projects[0].wizardStep).toBe(9);
    expect(next.undoStack).toEqual([]);
    expect(next.externalConflictAt).not.toBeNull();
  });

  it('an equal-or-older external version (our own echo) is ignored', () => {
    const mine = { ...fixtureProject(), updatedAt: 2000 };
    const state = base(mine);
    expect(
      reducer(state, {
        type: 'external-project-update',
        project: { ...mine, updatedAt: 2000, wizardStep: 9 },
      }),
    ).toBe(state);
    expect(
      reducer(state, {
        type: 'external-project-update',
        project: { ...mine, updatedAt: 500, wizardStep: 9 },
      }),
    ).toBe(state);
  });

  it('a project created in another tab is adopted; external delete removes it', () => {
    const mine = fixtureProject();
    const other = { ...newProject(), id: 'prj_other' };
    const withOther = reducer(base(mine), {
      type: 'external-project-update',
      project: other,
    });
    expect(withOther.projects.map((p) => p.id)).toContain('prj_other');
    // not the active project ⇒ no conflict flag, undo intact
    expect(withOther.externalConflictAt).toBeNull();
    expect(withOther.undoStack.length).toBe(1);

    const afterDelete = reducer(withOther, { type: 'external-project-delete', id: 'prj_other' });
    expect(afterDelete.projects.map((p) => p.id)).not.toContain('prj_other');
  });
});
