import { CARRIER_CAPACITY, CARRIER_SPEED_CELLS_PER_SECOND, CARRIER_TRANSFER_DURATION, CISTERN_CAPACITY, CISTERN_SOURCE_MIN_WATER } from '../gameConfig';
import type { BuildingInstance, CarrierWorker } from '../types';
import type { SimulationContext } from '../simulationContext';
import { distance } from '../../utils/math';

export function ensureCarrierWorker(this: SimulationContext, carrier: BuildingInstance): CarrierWorker {
  if (!this.carrierWorker) {
    const home = this.workerHome(carrier);
    this.carrierWorker = {
      state: 'idle',
      x: home.x,
      y: home.y,
      targetCisternId: null,
      waterLoad: 0,
      progress: 0,
      message: 'Prêt à remplir les cuves',
    };
  }
  return this.carrierWorker;
}

export function findCarrierTarget(this: SimulationContext): BuildingInstance | null {
  const carrier = this.getCarrierBuilding();
  const candidates = this.buildings
    .filter((building) => building.type === 'cistern' && building.waterStored < CISTERN_CAPACITY - 0.5)
    .sort((a, b) => {
      const missingA = CISTERN_CAPACITY - a.waterStored;
      const missingB = CISTERN_CAPACITY - b.waterStored;
      const distanceA = carrier ? distance(carrier.gx, carrier.gy, a.gx, a.gy) : 0;
      const distanceB = carrier ? distance(carrier.gx, carrier.gy, b.gx, b.gy) : 0;
      return missingB - missingA || distanceA - distanceB;
    });
  return candidates[0] ?? null;
}

export function setCarrierBlocked(this: SimulationContext, worker: CarrierWorker, message: string): void {
  if (worker.state === 'blocked' && worker.message === message) return;
  worker.state = 'blocked';
  worker.targetCisternId = null;
  worker.waterLoad = 0;
  worker.progress = 0;
  worker.message = message;
  this.notify();
}

export function updateCarrierWorker(this: SimulationContext, dt: number): void {
  const carrier = this.getCarrierBuilding();
  if (!carrier) {
    this.carrierWorker = null;
    return;
  }
  const worker = this.ensureCarrierWorker(carrier);
  const pump = this.getPumpBuilding();
  if (!pump) {
    this.setCarrierBlocked(worker, 'Aucune pompe disponible');
    return;
  }

  if (worker.state === 'idle' || worker.state === 'blocked') {
    if (worker.state === 'blocked') {
      worker.progress += dt;
      if (worker.progress < 1.2) return;
    }
    const target = this.findCarrierTarget();
    if (!target) {
      this.setCarrierBlocked(worker, 'Aucune cuve à remplir');
      return;
    }
    if (this.waterResource <= 0.25) {
      this.setCarrierBlocked(worker, 'Réserve de pompe trop basse');
      return;
    }
    worker.targetCisternId = target.id;
    worker.state = 'to-pump';
    worker.progress = 0;
    worker.message = 'Va charger de l’eau à la pompe';
    this.notify();
  }

  const target = worker.targetCisternId ? this.buildings.find((building) => building.id === worker.targetCisternId && building.type === 'cistern') : null;
  if (!target) {
    worker.targetCisternId = null;
    worker.waterLoad = 0;
    worker.state = 'idle';
    worker.message = 'Recherche une cuve';
    this.notify();
    return;
  }

  if (worker.state === 'to-pump') {
    if (this.moveWorkerToward(worker, pump.gx + 0.5, pump.gy + 0.5, dt, CARRIER_SPEED_CELLS_PER_SECOND)) {
      worker.state = 'loading';
      worker.progress = 0;
      worker.message = 'Charge une citerne portable';
      this.notify();
    }
    return;
  }

  if (worker.state === 'loading') {
    worker.progress = Math.min(1, worker.progress + dt / CARRIER_TRANSFER_DURATION);
    if (worker.progress < 1) return;
    const missing = Math.max(0, CISTERN_CAPACITY - target.waterStored);
    const load = Math.min(CARRIER_CAPACITY, missing, this.waterResource);
    if (load <= 0.1) {
      worker.state = 'idle';
      worker.progress = 0;
      worker.message = 'Recharge impossible';
      this.notify();
      return;
    }
    this.waterResource -= load;
    worker.waterLoad = load;
    worker.state = 'to-cistern';
    worker.progress = 0;
    worker.message = `Transporte ${load.toFixed(1)} 💧 vers la cuve`;
    this.notify();
    return;
  }

  if (worker.state === 'to-cistern') {
    if (this.moveWorkerToward(worker, target.gx + 0.5, target.gy + 0.5, dt, CARRIER_SPEED_CELLS_PER_SECOND)) {
      worker.state = 'unloading';
      worker.progress = 0;
      worker.message = 'Verse l’eau dans la cuve';
      this.notify();
    }
    return;
  }

  if (worker.state === 'unloading') {
    worker.progress = Math.min(1, worker.progress + dt / CARRIER_TRANSFER_DURATION);
    if (worker.progress < 1) return;
    const before = target.waterStored;
    target.waterStored = Math.min(CISTERN_CAPACITY, target.waterStored + worker.waterLoad);
    worker.waterLoad = 0;
    worker.targetCisternId = null;
    worker.state = 'idle';
    worker.progress = 0;
    worker.message = 'Livraison terminée';
    if (before < CISTERN_SOURCE_MIN_WATER && target.waterStored >= CISTERN_SOURCE_MIN_WATER) {
      this.milestones.add('cistern-ready');
      this.completedTutorialSteps.add('fill-cistern');
      this.addLog('Le robot transporteur a rendu une <b>cuve relais</b> utilisable comme source.');
      this.toast('Cuve remplie par transporteur');
    }
    this.notify();
  }
}

export const carrierWorkerMethods = {
  ensureCarrierWorker,
  findCarrierTarget,
  setCarrierBlocked,
  updateCarrierWorker,
};
