// ─── Pick halo: an unlit translucent box around a picked or hovered object ──
// The one selection language for everything that is not a module: brass for
// the pick, sky-blue for the hover. Never raycast (it must not steal its own
// object's clicks) and never tone-mapped (the colour is a UI colour, not light).
export const PICK_COLOR = '#ffc766';
export const HOVER_COLOR = '#b8dcff';

export function PickHalo({
  center,
  size,
  rotationY = 0,
  picked,
}: {
  center: [number, number, number];
  size: [number, number, number];
  rotationY?: number;
  picked: boolean;
}) {
  return (
    <mesh position={center} rotation={[0, rotationY, 0]} raycast={() => null} renderOrder={3}>
      <boxGeometry args={size} />
      <meshBasicMaterial
        color={picked ? PICK_COLOR : HOVER_COLOR}
        transparent
        opacity={picked ? 0.32 : 0.22}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
