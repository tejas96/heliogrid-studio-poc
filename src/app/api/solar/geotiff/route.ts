// ─── GeoTIFF download relay ──────────────────────────────────────────────────
// dataLayers raster URLs are key-authenticated — fetching them client-side
// would expose the server key. This relay appends the key server-side and
// streams the bytes through. SSRF guard: ONLY the exact Google Solar geoTiff
// endpoint is relayable; anything else is rejected before any fetch happens.
import { serverSolarKey } from '../key';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_PREFIX = 'https://solar.googleapis.com/v1/geoTiff:get';
const TIMEOUT_MS = 20_000; // rasters are ~1 MB; generous but bounded

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const src = searchParams.get('src') ?? '';
  if (!src.startsWith(ALLOWED_PREFIX)) {
    return new Response('Only Google Solar geoTiff URLs are relayable', { status: 400 });
  }
  const key = serverSolarKey();
  if (!key) return new Response('No Solar API key configured', { status: 503 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const upstream = await fetch(`${src}&key=${key}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!upstream.ok) {
      // upstream URLs expire after ~1 h — surface that as a client-retryable 410
      return new Response(`geoTiff upstream HTTP ${upstream.status}`, {
        status: upstream.status === 404 ? 410 : 502,
      });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/tiff',
        // the underlying imagery for a coordinate is stable — cache the bytes
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return new Response(aborted ? 'geoTiff relay timed out' : 'geoTiff relay failed', {
      status: 504,
    });
  } finally {
    clearTimeout(timer);
  }
}
