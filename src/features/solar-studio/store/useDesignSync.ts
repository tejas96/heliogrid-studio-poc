// ─── Design sync: recompute shading whenever shading-relevant geometry moves ─
// Mounted once in StudioClientLayout (inside StoreProvider) so per-panel solar
// access heals on EVERY studio route — wizard, proposal, share, dashboard —
// not only while the wizard shell is open. The fingerprint graph
// (lib/fingerprints.ts) decides when work is needed; the result is stamped in
// `project.derived.solarAccessFp` so every consumer can tell fresh numbers
// from provisional ones (staleness badges).
import { useEffect, useMemo, useRef } from 'react';
import { useActiveProject, useProjectPatch } from './store';
import { accessChanged } from '../lib/shading';
import { AnalysisSuperseded, requestSolarAccess } from '../lib/analysis-client';
import { shadingFp } from '../lib/fingerprints';

export function useDesignSync() {
  const project = useActiveProject();
  const patch = useProjectPatch();
  const projectRef = useRef(project);
  projectRef.current = project;

  const fingerprint = useMemo(() => shadingFp(project), [project]);
  // the stamp is a dependency too: if a concurrent whole-`derived` patch ever
  // clobbers it (write races are possible — patches replace the object), the
  // effect re-fires and re-stamps instead of leaving a stuck stale badge
  const stamp = project?.derived.solarAccessFp ?? null;

  useEffect(() => {
    if (!fingerprint) return;
    const current = projectRef.current;
    if (!current || current.panels.length === 0) return;
    // Already computed for exactly this geometry (e.g. re-mount, reload) —
    // don't burn the shading engine to rediscover identical values.
    if (current.derived.solarAccessFp === fingerprint) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      const computedFor = projectRef.current;
      if (!computedFor) return;
      // Stamp the fingerprint of the geometry we ACTUALLY computed against —
      // `computedFor` may already be newer than the debounced `fingerprint`.
      const stamp = shadingFp(computedFor);
      // off the main thread (Phase 8): Tier-2 casters made this pass grow with
      // panel count squared — inline it would drop frames on large roofs
      requestSolarAccess(computedFor, { cancelPrevious: true })
        .then((fresh) => {
          // The store may have moved on while the worker ran. Re-read it and
          // apply the result to the LATEST panels, but only stamp what this
          // run actually describes — a newer edit re-fires the effect anyway.
          const latest = projectRef.current;
          if (cancelled || !latest) return;
          const derived = { ...latest.derived, solarAccessFp: stamp };
          if (fresh.size === 0 || !accessChanged(latest, fresh)) {
            // values are unchanged, but freshness must still be recorded —
            // otherwise the "recalculating" badge would never clear
            if (latest.derived.solarAccessFp !== stamp) patch({ derived }, false);
            return;
          }
          patch(
            {
              panels: latest.panels.map((p) => ({
                ...p,
                solarAccess: fresh.get(p.id) ?? p.solarAccess ?? 1,
              })),
              derived,
            },
            false, // derived data — never an undo step
          );
        })
        .catch((err) => {
          // a retired request is the normal case while dragging, not a failure
          if (!(err instanceof AnalysisSuperseded)) console.error('[shading]', err);
        });
    }, 800);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, stamp]);
}
