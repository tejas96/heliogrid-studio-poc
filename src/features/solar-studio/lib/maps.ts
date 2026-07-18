// ─── Google Maps JS API loader (script tag, no extra deps) ─────────────────
let loadPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (loadPromise) return loadPromise;
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined;
  loadPromise = new Promise((resolve, reject) => {
    if (typeof google !== 'undefined' && google.maps) {
      resolve(google);
      return;
    }
    const cb = '__solarStudioMapsReady';
    (window as unknown as Record<string, unknown>)[cb] = () =>
      resolve(google);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key ?? ''}&libraries=places&loading=async&callback=${cb}`;
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps failed to load'));
    document.head.appendChild(s);
  });
  return loadPromise;
}

/** Static satellite tile URL for a lat/lng (used as canvas bg / 3D texture). */
export function staticSatelliteUrl(
  lat: number,
  lng: number,
  zoom = 19,
  sizePx = 640,
  scale: 1 | 2 = 1,
): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${sizePx}x${sizePx}&scale=${scale}&maptype=satellite&key=${key ?? ''}`;
}

/** Ground meters covered by a static map of size px at zoom/lat. */
export function metersPerStaticMap(
  lat: number,
  zoom: number,
  sizePx: number,
): number {
  const metersPerPixel =
    (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return metersPerPixel * sizePx;
}

/**
 * Pick a round scale-bar length for the current screen px-per-meter: the
 * smallest candidate that draws at least `minPx` wide. Pure — the canvas
 * feeds it the SAME pxPerM it uses for hit-testing, so the drawn bar can
 * never disagree with the geometry (the old inline formula multiplied by a
 * spurious viewportHeight/canvasSize factor and drew ~20% short).
 */
export function pickScaleBar(
  pxPerM: number,
  minPx = 56,
  candidates: number[] = [1, 2, 5, 10, 20, 50],
): { m: number; px: number } {
  const m = candidates.find((s) => s * pxPerM > minPx) ?? candidates[candidates.length - 1];
  return { m, px: m * pxPerM };
}
