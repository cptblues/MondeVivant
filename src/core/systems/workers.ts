import { SEEDS } from '../config';
import {
  CISTERN_CAPACITY,
  CISTERN_SOURCE_MIN_WATER,
  NURSERY_CAPACITY,
  NURSERY_WORKER_CAPACITY,
  ROBOT_HOUSE_PLANT_DURATION,
  ROBOT_HOUSE_PREPARE_DURATION,
  ROBOT_HOUSE_SCAN_TILE_DURATION,
  ROBOT_HOUSE_WATER_DURATION,
  SEED_SEARCH_DURATION,
  WORKER_PLANT_DURATION,
  WORKER_TRANSFER_DURATION,
} from '../gameConfig';
import { GRID_WIDTH, TerrainType } from '../types';
import type { BuildingInstance, NurseryWorker, RobotTask, RobotWorker } from '../types';
import type { SimulationContext } from '../simulationContext';

function getNurseryWaterDeliveryTarget(simulation: SimulationContext, worker: NurseryWorker): BuildingInstance | null {
  const task = simulation.getRobotTask(worker.currentTaskId);
  const targetId = task?.type === 'water-delivery' && task.target.kind === 'building'
    ? task.target.buildingId
    : worker.targetBuildingId;
  if (targetId === null || targetId === undefined) return null;
  const target = simulation.buildings.find((building) => building.id === targetId);
  return target?.type === 'nursery' || target?.type === 'cistern' ? target : null;
}

function getSeedDeliverySource(simulation: SimulationContext, task: RobotTask | null | undefined): BuildingInstance | null {
  if (!task || task.type !== 'deliver_seeds' || task.sourceBuildingId === undefined) return null;
  return simulation.buildings.find((building) => building.id === task.sourceBuildingId && building.type === 'nursery') ?? null;
}

function getSeedDeliveryDestination(simulation: SimulationContext, task: RobotTask | null | undefined): BuildingInstance | null {
  if (!task || task.type !== 'deliver_seeds' || task.destinationBuildingId === undefined) return null;
  return simulation.getRobotHouseBuilding(task.destinationBuildingId);
}

function workerSeedCargo(worker: NurseryWorker): number {
  return Object.values(worker.seedLoad).reduce((total, value) => total + (value ?? 0), 0);
}

function carriedSeedLabel(worker: NurseryWorker): string {
  const seed = SEEDS[worker.targetSeed ?? 'pioneer'];
  const quantity = worker.targetSeed ? worker.seedLoad[worker.targetSeed] ?? 0 : workerSeedCargo(worker);
  return `${quantity} graine${quantity > 1 ? 's' : ''}${worker.targetSeed ? ` de ${seed.name}` : ''}`;
}

function clearWorkerTargets(worker: NurseryWorker): void {
  worker.targetIndex = null;
  worker.targetSeed = null;
  worker.targetScanZoneId = null;
  worker.targetBuildingId = null;
}

function assignTask(simulation: SimulationContext, worker: NurseryWorker, task: RobotTask): boolean {
  const reserved = simulation.reserveTask(task.id, worker.id);
  if (!reserved) return false;
  worker.currentTaskId = reserved.id;
  clearWorkerTargets(worker);
  worker.waterLoad = 0;
  if (workerSeedCargo(worker) > 0) simulation.returnSeedCargoToNursery(worker, 'Cargaison précédente sécurisée');
  worker.progress = 0;
  if (reserved.type === 'deliver_seeds') {
    const source = getSeedDeliverySource(simulation, reserved);
    const destination = getSeedDeliveryDestination(simulation, reserved);
    if (!source || !destination) {
      simulation.blockTask(reserved.id, 'Livraison de graines incomplète');
      worker.currentTaskId = null;
      return false;
    }
    worker.state = 'to-seed-load';
    worker.targetBuildingId = source.id;
    worker.targetSeed = reserved.seed ?? null;
    worker.message = `Va charger des graines pour la maison #${destination.id}`;
    return true;
  }
  if (reserved.type === 'water-delivery' && reserved.target.kind === 'building') {
    const targetInfo = reserved.target;
    const target = simulation.buildings.find((building) => building.id === targetInfo.buildingId);
    if (!target) {
      simulation.blockTask(reserved.id, 'Bâtiment à ravitailler introuvable');
      worker.currentTaskId = null;
      return false;
    }
    worker.state = 'to-pump';
    worker.targetBuildingId = target.id;
    worker.message = target.type === 'cistern' ? 'Va chercher de l’eau pour une cuve proche' : 'Va chercher de l’eau pour la pépinière';
    return true;
  }
  if (reserved.type === 'scan' && reserved.zoneId !== undefined) {
    const zone = simulation.scanZones.find((candidate) => candidate.id === reserved.zoneId);
    if (!zone) {
      simulation.cancelTask(reserved.id, 'Zone de scan retirée');
      worker.currentTaskId = null;
      return false;
    }
    worker.state = 'to-scan';
    worker.targetIndex = simulation.index(zone.gx, zone.gy);
    worker.targetScanZoneId = zone.id;
    worker.message = 'Vers une zone à analyser';
    return true;
  }
  if (reserved.type === 'plant' && reserved.target.kind === 'cell' && reserved.seed) {
    worker.state = 'to-target';
    worker.targetIndex = reserved.target.index;
    worker.targetSeed = reserved.seed;
    worker.message = `Vers une zone ${SEEDS[reserved.seed].name}`;
    return true;
  }
  simulation.blockTask(reserved.id, 'Tâche robot incomplète');
  worker.currentTaskId = null;
  return false;
}

export function updateNurseryWorker(this: SimulationContext, dt: number): void {
  const nursery = this.getNurseryBuilding();
  if (!nursery) {
    if (this.nurseryWorker) this.returnSeedCargoToNursery(this.nurseryWorker, 'Pépinière absente');
    this.nurseryWorker = null;
    return;
  }
  const worker = this.ensureNurseryWorker(nursery);
  const home = this.workerHome(nursery);

  if (worker.state === 'idle' || worker.state === 'blocked') {
    if (worker.state === 'blocked') {
      worker.progress += dt;
      if (worker.progress < 1.5) return;
    }
    worker.state = 'idle';
    const task = this.selectNextTask(worker);
    if (!task || !assignTask(this, worker, task)) {
      const message = this.getWorkerIdleMessage();
      worker.state = 'blocked';
      worker.currentTaskId = null;
      clearWorkerTargets(worker);
      worker.progress = 0;
      worker.message = message;
      this.notify();
      return;
    }
    this.notify();
    return;
  }

  if (worker.state === 'to-seed-load') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'deliver_seeds' || task.state === 'cancelled' || task.state === 'blocked') {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = task?.blockedReason ?? 'Livraison de graines modifiée';
      this.notify();
      return;
    }
    const source = getSeedDeliverySource(this, task);
    if (!source) {
      this.cancelTask(task.id, 'Pépinière source introuvable');
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Pépinière source introuvable';
      this.notify();
      return;
    }
    if (this.moveWorkerToward(worker, source.gx + 0.5, source.gy + 0.5, dt)) {
      if (!this.startTask(task.id, worker.id)) {
        this.setNurseryWorkerBlocked(worker, this.getRobotTask(task.id)?.blockedReason ?? 'Livraison impossible');
        return;
      }
      worker.state = 'loading-seeds';
      worker.progress = 0;
      worker.message = 'Charge les graines réservées';
      this.notify();
    }
    return;
  }

  if (worker.state === 'loading-seeds') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'deliver_seeds' || task.state !== 'in-progress') {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Livraison de graines modifiée';
      this.notify();
      return;
    }
    worker.progress = Math.min(1, worker.progress + dt / WORKER_TRANSFER_DURATION);
    if (worker.progress < 1) return;
    const loaded = this.loadSeedsForDelivery(worker, task);
    if (!loaded.ok) {
      this.setNurseryWorkerBlocked(worker, loaded.message);
      return;
    }
    const destination = getSeedDeliveryDestination(this, task);
    if (!destination) {
      worker.state = 'returning-seeds';
      worker.progress = 0;
      worker.message = 'Destination invalide, retour des graines';
      this.notify();
      return;
    }
    worker.state = 'to-seed-delivery';
    worker.targetBuildingId = destination.id;
    worker.progress = 0;
    worker.message = `Livre ${carriedSeedLabel(worker)}`;
    this.notify();
    return;
  }

  if (worker.state === 'to-seed-delivery') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'deliver_seeds' || task.state === 'cancelled' || task.state === 'blocked') {
      worker.state = workerSeedCargo(worker) > 0 ? 'returning-seeds' : 'returning';
      worker.progress = 0;
      worker.message = task?.blockedReason ?? 'Livraison annulée, retour';
      this.notify();
      return;
    }
    const destination = getSeedDeliveryDestination(this, task);
    const blockedReason = this.getSeedDeliveryTaskBlockedReason(task);
    if (!destination || blockedReason) {
      if (blockedReason) this.cancelTask(task.id, blockedReason);
      worker.state = workerSeedCargo(worker) > 0 ? 'returning-seeds' : 'returning';
      worker.progress = 0;
      worker.message = blockedReason ?? 'Destination invalide, retour des graines';
      this.notify();
      return;
    }
    if (this.moveWorkerToward(worker, destination.gx + 0.5, destination.gy + 0.5, dt)) {
      worker.state = 'unloading-seeds';
      worker.progress = 0;
      worker.message = 'Dépose les graines dans la maison';
      this.notify();
    }
    return;
  }

  if (worker.state === 'unloading-seeds') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'deliver_seeds') {
      worker.state = workerSeedCargo(worker) > 0 ? 'returning-seeds' : 'returning';
      worker.progress = 0;
      worker.message = 'Livraison de graines modifiée';
      this.notify();
      return;
    }
    worker.progress = Math.min(1, worker.progress + dt / WORKER_TRANSFER_DURATION);
    if (worker.progress < 1) return;
    const delivered = this.deliverSeedsToRobotHouse(worker, task);
    if (!delivered.ok) {
      worker.state = workerSeedCargo(worker) > 0 ? 'returning-seeds' : 'returning';
      worker.progress = 0;
      worker.message = delivered.message;
      this.notify();
      return;
    }
    this.completeTask(task.id);
    worker.currentTaskId = null;
    worker.targetBuildingId = null;
    worker.targetSeed = null;
    worker.state = 'returning';
    worker.progress = 0;
    worker.message = 'Retour à la pépinière après livraison';
    this.updateRestorationParcels(0);
    this.syncRobotTasks();
    this.notify();
    return;
  }

  if (worker.state === 'returning-seeds') {
    if (this.moveWorkerToward(worker, home.x, home.y, dt)) {
      const reason = worker.message || 'Livraison annulée';
      this.returnSeedCargoToNursery(worker, reason);
      if (worker.currentTaskId) this.cancelTask(worker.currentTaskId, reason);
      worker.state = 'idle';
      worker.currentTaskId = null;
      clearWorkerTargets(worker);
      worker.progress = 0;
      worker.message = 'Graines rapportées à la pépinière';
      this.notify();
    }
    return;
  }

  if (worker.state === 'to-pump') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'water-delivery' || task.state === 'cancelled' || task.state === 'blocked') {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = task?.blockedReason ?? 'Tâche de ravitaillement modifiée';
      this.notify();
      return;
    }
    const pump = this.getPumpBuilding();
    if (!pump) {
      this.setNurseryWorkerBlocked(worker, 'Aucune pompe pour ravitailler les bâtiments proches');
      return;
    }
    if (!getNurseryWaterDeliveryTarget(this, worker)) {
      this.cancelTask(task.id, 'Cible de ravitaillement modifiée');
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Cible de ravitaillement modifiée';
      this.notify();
      return;
    }
    if (this.moveWorkerToward(worker, pump.gx + 0.5, pump.gy + 0.5, dt)) {
      if (!this.startTask(task.id, worker.id)) {
        this.setNurseryWorkerBlocked(worker, this.getRobotTask(task.id)?.blockedReason ?? 'Ravitaillement impossible');
        return;
      }
      worker.state = 'loading-water';
      worker.progress = 0;
      worker.message = 'Charge une réserve portable';
      this.notify();
    }
    return;
  }

  if (worker.state === 'loading-water') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'water-delivery' || task.state !== 'in-progress') {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Tâche de ravitaillement modifiée';
      this.notify();
      return;
    }
    worker.progress = Math.min(1, worker.progress + dt / WORKER_TRANSFER_DURATION);
    if (worker.progress < 1) return;
    const target = getNurseryWaterDeliveryTarget(this, worker);
    if (!target) {
      this.cancelTask(task.id, 'Cible de ravitaillement modifiée');
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Cible de ravitaillement modifiée';
      this.notify();
      return;
    }
    const capacity = target.type === 'cistern' ? CISTERN_CAPACITY : NURSERY_CAPACITY;
    const missing = Math.max(0, capacity - target.waterStored);
    const load = Math.min(NURSERY_WORKER_CAPACITY, missing, this.waterResource);
    if (load <= 0.1) {
      this.setNurseryWorkerBlocked(worker, 'Recharge impossible pour le bâtiment ciblé');
      return;
    }
    this.waterResource -= load;
    worker.waterLoad = load;
    worker.state = 'to-nursery';
    worker.progress = 0;
    worker.message = target.type === 'cistern'
      ? `Transporte ${load.toFixed(1)} eau vers une cuve`
      : `Transporte ${load.toFixed(1)} eau à la pépinière`;
    this.notify();
    return;
  }

  if (worker.state === 'to-nursery') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'water-delivery' || task.state === 'cancelled' || task.state === 'blocked') {
      if (worker.waterLoad > 0) {
        this.waterResource = Math.min(this.maxWaterResource, this.waterResource + worker.waterLoad);
        worker.waterLoad = 0;
      }
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = task?.blockedReason ?? 'Tâche de ravitaillement modifiée';
      this.notify();
      return;
    }
    const target = getNurseryWaterDeliveryTarget(this, worker);
    if (!target) {
      if (worker.currentTaskId) this.cancelTask(worker.currentTaskId, 'Cible de ravitaillement modifiée');
      this.waterResource = Math.min(this.maxWaterResource, this.waterResource + worker.waterLoad);
      worker.waterLoad = 0;
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Cible de ravitaillement modifiée';
      this.notify();
      return;
    }
    if (this.moveWorkerToward(worker, target.gx + 0.5, target.gy + 0.5, dt)) {
      worker.state = 'unloading-water';
      worker.progress = 0;
      worker.message = target.type === 'cistern' ? 'Verse l’eau dans la cuve' : 'Verse l’eau dans la pépinière';
      this.notify();
    }
    return;
  }

  if (worker.state === 'unloading-water') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'water-delivery') {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Tâche de ravitaillement modifiée';
      this.notify();
      return;
    }
    worker.progress = Math.min(1, worker.progress + dt / WORKER_TRANSFER_DURATION);
    if (worker.progress < 1) return;
    const target = getNurseryWaterDeliveryTarget(this, worker);
    if (target) {
      const capacity = target.type === 'cistern' ? CISTERN_CAPACITY : NURSERY_CAPACITY;
      const before = target.waterStored;
      target.waterStored = Math.min(capacity, target.waterStored + worker.waterLoad);
      if (target.type === 'cistern' && before < CISTERN_SOURCE_MIN_WATER && target.waterStored >= CISTERN_SOURCE_MIN_WATER) {
        this.completedTutorialSteps.add('fill-cistern');
        this.milestones.add('cistern-ready');
        this.addLog('Le robot pépiniériste a rendu une <b>cuve relais</b> utilisable comme source.');
        this.toast('Cuve remplie par le robot');
      }
    }
    worker.waterLoad = 0;
    worker.targetBuildingId = null;
    this.completeTask(task.id);
    worker.currentTaskId = null;
    worker.state = 'idle';
    worker.progress = 0;
    worker.message = target?.type === 'cistern' ? 'Cuve proche ravitaillée' : 'Réserve de pépinière ravitaillée';
    this.wakeNurseryWorker();
    this.notify();
    return;
  }

  if (worker.state === 'to-scan') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'scan' || task.state === 'cancelled' || task.state === 'blocked' || worker.targetIndex === null || worker.targetScanZoneId === null || !this.isScanTargetQueued(worker.targetScanZoneId)) {
      if (task?.id) this.cancelTask(task.id, task.blockedReason ?? 'Zone de scan modifiée');
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Zone de scan modifiée';
      this.notify();
      return;
    }
    const targetX = (worker.targetIndex % GRID_WIDTH) + 0.5;
    const targetY = Math.floor(worker.targetIndex / GRID_WIDTH) + 0.5;
    if (this.moveWorkerToward(worker, targetX, targetY, dt)) {
      if (!this.startTask(task.id, worker.id)) {
        this.setNurseryWorkerBlocked(worker, this.getRobotTask(task.id)?.blockedReason ?? 'Scan impossible');
        return;
      }
      worker.state = 'scanning';
      worker.progress = 0;
      worker.message = 'Analyse globale de la zone';
      this.notify();
    }
    return;
  }

  if (worker.state === 'scanning') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'scan' || worker.targetScanZoneId === null || !this.isScanTargetQueued(worker.targetScanZoneId)) {
      if (task?.id) this.cancelTask(task.id, task.blockedReason ?? 'Zone de scan modifiée');
      worker.state = 'returning';
      worker.targetIndex = null;
      worker.targetScanZoneId = null;
      worker.progress = 0;
      worker.message = 'Zone de scan modifiée';
      this.notify();
      return;
    }
    this.advanceScanZone(worker.targetScanZoneId, dt);
    const zone = this.scanZones.find((candidate) => candidate.id === worker.targetScanZoneId);
    if (zone) {
      worker.progress = Math.min(1, zone.progress / zone.duration);
      if (worker.progress < 1) return;
    }
    this.completeTask(task.id);
    worker.state = 'idle';
    worker.targetIndex = null;
    worker.targetScanZoneId = null;
    worker.targetBuildingId = null;
    worker.currentTaskId = null;
    worker.progress = 0;
    worker.message = 'Zone de sols mémorisée';
    this.notify();
    return;
  }

  if (worker.state === 'to-seed-search') {
    if (worker.targetIndex === null) {
      worker.state = 'returning';
      worker.message = 'Retour à la pépinière';
      this.notify();
      return;
    }
    const targetX = (worker.targetIndex % GRID_WIDTH) + 0.5;
    const targetY = Math.floor(worker.targetIndex / GRID_WIDTH) + 0.5;
    if (this.moveWorkerToward(worker, targetX, targetY, dt)) {
      worker.state = 'searching-seed';
      worker.progress = 0;
      worker.message = 'Fouille le terrain pour une graine basique';
      this.notify();
    }
    return;
  }

  if (worker.state === 'searching-seed') {
    worker.progress = Math.min(1, worker.progress + dt / SEED_SEARCH_DURATION);
    if (worker.progress < 1) return;
    worker.state = 'returning-seed';
    worker.targetIndex = null;
    worker.progress = 0;
    worker.message = 'Ramène une graine basique';
    this.notify();
    return;
  }

  if (worker.state === 'returning-seed') {
    if (this.moveWorkerToward(worker, home.x, home.y, dt)) {
      this.seedInventory.pioneer += 1;
      worker.state = 'idle';
      worker.currentTaskId = null;
      worker.targetSeed = null;
      worker.targetScanZoneId = null;
      worker.targetBuildingId = null;
      worker.progress = 0;
      worker.message = 'Graine basique retrouvée';
      this.addLog(`Le robot pépiniériste rapporte <b>1 graine de ${SEEDS.pioneer.name}</b>.`);
      this.toast('+1 graine basique');
      this.notify();
    }
    return;
  }

  if (worker.state === 'to-target') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'plant' || task.state === 'cancelled' || task.state === 'blocked' || worker.targetIndex === null || worker.targetSeed === null) {
      if (task?.id) this.cancelTask(task.id, task.blockedReason ?? 'Zone de plantation modifiée');
      worker.state = 'returning';
      worker.message = 'Retour à la pépinière';
      return;
    }
    if (!this.isWorkerTargetQueued(worker.targetSeed, worker.targetIndex)) {
      this.cancelTask(task.id, 'Zone modifiée, retour à la pépinière');
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Zone modifiée, retour à la pépinière';
      this.notify();
      return;
    }
    const targetX = (worker.targetIndex % GRID_WIDTH) + 0.5;
    const targetY = Math.floor(worker.targetIndex / GRID_WIDTH) + 0.5;
    if (this.moveWorkerToward(worker, targetX, targetY, dt)) {
      if (!this.startTask(task.id, worker.id)) {
        this.setNurseryWorkerBlocked(worker, this.getRobotTask(task.id)?.blockedReason ?? 'Plantation impossible');
        return;
      }
      worker.state = 'planting';
      worker.progress = 0;
      worker.message = `Plantation de ${SEEDS[worker.targetSeed].name}`;
      this.notify();
    }
    return;
  }

  if (worker.state === 'planting') {
    const task = this.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'plant' || task.state !== 'in-progress') {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Tâche de plantation modifiée';
      this.notify();
      return;
    }
    worker.progress = Math.min(1, worker.progress + dt / WORKER_PLANT_DURATION);
    if (worker.progress < 1) return;
    if (worker.targetIndex !== null && worker.targetSeed !== null) {
      const gx = worker.targetIndex % GRID_WIDTH;
      const gy = Math.floor(worker.targetIndex / GRID_WIDTH);
      if (this.isWorkerTargetQueued(worker.targetSeed, worker.targetIndex)) {
        const result = this.plantSeedAt(worker.targetSeed, gx, gy, 'worker');
        if (!result.ok) {
          this.blockTask(task.id, result.message);
          this.addLog(`Le robot pépiniériste suspend une plantation : ${result.message}.`);
        } else {
          this.completeTask(task.id);
        }
      } else {
        this.cancelTask(task.id, 'Zone de plantation modifiée');
      }
    }
    worker.state = 'returning';
    worker.progress = 0;
    worker.message = 'Retour à la pépinière';
    this.notify();
    return;
  }

  if (worker.state === 'returning') {
    if (this.moveWorkerToward(worker, home.x, home.y, dt)) {
      if (workerSeedCargo(worker) > 0) this.returnSeedCargoToNursery(worker, 'Retour à la pépinière');
      worker.state = 'idle';
      worker.currentTaskId = null;
      worker.targetIndex = null;
      worker.targetSeed = null;
      worker.targetScanZoneId = null;
      worker.targetBuildingId = null;
      worker.seedLoad = {};
      worker.progress = 0;
      worker.message = 'Prêt à repartir';
      this.notify();
    }
  }
}

function restorationIdleMessage(simulation: SimulationContext, house: BuildingInstance): { message: string; blocked: boolean } {
  const parcel = simulation.getRestorationParcelForHouse(house.id);
  if (!parcel || !parcel.bounds) return { message: 'Parcelle à dessiner pour ce robot', blocked: true };
  if (parcel.state === 'autonomous') return { message: 'Parcelle autonome, robot disponible', blocked: false };
  const blocker = parcel.blockers[0];
  if (blocker) return { message: blocker, blocked: true };
  const need = parcel.needs[0];
  if (need) return { message: need, blocked: false };
  return { message: 'Surveille la parcelle', blocked: false };
}

function assignRestorationTask(simulation: SimulationContext, worker: RobotWorker, task: RobotTask): boolean {
  const reserved = simulation.reserveTask(task.id, worker.id);
  if (!reserved || reserved.target.kind !== 'cell' || reserved.homeBuildingId === undefined) return false;
  worker.currentTaskId = reserved.id;
  clearWorkerTargets(worker);
  worker.targetIndex = reserved.target.index;
  worker.targetBuildingId = reserved.homeBuildingId;
  worker.targetSeed = reserved.seed ?? null;
  worker.waterLoad = 0;
  worker.progress = 0;
  worker.state = 'to-target';
  if (reserved.type === 'scan') worker.message = 'Va analyser une tuile de parcelle';
  else if (reserved.type === 'prepare_soil') worker.message = 'Va préparer un emplacement';
  else if (reserved.type === 'water_plant') worker.message = 'Va arroser la parcelle';
  else if (reserved.type === 'plant') worker.message = reserved.seed ? `Va planter ${SEEDS[reserved.seed].name}` : 'Va planter une graine compatible';
  else worker.message = 'Va traiter une tâche de parcelle';
  return true;
}

function setRobotHouseWorkerBlocked(simulation: SimulationContext, worker: RobotWorker, message: string): void {
  if (worker.currentTaskId) simulation.blockTask(worker.currentTaskId, message);
  worker.state = 'blocked';
  worker.currentTaskId = null;
  clearWorkerTargets(worker);
  worker.waterLoad = 0;
  worker.progress = 0;
  worker.message = message;
  simulation.notify();
}

function updateRobotHouseWorker(simulation: SimulationContext, house: BuildingInstance, worker: RobotWorker, dt: number): void {
  const home = simulation.workerHome(house);
  const parcel = simulation.getRestorationParcelForHouse(house.id);
  if (parcel?.state === 'autonomous' && worker.currentTaskId) {
    simulation.cancelTask(worker.currentTaskId, 'Parcelle autonome');
    worker.currentTaskId = null;
    clearWorkerTargets(worker);
    worker.state = 'returning';
    worker.message = 'Retour maison, parcelle autonome';
    simulation.notify();
    return;
  }

  if (worker.state === 'idle' || worker.state === 'blocked') {
    if (worker.state === 'blocked') {
      worker.progress += dt;
      if (worker.progress < 1.5) return;
    }
    worker.state = 'idle';
    worker.progress = 0;
    const task = simulation.selectNextTask(worker);
    if (task && assignRestorationTask(simulation, worker, task)) {
      simulation.notify();
      return;
    }
    const idle = restorationIdleMessage(simulation, house);
    const nextState = idle.blocked ? 'blocked' : 'idle';
    if (worker.state !== nextState || worker.message !== idle.message) {
      worker.state = nextState;
      worker.currentTaskId = null;
      clearWorkerTargets(worker);
      worker.message = idle.message;
      simulation.notify();
    }
    return;
  }

  if (worker.state === 'to-target') {
    const task = simulation.getRobotTask(worker.currentTaskId);
    if (!task || task.homeBuildingId !== house.id || task.target.kind !== 'cell' || task.state === 'cancelled' || task.state === 'blocked' || worker.targetIndex === null) {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = task?.blockedReason ?? 'Tâche de parcelle modifiée';
      simulation.notify();
      return;
    }
    const targetX = (worker.targetIndex % GRID_WIDTH) + 0.5;
    const targetY = Math.floor(worker.targetIndex / GRID_WIDTH) + 0.5;
    if (simulation.moveWorkerToward(worker, targetX, targetY, dt)) {
      if (!simulation.startTask(task.id, worker.id)) {
        setRobotHouseWorkerBlocked(simulation, worker, simulation.getRobotTask(task.id)?.blockedReason ?? 'Tâche de parcelle impossible');
        return;
      }
      worker.progress = 0;
      if (task.type === 'scan') {
        worker.state = 'scanning';
        worker.message = 'Analyse une tuile';
      } else if (task.type === 'prepare_soil') {
        worker.state = 'preparing';
        worker.message = 'Prépare le sol';
      } else if (task.type === 'water_plant') {
        worker.state = 'watering';
        worker.message = 'Arrose depuis la réserve locale';
      } else if (task.type === 'plant') {
        worker.state = 'planting';
        worker.targetSeed = task.seed ?? null;
        worker.message = task.seed ? `Plante ${SEEDS[task.seed].name}` : 'Plante une graine compatible';
      } else {
        setRobotHouseWorkerBlocked(simulation, worker, 'Type de tâche non pris en charge par la maison');
        return;
      }
      simulation.notify();
    }
    return;
  }

  if (worker.state === 'scanning') {
    const task = simulation.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'scan' || task.target.kind !== 'cell' || task.state !== 'in-progress') {
      worker.state = 'returning';
      worker.message = 'Scan de parcelle modifié';
      simulation.notify();
      return;
    }
    worker.progress = Math.min(1, worker.progress + dt / ROBOT_HOUSE_SCAN_TILE_DURATION);
    if (worker.progress < 1) return;
    const cell = simulation.cells[task.target.index];
    if (cell && cell.terrain !== TerrainType.Rock) {
      cell.known = true;
      cell.revealed = true;
      simulation.discoveredSoils.add(cell.terrain);
    }
    simulation.completeTask(task.id);
    worker.currentTaskId = null;
    worker.state = 'idle';
    worker.progress = 0;
    worker.message = 'Tuile analysée';
    simulation.updateRestorationParcels(0);
    simulation.notify();
    return;
  }

  if (worker.state === 'preparing') {
    const task = simulation.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'prepare_soil' || task.target.kind !== 'cell' || task.state !== 'in-progress') {
      worker.state = 'returning';
      worker.message = 'Préparation modifiée';
      simulation.notify();
      return;
    }
    worker.progress = Math.min(1, worker.progress + dt / ROBOT_HOUSE_PREPARE_DURATION);
    if (worker.progress < 1) return;
    const result = simulation.prepareSoilAt(house.id, task.target.index);
    if (result.ok) simulation.completeTask(task.id);
    else simulation.blockTask(task.id, result.message);
    worker.currentTaskId = null;
    worker.state = 'idle';
    worker.progress = 0;
    worker.message = result.ok ? 'Sol préparé' : result.message;
    simulation.updateRestorationParcels(0);
    simulation.notify();
    return;
  }

  if (worker.state === 'watering') {
    const task = simulation.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'water_plant' || task.target.kind !== 'cell' || task.state !== 'in-progress') {
      worker.state = 'returning';
      worker.message = 'Arrosage modifié';
      simulation.notify();
      return;
    }
    worker.progress = Math.min(1, worker.progress + dt / ROBOT_HOUSE_WATER_DURATION);
    if (worker.progress < 1) return;
    const result = simulation.waterPlantFromRobotHouse(house.id, task.target.index);
    if (result.ok) simulation.completeTask(task.id);
    else simulation.blockTask(task.id, result.message);
    worker.currentTaskId = null;
    worker.state = 'idle';
    worker.progress = 0;
    worker.message = result.ok ? 'Arrosage terminé' : result.message;
    simulation.updateRestorationParcels(0);
    simulation.notify();
    return;
  }

  if (worker.state === 'planting') {
    const task = simulation.getRobotTask(worker.currentTaskId);
    if (!task || task.type !== 'plant' || task.target.kind !== 'cell' || task.state !== 'in-progress') {
      worker.state = 'returning';
      worker.message = 'Plantation modifiée';
      simulation.notify();
      return;
    }
    worker.progress = Math.min(1, worker.progress + dt / ROBOT_HOUSE_PLANT_DURATION);
    if (worker.progress < 1) return;
    const parcelForSeed = simulation.getRestorationParcelForHouse(house.id);
    const seed = task.seed ?? (parcelForSeed ? simulation.chooseRestorationSeedForIndex(parcelForSeed, task.target.index) : null);
    const result = seed
      ? simulation.plantSeedFromRobotHouse(house.id, seed, task.target.gx, task.target.gy)
      : { ok: false, message: 'Aucune graine compatible dans la maison' };
    if (result.ok) simulation.completeTask(task.id);
    else simulation.blockTask(task.id, result.message);
    worker.currentTaskId = null;
    worker.targetSeed = null;
    worker.state = 'idle';
    worker.progress = 0;
    worker.message = result.ok ? 'Plantation terminée' : result.message;
    simulation.updateRestorationParcels(0);
    simulation.notify();
    return;
  }

  if (worker.state === 'returning') {
    if (simulation.moveWorkerToward(worker, home.x, home.y, dt)) {
      worker.state = 'idle';
      worker.currentTaskId = null;
      clearWorkerTargets(worker);
      worker.progress = 0;
      worker.message = parcel?.state === 'autonomous' ? 'Parcelle autonome, robot disponible' : 'Prêt pour la parcelle';
      simulation.notify();
    }
  }
}

export function updateRobotHouseWorkers(this: SimulationContext, dt: number): void {
  const houses = this.buildings.filter((building) => building.type === 'robot-house');
  const houseIds = new Set(houses.map((house) => house.id));
  this.robotHouseWorkers = this.robotHouseWorkers.filter((worker) => worker.homeBuildingId !== null && houseIds.has(worker.homeBuildingId));
  for (const house of houses) {
    const worker = this.ensureRobotHouseWorker(house);
    updateRobotHouseWorker(this, house, worker, dt);
  }
}

export function ensureNurseryWorker(this: SimulationContext, nursery: BuildingInstance): NurseryWorker {
  if (!this.nurseryWorker) {
    const home = this.workerHome(nursery);
    this.nurseryWorker = {
      id: 'nursery-1',
      role: 'nursery',
      state: 'idle',
      x: home.x,
      y: home.y,
      homeBuildingId: nursery.id,
      currentTaskId: null,
      targetIndex: null,
      targetSeed: null,
      targetScanZoneId: null,
      targetBuildingId: null,
      waterLoad: 0,
      seedLoad: {},
      progress: 0,
      message: 'Peignez une zone pour lancer les plantations',
    };
  }
  return this.nurseryWorker;
}

export function ensureRobotHouseWorker(this: SimulationContext, house: BuildingInstance): RobotWorker {
  let worker = this.robotHouseWorkers.find((candidate) => candidate.homeBuildingId === house.id);
  if (!worker) {
    const home = this.workerHome(house);
    worker = {
      id: `restoration-${house.id}`,
      role: 'restoration',
      state: 'idle',
      x: home.x,
      y: home.y,
      homeBuildingId: house.id,
      currentTaskId: null,
      targetIndex: null,
      targetSeed: null,
      targetScanZoneId: null,
      targetBuildingId: null,
      waterLoad: 0,
      seedLoad: {},
      progress: 0,
      message: 'Définissez une parcelle rectangulaire',
    };
    this.robotHouseWorkers.push(worker);
  }
  return worker;
}

export function wakeNurseryWorker(this: SimulationContext): void {
  if (!this.nurseryWorker || this.nurseryWorker.state !== 'blocked') return;
  this.nurseryWorker.state = 'idle';
  this.nurseryWorker.progress = 0;
  this.nurseryWorker.message = 'Prêt à repartir';
}

export function clearNurseryWorkerTask(this: SimulationContext, worker: NurseryWorker): void {
  if (workerSeedCargo(worker) > 0) this.returnSeedCargoToNursery(worker, 'Tâche interrompue');
  if (worker.currentTaskId) this.cancelTask(worker.currentTaskId, 'Tâche interrompue');
  worker.currentTaskId = null;
  clearWorkerTargets(worker);
  worker.waterLoad = 0;
  worker.seedLoad = {};
}

export function setNurseryWorkerBlocked(this: SimulationContext, worker: NurseryWorker, message: string): void {
  if (worker.state === 'blocked' && worker.message === message) return;
  if (workerSeedCargo(worker) > 0) this.returnSeedCargoToNursery(worker, message);
  if (worker.currentTaskId) this.blockTask(worker.currentTaskId, message);
  worker.state = 'blocked';
  worker.currentTaskId = null;
  clearWorkerTargets(worker);
  worker.waterLoad = 0;
  worker.seedLoad = {};
  worker.progress = 0;
  worker.message = message;
  this.notify();
}

export const workersMethods = {
  updateNurseryWorker,
  ensureNurseryWorker,
  updateRobotHouseWorkers,
  ensureRobotHouseWorker,
  wakeNurseryWorker,
  clearNurseryWorkerTask,
  setNurseryWorkerBlocked,
};
