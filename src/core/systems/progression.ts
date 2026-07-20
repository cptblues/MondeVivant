import { BUILDINGS } from '../config';
import { CISTERN_SOURCE_MIN_WATER, CULTIVATION_COST, PIPE_MAX_LENGTH, WOOD_PER_MATURE_TREE } from '../gameConfig';
import type { BuildingType, MissionGoal, TutorialHint, UnlockObjective } from '../types';
import type { SimulationContext } from '../simulationContext';
import { clamp } from '../../utils/math';

export function getMissionGoals(this: SimulationContext): MissionGoal[] {
  const metrics = this.getMetrics();
  const hasPump = this.buildings.some((building) => building.type === 'pump');
  const hasCompletedScan = metrics.knownSoilPercent > 8;
  const hasNursery = this.hasNursery();
  const hasCistern = this.buildings.some((building) => building.type === 'cistern');
  const hasCisternNetwork = this.pipes.some((pipe) => pipe.sourceType === 'cistern');
  const paintedZoneCells = this.plantingZones.reduce((sum, zone) => sum + zone.cells.length, 0);
  const goals: MissionGoal[] = [
    { id: 'pump', label: 'Installer la pompe solaire', done: hasPump },
    { id: 'pipe', label: 'Tracer un premier tuyau depuis la pompe', done: this.pipes.length > 0 },
    { id: 'outlet', label: 'Créer puis ouvrir une sortie d’eau', done: metrics.openOutlets >= 1 },
  ];
  if (hasPump || hasNursery) goals.push({ id: 'nursery', label: 'Installer la pépinière près du réseau', done: hasNursery });
  if (hasNursery) {
    goals.push({ id: 'nursery-water', label: 'Alimenter la pépinière par tuyau ou robot', done: metrics.nurseryWater >= CULTIVATION_COST });
    goals.push({ id: 'scan-start', label: 'Délimiter une zone de scan pour le robot', done: this.scanZones.length > 0 || hasCompletedScan });
    goals.push({ id: 'scan-map', label: 'Identifier au moins 25 % des sols', done: metrics.knownSoilPercent >= 25 });
  }
  if (hasNursery && metrics.knownSoilPercent >= 10) {
    goals.push({ id: 'research', label: 'Découvrir une première graine adaptée', done: this.unlockedSeeds.size >= 2 });
  }
  if (hasNursery) {
    goals.push({ id: 'paint-zone', label: 'Peindre une zone de plantation pour le robot pépiniériste', done: paintedZoneCells > 0 });
  }
  if (metrics.openOutlets >= 1 && metrics.knownSoilPercent > 0 && paintedZoneCells > 0) {
    goals.push({ id: 'plant', label: 'Laisser le robot planter un premier arbre', done: metrics.treeCount >= 1 });
  }
  if (metrics.treeCount >= 1) {
    goals.push({ id: 'first-tree', label: 'Faire mûrir un premier arbre', done: metrics.matureTrees >= 1 });
  }
  if (metrics.matureTrees >= 1) {
    goals.push({ id: 'trees', label: 'Faire mûrir trois arbres', done: metrics.matureTrees >= 3 });
    goals.push({ id: 'natural', label: 'Laisser un arbre mature semer un nouvel arbre', done: metrics.naturalTrees >= 1 });
    goals.push({ id: 'wood', label: 'Abattre un arbre mature pour récupérer du bois', done: this.milestones.has('harvest-wood') || metrics.woodResource > 0 || hasCistern });
  }
  if (this.milestones.has('harvest-wood') || metrics.woodResource > 0 || hasCistern) {
    goals.push({ id: 'cistern', label: 'Construire une cuve relais avec le bois', done: hasCistern });
  }
  if (hasCistern) {
    goals.push({ id: 'fill-cistern', label: 'Remplir une cuve par tuyau ou robot proche', done: metrics.cisternWater >= CISTERN_SOURCE_MIN_WATER });
  }
  if (metrics.cisternWater >= CISTERN_SOURCE_MIN_WATER || hasCisternNetwork) {
    goals.push({ id: 'cistern-network', label: 'Tracer un réseau secondaire depuis une cuve remplie', done: hasCisternNetwork });
  }
  if (metrics.naturalTrees >= 1 || metrics.restoredPercent >= 12) {
    goals.push({ id: 'restore', label: 'Reverdir 22 % de la carte', done: metrics.restoredPercent >= 22 });
  }
  return goals;
}

export function getUnlockObjectives(this: SimulationContext): UnlockObjective[] {
  const metrics = this.getMetrics();
  return [
    { id: 'reward-outlet', label: 'Première sortie ouverte', reward: '+8 💧 pour lancer les plantations', done: this.milestones.has('reward-outlet') || metrics.openOutlets >= 1 },
    { id: 'reward-scan', label: '25 % des sols identifiés', reward: 'Cartographie utile pour les recherches', done: this.milestones.has('reward-scan') || metrics.knownSoilPercent >= 25 },
    { id: 'reward-restored-10', label: '10 % de la carte reverdie', reward: '+2 graines pionnières', done: this.milestones.has('reward-restored-10') || metrics.restoredPercent >= 10 },
    { id: 'reward-first-mature', label: 'Premier arbre mature', reward: '+12 💧 grâce au microclimat', done: this.milestones.has('reward-first-mature') || metrics.matureTrees >= 1 },
  ];
}

export function getNextHint(this: SimulationContext): TutorialHint | null {
  this.syncTutorialProgress();
  const hints: TutorialHint[] = [
    {
      id: 'place-pump',
      title: 'Commence par la pompe',
      body: 'Pose la pompe solaire sur une tuile libre. Elle humidifie quelques tuiles autour d’elle et déverrouille les tuyaux.',
    },
    {
      id: 'select-pipe',
      title: 'Prépare un tuyau',
      body: 'Sélectionne l’outil Tuyau dans le dock. Le premier réseau part de la pompe, puis les cuves remplies peuvent servir de relais.',
    },
    {
      id: 'choose-pump',
      title: 'Choisis la source',
      body: 'Clique sur la pompe, une cuve remplie ou un tuyau déjà posé. Le nouveau tracé peut repartir du segment choisi.',
    },
    {
      id: 'trace-pipe',
      title: 'Trace la conduite',
      body: `Clique une destination à ${PIPE_MAX_LENGTH} cases maximum. Le trajet contourne automatiquement les obstacles.`,
    },
    {
      id: 'create-outlet',
      title: 'Ajoute une sortie',
      body: 'Sélectionne une tuile du tuyau, puis crée une sortie d’eau. Elle apparaît fermée pour éviter la consommation surprise.',
    },
    {
      id: 'open-outlet',
      title: 'Ouvre la vanne',
      body: 'Ouvre la sortie pour humidifier les cellules indiquées. Trop de sorties ouvertes réduisent la pression.',
    },
    {
      id: 'scan-soil',
      title: 'Analyse les sols',
      body: 'Pose la pépinière, choisis l’outil Scan, puis clique une zone. Le robot rejoint le centre et mémorise toute la zone après son analyse.',
    },
    {
      id: 'plant-seed',
      title: 'Confie une zone au robot',
      body: 'Sélectionne une graine dans le dock puis peins les tuiles à planter. Les petits marqueurs indiquent les cases en file d’attente.',
    },
    {
      id: 'grow-tree',
      title: 'Laisse l’écosystème prendre',
      body: 'Un arbre mature crée ombre, humus et humidité, puis cherchera des emplacements lumineux pour se ressemer.',
    },
    {
      id: 'harvest-wood',
      title: 'Récupère du bois',
      body: `Sélectionne un arbre mature et abats-le pour obtenir ${WOOD_PER_MATURE_TREE} bois. Le bois sert aux cuves relais.`,
    },
    {
      id: 'build-cistern',
      title: 'Pose une cuve relais',
      body: 'Construis une cuve avec le bois, puis relie directement un tuyau de pompe sur la cuve ou laisse le robot pépiniériste remplir une cuve proche.',
    },
    {
      id: 'fill-cistern',
      title: 'Utilise la cuve comme source',
      body: `Quand la cuve contient au moins ${CISTERN_SOURCE_MIN_WATER} eau, sélectionne l’outil Tuyau puis clique dessus pour tracer un réseau secondaire.`,
    },
  ];
  return hints.find((hint) => !this.completedTutorialSteps.has(hint.id)) ?? null;
}

export function syncTutorialProgress(this: SimulationContext): void {
  const metrics = this.getMetrics();
  if (this.buildings.some((building) => building.type === 'pump')) this.completedTutorialSteps.add('place-pump');
  if (this.selectedTool?.kind === 'pipe' || this.pipeSource || this.pipes.length > 0) this.completedTutorialSteps.add('select-pipe');
  if (this.pipeSource || this.pipes.length > 0) this.completedTutorialSteps.add('choose-pump');
  if (this.pipes.length > 0) this.completedTutorialSteps.add('trace-pipe');
  if (this.pipes.some((pipe) => pipe.outlet)) this.completedTutorialSteps.add('create-outlet');
  if (metrics.openOutlets >= 1) this.completedTutorialSteps.add('open-outlet');
  if (metrics.knownSoilPercent > 0) this.completedTutorialSteps.add('scan-soil');
  if (metrics.treeCount > 0) this.completedTutorialSteps.add('plant-seed');
  if (metrics.matureTrees > 0) this.completedTutorialSteps.add('grow-tree');
  if (this.milestones.has('harvest-wood')) this.completedTutorialSteps.add('harvest-wood');
  if (this.buildings.some((building) => building.type === 'cistern')) this.completedTutorialSteps.add('build-cistern');
  if (metrics.cisternWater >= CISTERN_SOURCE_MIN_WATER) this.completedTutorialSteps.add('fill-cistern');
}

export function checkMilestones(this: SimulationContext): void {
  const metrics = this.getMetrics();
  let changed = false;
  if (metrics.openOutlets >= 1 && !this.milestones.has('reward-outlet')) {
    this.milestones.add('reward-outlet');
    this.waterResource = clamp(this.waterResource + 8, 0, this.maxWaterResource);
    this.addLog('<b>Première sortie active.</b> La réserve gagne 8 💧 pour lancer les plantations.');
    this.toast('+8 💧 · réseau actif');
    changed = true;
  }
  if (metrics.knownSoilPercent >= 25 && !this.milestones.has('reward-scan')) {
    this.milestones.add('reward-scan');
    this.addLog('<b>Cartographie solide.</b> La pépinière dispose de données fiables pour guider les recherches.');
    this.toast('Cartographie renforcée');
    changed = true;
  }
  if (metrics.restoredPercent >= 10 && !this.milestones.has('reward-restored-10')) {
    this.milestones.add('reward-restored-10');
    this.seedInventory.pioneer += 2;
    this.addLog('<b>Premier noyau vivant.</b> Deux graines pionnières rejoignent l’inventaire.');
    this.toast('+2 graines pionnières');
    changed = true;
  }
  if (metrics.matureTrees >= 1 && !this.milestones.has('tree')) {
    this.milestones.add('tree');
    this.milestones.add('reward-first-mature');
    this.waterResource = clamp(this.waterResource + 12, 0, this.maxWaterResource);
    this.addLog('Le premier arbre mature crée ombre, humus et humidité, puis cherchera un emplacement lumineux où se ressemer.');
    this.toast('Premier arbre mature · +12 💧');
    changed = true;
  }
  if (changed) this.notify();
}

export function unlockBuilding(this: SimulationContext, type: BuildingType, message: string): void {
  if (this.unlockedBuildings.has(type)) return;
  this.unlockedBuildings.add(type);
  this.addLog(message);
  this.toast(`${BUILDINGS[type].name} disponible`);
}

export const progressionMethods = {
  getMissionGoals,
  getUnlockObjectives,
  getNextHint,
  syncTutorialProgress,
  checkMilestones,
  unlockBuilding,
};
