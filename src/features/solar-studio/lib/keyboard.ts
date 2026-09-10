// ─── Shared guard for window-level keyboard shortcuts ───────────────────────
// Every editor screen registers its single-letter shortcuts on `window`, and
// every one of them must first ask "is the user typing?" — otherwise D starts
// a roof while someone is naming a project.

/**
 * True when the key event landed inside a text-entry control, so a screen's
 * single-letter shortcut must stand down.
 *
 * The guard is written against `EventTarget`, not `HTMLElement`, because a
 * `window` listener does NOT only receive events from focused elements: an
 * event dispatched at `window` or `document` arrives with a target that has no
 * `closest` at all. The screens used to cast straight to `HTMLElement` and call
 * it, which threw `e.target.closest is not a function` and took the whole route
 * down with it — a crash triggered by the shortcut layer, in a handler whose
 * only job was to stay out of the way. Duck-typing `closest` also survives the
 * cross-realm case (an element from an iframe fails `instanceof Element`).
 */
export function typedInto(target: EventTarget | null): boolean {
  const el = target as { closest?: (s: string) => unknown } | null;
  if (typeof el?.closest !== 'function') return false;
  return !!el.closest('input,textarea,select,[contenteditable]');
}
