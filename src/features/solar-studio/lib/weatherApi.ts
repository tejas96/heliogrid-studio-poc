// ─── PVGIS weather client — enhancement layer, mirrors solarApi.ts ──────────
// Same-origin GET to our /api/pvgis proxy (PVGIS itself has no CORS). Resolves
// to SiteWeather on success or null in EVERY failure case (unavailable, timeout,
// network, malformed) — never throws — so the manual estimate stays the floor.
import type { SiteWeather } from '../types';
import { isValidSiteWeather } from './pvgis';

const TIMEOUT_MS = 9000; // > server's 8s so the server's own timeout surfaces first

interface WeatherEnvelope {
  status?: 'ok' | 'unavailable' | 'error';
  weather?: SiteWeather;
  message?: string;
}

async function requestOnce(lat: number, lng: number): Promise<WeatherEnvelope | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`/api/pvgis?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null; // transient (proxy always sends 200; !ok = infra)
    return (await res.json()) as WeatherEnvelope;
  } catch {
    return null; // network / abort
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWeather(lat: number, lng: number): Promise<SiteWeather | null> {
  let env = await requestOnce(lat, lng);
  // one transient retry — but NOT when PVGIS deterministically has no coverage
  if ((env === null || env.status === 'error') && env?.status !== 'unavailable') {
    env = await requestOnce(lat, lng);
  }
  if (!env || env.status !== 'ok' || !isValidSiteWeather(env.weather)) return null;
  return { ...env.weather, forLatLng: { lat, lng }, fetchedAt: Date.now() };
}
