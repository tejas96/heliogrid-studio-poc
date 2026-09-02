// ─── The aerial height map, in memory, for a screen that reads it ───────────
// The grid lives in the blob store; the shading sync loads it when it runs.
// A screen that reads the map itself (Step 2 tracing, the 3D roof card) must
// not depend on that: this hook loads it and re-renders when it lands.
import { useEffect, useState } from 'react';
import type { SiteSurround } from '../types';
import { loadSurroundHeights, peekSurroundHeights } from './surround';
import type { SurroundHeights } from './surround-geometry';

export function useSurroundGrid(meta: SiteSurround | null | undefined): SurroundHeights | null {
  const [grid, setGrid] = useState<SurroundHeights | null>(() => peekSurroundHeights(meta));
  useEffect(() => {
    let live = true;
    const hit = peekSurroundHeights(meta);
    setGrid(hit);
    if (hit || !meta) return;
    void loadSurroundHeights(meta).then((g) => {
      if (live) setGrid(g);
    });
    return () => {
      live = false;
    };
  }, [meta?.blobId]); // eslint-disable-line react-hooks/exhaustive-deps
  return grid;
}
