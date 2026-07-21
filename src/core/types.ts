export const GRID_WIDTH = 72;
export const GRID_HEIGHT = 44;
export const CELL_SIZE = 20;
export const WORLD_WIDTH = GRID_WIDTH * CELL_SIZE;
export const WORLD_HEIGHT = GRID_HEIGHT * CELL_SIZE;

export enum TerrainType {
  Sand = 0,
  Basin = 1,
  Dune = 2,
  Salt = 3,
  Rock = 4,
}

export type GroundCoverStage = 0 | 1 | 2;
export type TreeStage = 0 | 1 | 2 | 3;
export type ViewMode = 'world' | 'soil' | 'ecology';
export type BuildingType = 'pump' | 'nursery' | 'cistern' | 'robot-house';
export type SeedType = 'pioneer' | 'willow' | 'juniper' | 'tamarisk';
export type PressureLevel = 'strong' | 'medium' | 'weak' | 'none';
export type PipeSourceType = 'pump' | 'cistern';
export type RobotRole = 'nursery' | 'restoration';
export type RobotTaskType = 'scan' | 'plant' | 'water-delivery' | 'prepare_soil' | 'water_plant' | 'deliver_seeds';
export type RobotTaskState = 'available' | 'reserved' | 'in-progress' | 'blocked' | 'completed' | 'cancelled';
export interface PipeSource {
  type: PipeSourceType;
  id: number;
  anchorX?: number;
  anchorY?: number;
  anchorLabel?: string;
}
export type PlantingZoneCellState = 'ready' | 'blocked' | 'planted';
export type NurseryWorkerState =
  | 'idle'
  | 'to-target'
  | 'planting'
  | 'preparing'
  | 'watering'
  | 'returning'
  | 'to-scan'
  | 'scanning'
  | 'to-seed-search'
  | 'searching-seed'
  | 'returning-seed'
  | 'to-seed-load'
  | 'loading-seeds'
  | 'to-seed-delivery'
  | 'unloading-seeds'
  | 'returning-seeds'
  | 'to-pump'
  | 'loading-water'
  | 'to-nursery'
  | 'unloading-water'
  | 'blocked';
export type TutorialStep =
  | 'place-pump'
  | 'select-pipe'
  | 'choose-pump'
  | 'trace-pipe'
  | 'create-outlet'
  | 'open-outlet'
  | 'scan-soil'
  | 'plant-seed'
  | 'grow-tree'
  | 'harvest-wood'
  | 'build-cistern'
  | 'fill-cistern';

export type PlacementTool =
  | { kind: 'building'; type: BuildingType }
  | { kind: 'scan-zone' }
  | { kind: 'planting-zone'; mode: 'paint'; seed: SeedType }
  | { kind: 'planting-zone'; mode: 'erase' }
  | { kind: 'restoration-parcel'; homeBuildingId: number; start: { gx: number; gy: number } | null }
  | { kind: 'pipe' }
  | null;

export interface Cell {
  terrain: TerrainType;
  /** Une analyse terminée reste connue et visible dans la vue des sols. */
  revealed: boolean;
  known: boolean;
  water: number;
  shade: number;
  humus: number;
  cover: GroundCoverStage;
  coverProgress: number;
  coverStress: number;
  preparedByRobotHouseId: number | null;
  tree: SeedType | null;
  treeStage: TreeStage;
  treeProgress: number;
  treeStress: number;
  treeOrigin: 'player' | 'natural' | null;
  nextSeedAt: number;
  seedsProduced: number;
}

export interface BuildingEffects {
  resourceRate?: number;
}

export type PlacementRuleId =
  | 'not-rock'
  | 'not-salt'
  | 'not-near-building'
  | 'not-on-tree'
  | 'not-on-pipe';

export interface StorageDefinition {
  resource: 'water' | 'wood' | 'seed';
  capacity: number;
  sourceThreshold?: number;
}

export interface IrrigationDefinition {
  radius: number;
  amount: number;
  boost?: number;
  consumptionRate?: number;
}

export interface WorkerDefinition {
  role: RobotRole;
  capacity?: number;
  speedCellsPerSecond: number;
}

export interface BuildingDefinition {
  id: BuildingType;
  name: string;
  icon: string;
  radiusCells: number;
  cost: number;
  woodCost?: number;
  description: string;
  unlock: string;
  effects: BuildingEffects;
  capacity?: number;
  storage?: StorageDefinition;
  localIrrigation?: IrrigationDefinition;
  worker?: WorkerDefinition;
  placementRules?: PlacementRuleId[];
  pipeSource?: { minWater?: number; maxLength?: number };
}

export interface SeedDefinition {
  id: SeedType;
  name: string;
  icon: string;
  description: string;
  compatibleTerrains: TerrainType[];
  waterNeed: number;
  shadeNeed: number;
  humusNeed: number;
  growRate: number;
  influenceRadius: number;
  researchSoil?: TerrainType;
}

export interface BuildingInstance {
  id: number;
  type: BuildingType;
  gx: number;
  gy: number;
  placedAt: number;
  waterStored: number;
  seedInventory?: Record<SeedType, number>;
}

export interface PipeCell {
  gx: number;
  gy: number;
  sourceType: PipeSourceType;
  sourceId: number;
  distance: number;
  outlet: boolean;
  outletOpen: boolean;
  pressureLevel: PressureLevel;
}

export interface NurseryJob {
  mode: 'cultivation' | 'research';
  seed: SeedType;
  soil?: TerrainType;
  progress: number;
  duration: number;
  waterCost: number;
  targetCount?: number;
  cycleStarted: boolean;
  pausedReason: string | null;
}

export interface PlantingZone {
  id: number;
  seed: SeedType;
  cells: number[];
  active: boolean;
}

export interface PlantingZoneSummary {
  id: number;
  seed: SeedType;
  active: boolean;
  totalCells: number;
  readyCells: number;
  plantedCells: number;
  blockedCells: number;
  blockedReason?: string;
}

export interface ScanZone {
  id: number;
  gx: number;
  gy: number;
  cells: number[];
  progress: number;
  duration: number;
  active: boolean;
}

export interface ScanZoneSummary {
  id: number;
  active: boolean;
  totalCells: number;
  progress: number;
  duration: number;
  blockedReason?: string;
}

export interface RobotWorker {
  id: string;
  role: RobotRole;
  state: NurseryWorkerState;
  x: number;
  y: number;
  homeBuildingId: number | null;
  currentTaskId: string | null;
  targetIndex: number | null;
  targetSeed: SeedType | null;
  targetScanZoneId: number | null;
  targetBuildingId: number | null;
  waterLoad: number;
  seedLoad: Partial<Record<SeedType, number>>;
  progress: number;
  message: string;
}

export type NurseryWorker = RobotWorker;

export type RobotTaskTarget =
  | { kind: 'cell'; index: number; gx: number; gy: number }
  | { kind: 'zone'; gx: number; gy: number }
  | { kind: 'building'; buildingId: number; gx: number; gy: number };

export interface RobotTaskResources {
  water?: number;
  seeds?: Partial<Record<SeedType, number>>;
}

export interface RobotTask {
  id: string;
  type: RobotTaskType;
  target: RobotTaskTarget;
  zoneId?: number;
  parcelId?: string;
  homeBuildingId?: number;
  seedRequestId?: string;
  sourceBuildingId?: number;
  destinationBuildingId?: number;
  seedQuantities?: Partial<Record<SeedType, number>>;
  seed?: SeedType;
  priority: number;
  state: RobotTaskState;
  requiredResources: RobotTaskResources;
  allowedRoles: RobotRole[];
  reservedByWorkerId: string | null;
  blockedReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export type RestorationParcelState =
  | 'unassigned'
  | 'scanning'
  | 'waiting_resources'
  | 'preparing'
  | 'planting'
  | 'maintaining'
  | 'autonomous';

export type SeedSupplyState =
  | 'none'
  | 'waiting_for_seed_request'
  | 'waiting_for_seed_stock'
  | 'waiting_for_seed_assignment'
  | 'waiting_for_seed_delivery'
  | 'seeds_delivered';

export type SeedRequestStatus =
  | 'pending'
  | 'reserved'
  | 'in_delivery'
  | 'partially_delivered'
  | 'completed'
  | 'blocked'
  | 'canceled';

export interface SeedRequest {
  id: string;
  homeBuildingId: number;
  parcelId: string;
  seed: SeedType;
  quantityRequested: number;
  quantityReserved: number;
  quantityDelivered: number;
  priority: number;
  status: SeedRequestStatus;
  assignedNurseryId: number | null;
  blockedReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SeedReservation {
  id: string;
  requestId: string;
  nurseryId: number;
  seed: SeedType;
  quantity: number;
  createdAt: number;
}

export interface RestorationParcelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RestorationParcelProgress {
  analysis: number;
  preparation: number;
  planting: number;
  maintenance: number;
  biodiversity: number;
  autonomy: number;
}

export interface RestorationParcel {
  id: string;
  homeBuildingId: number;
  bounds: RestorationParcelBounds | null;
  state: RestorationParcelState;
  seedSupplyState: SeedSupplyState;
  totalTiles: number;
  analyzedTiles: number;
  preparedTiles: number;
  plantableTiles: number;
  plantedCount: number;
  vegetationCoverage: number;
  speciesPresent: number;
  healthyPlantRatio: number;
  developedTrees: number;
  seedNeeds: Partial<Record<SeedType, number>>;
  needs: string[];
  blockers: string[];
  progress: RestorationParcelProgress;
  autonomousSince: number | null;
  updatedAt: number;
}

export interface FieldSet {
  naturalWater: Float32Array;
  naturalShade: Float32Array;
  naturalHumus: Float32Array;
  irrigationWater: Float32Array;
  growthBoost: Float32Array;
}

export interface PlacementResult {
  ok: boolean;
  message: string;
}

export interface GameMetrics {
  restoredPercent: number;
  knownSoilPercent: number;
  treeCount: number;
  matureTrees: number;
  naturalTrees: number;
  waterResource: number;
  waterProduction: number;
  waterConsumption: number;
  cisternWaterConsumption: number;
  openOutlets: number;
  woodResource: number;
  cisternWater: number;
  cisternCapacity: number;
  nurseryWater: number;
  nurseryCapacity: number;
}

export interface BuildingWaterStatus {
  current: number;
  capacity: number;
  fill: number;
  label: string;
  detail: string;
}

export interface MissionGoal {
  id: string;
  label: string;
  done: boolean;
}

export interface TutorialHint {
  id: TutorialStep;
  title: string;
  body: string;
}

export interface CellGrowthDiagnostics {
  headline: string;
  tone: 'neutral' | 'good' | 'warning';
  details: string[];
  blockers: string[];
  primaryStressReason?: string;
  progressLabel?: string;
}

export interface UnlockObjective {
  id: string;
  label: string;
  reward: string;
  done: boolean;
}

export type SelectedTarget =
  | { kind: 'building'; id: number }
  | { kind: 'cell'; index: number }
  | { kind: 'pipe'; gx: number; gy: number }
  | null;

export interface GridPoint {
  x: number;
  y: number;
}
