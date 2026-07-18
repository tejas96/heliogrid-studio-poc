// ─── Client orchestration: proxy fetch → worker → validated artifact ────────
// Main-thread side of roof detection. Fetches the geometry rasters through
// our /api/solar proxy (raster URLs are key-authenticated + expire in 1 h —
// fetch immediately, never store URLs), runs the pipeline in a dedicated
// worker (terminated after each run), and validates the artifact against the
// CURRENT pin before anyone sees a ghost.
import type { LatLng } from '../../types';
import { validateArtifact, type ValidatedArtifact } from './artifact';
import type { DetectWorkerResult } from './detect.worker';

export type DetectOutcome =
  | ({ status: 'ok' } & ValidatedArtifact & { imageryDate?: string; imageryQuality?: string })
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string };

interface DataLayersEnvelope {
  status: 'ok' | 'unavailable' | 'error';
  message?: string;
  imageryDate?: string;
  imageryQuality?: string;
  layers?: { mask?: string; dsm?: string; rgb?: string };
}

const WORKER_TIMEOUT_MS = 30_000;

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`raster fetch HTTP ${res.status}`);
  return res.arrayBuffer();
}

export async function detectRoofs(pin: LatLng, radiusM = 40): Promise<DetectOutcome> {
  // 1) geometry layers via the server proxy (key never reaches the client)
  let env: DataLayersEnvelope;
  try {
    const res = await fetch(
      `/api/solar/data-layers?lat=${pin.lat.toFixed(6)}&lng=${pin.lng.toFixed(6)}&radius=${radiusM}`,
    );
    env = (await res.json()) as DataLayersEnvelope;
  } catch {
    return { status: 'error', message: 'Could not reach the detection service' };
  }
  if (env.status !== 'ok' || !env.layers?.mask || !env.layers.dsm) {
    return env.status === 'unavailable'
      ? { status: 'unavailable', message: env.message ?? 'No aerial data for this location' }
      : { status: 'error', message: env.message ?? 'Aerial data request failed' };
  }

  // 2) rasters NOW (upstream URLs expire) — in parallel
  let maskBuffer: ArrayBuffer;
  let dsmBuffer: ArrayBuffer;
  try {
    [maskBuffer, dsmBuffer] = await Promise.all([
      fetchBuffer(env.layers.mask),
      fetchBuffer(env.layers.dsm),
    ]);
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'Raster download failed',
    };
  }

  // 3) pipeline in a throwaway worker (transfer, don't copy)
  const raw = await new Promise<DetectWorkerResult>((resolve) => {
    const worker = new Worker(new URL('./detect.worker.ts', import.meta.url));
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ ok: false, error: 'Roof detection timed out' });
    }, WORKER_TIMEOUT_MS);
    worker.onmessage = (e: MessageEvent<DetectWorkerResult>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      resolve({ ok: false, error: 'Roof detection crashed' });
    };
    worker.postMessage(
      {
        maskBuffer,
        dsmBuffer,
        pin,
        imageryDate: env.imageryDate,
        imageryQuality: env.imageryQuality,
        generatedAt: Date.now(),
      },
      [maskBuffer, dsmBuffer],
    );
  });
  if (!raw.ok) return { status: 'error', message: raw.error ?? 'Roof detection failed' };

  // 4) the ONLY doorway: staged validation against the current pin
  const validated = validateArtifact(raw.artifact, pin);
  if (!validated.ok) return { status: 'error', message: validated.error };
  return {
    status: 'ok',
    ...validated,
    imageryDate: env.imageryDate,
    imageryQuality: env.imageryQuality,
  };
}
