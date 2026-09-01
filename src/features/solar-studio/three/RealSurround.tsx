// ─── Real surround: Google Photorealistic 3D Tiles around the site ───────────
// The neighbours, trees, roads and terrain are streamed as Google's real
// photogrammetry mesh (Map Tiles API, 3D Tiles), re-oriented so the project
// pin sits at the scene origin with +Y up — the same frame the design uses
// (x east, −z north). Nothing here is invented: if Google has no mesh for a
// place, nothing is drawn and the flat aerial photo underneath stays.
//
// Two adjustments make the real world and the modelled site agree:
//   1. HEIGHT — the tileset is placed at ellipsoid height 0, but the ground at
//      the pin is hundreds of metres above that. Once tiles load, a ray is cast
//      down at the origin and the tileset is re-centred so that ground = y 0,
//      the level the design's roofs are measured from.
//   2. CUT-OUT — the mesh already contains the site's own building. Fragments
//      inside the roofs' footprint box are clipped so the modelled building
//      (with the real design on it) stands in its place instead of z-fighting
//      with a photo of itself.
//
// Driven imperatively (the documented three.js path) rather than through the
// package's r3f wrapper: the wrapper never handed our camera a resolution, so
// the tile tree never traversed.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { TilesRenderer } from '3d-tiles-renderer/three';
import {
  GoogleCloudAuthPlugin,
  GLTFExtensionsPlugin,
  ReorientationPlugin,
  TileCompressionPlugin,
  TilesFadePlugin,
} from '3d-tiles-renderer/plugins';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { Project } from '../types';

const ROOT_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';
/**
 * The Elevation API answers in metres above MEAN SEA LEVEL (EGM96); the tiles
 * live on the WGS84 ELLIPSOID. Over India the geoid sits roughly 50–90 m below
 * the ellipsoid, so a first guess subtracts a mid value; the raycast against the
 * loaded mesh then settles the exact ground under the pin.
 */
const GEOID_OFFSET_INDIA_M = 65;
/** tree depth of the first coarse probe tile (Google's tree: ~depth 12 ≈ a few km) */
const PROBE_DEPTH = 13;

async function fetchSiteElevation(lat: number, lng: number): Promise<number | null> {
  try {
    const res = await fetch(`/api/site/elevation?lat=${lat.toFixed(7)}&lng=${lng.toFixed(7)}`);
    const body = (await res.json()) as { status: string; elevationM?: number };
    return body.status === 'ok' && typeof body.elevationM === 'number' ? body.elevationM : null;
  } catch {
    return null;
  }
}
/** Google-hosted Draco decoders (the tiles' glTFs are Draco-compressed) */
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
/** the aerial photo is an exposed picture, not an albedo — same scale as the ground plane */
const PHOTO_ALBEDO = new THREE.Color('#7a7a7a');

/** Clip fragments INSIDE the roofs' footprint box (with a margin), in scene metres. */
function cutoutPlanes(project: Project, marginM = 0.6): THREE.Plane[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const r of project.roofs) {
    for (const p of r.polygon) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return [];
  minX -= marginM;
  maxX += marginM;
  minY -= marginM;
  maxY += marginM;
  // scene z = −plan y. With clipIntersection, a fragment is clipped only when it
  // is on the negative side of EVERY plane — i.e. inside the box.
  const zMin = -maxY;
  const zMax = -minY;
  return [
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), minX), // x > minX  →  −x + minX < 0
    new THREE.Plane(new THREE.Vector3(1, 0, 0), -maxX), // x < maxX  →  x − maxX < 0
    new THREE.Plane(new THREE.Vector3(0, 0, -1), zMin), // z > zMin
    new THREE.Plane(new THREE.Vector3(0, 0, 1), -zMax), // z < zMax
  ];
}

export function RealSurround({
  project,
  onStatus,
  onAttribution,
}: {
  project: Project;
  /** 'loading' → 'ready' once the ground under the pin is measured; 'none' if nothing loads */
  onStatus?: (s: 'loading' | 'ready' | 'none') => void;
  /** Google's required data attribution for the tiles on screen (changes as tiles stream) */
  onAttribution?: (text: string) => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  const loc = project.location;
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const tilesRef = useRef<TilesRenderer | null>(null);
  const planes = useMemo(() => cutoutPlanes(project), [project.roofs]); // eslint-disable-line react-hooks/exhaustive-deps
  const planesRef = useRef(planes);
  planesRef.current = planes;
  // once planes change, re-clip the models already loaded
  useEffect(() => {
    tilesRef.current?.forEachLoadedModel((s) => {
      s.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && 'clippingPlanes' in m) m.clippingPlanes = planes;
      });
    });
  }, [planes]);

  const lat = loc?.latLng.lat ?? 0;
  const lng = loc?.latLng.lng ?? 0;

  useEffect(() => {
    if (!loc || !apiKey) return;
    onStatus?.('loading');
    let disposed = false;
    let tiles: TilesRenderer | null = null;
    let dracoLoader: DRACOLoader | null = null;
    let cleanupEvents: (() => void) | null = null;

    // The ground's real height comes first: with the tileset parked at
    // ellipsoid height 0 the camera would sit hundreds of metres UNDER the
    // terrain, no fine tile would ever enter the view, and nothing would load.
    void (async () => {
      const msl = await fetchSiteElevation(lat, lng);
      if (disposed) return;
      let groundH = msl === null ? 0 : msl - GEOID_OFFSET_INDIA_M;
      // No elevation service on this key: probe with a COARSE tile first. The
      // coarse tiles' boxes are tall enough to hold an underground camera, so a
      // depth-limited traversal shows one, a ray finds the terrain on it, and
      // only then does the fine tree get walked.
      let probing = msl === null;
      let probeDepth = PROBE_DEPTH;
      let probeMisses = 0;

      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(DRACO_PATH);

      tiles = new TilesRenderer(ROOT_URL);
      tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
      tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }));
      tiles.registerPlugin(new TileCompressionPlugin());
      tiles.registerPlugin(new TilesFadePlugin({ fadeDuration: 350 }));
      const reorient = new ReorientationPlugin({
        lat: (lat * Math.PI) / 180,
        lon: (lng * Math.PI) / 180,
        height: groundH,
        up: '+y',
        recenter: true,
      });
      tiles.registerPlugin(reorient);
      tiles.errorTarget = 8;
      if (probing) tiles.maxDepth = probeDepth;
      tiles.setCamera(camera);
      tiles.setResolutionFromRenderer(camera, gl);
      tiles.group.name = 'real-surround';
      scene.add(tiles.group);
      tilesRef.current = tiles;
      if (process.env.NODE_ENV !== 'production') {
        (window as unknown as { __tiles?: TilesRenderer | null }).__tiles = tiles;
      }
      const t = tiles;

    // every loaded tile model: photo texture as a lit surface that takes and
    // casts shadows, and the site footprint cut out
    const onLoadModel = ({ scene: s }: { scene: THREE.Object3D }) => {
      s.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshBasicMaterial;
        const mat = new THREE.MeshStandardMaterial({
          map: src.map ?? null,
          color: PHOTO_ALBEDO,
          roughness: 1,
          metalness: 0,
          envMapIntensity: 0.15,
          clippingPlanes: planesRef.current,
          clipIntersection: true,
        });
        mesh.material = mat;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.shadowCaster = false; // the analytical engine has its own casters
      });
      invalidate();
    };
    const onLoadError = (e: { url: string | URL; error: Error }) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[real-surround] tile failed', String(e.url).slice(0, 90), e.error?.message ?? e.error);
      }
    };

      // HEIGHT: measure the real ground under the pin and re-centre on it. The
      // guess above is within the geoid's slack; the mesh settles the rest.
      let measured = 0;
      const ray = new THREE.Raycaster();
      const onLoadEnd = () => {
        // Google's terms: show the data attribution of what is on screen
        const attr = t
          .getAttributions()
          .map((a) => String(a.value ?? ''))
          .filter(Boolean);
        onAttribution?.(attr.join(' · '));
        if (measured >= 8) return;
        ray.set(new THREE.Vector3(0, 3000, 0), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(t.group, true);
        if (hits.length === 0) {
          // still probing and the coarse tile missed the pin: go one level coarser
          if (probing && ++probeMisses >= 2 && probeDepth > 8) {
            probeDepth--;
            probeMisses = 0;
            t.maxDepth = probeDepth;
            invalidate();
          }
          return;
        }
        const h = hits[0].point.y;
        if (probing) {
          // first real ground: lift the tileset onto it and open the fine tree
          probing = false;
          t.maxDepth = Infinity;
        } else if (Math.abs(h) < 0.15) {
          measured = 8;
          onStatus?.('ready');
          return;
        }
        groundH += h;
        measured++;
        reorient.transformLatLonHeightToOrigin((lat * Math.PI) / 180, (lng * Math.PI) / 180, groundH);
        onStatus?.('ready');
        invalidate();
      };
      t.addEventListener('load-model', onLoadModel as never);
      t.addEventListener('load-error', onLoadError as never);
      t.addEventListener('tiles-load-end', onLoadEnd);
      cleanupEvents = () => {
        t.removeEventListener('load-model', onLoadModel as never);
        t.removeEventListener('load-error', onLoadError as never);
        t.removeEventListener('tiles-load-end', onLoadEnd);
      };
    })();

    return () => {
      disposed = true;
      cleanupEvents?.();
      if (tiles) {
        scene.remove(tiles.group);
        tiles.dispose();
      }
      dracoLoader?.dispose();
      tilesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, lat, lng, camera, gl, scene]);

  // the traversal runs every frame against the live camera
  useFrame(() => {
    const t = tilesRef.current;
    if (!t) return;
    camera.updateMatrixWorld();
    t.setResolutionFromRenderer(camera, gl);
    t.update();
  });

  return null;
}
