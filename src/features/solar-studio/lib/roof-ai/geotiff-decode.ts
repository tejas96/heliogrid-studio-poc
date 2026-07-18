// ─── GeoTIFF decode adapter (geotiff v3, verified against real fixtures) ────
// One thin wrapper so the rest of the pipeline never touches the geotiff API
// directly — v3 changed fileDirectory access (raw ModelTransformation reads
// return undefined), but getOrigin()/getResolution() correctly derive the
// affine from ModelTransformation-only files (verified live 2026-07-16 on
// the Pune fixtures: origin = TOP-LEFT UTM corner, rows run north→south).
//
// IMPORTANT: import this module ONLY from worker/test code — geotiff must
// never enter the main client bundle (≈113 KB) and GeoTIFF.Pool must never
// be used (worker_threads bundling hazard).
import { fromArrayBuffer } from 'geotiff';
import { utmToLatLng, utmZoneFromEpsg } from './utm';
import type { LatLng } from '../../types';

export interface DecodedRaster {
  width: number;
  height: number;
  /** interleaved single-band values (mask: Uint8, dsm: Float32) */
  data: Uint8Array | Float32Array;
  epsg: number;
  /** pixel CENTER (col,row) → UTM meters [easting, northing] */
  pixelToUtm(col: number, row: number): [number, number];
  /** pixel CENTER (col,row) → WGS84 lat/lng */
  pixelToLatLng(col: number, row: number): LatLng;
}

export async function decodeGeoTiff(buffer: ArrayBuffer): Promise<DecodedRaster> {
  const tiff = await fromArrayBuffer(buffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const [ox, oy] = image.getOrigin(); // top-left corner, UTM meters
  const [rx, ryRaw] = image.getResolution();
  const ry = Math.abs(ryRaw); // rows advance southward from the top edge
  const geoKeys = (image.getGeoKeys?.() ?? {}) as { ProjectedCSTypeGeoKey?: number };
  const epsg = geoKeys.ProjectedCSTypeGeoKey ?? 0;
  const zone = utmZoneFromEpsg(epsg);
  if (!zone) {
    throw new Error(`Unsupported raster CRS EPSG:${epsg} — expected a UTM zone`);
  }

  const data = (await image.readRasters({ interleave: true })) as Uint8Array | Float32Array;
  if (data.length !== width * height) {
    throw new Error(`Raster size mismatch: ${data.length} ≠ ${width}×${height}`);
  }

  const pixelToUtm = (col: number, row: number): [number, number] => [
    ox + (col + 0.5) * rx, // +0.5 → pixel CENTER (PixelIsArea)
    oy - (row + 0.5) * ry,
  ];
  return {
    width,
    height,
    data,
    epsg,
    pixelToUtm,
    pixelToLatLng: (col, row) => {
      const [e, n] = pixelToUtm(col, row);
      return utmToLatLng(e, n, zone.zone, zone.north);
    },
  };
}
