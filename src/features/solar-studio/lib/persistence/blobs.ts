// ─── IndexedDB image store ──────────────────────────────────────────────────
// Capture/cover images are multi-hundred-KB base64 strings. Keeping them
// inside the project JSON meant every keystroke re-serialized megabytes into
// localStorage (and undo snapshots pinned them in memory). They live here
// instead, referenced from the project by id.
//
// Values are stored as data-URL strings: consumers keep using plain <img src>
// and there is no object-URL lifecycle to manage. A small in-memory cache
// makes repeat reads synchronous-fast and lets useImage render without flicker.
import type { Project } from '../../types';

const DB_NAME = 'solar-studio-blobs';
const STORE = 'images';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // a failed open must not poison every later call
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

const memCache = new Map<string, string>();

function genBlobId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `img_${crypto.randomUUID()}`
    : `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Store a data-URL; resolves to its blob id. */
export async function putImage(dataUrl: string): Promise<string> {
  const id = genBlobId();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  memCache.set(id, dataUrl);
  return id;
}

/** Read a stored image; null when missing (deleted / different browser). */
export async function getImage(id: string): Promise<string | null> {
  const cached = memCache.get(id);
  if (cached) return cached;
  const db = await openDb();
  const value = await new Promise<string | null>((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : null);
    req.onerror = () => reject(req.error);
  });
  if (value) memCache.set(id, value);
  return value;
}

/** Synchronous cache peek — lets useImage first-render without a flash. */
export function peekImage(id: string): string | null {
  return memCache.get(id) ?? null;
}

/** Best-effort GC for dropped references (project delete, capture overwrite). */
export async function deleteImages(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  for (const id of ids) memCache.delete(id);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      for (const id of ids) tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // GC failure only wastes space — never surface it
  }
}

/** Every blob id a project references — drives GC on delete/wipe. */
export function projectBlobIds(p: Project): string[] {
  const ids = p.captures.map((c) => c.imageBlobId).filter((x): x is string => !!x);
  if (p.coverImageBlobId) ids.push(p.coverImageBlobId);
  return ids;
}

/**
 * Boot-time sweep: delete stored images no loaded project references (capture
 * retakes and relocation wipes orphan their old blobs during a session; those
 * ids may still sit in the in-memory undo stack, so the sweep runs only at
 * hydration, when no undo history exists yet).
 */
export async function pruneOrphanImages(referenced: Set<string>): Promise<void> {
  try {
    const db = await openDb();
    const keys = await new Promise<string[]>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result.filter((k): k is string => typeof k === 'string'));
      req.onerror = () => reject(req.error);
    });
    await deleteImages(keys.filter((k) => !referenced.has(k)));
  } catch {
    // sweep failure only wastes space
  }
}

/** Test helper: closes the cached connection so deleteDatabase can't block. */
export async function resetBlobCacheForTests(): Promise<void> {
  memCache.clear();
  if (dbPromise) {
    try {
      (await dbPromise).close();
    } catch {
      /* already closed/failed */
    }
  }
  dbPromise = null;
}
