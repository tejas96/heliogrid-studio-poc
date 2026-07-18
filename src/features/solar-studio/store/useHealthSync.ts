// ─── Health-snapshot recompute host (useDesignSync's sibling) ────────────────
// Stamps derived.healthSnapshot whenever the composite health key drifts from
// the stored one, keeping { current, prev } so "why did it change" survives a
// reload. Same discipline as useDesignSync: stamp is an effect dependency
// (a clobbered stamp self-heals), debounced, re-reads the LATEST project at
// fire time, spreads derived, and is never an undo step.
import { useEffect, useRef } from 'react';
import { useActiveProject, useStore } from './store';
import { healthKey, nextHealthSnapshot } from '../lib/health';

const DEBOUNCE_MS = 600;

export function useHealthSync(): void {
  const project = useActiveProject();
  const { dispatch } = useStore();
  const projectRef = useRef(project);
  projectRef.current = project;

  const key = project ? healthKey(project) : null;
  const stampedKey = project?.derived.healthSnapshot?.current.key ?? null;

  useEffect(() => {
    if (!key || key === stampedKey) return; // equality guard — no write loop
    const t = setTimeout(() => {
      const latest = projectRef.current;
      if (!latest) return;
      const next = nextHealthSnapshot(latest); // null = already in sync
      if (!next) return;
      // reducer merges into the CURRENT project — a same-tick useDesignSync
      // stamp can never be reverted by this closure's older copy of `derived`
      dispatch({ type: 'stamp-health', snapshot: next });
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, stampedKey]);
}
