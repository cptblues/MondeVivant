import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_ORDER, SEEDS } from './config';
import {
  CISTERN_LOCAL_IRRIGATION_CONSUMPTION,
  GROUND_COVER,
  OUTLET_CONSUMPTION,
  PRESSURE_HYSTERESIS_MARGIN,
  PRESSURE_THRESHOLDS,
  PUMP_LOCAL_IRRIGATION_CONSUMPTION,
  PUMP_WATER_RATE,
  RESEARCH_COST,
  RESEARCH_DURATION,
  RESTORATION_AUTONOMY,
  ROBOT_HOUSE_MAINTENANCE_WATER_BUFFER,
  ROBOT_HOUSE_MAX_PLANTING_SHADE,
  ROBOT_HOUSE_PLANT_DURATION,
  ROBOT_HOUSE_PLANT_WATER_BUFFER,
  ROBOT_HOUSE_PREPARE_DURATION,
  ROBOT_HOUSE_PREPARED_HUMUS,
  ROBOT_HOUSE_SEED_REQUEST_MAX_BATCH,
  ROBOT_HOUSE_WATER_PER_TASK,
  ROBOT_HOUSE_WATERING_AMOUNT,
  ROBOT_TASK_PRIORITIES,
  SIMULATION_STEP,
  TREE_GROWTH_STAGE_FACTORS,
} from './gameConfig';
import { GameSimulation } from './GameSimulation';
import { TerrainType } from './types';
import type { BuildingType, PipeCell } from './types';

function advance(simulation: GameSimulation, seconds: number): void {
  const steps = Math.ceil(seconds / SIMULATION_STEP);
  for (let i = 0; i < steps; i += 1) simulation.update(Math.min(SIMULATION_STEP, seconds - i * SIMULATION_STEP));
}

function placeBuilding(simulation: GameSimulation, type: BuildingType, gx: number, gy: number): void {
  const result = simulation.placeBuilding(type, gx, gy);
  expect(result.ok, result.message).toBe(true);
}

function preparePumpAndNursery(): GameSimulation {
  const simulation = new GameSimulation();
  placeBuilding(simulation, 'pump', 15, 25);
  placeBuilding(simulation, 'nursery', 20, 25);
  return simulation;
}

function preparePumpAndRobotHouse(): { simulation: GameSimulation; houseId: number } {
  const simulation = new GameSimulation();
  placeBuilding(simulation, 'pump', 15, 25);
  placeBuilding(simulation, 'robot-house', 20, 25);
  const house = simulation.getRobotHouseBuilding();
  expect(house).toBeTruthy();
  return { simulation, houseId: house!.id };
}

function prepareNurseryAndRobotHouse(): { simulation: GameSimulation; houseId: number } {
  const simulation = new GameSimulation();
  placeBuilding(simulation, 'pump', 15, 25);
  placeBuilding(simulation, 'nursery', 20, 25);
  simulation.waterResource = 30;
  placeBuilding(simulation, 'robot-house', 25, 25);
  const house = simulation.getRobotHouseBuilding();
  expect(house).toBeTruthy();
  return { simulation, houseId: house!.id };
}

function analyzeParcel(simulation: GameSimulation, houseId: number, terrain = TerrainType.Sand, water = 24): void {
  const parcel = simulation.getRestorationParcelForHouse(houseId)!;
  for (const index of simulation.getRestorationParcelCells(parcel)) {
    const cell = simulation.cells[index];
    cell.known = true;
    cell.revealed = true;
    cell.terrain = terrain;
    cell.water = water;
    cell.humus = 8;
  }
}

function advanceUntil(simulation: GameSimulation, condition: () => boolean, seconds = 30): void {
  const steps = Math.ceil(seconds / SIMULATION_STEP);
  for (let i = 0; i < steps; i += 1) {
    if (condition()) return;
    simulation.update(SIMULATION_STEP);
  }
  expect(condition()).toBe(true);
}

function pipe(gx: number, gy: number, distance: number, sourceId: number): PipeCell {
  return { gx, gy, distance, sourceType: 'pump', sourceId, outlet: false, outletOpen: false, pressureLevel: 'none' };
}

describe('simulation progression', () => {
  it('only exposes active buildings and unlocks nursery then cistern through play', () => {
    const buildingKeys = Object.keys(BUILDINGS);
    expect(buildingKeys.sort()).toEqual([...BUILDING_ORDER].sort());
    expect(buildingKeys).not.toContain('scanner');
    expect(buildingKeys).not.toContain('carrier');

    const simulation = new GameSimulation();
    expect(simulation.getUnlockedBuildingTypes()).toEqual(['pump']);

    placeBuilding(simulation, 'pump', 15, 25);
    expect(simulation.getUnlockedBuildingTypes()).toEqual(['pump', 'nursery', 'robot-house']);

    const treeIndex = simulation.index(28, 25);
    const cell = simulation.cells[treeIndex];
    cell.tree = 'pioneer';
    cell.treeStage = 3;
    cell.treeOrigin = 'player';
    simulation.selectCell(treeIndex);

    expect(simulation.harvestSelectedTreeForWood()).toBe(true);
    expect(simulation.getUnlockedBuildingTypes()).toEqual(['pump', 'nursery', 'robot-house', 'cistern']);
    expect(simulation.seedInventory.pioneer).toBe(4);
  });

  it('keeps research soils complete for discovered special soils and treats dry sand as already compatible', () => {
    const simulation = new GameSimulation();
    const nursery = simulation.makeBuilding('nursery', 20, 25);
    nursery.waterStored = RESEARCH_COST;
    simulation.buildings.push(nursery);
    simulation.discoveredSoils.add(TerrainType.Sand);
    simulation.discoveredSoils.add(TerrainType.Dune);

    expect(SEEDS.pioneer.compatibleTerrains).toContain(TerrainType.Sand);
    expect(simulation.getResearchableSoils()).toEqual([TerrainType.Dune]);

    const started = simulation.startResearch('pioneer', TerrainType.Dune);
    expect(started.ok, started.message).toBe(true);
    simulation.advanceNurseryJob(RESEARCH_DURATION);

    expect(simulation.isSeedUnlocked('juniper')).toBe(true);
    expect(simulation.seedInventory.juniper).toBe(1);
  });
});

describe('robot scan', () => {
  it('uses a duration based on unknown tiles and reveals them when the nursery robot finishes', () => {
    const simulation = preparePumpAndNursery();
    const center = { x: 22, y: 25 };
    const allCells = simulation.getScanZoneCells(center.x, center.y);
    const alreadyKnown = allCells.slice(0, 8);
    for (const index of alreadyKnown) simulation.cells[index].known = true;
    const unknownCells = allCells.filter((index) => !simulation.cells[index].known);

    const created = simulation.createScanZone(center.x, center.y);
    expect(created.ok, created.message).toBe(true);
    const zone = simulation.scanZones[0];
    const task = simulation.getTaskForScanZone(zone.id);
    expect(task?.type).toBe('scan');
    expect(task?.state).toBe('available');
    expect(zone.cells).toHaveLength(unknownCells.length);
    expect(zone.duration).toBeCloseTo(simulation.getScanZoneDuration(unknownCells.length));

    advance(simulation, zone.duration + 2);

    expect(simulation.scanZones).toHaveLength(0);
    expect(unknownCells.every((index) => simulation.cells[index].known)).toBe(true);
    expect(simulation.getDiscoveredSoils().length).toBeGreaterThan(0);
    expect(simulation.getRobotTask(task?.id)?.state).toBe('completed');
  });
});

describe('robot tasks', () => {
  it('prevents two robots from reserving the same task', () => {
    const simulation = preparePumpAndNursery();
    const created = simulation.createScanZone(24, 25);
    expect(created.ok, created.message).toBe(true);
    const task = simulation.tasks.find((candidate) => candidate.type === 'scan');
    expect(task).toBeDefined();

    expect(simulation.reserveTask(task!.id, 'nursery-1')?.reservedByWorkerId).toBe('nursery-1');
    expect(simulation.reserveTask(task!.id, 'nursery-2')).toBeNull();
  });

  it('selects by priority before distance', () => {
    const simulation = preparePumpAndNursery();
    const nursery = simulation.getNurseryBuilding()!;
    const cistern = simulation.makeBuilding('cistern', nursery.gx + 10, nursery.gy);
    cistern.waterStored = 0;
    simulation.buildings.push(cistern);
    const scan = simulation.createScanZone(nursery.gx + 1, nursery.gy);
    expect(scan.ok, scan.message).toBe(true);
    simulation.syncRobotTasks();

    const worker = simulation.ensureNurseryWorker(nursery);
    const selected = simulation.selectNextTask(worker);
    expect(selected?.type).toBe('water-delivery');
    expect(selected?.priority).toBe(ROBOT_TASK_PRIORITIES.waterDelivery);
  });

  it('selects the closest task when priorities are equal', () => {
    const simulation = preparePumpAndNursery();
    const nursery = simulation.getNurseryBuilding()!;
    const near = simulation.createScanZone(nursery.gx + 4, nursery.gy);
    const far = simulation.createScanZone(nursery.gx + 18, nursery.gy);
    expect(near.ok, near.message).toBe(true);
    expect(far.ok, far.message).toBe(true);
    simulation.syncRobotTasks();

    const worker = simulation.ensureNurseryWorker(nursery);
    const selected = simulation.selectNextTask(worker);
    expect(selected?.id).toBe(`scan:${simulation.scanZones[0].id}`);
  });

  it('keeps blocked planting tasks with a readable reason', () => {
    const simulation = preparePumpAndNursery();
    simulation.selectTool({ kind: 'planting-zone', mode: 'paint', seed: 'pioneer' });
    const painted = simulation.placeSelected(30, 25);
    expect(painted.ok, painted.message).toBe(true);
    simulation.syncRobotTasks();

    const task = simulation.tasks.find((candidate) => candidate.type === 'plant');
    expect(task?.state).toBe('blocked');
    expect(task?.blockedReason).toBe('Scannez d’abord ce sol');
    expect(simulation.getPlantingZoneSummaries()[0].blockedReason).toBe('Scannez d’abord ce sol');
  });

  it('executes planting through a reserved task', () => {
    const simulation = preparePumpAndNursery();
    const index = simulation.index(16, 25);
    simulation.cells[index].known = true;
    simulation.cells[index].revealed = true;
    simulation.currentFields = simulation.computeFields();
    simulation.selectTool({ kind: 'planting-zone', mode: 'paint', seed: 'pioneer' });
    const painted = simulation.placeSelected(16, 25);
    expect(painted.ok, painted.message).toBe(true);
    const task = simulation.tasks.find((candidate) => candidate.type === 'plant');
    expect(task?.state).toBe('available');

    advance(simulation, 6);

    expect(simulation.cells[index].tree).toBe('pioneer');
    expect(simulation.getRobotTask(task?.id)?.state).toBe('completed');
  });

  it('executes water transport through a water-delivery task', () => {
    const simulation = preparePumpAndNursery();
    const nursery = simulation.getNurseryBuilding()!;
    const cistern = simulation.makeBuilding('cistern', nursery.gx + 4, nursery.gy);
    cistern.waterStored = 0;
    simulation.buildings.push(cistern);
    simulation.syncRobotTasks();

    const task = simulation.tasks.find((candidate) => candidate.type === 'water-delivery' && candidate.target.kind === 'building' && candidate.target.buildingId === cistern.id);
    expect(task?.state).toBe('available');

    advance(simulation, 7);

    expect(cistern.waterStored).toBeGreaterThan(0);
    expect(simulation.tasks.some((candidate) => candidate.id === task?.id)).toBe(true);
  });
});

describe('robot house restoration', () => {
  it('places a robot house, attaches a robot, assigns a rectangle and creates scan tasks', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    expect(simulation.robotHouseWorkers.find((worker) => worker.homeBuildingId === houseId)?.role).toBe('restoration');
    expect(simulation.selectedTool?.kind).toBe('restoration-parcel');

    expect(simulation.placeSelected(21, 24).ok).toBe(true);
    expect(simulation.placeSelected(23, 26).ok).toBe(true);

    const parcel = simulation.getRestorationParcelForHouse(houseId);
    expect(parcel?.bounds).toEqual({ minX: 21, minY: 24, maxX: 23, maxY: 26 });
    const house = simulation.getRobotHouseBuilding(houseId)!;
    const unknownTiles = simulation.getRestorationParcelCells(parcel!)
      .filter((index) => index !== simulation.index(house.gx, house.gy))
      .filter((index) => !simulation.cells[index].known);
    const scanTasks = simulation.tasks.filter((task) => task.homeBuildingId === houseId && task.type === 'scan' && task.state === 'available');
    expect(scanTasks).toHaveLength(unknownTiles.length);
  });

  it('reports missing compatible seed logistics after the parcel is analyzed', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 22, maxY: 25 }).ok).toBe(true);
    const parcel = simulation.getRestorationParcelForHouse(houseId)!;
    for (const index of simulation.getRestorationParcelCells(parcel)) {
      const cell = simulation.cells[index];
      cell.known = true;
      cell.revealed = true;
      cell.terrain = TerrainType.Sand;
      cell.water = 20;
    }

    simulation.updateRestorationParcels(0);

    expect(parcel.state).toBe('waiting_resources');
    expect(parcel.seedSupplyState).toBe('waiting_for_seed_stock');
    expect(parcel.blockers[0]).toContain('pépinière');
  });

  it('prepares and plants through local house inventory', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    const target = simulation.index(21, 25);
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 21, maxY: 25 }).ok).toBe(true);
    const cell = simulation.cells[target];
    cell.known = true;
    cell.revealed = true;
    cell.terrain = TerrainType.Sand;
    cell.water = 22;
    cell.humus = 6;
    expect(simulation.transferSeedToRobotHouse(houseId, 'pioneer').ok).toBe(true);

    advance(simulation, 5);

    const house = simulation.getRobotHouseBuilding(houseId)!;
    expect(cell.preparedByRobotHouseId).toBe(houseId);
    expect(cell.tree).toBe('pioneer');
    expect(house.seedInventory?.pioneer).toBe(0);
    expect(simulation.seedInventory.pioneer).toBe(2);
  });

  it('waters from the house reservoir and consumes local water', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    const target = simulation.index(21, 25);
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 21, maxY: 25 }).ok).toBe(true);
    const cell = simulation.cells[target];
    cell.known = true;
    cell.revealed = true;
    cell.terrain = TerrainType.Sand;
    cell.tree = 'pioneer';
    cell.treeStage = 1;
    cell.treeOrigin = 'player';
    cell.cover = 2;
    cell.humus = 10;
    cell.water = 2;
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.waterStored = ROBOT_HOUSE_WATER_PER_TASK;
    simulation.syncRobotTasks();

    const task = simulation.tasks.find((candidate) => candidate.homeBuildingId === houseId && candidate.type === 'water_plant');
    expect(task?.state).toBe('available');

    advance(simulation, 4);

    expect(house.waterStored).toBeCloseTo(0);
    expect(cell.water).toBeGreaterThan(2);
    expect(simulation.getRobotTask(task?.id)?.state).toBe('completed');
  });

  it('waters a prepared cell before planting when survival water is too low', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    const target = simulation.index(21, 25);
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 21, maxY: 25 }).ok).toBe(true);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.seedInventory!.pioneer = 1;
    house.waterStored = ROBOT_HOUSE_WATER_PER_TASK;
    const cell = simulation.cells[target];
    cell.known = true;
    cell.revealed = true;
    cell.terrain = TerrainType.Sand;
    cell.preparedByRobotHouseId = houseId;
    cell.humus = ROBOT_HOUSE_PREPARED_HUMUS;
    cell.water = SEEDS.pioneer.waterNeed * TREE_GROWTH_STAGE_FACTORS[0] + ROBOT_HOUSE_PLANT_WATER_BUFFER - 0.5;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    expect(simulation.tasks.find((task) => task.homeBuildingId === houseId && task.type === 'plant')?.state).not.toBe('available');
    const task = simulation.tasks.find((candidate) => candidate.homeBuildingId === houseId && candidate.type === 'water_plant');
    expect(task?.state).toBe('available');
    expect(simulation.selectNextTask(simulation.robotHouseWorkers.find((worker) => worker.homeBuildingId === houseId)!)?.type).toBe('water_plant');
  });

  it('waters a stressed young plant before preparing new cells', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    const planted = simulation.index(21, 25);
    const empty = simulation.index(22, 25);
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 22, maxY: 25 }).ok).toBe(true);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.seedInventory!.pioneer = 1;
    house.waterStored = ROBOT_HOUSE_WATER_PER_TASK;
    for (const index of [planted, empty]) {
      const cell = simulation.cells[index];
      cell.known = true;
      cell.revealed = true;
      cell.terrain = TerrainType.Sand;
      cell.water = 26;
      cell.humus = ROBOT_HOUSE_PREPARED_HUMUS;
    }
    const plantedCell = simulation.cells[planted];
    plantedCell.tree = 'pioneer';
    plantedCell.treeStage = 1;
    plantedCell.treeOrigin = 'player';
    plantedCell.preparedByRobotHouseId = houseId;
    plantedCell.water = SEEDS.pioneer.waterNeed * TREE_GROWTH_STAGE_FACTORS[1] + ROBOT_HOUSE_MAINTENANCE_WATER_BUFFER - 0.5;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const selected = simulation.selectNextTask(simulation.robotHouseWorkers.find((worker) => worker.homeBuildingId === houseId)!);
    expect(selected?.type).toBe('water_plant');
    expect(selected?.target.kind === 'cell' ? selected.target.index : null).toBe(planted);
  });

  it('keeps watering existing plants while seed logistics block parcel expansion', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    const planted = simulation.index(21, 25);
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 25, maxY: 25 }).ok).toBe(true);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.waterStored = ROBOT_HOUSE_WATER_PER_TASK;
    const parcel = simulation.getRestorationParcelForHouse(houseId)!;
    for (const index of simulation.getRestorationParcelCells(parcel)) {
      const cell = simulation.cells[index];
      cell.known = true;
      cell.revealed = true;
      cell.terrain = TerrainType.Sand;
      cell.water = 26;
      cell.humus = ROBOT_HOUSE_PREPARED_HUMUS;
    }
    const plantedCell = simulation.cells[planted];
    plantedCell.tree = 'pioneer';
    plantedCell.treeStage = 1;
    plantedCell.treeOrigin = 'player';
    plantedCell.preparedByRobotHouseId = houseId;
    plantedCell.water = SEEDS.pioneer.waterNeed * TREE_GROWTH_STAGE_FACTORS[1] + ROBOT_HOUSE_MAINTENANCE_WATER_BUFFER - 0.5;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    expect(parcel.blockers[0]).toContain('pépinière');
    const task = simulation.tasks.find((candidate) => candidate.homeBuildingId === houseId && candidate.type === 'water_plant');
    expect(task?.state).toBe('available');
  });

  it('does not plant a prepared cell when the house has no water for the required pre-watering', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    const target = simulation.index(21, 25);
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 21, maxY: 25 }).ok).toBe(true);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.seedInventory!.pioneer = 1;
    house.waterStored = 0;
    const cell = simulation.cells[target];
    cell.known = true;
    cell.revealed = true;
    cell.terrain = TerrainType.Sand;
    cell.preparedByRobotHouseId = houseId;
    cell.humus = ROBOT_HOUSE_PREPARED_HUMUS;
    cell.water = SEEDS.pioneer.waterNeed * TREE_GROWTH_STAGE_FACTORS[0] + ROBOT_HOUSE_PLANT_WATER_BUFFER - 0.5;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    expect(simulation.tasks.find((task) => task.homeBuildingId === houseId && task.type === 'plant')?.state).not.toBe('available');
    const waterTask = simulation.tasks.find((task) => task.homeBuildingId === houseId && task.type === 'water_plant');
    expect(waterTask?.state).toBe('blocked');
    expect(waterTask?.blockedReason).toContain('Réserve d’eau trop basse');
    expect(simulation.getRestorationParcelForHouse(houseId)?.blockers[0]).toContain('Réserve d’eau trop basse');
  });

  it('maintains several young plants from the house reservoir without seedling death', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 23, maxY: 25 }).ok).toBe(true);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.waterStored = 36;
    const targets = [simulation.index(21, 25), simulation.index(22, 25), simulation.index(23, 25)];
    for (const index of targets) {
      const cell = simulation.cells[index];
      cell.known = true;
      cell.revealed = true;
      cell.terrain = TerrainType.Sand;
      cell.tree = 'pioneer';
      cell.treeStage = 0;
      cell.treeProgress = 0.1;
      cell.treeStress = 0;
      cell.treeOrigin = 'player';
      cell.preparedByRobotHouseId = houseId;
      cell.cover = 1;
      cell.humus = ROBOT_HOUSE_PREPARED_HUMUS;
      cell.water = SEEDS.pioneer.waterNeed * TREE_GROWTH_STAGE_FACTORS[0] + ROBOT_HOUSE_MAINTENANCE_WATER_BUFFER - 0.25;
    }

    advance(simulation, 40);

    for (const index of targets) expect(simulation.cells[index].tree).toBe('pioneer');
    expect(targets.some((index) => simulation.cells[index].water > SEEDS.pioneer.waterNeed)).toBe(true);
    expect(house.waterStored).toBeLessThan(36);
  });

  it('lets a robot-prepared sapling grow without waiting for moss or grass cover', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    const target = simulation.index(21, 25);
    const cell = simulation.cells[target];
    cell.known = true;
    cell.revealed = true;
    cell.terrain = TerrainType.Sand;
    cell.tree = 'pioneer';
    cell.treeStage = 1;
    cell.treeProgress = 0;
    cell.treeStress = 5;
    cell.treeOrigin = 'player';
    cell.preparedByRobotHouseId = houseId;
    cell.cover = 0;
    cell.water = 40;
    cell.humus = 12;
    cell.shade = 0;

    simulation.updateTree(target, 1, 10);
    const diagnostic = simulation.getCellGrowthDiagnostics(target);

    expect(cell.treeProgress).toBeGreaterThan(0);
    expect(cell.treeStress).toBe(0);
    expect(diagnostic.blockers).not.toContain('La croissance demande une prairie stable.');
    expect(diagnostic.details).toContain('Sol préparé par robot');
  });

  it('keeps moss and grass cover requirements for saplings outside robot-prepared soil', () => {
    const simulation = new GameSimulation();
    const target = simulation.index(21, 25);
    const cell = simulation.cells[target];
    cell.known = true;
    cell.revealed = true;
    cell.terrain = TerrainType.Sand;
    cell.tree = 'pioneer';
    cell.treeStage = 0;
    cell.treeProgress = 0.2;
    cell.treeStress = 0;
    cell.treeOrigin = 'player';
    cell.preparedByRobotHouseId = null;
    cell.cover = 0;
    cell.water = 40;
    cell.humus = 12;
    cell.shade = 0;

    simulation.updateTree(target, 1, 1);
    const diagnostic = simulation.getCellGrowthDiagnostics(target);

    expect(cell.treeProgress).toBeLessThan(0.2);
    expect(diagnostic.blockers).toContain('La graine a besoin de mousse.');
  });

  it('robot watering clears the water blocker for a prepared sapling without requiring moss', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    const target = simulation.index(21, 25);
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 21, maxY: 25 }).ok).toBe(true);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    const cell = simulation.cells[target];
    cell.known = true;
    cell.revealed = true;
    cell.terrain = TerrainType.Sand;
    cell.tree = 'pioneer';
    cell.treeStage = 0;
    cell.treeProgress = 0;
    cell.treeStress = 0;
    cell.treeOrigin = 'player';
    cell.preparedByRobotHouseId = houseId;
    cell.cover = 0;
    cell.water = 1;
    cell.humus = 8;
    cell.shade = 0;
    house.waterStored = ROBOT_HOUSE_WATER_PER_TASK;

    expect(simulation.getCellGrowthDiagnostics(target).blockers.some((blocker) => blocker.includes('Humidité trop basse'))).toBe(true);
    const watered = simulation.waterPlantFromRobotHouse(houseId, target);
    expect(watered.ok, watered.message).toBe(true);

    const diagnostic = simulation.getCellGrowthDiagnostics(target);
    expect(diagnostic.blockers.some((blocker) => blocker.includes('Humidité trop basse'))).toBe(false);
    expect(diagnostic.blockers).not.toContain('La graine a besoin de mousse.');
    expect(diagnostic.tone).toBe('good');
  });

  it('plans sparse restoration planting to avoid future shade stress', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId, TerrainType.Sand, 40);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.seedInventory!.pioneer = 6;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const parcel = simulation.getRestorationParcelForHouse(houseId)!;
    const prepareTasks = simulation.tasks.filter((task) => task.homeBuildingId === houseId && task.type === 'prepare_soil' && task.state === 'available');
    expect(parcel.totalTiles).toBe(6);
    expect(parcel.plantableTiles).toBe(2);
    expect(parcel.needs.some((need) => need.includes('laissé') && need.includes('ombre'))).toBe(true);
    expect(prepareTasks).toHaveLength(2);
  });

  it('blocks a stale planting task when a neighboring tree appears before execution', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId, TerrainType.Sand, 60);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.seedInventory!.pioneer = 6;
    house.waterStored = 36;
    const parcel = simulation.getRestorationParcelForHouse(houseId)!;
    for (const index of simulation.getRestorationParcelCells(parcel)) simulation.cells[index].preparedByRobotHouseId = houseId;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const target = simulation.index(25, 25);
    const task = simulation.tasks.find((candidate) => candidate.homeBuildingId === houseId && candidate.type === 'plant' && candidate.target.kind === 'cell' && candidate.target.index === target)!;
    const neighbor = simulation.cells[simulation.index(24, 25)];
    neighbor.tree = 'pioneer';
    neighbor.treeStage = 1;
    neighbor.treeOrigin = 'player';

    expect(simulation.getRestorationTaskBlockedReason(task)).toBe('Trop proche d’un arbre');
  });

  it('counts seed demand only for canopy-viable restoration slots', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 31, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId, TerrainType.Sand, 40);

    const parcel = simulation.getRestorationParcelForHouse(houseId)!;
    const demand = simulation.getRestorationSeedDemand(parcel);

    expect(demand.pioneer).toBe(2);
  });

  it('skips an empty restoration slot when the projected shade is already too high', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    const target = simulation.index(21, 25);
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 21, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId, TerrainType.Sand, 40);
    simulation.cells[target].shade = ROBOT_HOUSE_MAX_PLANTING_SHADE + 1;
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.seedInventory!.pioneer = 1;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const parcel = simulation.getRestorationParcelForHouse(houseId)!;
    expect(parcel.plantableTiles).toBe(0);
    expect(simulation.tasks.some((task) => task.homeBuildingId === houseId && (task.type === 'prepare_soil' || task.type === 'plant'))).toBe(false);
  });

  it('can become autonomous with a healthy sparse canopy plan', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId, TerrainType.Sand, 60);
    const parcel = simulation.getRestorationParcelForHouse(houseId)!;
    for (const index of [simulation.index(21, 25), simulation.index(25, 25)]) {
      const cell = simulation.cells[index];
      cell.preparedByRobotHouseId = houseId;
      cell.cover = 2;
      cell.humus = 12;
      cell.water = 60;
      cell.tree = 'pioneer';
      cell.treeStage = RESTORATION_AUTONOMY.developedTreeStage;
      cell.treeStress = 0;
      cell.treeOrigin = 'player';
    }

    simulation.updateRestorationParcels(0);
    simulation.simulationTime += RESTORATION_AUTONOMY.requiredContinuousDuration + 0.1;
    simulation.updateRestorationParcels(0);

    expect(parcel.plantableTiles).toBe(2);
    expect(parcel.progress.planting).toBe(1);
    expect(parcel.state).toBe('autonomous');
  });

  it('marks a stable parcel autonomous and stops normal maintenance tasks', () => {
    const { simulation, houseId } = preparePumpAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 21, minY: 25, maxX: 22, maxY: 26 }).ok).toBe(true);
    const parcel = simulation.getRestorationParcelForHouse(houseId)!;
    for (const index of simulation.getRestorationParcelCells(parcel)) {
      const cell = simulation.cells[index];
      cell.known = true;
      cell.revealed = true;
      cell.terrain = TerrainType.Sand;
      cell.preparedByRobotHouseId = houseId;
      cell.cover = 2;
      cell.humus = 12;
      cell.water = 40;
      cell.tree = 'pioneer';
      cell.treeStage = 2;
      cell.treeStress = 0;
      cell.treeOrigin = 'player';
    }

    simulation.updateRestorationParcels(0);
    simulation.simulationTime += RESTORATION_AUTONOMY.requiredContinuousDuration + 0.1;
    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();
    simulation.updateRobotHouseWorkers(0.1);

    expect(parcel.state).toBe('autonomous');
    expect(simulation.tasks.filter((task) => task.homeBuildingId === houseId && ['plant', 'water_plant', 'prepare_soil'].includes(task.type) && ['available', 'reserved', 'in-progress'].includes(task.state))).toHaveLength(0);
    expect(simulation.robotHouseWorkers.find((worker) => worker.homeBuildingId === houseId)?.message).toContain('autonome');
  });
});

describe('robot house seed resupply', () => {
  it('uses local house seeds before creating a nursery request', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.seedInventory!.pioneer = 1;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    expect(simulation.getActiveSeedRequestsForHouse(houseId)).toHaveLength(0);
    expect(simulation.tasks.some((task) => task.homeBuildingId === houseId && (task.type === 'prepare_soil' || task.type === 'plant'))).toBe(true);
  });

  it('creates one request, reserves nursery stock and does not duplicate deliveries', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();
    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const requests = simulation.getActiveSeedRequestsForHouse(houseId);
    expect(requests).toHaveLength(1);
    expect(requests[0].seed).toBe('pioneer');
    expect(requests[0].quantityReserved).toBeGreaterThan(0);
    expect(simulation.seedReservations).toHaveLength(1);
    expect(simulation.tasks.filter((task) => task.type === 'deliver_seeds' && task.seedRequestId === requests[0].id)).toHaveLength(1);
  });

  it('releases a stale delivery task reservation and lets the nursery robot depart', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);
    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const task = simulation.tasks.find((candidate) => candidate.type === 'deliver_seeds')!;
    expect(task.state).toBe('available');
    simulation.setRobotTaskState(task.id, 'reserved', null, 'ghost-worker');
    const worker = simulation.ensureNurseryWorker(simulation.getNurseryBuilding()!);
    worker.state = 'blocked';
    worker.currentTaskId = null;
    worker.progress = 1.5;
    worker.message = 'Livraisons de graines en attente';

    simulation.updateNurseryWorker(0.1);

    expect(worker.currentTaskId).toBe(task.id);
    expect(worker.state).toBe('to-seed-load');
    expect(simulation.getRobotTask(task.id)?.reservedByWorkerId).toBe(worker.id);
  });

  it('prioritizes urgent seed delivery before non-critical water delivery', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    const nursery = simulation.getNurseryBuilding()!;
    const cistern = simulation.makeBuilding('cistern', nursery.gx + 4, nursery.gy);
    cistern.waterStored = 0;
    simulation.buildings.push(cistern);
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);
    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const waterTask = simulation.tasks.find((task) => task.type === 'water-delivery');
    const seedTask = simulation.tasks.find((task) => task.type === 'deliver_seeds');
    const selected = simulation.selectNextTask(simulation.ensureNurseryWorker(nursery));

    expect(waterTask?.state).toBe('available');
    expect(seedTask?.state).toBe('available');
    expect(seedTask!.priority).toBeGreaterThan(waterTask!.priority);
    expect(selected?.type).toBe('deliver_seeds');
  });

  it('does not leave a reserved seed request stuck when reserved stock disappears', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);
    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const request = simulation.getActiveSeedRequestsForHouse(houseId)[0];
    const task = simulation.tasks.find((candidate) => candidate.type === 'deliver_seeds' && candidate.seedRequestId === request.id)!;
    simulation.seedInventory.pioneer = 0;

    simulation.syncRobotTasks();

    expect(simulation.seedReservations).toHaveLength(0);
    expect(request.status).toBe('blocked');
    expect(request.blockedReason).toBe('Stock réservé incohérent');
    expect(simulation.getRobotTask(task.id)?.state).toBe('cancelled');
  });

  it('requeues an orphaned in-delivery request without deleting seeds', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);

    advanceUntil(simulation, () => (simulation.nurseryWorker?.seedLoad.pioneer ?? 0) > 0, 8);

    const worker = simulation.nurseryWorker!;
    const request = simulation.getActiveSeedRequestsForHouse(houseId)[0];
    const task = simulation.getRobotTask(worker.currentTaskId)!;
    const loaded = worker.seedLoad.pioneer ?? 0;
    expect(request.status).toBe('in_delivery');
    expect(loaded).toBeGreaterThan(0);
    worker.seedLoad = {};
    worker.currentTaskId = null;
    worker.state = 'blocked';
    worker.progress = 1.5;

    simulation.syncRobotTasks();

    expect(simulation.seedInventory.pioneer).toBe(3);
    expect(request.status).toBe('pending');
    expect(request.blockedReason).toBe('Livraison interrompue, graines remises en pépinière');
    expect(simulation.getRobotTask(task.id)?.state).toBe('cancelled');
  });

  it('prevents two houses from reserving the same seed unit', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    simulation.seedInventory.pioneer = 1;
    const secondHouse = simulation.makeBuilding('robot-house', 31, 25);
    simulation.buildings.push(secondHouse);
    simulation.ensureRobotHouseWorker(secondHouse);

    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    expect(simulation.assignRestorationParcel(secondHouse.id, { minX: 32, minY: 25, maxX: 32, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);
    analyzeParcel(simulation, secondHouse.id);

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const reserved = simulation.seedReservations.reduce((total, reservation) => total + reservation.quantity, 0);
    const requests = simulation.seedRequests.filter((request) => request.seed === 'pioneer' && ['reserved', 'blocked'].includes(request.status));
    expect(reserved).toBe(1);
    expect(requests).toHaveLength(2);
    expect(requests.filter((request) => request.status === 'reserved')).toHaveLength(1);
    expect(requests.filter((request) => request.status === 'blocked')).toHaveLength(1);
  });

  it('keeps the restoration robot on parcel work while the nursery robot fetches seeds', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);

    advance(simulation, 0.2);

    const restorationWorker = simulation.robotHouseWorkers.find((worker) => worker.homeBuildingId === houseId)!;
    const task = simulation.getRobotTask(restorationWorker.currentTaskId);
    expect(task?.type).not.toBe('deliver_seeds');
    expect(restorationWorker.role).toBe('restoration');
    expect(simulation.nurseryWorker?.currentTaskId ? simulation.getRobotTask(simulation.nurseryWorker.currentTaskId)?.type : null).toBe('deliver_seeds');
  });

  it('loads, delivers, updates inventories and resumes planting after delivery', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId, TerrainType.Sand, 28);
    const target = simulation.index(26, 25);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.waterStored = ROBOT_HOUSE_WATER_PER_TASK;

    advanceUntil(simulation, () => (simulation.nurseryWorker?.seedLoad.pioneer ?? 0) > 0, 8);
    const loaded = simulation.nurseryWorker?.seedLoad.pioneer ?? 0;
    expect(loaded).toBeGreaterThan(0);
    expect(simulation.seedInventory.pioneer).toBe(3 - loaded);
    expect(simulation.seedReservations).toHaveLength(0);

    advanceUntil(simulation, () => (house.seedInventory?.pioneer ?? 0) > 0, 10);
    expect(house.seedInventory?.pioneer).toBeGreaterThan(0);

    advanceUntil(simulation, () => simulation.cells[target].tree === 'pioneer', 25);
    expect(simulation.cells[target].preparedByRobotHouseId).toBe(houseId);
    expect(simulation.cells[target].tree).toBe('pioneer');
  });

  it('requests another delivery after the first batch has been planted', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    simulation.seedInventory.pioneer = 17;
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 37, maxY: 32 }).ok).toBe(true);
    analyzeParcel(simulation, houseId, TerrainType.Sand, 60);
    const house = simulation.getRobotHouseBuilding(houseId)!;
    house.waterStored = 30;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();
    const firstRequest = simulation.getActiveSeedRequestsForHouse(houseId)[0];
    const firstTask = simulation.tasks.find((task) => task.type === 'deliver_seeds' && task.seedRequestId === firstRequest.id)!;
    expect(firstRequest.quantityRequested).toBe(ROBOT_HOUSE_SEED_REQUEST_MAX_BATCH);

    firstRequest.quantityDelivered = firstRequest.quantityRequested;
    firstRequest.quantityReserved = 0;
    firstRequest.status = 'completed';
    firstRequest.assignedNurseryId = null;
    firstRequest.updatedAt = simulation.simulationTime;
    simulation.seedReservations = [];
    simulation.seedInventory.pioneer = 13;
    simulation.completeTask(firstTask.id);

    const parcel = simulation.getRestorationParcelForHouse(houseId)!;
    const plantedSlots = [
      simulation.index(26, 25),
      simulation.index(30, 25),
      simulation.index(34, 25),
      simulation.index(26, 29),
    ];
    for (const index of simulation.getRestorationParcelCells(parcel)) {
      const cell = simulation.cells[index];
      cell.preparedByRobotHouseId = houseId;
      cell.water = 60;
      cell.humus = 8;
      if (plantedSlots.includes(index)) {
        cell.tree = 'pioneer';
        cell.treeStage = 0;
        cell.treeOrigin = 'player';
        cell.treeStress = 0;
      }
    }
    house.seedInventory!.pioneer = 0;

    simulation.updateRestorationParcels(0);
    simulation.syncRobotTasks();

    const matchingRequests = simulation.seedRequests.filter((request) => request.id === firstRequest.id);
    expect(matchingRequests).toHaveLength(1);
    expect(firstRequest.status).toBe('reserved');
    expect(firstRequest.quantityDelivered).toBe(0);
    expect(firstRequest.quantityReserved).toBeGreaterThan(0);
    const reopenedTask = simulation.getRobotTask(firstTask.id);
    expect(reopenedTask?.state).toBe('available');
    expect(reopenedTask ? simulation.getSeedDeliveryTaskBlockedReason(reopenedTask) : 'missing').toBeNull();

    advanceUntil(simulation, () => firstRequest.quantityDelivered > 0, 12);
    expect(simulation.seedInventory.pioneer).toBeLessThan(13);
    expect(firstRequest.status).toMatch(/completed|partially_delivered/);
  });

  it('releases reserved seeds when a request is cancelled before loading', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);
    simulation.updateRestorationParcels(0);

    const request = simulation.getActiveSeedRequestsForHouse(houseId)[0];
    expect(request.quantityReserved).toBeGreaterThan(0);
    expect(simulation.getFreeNurserySeedCount('pioneer')).toBeLessThan(simulation.seedInventory.pioneer);

    simulation.cancelSeedRequest(request.id, 'Test');

    expect(simulation.seedReservations).toHaveLength(0);
    expect(simulation.getFreeNurserySeedCount('pioneer')).toBe(simulation.seedInventory.pioneer);
  });

  it('keeps the remaining quantity explicit after a partial delivery', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    simulation.seedInventory.pioneer = 1;
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 31, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId, TerrainType.Sand, 28);

    advanceUntil(simulation, () => simulation.seedRequests.some((request) => request.quantityDelivered > 0), 14);

    const request = simulation.seedRequests.find((candidate) => candidate.homeBuildingId === houseId && candidate.seed === 'pioneer')!;
    expect(request.quantityDelivered).toBe(1);
    expect(simulation.getSeedRequestOutstanding(request)).toBeGreaterThan(0);
    expect(['partially_delivered', 'blocked', 'pending']).toContain(request.status);
  });

  it('keeps an explicit blocked request when no compatible seed exists in nursery stock', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    simulation.unlockedSeeds.add('juniper');
    simulation.seedInventory.juniper = 0;
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId, TerrainType.Dune, 28);

    simulation.updateRestorationParcels(0);

    const request = simulation.getActiveSeedRequestsForHouse(houseId)[0];
    expect(request.seed).toBe('juniper');
    expect(request.status).toBe('blocked');
    expect(request.blockedReason).toContain('Aucune pépinière');
    expect(simulation.getRestorationParcelForHouse(houseId)?.seedSupplyState).toBe('waiting_for_seed_stock');
  });

  it('keeps free seed actions usable while another seed is reserved for delivery', () => {
    const { simulation, houseId } = prepareNurseryAndRobotHouse();
    simulation.seedInventory.pioneer = 1;
    simulation.unlockedSeeds.add('willow');
    simulation.seedInventory.willow = 1;
    expect(simulation.assignRestorationParcel(houseId, { minX: 26, minY: 25, maxX: 26, maxY: 25 }).ok).toBe(true);
    analyzeParcel(simulation, houseId);

    simulation.updateRestorationParcels(0);

    expect(simulation.getFreeNurserySeedCount('pioneer')).toBe(0);
    expect(simulation.getFreeNurserySeedCount('willow')).toBe(1);
    expect(simulation.startCultivation('pioneer', 2).ok).toBe(false);
    expect(simulation.startCultivation('willow', 2).ok).toBe(true);
  });
});

describe('water and pressure', () => {
  it('charges pump local irrigation to the pump reservoir and reports the same consumption', () => {
    const simulation = new GameSimulation();
    placeBuilding(simulation, 'pump', 15, 25);
    const before = simulation.waterResource;

    expect(simulation.getMetrics().waterConsumption).toBeCloseTo(PUMP_LOCAL_IRRIGATION_CONSUMPTION);
    simulation.update(1);

    expect(simulation.waterResource).toBeCloseTo(before + PUMP_WATER_RATE - PUMP_LOCAL_IRRIGATION_CONSUMPTION);

    const emptyReservoir = new GameSimulation();
    placeBuilding(emptyReservoir, 'pump', 15, 25);
    emptyReservoir.waterResource = 0;
    emptyReservoir.update(1);
    expect(emptyReservoir.waterResource).toBeCloseTo(PUMP_WATER_RATE - PUMP_LOCAL_IRRIGATION_CONSUMPTION);
  });

  it('does not irrigate locally for free when pump or cistern storage is empty', () => {
    const simulation = new GameSimulation();
    const pump = simulation.makeBuilding('pump', 15, 25);
    const cistern = simulation.makeBuilding('cistern', 20, 25);
    simulation.buildings = [pump, cistern];
    simulation.waterResource = 0;
    cistern.waterStored = 0;

    const emptyFields = simulation.computeFields();
    expect(emptyFields.irrigationWater[simulation.index(pump.gx, pump.gy)]).toBeCloseTo(0);
    expect(emptyFields.irrigationWater[simulation.index(cistern.gx, cistern.gy)]).toBeCloseTo(0);

    cistern.waterStored = 2;
    expect(simulation.getMetrics().cisternWaterConsumption).toBeCloseTo(CISTERN_LOCAL_IRRIGATION_CONSUMPTION);
    simulation.update(1);
    expect(cistern.waterStored).toBeCloseTo(2 - CISTERN_LOCAL_IRRIGATION_CONSUMPTION);
  });

  it('uses shared pressure thresholds, hysteresis, and outlet consumption values', () => {
    const simulation = new GameSimulation();
    expect(simulation.pressureLevelFromScore(PRESSURE_THRESHOLDS.medium)).toBe('medium');
    expect(simulation.pressureLevelFromScore(PRESSURE_THRESHOLDS.medium - PRESSURE_HYSTERESIS_MARGIN + 0.1, 'medium')).toBe('medium');
    expect(simulation.pressureLevelFromScore(PRESSURE_THRESHOLDS.medium - PRESSURE_HYSTERESIS_MARGIN - 0.1, 'medium')).toBe('weak');
    expect(simulation.getOutletConsumptionForLevel('medium', true)).toBe(OUTLET_CONSUMPTION.medium);
    expect(simulation.getOutletConsumptionForLevel('medium', false)).toBe(0);
  });

  it('reduces downstream pressure with distance and upstream open outlets', () => {
    const simulation = new GameSimulation();
    const pump = simulation.makeBuilding('pump', 10, 10);
    simulation.buildings = [pump];
    simulation.waterResource = 100;
    const first = pipe(11, 10, 1, pump.id);
    const downstream = pipe(14, 10, 4, pump.id);
    simulation.pipes = [first, pipe(12, 10, 2, pump.id), pipe(13, 10, 3, pump.id), downstream];

    const nearScore = simulation.getPressureScore(first);
    const farScore = simulation.getPressureScore(downstream);
    first.outlet = true;
    first.outletOpen = true;

    expect(farScore).toBeLessThan(nearScore);
    expect(simulation.getPressureScore(downstream)).toBeLessThan(farScore);
  });

  it('keeps robot watering effective long enough for preparation and planting', () => {
    const simulation = new GameSimulation();
    const index = simulation.index(20, 25);
    const cell = simulation.cells[index];
    cell.terrain = TerrainType.Sand;
    cell.water = ROBOT_HOUSE_WATERING_AMOUNT;

    advance(simulation, ROBOT_HOUSE_PREPARE_DURATION + ROBOT_HOUSE_PLANT_DURATION + 8);

    expect(cell.water).toBeGreaterThan(GROUND_COVER.mossWater);
  });

  it('keeps moss during short dry gaps after watering', () => {
    const simulation = new GameSimulation();
    const index = simulation.index(20, 25);
    const cell = simulation.cells[index];
    cell.terrain = TerrainType.Sand;
    cell.cover = 1;
    cell.coverProgress = 0.5;
    cell.coverStress = 0;
    cell.water = GROUND_COVER.mossWater - 1;

    advance(simulation, GROUND_COVER.mossStressTolerance / 2);

    expect(cell.cover).toBe(1);
    expect(cell.coverStress).toBeGreaterThan(0);
  });
});

describe('pipes', () => {
  it('removes downstream pipe cells when a segment disconnects them from their source', () => {
    const simulation = new GameSimulation();
    const pump = simulation.makeBuilding('pump', 10, 10);
    simulation.buildings = [pump];

    expect(simulation.addPipeRoute({ type: 'pump', id: pump.id }, 14, 10)).toBe(true);
    expect(simulation.addPipeRoute({ type: 'pump', id: pump.id, anchorX: 12, anchorY: 10, anchorLabel: 'segment' }, 12, 13)).toBe(true);
    expect(simulation.pipes.length).toBeGreaterThan(1);

    simulation.selectPipe(12, 10);
    expect(simulation.removeSelectedPipeSegment()).toBe(true);

    const remaining = new Set(simulation.pipes.map((candidate) => simulation.pipeKey(candidate.gx, candidate.gy)));
    expect(remaining).toEqual(new Set(['11,10']));
  });
});
