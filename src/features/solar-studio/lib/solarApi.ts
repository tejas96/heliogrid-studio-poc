// ─── Google Solar API (Building Insights) — enhancement layer, never a dep ──
// Coverage in India is partial/experimental, so every consumer must handle
// the 'unavailable' state: the manual design pipeline is the fallback and the
// UI says so explicitly instead of hiding the gap (audit §4).
//
// The browser talks ONLY to our own /api/solar/* proxy (Phase 5, task 22):
// the Solar-scoped key lives server-side (GOOGLE_SOLAR_API_KEY), the proxy
// adds the timeout the old direct fetch never had, and the response mapping
// below is a PURE function shared by proxy and tests so the stored
// SolarInsights shape cannot drift.
import type { SolarInsights } from '../types';

interface ApiRoofSegment {
  pitchDegrees?: number;
  azimuthDegrees?: number;
  stats?: { areaMeters2?: number };
  center?: { latitude?: number; longitude?: number };
}

export interface ApiBuildingInsights {
  imageryDate?: { year: number; month: number; day: number };
  imageryQuality?: 'HIGH' | 'MEDIUM' | 'BASE';
  solarPotential?: {
    maxArrayPanelsCount?: number;
    maxArrayAreaMeters2?: number;
    maxSunshineHoursPerYear?: number;
    carbonOffsetFactorKgPerMwh?: number;
    panelCapacityWatts?: number;
    wholeRoofStats?: { areaMeters2?: number };
    roofSegmentStats?: ApiRoofSegment[];
  };
}

/**
 * Map a raw buildingInsights body to the stored SolarInsights fields.
 * Pure — no fetch, no clock (status/fetchedAt are the caller's).
 * Google azimuthDegrees is already 0=N clockwise = our slopeAzimuthDeg.
 */
export function mapBuildingInsights(
  data: ApiBuildingInsights,
): Omit<SolarInsights, 'status' | 'fetchedAt'> {
  const sp = data.solarPotential;
  const d = data.imageryDate;
  const roofSegments = sp?.roofSegmentStats
    ?.filter((s) => s.pitchDegrees != null && s.azimuthDegrees != null)
    .map((s) => ({
      pitchDeg: Math.round(s.pitchDegrees!),
      azimuthDeg: Math.round(s.azimuthDegrees!),
      areaM2: s.stats?.areaMeters2 ? Math.round(s.stats.areaMeters2 * 10) / 10 : 0,
      center:
        s.center?.latitude != null && s.center?.longitude != null
          ? { lat: s.center.latitude, lng: s.center.longitude }
          : undefined,
    }));
  return {
    imageryDate: d
      ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
      : undefined,
    imageryQuality: data.imageryQuality,
    maxPanels: sp?.maxArrayPanelsCount,
    maxArrayAreaM2: sp?.maxArrayAreaMeters2
      ? Math.round(sp.maxArrayAreaMeters2)
      : undefined,
    maxSunshineHoursPerYear: sp?.maxSunshineHoursPerYear
      ? Math.round(sp.maxSunshineHoursPerYear)
      : undefined,
    panelCapacityWatts: sp?.panelCapacityWatts,
    roofAreaM2: sp?.wholeRoofStats?.areaMeters2
      ? Math.round(sp.wholeRoofStats.areaMeters2)
      : undefined,
    // count the USABLE segments (those with pitch/azimuth) so the "roof faces"
    // stat matches the number of suggestion chips Step 2 can actually offer
    roofSegmentCount: roofSegments?.length ?? sp?.roofSegmentStats?.length,
    roofSegments,
    carbonOffsetFactorKgPerMwh: sp?.carbonOffsetFactorKgPerMwh
      ? Math.round(sp.carbonOffsetFactorKgPerMwh)
      : undefined,
  };
}

/** Coordinate-keyed memo — a Confirm on the same pin must not re-bill Google. */
const insightsMemo = new Map<string, SolarInsights>();

/**
 * findClosestBuilding for a confirmed location, via our server proxy.
 * Resolves to a stored-shape SolarInsights in ALL cases — 'ok', 'unavailable'
 * (no coverage for this location) or 'error' (network/key/quota) — so the UI
 * can always explain the data situation. Never throws.
 */
export async function fetchBuildingInsights(
  lat: number,
  lng: number,
): Promise<SolarInsights> {
  const memoKey = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const hit = insightsMemo.get(memoKey);
  // errors are retryable; ok/unavailable are facts about the location
  if (hit && hit.status !== 'error') return { ...hit, fetchedAt: Date.now() };

  const base = { fetchedAt: Date.now() };
  const controller = new AbortController();
  // client bound must exceed the proxy's own 8s upstream timeout
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `/api/solar/building-insights?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`,
      { signal: controller.signal },
    );
    if (!res.ok) {
      return { ...base, status: 'error', message: `Solar proxy HTTP ${res.status}` };
    }
    const body = (await res.json()) as {
      status: SolarInsights['status'];
      message?: string;
      insights?: Omit<SolarInsights, 'status' | 'fetchedAt'>;
    };
    const result: SolarInsights = {
      ...base,
      ...(body.insights ?? {}),
      status: body.status,
      message: body.message,
    };
    insightsMemo.set(memoKey, result);
    return result;
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      ...base,
      status: 'error',
      message: aborted ? 'Solar API request timed out' : 'Solar API request failed',
    };
  } finally {
    clearTimeout(timer);
  }
}
