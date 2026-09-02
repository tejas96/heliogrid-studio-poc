// ─── Main-thread side of the analysis worker ────────────────────────────────
// ONE long-lived worker (the shading pass runs on almost every edit — spawning
// per request would pay module-init on each keystroke). Requests are id-keyed:
// a newer request silently retires older ones, so a fast editor never applies a
// result computed for geometry the user has already moved past.
//
// Fallback is first-class, not an afterthought: no Worker (SSR prerender, unit
// tests, a locked-down browser) ⇒ run the SAME pure function inline. The engine
// is identical either way — only WHERE it runs changes.
import type { Project } from '../types';
import { computeShadeProfile } from './shading';
import type { SurroundHeights } from './surround-geometry';
import type { AnalysisResponse } from '../workers/analysis.worker';
import { setShadeProfile } from './shade-profile-cache';
import { shadingFp } from './fingerprints';

type Pending = {
  resolve: (v: Map<string, number>) => void;
  reject: (e: Error) => void;
  /** the shading fingerprint of the project the request was made for — the profile's cache key */
  fp: string;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
/** set once the worker proves unusable — every later call goes inline */
let workerBroken = false;

function ensureWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url));
    worker.onmessage = (e: MessageEvent<AnalysisResponse>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return; // superseded — the caller has moved on
      pending.delete(msg.id);
      if (msg.ok) {
        // the full profile (per sample, per caster) stays in memory for the
        // string-shade and caster-cost readers; the map is what callers asked for
        if (msg.profile) setShadeProfile(p.fp, msg.profile);
        p.resolve(new Map(msg.access));
      } else p.reject(new Error(msg.error));
    };
    worker.onerror = () => {
      // the worker died (bundling issue, OOM): fail every waiter INLINE rather
      // than leaving the design permanently stale
      workerBroken = true;
      worker?.terminate();
      worker = null;
      for (const [, p] of pending) p.reject(new Error('analysis worker crashed'));
      pending.clear();
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/**
 * Per-panel solar access, computed off the main thread when possible.
 * `cancelPrevious` retires in-flight requests: the design has moved on and
 * their answers describe geometry that no longer exists.
 */
export function requestSolarAccess(
  project: Project,
  opts: { cancelPrevious?: boolean; surround?: SurroundHeights | null } = {},
): Promise<Map<string, number>> {
  const surround = opts.surround ?? null;
  const fp = shadingFp(project);
  const inline = () => {
    const profile = computeShadeProfile(project, { surround });
    setShadeProfile(fp, profile);
    return profile.access;
  };
  const w = ensureWorker();
  if (!w) return Promise.resolve(inline());
  if (opts.cancelPrevious) {
    for (const [id, p] of pending) {
      p.reject(new AnalysisSuperseded());
      pending.delete(id);
    }
  }
  const id = nextId++;
  return new Promise<Map<string, number>>((resolve, reject) => {
    pending.set(id, { resolve, reject, fp });
    w.postMessage({ id, kind: 'access', project, surround });
  }).catch((err) => {
    if (err instanceof AnalysisSuperseded) throw err;
    // worker path failed for this request — answer inline so the user still
    // gets fresh numbers (slower, but never silently stale)
    return inline();
  });
}

/** Thrown to a caller whose request was retired by a newer one. */
export class AnalysisSuperseded extends Error {
  constructor() {
    super('superseded by a newer analysis request');
    this.name = 'AnalysisSuperseded';
  }
}

/** Test/HMR hook: drop the worker so the next call re-creates it. */
export function resetAnalysisWorker() {
  worker?.terminate();
  worker = null;
  workerBroken = false;
  pending.clear();
}
