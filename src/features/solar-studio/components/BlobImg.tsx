// ─── BlobImg: <img> whose source lives in the IndexedDB blob store ──────────
import type { CSSProperties } from 'react';
import { useImage } from '../lib/persistence/useImage';

/**
 * Renders a stored capture/cover image by blob id. While loading (or when the
 * blob is missing — e.g. a share opened in a different browser) it renders a
 * neutral placeholder box of the same footprint so print/layout stay stable.
 */
export function BlobImg({
  blobId,
  alt,
  style,
  placeholderHeight = 110,
}: {
  blobId: string | null | undefined;
  alt: string;
  style?: CSSProperties;
  placeholderHeight?: number;
}) {
  const src = useImage(blobId);
  if (!src) {
    return (
      <div
        aria-label={`${alt} (image unavailable)`}
        style={{
          height: placeholderHeight,
          borderRadius: 8,
          background: 'var(--paper-3)',
          ...style,
        }}
      />
    );
  }
  return <img src={src} alt={alt} style={style} />;
}
