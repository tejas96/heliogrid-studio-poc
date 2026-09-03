// ─── The Inverter Bay: where every string is going, and where the next one goes ──
// Hand-wiring used to hand the finished string to the balancer, which put it
// on whichever inverter was lightest. That is the right default and a poor
// rule: on a C&I job the installer KNOWS block B belongs to inverter 2, and
// the app gave them no way to say it. Worse, there was nowhere at all to see
// how the load had landed — you read "INV 2 · MPPT 3" off one string card at
// a time and did the arithmetic in your head.
//
// The Bay is one card per inverter: its MPPT inputs as pips, the DC it carries
// against its AC rating as a bar, and its string count. Tap one and the next
// hand-made string lands there.
import type { InverterSpec, StringDef } from '../types';

export interface BayInverter {
  index: number;
  /** DC kWp carried by the strings on it */
  kwp: number;
  /** MPPT inputs already taken */
  usedMppts: number;
  strings: number;
  /** it has a physical box on the model — an unplaced one cannot measure a run */
  placed: boolean;
}

/** What the Bay needs, worked out from the strings. Pure, so it is testable. */
export function bayInverters(
  strings: StringDef[],
  inverter: InverterSpec,
  inverterCount: number,
  panelWatt: number,
  placedCount: number,
): BayInverter[] {
  const n = Math.max(1, inverterCount);
  return Array.from({ length: n }, (_, index) => {
    const mine = strings.filter((s) => s.inverterIndex === index);
    return {
      index,
      kwp: mine.reduce((sum, s) => sum + (s.panelIds.length * panelWatt) / 1000, 0),
      usedMppts: new Set(mine.map((s) => s.mpptIndex)).size,
      strings: mine.length,
      placed: index < placedCount,
    };
  });
}

/**
 * The Bay is only up while a string is being BUILT, so a light inverter is the
 * normal half-finished state, not a fault — colouring it amber would cry wolf
 * on every single wiring session. Light reads neutral; only genuine overload,
 * which is wrong whenever it appears, reads as a problem.
 */
function ratioTone(ratio: number): 'light' | 'ok' | 'bad' {
  if (ratio > 1.35) return 'bad';
  if (ratio < 0.9) return 'light';
  return 'ok';
}

export function InverterBay({
  inverters,
  spec,
  target,
  onTarget,
  live,
}: {
  inverters: BayInverter[];
  spec: InverterSpec;
  /** the inverter the next hand-made string will land on; null = let it balance */
  target: number | null;
  onTarget: (index: number | null) => void;
  /**
   * A string is being wired, so the cards are a CHOICE. Otherwise the Bay is
   * just the readout — how the DC has landed across the inverters — and must
   * not look like a control that does nothing when tapped.
   */
  live: boolean;
}) {
  return (
    <div
      className={`bay ${live ? '' : 'bay-readout'}`}
      role={live ? 'radiogroup' : 'group'}
      aria-label={live ? 'Inverter to wire into' : 'Inverter load'}
    >
      {live && (
        <button
          className={`bay-card bay-auto ${target === null ? 'on' : ''}`}
          role="radio"
          aria-checked={target === null}
          onClick={() => onTarget(null)}
          data-tip={'Balance it for me\nThe next string goes on the lightest inverter'}
        >
          <span className="bay-name">Auto</span>
          <span className="bay-sub">balance</span>
        </button>
      )}
      {inverters.map((inv) => {
        const ratio = spec.acKw > 0 ? inv.kwp / spec.acKw : 0;
        const tone = ratioTone(ratio);
        const full = inv.usedMppts >= spec.mppt.count;
        return (
          <button
            key={inv.index}
            className={`bay-card ${live && target === inv.index ? 'on' : ''} ${full ? 'full' : ''}`}
            role={live ? 'radio' : undefined}
            aria-checked={live ? target === inv.index : undefined}
            disabled={!live || full}
            onClick={() => onTarget(inv.index)}
            data-tip={
              !live
                ? `Inverter ${inv.index + 1} carries ${inv.kwp.toFixed(1)} of ${spec.acKw} kW on ${inv.usedMppts} of ${spec.mppt.count} MPPT inputs`
                : full
                  ? `Inverter ${inv.index + 1} has no free MPPT input left`
                  : `Wire the next string into inverter ${inv.index + 1}\n${inv.kwp.toFixed(1)} of ${spec.acKw} kW · ${inv.strings} string${inv.strings === 1 ? '' : 's'}`
            }
            aria-label={`Inverter ${inv.index + 1}, ${inv.kwp.toFixed(1)} of ${spec.acKw} kilowatts, ${inv.usedMppts} of ${spec.mppt.count} MPPT inputs used${inv.placed ? '' : ', not placed on the model'}`}
          >
            <span className="bay-name">
              INV {inv.index + 1}
              {/* an inverter with no box on the model cannot measure its cable
                  run, and the BOM has to know that (lib/routing assumedTarget) */}
              {!inv.placed && (
                <span className="bay-flag" title="Not placed on the model — its cable run is an estimate">
                  ~
                </span>
              )}
            </span>
            <span className="bay-pips" aria-hidden>
              {Array.from({ length: spec.mppt.count }, (_, m) => (
                <i key={m} className={m < inv.usedMppts ? 'on' : ''} />
              ))}
            </span>
            <span className={`bay-bar tone-${tone}`} aria-hidden>
              <i style={{ width: `${Math.min(100, ratio * 100 / 1.35).toFixed(0)}%` }} />
            </span>
            <span className="bay-sub">
              {inv.kwp.toFixed(1)} / {spec.acKw} kW
            </span>
          </button>
        );
      })}
    </div>
  );
}
