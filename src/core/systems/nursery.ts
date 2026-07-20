import { RESEARCH_SEED_FOR_SOIL, SEED_ORDER, SEEDS, TERRAIN_NAMES } from '../config';
import { CULTIVATION_COST, CULTIVATION_DURATION, CULTIVATION_YIELD, RESEARCH_COST, RESEARCH_DURATION, SCAN_ZONE_BASE_DURATION, SCAN_ZONE_MAX_DURATION, SCAN_ZONE_MIN_DURATION, SCAN_ZONE_RADIUS, SCAN_ZONE_TILE_DURATION } from '../gameConfig';
import { GRID_WIDTH, TerrainType } from '../types';
import type { NurseryJob, PlacementResult, PlantingZone, PlantingZoneCellState, PlantingZoneSummary, ScanZoneSummary, SeedType } from '../types';
import type { SimulationContext } from '../simulationContext';
import { clamp } from '../../utils/math';

export function validateSeedPlacement(this: SimulationContext, seed: SeedType, gx: number, gy: number): PlacementResult {
  if (!this.isSeedUnlocked(seed)) return { ok: false, message: 'Graine encore inconnue' };
  if (this.seedCount(seed) <= 0) return { ok: false, message: 'Plus aucune graine disponible' };
  if (!this.inBounds(gx, gy)) return { ok: false, message: 'Hors de la carte' };
  const cell = this.cells[this.index(gx, gy)];
  if (cell.terrain === TerrainType.Rock) return { ok: false, message: 'Impossible de planter dans la roche' };
  if (!cell.known) return { ok: false, message: 'Scannez d’abord ce sol' };
  if (cell.tree) return { ok: false, message: 'Un arbre pousse déjà ici' };
  if (this.buildings.some((building) => building.gx === gx && building.gy === gy)) return { ok: false, message: 'Une construction occupe cette cellule' };
  const pipe = this.getPipeCell(gx, gy);
  if (pipe?.outlet) return { ok: false, message: 'Une sortie d’eau occupe cette cellule' };
  const definition = SEEDS[seed];
  if (!definition.compatibleTerrains.includes(cell.terrain)) return { ok: false, message: `${definition.name} n’est pas adaptée à ce sol` };
  const availableWater = this.currentFields.naturalWater[this.index(gx, gy)] + this.currentFields.irrigationWater[this.index(gx, gy)];
  if (availableWater < 10) return { ok: false, message: 'Trop sec : ouvrez une sortie d’eau à proximité' };
  return { ok: true, message: `Planter ${definition.name}` };
}

export function plantSeed(this: SimulationContext, seed: SeedType, gx: number, gy: number): PlacementResult {
  return this.plantSeedAt(seed, gx, gy, 'player');
}

export function startCultivation(this: SimulationContext, seed: SeedType, targetCount?: number): PlacementResult {
  if (!this.hasNursery()) return { ok: false, message: 'Placez d’abord la pépinière' };
  if (this.nurseryJob) return { ok: false, message: 'La pépinière est déjà occupée' };
  if (!this.isSeedUnlocked(seed) || this.seedCount(seed) <= 0) return { ok: false, message: 'Graine indisponible' };
  const requestedQuota = Math.max(this.seedCount(seed) + 1, Math.floor(targetCount ?? 10));
  if (requestedQuota <= this.seedCount(seed)) return { ok: false, message: 'Le quota est déjà atteint' };
  this.nurseryJob = {
    mode: 'cultivation',
    seed,
    progress: 0,
    duration: CULTIVATION_DURATION,
    waterCost: CULTIVATION_COST,
    targetCount: requestedQuota,
    cycleStarted: false,
    pausedReason: null,
  };
  this.addLog(`La pépinière cultive <b>${SEEDS[seed].name}</b> jusqu’à ${requestedQuota} graines.`);
  this.toast('Culture jusqu’au quota lancée');
  this.notify();
  return { ok: true, message: 'Culture lancée' };
}

export function startResearch(this: SimulationContext, seed: SeedType, soil: TerrainType): PlacementResult {
  if (!this.hasNursery()) return { ok: false, message: 'Placez d’abord la pépinière' };
  if (this.nurseryJob) return { ok: false, message: 'La pépinière est déjà occupée' };
  if (seed !== 'pioneer') return { ok: false, message: 'La recherche utilise une graine pionnière comme base' };
  if (!this.isSeedUnlocked(seed) || this.seedCount(seed) <= 0) return { ok: false, message: 'Graine indisponible' };
  if (!this.discoveredSoils.has(soil)) return { ok: false, message: 'Ce type de sol n’a pas encore été révélé' };
  const resultSeed = RESEARCH_SEED_FOR_SOIL[soil];
  if (!resultSeed) return { ok: false, message: 'Ce sol ne donne aucune nouvelle variété pour le moment' };
  if (this.isSeedUnlocked(resultSeed)) return { ok: false, message: 'Cette variété est déjà connue' };
  this.nurseryJob = {
    mode: 'research',
    seed,
    soil,
    progress: 0,
    duration: RESEARCH_DURATION,
    waterCost: RESEARCH_COST,
    cycleStarted: false,
    pausedReason: null,
  };
  this.addLog(`Recherche lancée : <b>${SEEDS[seed].name}</b> × <b>${TERRAIN_NAMES[soil]}</b>.`);
  this.toast('Recherche lancée');
  this.notify();
  return { ok: true, message: 'Recherche lancée' };
}

export function startSeedSearch(this: SimulationContext): PlacementResult {
  const nursery = this.getNurseryBuilding();
  if (!nursery) return { ok: false, message: 'Placez d’abord la pépinière' };
  if (this.seedInventory.pioneer > 0) return { ok: false, message: 'Une graine basique est déjà disponible' };
  const worker = this.ensureNurseryWorker(nursery);
  if (worker.state !== 'idle' && worker.state !== 'blocked') return { ok: false, message: 'Le robot est déjà occupé' };
  const target = this.findSeedSearchTarget();
  if (!target) return { ok: false, message: 'Aucun lieu de recherche proche trouvé' };
  worker.state = 'to-seed-search';
  worker.targetIndex = target.index;
  worker.targetSeed = 'pioneer';
  worker.targetScanZoneId = null;
  worker.targetBuildingId = null;
  worker.waterLoad = 0;
  worker.progress = 0;
  worker.message = 'Part chercher une graine basique';
  this.addLog('Le robot pépiniériste part chercher une <b>graine basique</b> près de la pépinière.');
  this.toast('Recherche de graine lancée');
  this.notify();
  return { ok: true, message: 'Recherche de graine lancée' };
}

export function cancelNurseryJob(this: SimulationContext): boolean {
  const job = this.nurseryJob;
  if (!job) return false;
  this.nurseryJob = null;
  this.addLog(`${job.mode === 'cultivation' ? 'Culture' : 'Recherche'} de la pépinière annulée.`);
  this.toast('Travail de pépinière annulé');
  this.wakeNurseryWorker();
  this.notify();
  return true;
}

export function validateScanZone(this: SimulationContext, gx: number, gy: number): PlacementResult {
  if (!this.hasNursery()) return { ok: false, message: 'Placez d’abord la pépinière' };
  if (!this.inBounds(gx, gy)) return { ok: false, message: 'Hors de la carte' };
  const cells = this.getScanZoneCells(gx, gy);
  const unknown = cells.filter((index) => !this.cells[index].known && !this.isScanCellQueued(index));
  if (!unknown.length) return { ok: false, message: 'Cette zone est déjà connue ou déjà programmée' };
  const duration = this.getScanZoneDuration(unknown.length);
  return { ok: true, message: `Analyser ${unknown.length} tuile${unknown.length > 1 ? 's' : ''} · ${Math.ceil(duration)} s` };
}

export function createScanZone(this: SimulationContext, gx: number, gy: number): PlacementResult {
  const validation = this.validateScanZone(gx, gy);
  if (!validation.ok) { this.toast(validation.message); return validation; }
  const cells = this.getScanZoneCells(gx, gy).filter((index) => !this.cells[index].known && !this.isScanCellQueued(index));
  const duration = this.getScanZoneDuration(cells.length);
  this.scanZones.push({ id: this.nextScanZoneId++, gx, gy, cells, progress: 0, duration, active: true });
  this.wakeNurseryWorker();
  this.addLog(`Zone d’analyse confiée au robot : <b>${cells.length} tuiles</b> à mémoriser en ${Math.ceil(duration)} s.`);
  this.toast('Zone de scan programmée');
  this.notify();
  return validation;
}

export function getScanZoneCells(this: SimulationContext, gx: number, gy: number): number[] {
  return this.getCellsInRadius(gx, gy, SCAN_ZONE_RADIUS).filter((index) => this.cells[index].terrain !== TerrainType.Rock);
}

export function getScanZoneDuration(this: SimulationContext, cellCount: number): number {
  return clamp(SCAN_ZONE_BASE_DURATION + cellCount * SCAN_ZONE_TILE_DURATION, SCAN_ZONE_MIN_DURATION, SCAN_ZONE_MAX_DURATION);
}

export function getScanZoneSummaries(this: SimulationContext): ScanZoneSummary[] {
  return this.scanZones.map((zone) => ({
    id: zone.id,
    active: zone.active,
    totalCells: zone.cells.length,
    progress: zone.progress,
    duration: zone.duration,
  }));
}

export function isScanCellQueued(this: SimulationContext, index: number): boolean {
  return this.scanZones.some((zone) => zone.active && zone.cells.includes(index));
}

export function validatePlantingZonePaint(this: SimulationContext, gx: number, gy: number): PlacementResult {
  if (!this.hasNursery()) return { ok: false, message: 'Placez d’abord la pépinière' };
  if (!this.selectedTool || this.selectedTool.kind !== 'planting-zone') return { ok: false, message: 'Aucun pinceau de zone sélectionné' };
  if (!this.inBounds(gx, gy)) return { ok: false, message: 'Hors de la carte' };
  const index = this.index(gx, gy);
  if (this.selectedTool.mode === 'erase') {
    return this.getPlantingZoneAt(index)
      ? { ok: true, message: 'Retirer cette case des zones de plantation' }
      : { ok: false, message: 'Aucune zone sur cette case' };
  }
  const seed = this.selectedTool.seed;
  if (!this.isSeedUnlocked(seed)) return { ok: false, message: 'Graine encore inconnue' };
  const validation = this.validateSeedPlacement(seed, gx, gy);
  return validation.ok
    ? { ok: true, message: `Zone ${SEEDS[seed].name} · cellule prête` }
    : { ok: false, message: `Zone ${SEEDS[seed].name} · bloquée : ${validation.message}` };
}

export function paintPlantingZone(this: SimulationContext, gx: number, gy: number): PlacementResult {
  if (!this.selectedTool || this.selectedTool.kind !== 'planting-zone') return { ok: false, message: 'Aucun pinceau de zone sélectionné' };
  if (!this.hasNursery()) { this.toast('Placez d’abord la pépinière'); return { ok: false, message: 'Placez d’abord la pépinière' }; }
  if (!this.inBounds(gx, gy)) return { ok: false, message: 'Hors de la carte' };
  const index = this.index(gx, gy);
  if (this.selectedTool.mode === 'erase') {
    const changed = this.removePlantingZoneCell(index);
    if (changed) this.notify();
    return changed ? { ok: true, message: 'Case retirée de la zone' } : { ok: false, message: 'Aucune zone sur cette case' };
  }
  const seed = this.selectedTool.seed;
  if (!this.isSeedUnlocked(seed)) return { ok: false, message: 'Graine encore inconnue' };
  const changed = this.paintZoneCells(seed, [index]);
  if (changed) {
    this.wakeNurseryWorker();
    this.notify();
  }
  const validation = this.validateSeedPlacement(seed, gx, gy);
  return validation.ok
    ? { ok: true, message: 'Cellule ajoutée à la zone' }
    : { ok: true, message: `Cellule ajoutée mais bloquée : ${validation.message}` };
}

export function getPlantingZoneSummaries(this: SimulationContext): PlantingZoneSummary[] {
  return this.plantingZones.map((zone) => {
    let readyCells = 0;
    let plantedCells = 0;
    for (const index of zone.cells) {
      const state = this.getPlantingZoneCellState(zone, index);
      if (state === 'ready') readyCells += 1;
      else if (state === 'planted') plantedCells += 1;
    }
    return {
      id: zone.id,
      seed: zone.seed,
      active: zone.active,
      totalCells: zone.cells.length,
      readyCells,
      plantedCells,
      blockedCells: Math.max(0, zone.cells.length - readyCells - plantedCells),
    };
  });
}

export function getPlantingZoneCellState(this: SimulationContext, zone: PlantingZone, index: number): PlantingZoneCellState {
  const cell = this.cells[index];
  if (!cell) return 'blocked';
  if (cell.tree === zone.seed) return 'planted';
  const x = index % GRID_WIDTH;
  const y = Math.floor(index / GRID_WIDTH);
  return this.validateSeedPlacement(zone.seed, x, y).ok ? 'ready' : 'blocked';
}

export function getPlantingZoneAt(this: SimulationContext, index: number): PlantingZone | null {
  return this.plantingZones.find((zone) => zone.cells.includes(index)) ?? null;
}

export function togglePlantingZone(this: SimulationContext, id: number): boolean {
  const zone = this.plantingZones.find((candidate) => candidate.id === id);
  if (!zone) return false;
  zone.active = !zone.active;
  this.wakeNurseryWorker();
  this.notify();
  return true;
}

export function clearPlantingZone(this: SimulationContext, id: number): boolean {
  const before = this.plantingZones.length;
  this.plantingZones = this.plantingZones.filter((zone) => zone.id !== id);
  if (before === this.plantingZones.length) return false;
  this.wakeNurseryWorker();
  this.addLog('Une zone de plantation a été retirée.');
  this.notify();
  return true;
}

export function advanceNurseryJob(this: SimulationContext, dt: number): void {
  const job = this.nurseryJob;
  if (!job) return;
  if (job.mode === 'cultivation' && job.targetCount !== undefined && this.seedInventory[job.seed] >= job.targetCount && !job.cycleStarted) {
    this.addLog(`Quota atteint : <b>${this.seedInventory[job.seed]} graines de ${SEEDS[job.seed].name}</b> sont en stock.`);
    this.toast('Quota de graines atteint');
    this.nurseryJob = null;
    this.wakeNurseryWorker();
    this.notify();
    return;
  }
  if (!job.cycleStarted && !this.tryStartNurseryCycle(job)) return;
  job.progress = Math.min(1, job.progress + dt / job.duration);
  if (job.progress < 1) return;
  this.completeNurseryCycle(job);
}

export function tryStartNurseryCycle(this: SimulationContext, job: NurseryJob): boolean {
  const nursery = this.getNurseryBuilding();
  if (!nursery) {
    this.pauseNurseryJob(job, 'Pépinière absente.');
    return false;
  }
  if (this.seedInventory[job.seed] <= 0) {
    this.pauseNurseryJob(job, `Aucune graine mère de ${SEEDS[job.seed].name}.`);
    return false;
  }
  if (nursery.waterStored < job.waterCost) {
    this.pauseNurseryJob(job, `Réserve de pépinière trop basse : ${Math.floor(nursery.waterStored)}/${job.waterCost} eau.`);
    return false;
  }
  this.seedInventory[job.seed] -= 1;
  nursery.waterStored -= job.waterCost;
  job.cycleStarted = true;
  job.pausedReason = null;
  job.progress = 0;
  this.addLog(`${job.mode === 'cultivation' ? 'Cycle de culture' : 'Recherche'} lancé dans la pépinière : -${job.waterCost} eau locale.`);
  this.notify();
  return true;
}

export function pauseNurseryJob(this: SimulationContext, job: NurseryJob, reason: string): void {
  if (job.pausedReason === reason) return;
  job.pausedReason = reason;
  this.notify();
}

export function completeNurseryCycle(this: SimulationContext, job: NurseryJob): void {
  if (job.mode === 'cultivation') {
    this.seedInventory[job.seed] += CULTIVATION_YIELD;
    job.cycleStarted = false;
    job.progress = 0;
    const quotaReached = job.targetCount !== undefined && this.seedInventory[job.seed] >= job.targetCount;
    this.addLog(`Culture terminée : <b>${CULTIVATION_YIELD} graines de ${SEEDS[job.seed].name}</b> rejoignent l’inventaire.`);
    this.toast(quotaReached ? 'Quota de graines atteint' : `+${CULTIVATION_YIELD} graines`);
    if (quotaReached) this.nurseryJob = null;
  } else if (job.soil !== undefined) {
    const result = RESEARCH_SEED_FOR_SOIL[job.soil];
    if (result) {
      this.unlockedSeeds.add(result);
      this.seedInventory[result] += 1;
      this.addLog(`Recherche terminée : <b>${SEEDS[result].name}</b> est maintenant disponible.`);
      this.toast(`${SEEDS[result].name} découverte`);
      this.milestones.add('research');
    }
    this.nurseryJob = null;
  }
  this.wakeNurseryWorker();
  this.notify();
}

export function plantSeedAt(this: SimulationContext, seed: SeedType, gx: number, gy: number, actor: 'player' | 'worker'): PlacementResult {
  const validation = this.validateSeedPlacement(seed, gx, gy);
  if (!validation.ok) {
    if (actor === 'player') this.toast(validation.message);
    return validation;
  }
  const index = this.index(gx, gy);
  const cell = this.cells[index];
  cell.tree = seed;
  cell.treeStage = 0;
  cell.treeProgress = 0;
  cell.treeStress = 0;
  cell.treeOrigin = 'player';
  cell.nextSeedAt = Number.POSITIVE_INFINITY;
  cell.seedsProduced = 0;
  this.seedInventory[seed] -= 1;
  this.completedTutorialSteps.add('plant-seed');
  if (actor === 'player') {
    this.selectedTool = null;
    this.selectedTarget = { kind: 'cell', index };
    this.addLog(`Une graine de <b>${SEEDS[seed].name}</b> a été mise en terre.`);
    this.toast('Graine plantée');
  } else {
    this.addLog(`Le robot pépiniériste plante <b>${SEEDS[seed].name}</b> dans une zone préparée.`);
    this.toast('Le robot plante une graine');
  }
  this.notify();
  return validation;
}

export function paintZoneCells(this: SimulationContext, seed: SeedType, indices: number[]): boolean {
  let zone = this.plantingZones.find((candidate) => candidate.seed === seed);
  let changed = false;
  if (!zone) {
    zone = { id: this.nextPlantingZoneId++, seed, cells: [], active: true };
    this.plantingZones.push(zone);
    changed = true;
  }
  const zoneCells = new Set(zone.cells);
  for (const index of indices) {
    for (const otherZone of this.plantingZones) {
      if (otherZone.id === zone.id) continue;
      const before = otherZone.cells.length;
      otherZone.cells = otherZone.cells.filter((candidate) => candidate !== index);
      if (otherZone.cells.length !== before) changed = true;
    }
    if (!zoneCells.has(index)) {
      zoneCells.add(index);
      changed = true;
    }
  }
  zone.cells = [...zoneCells].sort((a, b) => a - b);
  this.pruneEmptyPlantingZones();
  return changed;
}

export function removePlantingZoneCell(this: SimulationContext, index: number): boolean {
  let changed = false;
  for (const zone of this.plantingZones) {
    const before = zone.cells.length;
    zone.cells = zone.cells.filter((candidate) => candidate !== index);
    if (zone.cells.length !== before) changed = true;
  }
  this.pruneEmptyPlantingZones();
  return changed;
}

export function pruneEmptyPlantingZones(this: SimulationContext): void {
  this.plantingZones = this.plantingZones.filter((zone) => zone.cells.length > 0);
}

export function isSeedUnlocked(this: SimulationContext, type: SeedType): boolean { return this.unlockedSeeds.has(type); }

export function getUnlockedSeedTypes(this: SimulationContext, ): SeedType[] { return SEED_ORDER.filter((type) => this.isSeedUnlocked(type)); }

export function seedCount(this: SimulationContext, type: SeedType): number { return this.seedInventory[type]; }

export function getDiscoveredSoils(this: SimulationContext, ): TerrainType[] { return [...this.discoveredSoils].filter((soil) => soil !== TerrainType.Rock); }

export function getResearchableSoils(this: SimulationContext): TerrainType[] {
  return this.getDiscoveredSoils()
    .filter((soil) => soil !== TerrainType.Sand)
    .filter((soil) => {
      const resultSeed = RESEARCH_SEED_FOR_SOIL[soil];
      return Boolean(resultSeed && !this.isSeedUnlocked(resultSeed));
    })
    .sort((a, b) => a - b);
}

export const nurseryMethods = {
  validateSeedPlacement,
  plantSeed,
  startCultivation,
  startResearch,
  startSeedSearch,
  cancelNurseryJob,
  validateScanZone,
  createScanZone,
  getScanZoneCells,
  getScanZoneDuration,
  getScanZoneSummaries,
  isScanCellQueued,
  validatePlantingZonePaint,
  paintPlantingZone,
  getPlantingZoneSummaries,
  getPlantingZoneCellState,
  getPlantingZoneAt,
  togglePlantingZone,
  clearPlantingZone,
  advanceNurseryJob,
  tryStartNurseryCycle,
  pauseNurseryJob,
  completeNurseryCycle,
  plantSeedAt,
  paintZoneCells,
  removePlantingZoneCell,
  pruneEmptyPlantingZones,
  isSeedUnlocked,
  getUnlockedSeedTypes,
  seedCount,
  getDiscoveredSoils,
  getResearchableSoils,
};
