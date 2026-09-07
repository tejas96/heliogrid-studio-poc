// ─── What the 3D scene currently has selected ───────────────────────────────
//
// This lives in its own leaf file, not in Scene3D.tsx, because Scene3D renders
// <ElectricalOverlay> and the overlay needs this type — defining it in Scene3D
// made the two files import each other. Nothing else belongs here: the type has
// no dependencies, so every scene component can reach it without pulling a
// component in behind it.

/** The one thing the user has picked in the 3D scene, if any. */
export type ScenePick = {
  kind:
    | 'obstruction'
    | 'inverter'
    | 'battery'
    | 'box'
    | 'roof'
    | 'table'
    | 'string'
    | 'route'
    | 'panel';
  id: string;
};
