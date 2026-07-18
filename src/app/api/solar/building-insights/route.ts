// ─── Google Solar buildingInsights proxy ─────────────────────────────────────
// Same envelope contract as /api/pvgis: ALWAYS HTTP 200 with
// { status: 'ok'|'unavailable'|'error', insights?, message? } so the client
// has one simple shape. Adds the upstream timeout the old direct client fetch
// never had (audit ★16: an unbounded Solar call hung the whole location flow).
import { NextResponse } from 'next/server';
import {
  mapBuildingInsights,
  type ApiBuildingInsights,
} from '@/features/solar-studio/lib/solarApi';
import { serverSolarKey } from '../key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIMEOUT_MS = 8000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get('lat'));
  const lng = Number(searchParams.get('lng'));
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
    `https://solar.googleapis.com/v1/buildingInsights:findClosest` +
    `?location.latitude=${lat.toFixed(6)}&location.longitude=${lng.toFixed(6)}` +
    `&requiredQuality=BASE&key=${key}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (res.status === 404) {
      return NextResponse.json(
        { status: 'unavailable', message: 'Google Solar has no coverage for this location' },
        { status: 200 },
      );
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      return NextResponse.json(
        { status: 'error', message: body?.error?.message ?? `Solar API HTTP ${res.status}` },
        { status: 200 },
      );
    }
    const data = (await res.json()) as ApiBuildingInsights;
    return NextResponse.json(
      { status: 'ok', insights: mapBuildingInsights(data) },
      // per-coordinate result is stable for a day — same policy as /api/pvgis
      { status: 200, headers: { 'Cache-Control': 'public, max-age=86400' } },
    );
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json(
      { status: 'error', message: aborted ? 'Solar API request timed out' : 'Solar API request failed' },
      { status: 200 },
    );
  } finally {
    clearTimeout(timer);
  }
}
