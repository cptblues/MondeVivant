import { CISTERN_CAPACITY, NURSERY_CAPACITY, NURSERY_WORKER_CAPACITY, ROBOT_TASK_PRIORITIES } from '../gameConfig';
import { GRID_WIDTH } from '../types';
import type { BuildingInstance, NurseryWorker, RobotRole, RobotTask, RobotTaskResources, RobotTaskState, RobotTaskTarget, RobotTaskType, SeedType } from '../types';
import type { SimulationContext } from '../simulationContext';
import { distance } from '../../utils/math';

const ACTIVE_TASK_STATES: RobotTaskState[] = ['available', 'reserved', 'in-progress', 'blocked'];

const isActiveTask = (task: RobotTask): boolean => ACTIVE_TASK_STATES.includes(task.state);

function setTaskAvailability(task: RobotTask, blockedReason: string | null): void {
  if (task.state === 'reserved' || task.state === 'in-progress') return;
  task.state = blockedReason ? 'blocked' : 'available';
  task.reservedByWorkerId = null;
  task.blockedReason = blockedReason;
}

function isTaskHeldByWorker(simulation: SimulationContext, task: RobotTask): boolean {
  if (!task.reservedByWorkerId) return false;
  const workers = [
    simulation.nurseryWorker,
    ...simulation.robotHouseWorkers,
  ].filter((worker): worker is NurseryWorker => Boolean(worker));
  return workers.some((worker) => worker.id === task.reservedByWorkerId && worker.currentTaskId === task.id);
}

function releaseStaleTaskReservation(simulation: SimulationContext, task: RobotTask): void {
  if (task.state !== 'reserved' && task.state !== 'in-progress') return;
  if (isTaskHeldByWorker(simulation, task)) return;
  task.state = 'available';
  task.reservedByWorkerId = null;
  task.blockedReason = null;
}

function getBuildingCapacity(building: BuildingInstance): number {
  return building.type === 'cistern' ? CISTERN_CAPACITY : NURSERY_CAPACITY;
}

function getWaterDeliveryAmount(building: BuildingInstance): number {
  return Math.min(NURSERY_WORKER_CAPACITY, Math.max(0, getBuildingCapacity(building) - building.waterStored));
}

export function upsertRobotTask(
  this: SimulationContext,
  input: {
    id: string;
    type: RobotTaskType;
    target: RobotTaskTarget;
    zoneId?: number;
    parcelId?: string;
    homeBuildingId?: number;
    seedRequestId?: string;
    sourceBuildingId?: number;
    destinationBuildingId?: number;
    seedQuantities?: Partial<Record<SeedType, number>>;
    seed?: SeedType;
    priority: number;
    requiredResources?: RobotTaskResources;
    allowedRoles?: RobotRole[];
    blockedReason?: string | null;
  },
): RobotTask {
  const now = this.simulationTime;
  const blockedReason = input.blockedReason ?? null;
  let task = this.tasks.find((candidate) => candidate.id === input.id);
  if (!task) {
    task = {
      id: input.id,
      type: input.type,
      target: input.target,
      zoneId: input.zoneId,
      parcelId: input.parcelId,
      homeBuildingId: input.homeBuildingId,
      seedRequestId: input.seedRequestId,
      sourceBuildingId: input.sourceBuildingId,
      destinationBuildingId: input.destinationBuildingId,
      seedQuantities: input.seedQuantities,
      seed: input.seed,
      priority: input.priority,
      state: blockedReason ? 'blocked' : 'available',
      requiredResources: input.requiredResources ?? {},
      allowedRoles: input.allowedRoles ?? ['nursery'],
      reservedByWorkerId: null,
      blockedReason,
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.push(task);
    return task;
  }
  releaseStaleTaskReservation(this, task);
  task.type = input.type;
  task.target = input.target;
  task.zoneId = input.zoneId;
  task.parcelId = input.parcelId;
  task.homeBuildingId = input.homeBuildingId;
  task.seedRequestId = input.seedRequestId;
  task.sourceBuildingId = input.sourceBuildingId;
  task.destinationBuildingId = input.destinationBuildingId;
  task.seedQuantities = input.seedQuantities;
  task.seed = input.seed;
  task.priority = input.priority;
  task.requiredResources = input.requiredResources ?? {};
  task.allowedRoles = input.allowedRoles ?? ['nursery'];
  task.updatedAt = now;
  if (task.state === 'completed' || task.state === 'cancelled' || task.state === 'blocked' || task.state === 'available') {
    setTaskAvailability(task, blockedReason);
  }
  return task;
}

export function getRobotTask(this: SimulationContext, id: string | null | undefined): RobotTask | null {
  if (!id) return null;
  return this.tasks.find((task) => task.id === id) ?? null;
}

export function getRobotTaskPosition(this: SimulationContext, task: RobotTask): { x: number; y: number } {
  if (task.target.kind === 'cell') return { x: task.target.gx + 0.5, y: task.target.gy + 0.5 };
  if (task.target.kind === 'zone') return { x: task.target.gx + 0.5, y: task.target.gy + 0.5 };
  return { x: task.target.gx + 0.5, y: task.target.gy + 0.5 };
}

export function getRobotTaskBlockedReason(this: SimulationContext, task: RobotTask): string | null {
  if (task.type === 'deliver_seeds') return this.getSeedDeliveryTaskBlockedReason(task);
  if (task.homeBuildingId !== undefined) {
    return this.getRestorationTaskBlockedReason(task);
  }
  if (task.type === 'scan') {
    const zone = task.zoneId === undefined ? null : this.scanZones.find((candidate) => candidate.id === task.zoneId);
    if (!zone) return 'Zone de scan retirée';
    if (!zone.active) return 'Zone de scan en pause';
    if (zone.progress >= zone.duration) return 'Zone de scan terminée';
    if (zone.cells.every((index) => this.cells[index]?.known)) return 'Zone déjà connue';
    return null;
  }
  if (task.type === 'plant') {
    if (task.zoneId === undefined || task.seed === undefined || task.target.kind !== 'cell') return 'Tâche de plantation incomplète';
    const zone = this.plantingZones.find((candidate) => candidate.id === task.zoneId);
    if (!zone) return 'Zone de plantation retirée';
    if (!zone.active) return 'Zone de plantation en pause';
    if (!zone.cells.includes(task.target.index)) return 'Cellule retirée de la zone';
    if (this.cells[task.target.index]?.tree === task.seed) return 'Déjà planté';
    const result = this.validateSeedPlacement(task.seed, task.target.gx, task.target.gy);
    return result.ok ? null : result.message;
  }
  if (task.type === 'water-delivery') {
    if (task.target.kind !== 'building') return 'Tâche de transport incomplète';
    const targetInfo = task.target;
    const nursery = this.getNurseryBuilding();
    if (!nursery) return 'Pépinière absente';
    const target = this.buildings.find((building) => building.id === targetInfo.buildingId);
    if (!target || (target.type !== 'nursery' && target.type !== 'cistern')) return 'Bâtiment à ravitailler introuvable';
    if (target.type === 'nursery' && !this.shouldFetchNurseryWater(target)) return 'Pépinière déjà suffisamment alimentée';
    if (target.type === 'cistern' && !this.shouldFetchCisternWater(nursery, target)) return 'Cuve hors portée ou déjà pleine';
    const pump = this.getPumpBuilding();
    if (!pump) return 'Aucune pompe pour ravitailler les bâtiments proches';
    if (this.waterResource <= 0.25) return 'Réserve de pompe trop basse pour ravitailler';
    if (getWaterDeliveryAmount(target) <= 0.1) return 'Bâtiment déjà rempli';
    return null;
  }
  return null;
}

export function setRobotTaskState(this: SimulationContext, taskId: string, state: RobotTaskState, reason: string | null = null, workerId: string | null = null): RobotTask | null {
  const task = this.getRobotTask(taskId);
  if (!task) return null;
  task.state = state;
  task.blockedReason = state === 'blocked' ? reason || 'Tâche bloquée' : reason;
  task.reservedByWorkerId = state === 'reserved' || state === 'in-progress' ? workerId : null;
  task.updatedAt = this.simulationTime;
  return task;
}

export function reserveTask(this: SimulationContext, taskId: string, workerId: string): RobotTask | null {
  const task = this.getRobotTask(taskId);
  if (!task || task.state !== 'available') return null;
  const blockedReason = this.getRobotTaskBlockedReason(task);
  if (blockedReason) {
    this.blockTask(task.id, blockedReason);
    return null;
  }
  return this.setRobotTaskState(task.id, 'reserved', null, workerId);
}

export function startTask(this: SimulationContext, taskId: string, workerId: string): RobotTask | null {
  const task = this.getRobotTask(taskId);
  if (!task || (task.state !== 'reserved' && task.state !== 'available') || (task.reservedByWorkerId && task.reservedByWorkerId !== workerId)) return null;
  const blockedReason = this.getRobotTaskBlockedReason(task);
  if (blockedReason) {
    this.blockTask(task.id, blockedReason);
    return null;
  }
  return this.setRobotTaskState(task.id, 'in-progress', null, workerId);
}

export function blockTask(this: SimulationContext, taskId: string, reason: string): RobotTask | null {
  return this.setRobotTaskState(taskId, 'blocked', reason);
}

export function completeTask(this: SimulationContext, taskId: string): RobotTask | null {
  return this.setRobotTaskState(taskId, 'completed');
}

export function cancelTask(this: SimulationContext, taskId: string, reason = 'Intention retirée'): RobotTask | null {
  const task = this.getRobotTask(taskId);
  if (task?.type === 'deliver_seeds') this.handleSeedDeliveryTaskCancellation(task, reason);
  return this.setRobotTaskState(taskId, 'cancelled', reason);
}

export function getTaskForScanZone(this: SimulationContext, zoneId: number): RobotTask | null {
  return this.getRobotTask(`scan:${zoneId}`);
}

export function getTasksForPlantingZone(this: SimulationContext, zoneId: number): RobotTask[] {
  return this.tasks.filter((task) => task.type === 'plant' && task.zoneId === zoneId);
}

export function syncRobotTasks(this: SimulationContext): void {
  const desiredIds = new Set<string>();
  this.syncRestorationTasks(desiredIds);
  this.syncSeedDeliveryTasks(desiredIds);

  for (const zone of this.scanZones) {
    const taskId = `scan:${zone.id}`;
    if (!zone.active || zone.progress >= zone.duration) continue;
    if (zone.cells.every((index) => this.cells[index]?.known)) {
      const existing = this.getRobotTask(taskId);
      if (existing && existing.state !== 'completed') this.completeTask(taskId);
      continue;
    }
    desiredIds.add(taskId);
    this.upsertRobotTask({
      id: taskId,
      type: 'scan',
      target: { kind: 'zone', gx: zone.gx, gy: zone.gy },
      zoneId: zone.id,
      priority: ROBOT_TASK_PRIORITIES.scan,
      blockedReason: null,
    });
  }

  for (const zone of this.plantingZones) {
    if (!zone.active) continue;
    for (const index of zone.cells) {
      const cell = this.cells[index];
      if (!cell) continue;
      const taskId = `plant:${zone.id}:${index}`;
      if (cell.tree === zone.seed) {
        const existing = this.getRobotTask(taskId);
        if (existing && existing.state !== 'completed') this.completeTask(taskId);
        continue;
      }
      const gx = index % GRID_WIDTH;
      const gy = Math.floor(index / GRID_WIDTH);
      const result = this.validateSeedPlacement(zone.seed, gx, gy);
      desiredIds.add(taskId);
      this.upsertRobotTask({
        id: taskId,
        type: 'plant',
        target: { kind: 'cell', index, gx, gy },
        zoneId: zone.id,
        seed: zone.seed,
        priority: ROBOT_TASK_PRIORITIES.plant,
        requiredResources: { seeds: { [zone.seed]: 1 } },
        blockedReason: result.ok ? null : result.message,
      });
    }
  }

  const nursery = this.getNurseryBuilding();
  if (nursery) {
    const waterTargets = [
      nursery,
      ...this.buildings.filter((building) => building.type === 'cistern' && this.shouldFetchCisternWater(nursery, building)),
    ].filter((building, index, all) => all.findIndex((candidate) => candidate.id === building.id) === index);
    for (const target of waterTargets) {
      if (target.type === 'nursery' && !this.shouldFetchNurseryWater(target)) continue;
      const taskId = `water:${target.id}`;
      desiredIds.add(taskId);
      this.upsertRobotTask({
        id: taskId,
        type: 'water-delivery',
        target: { kind: 'building', buildingId: target.id, gx: target.gx, gy: target.gy },
        priority: ROBOT_TASK_PRIORITIES.waterDelivery,
        requiredResources: { water: getWaterDeliveryAmount(target) },
        blockedReason: this.getRobotTaskBlockedReason({
          id: taskId,
          type: 'water-delivery',
          target: { kind: 'building', buildingId: target.id, gx: target.gx, gy: target.gy },
          priority: ROBOT_TASK_PRIORITIES.waterDelivery,
          state: 'available',
          requiredResources: { water: getWaterDeliveryAmount(target) },
          allowedRoles: ['nursery'],
          reservedByWorkerId: null,
          blockedReason: null,
          createdAt: this.simulationTime,
          updatedAt: this.simulationTime,
        }),
      });
    }
  }

  for (const task of this.tasks) {
    if (!isActiveTask(task) || desiredIds.has(task.id)) continue;
    this.cancelTask(task.id);
  }
}

export function selectNextTask(this: SimulationContext, worker: NurseryWorker): RobotTask | null {
  this.syncRobotTasks();
  const candidates = this.tasks.filter((task) => task.state === 'available' && task.allowedRoles.includes(worker.role));
  candidates.sort((a, b) => {
    const priorityDiff = b.priority - a.priority;
    if (priorityDiff !== 0) return priorityDiff;
    const ap = this.getRobotTaskPosition(a);
    const bp = this.getRobotTaskPosition(b);
    const distanceDiff = distance(worker.x, worker.y, ap.x, ap.y) - distance(worker.x, worker.y, bp.x, bp.y);
    if (distanceDiff !== 0) return distanceDiff;
    return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
  });
  return candidates[0] ?? null;
}

export const tasksMethods = {
  syncRobotTasks,
  upsertRobotTask,
  getRobotTask,
  getRobotTaskPosition,
  getRobotTaskBlockedReason,
  setRobotTaskState,
  selectNextTask,
  reserveTask,
  startTask,
  blockTask,
  completeTask,
  cancelTask,
  getTaskForScanZone,
  getTasksForPlantingZone,
};
