import { describe, expect, it } from 'vitest';
import {
  newProject,
  normalizeProject,
  normalizeWeather,
  reducer,
  type AppState,
} from './store';
import type { Project, Roof, SiteWeather } from '../types';

const valid: SiteWeather = {
  monthlyGhi: [5.3, 6, 6.6, 7, 6.9, 4.3, 3.1, 3.3, 3.9, 4.8, 4.9, 4.8],
  monthlyDiffuseFrac: [0.2, 0.2, 0.21, 0.21, 0.24, 0.45, 0.59, 0.56, 0.46, 0.32, 0.25, 0.23],
  annualGhi: 5.07,
  forLatLng: { lat: 18.52, lng: 73.86 },
  source: 'pvgis',
  fetchedAt: 123,
};

describe('normalizeWeather (persistence guard, all-or-nothing)', () => {
  it('passes a well-formed entry through', () => {
    expect(normalizeWeather(valid)).toBe(valid);
  });

  it('drops non-objects and empty', () => {
    expect(normalizeWeather(undefined)).toBeUndefined();
    expect(normalizeWeather(null)).toBeUndefined();
    expect(normalizeWeather('pvgis')).toBeUndefined();
  });

  it('drops a short / non-finite GHI array', () => {
    expect(normalizeWeather({ ...valid, monthlyGhi: valid.monthlyGhi.slice(0, 11) })).toBeUndefined();
    expect(
      normalizeWeather({ ...valid, monthlyGhi: [...valid.monthlyGhi.slice(0, 11), NaN] }),
    ).toBeUndefined();
  });

  it('drops an out-of-range diffuse fraction', () => {
    expect(
      normalizeWeather({ ...valid, monthlyDiffuseFrac: valid.monthlyDiffuseFrac.map(() => 0.99) }),
    ).toBeUndefined();
  });

  it('drops a bad annualGhi, missing pin, or unknown source', () => {
    expect(normalizeWeather({ ...valid, annualGhi: 0 })).toBeUndefined();
    expect(normalizeWeather({ ...valid, forLatLng: undefined })).toBeUndefined();
    expect(normalizeWeather({ ...valid, source: 'google' })).toBeUndefined();
  });
});

// ─── Reducer ────────────────────────────────────────────────────────────────

function stateWith(project: Project): AppState {
  return {
    user: null,
    projects: [project],
    activeProjectId: project.id,
    hydrated: true,
    quarantinedIds: [],
    externalConflictAt: null,
    undoStack: [],
    redoStack: [],
  };
}

describe('reducer: update-project', () => {
  it('patches only the active project and bumps updatedAt', () => {
    const a = newProject();
    const b = newProject();
    const state: AppState = { ...stateWith(a), projects: [a, b] };
    const next = reducer(state, {
      type: 'update-project',
      patch: { wizardStep: 4 },
    });
    expect(next.projects.find((p) => p.id === a.id)!.wizardStep).toBe(4);
    expect(next.projects.find((p) => p.id === b.id)).toBe(b);
    expect(next.projects.find((p) => p.id === a.id)!.updatedAt).toBeGreaterThanOrEqual(
      a.updatedAt,
    );
  });

  it('is a no-op without an active project', () => {
    const state: AppState = { ...stateWith(newProject()), activeProjectId: null };
    expect(reducer(state, { type: 'update-project', patch: { wizardStep: 4 } })).toBe(state);
  });

  it('undoable pushes the PRE-patch snapshot and clears redo', () => {
    const a = newProject();
    const state: AppState = { ...stateWith(a), redoStack: [a] };
    const next = reducer(state, {
      type: 'update-project',
      patch: { wizardStep: 4 },
      undoable: true,
    });
    expect(next.undoStack).toEqual([a]);
    expect(next.redoStack).toEqual([]);
  });

  it('non-undoable (derived data) leaves both stacks alone', () => {
    const a = newProject();
    const state = stateWith(a);
    const next = reducer(state, { type: 'update-project', patch: { wizardStep: 4 } });
    expect(next.undoStack).toEqual([]);
    expect(next.redoStack).toEqual([]);
  });

  it('caps the undo stack at 25 snapshots', () => {
    const a = newProject();
    let state = stateWith(a);
    for (let i = 0; i < 30; i++) {
      state = reducer(state, {
        type: 'update-project',
        patch: { wizardStep: (i % 9) + 1 },
        undoable: true,
      });
    }
    expect(state.undoStack.length).toBeLessThanOrEqual(25);
  });
});

describe('reducer: undo/redo', () => {
  it('round-trips a project snapshot (with a fresh LWW timestamp)', () => {
    const a = newProject();
    let state = stateWith(a);
    state = reducer(state, {
      type: 'update-project',
      patch: { wizardStep: 6 },
      undoable: true,
    });
    const edited = state.projects[0];
    state = reducer(state, { type: 'undo' });
    // content restored, but updatedAt is re-stamped so other tabs adopt the undo
    expect(state.projects[0]).toEqual({ ...a, updatedAt: state.projects[0].updatedAt });
    expect(state.projects[0].wizardStep).toBe(a.wizardStep);
    expect(state.projects[0].updatedAt).toBeGreaterThanOrEqual(edited.updatedAt);
    expect(state.redoStack).toEqual([edited]);
    state = reducer(state, { type: 'redo' });
    expect(state.projects[0]).toEqual({ ...edited, updatedAt: state.projects[0].updatedAt });
    expect(state.projects[0].wizardStep).toBe(6);
    expect(state.redoStack).toEqual([]);
  });

  it('undo/redo with empty stacks is a no-op', () => {
    const state = stateWith(newProject());
    expect(reducer(state, { type: 'undo' })).toBe(state);
    expect(reducer(state, { type: 'redo' })).toBe(state);
  });
});

describe('reducer: stamp-health + stamp-only external updates', () => {
  const snapshot = {
    current: { key: 'k1', total: 94, categories: [] },
    prev: null,
  };

  it('stamp-health merges into the CURRENT project without an undo step', () => {
    const a = newProject();
    let state = stateWith(a);
    state = reducer(state, { type: 'update-project', patch: { wizardStep: 3 }, undoable: true });
    const next = reducer(state, { type: 'stamp-health', snapshot });
    const proj = next.projects.find((x) => x.id === a.id)!;
    expect(proj.derived.healthSnapshot).toBe(snapshot);
    expect(proj.wizardStep).toBe(3); // merged into the LATEST state, not a stale copy
    expect(next.undoStack).toBe(state.undoStack); // never an undo step
  });

  it('a stamp-only external echo keeps undo history and raises no conflict', () => {
    const a = newProject();
    let state = stateWith(a);
    state = reducer(state, { type: 'update-project', patch: { wizardStep: 3 }, undoable: true });
    expect(state.undoStack).toHaveLength(1);
    const mine = state.projects.find((x) => x.id === a.id)!;
    // another tab's background stamper: identical content, newer stamp only
    const echo = {
      ...mine,
      derived: { ...mine.derived, healthSnapshot: snapshot },
      updatedAt: mine.updatedAt + 1000,
    };
    const next = reducer(state, { type: 'external-project-update', project: echo });
    expect(next.projects.find((x) => x.id === a.id)!.derived.healthSnapshot).toBe(snapshot);
    expect(next.undoStack).toHaveLength(1); // editing tab keeps its history
    expect(next.externalConflictAt).toBeNull(); // no false banner
  });

  it('a REAL external edit still wipes undo and raises the conflict banner', () => {
    const a = newProject();
    let state = stateWith(a);
    state = reducer(state, { type: 'update-project', patch: { wizardStep: 3 }, undoable: true });
    const mine = state.projects.find((x) => x.id === a.id)!;
    const foreign = { ...mine, wizardStep: 7, updatedAt: mine.updatedAt + 1000 };
    const next = reducer(state, { type: 'external-project-update', project: foreign });
    expect(next.undoStack).toHaveLength(0);
    expect(next.externalConflictAt).not.toBeNull();
  });
});

describe('reducer: project lifecycle', () => {
  it('create-project activates it and clears history', () => {
    const a = newProject();
    const b = newProject();
    const state: AppState = { ...stateWith(a), undoStack: [a], redoStack: [a] };
    const next = reducer(state, { type: 'create-project', project: b });
    expect(next.activeProjectId).toBe(b.id);
    expect(next.projects[0]).toBe(b);
    expect(next.undoStack).toEqual([]);
    expect(next.redoStack).toEqual([]);
  });

  it('delete-project clears activeProjectId only when it was active', () => {
    const a = newProject();
    const b = newProject();
    const state: AppState = { ...stateWith(a), projects: [a, b] };
    const next = reducer(state, { type: 'delete-project', id: b.id });
    expect(next.activeProjectId).toBe(a.id);
    const next2 = reducer(state, { type: 'delete-project', id: a.id });
    expect(next2.activeProjectId).toBeNull();
  });
});

// ─── normalizeProject (schema resilience for stored projects) ──────────────

describe('normalizeProject', () => {
  it('defaults and clamps pricing.marginPct', () => {
    const p = newProject();
    expect(
      normalizeProject({ ...p, pricing: undefined as unknown as Project['pricing'] }).pricing
        .marginPct,
    ).toBeGreaterThan(0);
    expect(normalizeProject({ ...p, pricing: { marginPct: NaN } }).pricing.marginPct).toBeGreaterThan(0);
    expect(normalizeProject({ ...p, pricing: { marginPct: 400 } }).pricing.marginPct).toBe(60);
    expect(normalizeProject({ ...p, pricing: { marginPct: -5 } }).pricing.marginPct).toBe(0);
  });

  it('filters malformed segments and keepouts item-by-item', () => {
    const p = newProject();
    const goodSegment = {
      id: 's1',
      roofId: 'r1',
      label: 'A1',
      polygon: [],
      rows: 1,
      cols: 1,
      orientation: 'portrait',
      azimuthDeg: 180,
      racking: { kind: 'flush' },
      moduleGapM: 0.02,
      removed: [],
    };
    const out = normalizeProject({
      ...p,
      segments: [goodSegment, { id: 'bad' }, null] as unknown as Project['segments'],
      keepouts: [
        { id: 'k1', roofId: null, shape: [], heightM: 0, kind: 'walkway' },
        { id: 'bad-no-shape' },
      ] as unknown as Project['keepouts'],
    });
    expect(out.segments.map((s) => s.id)).toEqual(['s1']);
    expect(out.keepouts.map((k) => k.id)).toEqual(['k1']);
  });

  it('defaults roof pitch/azimuth and coerces legacy parapet perEdge objects', () => {
    const p = newProject();
    const legacyRoof = {
      id: 'r1',
      name: 'Roof',
      polygon: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 8 },
        { x: 0, y: 8 },
      ],
      roofType: 'rcc_flat',
      heightM: 3,
      setbackM: 0.3,
      parapet: {
        enabled: true,
        direction: 'outward',
        heightM: 1,
        widthM: 0.3,
        perEdge: [{ enabled: true }, { enabled: false }, true, false],
      },
    } as unknown as Roof;
    const out = normalizeProject({ ...p, roofs: [legacyRoof] });
    expect(out.roofs[0].pitchDeg).toBe(0);
    expect(out.roofs[0].slopeAzimuthDeg).toBe(180);
    expect(out.roofs[0].perEdgeSetbacksM).toBeNull();
    expect(out.roofs[0].parapet.direction).toBe('inward');
    expect(out.roofs[0].parapet.perEdge).toEqual([true, false, true, false]);
  });

  it('coerces every entity field to an array — a non-array field must not crash the app', () => {
    const p = newProject();
    const mangled = {
      ...p,
      panels: 'junk',
      obstructions: null,
      strings: 42,
      walkways: undefined,
      roofs: 'also junk',
    } as unknown as Project;
    const out = normalizeProject(mangled);
    expect(out.panels).toEqual([]);
    expect(out.obstructions).toEqual([]);
    expect(out.strings).toEqual([]);
    expect(out.walkways).toEqual([]);
    expect(out.roofs).toEqual([]);
  });

  it('drops invalid persisted weather but keeps the location', () => {
    const p = newProject();
    const out = normalizeProject({
      ...p,
      location: {
        address: 'x',
        latLng: { lat: 18.5, lng: 73.8 },
        confirmed: true,
        irradiance: 5.5,
        peakSunHours: 5.5,
        dataSource: 'estimate',
        weather: { source: 'pvgis' } as unknown as SiteWeather,
      },
    });
    expect(out.location?.weather).toBeUndefined();
    expect(out.location?.confirmed).toBe(true);
  });
});
