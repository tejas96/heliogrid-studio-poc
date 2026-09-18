// ─── Does the State you typed match the site you pinned? ─────────────────────
// The State is a dropdown in Step 1; the site is a pin on a map. Nothing ever
// compared them, and three things quietly hang off the typed one:
//
//   · the DISCOM printed on the SLD — the drawing submitted for approval
//   · the IS 875 wind speed (data/rules/india: basicWindSpeedMsByState), which
//     sets the HIGH WIND flag and the pressure the structure is checked against
//   · the tariff, which drives savings and payback in the customer's proposal
//
// Measured on a real project: a pin at 16.98 N 74.62 E, whose geocoded address
// reads "Kavathe Ekand, Maharashtra, India", carried state "Andhra Pradesh".
// The SLD named APEPDCL — an Andhra board — and used 50 m/s where Maharashtra
// is 44, which is 29% more wind pressure, because pressure goes as v².
//
// The geocoder already puts the state in the address string, so the check is
// just reading what is there. It NEVER overwrites the user's choice: a state
// line can be missing, abbreviated or foreign, and the person on the site
// knows better than a substring match.
import { INDIAN_STATES } from '../data/discoms';
import type { Project } from '../types';

/** Word-boundary match, so "Punjab" does not fire inside a longer word. */
function namesState(address: string, state: string): boolean {
  return new RegExp(`(^|[^\\p{L}])${state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu').test(address);
}

/**
 * The Indian state a geocoded address names, or null when it names none — or
 * more than one, which is ambiguous and not worth a guess.
 */
export function stateFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const hits = INDIAN_STATES.filter((s) => namesState(address, s));
  return hits.length === 1 ? hits[0] : null;
}

/**
 * Set when the project's State contradicts the pinned site's address. Null
 * when they agree, when either is missing, or when the address names no single
 * state — silence is right wherever the evidence is thin.
 */
export function siteStateMismatch(
  project: Pick<Project, 'info' | 'location'>,
): { typed: string; pinned: string } | null {
  const typed = project.info.state?.trim();
  if (!typed) return null;
  const pinned = stateFromAddress(project.location?.address);
  if (!pinned || pinned === typed) return null;
  return { typed, pinned };
}
