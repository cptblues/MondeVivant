import { BUILDING_ORDER } from '../config';
import { SCAN_ZONE_RADIUS } from '../gameConfig';
import { createBuildingCooldowns, createBuildingTotals, createInitialCells, createSeedInventory } from '../state';
import { GRID_HEIGHT, GRID_WIDTH, TerrainType } from '../types';
import type { BuildingType, PlacementResult, PlacementTool, SeedType } from '../types';
import type { SimulationContext } from '../simulationContext';
import { clamp, distance, indexOf } from '../../utils/math';

export function reset(this: SimulationContext): void {
  this.cells = createInitialCells();
  this.buildings = [];
  this.pipes = [];
  this.selectedTool = { kind: 'building', type: 'pump' };
  this.selectedTarget = null;
  this.pipeSource = null;
  this.speed = 1;
  this.simulationTime = 0;
  this.waterResource = 18;
  this.woodResource = 0;
  this.nurseryJob = null;
  this.plantingZones = [];
  this.scanZones = [];
  this.tasks = [];
  this.nurseryWorker = null;
  this.nextBuildingId = 1;
  this.nextPlantingZoneId = 1;
  this.nextScanZoneId = 1;
  this.buildingTotals = createBuildingTotals();
  this.buildingCooldowns = createBuildingCooldowns();
  this.unlockedBuildings = new Set<BuildingType>(['pump']);
  this.unlockedSeeds = new Set<SeedType>(['pioneer']);
  this.seedInventory = createSeedInventory();
  this.discoveredSoils.clear();
  this.milestones.clear();
  this.completedTutorialSteps.clear();
  this.logs = [];
  this.currentFields = this.computeFields();
  this.addLog('Nouvelle carte : la nature attend son premier réseau d’irrigation.');
  this.notify();
}

export function loadDemo(this: SimulationContext): void {
  this.reset();
  const pump = this.makeBuilding('pump', 19, 25);
  const nursery = this.makeBuilding('nursery', 31, 25);
  this.unlockedBuildings = new Set<BuildingType>(['pump', 'nursery']);
  this.buildings = [pump, nursery];
  this.ensureNurseryWorker(nursery);
  this.waterResource = 76;
  for (const index of this.getCellsInRadius(25, 23, SCAN_ZONE_RADIUS)) {
    const cell = this.cells[index];
    if (cell.terrain !== TerrainType.Rock) {
      cell.known = true;
      cell.revealed = true;
      this.discoveredSoils.add(cell.terrain);
    }
  }
  this.addPipeRoute({ type: 'pump', id: pump.id }, 28, 29);
  this.addPipeRoute({ type: 'pump', id: pump.id }, 14, 18);
  const first = this.getPipeCell(28, 29);
  const second = this.getPipeCell(14, 18);
  if (first) { first.outlet = true; first.outletOpen = true; }
  if (second) { second.outlet = true; second.outletOpen = false; }

  const demoTrees: Array<[number, number, SeedType, number]> = [
    [23, 27, 'pioneer', 3], [26, 28, 'pioneer', 2], [18, 23, 'pioneer', 1],
  ];
  for (const [x, y, seed, stage] of demoTrees) {
    const cell = this.cells[this.index(x, y)];
    cell.tree = seed;
    cell.treeStage = stage as 0 | 1 | 2 | 3;
    cell.treeOrigin = stage === 1 ? 'natural' : 'player';
    cell.treeProgress = 0.6;
    cell.cover = 2;
    cell.coverProgress = 1;
    if (stage === 3) cell.nextSeedAt = this.simulationTime + 8;
  }
  for (let y = 20; y < 34; y += 1) {
    for (let x = 15; x < 34; x += 1) {
      const cell = this.cells[this.index(x, y)];
      if (cell.terrain !== TerrainType.Rock && distance(x, y, 24, 27) < 10) {
        cell.cover = distance(x, y, 24, 27) < 7 ? 2 : 1;
        cell.coverProgress = 0.8;
      }
    }
  }
  this.unlockedSeeds.add('willow');
  this.seedInventory.willow = 2;
  this.paintZoneCells('pioneer', [
    this.index(21, 26), this.index(22, 26), this.index(23, 26),
    this.index(21, 27), this.index(22, 27), this.index(23, 27),
  ]);
  this.milestones.add('research');
  this.selectedTool = null;
  this.currentFields = this.computeFields();
  this.syncTutorialProgress();
  this.syncRobotTasks();
  this.addLog('Démo chargée : une sortie est ouverte, une seconde attend d’être activée.');
  this.toast('Démo avancée chargée');
  this.notify();
}

export function update(this: SimulationContext, deltaSeconds: number): void {
  const dt = Math.min(1, Math.max(0, deltaSeconds));
  this.simulationTime += dt;

  for (const type of BUILDING_ORDER) {
    this.buildingCooldowns[type] = Math.max(0, this.buildingCooldowns[type] - dt);
  }

  const production = this.getWaterProduction();
  this.waterResource = clamp(this.waterResource + production * dt, 0, this.maxWaterResource);
  this.waterResource = clamp(this.waterResource - this.getWaterConsumption() * dt, 0, this.maxWaterResource);
  this.drainCisternOutlets(dt);
  this.updateBuildingsFromPipes(dt);
  this.drainLocalIrrigation(dt);
  this.advanceNurseryJob(dt);

  const fields = this.computeFields();
  this.currentFields = fields;
  for (let i = 0; i < this.cells.length; i += 1) {
    const cell = this.cells[i];
    if (cell.terrain === TerrainType.Rock) continue;
    let targetWater = fields.naturalWater[i] + fields.irrigationWater[i];
    let targetShade = fields.naturalShade[i];
    let targetHumus = fields.naturalHumus[i];
    if (cell.terrain === TerrainType.Dune) targetWater *= 0.68;
    if (cell.terrain === TerrainType.Salt) targetHumus *= 0.72;
    cell.water += (clamp(targetWater) - cell.water) * Math.min(1, 0.2 * dt);
    cell.shade += (clamp(targetShade) - cell.shade) * Math.min(1, 0.18 * dt);
    cell.humus += (clamp(targetHumus) - cell.humus) * Math.min(1, 0.14 * dt);
    this.updateGroundCover(cell, fields.growthBoost[i], dt);
    this.updateTree(i, fields.growthBoost[i], dt);
  }
  this.syncRobotTasks();
  this.updateNurseryWorker(dt);
  this.checkMilestones();
}

export function setSpeed(this: SimulationContext, speed: number): void {
  this.speed = speed;
  this.notify();
}

export function selectTool(this: SimulationContext, tool: PlacementTool): void {
  const same = JSON.stringify(this.selectedTool) === JSON.stringify(tool);
  if (same) {
    this.selectedTool = null;
    this.selectedTarget = null;
    this.pipeSource = null;
    this.notify();
    return;
  }
  if (tool?.kind === 'building') {
    if (!this.isBuildingUnlocked(tool.type) || this.availableBuilding(tool.type) <= 0) return;
    if (!this.canAffordBuilding(tool.type)) {
      this.toast(this.getBuildingUnavailableReason(tool.type) ?? 'Ressources insuffisantes');
      return;
    }
  }
  if (tool?.kind === 'planting-zone') {
    if (!this.hasNursery()) { this.toast('Placez d’abord la pépinière pour tracer des zones'); return; }
    if (tool.mode === 'paint' && !this.isSeedUnlocked(tool.seed)) return;
  }
  if (tool?.kind === 'scan-zone' && !this.hasNursery()) { this.toast('Placez d’abord la pépinière pour lancer des scans'); return; }
  if (tool?.kind === 'pipe' && !this.isPipeUnlocked()) return;
  this.selectedTool = tool;
  this.selectedTarget = null;
  if (this.selectedTool?.kind !== 'pipe') this.pipeSource = null;
  if (this.selectedTool?.kind === 'pipe') this.completedTutorialSteps.add('select-pipe');
  this.notify();
}

export function selectBuilding(this: SimulationContext, id: number): void {
  if (!this.buildings.some((building) => building.id === id)) return;
  this.selectedTool = null;
  this.pipeSource = null;
  this.selectedTarget = { kind: 'building', id };
  this.notify();
}

export function selectPipe(this: SimulationContext, gx: number, gy: number): void {
  if (!this.getPipeCell(gx, gy)) return;
  this.selectedTool = null;
  this.pipeSource = null;
  this.selectedTarget = { kind: 'pipe', gx, gy };
  this.notify();
}

export function selectCell(this: SimulationContext, index: number): void {
  if (!this.cells[index]) return;
  this.selectedTool = null;
  this.pipeSource = null;
  this.selectedTarget = { kind: 'cell', index };
  this.notify();
}

export function clearSelection(this: SimulationContext): void {
  this.selectedTarget = null;
  this.notify();
}

export function placeSelected(this: SimulationContext, gx: number, gy: number): PlacementResult {
  if (!this.selectedTool) return { ok: false, message: 'Aucun outil sélectionné' };
  if (this.selectedTool.kind === 'building') return this.placeBuilding(this.selectedTool.type, gx, gy);
  if (this.selectedTool.kind === 'scan-zone') return this.createScanZone(gx, gy);
  if (this.selectedTool.kind === 'planting-zone') return this.paintPlantingZone(gx, gy);
  return this.handlePipeToolClick(gx, gy);
}

export function validateSelected(this: SimulationContext, gx: number, gy: number): PlacementResult {
  if (!this.selectedTool) return { ok: false, message: 'Aucun outil sélectionné' };
  if (this.selectedTool.kind === 'building') return this.validateBuildingPlacement(this.selectedTool.type, gx, gy);
  if (this.selectedTool.kind === 'scan-zone') return this.validateScanZone(gx, gy);
  if (this.selectedTool.kind === 'planting-zone') return this.validatePlantingZonePaint(gx, gy);
  return this.validatePipeClick(gx, gy);
}

export function getCellsInRadius(this: SimulationContext, gx: number, gy: number, radius: number): number[] {
  if (!radius) return [];
  const result: number[] = [];
  for (let y = Math.max(0, Math.floor(gy - radius)); y <= Math.min(GRID_HEIGHT - 1, Math.ceil(gy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(gx - radius)); x <= Math.min(GRID_WIDTH - 1, Math.ceil(gx + radius)); x += 1) {
      if (distance(x, y, gx, gy) <= radius + 0.08) result.push(this.index(x, y));
    }
  }
  return result;
}

export function inBounds(this: SimulationContext, x: number, y: number): boolean { return x >= 0 && y >= 0 && x < GRID_WIDTH && y < GRID_HEIGHT; }

export function index(this: SimulationContext, x: number, y: number): number { return indexOf(x, y, GRID_WIDTH); }

export function pipeKey(this: SimulationContext, x: number, y: number): string { return `${x},${y}`; }

export function addLog(this: SimulationContext, message: string): void { this.logs.unshift(message); if (this.logs.length > 24) this.logs.length = 24; }

export function toast(this: SimulationContext, message: string): void { this.events.onToast?.(message); }

export function notify(this: SimulationContext, ): void { this.events.onStateChanged?.(); }

export const runtimeMethods = {
  reset,
  loadDemo,
  update,
  setSpeed,
  selectTool,
  selectBuilding,
  selectPipe,
  selectCell,
  clearSelection,
  placeSelected,
  validateSelected,
  getCellsInRadius,
  inBounds,
  index,
  pipeKey,
  addLog,
  toast,
  notify,
};
