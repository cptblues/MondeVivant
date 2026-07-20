import { SEEDS } from '../config';
import { CISTERN_CAPACITY, CISTERN_SOURCE_MIN_WATER, NURSERY_CAPACITY, NURSERY_WORKER_CAPACITY, SEED_SEARCH_DURATION, WORKER_PLANT_DURATION, WORKER_TRANSFER_DURATION } from '../gameConfig';
import { GRID_WIDTH } from '../types';
import type { BuildingInstance, NurseryWorker, RobotTask } from '../types';
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
  worker.progress = 0;
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
      worker.state = 'idle';
      worker.currentTaskId = null;
      worker.targetIndex = null;
      worker.targetSeed = null;
      worker.targetScanZoneId = null;
      worker.targetBuildingId = null;
      worker.progress = 0;
      worker.message = 'Prêt à repartir';
      this.notify();
    }
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
      currentTaskId: null,
      targetIndex: null,
      targetSeed: null,
      targetScanZoneId: null,
      targetBuildingId: null,
      waterLoad: 0,
      progress: 0,
      message: 'Peignez une zone pour lancer les plantations',
    };
  }
  return this.nurseryWorker;
}

export function wakeNurseryWorker(this: SimulationContext): void {
  if (!this.nurseryWorker || this.nurseryWorker.state !== 'blocked') return;
  this.nurseryWorker.state = 'idle';
  this.nurseryWorker.progress = 0;
  this.nurseryWorker.message = 'Prêt à repartir';
}

export function clearNurseryWorkerTask(this: SimulationContext, worker: NurseryWorker): void {
  if (worker.currentTaskId) this.cancelTask(worker.currentTaskId, 'Tâche interrompue');
  worker.currentTaskId = null;
  clearWorkerTargets(worker);
  worker.waterLoad = 0;
}

export function setNurseryWorkerBlocked(this: SimulationContext, worker: NurseryWorker, message: string): void {
  if (worker.state === 'blocked' && worker.message === message) return;
  if (worker.currentTaskId) this.blockTask(worker.currentTaskId, message);
  worker.state = 'blocked';
  worker.currentTaskId = null;
  clearWorkerTargets(worker);
  worker.waterLoad = 0;
  worker.progress = 0;
  worker.message = message;
  this.notify();
}

export const workersMethods = {
  updateNurseryWorker,
  ensureNurseryWorker,
  wakeNurseryWorker,
  clearNurseryWorkerTask,
  setNurseryWorkerBlocked,
};
