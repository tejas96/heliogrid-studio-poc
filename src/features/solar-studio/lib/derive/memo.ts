// ─── Fingerprint-keyed memo ─────────────────────────────────────────────────
// The fingerprint graph (lib/fingerprints) already answers "did the inputs of
// this output change?". A selector memoised on the right layer is therefore
// correct by construction, and a small LRU (not last-value) keeps the
// dashboard's many projects from thrashing one another.
import type { Project } from '../../types';

export function memoByKey<T>(
  keyOf: (p: Project) => string,
  compute: (p: Project) => T,
  size = 4,
): (p: Project) => T {
  const cache = new Map<string, T>();
  return (p: Project) => {
    const key = keyOf(p);
    const hit = cache.get(key);
    if (hit !== undefined) {
      cache.delete(key);
      cache.set(key, hit); // refresh recency
      return hit;
    }
    const value = compute(p);
    cache.set(key, value);
    if (cache.size > size) cache.delete(cache.keys().next().value as string);
    return value;
  };
}
