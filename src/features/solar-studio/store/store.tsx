// ─── App store: context + reducer, repository persistence, undo ─────────────
// Storage I/O lives in lib/persistence (schema v2: meta + per-project keys,
// images in IndexedDB). This module owns state shape, the reducer, and WHEN
// to persist: debounced dirty-key-only writes, quota surfaced as a status the
// UI can show, `storage`-event reconciliation for multi-tab use.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppUser, Project } from '../types';
import { genId } from '../lib/geo';
import { DEFAULT_MARGIN_PCT } from '../data/pricebook';
import { resolveRules } from '../data/rules/india';
import {
  loadState,
  quarantinedBlobIds,
  removeProject,
  saveMeta,
  saveProject,
  subscribeExternalChanges,
  sweepOrphanProjectKeys,
  type SaveResult,
} from '../lib/persistence/repository';
import { deleteImages, projectBlobIds, pruneOrphanImages } from '../lib/persistence/blobs';

// re-exported so schema-resilience tests and older imports keep one entry point
export { normalizeProject, normalizeWeather } from '../lib/persistence/normalize';

export interface AppState {
  user: AppUser | null;
  projects: Project[];
  activeProjectId: string | null;
  /** Browser storage is loaded only after the initial client hydration. */
  hydrated: boolean;
  /** projects that failed to parse and were preserved for recovery */
  quarantinedIds: string[];
  /** the active project was replaced by a newer version from another tab */
  externalConflictAt: number | null;
  /** simple undo stack of project snapshots for the active project */
  undoStack: Project[];
  redoStack: Project[];
}

export type Action =
  | { type: 'login'; user: AppUser }
  | { type: 'logout' }
  | { type: 'set-language'; language: AppUser['language'] }
  | { type: 'set-units'; units: AppUser['units'] }
  | { type: 'create-project'; project: Project }
  | { type: 'delete-project'; id: string }
  | { type: 'open-project'; id: string }
  | { type: 'close-project' }
  | {
      type: 'hydrate';
      state: Omit<AppState, 'hydrated' | 'undoStack' | 'redoStack' | 'externalConflictAt'>;
    }
  | { type: 'update-project'; patch: Partial<Project>; undoable?: boolean }
  // background health stamp — merged into the CURRENT project at reduce time
  // (a debounced setTimeout closure can hold a stale derived; this can't)
  | {
      type: 'stamp-health';
      snapshot: NonNullable<Project['derived']['healthSnapshot']>;
    }
  | { type: 'undo' }
  | { type: 'redo' }
  // another tab wrote this project — adopt if strictly newer (LWW)
  | { type: 'external-project-update'; project: Project }
  | { type: 'external-project-delete'; id: string }
  | { type: 'external-user'; user: AppUser | null }
  | { type: 'dismiss-external-conflict' };

export function newShareId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 12);
}

export function newProject(): Project {
  return {
    id: genId('prj'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'in_progress',
    wizardStep: 1,
    info: {
      name: 'New Solar Project',
      customerName: '',
      customerPhone: '',
      country: 'India',
      state: '',
      discom: '',
      siteType: 'residential',
      connectionType: 'single',
      sanctionedLoadKw: 0,
      groundMount: false,
      logoDataUrl: null,
      monthlyBillInr: null,
      tariffInrPerKwh: resolveRules().defaults.tariffNewProjectInrPerKwh,
    },
    location: null,
    roofs: [],
    obstructions: [],
    components: { panel: null, targetKwp: 0, inverter: null, inverterCount: 1 },
    panels: [],
    segments: [],
    keepouts: [],
    walkways: [],
    rails: [],
    arresters: [],
    inverterPlacements: [],
    strings: [],
    captures: [],
    coverImageBlobId: null,
    coverImage: null,
    coverForLayoutFp: null,
    sldParams: null,
    bomOverrides: [],
    pricing: { marginPct: DEFAULT_MARGIN_PCT },
    derived: { solarAccessFp: null, sldOverrides: null, sldIntroSeen: false, healthSnapshot: null },
    calibration: { scaleFactor: 1, northOffsetDeg: 0, reference: null },
    insightState: {},
    shareId: newShareId(),
  };
}

const INITIAL_STATE: AppState = {
  user: null,
  projects: [],
  activeProjectId: null,
  hydrated: false,
  quarantinedIds: [],
  externalConflictAt: null,
  undoStack: [],
  redoStack: [],
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'login':
      return { ...state, user: action.user };
    case 'logout':
      return { ...state, user: null, activeProjectId: null };
    case 'set-language':
      return state.user
        ? { ...state, user: { ...state.user, language: action.language } }
        : state;
    case 'set-units':
      return state.user
        ? { ...state, user: { ...state.user, units: action.units } }
        : state;
    case 'create-project':
      return {
        ...state,
        projects: [action.project, ...state.projects],
        activeProjectId: action.project.id,
        undoStack: [],
        redoStack: [],
      };
    case 'delete-project':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
        activeProjectId:
          state.activeProjectId === action.id ? null : state.activeProjectId,
      };
    case 'open-project':
      return {
        ...state,
        activeProjectId: action.id,
        undoStack: [],
        redoStack: [],
        externalConflictAt: null,
      };
    case 'close-project':
      return { ...state, activeProjectId: null, undoStack: [], redoStack: [] };
    case 'hydrate':
      return {
        ...action.state,
        hydrated: true,
        externalConflictAt: null,
        undoStack: [],
        redoStack: [],
      };
    case 'update-project': {
      const id = state.activeProjectId;
      if (!id) return state;
      const current = state.projects.find((p) => p.id === id);
      if (!current) return state;
      const updated: Project = {
        ...current,
        ...action.patch,
        updatedAt: Date.now(),
      };
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
        undoStack: action.undoable
          ? [...state.undoStack.slice(-24), current]
          : state.undoStack,
        redoStack: action.undoable ? [] : state.redoStack,
      };
    }
    case 'stamp-health': {
      const id = state.activeProjectId;
      if (!id) return state;
      const current = state.projects.find((p) => p.id === id);
      if (!current) return state;
      const updated: Project = {
        ...current,
        derived: { ...current.derived, healthSnapshot: action.snapshot },
        updatedAt: Date.now(),
      };
      // derived data — never an undo step
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === id ? updated : p)),
      };
    }
    case 'undo': {
      const id = state.activeProjectId;
      const prev = state.undoStack[state.undoStack.length - 1];
      if (!id || !prev) return state;
      const current = state.projects.find((p) => p.id === id)!;
      // restored snapshots get a FRESH updatedAt: the multi-tab merge is
      // last-writer-wins on that clock, so an undo persisted with its old
      // timestamp would be ignored by other tabs and silently re-overwritten
      const restored: Project = { ...prev, updatedAt: Date.now() };
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === id ? restored : p)),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, current],
      };
    }
    case 'redo': {
      const id = state.activeProjectId;
      const next = state.redoStack[state.redoStack.length - 1];
      if (!id || !next) return state;
      const current = state.projects.find((p) => p.id === id)!;
      const restored: Project = { ...next, updatedAt: Date.now() };
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === id ? restored : p)),
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, current],
      };
    }
    case 'external-project-update': {
      const incoming = action.project;
      const existing = state.projects.find((p) => p.id === incoming.id);
      // last-writer-wins, STRICTLY newer — an equal timestamp is our own echo
      if (existing && existing.updatedAt >= incoming.updatedAt) return state;
      const projects = existing
        ? state.projects.map((p) => (p.id === incoming.id ? incoming : p))
        : [incoming, ...state.projects];
      const isActive = state.activeProjectId === incoming.id;
      // background stampers (health/shading) in OTHER tabs echo content-equal
      // projects that differ only in derived stamps + updatedAt — adopting
      // those must neither wipe the editing tab's undo history nor raise a
      // false "updated in another tab" conflict banner
      const stampOnly =
        existing != null &&
        JSON.stringify({ ...existing, updatedAt: 0, derived: null }) ===
          JSON.stringify({ ...incoming, updatedAt: 0, derived: null });
      return {
        ...state,
        projects,
        // local undo history describes a replaced timeline — drop it
        undoStack: isActive && !stampOnly ? [] : state.undoStack,
        redoStack: isActive && !stampOnly ? [] : state.redoStack,
        externalConflictAt: isActive && !stampOnly ? Date.now() : state.externalConflictAt,
      };
    }
    case 'external-project-delete':
      return {
        ...state,
        projects: state.projects.filter((p) => p.id !== action.id),
        activeProjectId:
          state.activeProjectId === action.id ? null : state.activeProjectId,
      };
    case 'external-user':
      return { ...state, user: action.user };
    case 'dismiss-external-conflict':
      return { ...state, externalConflictAt: null };
    default:
      return state;
  }
}

export type PersistStatus = 'ok' | 'quota' | 'error';

const StoreCtx = createContext<{
  state: AppState;
  dispatch: (a: Action) => void;
  /** 'quota'/'error' ⇒ latest changes are NOT saved — surfaced as a chip */
  persistStatus: PersistStatus;
  /** re-attempt every write (after the user frees storage) */
  retryPersist: () => void;
} | null>(null);

/** Last-persisted snapshot for dirty-key diffing. */
interface PersistedSnapshot {
  user: AppUser | null;
  activeProjectId: string | null;
  projects: Map<string, Project>;
}

const PERSIST_DEBOUNCE_MS = 250;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [persistStatus, setPersistStatus] = useState<PersistStatus>('ok');
  const persistedRef = useRef<PersistedSnapshot | null>(null);
  const pendingRef = useRef<AppState | null>(null);
  const timerRef = useRef<number | null>(null);

  // hydrate from the repository (async: v1→v2 migration + image hoisting)
  useEffect(() => {
    let mounted = true;
    loadState().then((loaded) => {
      if (!mounted) return;
      // seed the persisted snapshot with EXACTLY what storage holds, so the
      // first flush writes nothing — a booting tab must never blanket-rewrite
      // keys (that would clobber newer data another tab saved meanwhile)
      persistedRef.current = {
        user: loaded.user,
        activeProjectId: loaded.activeProjectId,
        projects: new Map(loaded.projects.map((p) => [p.id, p])),
      };
      dispatch({ type: 'hydrate', state: loaded });
      // boot-time GC: blobs referenced by loaded projects AND quarantined
      // payloads survive (recovery must keep its images). Safe here — no
      // undo history exists yet that could reference others.
      pruneOrphanImages(
        new Set([...loaded.projects.flatMap(projectBlobIds), ...quarantinedBlobIds()]),
      );
    });
    return () => {
      mounted = false;
    };
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = pendingRef.current;
    if (!next) return;
    pendingRef.current = null;
    const prev = persistedRef.current;
    const results: SaveResult[] = [];

    const nextIds = next.projects.map((p) => p.id);
    // dirty projects only: reference inequality against the persisted snapshot
    for (const p of next.projects) {
      if (!prev || prev.projects.get(p.id) !== p) results.push(saveProject(p));
    }
    // deletions: remove the key AND its images
    if (prev) {
      for (const [id, old] of prev.projects) {
        if (!nextIds.includes(id)) {
          removeProject(id);
          deleteImages(projectBlobIds(old));
        }
      }
    } else {
      // recovery flush (snapshot lost, e.g. quota Retry): the diff can't see
      // deletions, so sweep keys the app no longer knows — otherwise deleting
      // projects to free space never actually frees it. Quarantined ids stay:
      // for a failed quarantine write the prj: key is the only surviving copy.
      sweepOrphanProjectKeys(new Set([...nextIds, ...next.quarantinedIds]));
    }
    // meta when identity/index changed (or first flush)
    if (
      !prev ||
      prev.user !== next.user ||
      prev.activeProjectId !== next.activeProjectId ||
      prev.projects.size !== nextIds.length ||
      nextIds.some((id) => !prev.projects.has(id))
    ) {
      results.push(saveMeta(next.user, next.activeProjectId, nextIds));
    }

    const failed = results.find((r) => r !== 'ok');
    setPersistStatus(failed ?? 'ok');
    // only advance the snapshot for what actually saved; on failure keep the
    // old snapshot so the next flush retries everything still dirty
    if (!failed) {
      persistedRef.current = {
        user: next.user,
        activeProjectId: next.activeProjectId,
        projects: new Map(next.projects.map((p) => [p.id, p])),
      };
    }
  }, []);

  // debounced dirty-key persistence
  useEffect(() => {
    if (!state.hydrated) return;
    pendingRef.current = state;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, PERSIST_DEBOUNCE_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [state, flush]);

  // never lose the debounce window on tab close/background
  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [flush]);

  // other-tab writes (the storage event never fires in the writing tab)
  useEffect(() => {
    if (!state.hydrated) return;
    return subscribeExternalChanges((change) => {
      if (change.kind === 'project') {
        dispatch({ type: 'external-project-update', project: change.project });
      } else if (change.kind === 'project-deleted') {
        dispatch({ type: 'external-project-delete', id: change.id });
      } else {
        dispatch({ type: 'external-user', user: change.meta.user });
      }
    });
  }, [state.hydrated]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const retryPersist = useCallback(() => {
    // forget the persisted snapshot ⇒ next flush rewrites everything
    persistedRef.current = null;
    pendingRef.current = stateRef.current;
    flush();
  }, [flush]);

  const value = useMemo(
    () => ({ state, dispatch, persistStatus, retryPersist }),
    [state, persistStatus, retryPersist],
  );
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore outside StoreProvider');
  return ctx;
}

export function useActiveProject(): Project | null {
  const { state } = useStore();
  return (
    state.projects.find((p) => p.id === state.activeProjectId) ?? null
  );
}

/** Convenience: patch the active project. */
export function useProjectPatch() {
  const { dispatch } = useStore();
  return (patch: Partial<Project>, undoable = false) =>
    dispatch({ type: 'update-project', patch, undoable });
}
