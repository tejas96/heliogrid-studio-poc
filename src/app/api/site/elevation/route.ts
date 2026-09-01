// ─── Ground elevation at a point (Google Elevation API proxy) ───────────────
// The real 3D surround (Photorealistic 3D Tiles) is georeferenced on the WGS84
// ellipsoid, while the design is measured from the ground at the pin. This
// returns the ground's height so the tileset can be placed under the design
// instead of hundreds of metres away from it. Key stays on the server.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 6000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ status: 'error', message: 'Invalid lat/lng' }, { status: 200 });
  }
  const key = process.env.GOOGLE_ELEVATION_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json({ status: 'error', message: 'No Google API key configured' }, { status: 200 });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/elevation/json?locations=${lat.toFixed(7)},${lng.toFixed(7)}&key=${key}`,
      { cache: 'no-store', signal: controller.signal },
    );
    const body = (await res.json()) as {
      status?: string;
      results?: { elevation: number; resolution?: number }[];
      error_message?: string;
    };
    const r = body.results?.[0];
    if (body.status !== 'OK' || !r) {
      return NextResponse.json(
        { status: 'error', message: body.error_message ?? body.status ?? 'No elevation' },
        { status: 200 },
      );
    }
    return NextResponse.json(
      // metres above mean sea level (EGM96), plus the sample spacing of the source
      { status: 'ok', elevationM: r.elevation, resolutionM: r.resolution ?? null },
      { status: 200, headers: { 'Cache-Control': 'private, max-age=86400' } },
    );
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { status: 'error', message: aborted ? 'Elevation request timed out' : 'Elevation request failed' },
      { status: 200 },
    );
  } finally {
    clearTimeout(timer);
  }
}
