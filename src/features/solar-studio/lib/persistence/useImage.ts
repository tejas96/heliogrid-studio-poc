// ─── useImage: resolve a blob-store id to a renderable data URL ─────────────
import { useEffect, useState } from 'react';
import { getImage, peekImage } from './blobs';

/**
 * Resolve an IndexedDB image id to a data URL for <img src>. Returns null
 * while loading (or when the id is null/missing). Cache-warm ids resolve on
 * first render — no flicker on remounts.
 */
export function useImage(blobId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (blobId ? peekImage(blobId) : null));
  useEffect(() => {
    if (!blobId) {
      setUrl(null);
      return;
    }
    const cached = peekImage(blobId);
    if (cached) {
      setUrl(cached);
      return;
    }
    // cold id: clear the PREVIOUS image immediately — never show picture A
    // labeled as picture B while B loads; a read failure resolves to null
    // (placeholder) instead of an unhandled rejection
    setUrl(null);
    let mounted = true;
    getImage(blobId)
      .then((d) => {
        if (mounted) setUrl(d);
      })
      .catch(() => {
        if (mounted) setUrl(null);
      });
    return () => {
      mounted = false;
    };
  }, [blobId]);
  return url;
}
