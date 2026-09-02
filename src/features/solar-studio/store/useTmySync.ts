// ─── Climate sync: the pin's monthly climate and its typical year ───────────
// A confirmed pin gets PVGIS's monthly climate (the quick estimate's input)
// and its typical year, 8760 hours (the hourly engine's input). Both once per
// pin: a moved pin fetches afresh, so a project that was relocated never
// keeps reporting the old site's sun. The year is stored like the height map;
// when it is back in memory the store ticks so every report re-derives and
// switches from the monthly estimate to the hourly run. Never an undo step.
import { useEffect, useRef } from 'react';
import { useActiveProject, useProjectPatch, useStore } from './store';
import { fetchTmy, loadTmy, peekTmy, subscribeTmy, tmyStale } from '../lib/energy/tmy';
import { fetchWeather } from '../lib/weatherApi';
import { activeWeather } from '../lib/solar';

/** pins tried this session with no data / an error — never hammer the API */
const skippedWeather = new Set<string>();
const skippedTmy = new Set<string>();

export function useTmySync() {
  const project = useActiveProject();
  const patch = useProjectPatch();
  const { dispatch } = useStore();
  const projectRef = useRef(project);
  projectRef.current = project;
  const weatherInFlight = useRef<string | null>(null);
  const tmyInFlight = useRef<string | null>(null);

  const loc = project?.location;
  const projectId = project?.id ?? null;
  const pinKey = loc?.confirmed ? `${loc.latLng.lat.toFixed(5)},${loc.latLng.lng.toFixed(5)}` : null;
  // missing, for another pin, or stored before the year-by-year record was kept
  const weatherMissing = !!loc && !activeWeather(loc)?.annualGhiByYear;
  const meta = loc?.tmy;
  const tmyMissing = !!loc && (meta === undefined || (meta !== null && tmyStale(meta, loc.latLng)));

  // a year in memory changes the numbers: tell every reader
  useEffect(() => subscribeTmy(() => dispatch({ type: 'tick-derived' })), [dispatch]);

  // 1. monthly climate for this pin (Step 1 fetches it on confirm; a moved pin lands here)
  useEffect(() => {
    if (!projectId || !pinKey || !weatherMissing) return;
    const key = `${projectId}|${pinKey}`;
    if (skippedWeather.has(key) || weatherInFlight.current === key) return;
    weatherInFlight.current = key;
    let cancelled = false;
    (async () => {
      const current = projectRef.current;
      if (!current?.location) return;
      const weather = await fetchWeather(current.location.latLng.lat, current.location.latLng.lng);
      if (cancelled) return;
      const latest = projectRef.current;
      if (!latest || latest.id !== projectId || !latest.location) return;
      if (!weather) {
        skippedWeather.add(key);
        return;
      }
      const ghi = Math.round(weather.annualGhi * 100) / 100;
      patch(
        {
          location: {
            ...latest.location,
            weather,
            irradiance: ghi,
            peakSunHours: ghi,
            dataSource: `Real irradiance — PVGIS ${weather.raddatabase ?? '(measured)'}`,
          },
        },
        false,
      );
    })().finally(() => {
      if (weatherInFlight.current === key) weatherInFlight.current = null;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pinKey, weatherMissing]);

  // 2. the typical year, once per pin
  useEffect(() => {
    if (!projectId || !pinKey || !tmyMissing) return;
    const key = `${projectId}|${pinKey}`;
    if (skippedTmy.has(key) || tmyInFlight.current === key) return;
    tmyInFlight.current = key;
    let cancelled = false;
    (async () => {
      const current = projectRef.current;
      if (!current?.location) return;
      const res = await fetchTmy(current.location.latLng);
      if (cancelled) return;
      const latest = projectRef.current;
      if (!latest || latest.id !== projectId || !latest.location) return;
      if (res.status === 'ok') {
        patch({ location: { ...latest.location, tmy: res.meta } }, false);
      } else {
        skippedTmy.add(key);
        if (res.status === 'unavailable') patch({ location: { ...latest.location, tmy: null } }, false);
        else console.warn('[tmy]', res.message);
      }
    })().finally(() => {
      if (tmyInFlight.current === key) tmyInFlight.current = null;
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pinKey, tmyMissing]);

  // 3. a stored year comes back into memory on its own; a year whose samples
  //    are gone from the blob store is forgotten so it is fetched afresh
  const blobId = meta?.blobId ?? null;
  useEffect(() => {
    if (!blobId || peekTmy(meta)) return;
    let live = true;
    void loadTmy(meta).then((year) => {
      if (!live || year) return; // landed: the cache's own subscription ticked the store
      const latest = projectRef.current;
      if (!latest?.location || latest.location.tmy?.blobId !== blobId) return;
      patch({ location: { ...latest.location, tmy: undefined } }, false);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobId]);
}
