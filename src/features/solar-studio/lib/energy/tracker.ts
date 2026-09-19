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

/**
 * What kind of machine is carrying the modules.
 *
 * 'hsat' is everything described above: one horizontal tube, one degree of
 * freedom, and a rotation that is the best a single axis can do.
 *
 * 'azel' is a DUAL-AXIS tracker, and it is a different machine rather than a
 * better version of the same one. It turns about a vertical mast AND lifts
 * about a horizontal one, so it does not approximate the sun — it points at
 * it, and the angle of incidence is zero all day. What that costs is not
 * subtle: every unit is a mast, a slew drive, a linear actuator and a cast
 * pier of its own, where a whole row of HSAT shares one tube and one motor.
 *
 * It also cannot backtrack its way out of self-shading the way an HSAT does.
 * An HSAT gives up incidence by flattening, which is cheap because its rows
 * are long and parallel; a pointed dish has nothing to give up without
 * throwing away the entire reason for the machine. A dual-axis field is kept
 * out of its own shadow by SPACING instead, which is why one covers so much
 * more land per kWp. Nothing here assumes that spacing is right — the shading
 * engine re-poses every plate at every sun sample and measures what the design
 * as drawn actually does.
 */
type TrackerKind = 'hsat' | 'azel';

/** the HSAT axis is horizontal — a tilted single axis is not modelled */
export interface TrackerAxis {
  /** absent ⇒ 'hsat', so every stored tracker keeps its existing behaviour */
  kind?: TrackerKind;
  /** bearing of the torque tube, degrees from north; 0 = a true north–south axis */
  axisAzimuthDeg: number;
  /** rotation limit either side of flat, degrees (45–60 is the usual hardware) */
  maxRotationDeg: number;
  /** ground cover ratio: module slant width ÷ row pitch */
  gcr: number;
  /** turn back at a low sun to keep the rows out of each other's light */
  backtracking: boolean;

  // ── dual-axis only. Ignored by 'hsat'. ──────────────────────────────────
  /**
   * Flattest the frame will lie, degrees. Never 0: a dual-axis frame parked
   * dead flat holds water and dust, and every hour of that is soiling loss on
   * the one array that was bought for its output.
   */
  minTiltDeg?: number;
  /** Steepest the frame will lift, degrees — a structural and wind limit. */
  maxTiltDeg?: number;
  /** How far either side of `homeAzimuthDeg` the mast will turn, degrees. */
  azimuthRangeDeg?: number;
  /** Bearing the mast turns about its centre from, degrees from north. */
  homeAzimuthDeg?: number;
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
const TRACKER_STOW: TrackerPose ={ tiltDeg: 0, azimuthDeg: 0, rotationDeg: 0, backtracked: false };

/**
 * Where the modules on this tube are pointing, for a sun at this altitude and
 * azimuth (both degrees; azimuth from north, going east — the project-wide
 * convention). Below the horizon the tracker stows flat.
 */
export function trackerPose(axis: TrackerAxis, sunAltDeg: number, sunAzDeg: number): TrackerPose {
  if (axis.kind === 'azel') return azelPose(axis, sunAltDeg, sunAzDeg);
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
 * Where a DUAL-AXIS frame points: straight at the sun, within its stops.
 *
 * There is no cleverness to model here and that is the point of the machine —
 * tilt is the sun's zenith angle and facing is the sun's bearing, so the angle
 * of incidence is zero whenever the sun is inside the stops. What the stops do
 * is the honest part:
 *
 *   ELEVATION. A frame that lies dead flat ponds water and holds dust, so the
 *   hardware keeps a minimum lift; and it will not stand fully upright either,
 *   because a vertical frame on a mast is a sail. Early and late, when the sun
 *   is below the minimum lift's complement, the frame is AT its stop and is no
 *   longer pointing at the sun — the incidence loss that follows is real and
 *   the transposition sees it, because it is handed this pose and not an
 *   assumption.
 *
 *   AZIMUTH. Cable management and the slew ring's own travel keep the mast
 *   inside a range about its home bearing, so at the ends of a long summer day
 *   the frame stops turning before the sun does.
 *
 * Deliberately NO backtracking. An HSAT flattens to keep the next row lit,
 * which costs it a little incidence on long parallel rows; a pointed frame has
 * no equivalent move — turning away from the sun is giving up the whole reason
 * the machine was bought. A dual-axis field is kept out of its own shadow by
 * being spaced further apart, and whether THIS design is spaced far enough is
 * not assumed here: the shading engine re-poses every plate at every sun
 * sample and measures it (see `validateMms` → azel_spacing).
 */
function azelPose(axis: TrackerAxis, sunAltDeg: number, sunAzDeg: number): TrackerPose {
  const minTilt = axis.minTiltDeg ?? AZEL_DEFAULT_MIN_TILT_DEG;
  const maxTilt = axis.maxTiltDeg ?? AZEL_DEFAULT_MAX_TILT_DEG;
  const home = axis.homeAzimuthDeg ?? AZEL_DEFAULT_HOME_AZIMUTH_DEG;
  const range = Math.abs(axis.azimuthRangeDeg ?? AZEL_DEFAULT_AZIMUTH_RANGE_DEG);
  // below the horizon it parks at its flattest, facing home — the same "at
  // rest" the renderer and the BOM describe
  if (sunAltDeg <= 0) return { tiltDeg: minTilt, azimuthDeg: norm360(home), rotationDeg: 0, backtracked: false };

  const tiltDeg = Math.max(minTilt, Math.min(maxTilt, 90 - sunAltDeg));
  // shortest signed turn from home to the sun, then clipped to the slew range
  const offset = ((((sunAzDeg - home) % 360) + 540) % 360) - 180;
  const turn = Math.max(-range, Math.min(range, offset));
  return {
    tiltDeg,
    azimuthDeg: norm360(home + turn),
    // `rotationDeg` on this machine is the MAST's turn from home, not a tube's
    // roll — same field, same sign convention (+ is clockwise from home)
    rotationDeg: turn,
    backtracked: false,
  };
}

/** A dual-axis frame never lies dead flat: it would pond water and hold dust. */
export const AZEL_DEFAULT_MIN_TILT_DEG = 8;
/** Nor stand upright — a vertical frame on a mast is a sail. */
export const AZEL_DEFAULT_MAX_TILT_DEG = 60;
/** Slew travel either side of home; cable management and the ring set it. */
export const AZEL_DEFAULT_AZIMUTH_RANGE_DEG = 120;
/** Home bearing — due south, the middle of the sun's day in India. Only ever
 *  the fallback: a real unit's home is the table's own facing, which
 *  `resolveTrackerAxis` writes, so nothing outside this file needs it. */
const AZEL_DEFAULT_HOME_AZIMUTH_DEG = 180;
/**
 * Land a dual-axis field takes per unit, as a multiple of the module frame's
 * own span. A pointed frame cannot backtrack, so the only thing keeping one
 * unit out of the next one's shadow is distance. ASSUMED — the real figure
 * comes from a shading study at the site's own latitude.
 */
export const AZEL_DEFAULT_PITCH_FACTOR = 3;
/**
 * How many modules ride ONE dual-axis frame, as rows × columns of the table's
 * grid. ASSUMED, and a vendor's frame is whatever the vendor builds — but it
 * must be SOME number, because it decides how many masts, drives and piers the
 * design buys, and that is most of a dual-axis quote.
 *
 * Eight is an ordinary mid-size unit: about 4.8 kWp on a frame roughly 5 m
 * square, which is the size that still fits one slew ring and one actuator
 * without becoming a special.
 */
export const AZEL_FRAME_ROWS = 2;
export const AZEL_FRAME_COLS = 4;
export const AZEL_FRAME_MODULES = AZEL_FRAME_ROWS * AZEL_FRAME_COLS;

/** Is this racking a tracker at all — of either kind? */
export function isTrackerKind(kind: string): boolean {
  return kind === 'tracker_hsat' || kind === 'tracker_azel';
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
  racking: {
    kind?: string;
    axisAzimuthDeg?: number;
    maxRotationDeg?: number;
    backtracking?: boolean;
    rowPitchM: number;
  },
  slantM: number,
  /** the table's facing; the tube runs across it, along the rows */
  segmentAzimuthDeg = 180,
): TrackerAxis {
  // A DUAL-AXIS frame has no tube and no roll, so the three fields below mean
  // nothing to it: its home bearing is the table's own facing, and its stops
  // are hardware. `gcr` is still carried because the field is real — it is
  // what `azel_spacing` is judged against — but nothing backtracks from it.
  if (racking.kind === 'tracker_azel')
    return {
      kind: 'azel',
      axisAzimuthDeg: norm360(segmentAzimuthDeg),
      homeAzimuthDeg: norm360(segmentAzimuthDeg),
      maxRotationDeg: AZEL_DEFAULT_AZIMUTH_RANGE_DEG,
      minTiltDeg: AZEL_DEFAULT_MIN_TILT_DEG,
      maxTiltDeg: AZEL_DEFAULT_MAX_TILT_DEG,
      azimuthRangeDeg: AZEL_DEFAULT_AZIMUTH_RANGE_DEG,
      gcr: trackerGcr(slantM, racking.rowPitchM > 0 ? racking.rowPitchM : slantM * AZEL_DEFAULT_PITCH_FACTOR),
      backtracking: false,
    };
  return {
    kind: 'hsat',
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
