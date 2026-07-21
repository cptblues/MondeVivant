import { SEED_ORDER, SEEDS } from '../config';
import {
  NURSERY_ROBOT_SEED_CAPACITY,
  ROBOT_HOUSE_SEED_REQUEST_MARGIN,
  ROBOT_HOUSE_SEED_REQUEST_MAX_BATCH,
  ROBOT_TASK_PRIORITIES,
} from '../gameConfig';
import type { BuildingInstance, NurseryWorker, PlacementResult, RobotTask, SeedRequest, SeedRequestStatus, SeedReservation, SeedType } from '../types';
import type { SimulationContext } from '../simulationContext';
import { distance } from '../../utils/math';

const ACTIVE_REQUEST_STATES: SeedRequestStatus[] = ['pending', 'reserved', 'in_delivery', 'partially_delivered', 'blocked'];

function requestId(homeBuildingId: number, parcelId: string, seed: SeedType): string {
  return `seed-request:${homeBuildingId}:${parcelId}:${seed}`;
}

function deliveryTaskId(request: SeedRequest): string {
  return `seed-delivery:${request.id}`;
}

function isActiveRequest(request: SeedRequest): boolean {
  return ACTIVE_REQUEST_STATES.includes(request.status);
}

function findRequestById(simulation: SimulationContext, id: string): SeedRequest | null {
  const matches = simulation.seedRequests.filter((request) => request.id === id);
  return matches.find((request) => isActiveRequest(request)) ?? matches[matches.length - 1] ?? null;
}

function findActiveRequestById(simulation: SimulationContext, id: string): SeedRequest | null {
  return simulation.seedRequests.find((request) => request.id === id && isActiveRequest(request)) ?? null;
}

function findRequestForTask(simulation: SimulationContext, task: RobotTask): SeedRequest | null {
  return task.seedRequestId ? findRequestById(simulation, task.seedRequestId) : null;
}

function seedQuantity(values: Partial<Record<SeedType, number>> | undefined): number {
  return SEED_ORDER.reduce((total, seed) => total + Math.max(0, values?.[seed] ?? 0), 0);
}

function workerSeedLoad(worker: NurseryWorker): number {
  return seedQuantity(worker.seedLoad);
}

function syncReservedQuantity(simulation: SimulationContext, request: SeedRequest): void {
  request.quantityReserved = simulation.seedReservations
    .filter((reservation) => reservation.requestId === request.id)
    .reduce((total, reservation) => total + reservation.quantity, 0);
}

function setRequestStatus(simulation: SimulationContext, request: SeedRequest, status: SeedRequestStatus, reason: string | null = null): void {
  request.status = status;
  request.blockedReason = reason;
  request.updatedAt = simulation.simulationTime;
  syncReservedQuantity(simulation, request);
}

function resetReservedRequest(simulation: SimulationContext, request: SeedRequest, reason: string): void {
  simulation.releaseSeedReservations(request.id);
  request.assignedNurseryId = null;
  const status = (simulation.seedInventory[request.seed] ?? 0) > 0 ? 'pending' : 'blocked';
  setRequestStatus(simulation, request, status, reason);
}

function resetInDeliveryRequest(simulation: SimulationContext, request: SeedRequest, task: RobotTask | null, reason: string): void {
  const worker = simulation.nurseryWorker;
  const carried = worker?.seedLoad[request.seed] ?? 0;
  if (worker && carried > 0) {
    simulation.returnSeedCargoToNursery(worker, reason);
  } else {
    const quantity = task?.seedQuantities?.[request.seed] ?? 0;
    if (quantity > 0) simulation.seedInventory[request.seed] += quantity;
  }
  if (task && task.state !== 'completed' && task.state !== 'cancelled') simulation.setRobotTaskState(task.id, 'cancelled', reason);
  request.assignedNurseryId = null;
  setRequestStatus(simulation, request, 'pending', reason);
}

function requestPriority(parcelBlocked: boolean): number {
  return parcelBlocked ? ROBOT_TASK_PRIORITIES.seedDeliveryUrgent : ROBOT_TASK_PRIORITIES.seedDelivery;
}

function getHouseInventory(house: BuildingInstance): Record<SeedType, number> {
  house.seedInventory ??= { pioneer: 0, willow: 0, juniper: 0, tamarisk: 0 };
  return house.seedInventory;
}

function findAssignedNursery(simulation: SimulationContext, request: SeedRequest): BuildingInstance | null {
  const id = request.assignedNurseryId;
  if (id === null) return null;
  return simulation.buildings.find((building) => building.id === id && building.type === 'nursery') ?? null;
}

function hasRouteBetween(source: BuildingInstance, destination: BuildingInstance): boolean {
  return source.id !== destination.id;
}

function chooseNurseryForRequest(simulation: SimulationContext, request: SeedRequest): { nursery: BuildingInstance; quantity: number } | null {
  const house = simulation.getRobotHouseBuilding(request.homeBuildingId);
  if (!house) return null;
  const candidates = simulation.buildings
    .filter((building) => building.type === 'nursery')
    .map((nursery) => {
      if (!hasRouteBetween(nursery, house)) return null;
      const free = simulation.getFreeNurserySeedCount(request.seed, nursery.id);
      const quantity = Math.min(free, simulation.getSeedRequestOutstanding(request), NURSERY_ROBOT_SEED_CAPACITY);
      if (quantity <= 0) return null;
      const workload = simulation.tasks.filter((task) =>
        task.type === 'deliver_seeds'
        && task.sourceBuildingId === nursery.id
        && ['available', 'reserved', 'in-progress', 'blocked'].includes(task.state)
      ).length;
      return {
        nursery,
        quantity,
        distance: distance(nursery.gx, nursery.gy, house.gx, house.gy),
        workload,
      };
    })
    .filter((candidate): candidate is { nursery: BuildingInstance; quantity: number; distance: number; workload: number } => Boolean(candidate));

  candidates.sort((a, b) =>
    b.quantity - a.quantity
    || a.distance - b.distance
    || a.workload - b.workload
    || a.nursery.id - b.nursery.id
  );
  const selected = candidates[0];
  return selected ? { nursery: selected.nursery, quantity: selected.quantity } : null;
}

function reserveSeeds(simulation: SimulationContext, request: SeedRequest, nurseryId: number, quantity: number): void {
  if (quantity <= 0) return;
  const existing = simulation.seedReservations.find((reservation) => reservation.requestId === request.id && reservation.nurseryId === nurseryId && reservation.seed === request.seed);
  if (existing) existing.quantity += quantity;
  else {
    const reservation: SeedReservation = {
      id: `seed-reservation:${request.id}:${nurseryId}:${request.seed}`,
      requestId: request.id,
      nurseryId,
      seed: request.seed,
      quantity,
      createdAt: simulation.simulationTime,
    };
    simulation.seedReservations.push(reservation);
  }
  request.assignedNurseryId = nurseryId;
  setRequestStatus(simulation, request, 'reserved');
}

function reopenSeedRequest(
  simulation: SimulationContext,
  request: SeedRequest,
  quantityRequested: number,
  priority: number,
): void {
  simulation.releaseSeedReservations(request.id);
  request.quantityRequested = quantityRequested;
  request.quantityReserved = 0;
  request.quantityDelivered = 0;
  request.priority = priority;
  request.status = 'pending';
  request.assignedNurseryId = null;
  request.blockedReason = null;
  request.createdAt = simulation.simulationTime;
  request.updatedAt = simulation.simulationTime;
}

function assignSeedRequests(simulation: SimulationContext): void {
  for (const request of simulation.seedRequests) {
    syncReservedQuantity(simulation, request);
    if (!isActiveRequest(request)) continue;
    if (request.status === 'reserved' || request.status === 'in_delivery') continue;
    const outstanding = simulation.getSeedRequestOutstanding(request);
    if (outstanding <= 0) {
      setRequestStatus(simulation, request, 'completed');
      request.assignedNurseryId = null;
      continue;
    }
    const selected = chooseNurseryForRequest(simulation, request);
    if (!selected) {
      const totalStock = simulation.seedInventory[request.seed] ?? 0;
      const reserved = simulation.getReservedSeedCount(request.seed);
      const reason = totalStock <= 0
        ? `Aucune pépinière ne dispose de ${SEEDS[request.seed].name}.`
        : reserved >= totalStock
          ? `Toutes les graines de ${SEEDS[request.seed].name} sont déjà réservées.`
          : `Aucune pépinière accessible ne peut livrer ${SEEDS[request.seed].name}.`;
      request.assignedNurseryId = null;
      setRequestStatus(simulation, request, 'blocked', reason);
      continue;
    }
    reserveSeeds(simulation, request, selected.nursery.id, selected.quantity);
  }
}

export function getSeedRequestOutstanding(this: SimulationContext, request: SeedRequest): number {
  return Math.max(0, request.quantityRequested - request.quantityDelivered);
}

export function getActiveSeedRequestsForHouse(this: SimulationContext, homeBuildingId: number): SeedRequest[] {
  return this.seedRequests.filter((request) => request.homeBuildingId === homeBuildingId && isActiveRequest(request));
}

export function getSeedRequestsForNursery(this: SimulationContext, nurseryId?: number): SeedRequest[] {
  if (nurseryId === undefined) return [...this.seedRequests];
  return this.seedRequests.filter((request) => request.assignedNurseryId === nurseryId || request.status === 'pending' || request.status === 'blocked');
}

export function getReservedSeedCount(this: SimulationContext, seed: SeedType, nurseryId?: number): number {
  return this.seedReservations
    .filter((reservation) => reservation.seed === seed && (nurseryId === undefined || reservation.nurseryId === nurseryId))
    .reduce((total, reservation) => total + reservation.quantity, 0);
}

export function getFreeNurserySeedCount(this: SimulationContext, seed: SeedType, nurseryId?: number): number {
  void nurseryId;
  return Math.max(0, (this.seedInventory[seed] ?? 0) - this.getReservedSeedCount(seed));
}

export function getIncomingSeedCount(this: SimulationContext, homeBuildingId: number, parcelId: string, seed: SeedType): number {
  return this.seedRequests
    .filter((request) =>
      request.homeBuildingId === homeBuildingId
      && request.parcelId === parcelId
      && request.seed === seed
      && isActiveRequest(request)
    )
    .reduce((total, request) => total + this.getSeedRequestOutstanding(request), 0);
}

export function releaseSeedReservations(this: SimulationContext, requestIdValue: string, maxQuantity = Number.POSITIVE_INFINITY): number {
  let remaining = maxQuantity;
  let released = 0;
  this.seedReservations = this.seedReservations.filter((reservation) => {
    if (reservation.requestId !== requestIdValue || remaining <= 0) return true;
    const amount = Math.min(reservation.quantity, remaining);
    reservation.quantity -= amount;
    remaining -= amount;
    released += amount;
    return reservation.quantity > 0;
  });
  const request = findRequestById(this, requestIdValue);
  if (request) syncReservedQuantity(this, request);
  return released;
}

export function cancelSeedRequest(this: SimulationContext, requestIdValue: string, reason = 'Demande annulée'): SeedRequest | null {
  const request = findRequestById(this, requestIdValue);
  if (!request || !isActiveRequest(request)) return request ?? null;
  this.releaseSeedReservations(request.id);
  request.assignedNurseryId = null;
  setRequestStatus(this, request, 'canceled', reason);
  const task = this.getRobotTask(deliveryTaskId(request));
  if (task && task.state !== 'completed' && task.state !== 'cancelled') this.cancelTask(task.id, reason);
  return request;
}

export function cancelSeedRequestsForHouse(this: SimulationContext, homeBuildingId: number, reason = 'Maison indisponible'): void {
  for (const request of this.seedRequests.filter((candidate) => candidate.homeBuildingId === homeBuildingId && isActiveRequest(candidate))) {
    this.cancelSeedRequest(request.id, reason);
  }
}

export function cancelSeedRequestsForNursery(this: SimulationContext, nurseryId: number, reason = 'Pépinière indisponible'): void {
  for (const request of this.seedRequests.filter((candidate) => candidate.assignedNurseryId === nurseryId && isActiveRequest(candidate))) {
    this.cancelSeedRequest(request.id, reason);
  }
}

export function updateSeedRequests(this: SimulationContext): void {
  for (const request of this.seedRequests) syncReservedQuantity(this, request);

  const activeIds = new Set<string>();
  for (const parcel of this.restorationParcels) {
    const house = this.getRobotHouseBuilding(parcel.homeBuildingId);
    if (!house || !parcel.bounds || parcel.state === 'autonomous') {
      for (const request of this.seedRequests.filter((candidate) => candidate.parcelId === parcel.id && isActiveRequest(candidate))) {
        this.cancelSeedRequest(request.id, !house ? 'Maison de robot retirée' : 'Parcelle autonome');
      }
      continue;
    }
    const demand = this.getRestorationSeedDemand(parcel);
    const inventory = getHouseInventory(house);
    const desiredSeedIds = new Set<string>();
    for (const seed of SEED_ORDER) {
      const coreDemand = demand[seed] ?? 0;
      if (coreDemand <= 0) continue;
      const targetRemaining = inventory[seed] >= coreDemand
        ? 0
        : Math.max(0, Math.min(coreDemand + ROBOT_HOUSE_SEED_REQUEST_MARGIN, ROBOT_HOUSE_SEED_REQUEST_MAX_BATCH) - inventory[seed]);
      const id = requestId(parcel.homeBuildingId, parcel.id, seed);
      desiredSeedIds.add(id);
      const existing = findActiveRequestById(this, id);
      const reusable = existing ?? findRequestById(this, id);
      const priority = requestPriority(parcel.blockers.length > 0 || parcel.state === 'waiting_resources' || parcel.state === 'planting');
      if (targetRemaining <= 0) {
        if (existing) this.cancelSeedRequest(existing.id, 'Stock local suffisant');
        continue;
      }
      activeIds.add(id);
      if (!reusable) {
        this.seedRequests.push({
          id,
          homeBuildingId: parcel.homeBuildingId,
          parcelId: parcel.id,
          seed,
          quantityRequested: targetRemaining,
          quantityReserved: 0,
          quantityDelivered: 0,
          priority,
          status: 'pending',
          assignedNurseryId: null,
          blockedReason: null,
          createdAt: this.simulationTime,
          updatedAt: this.simulationTime,
        });
        continue;
      }
      if (!existing) {
        reopenSeedRequest(this, reusable, targetRemaining, priority);
        continue;
      }
      if (reusable.status !== 'in_delivery') {
        const reserved = this.seedReservations
          .filter((reservation) => reservation.requestId === reusable.id)
          .reduce((total, reservation) => total + reservation.quantity, 0);
        const previousRemaining = this.getSeedRequestOutstanding(reusable);
        reusable.quantityRequested = reusable.quantityDelivered + targetRemaining;
        reusable.priority = priority;
        reusable.updatedAt = this.simulationTime;
        if (reserved > targetRemaining && previousRemaining > targetRemaining) {
          this.releaseSeedReservations(reusable.id, reserved - targetRemaining);
        }
        if (reusable.status === 'blocked') reusable.status = 'pending';
      }
    }
    for (const request of this.seedRequests.filter((candidate) => candidate.parcelId === parcel.id && isActiveRequest(candidate) && !desiredSeedIds.has(candidate.id))) {
      this.cancelSeedRequest(request.id, 'Besoin de graines résolu');
    }
  }

  for (const request of this.seedRequests.filter((candidate) => isActiveRequest(candidate) && !activeIds.has(candidate.id))) {
    const parcel = this.restorationParcels.find((candidate) => candidate.id === request.parcelId);
    if (!parcel || parcel.state === 'autonomous') this.cancelSeedRequest(request.id, 'Besoin de graines résolu');
  }

  assignSeedRequests(this);
}

export function syncSeedDeliveryTasks(this: SimulationContext, desiredIds: Set<string>): void {
  for (const request of this.seedRequests) {
    if (!isActiveRequest(request)) continue;
    const id = deliveryTaskId(request);
    if (request.status === 'in_delivery') {
      const task = this.getRobotTask(id);
      const worker = this.nurseryWorker?.currentTaskId === id ? this.nurseryWorker : null;
      const house = this.getRobotHouseBuilding(request.homeBuildingId);
      const nursery = findAssignedNursery(this, request);
      const carried = worker?.seedLoad[request.seed] ?? 0;
      if (worker && carried > 0 && house && nursery) {
        const quantity = Math.min(carried, this.getSeedRequestOutstanding(request), NURSERY_ROBOT_SEED_CAPACITY);
        desiredIds.add(id);
        this.upsertRobotTask({
          id,
          type: 'deliver_seeds',
          target: { kind: 'building', buildingId: house.id, gx: house.gx, gy: house.gy },
          seedRequestId: request.id,
          sourceBuildingId: nursery.id,
          destinationBuildingId: house.id,
          seedQuantities: { [request.seed]: quantity },
          seed: request.seed,
          priority: request.priority,
          requiredResources: { seeds: { [request.seed]: quantity } },
          allowedRoles: ['nursery'],
          blockedReason: null,
        });
        this.setRobotTaskState(id, 'in-progress', null, worker.id);
      } else {
        resetInDeliveryRequest(this, request, task, !house ? 'Maison de destination introuvable' : !nursery ? 'Pépinière source introuvable' : 'Livraison interrompue, graines remises en pépinière');
      }
      continue;
    }
    if (request.status !== 'reserved') continue;
    const house = this.getRobotHouseBuilding(request.homeBuildingId);
    const nursery = findAssignedNursery(this, request);
    if (!house || !nursery) {
      resetReservedRequest(this, request, !house ? 'Maison de destination introuvable' : 'Pépinière source introuvable');
      continue;
    }
    const quantity = Math.min(this.getSeedRequestOutstanding(request), request.quantityReserved, NURSERY_ROBOT_SEED_CAPACITY);
    if (quantity <= 0) {
      resetReservedRequest(this, request, 'Réservation de graines vide');
      continue;
    }
    const blockedReason = this.getSeedDeliveryTaskBlockedReason({
      id,
      type: 'deliver_seeds',
      target: { kind: 'building', buildingId: house.id, gx: house.gx, gy: house.gy },
      seedRequestId: request.id,
      sourceBuildingId: nursery.id,
      destinationBuildingId: house.id,
      seedQuantities: { [request.seed]: quantity },
      seed: request.seed,
      priority: request.priority,
      state: 'available',
      requiredResources: { seeds: { [request.seed]: quantity } },
      allowedRoles: ['nursery'],
      reservedByWorkerId: null,
      blockedReason: null,
      createdAt: this.simulationTime,
      updatedAt: this.simulationTime,
    });
    if (blockedReason) {
      const existing = this.getRobotTask(id);
      if (existing && existing.state !== 'completed' && existing.state !== 'cancelled') this.setRobotTaskState(id, 'cancelled', blockedReason);
      resetReservedRequest(this, request, blockedReason);
      continue;
    }
    desiredIds.add(id);
    this.upsertRobotTask({
      id,
      type: 'deliver_seeds',
      target: { kind: 'building', buildingId: house.id, gx: house.gx, gy: house.gy },
      seedRequestId: request.id,
      sourceBuildingId: nursery.id,
      destinationBuildingId: house.id,
      seedQuantities: { [request.seed]: quantity },
      seed: request.seed,
      priority: request.priority,
      requiredResources: { seeds: { [request.seed]: quantity } },
      allowedRoles: ['nursery'],
      blockedReason: null,
    });
  }
}

export function getSeedDeliveryTaskBlockedReason(this: SimulationContext, task: RobotTask): string | null {
  if (!task.seedRequestId || task.sourceBuildingId === undefined || task.destinationBuildingId === undefined || !task.seedQuantities) {
    return 'Livraison de graines incomplète';
  }
  const request = findRequestForTask(this, task);
  if (!request) return 'Demande de graines introuvable';
  if (request.status === 'canceled') return 'Demande de graines annulée';
  if (request.status === 'completed') return 'Demande de graines terminée';
  const nursery = this.buildings.find((building) => building.id === task.sourceBuildingId && building.type === 'nursery');
  if (!nursery) return 'Pépinière source introuvable';
  const house = this.getRobotHouseBuilding(task.destinationBuildingId);
  if (!house) return 'Maison de destination introuvable';
  if (!hasRouteBetween(nursery, house)) return 'Trajet de livraison impossible';
  const quantity = seedQuantity(task.seedQuantities);
  if (quantity <= 0) return 'Aucune graine à livrer';
  if (request.status === 'in_delivery') return null;
  if (request.quantityReserved < quantity) return 'Stock réservé insuffisant';
  if ((this.seedInventory[request.seed] ?? 0) < quantity) return 'Stock réservé incohérent';
  return null;
}

export function loadSeedsForDelivery(this: SimulationContext, worker: NurseryWorker, task: RobotTask): PlacementResult {
  if (!task.seedRequestId) return { ok: false, message: 'Livraison sans demande' };
  const request = findRequestForTask(this, task);
  if (!request || request.status !== 'reserved') return { ok: false, message: 'Demande de graines non réservée' };
  const requested = task.seedQuantities?.[request.seed] ?? 0;
  const quantity = Math.min(requested, request.quantityReserved, this.seedInventory[request.seed] ?? 0, NURSERY_ROBOT_SEED_CAPACITY, this.getSeedRequestOutstanding(request));
  if (quantity <= 0) {
    setRequestStatus(this, request, 'blocked', 'Stock réservé incohérent');
    return { ok: false, message: 'Stock réservé incohérent' };
  }
  this.seedInventory[request.seed] -= quantity;
  this.releaseSeedReservations(request.id, quantity);
  worker.seedLoad[request.seed] = (worker.seedLoad[request.seed] ?? 0) + quantity;
  task.seedQuantities = { [request.seed]: quantity };
  task.requiredResources = { seeds: { [request.seed]: quantity } };
  setRequestStatus(this, request, 'in_delivery');
  worker.targetSeed = request.seed;
  this.addLog(`Le robot pépiniériste charge <b>${quantity} graine${quantity > 1 ? 's' : ''} de ${SEEDS[request.seed].name}</b> pour une maison.`);
  return { ok: true, message: 'Graines chargées' };
}

export function deliverSeedsToRobotHouse(this: SimulationContext, worker: NurseryWorker, task: RobotTask): PlacementResult {
  if (!task.seedRequestId) return { ok: false, message: 'Livraison sans demande' };
  const request = findRequestForTask(this, task);
  if (!request || request.status === 'canceled') return { ok: false, message: 'Demande de graines annulée' };
  const house = this.getRobotHouseBuilding(request.homeBuildingId);
  if (!house) return { ok: false, message: 'Maison de destination introuvable' };
  const quantity = Math.min(worker.seedLoad[request.seed] ?? 0, task.seedQuantities?.[request.seed] ?? 0);
  if (quantity <= 0) return { ok: false, message: 'Le robot ne transporte aucune graine attendue' };
  const inventory = getHouseInventory(house);
  inventory[request.seed] += quantity;
  worker.seedLoad[request.seed] = Math.max(0, (worker.seedLoad[request.seed] ?? 0) - quantity);
  if ((worker.seedLoad[request.seed] ?? 0) <= 0) delete worker.seedLoad[request.seed];
  request.quantityDelivered += quantity;
  request.assignedNurseryId = null;
  const outstanding = this.getSeedRequestOutstanding(request);
  setRequestStatus(this, request, outstanding <= 0 ? 'completed' : 'partially_delivered');
  this.addLog(`Livraison terminée : <b>${quantity} graine${quantity > 1 ? 's' : ''} de ${SEEDS[request.seed].name}</b> déposée${quantity > 1 ? 's' : ''} dans une maison de robot.`);
  this.toast('Graines livrées à la maison');
  return { ok: true, message: 'Graines livrées' };
}

export function returnSeedCargoToNursery(this: SimulationContext, worker: NurseryWorker, reason = 'Livraison annulée'): void {
  const total = workerSeedLoad(worker);
  if (total <= 0) return;
  const returned: string[] = [];
  for (const seed of SEED_ORDER) {
    const quantity = worker.seedLoad[seed] ?? 0;
    if (quantity <= 0) continue;
    this.seedInventory[seed] += quantity;
    returned.push(`${quantity} ${SEEDS[seed].name}`);
  }
  worker.seedLoad = {};
  const task = this.getRobotTask(worker.currentTaskId);
  if (task?.seedRequestId) {
    const request = findRequestForTask(this, task);
    if (request && request.status !== 'canceled' && request.status !== 'completed') {
      request.assignedNurseryId = null;
      setRequestStatus(this, request, 'pending', reason);
    }
  }
  this.addLog(`Le robot pépiniériste rapporte les graines non livrées à la pépinière : ${returned.join(', ')}.`);
}

export function handleSeedDeliveryTaskCancellation(this: SimulationContext, task: RobotTask, reason: string): void {
  if (!task.seedRequestId) return;
  const request = findRequestForTask(this, task);
  if (!request || request.status === 'canceled' || request.status === 'completed') return;
  const worker = this.nurseryWorker?.currentTaskId === task.id ? this.nurseryWorker : null;
  if (worker && workerSeedLoad(worker) > 0) {
    request.assignedNurseryId = null;
    setRequestStatus(this, request, 'pending', reason);
    return;
  }
  this.releaseSeedReservations(request.id);
  request.assignedNurseryId = null;
  setRequestStatus(this, request, 'pending', reason);
}

export const seedRequestMethods = {
  updateSeedRequests,
  syncSeedDeliveryTasks,
  getActiveSeedRequestsForHouse,
  getSeedRequestsForNursery,
  getReservedSeedCount,
  getFreeNurserySeedCount,
  getIncomingSeedCount,
  getSeedRequestOutstanding,
  getSeedDeliveryTaskBlockedReason,
  loadSeedsForDelivery,
  deliverSeedsToRobotHouse,
  returnSeedCargoToNursery,
  handleSeedDeliveryTaskCancellation,
  cancelSeedRequest,
  cancelSeedRequestsForHouse,
  cancelSeedRequestsForNursery,
  releaseSeedReservations,
};
