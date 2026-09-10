// ─── Google Maps JS API loader (script tag, no extra deps) ─────────────────

/**
 * The app's REFERENCE satellite zoom — the sharpest tile Static Maps serves,
 * and the one every consumer that converts tile pixels back to metres is
 * pinned to, so the pair can never drift. It lives here, with the functions it
 * is always passed to, rather than in the canvas component: reaching into
 * React for a constant put lib/ underneath the UI.
 *
 * It is NOT the only zoom fetched. A tile at this zoom spans ~90 m, which is
 * narrower than a C&I shed, so anything that must cover a whole site — the 2D
 * canvas, the 3D ground — steps back through `zoomCovering` instead.
 */
export const SAT_ZOOM = 20;

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

/**
 * Static satellite tile URL for a lat/lng (used as canvas bg / 3D texture).
 *
 * `format=png32` is NOT optional. Static Maps defaults to png8 — a 256-colour
 * palette — and satellite imagery is continuous-tone, so the default posterises
 * a roof into flat blotches and dithered noise that reads as "broken pixels"
 * long before any upscaling is involved. png32 is 24-bit + alpha, the same
 * format every mature design tool asks for. It costs nothing extra in quota.
 */
export function staticSatelliteUrl(
  lat: number,
  lng: number,
  zoom = SAT_ZOOM,
  sizePx = 640,
  scale: 1 | 2 = 1,
): string {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${sizePx}x${sizePx}&scale=${scale}&maptype=satellite&format=png32&key=${key ?? ''}`;
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
 * The sharpest zoom whose static map still covers `neededM` metres of ground
 * at this latitude. One tile at zoom 20 spans only ~70 m in the mid-latitudes
 * — barely wider than a building — so anything that must fill the scene's
 * ground has to step back until the picture is big enough.
 */
export function zoomCovering(lat: number, neededM: number, sizePx = 640, maxZoom = 20, minZoom = 14): number {
  for (let z = maxZoom; z > minZoom; z--) {
    if (metersPerStaticMap(lat, z, sizePx) >= neededM) return z;
  }
  return minZoom;
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
