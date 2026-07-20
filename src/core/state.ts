import { createTerrain } from './terrain';
import type {
  BuildingInstance,
  BuildingType,
  Cell,
  FieldSet,
  NurseryJob,
  NurseryWorker,
  PipeCell,
  PipeSource,
  PlantingZone,
  PlacementTool,
  RobotTask,
  ScanZone,
  SeedType,
  SelectedTarget,
  TerrainType,
  TutorialStep,
} from './types';

export interface GameState {
  cells: Cell[];
  buildings: BuildingInstance[];
  pipes: PipeCell[];
  selectedTool: PlacementTool;
  selectedTarget: SelectedTarget;
  pipeSource: PipeSource | null;
  speed: number;
  simulationTime: number;
  currentFields: FieldSet;
  waterResource: number;
  readonly maxWaterResource: number;
  woodResource: number;
  nurseryJob: NurseryJob | null;
  plantingZones: PlantingZone[];
  scanZones: ScanZone[];
  tasks: RobotTask[];
  nurseryWorker: NurseryWorker | null;
  logs: string[];
  nextBuildingId: number;
  unlockedBuildings: Set<BuildingType>;
  buildingTotals: Record<BuildingType, number>;
  buildingCooldowns: Record<BuildingType, number>;
  unlockedSeeds: Set<SeedType>;
  seedInventory: Record<SeedType, number>;
  discoveredSoils: Set<TerrainType>;
  milestones: Set<string>;
  completedTutorialSteps: Set<TutorialStep>;
  nextPlantingZoneId: number;
  nextScanZoneId: number;
}

export const createInitialCells = (): Cell[] => createTerrain();

export const createBuildingTotals = (): Record<BuildingType, number> => ({
  pump: 1,
  nursery: 1,
  cistern: 4,
});

export const createBuildingCooldowns = (): Record<BuildingType, number> => ({
  pump: 0,
  nursery: 0,
  cistern: 0,
});

export const createSeedInventory = (): Record<SeedType, number> => ({
  pioneer: 3,
  willow: 0,
  juniper: 0,
  tamarisk: 0,
});
