// ─── Electrical sync: re-derive strings/routes when their inputs move ───────
// useDesignSync's sibling for the synchronous derived layers. Same discipline:
// the stamp is an effect dependency (a clobbered stamp self-heals), the LATEST
// project is read at fire time, and the write is never an undo step.
import { useEffect, useMemo, useRef } from 'react';
import { useActiveProject, useProjectPatch } from './store';
import { routesInputFp, stringsInputFp } from '../lib/derive/freshness';
import { syncElectrical } from '../lib/derive/electrical-sync';

const DEBOUNCE_MS = 150;

export function useElectricalSync(): void {
  const project = useActiveProject();
  const patch = useProjectPatch();
  const projectRef = useRef(project);
  projectRef.current = project;

  const sKey = useMemo(() => (project ? stringsInputFp(project) : ''), [project]);
  const rKey = useMemo(() => (project ? routesInputFp(project) : ''), [project]);
  const sStamp = project?.derived.stringsFp ?? null;
  const rStamp = project?.derived.routesFp ?? null;

  useEffect(() => {
    if (!project || sKey === '') return;
    if (sStamp === sKey && rStamp === rKey) return;
    const t = window.setTimeout(() => {
      const latest = projectRef.current;
      if (!latest) return;
      const r = syncElectrical(latest);
      if (r) patch(r.patch, false); // derived data — never an undo step
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sKey, rKey, sStamp, rStamp]);
}
