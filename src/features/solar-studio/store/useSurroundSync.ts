// ─── Surround sync: fetch the real neighbourhood heights once per site ──────
// Mounted with the other recompute hosts. When a project has a confirmed
// location and no surround yet (or the pin moved), Google's DSM is fetched,
// turned into a grade-relative grid (lib/surround) and stamped on the project.
// The shading fingerprint includes it, so useDesignSync re-runs the engine
// with the real trees and buildings the moment it lands.
import { useEffect, useRef } from 'react';
import { useActiveProject, useProjectPatch } from './store';
import { fetchSurround, surroundStale } from '../lib/surround';

/** sites checked this session with no data / an error — never hammer the API */
const skipped = new Set<string>();

export function useSurroundSync() {
  const project = useActiveProject();
  const patch = useProjectPatch();
  const projectRef = useRef(project);
  projectRef.current = project;
  const inFlight = useRef<string | null>(null);

  const projectId = project?.id ?? null;
  const pinKey = project?.location ? `${project.location.latLng.lat.toFixed(5)},${project.location.latLng.lng.toFixed(5)}` : null;
  const need =
    !!project && !!project.location && !!pinKey && (project.surround === undefined || surroundStale(project));

  useEffect(() => {
    if (!need || !projectId || !pinKey) return;
    const key = `${projectId}|${pinKey}`;
    if (skipped.has(key) || inFlight.current === key) return;
    inFlight.current = key;
    let cancelled = false;
    (async () => {
      const current = projectRef.current;
      if (!current) return;
      const res = await fetchSurround(current);
      if (cancelled) return;
      const latest = projectRef.current;
      if (!latest || latest.id !== projectId) return;
      if (res.status === 'ok') {
        patch({ surround: res.meta }, false); // derived from the site — never an undo step
      } else {
        skipped.add(key);
        if (res.status === 'unavailable') patch({ surround: null }, false);
        else console.warn('[surround]', res.message);
      }
    })().finally(() => {
      if (inFlight.current === key) inFlight.current = null;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [need, projectId, pinKey]);
}
