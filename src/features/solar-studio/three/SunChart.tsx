// ─── Sun chart: the year's sun paths over the site's own horizon ─────────────
// One click on the sun widget. Azimuth across, altitude up; the three days
// that bound the year plus the day on the timeline; hour marks; and under
// them the skyline the array actually sees — neighbours from Google's height
// map, the project's other roofs, obstructions on this roof. Where a curve
// dips below the skyline the array is in shade, and the panel says so in
// clock time, in words.
import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Project } from '../types';
import { fmtHour } from '../lib/solar';
import { loadSurroundHeights, peekSurroundHeights } from '../lib/surround';
import { farHorizonAt, fetchFarHorizon, type FarHorizonPoint } from '../lib/far-horizon';
import {
  clockHour,
  clockLabel,
  horizonAt,
  horizonProfile,
  seasonDates,
  shadeWindows,
  sunCurve,
  type SunSample,
} from '../lib/sun-chart';

const W = 460;
const H = 250;
const PAD = { l: 34, r: 12, t: 14, b: 26 };
const AZ0 = 40;
const AZ1 = 320;
const ALT1 = 90;

function x(az: number): number {
  return PAD.l + ((az - AZ0) / (AZ1 - AZ0)) * (W - PAD.l - PAD.r);
}
function y(alt: number): number {
  return H - PAD.b - (alt / ALT1) * (H - PAD.t - PAD.b);
}
function pathOf(curve: SunSample[]): string {
  return curve.map((s, i) => `${i ? 'L' : 'M'}${x(s.azDeg).toFixed(1)},${y(s.altDeg).toFixed(1)}`).join(' ');
}

export function SunChart({
  project,
  date,
  hour,
  onClose,
}: {
  project: Project;
  date: Date;
  /** solar hour on the timeline */
  hour: number;
  onClose: () => void;
}) {
  const lat = project.location?.latLng.lat ?? 0;
  const lng = project.location?.latLng.lng ?? 0;
  // the height map lives in the blob store; the analysis worker has its own
  // copy, so the panel loads it for this thread the first time it opens
  const [gridReady, setGridReady] = useState(0);
  useEffect(() => {
    if (!project.surround || peekSurroundHeights(project.surround)) return;
    let alive = true;
    void loadSurroundHeights(project.surround).then(() => {
      if (alive) setGridReady((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [project.surround]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nearProfile = useMemo(() => horizonProfile(project, 3, 'centre'), [project, gridReady]);
  // the worst of the four corner modules — what an edge module can see
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cornerProfile = useMemo(() => horizonProfile(project, 3, 'corners'), [project, gridReady]);
  // the far hills (PVGIS) — already inside the climate data, shown so they are seen
  const [far, setFar] = useState<FarHorizonPoint[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchFarHorizon(lat, lng).then((h) => {
      if (alive) setFar(h);
    });
    return () => {
      alive = false;
    };
  }, [lat, lng]);
  // the skyline the words use: near objects OR the far hills, whichever is higher
  const profile = useMemo(() => {
    if (!far) return nearProfile;
    return {
      ...nearProfile,
      elevDeg: nearProfile.elevDeg.map((e, i) => Math.max(e, farHorizonAt(far, i * nearProfile.stepDeg))),
    };
  }, [nearProfile, far]);
  const farMax = far ? Math.max(...far.map((p) => p.elevDeg)) : 0;
  const cornerMax = Math.max(...cornerProfile.elevDeg);
  const cornerAz = cornerProfile.elevDeg.indexOf(cornerMax) * cornerProfile.stepDeg;
  const cornerPath =
    `M${x(AZ0)},${y(0)} ` +
    cornerProfile.elevDeg
      .map((e, i) => ({ az: i * cornerProfile.stepDeg, e }))
      .filter((s) => s.az >= AZ0 && s.az <= AZ1)
      .map((s) => `L${x(s.az).toFixed(1)},${y(s.e).toFixed(1)}`)
      .join(' ') +
    ` L${x(AZ1)},${y(0)}`;
  const seasons = useMemo(() => seasonDates(date.getFullYear()).map((s) => ({ ...s, curve: sunCurve(lat, lng, s.date) })), [lat, lng, date]);
  const today = useMemo(() => sunCurve(lat, lng, date), [lat, lng, date]);
  const now = today.reduce<SunSample | null>((best, s) => (!best || Math.abs(s.hour - hour) < Math.abs(best.hour - hour) ? s : best), null);
  const todayLabel = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const skyline = profile.elevDeg.map((e, i) => ({ az: i * profile.stepDeg, e }));
  const skylinePath =
    `M${x(AZ0)},${y(0)} ` +
    skyline
      .filter((s) => s.az >= AZ0 && s.az <= AZ1)
      .map((s) => `L${x(s.az).toFixed(1)},${y(s.e).toFixed(1)}`)
      .join(' ') +
    ` L${x(AZ1)},${y(0)} Z`;
  const maxSky = Math.max(...profile.elevDeg);
  const words = (label: string, curve: SunSample[]) => {
    const wins = shadeWindows(curve, profile).filter((w) => w.to - w.from >= 0.2);
    if (!curve.length) return `${label}: the sun does not rise`;
    if (wins.length === 0) return `${label}: clear sky all day`;
    return `${label}: shaded ${wins
      .map((w) => `${fmtHour(clockHour(w.from, lng, lat, date))}–${fmtHour(clockHour(w.to, lng, lat, date))}`)
      .join(', ')}`;
  };

  return (
    <div
      role="dialog"
      aria-label="Sun chart with the site's horizon"
      style={{
        position: 'absolute',
        top: 14,
        right: 126,
        width: W + 24,
        background: 'rgba(20,24,30,0.94)',
        backdropFilter: 'blur(12px)',
        border: '1px solid var(--editor-line)',
        borderRadius: 12,
        color: 'var(--editor-ink)',
        padding: '10px 12px 12px',
        zIndex: 31,
        fontSize: 11,
        fontFamily: 'var(--mono)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }} title="Filled skyline: as the array's middle sees it. Dashed: as its worst corner sees it.">
          Sun paths over this site · {clockLabel({ lat, lng }, date)}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the sun chart"
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2 }}
        >
          <X size={14} />
        </button>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
        {/* frame + grid */}
        {[0, 15, 30, 45, 60, 75, 90].map((a) => (
          <g key={a}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(a)} y2={y(a)} stroke="rgba(255,255,255,0.08)" />
            <text x={PAD.l - 4} y={y(a) + 3} textAnchor="end" fontSize={8.5} fill="var(--editor-ink-2)">
              {a}°
            </text>
          </g>
        ))}
        {[45, 90, 135, 180, 225, 270, 315].map((a) => (
          <g key={a}>
            <line y1={PAD.t} y2={H - PAD.b} x1={x(a)} x2={x(a)} stroke="rgba(255,255,255,0.08)" />
            <text x={x(a)} y={H - PAD.b + 12} textAnchor="middle" fontSize={8.5} fill="var(--editor-ink-2)">
              {a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : `${a}°`}
            </text>
          </g>
        ))}
        {/* what an edge module can see — thin, so the middle's skyline stays the reading */}
        {cornerMax > Math.max(...nearProfile.elevDeg) + 2 && (
          <path d={cornerPath} fill="rgba(148,163,184,0.10)" stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="4 3" />
        )}
        {/* the site's skyline as the array's middle sees it: what shades the plant as a whole */}
        <path d={skylinePath} fill="rgba(148,163,184,0.28)" stroke="#94a3b8" strokeWidth={1} />
        {/* the far hills, dashed — PVGIS's own horizon */}
        {far && farMax > 0.5 && (
          <path
            d={
              `M${x(AZ0)},${y(farHorizonAt(far, AZ0))} ` +
              Array.from({ length: 57 }, (_, i) => AZ0 + i * 5)
                .filter((a) => a <= AZ1)
                .map((a) => `L${x(a).toFixed(1)},${y(farHorizonAt(far, a)).toFixed(1)}`)
                .join(' ')
            }
            fill="none"
            stroke="#a3b1c6"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        {/* season curves */}
        {seasons.map((s) => (
          <path key={s.label} d={pathOf(s.curve)} fill="none" stroke="#d4a017" strokeWidth={1} opacity={0.55} />
        ))}
        {/* hour marks joined across the seasons (6..18) */}
        {[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((h) => {
          const pts = seasons
            .map((s) => s.curve.find((p) => Math.abs(p.hour - h) < 0.01))
            .filter((p): p is SunSample => !!p);
          if (pts.length < 2) return null;
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.azDeg).toFixed(1)},${y(p.altDeg).toFixed(1)}`).join(' ');
          const top = pts.reduce((a, p) => (p.altDeg > a.altDeg ? p : a), pts[0]);
          return (
            <g key={h}>
              <path d={d} fill="none" stroke="rgba(212,160,23,0.45)" strokeWidth={0.8} strokeDasharray="2 2" />
              {h % 3 === 0 && (
                <text x={x(top.azDeg)} y={y(top.altDeg) - 4} textAnchor="middle" fontSize={8} fill="#e5c76b">
                  {fmtHour(clockHour(h, lng, lat, date)).replace(':00', '')}
                </text>
              )}
            </g>
          );
        })}
        {/* the day on the timeline */}
        <path d={pathOf(today)} fill="none" stroke="#f59e0b" strokeWidth={2} />
        {now && (
          <g>
            <circle cx={x(now.azDeg)} cy={y(now.altDeg)} r={4.5} fill="#fff0c0" stroke="#f59e0b" strokeWidth={1.5} />
            <text x={x(now.azDeg) + 7} y={y(now.altDeg) - 6} fontSize={9} fill="#fff0c0">
              {todayLabel} · {fmtHour(clockHour(hour, lng, lat, date))}
            </text>
          </g>
        )}
        {/* season labels at the curve tops */}
        {seasons.map((s) => {
          const top = s.curve.reduce((a, p) => (p.altDeg > a.altDeg ? p : a), s.curve[0]);
          if (!top) return null;
          return (
            <text key={s.label} x={x(top.azDeg)} y={y(top.altDeg) - 10} textAnchor="middle" fontSize={8.5} fill="#d4a017">
              {s.label}
            </text>
          );
        })}
      </svg>
      <div style={{ marginTop: 6, lineHeight: 1.5, color: 'var(--editor-ink-2)' }}>
        <div style={{ color: '#fff0c0' }}>{words(todayLabel, today)}</div>
        {seasons.map((s) => (
          <div key={s.label}>{words(s.label, s.curve)}</div>
        ))}
        {cornerMax > Math.max(...nearProfile.elevDeg) + 2 && (
          <div style={{ marginTop: 3, color: '#cbd5e1' }}>
            Edge modules see more: a corner of the array has the skyline at {Math.round(cornerMax)}° toward{' '}
            {cornerAz}° (dashed) — the module-by-module analysis already counts that.
          </div>
        )}
        <div style={{ marginTop: 4, fontSize: 10, opacity: 0.8 }}>
          Skyline as the array’s middle sees it, from{' '}
          {[
            profile.sources.surround ? 'Google’s height map' : null,
            profile.sources.obstructions ? `${profile.sources.obstructions} obstruction${profile.sources.obstructions === 1 ? '' : 's'}` : null,
            profile.sources.otherRoofs ? `${profile.sources.otherRoofs} other roof${profile.sources.otherRoofs === 1 ? '' : 's'}` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'nothing yet — an open site'}
          {maxSky > 0 ? ` · highest ${Math.round(maxSky)}° at ${skyline.reduce((a, s) => (s.e > a.e ? s : a), skyline[0]).az}°` : ''}
          {far
            ? farMax > 0.5
              ? ` · far hills up to ${Math.round(farMax)}° (PVGIS; already inside the climate data)`
              : ' · no far hills (PVGIS)'
            : ''}
        </div>
      </div>
    </div>
  );
}
