import type {
  BuildingInstance,
  BuildingType,
  BuildingWaterStatus,
  Cell,
  CellGrowthDiagnostics,
  FieldSet,
  GameMetrics,
  MissionGoal,
  NurseryJob,
  NurseryWorker,
  PipeCell,
  PipeSource,
  PipeSourceType,
  PlantingZone,
  PlantingZoneCellState,
  PlantingZoneSummary,
  PlacementResult,
  PlacementTool,
  PressureLevel,
  RestorationParcel,
  RestorationParcelBounds,
  RobotRole,
  RobotWorker,
  RobotTask,
  RobotTaskResources,
  RobotTaskState,
  RobotTaskTarget,
  RobotTaskType,
  ScanZone,
  ScanZoneSummary,
  SeedType,
  SelectedTarget,
  TerrainType,
  TutorialHint,
  TutorialStep,
  UnlockObjective,
} from './types';

export interface GameEvents {
  onToast?: (message: string) => void;
  onStateChanged?: () => void;
}

export interface WorkerTarget {
  zoneId: number;
  seed: SeedType;
  index: number;
  x: number;
  y: number;
}

export interface ScanTarget {
  zoneId: number;
  index: number;
  x: number;
  y: number;
}

export interface SimulationContext {
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
  robotHouseWorkers: RobotWorker[];
  restorationParcels: RestorationParcel[];
  logs: string[];
  readonly events: GameEvents;
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

  reset(): void;
  loadDemo(): void;
  update(deltaSeconds: number): void;
  setSpeed(speed: number): void;
  selectTool(tool: PlacementTool): void;
  selectBuilding(id: number): void;
  selectPipe(gx: number, gy: number): void;
  selectCell(index: number): void;
  clearSelection(): void;
  placeSelected(gx: number, gy: number): PlacementResult;
  validateSelected(gx: number, gy: number): PlacementResult;
  validateBuildingPlacement(type: BuildingType, gx: number, gy: number): PlacementResult;
  validateSeedPlacement(seed: SeedType, gx: number, gy: number): PlacementResult;
  validateSeedPlacementForInventory(seed: SeedType, gx: number, gy: number, availableSeeds: number): PlacementResult;
  placeBuilding(type: BuildingType, gx: number, gy: number): PlacementResult;
  plantSeed(seed: SeedType, gx: number, gy: number): PlacementResult;
  harvestSelectedTreeForWood(): boolean;
  removeSelectedBuilding(): boolean;
  startCultivation(seed: SeedType, targetCount?: number): PlacementResult;
  startResearch(seed: SeedType, soil: TerrainType): PlacementResult;
  startSeedSearch(): PlacementResult;
  cancelNurseryJob(): boolean;
  validatePipeClick(gx: number, gy: number): PlacementResult;
  handlePipeToolClick(gx: number, gy: number): PlacementResult;
  getPipePreview(gx: number, gy: number): { ok: boolean; message: string; path: Array<{ x: number; y: number }> };
  createOutletAtSelectedPipe(): boolean;
  toggleSelectedOutlet(): boolean;
  removeSelectedOutlet(): boolean;
  removeSelectedPipeSegment(): boolean;
  clearPipeNetwork(sourceType: PipeSourceType, sourceId: number): boolean;
  validateScanZone(gx: number, gy: number): PlacementResult;
  createScanZone(gx: number, gy: number): PlacementResult;
  getScanZoneCells(gx: number, gy: number): number[];
  getScanZoneDuration(cellCount: number): number;
  getScanZoneSummaries(): ScanZoneSummary[];
  isScanCellQueued(index: number): boolean;
  validatePlantingZonePaint(gx: number, gy: number): PlacementResult;
  paintPlantingZone(gx: number, gy: number): PlacementResult;
  getPlantingZoneSummaries(): PlantingZoneSummary[];
  getPlantingZoneCellState(zone: PlantingZone, index: number): PlantingZoneCellState;
  getPlantingZoneAt(index: number): PlantingZone | null;
  togglePlantingZone(id: number): boolean;
  clearPlantingZone(id: number): boolean;
  validateRestorationParcelClick(gx: number, gy: number): PlacementResult;
  handleRestorationParcelClick(gx: number, gy: number): PlacementResult;
  selectRestorationParcelTool(homeBuildingId: number): PlacementResult;
  assignRestorationParcel(homeBuildingId: number, bounds: RestorationParcelBounds): PlacementResult;
  getRestorationParcelForHouse(homeBuildingId: number): RestorationParcel | null;
  getRestorationParcelCells(parcel: RestorationParcel): number[];
  getRestorationParcelPreviewCells(gx: number, gy: number): number[];
  updateRestorationParcels(dt: number): void;
  syncRestorationTasks(desiredIds: Set<string>): void;
  getRestorationTaskBlockedReason(task: RobotTask): string | null;
  chooseRestorationSeedForIndex(parcel: RestorationParcel, index: number): SeedType | null;
  transferSeedToRobotHouse(homeBuildingId: number, seed: SeedType): PlacementResult;
  transferWaterToRobotHouse(homeBuildingId: number): PlacementResult;
  prepareSoilAt(homeBuildingId: number, index: number): PlacementResult;
  plantSeedFromRobotHouse(homeBuildingId: number, seed: SeedType, gx: number, gy: number): PlacementResult;
  waterPlantFromRobotHouse(homeBuildingId: number, index: number): PlacementResult;
  getSelectedBuilding(): BuildingInstance | null;
  getSelectedPipe(): PipeCell | null;
  getSelectedCell(): { cell: Cell; index: number; x: number; y: number } | null;
  getPipeCell(gx: number, gy: number): PipeCell | null;
  getPipeSourceBuilding(source?: PipeSource | PipeCell | null): BuildingInstance | null;
  getPipeSourceMaxLength(source?: PipeSource | PipeCell | null): number;
  isBuildingUnlocked(type: BuildingType): boolean;
  getUnlockedBuildingTypes(): BuildingType[];
  isPipeUnlocked(): boolean;
  canAffordBuilding(type: BuildingType): boolean;
  getBuildingUnavailableReason(type: BuildingType): string | null;
  availableBuilding(type: BuildingType): number;
  getBuildingCooldown(type: BuildingType): number;
  totalBuilding(type: BuildingType): number;
  isSeedUnlocked(type: SeedType): boolean;
  getUnlockedSeedTypes(): SeedType[];
  seedCount(type: SeedType): number;
  getDiscoveredSoils(): TerrainType[];
  getResearchableSoils(): TerrainType[];
  hasNursery(): boolean;
  getMetrics(): GameMetrics;
  getBuildingWaterStatus(building: BuildingInstance): BuildingWaterStatus | null;
  getPipeAnchorPoint(source?: PipeSource | null): { x: number; y: number } | null;
  getMissionGoals(): MissionGoal[];
  getUnlockObjectives(): UnlockObjective[];
  getNextHint(): TutorialHint | null;
  getCellGrowthDiagnostics(index: number): CellGrowthDiagnostics;
  getAffectedCells(type: BuildingType, gx: number, gy: number): number[];
  getBuildingStatus(building: BuildingInstance): string;
  getPressureLevelAt(gx: number, gy: number): PressureLevel;
  getPressureLabel(level: PressureLevel): string;
  getIrrigatedCells(pipe: PipeCell): number[];
  getPumpIrrigatedCells(gx: number, gy: number): number[];
  getOutletPreview(gx: number, gy: number): { level: PressureLevel; cells: number[] };
  getIrrigatedCellsForLevel(gx: number, gy: number, level: PressureLevel): number[];
  makeBuilding(type: BuildingType, gx: number, gy: number): BuildingInstance;
  updateGroundCover(cell: Cell, boost: number, dt: number): void;
  updateTree(index: number, boost: number, dt: number): void;
  tryNaturalSeeding(parentIndex: number): void;
  advanceNurseryJob(dt: number): void;
  tryStartNurseryCycle(job: NurseryJob): boolean;
  pauseNurseryJob(job: NurseryJob, reason: string): void;
  completeNurseryCycle(job: NurseryJob): void;
  plantSeedAt(seed: SeedType, gx: number, gy: number, actor: 'player' | 'worker'): PlacementResult;
  paintZoneCells(seed: SeedType, indices: number[]): boolean;
  removePlantingZoneCell(index: number): boolean;
  pruneEmptyPlantingZones(): void;
  updateNurseryWorker(dt: number): void;
  ensureNurseryWorker(nursery: BuildingInstance): NurseryWorker;
  updateRobotHouseWorkers(dt: number): void;
  ensureRobotHouseWorker(house: BuildingInstance): RobotWorker;
  wakeNurseryWorker(): void;
  setNurseryWorkerBlocked(worker: NurseryWorker, message: string): void;
  clearNurseryWorkerTask(worker: NurseryWorker): void;
  findNextWorkerTarget(worker: NurseryWorker): WorkerTarget | null;
  findNextScanTarget(worker: NurseryWorker): ScanTarget | null;
  isScanTargetQueued(zoneId: number): boolean;
  advanceScanZone(zoneId: number, dt: number): void;
  completeScanZone(zone: ScanZone): void;
  findSeedSearchTarget(): { index: number; x: number; y: number } | null;
  findNurseryWaterTarget(nursery: BuildingInstance): BuildingInstance | null;
  getWorkerIdleMessage(): string;
  shouldFetchNurseryWater(nursery: BuildingInstance): boolean;
  shouldFetchCisternWater(nursery: BuildingInstance, cistern: BuildingInstance): boolean;
  hasUsableNurseryPipe(nursery: BuildingInstance): boolean;
  isWorkerTargetQueued(seed: SeedType, index: number): boolean;
  moveWorkerToward(worker: NurseryWorker, x: number, y: number, dt: number, speed?: number): boolean;
  syncRobotTasks(): void;
  upsertRobotTask(input: {
    id: string;
    type: RobotTaskType;
    target: RobotTaskTarget;
    zoneId?: number;
    parcelId?: string;
    homeBuildingId?: number;
    seed?: SeedType;
    priority: number;
    requiredResources?: RobotTaskResources;
    allowedRoles?: RobotRole[];
    blockedReason?: string | null;
  }): RobotTask;
  getRobotTask(id: string | null | undefined): RobotTask | null;
  getRobotTaskPosition(task: RobotTask): { x: number; y: number };
  getRobotTaskBlockedReason(task: RobotTask): string | null;
  setRobotTaskState(taskId: string, state: RobotTaskState, reason?: string | null, workerId?: string | null): RobotTask | null;
  selectNextTask(worker: NurseryWorker): RobotTask | null;
  reserveTask(taskId: string, workerId: string): RobotTask | null;
  startTask(taskId: string, workerId: string): RobotTask | null;
  blockTask(taskId: string, reason: string): RobotTask | null;
  completeTask(taskId: string): RobotTask | null;
  cancelTask(taskId: string, reason?: string): RobotTask | null;
  getTaskForScanZone(zoneId: number): RobotTask | null;
  getTasksForPlantingZone(zoneId: number): RobotTask[];
  getNurseryBuilding(): BuildingInstance | null;
  getRobotHouseBuilding(homeBuildingId?: number): BuildingInstance | null;
  getPumpBuilding(): BuildingInstance | null;
  workerHome(building: BuildingInstance): { x: number; y: number };
  syncTutorialProgress(): void;
  checkMilestones(): void;
  unlockBuilding(type: BuildingType, message: string): void;
  drainCisternOutlets(dt: number): void;
  updateBuildingsFromPipes(dt: number): void;
  drainLocalIrrigation(dt: number): void;
  getCisternPipeFillRate(level: PressureLevel): number;
  getNurseryPipeFillRate(level: PressureLevel): number;
  getRobotHousePipeFillRate(level: PressureLevel): number;
  consumeSourceWater(source: PipeSource | PipeCell, amount: number): void;
  computeFields(): FieldSet;
  getWaterProduction(): number;
  getWaterConsumption(): number;
  getCisternWaterConsumption(): number;
  getPressureScore(pipe: PipeCell, extraOpenOutlets?: number): number;
  pressureLevelFromScore(score: number, previousLevel?: PressureLevel): PressureLevel;
  getOutletConsumptionRate(pipe: PipeCell): number;
  getOutletConsumptionForLevel(level: PressureLevel, open: boolean): number;
  getSourceWater(source: PipeSource | PipeCell): number;
  countBranches(sourceType: PipeSourceType, sourceId: number): number;
  getPipePathFromSource(target: PipeCell): PipeCell[];
  addPipeRoute(source: PipeSource, gx: number, gy: number): boolean;
  findPipePath(source: PipeSource, targetX: number, targetY: number): { ok: boolean; message: string; path: Array<{ x: number; y: number }> };
  getPipeTargetOptions(source: PipeSource, targetX: number, targetY: number): { ok: boolean; message: string; targets: Array<{ x: number; y: number }> };
  getPipeSourceAt(gx: number, gy: number): PipeSource | null;
  canPipeOccupy(source: PipeSource, gx: number, gy: number, allowDirectBuildingDestination?: boolean): boolean;
  canPipeEnterBuilding(source: PipeSource, building: BuildingInstance): boolean;
  pathDepth(previous: Map<string, string | null>, key: string): number;
  recomputePipeDistances(source: PipeSource): void;
  getReachablePipeKeys(source: PipeSource): Set<string>;
  isPipeFromSource(pipe: PipeCell, source: PipeSource | PipeCell): boolean;
  getCisternWaterStored(): number;
  getCisternCapacityTotal(): number;
  getNurseryWaterStored(): number;
  getNurseryCapacityTotal(): number;
  getRobotHouseWaterStored(): number;
  getRobotHouseCapacityTotal(): number;
  formatBuildingCost(type: BuildingType): string;
  addRadial(field: Float32Array, gx: number, gy: number, radius: number, amount: number): void;
  getCellsInRadius(gx: number, gy: number, radius: number): number[];
  inBounds(x: number, y: number): boolean;
  index(x: number, y: number): number;
  pipeKey(x: number, y: number): string;
  addLog(message: string): void;
  toast(message: string): void;
  notify(): void;
}
