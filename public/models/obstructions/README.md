# Obstruction 3D Models

Store obstruction assets here as `.glb` files for use in Solar Studio.

## Folder Structure

- `tree/`
- `tank/`
- `dish/`
- `chimney/`
- `elevated/`
- `building/`
- `solar-wh/`
- `ladder/`
- `windmill/`
- `other/`

## Recommended Naming

Use lowercase, hyphen-separated names:

- `tree/realistic-tree-v1.glb`
- `windmill/rooftop-windmill-v1.glb`
- `solar-wh/solar-water-heater-v1.glb`

## Model Rules

- Use `.glb` as the primary format.
- Use real-world scale in meters.
- Use Y-up orientation.
- Put the model origin at the center of the base footprint.
- Keep the bottom of the model on `Y=0`.
- Do not include cameras, lights, sky, ground, or environment objects.
- Keep meshes clean and optimized for browser rendering.
- **Decimate before committing.** Run `node scripts/decimate-glb.mjs` — add the new
  prop to its `BUDGET` map first. Raw photogrammetry scans are far too heavy: the
  six props here originally shipped as 4.77 MILLION triangles and 169 MB for
  objects that draw a couple of hundred pixels wide, and the pass cut that to
  38 MB with no visible change. Budget a few thousand triangles per prop; the
  detail belongs in the texture.
- The script rescales each decimated mesh back onto its **authored bounding box**,
  so the 1 m height, the `Y=0` base and the X/Z footprint above all survive it.
  `src/features/solar-studio/three/ObstructionMesh.tsx` divides a surveyed length
  by that footprint, and `three/__tests__/obstruction-assets.test.ts` asserts it —
  a model that does not match its `*_REF` fails the suite.
- Prefer PBR materials with reasonable texture sizes, ideally 1K or 2K.
  After decimation the textures ARE the remaining weight (about 32 of the 38 MB).
- If the model includes animation, keep animation clips named clearly, for example `gentle_wind_sway` or `rotor_spin`.

## App Integration Notes

The visual model can be scaled from obstruction dimensions:

- `lengthM` controls X size.
- `widthM` or `diameterM` controls Z size.
- `heightM` controls Y size.
- `rotationDeg` controls Y-axis rotation.

Solar calculations should continue to use the app's engineering shadow proxy geometry, not the detailed GLB mesh.
