// ─── Tiny stable hash for derived identities ────────────────────────────────
// Derived objects (strings) are re-created on every derivation. Random ids
// would make every re-derivation look like a redesign: routes keyed on the
// old id would orphan, colours would shuffle, captures would stale. Hashing
// the CONTENT gives "the same string" the same id across runs.

/** FNV-1a 32-bit. Not cryptographic — identity, not security. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic string id from its ordered module ids. */
export function stringIdFor(panelIds: string[]): string {
  return 'str_' + fnv1a(panelIds.join('|')).toString(36);
}
