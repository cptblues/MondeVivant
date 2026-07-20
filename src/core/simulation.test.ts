import { describe, expect, it } from 'vitest';
import { BUILDINGS, BUILDING_ORDER, SEEDS } from './config';
import {
  CISTERN_LOCAL_IRRIGATION_CONSUMPTION,
  OUTLET_CONSUMPTION,
  PRESSURE_HYSTERESIS_MARGIN,
  PRESSURE_THRESHOLDS,
  PUMP_LOCAL_IRRIGATION_CONSUMPTION,
  PUMP_WATER_RATE,
  RESEARCH_COST,
  RESEARCH_DURATION,
  RESTORATION_AUTONOMY,
  ROBOT_HOUSE_WATER_PER_TASK,
  ROBOT_TASK_PRIORITIES,
  SIMULATION_STEP,
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

  it('reports missing compatible seeds after the parcel is analyzed', () => {
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
    expect(parcel.blockers).toContain('Aucune graine compatible dans la maison.');
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
