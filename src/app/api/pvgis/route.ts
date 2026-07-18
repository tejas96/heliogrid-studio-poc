// ─── PVGIS proxy: server-side because PVGIS sends no CORS headers ───────────
// GET /api/pvgis?lat&lng → { status: 'ok'|'unavailable'|'error', weather? }.
// Always HTTP 200 with a status envelope so the client has a single, simple
// contract (an over-ocean / outside-coverage 400 from PVGIS is 'unavailable',
// not an error). Node runtime + force-dynamic + no-store so a per-coordinate
// response is never statically cached or served for the wrong location.
import { NextResponse } from 'next/server';
import {
  PVGIS_DB_LADDER,
  pvgisToWeather,
  type PvgisResponse,
} from '@/features/solar-studio/lib/pvgis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// v5_3 (verified live 2026-07-16): same MRcalc shape, 2005–2023 record, and
// the raddatabase parameter accepts PVGIS-SARAH3 / PVGIS-ERA5
const PVGIS_BASE = 'https://re.jrc.ec.europa.eu/api/v5_3/MRcalc';
const TIMEOUT_MS = 8000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ status: 'error', message: 'Invalid lat/lng' }, { status: 200 });
  }

  // Explicit database ladder — never accept a silent server-side default:
  // satellite SARAH3 where covered, else the global ERA5 reanalysis. A 400 on
  // SARAH3 means "outside its grid" (all of India); a 400 on ERA5 too means
  // there is genuinely no data here (over open sea).
  try {
    for (let i = 0; i < PVGIS_DB_LADDER.length; i++) {
      const db = PVGIS_DB_LADDER[i];
      const url =
        `${PVGIS_BASE}?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}` +
        `&horirrad=1&d2g=1&raddatabase=${db}&outputformat=json`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, { cache: 'no-store', signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 400) {
        if (i < PVGIS_DB_LADDER.length - 1) continue; // next rung
        return NextResponse.json(
          { status: 'unavailable', message: 'PVGIS has no data for this location' },
          { status: 200 },
        );
      }
      if (!res.ok) {
        return NextResponse.json(
          { status: 'error', message: `PVGIS HTTP ${res.status}` },
          { status: 200 },
        );
      }
      const json = (await res.json()) as PvgisResponse;
      const weather = pvgisToWeather(json, lat, lng);
      if (!weather) {
        return NextResponse.json(
          { status: 'unavailable', message: 'PVGIS payload incomplete or out of range' },
          { status: 200 },
        );
      }
      return NextResponse.json(
        { status: 'ok', weather },
        { status: 200, headers: { 'Cache-Control': 'public, max-age=86400' } },
      );
    }
    // unreachable — the ladder always returns above
    return NextResponse.json({ status: 'error', message: 'PVGIS ladder exhausted' }, { status: 200 });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { status: 'error', message: aborted ? 'PVGIS request timed out' : 'PVGIS request failed' },
      { status: 200 },
    );
  }
}
