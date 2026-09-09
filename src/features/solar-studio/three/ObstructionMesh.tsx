// ─── Obstruction meshes: per-type primitives / GLB assets ───────────────────
// Visual meshes are decorative; solar access still uses engineering proxies
// from lib/scene-model.ts so heavy GLB detail never slows calculations.
//
// GLB LOADING IS LAZY. The bundled obstruction models total ~169 MB — a
// module-scope useGLTF.preload chain used to fetch ALL of them the moment any
// screen imported the 3D scene, even for projects with zero obstructions.
// Models now stream on demand: the first render of a type suspends into its
// procedural fallback (AssetBoundary) while the GLB downloads, and
// useWarmObstructionAssets() prefetches only the types the CURRENT project
// actually contains.
import { Clone, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  Component,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import type { Group, Object3D } from 'three';
import type { Obstruction, ObstructionType } from '../types';
import { castsAnalyticalShadow } from '../lib/capabilities';
import { fnv1a } from '../lib/hash';
import { useReducedMotion } from './useReducedMotion';

/**
 * Renders `children`, but if the GLB asset fails to load (404 / corrupt), falls
 * back to the procedural mesh instead of crashing the whole 3D scene. Suspense
 * alone can't do this — a rejected loader THROWS, which only an error boundary
 * catches. Wraps Suspense so both the loading and the error paths show the same
 * procedural fallback.
 *
 * `plain` is the third way in: the scene's plain-models switch. It returns the
 * fallback WITHOUT EVER MOUNTING the child, so the GLB is not requested at all —
 * not fetched, not parsed, not uploaded. A toggle that still downloaded the
 * model and merely hid it would miss the entire point.
 */
export class AssetBoundary extends Component<
  { fallback: ReactNode; children: ReactNode; plain?: boolean },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.props.plain || this.state.failed) return this.props.fallback;
    return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>;
  }
}

const TREE_MODEL_URL = '/models/obstructions/tree/tree.glb';
const WINDMILL_MODEL_URL = '/models/obstructions/windmill/windmill.glb';
const TANK_MODEL_URL = '/models/obstructions/tank/tank.glb';
const CHIMNEY_MODEL_URL = '/models/obstructions/chimney/chimney.glb';
const DISH_MODEL_URL = '/models/obstructions/dish/dish.glb';
const SOLAR_WH_MODEL_URL = '/models/obstructions/solar-wh/solar-wh.glb';
const TURBINE_VENT_MODEL_URL = '/models/obstructions/turbine-vent/turbine-vent.glb';

/** GLB per obstruction type — types without a model use procedural meshes.
 *  windmill.glb is not shipped yet; keep it un-prefetched (404). */
const MODEL_BY_TYPE: Partial<Record<ObstructionType, string>> = {
  tree: TREE_MODEL_URL,
  tank: TANK_MODEL_URL,
  chimney: CHIMNEY_MODEL_URL,
  dish: DISH_MODEL_URL,
  solar_wh: SOLAR_WH_MODEL_URL,
  turbine_vent: TURBINE_VENT_MODEL_URL,
};

/**
 * Prefetch ONLY the models the current project needs, once the 3D scene is
 * actually mounted. Everything else stays un-downloaded.
 */
export function useWarmObstructionAssets(types: ObstructionType[], plain = false): void {
  const key = [...new Set(types)].sort().join(',');
  useEffect(() => {
    // In plain mode nothing will ever mount a GLB, so warming one would fetch
    // and parse a model the scene has already decided not to draw — the exact
    // cost the switch exists to avoid.
    if (plain) return;
    for (const t of key.split(',')) {
      const url = MODEL_BY_TYPE[t as ObstructionType];
      if (url) useGLTF.preload(url);
    }
  }, [key, plain]);
}

/**
 * A GLB placed so its LOWEST POINT rests on the parent origin, whatever the
 * asset's own origin happens to be.
 *
 * Every model here is documented as "1 m tall, origin at base". `tree.glb` was
 * not: its geometry sits half a height above its origin, so scaling it to a
 * 17 m tree lifted the trunk 8.5 m into the air. Measured in the running
 * scene — treeBottomY was 8.4988 with the group correctly at 0 — after a
 * static read of the file's accessors said otherwise and sent me the wrong way.
 *
 * So this measures the real bounding box after scaling instead of trusting the
 * authoring convention. Any asset that is re-exported, swapped, or added later
 * is grounded by construction rather than by a promise in a comment.
 */
function GroundedClone({
  object,
  scale,
  caster,
}: {
  object: Object3D;
  scale: [number, number, number];
  caster: { shadowCaster: boolean };
}) {
  const inner = useRef<Group>(null);
  const [dy, setDy] = useState(0);
  const scaleKey = scale.join(',');

  useLayoutEffect(() => {
    const g = inner.current;
    if (!g) return;
    g.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(g);
    // the inner group carries no offset of its own, so its min.y IS the
    // asset's base relative to where we are about to place it
    if (Number.isFinite(box.min.y)) setDy(-box.min.y);
  }, [object, scaleKey]);

  return (
    <group position={[0, dy, 0]}>
      <group ref={inner}>
        <Clone
          object={object}
          scale={scale}
          castShadow={caster.shadowCaster}
          receiveShadow
          userData={caster}
        />
      </group>
    </group>
  );
}

/**
 * The same GLB scene with its own copy of the materials, tinted.
 *
 * `<Clone>` shares the source materials by reference, so writing a colour onto
 * one would repaint every tree in the project. drei's `deep="materialsOnly"`
 * looks like the answer and is not: it re-clones inside the render body, so the
 * very next re-render (GroundedClone's `setDy` guarantees one) throws away the
 * tinted material and puts a fresh white one back. Measured — all four trees
 * came out with distinct material uuids and colour `ffffff`.
 *
 * So the copy is made ONCE, here, memoised on the scene and the colour, the way
 * `WindmillAsset` below already clones to name its rotor. Geometry and textures
 * stay shared — `Object3D.clone` copies the graph, not the buffers — so the
 * cost of a tinted tree is one extra material, not another 46k triangles.
 *
 * `multiply`, not `copy`: the tint is a filter over whatever albedo the asset
 * ships, so a model authored with a non-white base factor keeps it.
 */
function useTintedScene(scene: Object3D, tint: THREE.Color): Object3D {
  const built = useMemo(() => {
    const root = scene.clone(true);
    const mats: THREE.Material[] = [];
    const tinted = (m: THREE.Material) => {
      const c = m.clone();
      if ('color' in c) (c as THREE.MeshStandardMaterial).color.multiply(tint);
      mats.push(c);
      return c;
    };
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(tinted)
        : tinted(mesh.material);
    });
    return { root, mats };
  }, [scene, tint]);

  // the clones are ours, so freeing them is ours too — r3f only disposes what
  // it created itself
  useEffect(() => {
    const { mats } = built;
    return () => {
      for (const m of mats) m.dispose();
    };
  }, [built]);

  return built.root;
}

const BUILDING_TINTS = ['#8d8579', '#9a9287', '#7f7a70'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Each GLB below was generated then resized to exactly 1m tall (origin at base),
// so scaleY = heightM directly. Footprint refs are each model's measured X/Z bbox
// extent at that 1m height — scaling by targetFootprint/ref hits the obstruction's
// actual length/width/diameter regardless of the source mesh's own proportions.
function glbScale(
  targetX: number,
  targetZ: number,
  heightM: number,
  refX: number,
  refZ: number
): [number, number, number] {
  return [Math.max(0.05, targetX / refX), Math.max(0.05, heightM), Math.max(0.05, targetZ / refZ)];
}

export function ObstructionMesh({
  o,
  baseY,
  plain,
}: {
  o: Obstruction;
  baseY: number;
  /**
   * Draw the primitive instead of the photoreal model, and skip its download.
   *
   * Five of the eleven obstruction types ship no GLB at all (building,
   * elevated, ladder, other, windmill), so the realistic scene is already a
   * MIXTURE — a photogrammetry water tank next to a grey box for a ladder.
   * Plain mode is the coherent half of that: every prop reads as the massing
   * block it is, which is also what you want when you are judging what shades
   * what rather than looking at the picture.
   */
  plain?: boolean;
}) {
  // same predicate the shading engine uses — visual and analytic can't drift
  const castsShade = castsAnalyticalShadow(o);
  const caster = { shadowCaster: castsShade };
  const rotY = (-o.rotationDeg * Math.PI) / 180;
  const r =
    o.shape === 'circle' ? o.diameterM / 2 : Math.max(0.2, Math.min(o.lengthM, o.widthM) / 2);

  switch (o.type) {
    case 'tank':
      return (
        <group position={[o.center.x, baseY, -o.center.y]} rotation={[0, rotY, 0]}>
          <AssetBoundary plain={plain} fallback={<ProceduralTank r={r} heightM={o.heightM} caster={caster} />}>
            <TankAsset o={o} caster={caster} fallback={{ r, heightM: o.heightM }} />
          </AssetBoundary>
        </group>
      );

    case 'tree': {
      const trunkH = Math.max(0.6, o.heightM * 0.4);
      const crownR = Math.max(0.5, Math.max(r, (o.heightM - trunkH) * 0.55));
      // the boundary's fallback is what plain mode draws AND what the loading
      // and 404 paths draw, so it takes the same character as the model would
      const tint = treeCharacter(o.id).tint;
      return (
        <group position={[o.center.x, baseY, -o.center.y]} rotation={[0, rotY, 0]}>
          <AssetBoundary
            plain={plain}
            fallback={
              <ProceduralTree trunkH={trunkH} crownR={crownR} caster={caster} tint={tint} />
            }
          >
            <TreeAsset o={o} caster={caster} fallback={{ trunkH, crownR }} />
          </AssetBoundary>
        </group>
      );
    }

    case 'building': {
      const tint = BUILDING_TINTS[hashStr(o.id) % BUILDING_TINTS.length];
      return (
        <mesh
          position={[o.center.x, baseY + o.heightM / 2, -o.center.y]}
          rotation={[0, rotY, 0]}
          castShadow
          receiveShadow
          userData={caster}
        >
          {o.shape === 'circle' ? (
            <cylinderGeometry args={[r, r, o.heightM, 20]} />
          ) : (
            <boxGeometry args={[o.lengthM, o.heightM, o.widthM]} />
          )}
          <meshStandardMaterial color={tint} roughness={0.95} />
        </mesh>
      );
    }

    case 'chimney':
      return (
        <group position={[o.center.x, baseY, -o.center.y]} rotation={[0, rotY, 0]}>
          <AssetBoundary plain={plain} fallback={<ProceduralChimney o={o} r={r} caster={caster} />}>
            <ChimneyAsset o={o} caster={caster} fallback={{ r }} />
          </AssetBoundary>
        </group>
      );

    case 'dish': {
      const dishR = Math.max(0.4, r);
      return (
        <group position={[o.center.x, baseY, -o.center.y]} rotation={[0, rotY, 0]}>
          <AssetBoundary plain={plain} fallback={<ProceduralDish heightM={o.heightM} dishR={dishR} caster={caster} />}>
            <DishAsset o={o} caster={caster} fallback={{ heightM: o.heightM, dishR }} />
          </AssetBoundary>
        </group>
      );
    }

    case 'solar_wh':
      return (
        <group position={[o.center.x, baseY, -o.center.y]} rotation={[0, rotY, 0]}>
          <AssetBoundary plain={plain} fallback={<ProceduralSolarWH o={o} r={r} caster={caster} />}>
            <SolarWhAsset o={o} caster={caster} fallback={{ r }} />
          </AssetBoundary>
        </group>
      );

    case 'windmill':
      // windmill.glb is not shipped yet — render the procedural mesh directly so
      // we never fetch a 404 (which the dev overlay would surface even though the
      // AssetBoundary catches it). Swap back to <WindmillAsset> once the asset lands.
      return (
        <group position={[o.center.x, baseY, -o.center.y]} rotation={[0, rotY, 0]}>
          <ProceduralWindmill heightM={o.heightM} radiusM={r} caster={caster} />
        </group>
      );

    case 'turbine_vent':
      return (
        <group position={[o.center.x, baseY, -o.center.y]} rotation={[0, rotY, 0]}>
          <AssetBoundary plain={plain} fallback={<ProceduralTurbineVent o={o} r={r} caster={caster} />}>
            <TurbineVentAsset o={o} caster={caster} fallback={{ r }} />
          </AssetBoundary>
        </group>
      );

    default:
      return (
        <mesh
          position={[o.center.x, baseY + o.heightM / 2, -o.center.y]}
          rotation={[0, rotY, 0]}
          castShadow
          receiveShadow
          userData={caster}
        >
          {o.shape === 'circle' ? (
            <cylinderGeometry args={[r, r, o.heightM, 20]} />
          ) : (
            <boxGeometry args={[o.lengthM, o.heightM, o.widthM]} />
          )}
          <meshStandardMaterial color="#7d8590" roughness={0.85} />
        </mesh>
      );
  }
}

function ProceduralWindmill({
  heightM,
  radiusM,
  caster,
}: {
  heightM: number;
  radiusM: number;
  caster: { shadowCaster: boolean };
}) {
  const rotorRef = useRef<Group>(null);
  const reduced = useReducedMotion();
  useFrame((_, delta) => {
    if (reduced || !rotorRef.current) return;
    rotorRef.current.rotation.z += delta * 4.2;
  });
  const towerH = Math.max(0.8, heightM * 0.86);
  const rotorR = Math.max(0.35, radiusM * 0.8);
  return (
    <>
      <mesh position={[0, towerH / 2, 0]} castShadow receiveShadow userData={caster}>
        <cylinderGeometry args={[0.055, 0.09, towerH, 12]} />
        <meshStandardMaterial color="#d7dce2" metalness={0.45} roughness={0.48} />
      </mesh>
      <group position={[0, towerH, -0.08]}>
        <mesh castShadow userData={caster}>
          <boxGeometry args={[0.32, 0.22, 0.28]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.42} />
        </mesh>
        <group ref={rotorRef} position={[0, 0, -0.2]}>
          <mesh castShadow userData={caster}>
            <sphereGeometry args={[0.09, 16, 10]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.35} roughness={0.4} />
          </mesh>
          {[0, 120, 240].map((deg) => (
            <mesh
              key={deg}
              position={[
                Math.cos((deg * Math.PI) / 180) * rotorR * 0.45,
                Math.sin((deg * Math.PI) / 180) * rotorR * 0.45,
                -0.04,
              ]}
              rotation={[0, 0, (deg * Math.PI) / 180]}
              castShadow={false}
            >
              <boxGeometry args={[rotorR, 0.045, 0.025]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.5} />
            </mesh>
          ))}
        </group>
      </group>
    </>
  );
}

const CROWN_LOWER = new THREE.Color('#2f6b3a');
const CROWN_UPPER = new THREE.Color('#3a7d46');

function ProceduralTree({
  trunkH,
  crownR,
  caster,
  tint,
}: {
  trunkH: number;
  crownR: number;
  caster: { shadowCaster: boolean };
  /**
   * The same per-instance foliage multiplier the GLB gets, so a plain-mode
   * canopy is not a row of identical green balls either. Only the CROWN takes
   * it — the trunk stays the one brown, because a green-shifted trunk reads as
   * a bug rather than as a species. Deliberately nothing else varies here: in
   * plain mode these are massing blocks for judging what shades what, and a
   * block whose size wandered would be worse than a stamped one.
   */
  tint?: THREE.Color;
}) {
  const lower = useMemo(
    () => (tint ? CROWN_LOWER.clone().multiply(tint) : CROWN_LOWER),
    [tint],
  );
  const upper = useMemo(
    () => (tint ? CROWN_UPPER.clone().multiply(tint) : CROWN_UPPER),
    [tint],
  );
  return (
    <>
      <mesh position={[0, trunkH / 2, 0]} castShadow userData={caster}>
        <cylinderGeometry
          args={[Math.max(0.08, crownR * 0.14), Math.max(0.1, crownR * 0.2), trunkH, 10]}
        />
        <meshStandardMaterial color="#6b4a2f" roughness={0.95} />
      </mesh>
      <mesh position={[0, trunkH + crownR * 0.55, 0]} castShadow userData={caster}>
        <sphereGeometry args={[crownR, 18, 14]} />
        <meshStandardMaterial color={lower} roughness={0.9} />
      </mesh>
      <mesh position={[0, trunkH + crownR * 1.25, 0]} castShadow userData={caster}>
        <sphereGeometry args={[crownR * 0.66, 16, 12]} />
        <meshStandardMaterial color={upper} roughness={0.9} />
      </mesh>
    </>
  );
}

function ProceduralTank({
  r,
  heightM,
  caster,
}: {
  r: number;
  heightM: number;
  caster: { shadowCaster: boolean };
}) {
  return (
    <>
      <mesh position={[0, heightM / 2, 0]} castShadow receiveShadow userData={caster}>
        <cylinderGeometry args={[r, r, heightM, 24]} />
        <meshStandardMaterial color="#e9e7e2" roughness={0.5} />
      </mesh>
      {/* lid disc */}
      <mesh position={[0, heightM + 0.035, 0]} castShadow userData={caster}>
        <cylinderGeometry args={[r * 1.05, r * 1.05, 0.07, 24]} />
        <meshStandardMaterial color="#f6f4f0" roughness={0.45} />
      </mesh>
    </>
  );
}

function ProceduralChimney({
  o,
  r,
  caster,
}: {
  o: Obstruction;
  r: number;
  caster: { shadowCaster: boolean };
}) {
  return (
    <mesh position={[0, o.heightM / 2, 0]} castShadow receiveShadow userData={caster}>
      {o.shape === 'circle' ? (
        <cylinderGeometry args={[r, r, o.heightM, 16]} />
      ) : (
        <boxGeometry args={[o.lengthM, o.heightM, o.widthM]} />
      )}
      <meshStandardMaterial color="#9c8877" roughness={0.9} />
    </mesh>
  );
}

function ProceduralDish({
  heightM,
  dishR,
  caster,
}: {
  heightM: number;
  dishR: number;
  caster: { shadowCaster: boolean };
}) {
  return (
    <>
      <mesh position={[0, heightM * 0.3, 0]} castShadow userData={caster}>
        <cylinderGeometry args={[0.05, 0.05, heightM * 0.6, 10]} />
        <meshStandardMaterial color="#8b9096" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* flattened sphere = dish face */}
      <mesh
        position={[0, heightM * 0.7, 0]}
        rotation={[-0.6, 0, 0]}
        scale={[1, 0.32, 1]}
        castShadow
        userData={caster}
      >
        <sphereGeometry args={[dishR, 20, 14]} />
        <meshStandardMaterial color="#dcdfe3" roughness={0.5} metalness={0.2} />
      </mesh>
    </>
  );
}

function ProceduralSolarWH({
  o,
  r,
  caster,
}: {
  o: Obstruction;
  r: number;
  caster: { shadowCaster: boolean };
}) {
  return (
    <mesh position={[0, o.heightM / 2, 0]} castShadow receiveShadow userData={caster}>
      {o.shape === 'circle' ? (
        <cylinderGeometry args={[r, r, o.heightM, 20]} />
      ) : (
        <boxGeometry args={[o.lengthM, o.heightM, o.widthM]} />
      )}
      <meshStandardMaterial color="#7d8590" roughness={0.85} />
    </mesh>
  );
}

function ProceduralTurbineVent({
  o,
  r,
  caster,
}: {
  o: Obstruction;
  r: number;
  caster: { shadowCaster: boolean };
}) {
  const rotorRef = useRef<Group>(null);
  const reduced = useReducedMotion();
  useFrame((_, delta) => {
    if (reduced || !rotorRef.current) return;
    rotorRef.current.rotation.y += delta * 3.5;
  });
  const baseH = Math.max(0.06, o.heightM * 0.22);
  const domeR = Math.max(0.12, r);
  return (
    <>
      <mesh position={[0, baseH / 2, 0]} castShadow receiveShadow userData={caster}>
        <cylinderGeometry args={[domeR * 0.75, domeR * 0.85, baseH, 16]} />
        <meshStandardMaterial color="#9aa0a6" metalness={0.5} roughness={0.5} />
      </mesh>
      <group ref={rotorRef} position={[0, baseH + domeR * 0.65, 0]}>
        <mesh castShadow userData={caster}>
          <sphereGeometry args={[domeR * 0.55, 14, 10]} />
          <meshStandardMaterial color="#c7cbd1" metalness={0.4} roughness={0.4} />
        </mesh>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <mesh key={deg} rotation={[0, (deg * Math.PI) / 180, 0]} castShadow userData={caster}>
            <boxGeometry args={[0.012, domeR * 1.15, domeR * 0.7]} />
            <meshStandardMaterial color="#e2e5e9" roughness={0.5} metalness={0.3} />
          </mesh>
        ))}
      </group>
    </>
  );
}

// Measured bbox of tree.glb. Unlike the Meshy-normalised models this one keeps
// its natural authored scale (so the height ref isn't 1) AND its origin sits at
// the bbox CENTRE, not the base — despite the comment that used to claim
// otherwise. Uncompensated, that buried every tree to half its height: a 17 m
// tree rendered 8.5 m into the ground, showing as a crown sitting on the soil.
// `minY` is what the renderer lifts by. Verified against the asset by
// obstruction-assets.test.ts so a re-export cannot silently reintroduce it.
// x/z/y are the model's measured extents, used to hit a target footprint and
// height. There is deliberately NO hand-entered origin offset here: grounding
// is measured from the real bounding box at runtime by GroundedClone, because
// a constant read statically out of the GLB got the sign wrong once already and
// lifted every tree by half its height.
const TREE_REF = { x: 1.2623, y: 1.89677, z: 1.21922 };

// ─── Per-instance tree character ────────────────────────────────────────────
// One tree.glb serves coconut, neem, banyan and gulmohar alike. Real species
// meshes are the honest fix and they need 3D art, not code — that is item 15's
// problem, not this one. Until they exist, this stops five copies of the same
// mesh reading as five copies of the same mesh.
//
// The clone-army tell is three things, and only one of them is the model:
//   · every tree faced the same way          → a hashed yaw
//   · every tree stood perfectly plumb       → a small permanent lean
//   · every tree swayed in exact lockstep    → a hashed phase and rate
// Foliage colour on top of that, because a neem is not a gulmohar green.
//
// WHAT IT MAY NOT VARY: height and footprint. A surveyor typed those, the
// shading engine builds its bounding solid from them (`lib/scene-model.ts`
// approximates an obstruction by a full-height box or cylinder), and CLAUDE.md
// says the picture and the model agree. Jittering the size would make the tree
// on screen disagree with the tree in the kWh — so every value below is
// something nobody measured and the engine never reads.
//
// Keyed on the obstruction's own id, the way `soilTint` is keyed on the panel's
// (`three/PanelsInstanced.tsx`): a tree keeps its own character across reloads,
// camera moves and re-renders. `Math.random()` here would re-roll every tree on
// every remount, which reads as a glitch rather than as variety.
type TreeCharacter = {
  /** radians of yaw ON TOP of the rotation the user set — a tree has no front */
  yaw: number;
  /** permanent lean off plumb, radians */
  leanX: number;
  leanZ: number;
  /** head start on the sway, radians */
  phaseX: number;
  phaseZ: number;
  /** sway speed multiplier — a heavier crown answers the wind more slowly */
  rate: number;
  /** foliage multiplier: cool blue-green through to warm yellow-green */
  tint: THREE.Color;
};

/** ~2.9° — visible as character, small enough that no tree looks storm-damaged */
export const TREE_LEAN_MAX = 0.05;

const treeCharCache = new Map<string, TreeCharacter>();

/** 0..1 from an id and a salt, so each trait gets its own independent stream */
function unitOf(id: string, salt: string): number {
  return (fnv1a(id + salt) % 10000) / 10000;
}

export function treeCharacter(id: string): TreeCharacter {
  const hit = treeCharCache.get(id);
  if (hit) return hit;
  const lum = 0.84 + 0.26 * unitOf(id, ':lum'); // 0.84 .. 1.10
  const warm = unitOf(id, ':warm'); // 0 = cool/blue-green, 1 = warm/yellow-green
  const ch: TreeCharacter = {
    yaw: unitOf(id, ':yaw') * Math.PI * 2,
    leanX: (unitOf(id, ':leanx') - 0.5) * 2 * TREE_LEAN_MAX,
    leanZ: (unitOf(id, ':leanz') - 0.5) * 2 * TREE_LEAN_MAX,
    phaseX: unitOf(id, ':phx') * Math.PI * 2,
    phaseZ: unitOf(id, ':phz') * Math.PI * 2,
    rate: 0.72 + unitOf(id, ':rate') * 0.56, // 0.72 .. 1.28
    tint: new THREE.Color(lum * (0.9 + 0.2 * warm), lum, lum * (1.06 - 0.22 * warm)),
  };
  treeCharCache.set(id, ch);
  return ch;
}

/** rad/s of the sway's slower axis; the other runs at 0.83× so they never repeat */
const SWAY_RATE = 0.6;
const SWAY_Z = 0.02;
const SWAY_X = 0.015;

function TreeAsset({
  o,
  caster,
  fallback,
}: {
  o: Obstruction;
  caster: { shadowCaster: boolean };
  fallback: { trunkH: number; crownR: number };
}) {
  const gltf = useGLTF(TREE_MODEL_URL);
  const swayRef = useRef<Group>(null);
  const t = useRef(0);
  const ch = useMemo(() => treeCharacter(o.id), [o.id]);
  const reduced = useReducedMotion();
  const foliage = useTintedScene(gltf.scene, ch.tint);

  // The lean is the tree's resting pose, so it is set outside the frame loop:
  // with reduced motion on, the loop never runs and this is the whole answer.
  useLayoutEffect(() => {
    const g = swayRef.current;
    if (!g) return;
    g.rotation.x = ch.leanX;
    g.rotation.z = ch.leanZ;
  }, [ch, reduced]);

  useFrame((_, delta) => {
    const g = swayRef.current;
    if (reduced || !g) return;
    t.current += delta;
    // sway rides ON TOP of the lean, so a tree returns to its own rest pose
    g.rotation.z = ch.leanZ + Math.sin(t.current * SWAY_RATE * ch.rate + ch.phaseZ) * SWAY_Z;
    g.rotation.x =
      ch.leanX + Math.sin(t.current * SWAY_RATE * 0.83 * ch.rate + ch.phaseX) * SWAY_X;
  });

  const footprintM = o.shape === 'circle' ? o.diameterM : Math.max(o.lengthM, o.widthM);
  const scaleX = Math.max(0.05, footprintM / TREE_REF.x);
  const scaleZ = Math.max(0.05, footprintM / TREE_REF.z);
  const scaleY = Math.max(0.05, o.heightM / TREE_REF.y);
  return gltf.scene ? (
    // yaw is static character; the inner group is the one that leans and sways,
    // and it rotates about the BASE, which is where GroundedClone puts the model
    <group rotation={[0, ch.yaw, 0]}>
      <group ref={swayRef}>
        <GroundedClone object={foliage} scale={[scaleX, scaleY, scaleZ]} caster={caster} />
      </group>
    </group>
  ) : (
    <ProceduralTree
      trunkH={fallback.trunkH}
      crownR={fallback.crownR}
      caster={caster}
      tint={ch.tint}
    />
  );
}


// Single coherent model (tower+nacelle+blades generated together as one real,
// grounded object — far more reliable with Meshy than asking for a disconnected
// "floating hub+blades" part, which produced disconnected/malformed geometry
// twice in a row). The blade geometry is split out and named 'rotor' via a
// local gltf-transform post-process script, so it can still be found and
// spun independently at runtime.
//
// PARKED, NOT DEAD: windmill.glb is not shipped yet, so the switch at the top of
// this file renders ProceduralWindmill instead. Keep this until the asset lands.
// eslint-disable-next-line unused-imports/no-unused-vars
function WindmillAsset({
  o,
  caster,
  fallback,
}: {
  o: Obstruction;
  caster: { shadowCaster: boolean };
  fallback: { heightM: number; radiusM: number };
}) {
  const rotorRef = useRef<Object3D | null>(null);
  const reduced = useReducedMotion();
  const gltf = useGLTF(WINDMILL_MODEL_URL);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    clone.traverse((obj) => {
      obj.castShadow = caster.shadowCaster;
      obj.receiveShadow = true;
      obj.userData = { ...obj.userData, ...caster };
    });
    rotorRef.current =
      clone.getObjectByName('rotor_hub') ??
      clone.getObjectByName('rotor') ??
      clone.getObjectByName('blades') ??
      null;
    return clone;
  }, [caster, gltf.scene]);
  useFrame((_, delta) => {
    if (reduced || !rotorRef.current) return;
    rotorRef.current.rotation.z += delta * 4.2;
  });
  const footprintM = o.shape === 'circle' ? o.diameterM : Math.max(o.lengthM, o.widthM);
  const scale = glbScale(footprintM, footprintM, o.heightM, WINDMILL_REF.x, WINDMILL_REF.z);
  return gltf.scene ? (
    <primitive object={scene} scale={scale} />
  ) : (
    <ProceduralWindmill
      heightM={fallback.heightM}
      radiusM={fallback.radiusM}
      caster={caster}
    />
  );
}

// windmill.glb is not shipped yet — the AssetBoundary shows ProceduralWindmill
// instead, so don't eagerly preload a 404. Restore this when the asset lands.
// useGLTF.preload(WINDMILL_MODEL_URL);

// Measured bbox extent (X, Z) of each GLB at its normalized 1m height.
//
// These are the divisor that turns a surveyed length into a mesh scale, so a
// stale number here draws every prop of that type the wrong size.
// three/__tests__/obstruction-assets.test.ts asserts each one against the actual
// POSITION accessor bounds in the .glb, which is why the 2026-09-09 decimation
// pass rescales each mesh back onto its authored box instead of moving these
// numbers — see scripts/decimate-glb.mjs.
const TANK_REF = { x: 0.73888, z: 0.73929 };
const CHIMNEY_REF = { x: 0.89661, z: 0.76548 };
const DISH_REF = { x: 0.62657, z: 0.60935 };
const SOLAR_WH_REF = { x: 2.18336, z: 2.33074 };
const TURBINE_VENT_REF = { x: 1.05162, z: 1.05168 };
const WINDMILL_REF = { x: 1, z: 1 }; // placeholder — updated after regeneration

function TankAsset({
  o,
  caster,
  fallback,
}: {
  o: Obstruction;
  caster: { shadowCaster: boolean };
  fallback: { r: number; heightM: number };
}) {
  const gltf = useGLTF(TANK_MODEL_URL);
  // Per axis, NOT one square from the smaller side. This used to be
  // `Math.min(lengthM, widthM)` fed to both axes, so a surveyed 3.0 × 1.5 m
  // tank drew as 1.5 × 1.5 m — the picture contradicting the dimension the
  // surveyor typed, and the footprint the shading engine actually uses.
  // ChimneyAsset below has always done it this way.
  const targetX = o.shape === 'circle' ? o.diameterM : o.lengthM;
  const targetZ = o.shape === 'circle' ? o.diameterM : o.widthM;
  const scale = glbScale(targetX, targetZ, o.heightM, TANK_REF.x, TANK_REF.z);
  return gltf.scene ? (
    <Clone object={gltf.scene} scale={scale} castShadow={caster.shadowCaster} receiveShadow userData={caster} />
  ) : (
    <ProceduralTank r={fallback.r} heightM={fallback.heightM} caster={caster} />
  );
}


function ChimneyAsset({
  o,
  caster,
  fallback,
}: {
  o: Obstruction;
  caster: { shadowCaster: boolean };
  fallback: { r: number };
}) {
  const gltf = useGLTF(CHIMNEY_MODEL_URL);
  const targetX = o.shape === 'circle' ? o.diameterM : o.lengthM;
  const targetZ = o.shape === 'circle' ? o.diameterM : o.widthM;
  const scale = glbScale(targetX, targetZ, o.heightM, CHIMNEY_REF.x, CHIMNEY_REF.z);
  return gltf.scene ? (
    <Clone object={gltf.scene} scale={scale} castShadow={caster.shadowCaster} receiveShadow userData={caster} />
  ) : (
    <ProceduralChimney o={o} r={fallback.r} caster={caster} />
  );
}


function DishAsset({
  o,
  caster,
  fallback,
}: {
  o: Obstruction;
  caster: { shadowCaster: boolean };
  fallback: { heightM: number; dishR: number };
}) {
  const gltf = useGLTF(DISH_MODEL_URL);
  // same square-footprint bug as the tank had: a rectangular dish drew from its
  // smaller side on both axes
  const targetX = o.shape === 'circle' ? o.diameterM : o.lengthM;
  const targetZ = o.shape === 'circle' ? o.diameterM : o.widthM;
  const scale = glbScale(targetX, targetZ, o.heightM, DISH_REF.x, DISH_REF.z);
  return gltf.scene ? (
    <Clone object={gltf.scene} scale={scale} castShadow={caster.shadowCaster} receiveShadow userData={caster} />
  ) : (
    <ProceduralDish heightM={fallback.heightM} dishR={fallback.dishR} caster={caster} />
  );
}


function SolarWhAsset({
  o,
  caster,
  fallback,
}: {
  o: Obstruction;
  caster: { shadowCaster: boolean };
  fallback: { r: number };
}) {
  const gltf = useGLTF(SOLAR_WH_MODEL_URL);
  const targetX = o.shape === 'circle' ? o.diameterM : o.lengthM;
  const targetZ = o.shape === 'circle' ? o.diameterM : o.widthM;
  const scale = glbScale(targetX, targetZ, o.heightM, SOLAR_WH_REF.x, SOLAR_WH_REF.z);
  return gltf.scene ? (
    <Clone object={gltf.scene} scale={scale} castShadow={caster.shadowCaster} receiveShadow userData={caster} />
  ) : (
    <ProceduralSolarWH o={o} r={fallback.r} caster={caster} />
  );
}


function TurbineVentAsset({
  o,
  caster,
  fallback,
}: {
  o: Obstruction;
  caster: { shadowCaster: boolean };
  fallback: { r: number };
}) {
  const gltf = useGLTF(TURBINE_VENT_MODEL_URL);
  const targetX = o.shape === 'circle' ? o.diameterM : o.lengthM;
  const targetZ = o.shape === 'circle' ? o.diameterM : o.widthM;
  const scale = glbScale(targetX, targetZ, o.heightM, TURBINE_VENT_REF.x, TURBINE_VENT_REF.z);
  // NOT ANIMATED, and it cannot be. A `<group ref={rotorRef}>` used to wrap the
  // whole <Clone> and turn it on Y at 3.5 rad/s — about 200°/s — so the base,
  // the kerb and the flashing spun with the cowl. This asset is a SINGLE mesh
  // ("Mesh_0", one material), so there is no rotor node to turn on its own; the
  // procedural fallback below models the parts separately and spins correctly.
  // A still vent is honest. A spinning kerb is the sort of thing that makes an
  // engineer distrust everything else in the frame.
  return gltf.scene ? (
    <Clone object={gltf.scene} scale={scale} castShadow={caster.shadowCaster} receiveShadow userData={caster} />
  ) : (
    <ProceduralTurbineVent o={o} r={fallback.r} caster={caster} />
  );
}

