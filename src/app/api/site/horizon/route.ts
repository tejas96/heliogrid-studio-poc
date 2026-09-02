// ─── Far horizon from PVGIS (SRTM-derived skyline of the hills) ────────────
// PVGIS's monthly radiation already has this horizon inside it (usehorizon is
// on by default there), so it is NOT applied again in the shading engine. It
// is shown on the sun chart so a designer sees the hill the climate data
// already accounts for. Proxied here: PVGIS has no CORS for browsers.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PVGIS_HORIZON = 'https://re.jrc.ec.europa.eu/api/v5_3/printhorizon';
const TIMEOUT_MS = 12_000;

interface PvgisHorizon {
  outputs?: { horizon_profile?: Array<{ A: number; H_hor: number }> };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ status: 'error', message: 'lat and lng are required' }, { status: 400 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${PVGIS_HORIZON}?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&outputformat=json`;
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return NextResponse.json({ status: 'unavailable', message: `PVGIS HTTP ${res.status}` }, { status: 200 });
    const json = (await res.json()) as PvgisHorizon;
    const rows = json.outputs?.horizon_profile ?? [];
    if (rows.length === 0) return NextResponse.json({ status: 'unavailable', message: 'no horizon profile' }, { status: 200 });
    // PVGIS azimuth: 0 = south, east negative, west positive → compass clockwise from north
    const horizon = rows
      .map((r) => ({ azDeg: (((r.A + 180) % 360) + 360) % 360, elevDeg: Math.max(0, r.H_hor) }))
      .sort((a, b) => a.azDeg - b.azDeg);
    return NextResponse.json({ status: 'ok', horizon, source: 'PVGIS 5.3 printhorizon (SRTM)' });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', message: err instanceof Error ? err.message : 'horizon fetch failed' },
      { status: 200 },
    );
  } finally {
    clearTimeout(timer);
  }
}
