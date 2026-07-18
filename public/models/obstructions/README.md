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
- Prefer PBR materials with reasonable texture sizes, ideally 1K or 2K.
- If the model includes animation, keep animation clips named clearly, for example `gentle_wind_sway` or `rotor_spin`.

## App Integration Notes

The visual model can be scaled from obstruction dimensions:

- `lengthM` controls X size.
- `widthM` or `diameterM` controls Z size.
- `heightM` controls Y size.
- `rotationDeg` controls Y-axis rotation.

Solar calculations should continue to use the app's engineering shadow proxy geometry, not the detailed GLB mesh.
