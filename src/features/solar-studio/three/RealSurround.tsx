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
import { setTerrainSampler } from './terrain-probe';
import { loadSurroundHeights, peekSurroundHeights } from '../lib/surround';
import { surroundHeightAt, type SurroundHeights } from '../lib/surround-geometry';

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

/**
 * Points to read the ground at: 5 m outside each roof corner and edge
 * midpoint. The pin itself sits on the building, and in Google's mesh that is
 * the building's ROOF — measuring there put the plinth in the ground.
 */
/**
 * Which of the candidate points really are ground. In a dense downtown the
 * ring outside the footprint lands on the neighbours' ROOFS, and a tileset
 * lifted onto a 60 m tower roof puts the street 60 m under the model. The
 * aerial height map (lib/surround) says which cells are at grade: keep those;
 * when too few of the ring's points are, walk rings further out until three
 * are found. Without a height map the ring is all there is.
 */
function groundPoints(
  project: Project,
  ring: { x: number; y: number }[],
  grid: SurroundHeights | null,
): { x: number; y: number }[] {
  if (!grid) return ring;
  const atGrade = (q: { x: number; y: number }) => {
    const h = surroundHeightAt(grid, q);
    return h !== null && h < 0.5;
  };
  const keep = ring.filter(atGrade);
  if (keep.length >= 3) return keep;
  // centre and reach of everything traced, then rings 6…40 m outside it
  const pts = project.roofs.flatMap((r) => r.polygon);
  if (pts.length === 0) return ring;
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const reach = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  for (const extra of [6, 12, 20, 30, 40]) {
    const rad = reach + extra;
    for (let deg = 0; deg < 360; deg += 12) {
      const a = (deg * Math.PI) / 180;
      const q = { x: cx + Math.sin(a) * rad, y: cy + Math.cos(a) * rad };
      if (atGrade(q)) keep.push(q);
    }
    if (keep.length >= 3) return keep;
  }
  return keep.length >= 3 ? keep : ring;
}

/** Tiles with a geometric error at or above this are coarse: a block's average, not its streets. */
const FINE_TILE_ERROR_M = 6;
/** Street samples needed before the fine-tile median is trusted. */
const MIN_STREET_SAMPLES = 200;

/**
 * The street level of the streamed mesh, read off the FINE tiles' vertices:
 * every visible vertex within 120 m of the site whose plan position the
 * height map calls grade (< 0.5 m) is a street sample; the median of those is
 * where the ground is. Null until enough fine tiles are in.
 */
function groundFromFineTiles(t: TilesRenderer, grid: SurroundHeights): { y: number | null; n: number; fine: number } {
  const ys: number[] = [];
  const v = new THREE.Vector3();
  let fine = 0;
  t.forEachLoadedModel((scene, tile) => {
    if (!t.visibleTiles.has(tile) || tile.geometricError >= FINE_TILE_ERROR_M) return;
    fine++;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const pos = mesh.geometry.getAttribute('position');
      if (!pos) return;
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < pos.count; i += 3) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
        if (Math.abs(v.x) > 120 || Math.abs(v.z) > 120) continue;
        const h = surroundHeightAt(grid, { x: v.x, y: -v.z });
        if (h !== null && h < 0.5) ys.push(v.y);
      }
    });
  });
  ys.sort((a, b) => a - b);
  return { y: ys.length >= MIN_STREET_SAMPLES ? ys[Math.floor(ys.length / 2)] : null, n: ys.length, fine };
}

/**
 * The street level WITHOUT a height map: the visible fine-tile vertices in a
 * band outside the footprint, of which the lowest sixth are the streets —
 * buildings and trees only ever raise the rest of the distribution. Null
 * until enough fine tiles are in.
 */
function groundFromFineTilesNoMap(t: TilesRenderer, project: Project): { y: number | null; n: number; fine: number } {
  const pts = project.roofs.flatMap((r) => r.polygon);
  const cx = pts.length ? pts.reduce((a, p) => a + p.x, 0) / pts.length : 0;
  const cy = pts.length ? pts.reduce((a, p) => a + p.y, 0) / pts.length : 0;
  const reach = pts.length ? Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) : 0;
  const inner = reach + 3;
  const outer = reach + 45;
  const ys: number[] = [];
  const v = new THREE.Vector3();
  let fine = 0;
  t.forEachLoadedModel((scene, tile) => {
    if (!t.visibleTiles.has(tile) || tile.geometricError >= FINE_TILE_ERROR_M) return;
    fine++;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const pos = mesh.geometry.getAttribute('position');
      if (!pos) return;
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < pos.count; i += 3) {
        v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mesh.matrixWorld);
        const d = Math.hypot(v.x - cx, -v.z - cy);
        if (d >= inner && d <= outer) ys.push(v.y);
      }
    });
  });
  ys.sort((a, b) => a - b);
  return { y: ys.length >= MIN_STREET_SAMPLES ? ys[Math.floor(ys.length * 0.15)] : null, n: ys.length, fine };
}

function groundRing(project: Project): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const roof of project.roofs) {
    const poly = roof.polygon;
    if (poly.length < 3) continue;
    const c = poly.reduce((a, p) => ({ x: a.x + p.x / poly.length, y: a.y + p.y / poly.length }), { x: 0, y: 0 });
    const push = (p: { x: number; y: number }) => {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const m = Math.hypot(dx, dy) || 1;
      out.push({ x: p.x + (dx / m) * 5, y: p.y + (dy / m) * 5 });
    };
    poly.forEach((v, i) => {
      push(v);
      const w = poly[(i + 1) % poly.length];
      push({ x: (v.x + w.x) / 2, y: (v.y + w.y) / 2 });
    });
  }
  return out;
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
  // ground samples: a ring just outside every roof footprint (plan metres)
  const ringRef = useRef<{ x: number; y: number }[]>([]);
  ringRef.current = groundRing(project);
  const projectRef = useRef(project);
  projectRef.current = project;
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
      // A second, fixed camera straight above the site: tiles refine only
      // inside a camera's view, so with the user's camera alone the site's own
      // surroundings stayed coarse whenever they looked away or zoomed in —
      // and the ground could never be read off fine tiles. This one keeps the
      // 100 m around the pin at full detail whatever the user does.
      const siteCam = new THREE.PerspectiveCamera(50, 1, 20, 3000);
      siteCam.position.set(0, 320, 0);
      siteCam.lookAt(0, 0, 0);
      siteCam.updateMatrixWorld(true);
      tiles.setCamera(siteCam);
      tiles.setResolution(siteCam, 1024, 1024);
      tiles.group.name = 'real-surround';
      // The design lives in the IMAGE frame; the tiles come in true-north
      // ENU. Turn the mesh by the calibration's north offset so a site whose
      // imagery is not north-up still has its photomesh under its roofs.
      // (The reorientation plugin owns tiles.group's own transform, so the
      // turn goes on a parent.) Same sign as every other sun/compass consumer.
      const frame = new THREE.Group();
      frame.name = 'real-surround-frame';
      frame.rotation.y = -((project.calibration?.northOffsetDeg ?? 0) * Math.PI) / 180;
      frame.add(tiles.group);
      scene.add(frame);
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
      let fineMisses = 0;
      let waitTimer: ReturnType<typeof setTimeout> | null = null;
      const ray = new THREE.Raycaster();
      const onLoadEnd = () => {
        // Google's terms: show the data attribution of what is on screen
        const attr = t
          .getAttributions()
          .map((a) => String(a.value ?? ''))
          .filter(Boolean);
        onAttribution?.(attr.join(' · '));
        if (measured >= 8) return;
        const down = new THREE.Vector3(0, -1, 0);
        // Only what is ON SCREEN counts. The renderer keeps replaced coarse
        // tiles in the graph (cached, hidden) and a Raycaster ignores
        // `visible`: over a downtown street the hidden coarse blob — the
        // block's average, tens of metres up — was the first hit, so the
        // ground "converged" on it and the streets sat 70 m under the model.
        const shown = (o: THREE.Object3D): boolean => {
          for (let n: THREE.Object3D | null = o; n && n !== t.group; n = n.parent) if (!n.visible) return false;
          return true;
        };
        const hitY = (x: number, z: number): number | null => {
          ray.set(new THREE.Vector3(x, 3000, z), down);
          const hit = ray.intersectObject(t.group, true).find((i) => shown(i.object));
          return hit ? hit.point.y : null;
        };
        // coarse probe: the pin is fine (a few km per tile). Fine tree: the
        // ground is the MEDIAN of points outside the footprint that the height
        // map says are at grade — never the pin (it is on the building, and the
        // mesh building has a roof), never a neighbour's roof either.
        let h: number | null = null;
        if (!probing) {
          const prj = projectRef.current;
          let grid = peekSurroundHeights(prj.surround);
          if (!grid && prj.surround) {
            // the height map is on its way: measure when it lands, not on a roof now
            void loadSurroundHeights(prj.surround).then((g) => {
              if (!disposed && g) onLoadEnd();
            });
            return;
          }
          if (!grid) grid = null;
          let source = 'ring';
          let samples = 0;
          if (grid) {
            // The street, read off the FINE tiles' own vertices: every visible
            // vertex within 120 m whose plan position the height map calls
            // grade is a street sample. Coarse tiles are skipped — their
            // surface is the block's average, tens of metres up — and a ray
            // from above cannot tell the two apart where only a coarse tile
            // covers the ground (outside the view nothing refines).
            const fine = groundFromFineTiles(t, grid);
            samples = fine.n;
            if (fine.y !== null) {
              h = fine.y;
              source = 'fine-tiles';
            } else if (fine.fine > 0 && ++fineMisses < 6) {
              // fine tiles exist here but too few are in yet; where NONE exist
              // (no photogrammetry at this site) the ring on the terrain is right
              // not enough fine tiles around the site yet: wait for the next load
              if (process.env.NODE_ENV !== 'production') {
                (window as unknown as { __surroundGround?: unknown }).__surroundGround = { measured, groundH, waiting: true, samples };
              }
              // a bounded wait: look again in a moment even if no tile event comes
              if (waitTimer) clearTimeout(waitTimer);
              waitTimer = setTimeout(() => {
                waitTimer = null;
                if (!disposed) onLoadEnd();
              }, 2500);
              return;
            }
          }
          if (!grid && h === null) {
            // no height map for this site: the streets are still the lowest
            // sixth of the fine tiles' vertices around the footprint
            const fine = groundFromFineTilesNoMap(t, prj);
            samples = fine.n;
            if (fine.y !== null) {
              h = fine.y;
              source = 'fine-tiles-lowest';
            } else if (fine.fine > 0 && ++fineMisses < 6) {
              if (process.env.NODE_ENV !== 'production') {
                (window as unknown as { __surroundGround?: unknown }).__surroundGround = { measured, groundH, waiting: true, samples };
              }
              // a bounded wait: look again in a moment even if no tile event comes
              if (waitTimer) clearTimeout(waitTimer);
              waitTimer = setTimeout(() => {
                waitTimer = null;
                if (!disposed) onLoadEnd();
              }, 2500);
              return;
            }
          }
          if (h === null) {
            const pts = groundPoints(prj, ringRef.current, grid);
            const ys = pts
              .map((q) => hitY(q.x, -q.y))
              .filter((v): v is number => v !== null)
              .sort((a, b) => a - b);
            if (ys.length >= 3) h = ys[Math.floor(ys.length / 2)];
          }
          if (process.env.NODE_ENV !== 'production') {
            (window as unknown as { __surroundGround?: unknown }).__surroundGround = { measured, groundH, grid: !!grid, source, samples, h };
          }
        }
        if (h === null) h = hitY(0, 0);
        if (h === null) {
          // still probing and the coarse tile missed the pin: go one level coarser
          if (probing && ++probeMisses >= 2 && probeDepth > 8) {
            probeDepth--;
            probeMisses = 0;
            t.maxDepth = probeDepth;
            invalidate();
          }
          return;
        }
        if (probing) {
          // first real ground: lift the tileset onto it and open the fine tree
          probing = false;
          t.maxDepth = Infinity;
        } else if (Math.abs(h) < 0.15) {
          measured = 8;
          onStatus?.('ready');
          setTerrainSampler((x, z) => hitY(x, z));
          return;
        }
        groundH += h;
        measured++;
        reorient.transformLatLonHeightToOrigin((lat * Math.PI) / 180, (lng * Math.PI) / 180, groundH);
        onStatus?.('ready');
        invalidate();
        // ground-level objects stand on the mesh: hand out a sampler
        setTerrainSampler((x, z) => hitY(x, z));
      };
      t.addEventListener('load-model', onLoadModel as never);
      t.addEventListener('load-error', onLoadError as never);
      t.addEventListener('tiles-load-end', onLoadEnd);
      cleanupEvents = () => {
        if (waitTimer) clearTimeout(waitTimer);
        t.removeEventListener('load-model', onLoadModel as never);
        t.removeEventListener('load-error', onLoadError as never);
        t.removeEventListener('tiles-load-end', onLoadEnd);
      };
    })();

    return () => {
      disposed = true;
      cleanupEvents?.();
      setTerrainSampler(null);
      if (tiles) {
        const frame = tiles.group.parent;
        if (frame && frame !== scene) scene.remove(frame);
        else scene.remove(tiles.group);
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
