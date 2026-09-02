// ─── Analysis worker: the expensive pure geometry math, off the main thread ──
// Hosts the shading engine (three.js raycasts, no WebGL — nothing here touches
// the DOM or a renderer). Phase 8 made this pass materially heavier: the
// modules are casters now (cost grows with panel COUNT SQUARED) and the
// fingerprint widened to tilt/enabled, so it re-runs on edits that used to be
// free. On a 500-panel roof that is seconds of frozen UI on the main thread.
//
// Protocol: every request carries an `id`; the client ignores replies whose id
// is stale, so a superseded recompute costs nothing but CPU it was already
// spending. The worker holds NO state between messages — the project arrives
// whole (structured clone) and the reply is plain data.
import { computeShadeProfile } from '../lib/shading';
import type { ShadeProfile } from '../lib/shade-profile-cache';
import type { SurroundHeights } from '../lib/surround-geometry';
import type { Project } from '../types';

export interface AnalysisRequest {
  id: number;
  kind: 'access';
  project: Project;
  /** the real neighbourhood grid (lib/surround), resolved by the caller */
  surround?: SurroundHeights | null;
}

export type AnalysisResponse =
  // structured clone carries the Maps and Float32Arrays of the profile as-is
  | { id: number; ok: true; kind: 'access'; access: Array<[string, number]>; profile: ShadeProfile }
  | { id: number; ok: false; error: string };

self.onmessage = (e: MessageEvent<AnalysisRequest>) => {
  const { id, kind, project, surround } = e.data;
  try {
    if (kind === 'access') {
      const profile = computeShadeProfile(project, { surround: surround ?? null });
      const res: AnalysisResponse = { id, ok: true, kind: 'access', access: [...profile.access.entries()], profile };
      (self as unknown as Worker).postMessage(res);
      return;
    }
    (self as unknown as Worker).postMessage({ id, ok: false, error: `unknown kind: ${kind}` });
  } catch (err) {
    const res: AnalysisResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'analysis failed',
    };
    (self as unknown as Worker).postMessage(res);
  }
};
