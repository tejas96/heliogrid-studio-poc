/** Additive MMS intent. Roof, modules, tilt, height and spacing remain in their existing owners. */
export type MountStrategy = 'rcc_fixed' | 'rcc_ballast' | 'rcc_anchor' | 'low_height' | 'elevated' | 'high_height' | 'east_west' | 'south_facing' | 'adjustable' | 'obstacle_clearance' | 'trapezoidal' | 'corrugated' | 'standing_seam' | 'clamp_mounted' | 'rail_mounted' | 'purlin_mounted' | 'rafter_mounted' | 'direct_sheet' | 'industrial_custom' | 'hook_bolt' | 'ac_spreader' | 'roof_hook' | 'adjustable_hook' | 'ground_pile' | 'ground_pedestal' | 'ground_ballast' | 'ground_seasonal' | 'ground_tracker' | 'flush' | 'custom';
export type StructuralMaterial = 'galvanized_steel' | 'aluminium' | 'stainless_steel' | 'painted_steel';
export interface BallastConfig {
  type: 'precast_concrete' | 'custom';
  lengthM: number;
  widthM: number;
  heightM: number;
  massKg: number;
  blocksPerSupport: number;
  frictionCoefficient?: number;
}
export interface AnchorConfig {
  type: 'chemical' | 'mechanical' | 'cast_in';
  count: number;
  diameterMm: number;
  embedmentMm?: number;
  spacingMm: number;
  plateSizeMm: number;
  plateThicknessMm: number;
  tensileCapacityKn?: number;
  shearCapacityKn?: number;
  substrate?: string;
}
export interface MmsConfig {
  version: 1;
  strategy: MountStrategy;
  material: StructuralMaterial;
  /** Fraction of module slant length from each end; manufacturer clamp zones govern. */
  railInsetRatio: number;
  /** Flush roof attachments (existing elevated spacing remains racking.legSpacingM). */
  attachmentSpacingM: number;
  railStockLengthM: number;
  edgeClearanceM: number;
  obstacleClearanceM: number;
  ballast: BallastConfig;
  anchor: AnchorConfig;
  /** Catalogue connections remain unverified until manufacturer/site data is supplied. */
  attachmentVerified?: boolean;
}
export interface MmsEngineeringInputs {
  roofCapacityKpa?: number;
  liveLoadKpa?: number;
  snowLoadKpa?: number;
  seismicZone?: 'II' | 'III' | 'IV' | 'V';
  basicWindSpeedMs?: number;
  terrainCategory?: 1 | 2 | 3 | 4;
  riskFactorK1?: number;
  terrainHeightFactorK2?: number;
  topographyFactorK3?: number;
  importanceFactorK4?: number;
  netPressureCoefficient?: number;
  notes?: string;
}
export interface MmsFinding {
  id: string;
  status: 'pass' | 'warning' | 'error' | 'not_calculated';
  code: string;
  message: string;
  segmentId?: string;
  componentIds: string[];
}
export interface EngineeringCheck {
  key: string;
  label: string;
  status: 'not_calculated';
  reason: string;
  standard: string;
}