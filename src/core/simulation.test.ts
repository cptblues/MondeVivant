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
    expect(simulation.getUnlockedBuildingTypes()).toEqual(['pump', 'nursery']);

    const treeIndex = simulation.index(28, 25);
    const cell = simulation.cells[treeIndex];
    cell.tree = 'pioneer';
    cell.treeStage = 3;
    cell.treeOrigin = 'player';
    simulation.selectCell(treeIndex);

    expect(simulation.harvestSelectedTreeForWood()).toBe(true);
    expect(simulation.getUnlockedBuildingTypes()).toEqual(['pump', 'nursery', 'cistern']);
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
    expect(zone.cells).toHaveLength(unknownCells.length);
    expect(zone.duration).toBeCloseTo(simulation.getScanZoneDuration(unknownCells.length));

    advance(simulation, zone.duration + 2);

    expect(simulation.scanZones).toHaveLength(0);
    expect(unknownCells.every((index) => simulation.cells[index].known)).toBe(true);
    expect(simulation.getDiscoveredSoils().length).toBeGreaterThan(0);
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
