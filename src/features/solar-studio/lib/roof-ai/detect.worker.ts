// ─── Roof-detection Web Worker ───────────────────────────────────────────────
// Hosts the geotiff decode + vectorize + plane-fit pipeline off the main
// thread. geotiff (~113 KB) is imported ONLY here, so it ships solely in this
// lazily-created worker chunk — never in the main client bundle.
import { detectRoofArtifact, type DetectInput } from './pipeline';

export interface DetectWorkerResult {
  ok: boolean;
  artifact?: unknown;
  error?: string;
}

self.onmessage = async (e: MessageEvent<DetectInput>) => {
  try {
    const artifact = await detectRoofArtifact(e.data);
    (self as unknown as Worker).postMessage({ ok: true, artifact } satisfies DetectWorkerResult);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      ok: false,
      error: err instanceof Error ? err.message : 'Roof detection failed',
    } satisfies DetectWorkerResult);
  }
};
