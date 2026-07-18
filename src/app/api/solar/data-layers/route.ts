// ─── Google Solar dataLayers proxy (GEOMETRY layers only) ────────────────────
// Scope rule (plan §E, binding): DSM + RGB + building mask for roof
// reconstruction — view=IMAGERY_LAYERS. The flux layers are NEVER requested;
// PVGIS remains the sole irradiance/energy source.
//
// The returned *Url fields are key-authenticated and expire after ONE HOUR
// (verified against docs 2026-07-16), so they are rewritten to our
// /api/solar/geotiff relay — the client never sees or needs the key, and the
// pipeline must fetch rasters promptly rather than persisting URLs.
import { NextResponse } from 'next/server';
import { serverSolarKey } from '../key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 8000;
const MAX_RADIUS_M = 100;

interface DataLayersBody {
  imageryDate?: { year: number; month: number; day: number };
  imageryProcessedDate?: { year: number; month: number; day: number };
  imageryQuality?: string;
  dsmUrl?: string;
  rgbUrl?: string;
  maskUrl?: string;
  error?: { message?: string; status?: string };
}

const relay = (url: string | undefined) =>
  url ? `/api/solar/geotiff?src=${encodeURIComponent(url)}` : undefined;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
  const radius = Math.min(MAX_RADIUS_M, Math.max(10, Number(searchParams.get('radius')) || 30));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ status: 'error', message: 'Invalid lat/lng' }, { status: 200 });
  }
  const key = serverSolarKey();
  if (!key) {
    return NextResponse.json(
      { status: 'error', message: 'No Solar API key configured on the server' },
      { status: 200 },
    );
  }

  const url =
    `https://solar.googleapis.com/v1/dataLayers:get` +
    `?location.latitude=${lat.toFixed(6)}&location.longitude=${lng.toFixed(6)}` +
    `&radiusMeters=${radius}&view=IMAGERY_LAYERS&requiredQuality=LOW&key=${key}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (res.status === 404) {
      return NextResponse.json(
        { status: 'unavailable', message: 'No aerial data layers for this location' },
        { status: 200 },
      );
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as DataLayersBody | null;
      return NextResponse.json(
        { status: 'error', message: body?.error?.message ?? `dataLayers HTTP ${res.status}` },
        { status: 200 },
      );
    }
    const data = (await res.json()) as DataLayersBody;
    if (!data.maskUrl || !data.dsmUrl) {
      return NextResponse.json(
        { status: 'unavailable', message: 'dataLayers response missing mask/DSM' },
        { status: 200 },
      );
    }
    const d = data.imageryDate;
    return NextResponse.json(
      {
        status: 'ok',
        imageryDate: d
          ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
          : undefined,
        imageryQuality: data.imageryQuality,
        // relay URLs — key-free for the client, valid ~1 h upstream
        layers: {
          mask: relay(data.maskUrl),
          dsm: relay(data.dsmUrl),
          rgb: relay(data.rgbUrl),
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { status: 'error', message: aborted ? 'dataLayers request timed out' : 'dataLayers request failed' },
      { status: 200 },
    );
  } finally {
    clearTimeout(timer);
  }
}
