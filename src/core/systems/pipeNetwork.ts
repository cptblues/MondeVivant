import { CISTERN_PIPE_MAX_LENGTH, CISTERN_SOURCE_MIN_WATER, PIPE_MAX_LENGTH, PIPE_NEIGHBORS } from '../gameConfig';
import { TerrainType } from '../types';
import type { BuildingInstance, PipeCell, PipeSource, PipeSourceType } from '../types';
import type { SimulationContext } from '../simulationContext';

export function countBranches(this: SimulationContext, sourceType: PipeSourceType, sourceId: number): number {
  const set = new Set(this.pipes.filter((pipe) => pipe.sourceType === sourceType && pipe.sourceId === sourceId).map((pipe) => this.pipeKey(pipe.gx, pipe.gy)));
  let branches = 0;
  for (const pipe of this.pipes) {
    if (pipe.sourceType !== sourceType || pipe.sourceId !== sourceId) continue;
    const degree = PIPE_NEIGHBORS.reduce((sum, [dx, dy]) => sum + (set.has(this.pipeKey(pipe.gx + dx, pipe.gy + dy)) ? 1 : 0), 0);
    if (degree >= 3) branches += 1;
  }
  return branches;
}

export function getPipePathFromSource(this: SimulationContext, target: PipeCell): PipeCell[] {
  const source = this.getPipeSourceBuilding(target);
  if (!source) return [];
  const map = new Map(this.pipes.filter((pipe) => this.isPipeFromSource(pipe, target)).map((pipe) => [this.pipeKey(pipe.gx, pipe.gy), pipe]));
  const startKey = this.pipeKey(source.gx, source.gy);
  const targetKey = this.pipeKey(target.gx, target.gy);
  const queue: Array<{ x: number; y: number }> = [{ x: source.gx, y: source.gy }];
  const previous = new Map<string, string | null>([[startKey, null]]);
  let reached = false;
  while (queue.length && !reached) {
    const current = queue.shift()!;
    for (const [dx, dy] of PIPE_NEIGHBORS) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = this.pipeKey(x, y);
      if (previous.has(key) || !map.has(key)) continue;
      previous.set(key, this.pipeKey(current.x, current.y));
      if (key === targetKey) {
        reached = true;
        break;
      }
      queue.push({ x, y });
    }
  }
  if (!previous.has(targetKey)) return [];
  const keys: string[] = [];
  let cursor: string | null = targetKey;
  while (cursor && cursor !== startKey) {
    keys.push(cursor);
    cursor = previous.get(cursor) ?? null;
  }
  return keys.reverse().map((key) => map.get(key)).filter((pipe): pipe is PipeCell => Boolean(pipe));
}

export function addPipeRoute(this: SimulationContext, source: PipeSource, gx: number, gy: number): boolean {
  const result = this.findPipePath(source, gx, gy);
  if (!result.ok) return false;
  for (const point of result.path.slice(1)) {
    if (!this.getPipeCell(point.x, point.y)) {
      this.pipes.push({ gx: point.x, gy: point.y, sourceType: source.type, sourceId: source.id, distance: 0, outlet: false, outletOpen: false, pressureLevel: 'none' });
    }
  }
  this.recomputePipeDistances(source);
  return true;
}

export function findPipePath(this: SimulationContext, source: PipeSource, targetX: number, targetY: number): { ok: boolean; message: string; path: Array<{ x: number; y: number }> } {
  const sourceBuilding = this.getPipeSourceBuilding(source);
  if (!sourceBuilding) return { ok: false, message: source.type === 'pump' ? 'Pompe source introuvable' : 'Cuve source introuvable', path: [] };
  const anchor = this.getPipeAnchorPoint(source);
  if (!anchor) return { ok: false, message: 'Point de départ introuvable', path: [] };
  if (!this.inBounds(targetX, targetY)) return { ok: false, message: 'Hors de la carte', path: [] };
  const targetOptions = this.getPipeTargetOptions(source, targetX, targetY);
  if (!targetOptions.ok || !targetOptions.targets.length) return { ok: false, message: targetOptions.message, path: [] };
  const maxLength = this.getPipeSourceMaxLength(source);
  const minManhattan = Math.min(...targetOptions.targets.map((target) => Math.abs(target.x - anchor.x) + Math.abs(target.y - anchor.y)));
  if (minManhattan > maxLength) return { ok: false, message: `Trop loin depuis ce point : portée ${maxLength} cases`, path: [] };

  const startKey = this.pipeKey(anchor.x, anchor.y);
  const targetKeys = new Set(targetOptions.targets.map((target) => this.pipeKey(target.x, target.y)));
  const queue: Array<{ x: number; y: number }> = [{ x: anchor.x, y: anchor.y }];
  const previous = new Map<string, string | null>([[startKey, null]]);
  let reachedKey: string | null = null;
  while (queue.length) {
    const current = queue.shift()!;
    const currentKey = this.pipeKey(current.x, current.y);
    if (targetKeys.has(currentKey)) {
      reachedKey = currentKey;
      break;
    }
    const currentDistance = this.pathDepth(previous, currentKey);
    if (currentDistance >= maxLength) continue;
    const ordered = [...PIPE_NEIGHBORS].sort((a, b) => {
      const ah = Math.min(...targetOptions.targets.map((target) => Math.abs(current.x + a[0] - target.x) + Math.abs(current.y + a[1] - target.y)));
      const bh = Math.min(...targetOptions.targets.map((target) => Math.abs(current.x + b[0] - target.x) + Math.abs(current.y + b[1] - target.y)));
      return ah - bh;
    });
    for (const [dx, dy] of ordered) {
      const x = current.x + dx;
      const y = current.y + dy;
      if (!this.inBounds(x, y)) continue;
      const key = this.pipeKey(x, y);
      if (previous.has(key)) continue;
      if (!this.canPipeOccupy(source, x, y, targetKeys.has(key))) continue;
      previous.set(key, currentKey);
      queue.push({ x, y });
    }
  }
  if (!reachedKey) return { ok: false, message: source.anchorLabel === 'segment' ? 'Aucun passage accessible depuis ce tuyau' : source.type === 'pump' ? 'Aucun passage accessible dans la portée de la pompe' : 'Aucun passage accessible dans la portée de la cuve', path: [] };
  const reversed: Array<{ x: number; y: number }> = [];
  let cursor: string | null = reachedKey;
  while (cursor) {
    const [x, y] = cursor.split(',').map(Number);
    reversed.push({ x, y });
    cursor = previous.get(cursor) ?? null;
  }
  const path = reversed.reverse();
  if (path.length - 1 > maxLength) return { ok: false, message: `Le détour dépasse ${maxLength} cases`, path: [] };
  return { ok: true, message: 'Trajet valide', path };
}

export function getPipeTargetOptions(this: SimulationContext, source: PipeSource, targetX: number, targetY: number): { ok: boolean; message: string; targets: Array<{ x: number; y: number }> } {
  const targetBuilding = this.buildings.find((building) => building.gx === targetX && building.gy === targetY);
  if (targetBuilding) {
    if (targetBuilding.id === source.id && targetBuilding.type === source.type) return { ok: true, message: 'Source sélectionnée', targets: [{ x: targetX, y: targetY }] };
    if (source.type === 'pump' && targetBuilding.type === 'cistern') {
      const existingPipe = this.getPipeCell(targetX, targetY);
      if (existingPipe && !this.isPipeFromSource(existingPipe, source)) return { ok: false, message: 'Un autre réseau occupe déjà la cuve', targets: [] };
      return { ok: true, message: 'Relier directement la cuve', targets: [{ x: targetX, y: targetY }] };
    }
    if ((source.type === 'pump' || source.type === 'cistern') && (targetBuilding.type === 'nursery' || targetBuilding.type === 'robot-house')) {
      const existingPipe = this.getPipeCell(targetX, targetY);
      if (existingPipe && !this.isPipeFromSource(existingPipe, source)) {
        return { ok: false, message: targetBuilding.type === 'nursery' ? 'Un autre réseau occupe déjà la pépinière' : 'Un autre réseau occupe déjà la maison de robot', targets: [] };
      }
      return { ok: true, message: targetBuilding.type === 'nursery' ? 'Relier directement la pépinière' : 'Relier directement la maison de robot', targets: [{ x: targetX, y: targetY }] };
    }
    return { ok: false, message: 'Une construction occupe la destination', targets: [] };
  }
  if (!this.canPipeOccupy(source, targetX, targetY)) {
    const targetCell = this.cells[this.index(targetX, targetY)];
    if (targetCell.terrain === TerrainType.Rock) return { ok: false, message: 'La roche bloque la destination', targets: [] };
    const existingPipe = this.getPipeCell(targetX, targetY);
    if (existingPipe && !this.isPipeFromSource(existingPipe, source)) return { ok: false, message: 'Un autre réseau occupe cette cellule', targets: [] };
    return { ok: false, message: 'Destination bloquée', targets: [] };
  }
  return { ok: true, message: 'Destination libre', targets: [{ x: targetX, y: targetY }] };
}

export function getPipeSourceAt(this: SimulationContext, gx: number, gy: number): PipeSource | null {
  const building = this.buildings.find((candidate) => candidate.gx === gx && candidate.gy === gy);
  if (building?.type === 'pump') return { type: 'pump', id: building.id, anchorX: gx, anchorY: gy, anchorLabel: 'source' };
  if (building?.type === 'cistern' && building.waterStored >= CISTERN_SOURCE_MIN_WATER) return { type: 'cistern', id: building.id, anchorX: gx, anchorY: gy, anchorLabel: 'source' };
  const pipe = this.getPipeCell(gx, gy);
  if (pipe) return { type: pipe.sourceType, id: pipe.sourceId, anchorX: gx, anchorY: gy, anchorLabel: 'segment' };
  return null;
}

export function canPipeOccupy(this: SimulationContext, source: PipeSource, gx: number, gy: number, allowDirectBuildingDestination = false): boolean {
  if (!this.inBounds(gx, gy)) return false;
  const cell = this.cells[this.index(gx, gy)];
  if (cell.terrain === TerrainType.Rock) return false;
  const blockingBuilding = this.buildings.some((building) => {
    if (building.gx !== gx || building.gy !== gy) return false;
    if (building.id === source.id && building.type === source.type) return false;
    return !(allowDirectBuildingDestination && this.canPipeEnterBuilding(source, building));
  });
  if (blockingBuilding) return false;
  const pipe = this.getPipeCell(gx, gy);
  return !pipe || this.isPipeFromSource(pipe, source);
}

export function canPipeEnterBuilding(this: SimulationContext, source: PipeSource, building: BuildingInstance): boolean {
  if (source.type === 'pump' && building.type === 'cistern') return true;
  if ((source.type === 'pump' || source.type === 'cistern') && (building.type === 'nursery' || building.type === 'robot-house')) return true;
  return false;
}

export function pathDepth(this: SimulationContext, previous: Map<string, string | null>, key: string): number {
  let depth = 0;
  let cursor = previous.get(key) ?? null;
  while (cursor) { depth += 1; cursor = previous.get(cursor) ?? null; }
  return depth;
}

export function recomputePipeDistances(this: SimulationContext, source: PipeSource): void {
  const sourceBuilding = this.getPipeSourceBuilding(source);
  if (!sourceBuilding) return;
  const map = new Map(this.pipes.filter((pipe) => pipe.sourceType === source.type && pipe.sourceId === source.id).map((pipe) => [this.pipeKey(pipe.gx, pipe.gy), pipe]));
  for (const pipe of map.values()) pipe.distance = this.getPipeSourceMaxLength(source) + 1;
  const queue: Array<{ x: number; y: number; d: number }> = [{ x: sourceBuilding.gx, y: sourceBuilding.gy, d: 0 }];
  const visited = new Set<string>([this.pipeKey(sourceBuilding.gx, sourceBuilding.gy)]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const [dx, dy] of PIPE_NEIGHBORS) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = this.pipeKey(x, y);
      const pipe = map.get(key);
      if (!pipe || visited.has(key)) continue;
      pipe.distance = current.d + 1;
      visited.add(key);
      queue.push({ x, y, d: current.d + 1 });
    }
  }
}

export function getReachablePipeKeys(this: SimulationContext, source: PipeSource): Set<string> {
  const sourceBuilding = this.getPipeSourceBuilding(source);
  const reachable = new Set<string>();
  if (!sourceBuilding) return reachable;
  const map = new Map(this.pipes.filter((pipe) => pipe.sourceType === source.type && pipe.sourceId === source.id).map((pipe) => [this.pipeKey(pipe.gx, pipe.gy), pipe]));
  const queue: Array<{ x: number; y: number }> = [{ x: sourceBuilding.gx, y: sourceBuilding.gy }];
  const visited = new Set<string>([this.pipeKey(sourceBuilding.gx, sourceBuilding.gy)]);
  while (queue.length) {
    const current = queue.shift()!;
    for (const [dx, dy] of PIPE_NEIGHBORS) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = this.pipeKey(x, y);
      const pipe = map.get(key);
      if (!pipe || visited.has(key)) continue;
      visited.add(key);
      reachable.add(key);
      queue.push({ x, y });
    }
  }
  return reachable;
}

export function isPipeFromSource(this: SimulationContext, pipe: PipeCell, source: PipeSource | PipeCell): boolean {
  const sourceType = 'sourceType' in source ? source.sourceType : source.type;
  const sourceId = 'sourceId' in source ? source.sourceId : source.id;
  return pipe.sourceType === sourceType && pipe.sourceId === sourceId;
}

export function getPipeAnchorPoint(this: SimulationContext, source: PipeSource | null = this.pipeSource): { x: number; y: number } | null {
  if (!source) return null;
  const building = this.getPipeSourceBuilding(source);
  if (!building) return null;
  return {
    x: source.anchorX ?? building.gx,
    y: source.anchorY ?? building.gy,
  };
}

export function getPipeCell(this: SimulationContext, gx: number, gy: number): PipeCell | null {
  return this.pipes.find((pipe) => pipe.gx === gx && pipe.gy === gy) ?? null;
}

export function getPipeSourceBuilding(this: SimulationContext, source: PipeSource | PipeCell | null = this.pipeSource): BuildingInstance | null {
  if (!source) return null;
  const sourceType = 'sourceType' in source ? source.sourceType : source.type;
  const sourceId = 'sourceId' in source ? source.sourceId : source.id;
  return this.buildings.find((building) => building.id === sourceId && building.type === sourceType) ?? null;
}

export function getPipeSourceMaxLength(this: SimulationContext, source: PipeSource | PipeCell | null = this.pipeSource): number {
  if (!source) return PIPE_MAX_LENGTH;
  const sourceType = 'sourceType' in source ? source.sourceType : source.type;
  return sourceType === 'cistern' ? CISTERN_PIPE_MAX_LENGTH : PIPE_MAX_LENGTH;
}

export const pipeNetworkMethods = {
  countBranches,
  getPipePathFromSource,
  addPipeRoute,
  findPipePath,
  getPipeTargetOptions,
  getPipeSourceAt,
  canPipeOccupy,
  canPipeEnterBuilding,
  pathDepth,
  recomputePipeDistances,
  getReachablePipeKeys,
  isPipeFromSource,
  getPipeAnchorPoint,
  getPipeCell,
  getPipeSourceBuilding,
  getPipeSourceMaxLength,
};
