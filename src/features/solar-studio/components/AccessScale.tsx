// ─── The heatmap legend's scale: ramp, band words and tick marks ─────────────
//
// The 2D editor and the 3D scene each drew their own copy of this: a hard-coded
// three-stop gradient with amber at its middle, four band words spread evenly
// with `space-between`, and "0% · 50% · 100%" under a metric that cannot read
// below 35%. Two copies drifted, and both were wrong about the same thing.
//
// This is now the only place the scale is drawn. It reads the same table the
// paint reads (lib/solar-heatmap ACCESS_*), so each band word sits at the bar
// position where its colour actually begins, and the ticks name the values the
// metric can really take — the floor, the amber knot and full sun.
//
// Inherits `color` from its parent so it sits in either dark overlay unchanged.
import {
  ACCESS_BANDS,
  ACCESS_FLOOR,
  ACCESS_GRADIENT_CSS,
  ACCESS_STOPS,
  accessBarPos,
} from '../lib/solar-heatmap';

const pct = (t: number) => `${Math.round(accessBarPos(t) * 1000) / 10}%`;
const floorPct = Math.round(ACCESS_FLOOR * 100);

export function AccessScale() {
  return (
    <div>
      <div style={{ height: 8, borderRadius: 4, background: ACCESS_GRADIENT_CSS }} />
      {/* band words, each anchored where its band begins; the last one is
          anchored to the right edge so it cannot run off the bar */}
      <div style={{ position: 'relative', height: 12, marginTop: 3, fontSize: 9, opacity: 0.8 }}>
        {ACCESS_BANDS.map((b, i) => {
          const last = i === ACCESS_BANDS.length - 1;
          return (
            <span
              key={b.label}
              style={{
                position: 'absolute',
                top: 0,
                ...(last ? { right: 0 } : { left: pct(b.min) }),
                whiteSpace: 'nowrap',
              }}
            >
              {b.label}
            </span>
          );
        })}
      </div>
      {/* the values the metric can really take: floor, the amber knot, full sun */}
      <div style={{ position: 'relative', height: 12, fontSize: 9.5, opacity: 0.8 }}>
        {ACCESS_STOPS.map((s, i) => {
          const first = i === 0;
          const last = i === ACCESS_STOPS.length - 1;
          return (
            <span
              key={s.at}
              style={{
                position: 'absolute',
                top: 0,
                fontVariantNumeric: 'tabular-nums',
                ...(first
                  ? { left: 0 }
                  : last
                    ? { right: 0 }
                    : { left: pct(s.at), transform: 'translateX(-50%)' }),
              }}
            >
              {Math.round(s.at * 100)}%
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 9, opacity: 0.65, marginTop: 1 }}>
        {floorPct}% = diffuse light only, no direct sun
      </div>
    </div>
  );
}
