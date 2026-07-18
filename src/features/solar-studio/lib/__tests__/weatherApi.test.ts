import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWeather } from '../weatherApi';
import type { SiteWeather } from '../../types';

const goodWeather: SiteWeather = {
  monthlyGhi: [5.3, 6, 6.6, 7, 6.9, 4.3, 3.1, 3.3, 3.9, 4.8, 4.9, 4.8],
  monthlyDiffuseFrac: [0.2, 0.2, 0.21, 0.21, 0.24, 0.45, 0.59, 0.56, 0.46, 0.32, 0.25, 0.23],
  annualGhi: 5.07,
  forLatLng: { lat: 0, lng: 0 }, // client re-stamps this
  source: 'pvgis',
  fetchedAt: 0,
};

const okResponse = (body: unknown) => ({ ok: true, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe('fetchWeather', () => {
  it('returns weather stamped with the requested pin on an ok envelope', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ status: 'ok', weather: goodWeather })));
    const w = await fetchWeather(18.52, 73.86);
    expect(w).not.toBeNull();
    expect(w!.forLatLng).toEqual({ lat: 18.52, lng: 73.86 });
    expect(w!.fetchedAt).toBeGreaterThan(0);
    expect(w!.monthlyGhi).toHaveLength(12);
  });

  it('returns null on unavailable WITHOUT retrying (deterministic no-coverage)', async () => {
    const spy = vi.fn(async () => okResponse({ status: 'unavailable' }));
    vi.stubGlobal('fetch', spy);
    expect(await fetchWeather(0, 0)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('retries once on a transient error then gives up with null', async () => {
    const spy = vi.fn(async () => okResponse({ status: 'error', message: 'boom' }));
    vi.stubGlobal('fetch', spy);
    expect(await fetchWeather(1, 2)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('recovers when the retry succeeds', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(okResponse({ status: 'error' }))
      .mockResolvedValueOnce(okResponse({ status: 'ok', weather: goodWeather }));
    vi.stubGlobal('fetch', spy);
    const w = await fetchWeather(5, 6);
    expect(w).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed weather payload (diffuse out of range)', async () => {
    const bad = { ...goodWeather, monthlyDiffuseFrac: goodWeather.monthlyDiffuseFrac.map(() => 0.99) };
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ status: 'ok', weather: bad })));
    expect(await fetchWeather(1, 1)).toBeNull();
  });

  it('rejects a short array', async () => {
    const bad = { ...goodWeather, monthlyGhi: goodWeather.monthlyGhi.slice(0, 11) };
    vi.stubGlobal('fetch', vi.fn(async () => okResponse({ status: 'ok', weather: bad })));
    expect(await fetchWeather(1, 1)).toBeNull();
  });

  it('returns null (after retry) when fetch throws', async () => {
    const spy = vi.fn(async () => {
      throw new Error('network');
    });
    vi.stubGlobal('fetch', spy);
    expect(await fetchWeather(1, 1)).toBeNull();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
