// ─── Site-level types: the frame everything geometric is measured against ───
import type { LatLng } from '../../types';

/**
 * The site's coordinate frame. Local ENU on the WGS84 ellipsoid, anchored at the
 * confirmed pin, with the axes aligned to the IMAGERY (not to true north — see
 * northOffsetDeg). UTM fields are interchange only: they let an exported drawing
 * carry real survey coordinates, and they are never used for internal geometry.
 */
export interface SiteFrame {
  /** the confirmed pin — origin of the local frame */
  origin: LatLng;
  /** UTM zone containing the origin (interchange only) */
  utmZone: number;
  /** true = northern hemisphere (interchange only) */
  utmNorth: boolean;
  /** the origin's UTM easting/northing, so local EN -> UTM is offset + rotation */
  utmOrigin: { e: number; n: number };
  /** degrees UTM grid north lies clockwise of TRUE north at the origin */
  convergenceDeg: number;
  /**
   * IMAGERY correction (pixels -> metres), carried here so one object describes
   * the whole site. Deliberately NOT applied by toEN: lib/calibration.ts already
   * rescales stored geometry once, so stored EN is true metres.
   */
  scaleFactor: number;
  /**
   * Degrees TRUE north lies clockwise of the image's up axis. Mirrors
   * Calibration.northOffsetDeg and the sun-frame convention in lib/shading.ts
   * (`az = sunAzimuth + northOffsetDeg`). 0 = north-up imagery, the default.
   */
  northOffsetDeg: number;
}
