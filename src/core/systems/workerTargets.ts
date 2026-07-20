import { TERRAIN_NAMES } from '../config';
import { CISTERN_CAPACITY, CISTERN_SOURCE_MIN_WATER, NURSERY_ROBOT_WATER_RADIUS, NURSERY_WATER_FETCH_THRESHOLD, SEED_SEARCH_RADIUS, WORKER_SPEED_CELLS_PER_SECOND } from '../gameConfig';
import { GRID_HEIGHT, GRID_WIDTH, TerrainType } from '../types';
import type { BuildingInstance, CarrierWorker, NurseryWorker, ScanZone, SeedType } from '../types';
import type { ScanTarget, SimulationContext, WorkerTarget } from '../simulationContext';
import { distance } from '../../utils/math';

export function findNextWorkerTarget(this: SimulationContext, worker: NurseryWorker): WorkerTarget | null {
  const candidates: WorkerTarget[] = [];
  for (const zone of this.plantingZones) {
    if (!zone.active || this.seedCount(zone.seed) <= 0) continue;
    for (const index of zone.cells) {
      if (this.getPlantingZoneCellState(zone, index) !== 'ready') continue;
      candidates.push({
        zoneId: zone.id,
        seed: zone.seed,
        index,
        x: (index % GRID_WIDTH) + 0.5,
        y: Math.floor(index / GRID_WIDTH) + 0.5,
      });
    }
  }
  candidates.sort((a, b) => {
    const ad = distance(worker.x, worker.y, a.x, a.y);
    const bd = distance(worker.x, worker.y, b.x, b.y);
    return ad - bd || a.zoneId - b.zoneId || a.index - b.index;
  });
  return candidates[0] ?? null;
}

export function findNextScanTarget(this: SimulationContext, worker: NurseryWorker): ScanTarget | null {
  const candidates: ScanTarget[] = [];
  for (const zone of this.scanZones) {
    if (!zone.active) continue;
    const index = this.index(zone.gx, zone.gy);
    candidates.push({
      zoneId: zone.id,
      index,
      x: zone.gx + 0.5,
      y: zone.gy + 0.5,
    });
  }
  candidates.sort((a, b) => {
    const ad = distance(worker.x, worker.y, a.x, a.y);
    const bd = distance(worker.x, worker.y, b.x, b.y);
    return ad - bd || a.zoneId - b.zoneId || a.index - b.index;
  });
  return candidates[0] ?? null;
}

export function isScanTargetQueued(this: SimulationContext, zoneId: number): boolean {
  const zone = this.scanZones.find((candidate) => candidate.id === zoneId && candidate.active);
  return Boolean(zone && zone.progress < zone.duration);
}

export function advanceScanZone(this: SimulationContext, zoneId: number, dt: number): void {
  const zone = this.scanZones.find((candidate) => candidate.id === zoneId);
  if (!zone || !zone.active) return;
  zone.progress = Math.min(zone.duration, zone.progress + dt);
  if (zone.progress >= zone.duration) this.completeScanZone(zone);
}

export function completeScanZone(this: SimulationContext, zone: ScanZone): void {
  const found = new Set<TerrainType>();
  for (const index of zone.cells) {
    const cell = this.cells[index];
    if (!cell || cell.terrain === TerrainType.Rock) continue;
    cell.known = true;
    cell.revealed = true;
    found.add(cell.terrain);
    this.discoveredSoils.add(cell.terrain);
  }
  this.scanZones = this.scanZones.filter((candidate) => candidate.id !== zone.id);
  this.completedTutorialSteps.add('scan-soil');
  const names = [...found].map((soil) => TERRAIN_NAMES[soil]).join(', ');
  this.addLog(`Scan robot terminé : ${names || 'aucun nouveau sol'} mémorisé.`);
  this.toast('Zone de sols mémorisée');
}

export function findSeedSearchTarget(this: SimulationContext): { index: number; x: number; y: number } | null {
  const nursery = this.getNurseryBuilding();
  if (!nursery) return null;
  const candidates: Array<{ index: number; x: number; y: number; score: number }> = [];
  for (let y = Math.max(0, nursery.gy - SEED_SEARCH_RADIUS); y <= Math.min(GRID_HEIGHT - 1, nursery.gy + SEED_SEARCH_RADIUS); y += 1) {
    for (let x = Math.max(0, nursery.gx - SEED_SEARCH_RADIUS); x <= Math.min(GRID_WIDTH - 1, nursery.gx + SEED_SEARCH_RADIUS); x += 1) {
      const d = distance(x, y, nursery.gx, nursery.gy);
      if (d < 3 || d > SEED_SEARCH_RADIUS) continue;
      const index = this.index(x, y);
      const cell = this.cells[index];
      if (!cell || cell.terrain === TerrainType.Rock || cell.tree) continue;
      if (this.buildings.some((building) => building.gx === x && building.gy === y)) continue;
      candidates.push({ index, x: x + 0.5, y: y + 0.5, score: d + Math.abs(x - nursery.gx) * 0.03 + Math.abs(y - nursery.gy) * 0.02 });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.index - b.index);
  return candidates[0] ?? null;
}

export function getWorkerIdleMessage(this: SimulationContext): string {
  const nursery = this.getNurseryBuilding();
  if (nursery && this.findNurseryWaterTarget(nursery)) return 'Attend de pouvoir ravitailler un bâtiment proche';
  if (this.scanZones.some((zone) => zone.active && zone.progress < zone.duration)) return 'Scan de zone en attente';
  const zonesWithCells = this.plantingZones.filter((zone) => zone.cells.length > 0);
  if (!zonesWithCells.length) return 'Aucune zone peinte';
  const activeZones = zonesWithCells.filter((zone) => zone.active);
  if (!activeZones.length) return 'Toutes les zones sont en pause';
  if (activeZones.every((zone) => this.seedCount(zone.seed) <= 0)) return 'Stock de graines épuisé pour les zones actives';
  return 'Aucune cellule prête : sol, humidité ou compatibilité à corriger';
}

export function findNurseryWaterTarget(this: SimulationContext, nursery: BuildingInstance): BuildingInstance | null {
  if (this.shouldFetchNurseryWater(nursery)) return nursery;
  const candidates = this.buildings
    .filter((building) => this.shouldFetchCisternWater(nursery, building))
    .sort((a, b) => {
      const aBelowSource = a.waterStored < CISTERN_SOURCE_MIN_WATER ? 0 : 1;
      const bBelowSource = b.waterStored < CISTERN_SOURCE_MIN_WATER ? 0 : 1;
      const distanceA = distance(nursery.gx, nursery.gy, a.gx, a.gy);
      const distanceB = distance(nursery.gx, nursery.gy, b.gx, b.gy);
      const missingA = CISTERN_CAPACITY - a.waterStored;
      const missingB = CISTERN_CAPACITY - b.waterStored;
      return aBelowSource - bBelowSource || distanceA - distanceB || missingB - missingA;
    });
  return candidates[0] ?? null;
}

export function shouldFetchNurseryWater(this: SimulationContext, nursery: BuildingInstance): boolean {
  const job = this.nurseryJob;
  if (!job || job.cycleStarted) return false;
  if (nursery.waterStored >= job.waterCost) return false;
  if (this.hasUsableNurseryPipe(nursery)) return false;
  return nursery.waterStored < Math.max(NURSERY_WATER_FETCH_THRESHOLD, job.waterCost);
}

export function shouldFetchCisternWater(this: SimulationContext, nursery: BuildingInstance, cistern: BuildingInstance): boolean {
  if (cistern.type !== 'cistern' || cistern.waterStored >= CISTERN_CAPACITY - 0.5) return false;
  if (distance(nursery.gx, nursery.gy, cistern.gx, cistern.gy) > NURSERY_ROBOT_WATER_RADIUS) return false;
  return true;
}

export function hasUsableNurseryPipe(this: SimulationContext, nursery: BuildingInstance): boolean {
  const pipe = this.getPipeCell(nursery.gx, nursery.gy);
  if (!pipe) return false;
  const level = this.getPressureLevelAt(pipe.gx, pipe.gy);
  return this.getNurseryPipeFillRate(level) > 0 && this.getSourceWater(pipe) > 0.25;
}

export function isWorkerTargetQueued(this: SimulationContext, seed: SeedType, index: number): boolean {
  return this.plantingZones.some((zone) => zone.active && zone.seed === seed && zone.cells.includes(index));
}

export function moveWorkerToward(this: SimulationContext, worker: NurseryWorker | CarrierWorker, x: number, y: number, dt: number, speed = WORKER_SPEED_CELLS_PER_SECOND): boolean {
  const dx = x - worker.x;
  const dy = y - worker.y;
  const d = Math.hypot(dx, dy);
  const step = speed * dt;
  if (d <= step || d < 0.001) {
    worker.x = x;
    worker.y = y;
    return true;
  }
  worker.x += (dx / d) * step;
  worker.y += (dy / d) * step;
  return false;
}

export const workerTargetMethods = {
  findNextWorkerTarget,
  findNextScanTarget,
  isScanTargetQueued,
  advanceScanZone,
  completeScanZone,
  findSeedSearchTarget,
  findNurseryWaterTarget,
  getWorkerIdleMessage,
  shouldFetchNurseryWater,
  shouldFetchCisternWater,
  hasUsableNurseryPipe,
  isWorkerTargetQueued,
  moveWorkerToward,
};
