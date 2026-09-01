// ─── lib/site — public surface ──────────────────────────────────────────────
// Spec §3 lists this entry point. New consumers import from '../site' rather
// than reaching into ./frame, ./utm or ./types; the imports that predate this
// file are left where they are (repointing them is a separate, mechanical
// change). Everything exported here is covered by site-frame.test.ts and
// site-utm.test.ts, and the surface itself is pinned by a test so a function
// cannot silently drop out of it.
export type { SiteFrame } from './types';
export { frameFor, fromUtm, makeSiteFrame, reanchor, toEN, toLatLng, toUtm } from './frame';
export {
  gridConvergenceDeg,
  latLngToUtm,
  utmToLatLng,
  utmZoneForLatLng,
  utmZoneFromEpsg,
} from './utm';
