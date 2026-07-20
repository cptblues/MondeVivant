import { SEEDS } from '../config';
import { CARRIER_TRANSFER_DURATION, CISTERN_CAPACITY, CISTERN_SOURCE_MIN_WATER, NURSERY_CAPACITY, NURSERY_WORKER_CAPACITY, SEED_SEARCH_DURATION, WORKER_PLANT_DURATION } from '../gameConfig';
import { GRID_WIDTH } from '../types';
import type { BuildingInstance, NurseryWorker } from '../types';
import type { SimulationContext } from '../simulationContext';

function getNurseryWaterDeliveryTarget(simulation: SimulationContext, worker: NurseryWorker): BuildingInstance | null {
  if (worker.targetBuildingId === null) return null;
  const target = simulation.buildings.find((building) => building.id === worker.targetBuildingId);
  return target?.type === 'nursery' || target?.type === 'cistern' ? target : null;
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
    const waterTarget = this.findNurseryWaterTarget(nursery);
    if (waterTarget) {
      const pump = this.getPumpBuilding();
      if (!pump) {
        this.setNurseryWorkerBlocked(worker, 'Aucune pompe pour ravitailler les bâtiments proches');
        return;
      }
      if (this.waterResource <= 0.25) {
        this.setNurseryWorkerBlocked(worker, 'Réserve de pompe trop basse pour ravitailler');
        return;
      }
      worker.state = 'to-pump';
      worker.targetIndex = null;
      worker.targetSeed = null;
      worker.targetScanZoneId = null;
      worker.targetBuildingId = waterTarget.id;
      worker.waterLoad = 0;
      worker.progress = 0;
      worker.message = waterTarget.type === 'cistern' ? 'Va chercher de l’eau pour une cuve proche' : 'Va chercher de l’eau pour la pépinière';
      this.notify();
    }
  }

  if (worker.state === 'to-pump') {
    const pump = this.getPumpBuilding();
    if (!pump) {
      this.setNurseryWorkerBlocked(worker, 'Aucune pompe pour ravitailler les bâtiments proches');
      return;
    }
    if (!getNurseryWaterDeliveryTarget(this, worker)) {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Cible de ravitaillement modifiée';
      this.notify();
      return;
    }
    if (this.moveWorkerToward(worker, pump.gx + 0.5, pump.gy + 0.5, dt)) {
      worker.state = 'loading-water';
      worker.progress = 0;
      worker.message = 'Charge une réserve portable';
      this.notify();
    }
    return;
  }

  if (worker.state === 'loading-water') {
    worker.progress = Math.min(1, worker.progress + dt / CARRIER_TRANSFER_DURATION);
    if (worker.progress < 1) return;
    const target = getNurseryWaterDeliveryTarget(this, worker);
    if (!target) {
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
    const target = getNurseryWaterDeliveryTarget(this, worker);
    if (!target) {
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
    worker.progress = Math.min(1, worker.progress + dt / CARRIER_TRANSFER_DURATION);
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
    worker.state = 'idle';
    worker.progress = 0;
    worker.message = target?.type === 'cistern' ? 'Cuve proche ravitaillée' : 'Réserve de pépinière ravitaillée';
    this.wakeNurseryWorker();
    this.notify();
    return;
  }

  if (worker.state === 'to-scan') {
    if (worker.targetIndex === null || worker.targetScanZoneId === null || !this.isScanTargetQueued(worker.targetScanZoneId)) {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Zone de scan modifiée';
      this.notify();
      return;
    }
    const targetX = (worker.targetIndex % GRID_WIDTH) + 0.5;
    const targetY = Math.floor(worker.targetIndex / GRID_WIDTH) + 0.5;
    if (this.moveWorkerToward(worker, targetX, targetY, dt)) {
      worker.state = 'scanning';
      worker.progress = 0;
      worker.message = 'Analyse globale de la zone';
      this.notify();
    }
    return;
  }

  if (worker.state === 'scanning') {
    if (worker.targetScanZoneId === null || !this.isScanTargetQueued(worker.targetScanZoneId)) {
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
    worker.state = 'idle';
    worker.targetIndex = null;
    worker.targetScanZoneId = null;
    worker.targetBuildingId = null;
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

  if (worker.state === 'idle' || worker.state === 'blocked') {
    const scanTarget = this.findNextScanTarget(worker);
    if (scanTarget) {
      worker.state = 'to-scan';
      worker.targetIndex = scanTarget.index;
      worker.targetSeed = null;
      worker.targetScanZoneId = scanTarget.zoneId;
      worker.targetBuildingId = null;
      worker.progress = 0;
      worker.message = 'Vers une zone à analyser';
      this.notify();
      return;
    }
    const target = this.findNextWorkerTarget(worker);
    if (!target) {
      const message = this.getWorkerIdleMessage();
      if (worker.state !== 'blocked' || worker.message !== message) {
        worker.state = 'blocked';
        worker.targetIndex = null;
        worker.targetSeed = null;
        worker.targetScanZoneId = null;
        worker.targetBuildingId = null;
        worker.progress = 0;
        worker.message = message;
        this.notify();
      }
      return;
    }
    worker.state = 'to-target';
    worker.targetIndex = target.index;
    worker.targetSeed = target.seed;
    worker.targetScanZoneId = null;
    worker.targetBuildingId = null;
    worker.progress = 0;
    worker.message = `Vers une zone ${SEEDS[target.seed].name}`;
    this.notify();
  }

  if (worker.state === 'to-target') {
    if (worker.targetIndex === null || worker.targetSeed === null) {
      worker.state = 'returning';
      worker.message = 'Retour à la pépinière';
      return;
    }
    if (!this.isWorkerTargetQueued(worker.targetSeed, worker.targetIndex)) {
      worker.state = 'returning';
      worker.progress = 0;
      worker.message = 'Zone modifiée, retour à la pépinière';
      this.notify();
      return;
    }
    const targetX = (worker.targetIndex % GRID_WIDTH) + 0.5;
    const targetY = Math.floor(worker.targetIndex / GRID_WIDTH) + 0.5;
    if (this.moveWorkerToward(worker, targetX, targetY, dt)) {
      worker.state = 'planting';
      worker.progress = 0;
      worker.message = `Plantation de ${SEEDS[worker.targetSeed].name}`;
      this.notify();
    }
    return;
  }

  if (worker.state === 'planting') {
    worker.progress = Math.min(1, worker.progress + dt / WORKER_PLANT_DURATION);
    if (worker.progress < 1) return;
    if (worker.targetIndex !== null && worker.targetSeed !== null) {
      const gx = worker.targetIndex % GRID_WIDTH;
      const gy = Math.floor(worker.targetIndex / GRID_WIDTH);
      if (this.isWorkerTargetQueued(worker.targetSeed, worker.targetIndex)) {
        const result = this.plantSeedAt(worker.targetSeed, gx, gy, 'worker');
        if (!result.ok) {
          this.addLog(`Le robot pépiniériste suspend une plantation : ${result.message}.`);
        }
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
      state: 'idle',
      x: home.x,
      y: home.y,
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

export function setNurseryWorkerBlocked(this: SimulationContext, worker: NurseryWorker, message: string): void {
  if (worker.state === 'blocked' && worker.message === message) return;
  worker.state = 'blocked';
  worker.targetIndex = null;
  worker.targetSeed = null;
  worker.targetScanZoneId = null;
  worker.targetBuildingId = null;
  worker.waterLoad = 0;
  worker.progress = 0;
  worker.message = message;
  this.notify();
}

export const workersMethods = {
  updateNurseryWorker,
  ensureNurseryWorker,
  wakeNurseryWorker,
  setNurseryWorkerBlocked,
};
