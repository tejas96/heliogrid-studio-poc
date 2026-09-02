// ─── PVGIS TMY proxy: one typical year, hour by hour ────────────────────────
// GET /api/pvgis/tmy?lat&lng → { status: 'ok'|'unavailable'|'error', tmy? }.
// PVGIS builds a Typical Meteorological Year from its 2005–2020/2023 record:
// 8760 hourly rows of global/beam/diffuse irradiance, air temperature and
// wind, with the DEM horizon already applied. This is the input an hourly
// simulation needs; the monthly MRcalc means stay for the quick estimate.
// Always HTTP 200 with a status envelope (same contract as /api/pvgis).
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PVGIS_TMY = ['https://re.jrc.ec.europa.eu/api/v5_3/tmy', 'https://re.jrc.ec.europa.eu/api/v5_2/tmy'];
const TIMEOUT_MS = 25_000;
const HOURS = 8760;

interface TmyRow {
  'time(UTC)'?: string;
  T2m?: number;
  'G(h)'?: number;
  'Gb(n)'?: number;
  'Gd(h)'?: number;
  WS10m?: number;
}
interface TmyJson {
  inputs?: {
    location?: { elevation?: number; irradiance_time_offset?: number };
    meteo_data?: { radiation_db?: string; meteo_db?: string; year_min?: number; year_max?: number };
  };
  outputs?: { tmy_hourly?: TmyRow[] };
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ status: 'error', message: 'Invalid lat/lng' }, { status: 200 });
  }
  try {
    let json: TmyJson | null = null;
    for (const base of PVGIS_TMY) {
      const url = `${base}?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&outputformat=json`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 400) {
        return NextResponse.json({ status: 'unavailable', message: 'PVGIS has no hourly year for this location' }, { status: 200 });
      }
      if (res.ok) {
        json = (await res.json()) as TmyJson;
        break;
      }
      if (base === PVGIS_TMY[PVGIS_TMY.length - 1]) {
        return NextResponse.json({ status: 'error', message: `PVGIS HTTP ${res.status}` }, { status: 200 });
      }
    }
    const rows = json?.outputs?.tmy_hourly;
    if (!Array.isArray(rows) || rows.length !== HOURS) {
      return NextResponse.json({ status: 'unavailable', message: 'PVGIS hourly year incomplete' }, { status: 200 });
    }
    const ghi: number[] = [];
    const dni: number[] = [];
    const dhi: number[] = [];
    const tair: number[] = [];
    const wind: number[] = [];
    for (const r of rows) {
      const g = r['G(h)'];
      const b = r['Gb(n)'];
      const d = r['Gd(h)'];
      const t = r.T2m;
      const w = r.WS10m;
      if (!num(g) || !num(b) || !num(d) || !num(t) || !num(w) || g < 0 || b < 0 || d < 0) {
        return NextResponse.json({ status: 'unavailable', message: 'PVGIS hourly year has bad rows' }, { status: 200 });
      }
      ghi.push(Math.round(g));
      dni.push(Math.round(b));
      dhi.push(Math.round(d));
      tair.push(Math.round(t * 100) / 100);
      wind.push(Math.round(w * 100) / 100);
    }
    const meteo = json?.inputs?.meteo_data ?? {};
    return NextResponse.json(
      {
        status: 'ok',
        tmy: {
          ghi,
          dni,
          dhi,
          tair,
          wind,
          radiationDb: meteo.radiation_db ?? 'PVGIS',
          yearMin: meteo.year_min ?? null,
          yearMax: meteo.year_max ?? null,
          /** the hour's values are averages centred this far into the hour (h) */
          timeOffsetH: json?.inputs?.location?.irradiance_time_offset ?? 0.5,
          elevationM: json?.inputs?.location?.elevation ?? null,
        },
      },
      { status: 200, headers: { 'Cache-Control': 'public, max-age=86400' } },
    );
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { status: 'error', message: aborted ? 'PVGIS request timed out' : 'PVGIS request failed' },
      { status: 200 },
    );
  }
}
