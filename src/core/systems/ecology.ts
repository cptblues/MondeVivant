import { RESEARCH_SEED_FOR_SOIL, SEEDS } from '../config';
import { CISTERN_CAPACITY, CISTERN_IRRIGATION_AMOUNT, CISTERN_IRRIGATION_RADIUS, MAX_SEEDS_PER_TREE, OUTLET_IRRIGATION, PUMP_IRRIGATION_AMOUNT, PUMP_IRRIGATION_RADIUS } from '../gameConfig';
import { GRID_HEIGHT, GRID_WIDTH, TerrainType } from '../types';
import type { Cell, CellGrowthDiagnostics, FieldSet } from '../types';
import type { SimulationContext } from '../simulationContext';
import { clamp, distance, hash } from '../../utils/math';

export function updateGroundCover(this: SimulationContext, cell: Cell, boost: number, dt: number): void {
  const mossGood = cell.water >= 15;
  const grassGood = cell.water >= 21 && cell.humus >= 4.5;
  if (cell.cover === 0) {
    if (mossGood) cell.coverProgress += 0.02 * boost * dt;
    else cell.coverProgress = Math.max(0, cell.coverProgress - 0.004 * dt);
    if (cell.coverProgress >= 1) {
      cell.cover = 1;
      cell.coverProgress = 0;
      this.addLog('De la <b>mousse</b> apparaît sur une tuile maintenue humide.');
    }
    return;
  }
  if (cell.cover === 1) {
    if (grassGood) {
      cell.coverProgress += 0.014 * boost * dt;
      cell.coverStress = Math.max(0, cell.coverStress - dt);
    } else {
      cell.coverProgress = Math.max(0, cell.coverProgress - 0.003 * dt);
      if (!mossGood) cell.coverStress += dt;
    }
    if (cell.coverProgress >= 1) {
      cell.cover = 2;
      cell.coverProgress = 0;
      cell.coverStress = 0;
      this.addLog('La tuile devient une petite <b>prairie</b>.');
    } else if (cell.coverStress > 18) {
      cell.cover = 0;
      cell.coverProgress = 0.5;
      cell.coverStress = 0;
    }
    return;
  }
  const stableGrass = cell.water >= 13 && cell.humus >= 3;
  cell.coverStress = stableGrass ? Math.max(0, cell.coverStress - dt) : cell.coverStress + dt;
  if (cell.coverStress > 25) {
    cell.cover = 1;
    cell.coverProgress = 0.6;
    cell.coverStress = 4;
  }
}

export function updateTree(this: SimulationContext, index: number, boost: number, dt: number): void {
  const cell = this.cells[index];
  if (!cell.tree) return;
  if (cell.treeStage >= 3) {
    this.tryNaturalSeeding(index);
    return;
  }
  const definition = SEEDS[cell.tree];
  const stageFactor = [0.72, 0.9, 1.03][cell.treeStage];
  const coverOk = cell.cover >= (cell.treeStage === 0 ? 1 : 2);
  const lightLimit = cell.treeStage === 0 ? 30 : cell.treeStage === 1 ? 50 : 76;
  const good = coverOk && cell.water >= definition.waterNeed * stageFactor && cell.humus >= definition.humusNeed * stageFactor && cell.shade <= lightLimit;
  if (good) {
    cell.treeProgress += definition.growRate * boost * dt;
    cell.treeStress = Math.max(0, cell.treeStress - dt);
  } else {
    cell.treeProgress = Math.max(0, cell.treeProgress - 0.002 * dt);
    cell.treeStress += dt * (cell.shade > lightLimit ? 0.75 : 0.4);
  }
  if (cell.treeStress > 30 && cell.treeStage === 0) {
    cell.tree = null;
    cell.treeOrigin = null;
    cell.treeProgress = 0;
    cell.treeStress = 0;
    return;
  }
  if (cell.treeProgress >= 1) {
    cell.treeStage = (cell.treeStage + 1) as 0 | 1 | 2 | 3;
    cell.treeProgress = 0;
    cell.treeStress = 0;
    const stageName = ['germe', 'jeune plant', 'jeune arbre', 'arbre mature'][cell.treeStage];
    this.addLog(`<b>${SEEDS[cell.tree].name}</b> atteint le stade ${stageName}.`);
    if (cell.treeStage === 3) {
      this.completedTutorialSteps.add('grow-tree');
      cell.nextSeedAt = this.simulationTime + 16 + hash(index, cell.seedsProduced, 91) * 24;
    }
  }
}

export function tryNaturalSeeding(this: SimulationContext, parentIndex: number): void {
  const parent = this.cells[parentIndex];
  if (!parent.tree || parent.treeStage < 3 || parent.seedsProduced >= MAX_SEEDS_PER_TREE || this.simulationTime < parent.nextSeedAt) return;
  const px = parentIndex % GRID_WIDTH;
  const py = Math.floor(parentIndex / GRID_WIDTH);
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  for (let y = Math.max(0, py - 5); y <= Math.min(GRID_HEIGHT - 1, py + 5); y += 1) {
    for (let x = Math.max(0, px - 5); x <= Math.min(GRID_WIDTH - 1, px + 5); x += 1) {
      const d = distance(x, y, px, py);
      if (d < 3.4 || d > 5.8) continue;
      candidates.push({ x, y, score: hash(x, y, parent.seedsProduced + Math.floor(this.simulationTime / 5)) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  let planted = false;
  for (const candidate of candidates.slice(0, 18)) {
    const index = this.index(candidate.x, candidate.y);
    const cell = this.cells[index];
    if (cell.terrain === TerrainType.Rock || cell.tree || !SEEDS[parent.tree].compatibleTerrains.includes(cell.terrain)) continue;
    if (this.buildings.some((building) => building.gx === candidate.x && building.gy === candidate.y)) continue;
    if (this.getPipeCell(candidate.x, candidate.y)?.outlet) continue;
    if (cell.cover < 1 || cell.water < SEEDS[parent.tree].waterNeed * 0.72 || cell.humus < SEEDS[parent.tree].humusNeed * 0.65) continue;
    const estimatedShade = Math.max(cell.shade, this.currentFields.naturalShade[index] ?? 0);
    if (estimatedShade > 24) continue;
    let tooCloseToTree = false;
    let nearbyTrees = 0;
    for (let yy = Math.max(0, candidate.y - 5); yy <= Math.min(GRID_HEIGHT - 1, candidate.y + 5); yy += 1) {
      for (let xx = Math.max(0, candidate.x - 5); xx <= Math.min(GRID_WIDTH - 1, candidate.x + 5); xx += 1) {
        const treeDistance = distance(xx, yy, candidate.x, candidate.y);
        if (treeDistance > 5 || !this.cells[this.index(xx, yy)].tree) continue;
        if (treeDistance < 3.2) tooCloseToTree = true;
        nearbyTrees += 1;
      }
    }
    if (tooCloseToTree) continue;
    if (nearbyTrees >= 3) continue;
    cell.tree = parent.tree;
    cell.treeStage = 0;
    cell.treeProgress = 0;
    cell.treeStress = 0;
    cell.treeOrigin = 'natural';
    cell.nextSeedAt = Number.POSITIVE_INFINITY;
    cell.seedsProduced = 0;
    parent.seedsProduced += 1;
    parent.nextSeedAt = this.simulationTime + 20 + hash(candidate.x, candidate.y, parent.seedsProduced) * 32;
    this.addLog(`Un <b>${SEEDS[parent.tree].name}</b> mature a semé naturellement une nouvelle pousse.`);
    this.toast('Une graine s’est dispersée naturellement');
    planted = true;
    break;
  }
  if (!planted) parent.nextSeedAt = this.simulationTime + 9 + hash(px, py, parent.seedsProduced + 7) * 12;
}

export function computeFields(this: SimulationContext): FieldSet {
  const length = GRID_WIDTH * GRID_HEIGHT;
  const fields: FieldSet = {
    naturalWater: new Float32Array(length),
    naturalShade: new Float32Array(length),
    naturalHumus: new Float32Array(length),
    irrigationWater: new Float32Array(length),
    growthBoost: new Float32Array(length),
  };
  fields.growthBoost.fill(1);
  for (let i = 0; i < length; i += 1) {
    const cell = this.cells[i];
    if (cell.terrain === TerrainType.Basin) { fields.naturalWater[i] = 8; fields.naturalHumus[i] = 2; }
    else if (cell.terrain === TerrainType.Sand || cell.terrain === TerrainType.Salt) fields.naturalWater[i] = 1;
    if (cell.cover === 1) { fields.naturalWater[i] += 3; fields.naturalHumus[i] += 5; }
    else if (cell.cover === 2) { fields.naturalWater[i] += 6; fields.naturalShade[i] += 2; fields.naturalHumus[i] += 10; }
  }
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const cell = this.cells[this.index(x, y)];
      if (!cell.tree || cell.treeStage <= 0) continue;
      const definition = SEEDS[cell.tree];
      const radius = Math.max(2, definition.influenceRadius * (cell.treeStage / 3));
      const stage = cell.treeStage;
      const speciesWater = cell.tree === 'willow' ? 1.35 : cell.tree === 'juniper' ? 0.75 : 1;
      this.addRadial(fields.naturalWater, x, y, radius, (2 + stage * 3) * speciesWater);
      this.addRadial(fields.naturalShade, x, y, radius, 4 + stage * 10);
      this.addRadial(fields.naturalHumus, x, y, radius, 3 + stage * 7);
    }
  }
  for (const building of this.buildings) {
    if (building.type === 'pump') {
      this.addRadial(fields.irrigationWater, building.gx, building.gy, PUMP_IRRIGATION_RADIUS, PUMP_IRRIGATION_AMOUNT);
      for (const index of this.getPumpIrrigatedCells(building.gx, building.gy)) fields.growthBoost[index] *= 1.1;
    } else if (building.type === 'cistern' && building.waterStored > 0.25) {
      const fillRatio = clamp(building.waterStored / CISTERN_CAPACITY, 0, 1);
      this.addRadial(fields.irrigationWater, building.gx, building.gy, CISTERN_IRRIGATION_RADIUS, CISTERN_IRRIGATION_AMOUNT * (0.35 + fillRatio * 0.65));
      for (const index of this.getAffectedCells('cistern', building.gx, building.gy)) fields.growthBoost[index] *= 1 + fillRatio * 0.08;
    }
  }
  for (const pipe of this.pipes) {
    if (!pipe.outlet || !pipe.outletOpen) continue;
    const level = this.getPressureLevelAt(pipe.gx, pipe.gy);
    const { radius, amount, boost } = OUTLET_IRRIGATION[level];
    if (!radius || !amount) continue;
    this.addRadial(fields.irrigationWater, pipe.gx, pipe.gy, radius, amount);
    for (const index of this.getIrrigatedCells(pipe)) fields.growthBoost[index] *= boost;
  }
  return fields;
}

export function addRadial(this: SimulationContext, field: Float32Array, gx: number, gy: number, radius: number, amount: number): void {
  for (let y = Math.max(0, Math.floor(gy - radius)); y <= Math.min(GRID_HEIGHT - 1, Math.ceil(gy + radius)); y += 1) {
    for (let x = Math.max(0, Math.floor(gx - radius)); x <= Math.min(GRID_WIDTH - 1, Math.ceil(gx + radius)); x += 1) {
      const d = distance(x, y, gx, gy);
      if (d <= radius) field[this.index(x, y)] += amount * (1 - d / Math.max(radius, 0.51)) ** 1.2;
    }
  }
}

export function getCellGrowthDiagnostics(this: SimulationContext, index: number): CellGrowthDiagnostics {
  const cell = this.cells[index];
  if (!cell) return { headline: 'Cellule inconnue', tone: 'warning', details: [], blockers: ['Position hors carte'] };
  if (cell.terrain === TerrainType.Rock) {
    return {
      headline: 'Roche affleurante',
      tone: 'warning',
      details: ['Obstacle visible dès le départ.'],
      blockers: ['Impossible à cultiver ou à construire.'],
    };
  }
  const details = cell.known ? [
    `Humidité ${Math.round(cell.water)}`,
    `Humus ${Math.round(cell.humus)}`,
    `Ombre ${Math.round(cell.shade)}`,
    cell.cover === 2 ? 'Prairie installée' : cell.cover === 1 ? 'Mousse installée' : 'Sol nu',
  ] : [];
  if (!cell.known && !cell.tree) {
    return {
      headline: 'Sol à analyser',
      tone: 'neutral',
      details,
      blockers: ['Le type de sol doit être connu avant de planter.'],
    };
  }
  if (!cell.tree) {
    const compatible = this.getUnlockedSeedTypes().filter((seed) => SEEDS[seed].compatibleTerrains.includes(cell.terrain));
    const stocked = compatible.filter((seed) => this.seedCount(seed) > 0);
    const blockers: string[] = [];
    if (compatible.length === 0) {
      const researchSeed = RESEARCH_SEED_FOR_SOIL[cell.terrain];
      blockers.push(researchSeed ? 'Variété adaptée à rechercher en pépinière.' : 'Aucune variété adaptée à ce sol.');
    } else if (stocked.length === 0) {
      blockers.push('Aucune graine compatible en stock.');
    }
    if (cell.water < 10) blockers.push('Trop sec pour l’implantation: ouvre une sortie à proximité.');
    return {
      headline: blockers.length ? 'Plantation pas encore prête' : `Prêt pour ${SEEDS[stocked[0]].name}`,
      tone: blockers.length ? 'warning' : 'good',
      details,
      blockers,
    };
  }
  if (cell.treeStage >= 3) {
    return {
      headline: 'Arbre mature',
      tone: 'good',
      details: cell.known ? [...details, `${cell.seedsProduced}/3 semis naturels établis`] : [`${cell.seedsProduced}/3 semis naturels établis`],
      blockers: [],
    };
  }
  const definition = SEEDS[cell.tree];
  const stageFactor = [0.72, 0.9, 1.03][cell.treeStage];
  const coverNeeded = cell.treeStage === 0 ? 1 : 2;
  const lightLimit = cell.treeStage === 0 ? 30 : cell.treeStage === 1 ? 50 : 76;
  const waterNeed = definition.waterNeed * stageFactor;
  const humusNeed = definition.humusNeed * stageFactor;
  const blockers: string[] = [];
  const stressReasons: string[] = [];
  if (cell.cover < coverNeeded) {
    const reason = cell.treeStage === 0 ? 'Besoin de mousse' : 'Prairie pas assez stable';
    stressReasons.push(reason);
    blockers.push(cell.treeStage === 0 ? 'La graine a besoin de mousse.' : 'La croissance demande une prairie stable.');
  }
  if (cell.water < waterNeed) {
    stressReasons.push(`Manque d’eau ${Math.round(cell.water)}/${Math.round(waterNeed)}`);
    blockers.push(`Humidité trop basse: ${Math.round(cell.water)}/${Math.round(waterNeed)}.`);
  }
  if (cell.humus < humusNeed) {
    stressReasons.push(`Humus bas ${Math.round(cell.humus)}/${Math.round(humusNeed)}`);
    blockers.push(`Humus trop bas: ${Math.round(cell.humus)}/${Math.round(humusNeed)}.`);
  }
  if (cell.shade > lightLimit) {
    stressReasons.push(`Trop d’ombre ${Math.round(cell.shade)}/${lightLimit}`);
    blockers.push(`Ombre trop forte: ${Math.round(cell.shade)}/${lightLimit}.`);
  }
  if (!cell.known && blockers.length) {
    return {
      headline: 'Croissance ralentie',
      tone: 'warning',
      details,
      blockers: ['Analysez le sol pour lire précisément les besoins de cette pousse.'],
      primaryStressReason: 'conditions locales insuffisantes',
      progressLabel: `Croissance ${Math.round(cell.treeProgress * 100)} %`,
    };
  }
  return {
    headline: blockers.length ? 'Croissance ralentie' : 'Croissance active',
    tone: blockers.length ? 'warning' : 'good',
    details,
    blockers,
    primaryStressReason: stressReasons[0],
    progressLabel: `Croissance ${Math.round(cell.treeProgress * 100)} %`,
  };
}

export const ecologyMethods = {
  updateGroundCover,
  updateTree,
  tryNaturalSeeding,
  computeFields,
  addRadial,
  getCellGrowthDiagnostics,
};
