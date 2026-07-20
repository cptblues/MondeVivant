import { installSimulationSystems } from './systems';
import { createBuildingCooldowns, createBuildingTotals, createInitialCells, createSeedInventory } from './state';
import type { GameEvents, SimulationContext } from './simulationContext';
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
  ScanZone,
  SeedType,
  SelectedTarget,
  TerrainType,
  TutorialStep,
} from './types';

export class GameSimulation {
  public cells: Cell[] = createInitialCells();
  public buildings: BuildingInstance[] = [];
  public pipes: PipeCell[] = [];
  public selectedTool: PlacementTool = { kind: 'building', type: 'pump' };
  public selectedTarget: SelectedTarget = null;
  public pipeSource: PipeSource | null = null;
  public speed = 1;
  public simulationTime = 0;
  public currentFields: FieldSet;
  public waterResource = 18;
  public readonly maxWaterResource = 100;
  public woodResource = 0;
  public nurseryJob: NurseryJob | null = null;
  public plantingZones: PlantingZone[] = [];
  public scanZones: ScanZone[] = [];
  public nurseryWorker: NurseryWorker | null = null;
  public logs: string[] = [];

  public nextBuildingId = 1;
  public unlockedBuildings = new Set<BuildingType>(['pump']);
  public buildingTotals: Record<BuildingType, number> = createBuildingTotals();
  public buildingCooldowns: Record<BuildingType, number> = createBuildingCooldowns();
  public unlockedSeeds = new Set<SeedType>(['pioneer']);
  public seedInventory: Record<SeedType, number> = createSeedInventory();
  public discoveredSoils = new Set<TerrainType>();
  public milestones = new Set<string>();
  public completedTutorialSteps = new Set<TutorialStep>();
  public nextPlantingZoneId = 1;
  public nextScanZoneId = 1;

  constructor(public readonly events: GameEvents = {}) {
    this.currentFields = this.computeFields();
    this.addLog('Installez la pompe, tracez un tuyau et ouvrez une sortie pour humidifier le sol.');
  }
}

export interface GameSimulation extends SimulationContext {}

installSimulationSystems(GameSimulation.prototype);
