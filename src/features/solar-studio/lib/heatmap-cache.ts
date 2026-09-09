// ─── One roof heatmap per geometry, shared by the 2D and the 3D view ────────
//
// Each view held its own one-entry cache, keyed on shadingFp. So a module
// nudged by a centimetre threw the whole 12-month map away (~1800 cells × 12
// months × 33 half-hour samples ≈ 5.5 × 10⁵ rays) and rebuilt it — and
// switching 2D → 3D rebuilt the identical map a second time. The map has no
// module dependency at all: lib/solar-heatmap walks the roofs and builds its
// casters without the panels.
//
// This is the only cache now. Keyed on heatmapFp (geometry + neighbourhood),
// the last few results kept, and ONE in-flight computation per key that every
// asker shares — progress fans out to all of them, and the run is cancelled
// only when the last asker has let go.
import type { Project } from '../types';
import { computeHeatmap, type HeatCancel, type HeatmapResult } from './solar-heatmap';

/** finished maps kept, most recently used last */
const KEEP = 4;
const results = new Map<string, HeatmapResult>();

interface Job {
  signal: HeatCancel;
  promise: Promise<HeatmapResult | null>;
  refs: number;
  progress: Set<(done: number, total: number) => void>;
}
const jobs = new Map<string, Job>();

/** The finished map for this key, if any — synchronous, for a view that mounts after the fact. */
export function peekHeatmap(fp: string): HeatmapResult | null {
  const hit = results.get(fp);
  if (!hit) return null;
  // touched ⇒ youngest
  results.delete(fp);
  results.set(fp, hit);
  return hit;
}

export interface HeatmapRequest {
  /** the map — or null when this request was released before the run finished */
  promise: Promise<HeatmapResult | null>;
  /** this asker is done; the run stops only when nobody else is waiting */
  release: () => void;
}

/**
 * Ask for the map for `fp`, computed from `project` if nobody has it yet.
 * Two views asking for the same key get the same run and the same result.
 */
export function requestHeatmap(
  project: Project,
  fp: string,
  onProgress?: (done: number, total: number) => void,
): HeatmapRequest {
  const hit = peekHeatmap(fp);
  if (hit) return { promise: Promise.resolve(hit), release: () => {} };

  let job = jobs.get(fp);
  if (!job) {
    const signal: HeatCancel = { aborted: false };
    const j: Job = { signal, refs: 0, progress: new Set(), promise: Promise.resolve(null) };
    j.promise = computeHeatmap(project, {
      signal,
      onProgress: (done, total) => {
        for (const fn of j.progress) fn(done, total);
      },
    })
      .then((res) => {
        if (jobs.get(fp) === j) jobs.delete(fp);
        // an aborted run returns a half-filled grid: never keep or show it
        if (signal.aborted) return null;
        results.set(fp, res);
        while (results.size > KEEP) results.delete(results.keys().next().value!);
        return res;
      })
      .catch(() => {
        if (jobs.get(fp) === j) jobs.delete(fp);
        return null;
      });
    jobs.set(fp, j);
    job = j;
  }

  const j = job;
  j.refs++;
  if (onProgress) j.progress.add(onProgress);
  let released = false;
  return {
    promise: j.promise,
    release: () => {
      if (released) return;
      released = true;
      if (onProgress) j.progress.delete(onProgress);
      j.refs--;
      if (j.refs <= 0) {
        j.signal.aborted = true;
        if (jobs.get(fp) === j) jobs.delete(fp);
      }
    },
  };
}
