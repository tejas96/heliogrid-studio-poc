// ─── Single-axis trackers: where the modules are pointing, hour by hour ─────
// A horizontal single-axis tracker (HSAT) lays its modules on a torque tube
// running roughly north–south and rolls them east to west through the day.
// It is the standard ground-mount in Indian utility and large C&I work, and it
// is the one racking kind whose GEOMETRY IS A FUNCTION OF TIME: the modules
// this tool draws at 9 a.m. are not pointing where they point at 3 p.m.
//
// That is why the rotation lives here, in one small pure function, and why
// everything that needs a module's pose asks for it with a time: the 3D scene
// so the array visibly follows the sun, the shading engine so each sun sample
// is cast off the geometry of that moment, and the energy engine so the
// transposition uses the plane the module was actually in.
//
// Two behaviours matter and both are modelled, not assumed:
//
//   TRUE TRACKING — the tube turns until the modules face the sun square on.
//   The rotation is the angle between vertical and the sun's direction taken
//   in the plane across the axis; everything else about the sun is along the
//   tube and cannot be tracked.
//
//   BACKTRACKING — when the sun is low, facing it square would put each row
//   in the next row's shadow, which costs far more than the pointing gains.
//   So the tube turns BACK, giving up incidence to keep the rows lit. This
//   begins exactly when the row's shadow first reaches the next row, which is
//   a property of the ground cover ratio alone.
//
// Not modelled, and stated because a utility designer will ask: a TILTED axis
// (rare in India, where the useful sites are low-latitude), independent row
// control, wind stow, and diffuse-driven "smart" tracking. The rows here all
// carry the same angle, which is what a shared-drive row actually does.

/** the axis is horizontal — a tilted-axis tracker is not modelled */
export interface TrackerAxis {
  /** bearing of the torque tube, degrees from north; 0 = a true north–south axis */
  axisAzimuthDeg: number;
  /** rotation limit either side of flat, degrees (45–60 is the usual hardware) */
  maxRotationDeg: number;
  /** ground cover ratio: module slant width ÷ row pitch */
  gcr: number;
  /** turn back at a low sun to keep the rows out of each other's light */
  backtracking: boolean;
}

export interface TrackerPose {
  /** module tilt from horizontal, degrees (always ≥ 0) */
  tiltDeg: number;
  /** the direction the modules face, degrees from north */
  azimuthDeg: number;
  /** the tube's rotation, signed: + turns the modules toward axisAzimuth + 90° */
  rotationDeg: number;
  /** the rotation was cut short to keep the next row lit */
  backtracked: boolean;
}

const RAD = Math.PI / 180;

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Flat, stowed — where a tracker sits at night and where it is drawn at rest. */
export const TRACKER_STOW: TrackerPose = { tiltDeg: 0, azimuthDeg: 0, rotationDeg: 0, backtracked: false };

/**
 * Where the modules on this tube are pointing, for a sun at this altitude and
 * azimuth (both degrees; azimuth from north, going east — the project-wide
 * convention). Below the horizon the tracker stows flat.
 */
export function trackerPose(axis: TrackerAxis, sunAltDeg: number, sunAzDeg: number): TrackerPose {
  if (sunAltDeg <= 0) return { ...TRACKER_STOW, azimuthDeg: norm360(axis.axisAzimuthDeg + 90) };

  // The sun, split into the part across the tube (which the tube can chase)
  // and the part along it (which it cannot). Everything below is that first
  // part against the vertical.
  const across = Math.cos(sunAltDeg * RAD) * Math.cos((sunAzDeg - axis.axisAzimuthDeg - 90) * RAD);
  const up = Math.sin(sunAltDeg * RAD);
  let rotation = Math.atan2(across, up) / RAD;

  // Backtracking. A row's shadow first touches the next row when the row's
  // width, projected along the sun, grows to the row pitch — that is
  // cos(rotation) = gcr, so shading begins past acos(gcr) and not before. Turn
  // back by exactly enough to put the shadow's edge on the next row's edge.
  let backtracked = false;
  if (axis.backtracking && axis.gcr > 0) {
    const reach = Math.abs(Math.cos(rotation * RAD)) / axis.gcr;
    if (reach < 1) {
      const giveBack = Math.acos(reach) / RAD;
      rotation -= Math.sign(rotation) * giveBack;
      backtracked = true;
    }
  }

  // the hardware's own limit always wins
  const limit = Math.abs(axis.maxRotationDeg);
  if (rotation > limit) rotation = limit;
  else if (rotation < -limit) rotation = -limit;

  return {
    tiltDeg: Math.abs(rotation),
    // rolling one way points the modules to one side of the tube, the other way
    // to the other; flat has no facing, so it keeps the +90° side by convention
    azimuthDeg: norm360(axis.axisAzimuthDeg + (rotation >= 0 ? 90 : -90)),
    rotationDeg: rotation,
    backtracked,
  };
}

/**
 * The ground cover ratio of a tracker row: how much of the ground the modules
 * cover when they lie flat. It is the one number that decides when
 * backtracking starts, so it is measured off the design's real pitch.
 */
export function trackerGcr(slantM: number, pitchM: number): number {
  if (pitchM <= 0) return 1;
  return Math.min(1, slantM / pitchM);
}

// ─── Defaults when a table is switched to a tracker ─────────────────────────
// Ordinary Indian utility hardware, and every one of them is editable
// afterwards: they are a sensible starting row, not a claim about the site.

/** rotation limit either side of flat — the common 2P/1P tracker range */
export const TRACKER_DEFAULT_MAX_ROTATION_DEG = 55;
/** ground cover ratio a tracker field is usually laid out at (0.33–0.40) */
export const TRACKER_DEFAULT_GCR = 0.35;
/** torque-tube height above grade, m */
export const TRACKER_DEFAULT_TUBE_HEIGHT_M = 1.5;
/**
 * The tube runs ALONG the table's rows, so a row IS a tracker. That keeps the
 * layout and the tracker describing one thing: the modules on a row sit side
 * by side on their tube, and the row pitch — which backtracking is computed
 * from — is the distance between tubes.
 *
 * A table facing the equator therefore gets an east–west tube, which is what
 * its drawn rows are. The usual utility field wants a NORTH–SOUTH tube, and
 * that is a table facing EAST: its rows then run north–south. The tracker
 * panel says so.
 */
export function trackerAxisFromSegment(segmentAzimuthDeg: number): number {
  return norm360(segmentAzimuthDeg + 90);
}

/**
 * The facing a tracker table takes when a table becomes one: EAST, so its rows
 * run north–south and its tubes with them. That is the field every utility
 * tracker plant is built as, and it is a plain undoable change the user can
 * turn back if they really want an east–west axis.
 */
export const TRACKER_FIELD_FACING_DEG = 90;

export interface TrackerRowCount {
  /** how many torque tubes there are — one per row of modules */
  tubes: number;
  /** total tube length to buy, metres */
  tubeM: number;
  /** posts carrying the tubes; each takes a bearing */
  posts: number;
  /** modules riding the tubes */
  modules: number;
}

/**
 * The tracker hardware a design actually needs, counted off where its modules
 * stand rather than assumed from the table's declared grid.
 *
 * A tube runs along one row: the modules on it sit side by side, so the tube
 * spans their centres end to end plus half a module each side. Posts fall at
 * the structure model's leg spacing, and every post carries a bearing.
 */
export function trackerRowsFrom(
  centres: { x: number; y: number }[],
  axisAzimuthDeg: number,
  moduleWidthAlongTubeM: number,
  legSpacingM: number,
): TrackerRowCount {
  if (centres.length === 0) return { tubes: 0, tubeM: 0, posts: 0, modules: 0 };
  // across the tube (which separates rows) and along it (which fills one row)
  const a = (axisAzimuthDeg * Math.PI) / 180;
  const acrossX = Math.sin(a + Math.PI / 2);
  const acrossY = Math.cos(a + Math.PI / 2);
  const alongX = Math.sin(a);
  const alongY = Math.cos(a);
  const rows = new Map<number, { min: number; max: number; n: number }>();
  for (const c of centres) {
    const across = c.x * acrossX + c.y * acrossY;
    const along = c.x * alongX + c.y * alongY;
    // rows within 30 cm of each other are the same tube
    const key = Math.round(across / 0.3);
    const row = rows.get(key);
    if (row) {
      row.min = Math.min(row.min, along);
      row.max = Math.max(row.max, along);
      row.n++;
    } else rows.set(key, { min: along, max: along, n: 1 });
  }
  let tubeM = 0;
  let posts = 0;
  for (const r of rows.values()) {
    const len = r.max - r.min + moduleWidthAlongTubeM;
    tubeM += len;
    posts += Math.max(2, Math.ceil(len / Math.max(0.5, legSpacingM)) + 1);
  }
  return { tubes: rows.size, tubeM: Math.round(tubeM * 10) / 10, posts, modules: centres.length };
}

/** The axis a stored racking spec describes, with its lazy fields resolved. */
export function resolveTrackerAxis(
  racking: { axisAzimuthDeg?: number; maxRotationDeg?: number; backtracking?: boolean; rowPitchM: number },
  slantM: number,
  /** the table's facing; the tube runs across it, along the rows */
  segmentAzimuthDeg = 180,
): TrackerAxis {
  return {
    axisAzimuthDeg: racking.axisAzimuthDeg ?? trackerAxisFromSegment(segmentAzimuthDeg),
    maxRotationDeg: racking.maxRotationDeg ?? TRACKER_DEFAULT_MAX_ROTATION_DEG,
    gcr: trackerGcr(slantM, racking.rowPitchM > 0 ? racking.rowPitchM : slantM / TRACKER_DEFAULT_GCR),
    backtracking: racking.backtracking ?? true,
  };
}


/**
 * The row pitch of a table, MEASURED off where its modules actually stand.
 *
 * `racking.rowPitchM` is what the fill solver asked for; the modules are what
 * got built, and after a row is grown, shrunk or dragged the two can differ.
 * This is a geometry model, so it reads the geometry: project every module
 * centre onto the down-slope direction, and the gap between neighbouring rows
 * is the pitch. Null when there is only one row — nothing to measure, and the
 * model then falls back to contiguous.
 */
export function measuredRowPitchM(centres: { x: number; y: number }[], azimuthDeg: number): number | null {
  if (centres.length < 2) return null;
  const a = (azimuthDeg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  const seen: number[] = [];
  for (const c of centres) {
    const t = c.x * dx + c.y * dy;
    if (!seen.some((v) => Math.abs(v - t) < 0.05)) seen.push(t);
  }
  if (seen.length < 2) return null;
  seen.sort((p, q) => p - q);
  const gaps: number[] = [];
  for (let i = 1; i < seen.length; i++) gaps.push(seen[i] - seen[i - 1]);
  gaps.sort((p, q) => p - q);
  return gaps[Math.floor(gaps.length / 2)];
}
