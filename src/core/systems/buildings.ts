import { BUILDINGS, BUILDING_ORDER, SEEDS } from '../config';
import { CISTERN_CAPACITY, CISTERN_SOURCE_MIN_WATER, HARVEST_SEED_REWARD, NURSERY_CAPACITY, SCANNER_REUSE_COOLDOWN, WOOD_PER_MATURE_TREE } from '../gameConfig';
import { GRID_HEIGHT, GRID_WIDTH, TerrainType } from '../types';
import type { BuildingInstance, BuildingType, BuildingWaterStatus, PlacementResult } from '../types';
import type { SimulationContext } from '../simulationContext';
import { clamp, distance } from '../../utils/math';

export function validateBuildingPlacement(this: SimulationContext, type: BuildingType, gx: number, gy: number): PlacementResult {
  const definition = BUILDINGS[type];
  if (!this.isBuildingUnlocked(type)) return { ok: false, message: 'Infrastructure verrouillée' };
  const cooldown = this.getBuildingCooldown(type);
  if (cooldown > 0) return { ok: false, message: `${definition.name} en récupération · ${Math.ceil(cooldown)} s` };
  if (this.availableBuilding(type) <= 0) return { ok: false, message: 'Aucun exemplaire disponible' };
  if (!this.inBounds(gx, gy)) return { ok: false, message: 'Hors de la carte' };
  const cell = this.cells[this.index(gx, gy)];
  if (cell.terrain === TerrainType.Rock) return { ok: false, message: 'La roche bloque la construction' };
  if (type === 'nursery' && cell.terrain === TerrainType.Salt) return { ok: false, message: 'La pépinière ne peut pas être posée sur un sol salin' };
  if (type === 'carrier' && !this.buildings.some((building) => building.type === 'pump')) return { ok: false, message: 'Le transporteur a besoin d’une pompe existante' };
  if (type === 'carrier' && !this.buildings.some((building) => building.type === 'cistern')) return { ok: false, message: 'Construisez d’abord une cuve à remplir' };
  if (this.waterResource < definition.cost) return { ok: false, message: `Il faut ${definition.cost} 💧` };
  if (this.woodResource < (definition.woodCost ?? 0)) return { ok: false, message: `Il faut ${definition.woodCost ?? 0} bois` };
  if (this.buildings.some((building) => distance(gx, gy, building.gx, building.gy) < 3)) return { ok: false, message: 'Trop proche d’une autre construction' };
  if (cell.tree) return { ok: false, message: 'Un arbre occupe déjà cette cellule' };
  if (this.getPipeCell(gx, gy)) return { ok: false, message: 'Un tuyau traverse déjà cette cellule' };
  return { ok: true, message: `${definition.name} · coût ${this.formatBuildingCost(type)}` };
}

export function placeBuilding(this: SimulationContext, type: BuildingType, gx: number, gy: number): PlacementResult {
  const validation = this.validateBuildingPlacement(type, gx, gy);
  if (!validation.ok) { this.toast(validation.message); return validation; }
  this.waterResource -= BUILDINGS[type].cost;
  this.woodResource -= BUILDINGS[type].woodCost ?? 0;
  const building = this.makeBuilding(type, gx, gy);
  this.buildings.push(building);
  this.selectedTool = null;
  this.selectedTarget = { kind: 'building', id: building.id };
  this.currentFields = this.computeFields();
  this.addLog(`<b>${BUILDINGS[type].name}</b> installée sur la carte.`);
  if (type === 'pump') {
    this.addLog('L’outil <b>Tuyau</b> est maintenant disponible dans le dock.');
    this.unlockBuilding('nursery', 'La <b>pépinière</b> est disponible : son robot peut scanner les sols et planter les graines.');
  }
  if (type === 'nursery') {
    this.ensureNurseryWorker(building);
    this.addLog('Un <b>robot pépiniériste</b> rejoint la pépinière. Délimitez des scans ou peignez des zones de plantation.');
  }
  if (type === 'cistern') {
    this.completedTutorialSteps.add('build-cistern');
    this.addLog('La <b>cuve relais</b> peut se remplir depuis un tuyau de pompe relié directement ou par le robot pépiniériste si elle est proche.');
  }
  if (type === 'carrier') {
    this.ensureCarrierWorker(building);
    this.addLog('Un <b>robot transporteur</b> rejoint l’atelier et cherchera une cuve à remplir.');
  }
  if (type === 'pump') this.completedTutorialSteps.add('place-pump');
  this.toast(`${BUILDINGS[type].name} installée`);
  this.notify();
  return validation;
}

export function harvestSelectedTreeForWood(this: SimulationContext): boolean {
  const selected = this.getSelectedCell();
  if (!selected) return false;
  const { cell } = selected;
  if (!cell.tree || cell.treeStage < 3) {
    this.toast('Seul un arbre mature peut fournir du bois');
    return false;
  }
  const treeName = SEEDS[cell.tree].name;
  cell.tree = null;
  cell.treeStage = 0;
  cell.treeProgress = 0;
  cell.treeStress = 0;
  cell.treeOrigin = null;
  cell.nextSeedAt = Number.POSITIVE_INFINITY;
  cell.seedsProduced = 0;
  cell.cover = Math.max(cell.cover, 1) as 1 | 2;
  cell.coverProgress = Math.max(cell.coverProgress, 0.65);
  this.woodResource += WOOD_PER_MATURE_TREE;
  this.seedInventory.pioneer += HARVEST_SEED_REWARD;
  this.milestones.add('harvest-wood');
  this.completedTutorialSteps.add('harvest-wood');
  this.unlockBuilding('cistern', 'La <b>cuve relais</b> est disponible grâce au bois récolté.');
  this.addLog(`<b>${treeName}</b> abattu proprement : +${WOOD_PER_MATURE_TREE} bois pour les cuves et +${HARVEST_SEED_REWARD} graine basique.`);
  this.toast(`+${WOOD_PER_MATURE_TREE} bois · +${HARVEST_SEED_REWARD} graine`);
  this.currentFields = this.computeFields();
  this.notify();
  return true;
}

export function removeSelectedBuilding(this: SimulationContext): boolean {
  const building = this.getSelectedBuilding();
  if (!building) return false;
  if (building.type === 'nursery' && this.nurseryJob) { this.toast('La pépinière travaille encore'); return false; }
  if (building.type === 'pump') {
    const pipeCount = this.pipes.filter((pipe) => pipe.sourceType === 'pump' && pipe.sourceId === building.id).length;
    if (pipeCount) {
      this.pipes = this.pipes.filter((pipe) => pipe.sourceType !== 'pump' || pipe.sourceId !== building.id);
      this.addLog(`Le réseau de ${pipeCount} cellules relié à la pompe a aussi été démonté.`);
    }
  }
  if (building.type === 'cistern') {
    const pipeCount = this.pipes.filter((pipe) => (pipe.sourceType === 'cistern' && pipe.sourceId === building.id) || (pipe.gx === building.gx && pipe.gy === building.gy)).length;
    if (pipeCount) {
      this.pipes = this.pipes.filter((pipe) => (pipe.sourceType !== 'cistern' || pipe.sourceId !== building.id) && (pipe.gx !== building.gx || pipe.gy !== building.gy));
      this.addLog(`Les ${pipeCount} cellules de tuyau reliées à la cuve ont aussi été démontées.`);
    }
    if (this.carrierWorker?.targetCisternId === building.id) this.carrierWorker = null;
  }
  if (building.type === 'nursery') {
    this.nurseryWorker = null;
    if (this.selectedTool?.kind === 'planting-zone') this.selectedTool = null;
    this.addLog('Les zones de plantation restent dessinées mais attendront une nouvelle pépinière.');
  }
  if (building.type === 'carrier') this.carrierWorker = null;
  this.buildings = this.buildings.filter((candidate) => candidate.id !== building.id);
  if (building.type === 'scanner') {
    this.buildingCooldowns.scanner = SCANNER_REUSE_COOLDOWN;
    this.addLog(`<b>Scanner récupéré.</b> Les sols identifiés restent mémorisés. Réutilisation dans ${SCANNER_REUSE_COOLDOWN} secondes.`);
    this.toast(`Scanner disponible dans ${SCANNER_REUSE_COOLDOWN} s`);
  } else {
    this.addLog(`<b>${BUILDINGS[building.type].name}</b> récupérée et remise dans l’inventaire.`);
    this.toast('Construction récupérée');
  }
  this.selectedTarget = null;
  this.currentFields = this.computeFields();
  this.notify();
  return true;
}

export function makeBuilding(this: SimulationContext, type: BuildingType, gx: number, gy: number): BuildingInstance {
  return {
    id: this.nextBuildingId++,
    type,
    gx,
    gy,
    placedAt: this.simulationTime,
    scanProgress: 0,
    scanComplete: type !== 'scanner',
    waterStored: 0,
  };
}

export function getAffectedCells(this: SimulationContext, type: BuildingType, gx: number, gy: number): number[] {
  const radius = BUILDINGS[type].radiusCells;
  if (radius <= 0) return [];
  const indices: number[] = [];
  for (let y = Math.max(0, gy - radius); y <= Math.min(GRID_HEIGHT - 1, gy + radius); y += 1) {
    for (let x = Math.max(0, gx - radius); x <= Math.min(GRID_WIDTH - 1, gx + radius); x += 1) {
      if (distance(x, y, gx, gy) <= radius + 0.15) indices.push(this.index(x, y));
    }
  }
  return indices;
}

export function getBuildingWaterStatus(this: SimulationContext, building: BuildingInstance): BuildingWaterStatus | null {
  if (building.type === 'pump') {
    const fill = clamp(this.waterResource / this.maxWaterResource, 0, 1);
    return {
      current: this.waterResource,
      capacity: this.maxWaterResource,
      fill,
      label: 'Réserve de pompe',
      detail: `Production +${this.getWaterProduction().toFixed(1)} eau/s · sorties ouvertes ${this.getWaterConsumption().toFixed(1)} eau/s · les cuves pleines ne tirent plus d’eau`,
    };
  }
  if (building.type === 'cistern') {
    const fill = clamp(building.waterStored / CISTERN_CAPACITY, 0, 1);
    return {
      current: building.waterStored,
      capacity: CISTERN_CAPACITY,
      fill,
      label: 'Réserve de cuve',
      detail: building.waterStored >= CISTERN_SOURCE_MIN_WATER
        ? 'Assez pleine pour servir de source secondaire.'
        : `Source secondaire à partir de ${CISTERN_SOURCE_MIN_WATER} eau.`,
    };
  }
  if (building.type === 'nursery') {
    const fill = clamp(building.waterStored / NURSERY_CAPACITY, 0, 1);
    const hasPipe = Boolean(this.getPipeCell(building.gx, building.gy));
    return {
      current: building.waterStored,
      capacity: NURSERY_CAPACITY,
      fill,
      label: 'Réserve de pépinière',
      detail: hasPipe ? 'Alimentée si le tuyau a de la pression.' : 'À relier par tuyau ou à ravitailler par robot.',
    };
  }
  return null;
}

export function getBuildingStatus(this: SimulationContext, building: BuildingInstance): string {
  if (building.type === 'scanner') return building.scanComplete ? 'Analyse mémorisée — scanner déplaçable' : `Analyse ${Math.round(building.scanProgress * 100)} %`;
  if (building.type === 'pump') return `Source du réseau · ${this.pipes.filter((pipe) => pipe.sourceType === 'pump' && pipe.sourceId === building.id).length} cases reliées`;
  if (building.type === 'nursery') {
    if (!this.nurseryJob) return 'Atelier de graines — robot prêt à planter les zones peintes';
    if (this.nurseryJob.pausedReason) return `${this.nurseryJob.mode === 'cultivation' ? 'Culture' : 'Recherche'} en pause · ${this.nurseryJob.pausedReason}`;
    return `${this.nurseryJob.mode === 'cultivation' ? 'Culture' : 'Recherche'} ${Math.round(this.nurseryJob.progress * 100)} %`;
  }
  if (building.type === 'cistern') {
    const pipeCount = this.pipes.filter((pipe) => pipe.sourceType === 'cistern' && pipe.sourceId === building.id).length;
    const fill = Math.floor(building.waterStored);
    const sourceLabel = building.waterStored >= CISTERN_SOURCE_MIN_WATER ? 'source disponible' : `source à ${CISTERN_SOURCE_MIN_WATER} 💧`;
    return `${fill}/${CISTERN_CAPACITY} 💧 stockés · ${sourceLabel} · ${pipeCount} cases secondaires`;
  }
  if (building.type === 'carrier') return this.carrierWorker ? this.carrierWorker.message : 'Robot transporteur en attente de mission';
  return 'Infrastructure active';
}

export function isBuildingUnlocked(this: SimulationContext, type: BuildingType): boolean { return this.unlockedBuildings.has(type); }

export function getUnlockedBuildingTypes(this: SimulationContext, ): BuildingType[] { return BUILDING_ORDER.filter((type) => this.isBuildingUnlocked(type)); }

export function isPipeUnlocked(this: SimulationContext, ): boolean { return this.buildings.some((building) => building.type === 'pump'); }

export function canAffordBuilding(this: SimulationContext, type: BuildingType): boolean {
  const definition = BUILDINGS[type];
  return this.waterResource >= definition.cost && this.woodResource >= (definition.woodCost ?? 0);
}

export function getBuildingUnavailableReason(this: SimulationContext, type: BuildingType): string | null {
  const definition = BUILDINGS[type];
  if (!this.isBuildingUnlocked(type)) return 'Verrouillé';
  if (this.availableBuilding(type) <= 0) return 'Indisponible';
  if (this.waterResource < definition.cost) return `Il faut ${definition.cost} 💧`;
  if (this.woodResource < (definition.woodCost ?? 0)) return `Il faut ${definition.woodCost ?? 0} bois`;
  return null;
}

export function availableBuilding(this: SimulationContext, type: BuildingType): number {
  if (this.getBuildingCooldown(type) > 0) return 0;
  return Math.max(0, this.buildingTotals[type] - this.buildings.filter((building) => building.type === type).length);
}

export function getBuildingCooldown(this: SimulationContext, type: BuildingType): number { return Math.max(0, this.buildingCooldowns[type]); }

export function totalBuilding(this: SimulationContext, type: BuildingType): number { return this.buildingTotals[type]; }

export function hasNursery(this: SimulationContext, ): boolean { return this.buildings.some((building) => building.type === 'nursery'); }

export function formatBuildingCost(this: SimulationContext, type: BuildingType): string {
  const definition = BUILDINGS[type];
  const parts: string[] = [];
  if (definition.cost > 0) parts.push(`${definition.cost} 💧`);
  if ((definition.woodCost ?? 0) > 0) parts.push(`${definition.woodCost} bois`);
  return parts.length ? parts.join(' + ') : 'gratuit';
}

export function getNurseryBuilding(this: SimulationContext): BuildingInstance | null {
  return this.buildings.find((building) => building.type === 'nursery') ?? null;
}

export function getCarrierBuilding(this: SimulationContext): BuildingInstance | null {
  return this.buildings.find((building) => building.type === 'carrier') ?? null;
}

export function getPumpBuilding(this: SimulationContext): BuildingInstance | null {
  return this.buildings.find((building) => building.type === 'pump') ?? null;
}

export function workerHome(this: SimulationContext, building: BuildingInstance): { x: number; y: number } {
  return { x: building.gx + 0.5, y: building.gy + 0.5 };
}

export const buildingsMethods = {
  validateBuildingPlacement,
  placeBuilding,
  harvestSelectedTreeForWood,
  removeSelectedBuilding,
  makeBuilding,
  getAffectedCells,
  getBuildingWaterStatus,
  getBuildingStatus,
  isBuildingUnlocked,
  getUnlockedBuildingTypes,
  isPipeUnlocked,
  canAffordBuilding,
  getBuildingUnavailableReason,
  availableBuilding,
  getBuildingCooldown,
  totalBuilding,
  hasNursery,
  formatBuildingCost,
  getNurseryBuilding,
  getCarrierBuilding,
  getPumpBuilding,
  workerHome,
};
