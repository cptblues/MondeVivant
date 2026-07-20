import { SEED_ORDER, SEEDS, TERRAIN_NAMES } from '../config';
import {
  RESTORATION_AUTONOMY,
  ROBOT_HOUSE_MAX_PARCEL_HEIGHT,
  ROBOT_HOUSE_MAX_PARCEL_TILES,
  ROBOT_HOUSE_MAX_PARCEL_WIDTH,
  ROBOT_HOUSE_CAPACITY,
  ROBOT_HOUSE_WATER_BUFFER,
  ROBOT_HOUSE_WATER_PER_TASK,
  ROBOT_HOUSE_WATER_TRANSFER_AMOUNT,
  ROBOT_HOUSE_WATERING_AMOUNT,
  ROBOT_TASK_PRIORITIES,
} from '../gameConfig';
import { createEmptySeedInventory } from '../state';
import { GRID_WIDTH, TerrainType } from '../types';
import type { BuildingInstance, PlacementResult, RestorationParcel, RestorationParcelBounds, RobotTask, SeedType } from '../types';
import type { SimulationContext } from '../simulationContext';
import { clamp } from '../../utils/math';

const EMPTY_PROGRESS = { analysis: 0, preparation: 0, planting: 0, maintenance: 0, biodiversity: 0, autonomy: 0 } as const;

function parcelId(homeBuildingId: number): string {
  return `parcel:${homeBuildingId}`;
}

function taskId(homeBuildingId: number, type: 'scan' | 'prepare' | 'plant' | 'water', index: number): string {
  return `restore:${homeBuildingId}:${type}:${index}`;
}

function emptyParcel(homeBuildingId: number, now: number): RestorationParcel {
  return {
    id: parcelId(homeBuildingId),
    homeBuildingId,
    bounds: null,
    state: 'unassigned',
    totalTiles: 0,
    analyzedTiles: 0,
    preparedTiles: 0,
    plantableTiles: 0,
    plantedCount: 0,
    vegetationCoverage: 0,
    speciesPresent: 0,
    healthyPlantRatio: 0,
    developedTrees: 0,
    needs: ['Définir une parcelle rectangulaire.'],
    blockers: [],
    progress: { ...EMPTY_PROGRESS },
    autonomousSince: null,
    updatedAt: now,
  };
}

function normalizeBounds(a: { gx: number; gy: number }, b: { gx: number; gy: number }): RestorationParcelBounds {
  return {
    minX: Math.min(a.gx, b.gx),
    minY: Math.min(a.gy, b.gy),
    maxX: Math.max(a.gx, b.gx),
    maxY: Math.max(a.gy, b.gy),
  };
}

function boundsSize(bounds: RestorationParcelBounds): { width: number; height: number; tiles: number } {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  return { width, height, tiles: width * height };
}

function inventoryFor(house: BuildingInstance): Record<SeedType, number> {
  if (!house.seedInventory) house.seedInventory = createEmptySeedInventory();
  return house.seedInventory;
}

function isHomeCell(house: BuildingInstance, index: number): boolean {
  return index === house.gy * GRID_WIDTH + house.gx;
}

function cellPosition(index: number): { gx: number; gy: number } {
  return { gx: index % GRID_WIDTH, gy: Math.floor(index / GRID_WIDTH) };
}

function structuralPlantBlocker(simulation: SimulationContext, parcel: RestorationParcel, index: number): string | null {
  const house = simulation.getRobotHouseBuilding(parcel.homeBuildingId);
  if (!house || isHomeCell(house, index)) return 'Cellule occupée par la maison';
  const cell = simulation.cells[index];
  if (!cell) return 'Cellule hors carte';
  const { gx, gy } = cellPosition(index);
  if (cell.terrain === TerrainType.Rock) return 'Roche affleurante';
  const building = simulation.buildings.find((candidate) => candidate.gx === gx && candidate.gy === gy);
  if (building) return 'Construction présente';
  if (simulation.getPipeCell(gx, gy)?.outlet) return 'Sortie d’eau présente';
  return null;
}

function compatibleUnlockedSeeds(simulation: SimulationContext, terrain: TerrainType): SeedType[] {
  return SEED_ORDER.filter((seed) => simulation.isSeedUnlocked(seed) && SEEDS[seed].compatibleTerrains.includes(terrain));
}

function localCompatibleSeeds(simulation: SimulationContext, house: BuildingInstance, terrain: TerrainType): SeedType[] {
  const inventory = inventoryFor(house);
  return compatibleUnlockedSeeds(simulation, terrain).filter((seed) => inventory[seed] > 0);
}

function getParcelSpeciesCounts(simulation: SimulationContext, parcel: RestorationParcel): Map<SeedType, number> {
  const counts = new Map<SeedType, number>();
  for (const index of simulation.getRestorationParcelCells(parcel)) {
    const tree = simulation.cells[index]?.tree;
    if (tree) counts.set(tree, (counts.get(tree) ?? 0) + 1);
  }
  return counts;
}

function isStructurallyPlantable(simulation: SimulationContext, parcel: RestorationParcel, index: number): boolean {
  const cell = simulation.cells[index];
  if (!cell || !cell.known) return false;
  if (structuralPlantBlocker(simulation, parcel, index)) return false;
  return compatibleUnlockedSeeds(simulation, cell.terrain).length > 0;
}

function validateRobotHouseSeedPlacement(simulation: SimulationContext, homeBuildingId: number, seed: SeedType, gx: number, gy: number): PlacementResult {
  const house = simulation.getRobotHouseBuilding(homeBuildingId);
  if (!house) return { ok: false, message: 'Maison de robot introuvable' };
  if (!simulation.isSeedUnlocked(seed)) return { ok: false, message: 'Graine encore inconnue' };
  if (inventoryFor(house)[seed] <= 0) return { ok: false, message: 'Plus aucune graine disponible' };
  if (!simulation.inBounds(gx, gy)) return { ok: false, message: 'Hors de la carte' };
  const index = simulation.index(gx, gy);
  const parcel = simulation.getRestorationParcelForHouse(homeBuildingId);
  if (!parcel?.bounds || !simulation.getRestorationParcelCells(parcel).includes(index)) return { ok: false, message: 'Tuile hors parcelle' };
  const cell = simulation.cells[index];
  if (cell.terrain === TerrainType.Rock) return { ok: false, message: 'Impossible de planter dans la roche' };
  if (!cell.known) return { ok: false, message: 'Tuile à analyser avant intervention' };
  if (cell.tree) return { ok: false, message: 'Un arbre pousse déjà ici' };
  if (cell.preparedByRobotHouseId !== homeBuildingId) return { ok: false, message: 'Sol non préparé' };
  if (simulation.buildings.some((building) => building.gx === gx && building.gy === gy)) return { ok: false, message: 'Une construction occupe cette cellule' };
  if (simulation.getPipeCell(gx, gy)?.outlet) return { ok: false, message: 'Une sortie d’eau occupe cette cellule' };
  const definition = SEEDS[seed];
  if (!definition.compatibleTerrains.includes(cell.terrain)) return { ok: false, message: `${definition.name} n’est pas adaptée à ce sol` };
  if (cell.water < 10) return { ok: false, message: 'Trop sec : arrosez avec la réserve de la maison' };
  return { ok: true, message: `Planter ${definition.name}` };
}

function refreshRestorationParcel(simulation: SimulationContext, parcel: RestorationParcel, dt: number): void {
  const house = simulation.getRobotHouseBuilding(parcel.homeBuildingId);
  if (!house) return;
  const needs: string[] = [];
  const blockers: string[] = [];

  if (!parcel.bounds) {
    Object.assign(parcel, {
      state: 'unassigned',
      totalTiles: 0,
      analyzedTiles: 0,
      preparedTiles: 0,
      plantableTiles: 0,
      plantedCount: 0,
      vegetationCoverage: 0,
      speciesPresent: 0,
      healthyPlantRatio: 0,
      developedTrees: 0,
      needs: ['Définir une parcelle rectangulaire.'],
      blockers,
      progress: { ...EMPTY_PROGRESS },
      autonomousSince: null,
      updatedAt: simulation.simulationTime,
    });
    return;
  }

  const cells = simulation.getRestorationParcelCells(parcel).filter((index) => !isHomeCell(house, index));
  const species = new Set<SeedType>();
  const compatibleSpeciesPossible = new Set<SeedType>();
  let analyzedTiles = 0;
  let preparedTiles = 0;
  let plantableTiles = 0;
  let plantedCount = 0;
  let vegetatedTiles = 0;
  let healthyPlants = 0;
  let treeCount = 0;
  let stressedPlants = 0;
  let developedTrees = 0;
  let emptyPlantable = 0;
  let unpreparedPlantable = 0;
  let dryUrgentPlants = 0;
  let invalidKnownTiles = 0;
  const invalidReasons = new Set<string>();
  const localCompatible = new Set<SeedType>();

  for (const index of cells) {
    const cell = simulation.cells[index];
    if (!cell) continue;
    if (cell.known) analyzedTiles += 1;
    if (cell.cover > 0 || cell.tree) vegetatedTiles += 1;
    if (cell.tree) {
      species.add(cell.tree);
      treeCount += 1;
      if (cell.treeStress <= RESTORATION_AUTONOMY.healthyStressLimit) healthyPlants += 1;
      else stressedPlants += 1;
      if (cell.treeStage >= RESTORATION_AUTONOMY.developedTreeStage) developedTrees += 1;
    }
    if (!cell.known) continue;
    for (const seed of compatibleUnlockedSeeds(simulation, cell.terrain)) compatibleSpeciesPossible.add(seed);
    for (const seed of localCompatibleSeeds(simulation, house, cell.terrain)) localCompatible.add(seed);

    const structuralBlocker = structuralPlantBlocker(simulation, parcel, index);
    if (structuralBlocker) {
      invalidKnownTiles += 1;
      invalidReasons.add(structuralBlocker);
      continue;
    }
    if (!compatibleUnlockedSeeds(simulation, cell.terrain).length) {
      invalidKnownTiles += 1;
      invalidReasons.add(`Aucune espèce connue pour ${TERRAIN_NAMES[cell.terrain]}`);
      continue;
    }

    plantableTiles += 1;
    if (cell.preparedByRobotHouseId === parcel.homeBuildingId) preparedTiles += 1;
    if (cell.tree) plantedCount += 1;
    else {
      emptyPlantable += 1;
      if (cell.preparedByRobotHouseId !== parcel.homeBuildingId) unpreparedPlantable += 1;
      if (cell.water < 10) dryUrgentPlants += 1;
    }
    if (cell.tree && cell.treeStage < 3) {
      const definition = SEEDS[cell.tree];
      if (cell.water < definition.waterNeed * RESTORATION_AUTONOMY.waterStressRatio) dryUrgentPlants += 1;
    }
  }

  const totalTiles = cells.length;
  if (analyzedTiles < totalTiles) needs.push(`${totalTiles - analyzedTiles} tuile${totalTiles - analyzedTiles > 1 ? 's' : ''} à analyser.`);
  if (analyzedTiles === totalTiles) {
    if (invalidKnownTiles > 0) blockers.push(`${invalidKnownTiles} tuile${invalidKnownTiles > 1 ? 's ne sont' : ' n’est'} pas plantable${invalidKnownTiles > 1 ? 's' : ''} : ${[...invalidReasons].slice(0, 2).join(', ')}.`);
    if (plantableTiles <= 0) blockers.push('Aucun emplacement plantable dans cette parcelle.');
    if (plantableTiles > 0 && !localCompatible.size && emptyPlantable > 0) blockers.push('Aucune graine compatible dans la maison.');
    if (dryUrgentPlants > 0 && house.waterStored < ROBOT_HOUSE_WATER_PER_TASK) blockers.push(`Réserve d’eau trop basse : ${Math.floor(house.waterStored)}/${ROBOT_HOUSE_WATER_PER_TASK} eau.`);
    else if (house.waterStored < ROBOT_HOUSE_WATER_BUFFER && emptyPlantable > 0) needs.push(`Prévoir de l’eau locale : ${Math.floor(house.waterStored)}/${ROBOT_HOUSE_WATER_BUFFER}.`);
    if (unpreparedPlantable > 0) needs.push(`${unpreparedPlantable} emplacement${unpreparedPlantable > 1 ? 's' : ''} à préparer.`);
    if (emptyPlantable > 0 && localCompatible.size > 0) needs.push(`${emptyPlantable} emplacement${emptyPlantable > 1 ? 's' : ''} à planter.`);
    if (dryUrgentPlants > 0) needs.push(`${dryUrgentPlants} arrosage${dryUrgentPlants > 1 ? 's' : ''} nécessaire${dryUrgentPlants > 1 ? 's' : ''}.`);
  }

  const stressRatio = treeCount > 0 ? stressedPlants / treeCount : 0;
  const speciesTarget = compatibleSpeciesPossible.size >= RESTORATION_AUTONOMY.minSpeciesIfCompatible ? RESTORATION_AUTONOMY.minSpeciesIfCompatible : 1;
  const urgentPending = emptyPlantable > 0 || dryUrgentPlants > 0;
  const autonomyConditions =
    analyzedTiles === totalTiles
    && totalTiles > 0
    && plantableTiles > 0
    && plantedCount / plantableTiles >= RESTORATION_AUTONOMY.vegetationCoverage
    && developedTrees >= RESTORATION_AUTONOMY.minDevelopedTrees
    && species.size >= speciesTarget
    && stressRatio <= RESTORATION_AUTONOMY.stressRatioMax
    && !urgentPending
    && blockers.length === 0;

  if (autonomyConditions) {
    parcel.autonomousSince ??= simulation.simulationTime;
  } else {
    parcel.autonomousSince = null;
  }

  const autonomyProgress = parcel.autonomousSince === null
    ? 0
    : clamp((simulation.simulationTime - parcel.autonomousSince + dt) / RESTORATION_AUTONOMY.requiredContinuousDuration, 0, 1);

  let state = parcel.state;
  if (parcel.state !== 'autonomous') {
    if (analyzedTiles < totalTiles) state = 'scanning';
    else if (blockers.length) state = 'waiting_resources';
    else if (unpreparedPlantable > 0) state = 'preparing';
    else if (emptyPlantable > 0) state = 'planting';
    else if (autonomyProgress >= 1) state = 'autonomous';
    else state = 'maintaining';
  }

  parcel.state = state;
  parcel.totalTiles = totalTiles;
  parcel.analyzedTiles = analyzedTiles;
  parcel.preparedTiles = preparedTiles;
  parcel.plantableTiles = plantableTiles;
  parcel.plantedCount = plantedCount;
  parcel.vegetationCoverage = plantableTiles > 0 ? vegetatedTiles / plantableTiles : 0;
  parcel.speciesPresent = species.size;
  parcel.healthyPlantRatio = treeCount > 0 ? healthyPlants / treeCount : 0;
  parcel.developedTrees = developedTrees;
  parcel.needs = needs;
  parcel.blockers = blockers;
  parcel.progress = {
    analysis: totalTiles > 0 ? analyzedTiles / totalTiles : 0,
    preparation: plantableTiles > 0 ? preparedTiles / plantableTiles : 0,
    planting: plantableTiles > 0 ? plantedCount / plantableTiles : 0,
    maintenance: treeCount > 0 ? 1 - stressRatio : 0,
    biodiversity: speciesTarget > 0 ? clamp(species.size / speciesTarget, 0, 1) : 1,
    autonomy: state === 'autonomous' ? 1 : autonomyProgress,
  };
  parcel.updatedAt = simulation.simulationTime;
}

export function getRestorationParcelForHouse(this: SimulationContext, homeBuildingId: number): RestorationParcel | null {
  return this.restorationParcels.find((parcel) => parcel.homeBuildingId === homeBuildingId) ?? null;
}

export function getRestorationParcelCells(this: SimulationContext, parcel: RestorationParcel): number[] {
  if (!parcel.bounds) return [];
  const cells: number[] = [];
  for (let y = parcel.bounds.minY; y <= parcel.bounds.maxY; y += 1) {
    for (let x = parcel.bounds.minX; x <= parcel.bounds.maxX; x += 1) {
      if (this.inBounds(x, y)) cells.push(this.index(x, y));
    }
  }
  return cells;
}

export function getRestorationParcelPreviewCells(this: SimulationContext, gx: number, gy: number): number[] {
  if (this.selectedTool?.kind !== 'restoration-parcel') return [];
  const start = this.selectedTool.start ?? { gx, gy };
  const bounds = normalizeBounds(start, { gx, gy });
  const cells: number[] = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      if (this.inBounds(x, y)) cells.push(this.index(x, y));
    }
  }
  return cells;
}

export function validateRestorationParcelClick(this: SimulationContext, gx: number, gy: number): PlacementResult {
  if (this.selectedTool?.kind !== 'restoration-parcel') return { ok: false, message: 'Aucune maison de robot sélectionnée' };
  const house = this.getRobotHouseBuilding(this.selectedTool.homeBuildingId);
  if (!house) return { ok: false, message: 'Maison de robot introuvable' };
  if (!this.inBounds(gx, gy)) return { ok: false, message: 'Hors de la carte' };
  if (!this.selectedTool.start) return { ok: true, message: 'Choisir le premier coin de la parcelle' };
  const bounds = normalizeBounds(this.selectedTool.start, { gx, gy });
  const { width, height, tiles } = boundsSize(bounds);
  if (width > ROBOT_HOUSE_MAX_PARCEL_WIDTH) return { ok: false, message: `Parcelle trop large : ${ROBOT_HOUSE_MAX_PARCEL_WIDTH} cases max` };
  if (height > ROBOT_HOUSE_MAX_PARCEL_HEIGHT) return { ok: false, message: `Parcelle trop haute : ${ROBOT_HOUSE_MAX_PARCEL_HEIGHT} cases max` };
  if (tiles > ROBOT_HOUSE_MAX_PARCEL_TILES) return { ok: false, message: `Parcelle trop grande : ${ROBOT_HOUSE_MAX_PARCEL_TILES} tuiles max` };
  const workTiles = this.getRestorationParcelPreviewCells(gx, gy).filter((index) => !isHomeCell(house, index));
  if (!workTiles.length) return { ok: false, message: 'La parcelle doit contenir du terrain autour de la maison' };
  return { ok: true, message: `Définir ${tiles} tuiles pour le robot restaurateur` };
}

export function handleRestorationParcelClick(this: SimulationContext, gx: number, gy: number): PlacementResult {
  const validation = this.validateRestorationParcelClick(gx, gy);
  if (!validation.ok) { this.toast(validation.message); return validation; }
  if (this.selectedTool?.kind !== 'restoration-parcel') return validation;
  if (!this.selectedTool.start) {
    this.selectedTool = { ...this.selectedTool, start: { gx, gy } };
    this.toast('Premier coin choisi');
    this.notify();
    return { ok: true, message: 'Choisissez le coin opposé' };
  }
  const bounds = normalizeBounds(this.selectedTool.start, { gx, gy });
  return this.assignRestorationParcel(this.selectedTool.homeBuildingId, bounds);
}

export function selectRestorationParcelTool(this: SimulationContext, homeBuildingId: number): PlacementResult {
  const house = this.getRobotHouseBuilding(homeBuildingId);
  if (!house) return { ok: false, message: 'Maison de robot introuvable' };
  this.selectedTool = { kind: 'restoration-parcel', homeBuildingId, start: null };
  this.selectedTarget = { kind: 'building', id: homeBuildingId };
  this.pipeSource = null;
  this.toast('Dessinez la parcelle du robot');
  this.notify();
  return { ok: true, message: 'Dessinez la parcelle du robot' };
}

export function assignRestorationParcel(this: SimulationContext, homeBuildingId: number, bounds: RestorationParcelBounds): PlacementResult {
  const house = this.getRobotHouseBuilding(homeBuildingId);
  if (!house) return { ok: false, message: 'Maison de robot introuvable' };
  const { width, height, tiles } = boundsSize(bounds);
  if (width > ROBOT_HOUSE_MAX_PARCEL_WIDTH || height > ROBOT_HOUSE_MAX_PARCEL_HEIGHT || tiles > ROBOT_HOUSE_MAX_PARCEL_TILES) {
    return { ok: false, message: 'Parcelle trop grande' };
  }
  let parcel = this.getRestorationParcelForHouse(homeBuildingId);
  if (!parcel) {
    parcel = emptyParcel(homeBuildingId, this.simulationTime);
    this.restorationParcels.push(parcel);
  }
  parcel.bounds = bounds;
  parcel.autonomousSince = null;
  parcel.state = 'scanning';
  this.ensureRobotHouseWorker(house);
  refreshRestorationParcel(this, parcel, 0);
  this.selectedTool = null;
  this.selectedTarget = { kind: 'building', id: homeBuildingId };
  this.syncRobotTasks();
  this.addLog(`Parcelle de <b>${tiles} tuiles</b> attribuée à la maison de robot.`);
  this.toast('Parcelle attribuée au robot');
  this.notify();
  return { ok: true, message: 'Parcelle attribuée' };
}

export function updateRestorationParcels(this: SimulationContext, dt: number): void {
  const houseIds = new Set(this.buildings.filter((building) => building.type === 'robot-house').map((building) => building.id));
  this.restorationParcels = this.restorationParcels.filter((parcel) => houseIds.has(parcel.homeBuildingId));
  for (const houseId of houseIds) {
    if (!this.getRestorationParcelForHouse(houseId)) this.restorationParcels.push(emptyParcel(houseId, this.simulationTime));
  }
  for (const parcel of this.restorationParcels) refreshRestorationParcel(this, parcel, dt);
}

export function chooseRestorationSeedForIndex(this: SimulationContext, parcel: RestorationParcel, index: number): SeedType | null {
  const house = this.getRobotHouseBuilding(parcel.homeBuildingId);
  const cell = this.cells[index];
  if (!house || !cell?.known) return null;
  const candidates = localCompatibleSeeds(this, house, cell.terrain);
  if (!candidates.length) return null;
  const counts = getParcelSpeciesCounts(this, parcel);
  return [...candidates].sort((a, b) => {
    const countDiff = (counts.get(a) ?? 0) - (counts.get(b) ?? 0);
    if (countDiff !== 0) return countDiff;
    return SEED_ORDER.indexOf(a) - SEED_ORDER.indexOf(b);
  })[0] ?? null;
}

export function getRestorationTaskBlockedReason(this: SimulationContext, task: RobotTask): string | null {
  const homeBuildingId = task.homeBuildingId;
  if (homeBuildingId === undefined) return null;
  const house = this.getRobotHouseBuilding(homeBuildingId);
  if (!house) return 'Maison de robot absente';
  const parcel = this.getRestorationParcelForHouse(homeBuildingId);
  if (!parcel || !parcel.bounds) return 'Parcelle non définie';
  if (parcel.state === 'autonomous') return 'Parcelle autonome';
  if (task.target.kind !== 'cell') return 'Tâche de parcelle incomplète';
  if (!this.getRestorationParcelCells(parcel).includes(task.target.index)) return 'Tuile hors parcelle';
  const cell = this.cells[task.target.index];
  if (!cell) return 'Tuile hors carte';

  if (task.type === 'scan') {
    if (cell.known) return 'Tuile déjà analysée';
    return null;
  }
  if (!cell.known) return 'Tuile à analyser avant intervention';
  const structuralBlocker = structuralPlantBlocker(this, parcel, task.target.index);
  if (structuralBlocker) return structuralBlocker;

  if (task.type === 'prepare_soil') {
    if (cell.tree) return 'Une plante occupe déjà la tuile';
    if (cell.preparedByRobotHouseId === homeBuildingId) return 'Sol déjà préparé';
    if (!compatibleUnlockedSeeds(this, cell.terrain).length) return `Aucune espèce connue pour ${TERRAIN_NAMES[cell.terrain]}`;
    return null;
  }

  if (task.type === 'water_plant') {
    if (house.waterStored < ROBOT_HOUSE_WATER_PER_TASK) return `Réserve d’eau trop basse : ${Math.floor(house.waterStored)}/${ROBOT_HOUSE_WATER_PER_TASK}`;
    return null;
  }

  if (task.type === 'plant') {
    const seed = task.seed ?? this.chooseRestorationSeedForIndex(parcel, task.target.index);
    if (!seed) return 'Aucune graine compatible dans la maison';
    if (cell.preparedByRobotHouseId !== homeBuildingId) return 'Sol non préparé';
    const result = validateRobotHouseSeedPlacement(this, homeBuildingId, seed, task.target.gx, task.target.gy);
    return result.ok ? null : result.message;
  }

  return null;
}

export function syncRestorationTasks(this: SimulationContext, desiredIds: Set<string>): void {
  this.updateRestorationParcels(0);
  for (const house of this.buildings.filter((building) => building.type === 'robot-house')) {
    this.ensureRobotHouseWorker(house);
    const parcel = this.getRestorationParcelForHouse(house.id);
    if (!parcel?.bounds || parcel.state === 'autonomous') continue;
    const cells = this.getRestorationParcelCells(parcel).filter((index) => !isHomeCell(house, index));
    const allAnalyzed = cells.every((index) => this.cells[index]?.known);

    for (const index of cells) {
      const cell = this.cells[index];
      if (!cell) continue;
      const { gx, gy } = cellPosition(index);
      const scanId = taskId(house.id, 'scan', index);
      if (!cell.known) {
        desiredIds.add(scanId);
        this.upsertRobotTask({
          id: scanId,
          type: 'scan',
          target: { kind: 'cell', index, gx, gy },
          parcelId: parcel.id,
          homeBuildingId: house.id,
          priority: ROBOT_TASK_PRIORITIES.restorationScan,
          allowedRoles: ['restoration'],
          blockedReason: null,
        });
      } else {
        const existing = this.getRobotTask(scanId);
        if (existing && existing.state !== 'completed') this.completeTask(scanId);
      }
    }

    if (!allAnalyzed) continue;
    if (parcel.blockers.length) continue;

    for (const index of cells) {
      const cell = this.cells[index];
      if (!cell || !isStructurallyPlantable(this, parcel, index)) continue;
      const { gx, gy } = cellPosition(index);
      if (cell.tree && cell.treeStage < 3) {
        const definition = SEEDS[cell.tree];
        if (cell.water < definition.waterNeed * RESTORATION_AUTONOMY.waterStressRatio) {
          const waterId = taskId(house.id, 'water', index);
          desiredIds.add(waterId);
          this.upsertRobotTask({
            id: waterId,
            type: 'water_plant',
            target: { kind: 'cell', index, gx, gy },
            parcelId: parcel.id,
            homeBuildingId: house.id,
            priority: ROBOT_TASK_PRIORITIES.restorationWater,
            requiredResources: { water: ROBOT_HOUSE_WATER_PER_TASK },
            allowedRoles: ['restoration'],
            blockedReason: this.getRestorationTaskBlockedReason({
              id: waterId,
              type: 'water_plant',
              target: { kind: 'cell', index, gx, gy },
              parcelId: parcel.id,
              homeBuildingId: house.id,
              priority: ROBOT_TASK_PRIORITIES.restorationWater,
              state: 'available',
              requiredResources: { water: ROBOT_HOUSE_WATER_PER_TASK },
              allowedRoles: ['restoration'],
              reservedByWorkerId: null,
              blockedReason: null,
              createdAt: this.simulationTime,
              updatedAt: this.simulationTime,
            }),
          });
        }
        continue;
      }
      if (cell.tree) continue;
      if (cell.preparedByRobotHouseId !== house.id) {
        const prepareId = taskId(house.id, 'prepare', index);
        desiredIds.add(prepareId);
        this.upsertRobotTask({
          id: prepareId,
          type: 'prepare_soil',
          target: { kind: 'cell', index, gx, gy },
          parcelId: parcel.id,
          homeBuildingId: house.id,
          priority: ROBOT_TASK_PRIORITIES.prepareSoil,
          allowedRoles: ['restoration'],
          blockedReason: this.getRestorationTaskBlockedReason({
            id: prepareId,
            type: 'prepare_soil',
            target: { kind: 'cell', index, gx, gy },
            parcelId: parcel.id,
            homeBuildingId: house.id,
            priority: ROBOT_TASK_PRIORITIES.prepareSoil,
            state: 'available',
            requiredResources: {},
            allowedRoles: ['restoration'],
            reservedByWorkerId: null,
            blockedReason: null,
            createdAt: this.simulationTime,
            updatedAt: this.simulationTime,
          }),
        });
        continue;
      }
      if (cell.water < 10) {
        const waterId = taskId(house.id, 'water', index);
        desiredIds.add(waterId);
        this.upsertRobotTask({
          id: waterId,
          type: 'water_plant',
          target: { kind: 'cell', index, gx, gy },
          parcelId: parcel.id,
          homeBuildingId: house.id,
          priority: ROBOT_TASK_PRIORITIES.restorationWater,
          requiredResources: { water: ROBOT_HOUSE_WATER_PER_TASK },
          allowedRoles: ['restoration'],
          blockedReason: this.getRestorationTaskBlockedReason({
            id: waterId,
            type: 'water_plant',
            target: { kind: 'cell', index, gx, gy },
            parcelId: parcel.id,
            homeBuildingId: house.id,
            priority: ROBOT_TASK_PRIORITIES.restorationWater,
            state: 'available',
            requiredResources: { water: ROBOT_HOUSE_WATER_PER_TASK },
            allowedRoles: ['restoration'],
            reservedByWorkerId: null,
            blockedReason: null,
            createdAt: this.simulationTime,
            updatedAt: this.simulationTime,
          }),
        });
        continue;
      }
      const seed = this.chooseRestorationSeedForIndex(parcel, index);
      const plantId = taskId(house.id, 'plant', index);
      desiredIds.add(plantId);
      this.upsertRobotTask({
        id: plantId,
        type: 'plant',
        target: { kind: 'cell', index, gx, gy },
        parcelId: parcel.id,
        homeBuildingId: house.id,
        seed: seed ?? undefined,
        priority: ROBOT_TASK_PRIORITIES.restorationPlant,
        requiredResources: seed ? { seeds: { [seed]: 1 } } : {},
        allowedRoles: ['restoration'],
        blockedReason: this.getRestorationTaskBlockedReason({
          id: plantId,
          type: 'plant',
          target: { kind: 'cell', index, gx, gy },
          parcelId: parcel.id,
          homeBuildingId: house.id,
          seed: seed ?? undefined,
          priority: ROBOT_TASK_PRIORITIES.restorationPlant,
          state: 'available',
          requiredResources: seed ? { seeds: { [seed]: 1 } } : {},
          allowedRoles: ['restoration'],
          reservedByWorkerId: null,
          blockedReason: null,
          createdAt: this.simulationTime,
          updatedAt: this.simulationTime,
        }),
      });
    }
  }
}

export function transferSeedToRobotHouse(this: SimulationContext, homeBuildingId: number, seed: SeedType): PlacementResult {
  const house = this.getRobotHouseBuilding(homeBuildingId);
  if (!house) return { ok: false, message: 'Maison de robot introuvable' };
  if (!this.isSeedUnlocked(seed) || this.seedInventory[seed] <= 0) return { ok: false, message: 'Graine indisponible dans le stock global' };
  this.seedInventory[seed] -= 1;
  inventoryFor(house)[seed] += 1;
  this.syncRobotTasks();
  this.toast(`+1 graine dans la maison`);
  this.notify();
  return { ok: true, message: 'Graine transférée' };
}

export function transferWaterToRobotHouse(this: SimulationContext, homeBuildingId: number): PlacementResult {
  const house = this.getRobotHouseBuilding(homeBuildingId);
  if (!house) return { ok: false, message: 'Maison de robot introuvable' };
  const missing = Math.max(0, ROBOT_HOUSE_CAPACITY - house.waterStored);
  if (missing <= 0.05) return { ok: false, message: 'Réservoir de la maison plein' };
  const amount = Math.min(ROBOT_HOUSE_WATER_TRANSFER_AMOUNT, missing, this.waterResource);
  if (amount <= 0.05) return { ok: false, message: 'Réserve de pompe insuffisante' };
  house.waterStored += amount;
  this.waterResource -= amount;
  this.syncRobotTasks();
  this.toast(`+${amount.toFixed(1)} eau dans la maison`);
  this.notify();
  return { ok: true, message: 'Eau transférée' };
}

export function prepareSoilAt(this: SimulationContext, homeBuildingId: number, index: number): PlacementResult {
  const house = this.getRobotHouseBuilding(homeBuildingId);
  const parcel = this.getRestorationParcelForHouse(homeBuildingId);
  if (!house || !parcel?.bounds) return { ok: false, message: 'Parcelle introuvable' };
  if (!this.getRestorationParcelCells(parcel).includes(index)) return { ok: false, message: 'Tuile hors parcelle' };
  const cell = this.cells[index];
  if (!cell) return { ok: false, message: 'Tuile hors carte' };
  const blocker = structuralPlantBlocker(this, parcel, index);
  if (blocker) return { ok: false, message: blocker };
  cell.preparedByRobotHouseId = homeBuildingId;
  cell.cover = Math.max(cell.cover, 1) as 1 | 2;
  cell.coverProgress = Math.max(cell.coverProgress, 0.55);
  cell.humus = Math.max(cell.humus, 4);
  this.notify();
  return { ok: true, message: 'Sol préparé' };
}

export function plantSeedFromRobotHouse(this: SimulationContext, homeBuildingId: number, seed: SeedType, gx: number, gy: number): PlacementResult {
  const house = this.getRobotHouseBuilding(homeBuildingId);
  if (!house) return { ok: false, message: 'Maison de robot introuvable' };
  const parcel = this.getRestorationParcelForHouse(homeBuildingId);
  if (!parcel?.bounds) return { ok: false, message: 'Parcelle introuvable' };
  const index = this.index(gx, gy);
  if (!this.getRestorationParcelCells(parcel).includes(index)) return { ok: false, message: 'Tuile hors parcelle' };
  if (this.cells[index]?.preparedByRobotHouseId !== homeBuildingId) return { ok: false, message: 'Sol non préparé' };
  const inventory = inventoryFor(house);
  const validation = validateRobotHouseSeedPlacement(this, homeBuildingId, seed, gx, gy);
  if (!validation.ok) return validation;
  const cell = this.cells[index];
  cell.tree = seed;
  cell.treeStage = 0;
  cell.treeProgress = 0;
  cell.treeStress = 0;
  cell.treeOrigin = 'player';
  cell.nextSeedAt = Number.POSITIVE_INFINITY;
  cell.seedsProduced = 0;
  inventory[seed] -= 1;
  this.completedTutorialSteps.add('plant-seed');
  this.addLog(`Le robot restaurateur plante <b>${SEEDS[seed].name}</b> depuis l’inventaire de sa maison.`);
  this.toast('Le robot restaurateur plante');
  this.notify();
  return validation;
}

export function waterPlantFromRobotHouse(this: SimulationContext, homeBuildingId: number, index: number): PlacementResult {
  const house = this.getRobotHouseBuilding(homeBuildingId);
  const parcel = this.getRestorationParcelForHouse(homeBuildingId);
  if (!house || !parcel?.bounds) return { ok: false, message: 'Maison ou parcelle introuvable' };
  if (!this.getRestorationParcelCells(parcel).includes(index)) return { ok: false, message: 'Tuile hors parcelle' };
  if (house.waterStored < ROBOT_HOUSE_WATER_PER_TASK) return { ok: false, message: `Réserve d’eau trop basse : ${Math.floor(house.waterStored)}/${ROBOT_HOUSE_WATER_PER_TASK}` };
  const cell = this.cells[index];
  if (!cell) return { ok: false, message: 'Tuile hors carte' };
  house.waterStored -= ROBOT_HOUSE_WATER_PER_TASK;
  cell.water = clamp(cell.water + ROBOT_HOUSE_WATERING_AMOUNT, 0, 100);
  if (cell.cover === 0) {
    cell.coverProgress = Math.max(cell.coverProgress, 0.45);
  }
  this.notify();
  return { ok: true, message: 'Arrosage terminé' };
}

export const restorationMethods = {
  getRestorationParcelForHouse,
  getRestorationParcelCells,
  getRestorationParcelPreviewCells,
  validateRestorationParcelClick,
  handleRestorationParcelClick,
  selectRestorationParcelTool,
  assignRestorationParcel,
  updateRestorationParcels,
  syncRestorationTasks,
  getRestorationTaskBlockedReason,
  chooseRestorationSeedForIndex,
  transferSeedToRobotHouse,
  transferWaterToRobotHouse,
  prepareSoilAt,
  plantSeedFromRobotHouse,
  waterPlantFromRobotHouse,
};
