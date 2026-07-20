import { CISTERN_CAPACITY, NURSERY_CAPACITY } from '../gameConfig';
import { GRID_WIDTH, TerrainType } from '../types';
import type { BuildingInstance, Cell, GameMetrics, PipeCell } from '../types';
import type { SimulationContext } from '../simulationContext';

export function getSelectedBuilding(this: SimulationContext): BuildingInstance | null {
  if (!this.selectedTarget || this.selectedTarget.kind !== 'building') return null;
  const selectedId = this.selectedTarget.id;
  return this.buildings.find((building) => building.id === selectedId) ?? null;
}

export function getSelectedPipe(this: SimulationContext): PipeCell | null {
  if (!this.selectedTarget || this.selectedTarget.kind !== 'pipe') return null;
  return this.getPipeCell(this.selectedTarget.gx, this.selectedTarget.gy);
}

export function getSelectedCell(this: SimulationContext): { cell: Cell; index: number; x: number; y: number } | null {
  if (!this.selectedTarget || this.selectedTarget.kind !== 'cell') return null;
  const index = this.selectedTarget.index;
  return { cell: this.cells[index], index, x: index % GRID_WIDTH, y: Math.floor(index / GRID_WIDTH) };
}

export function getMetrics(this: SimulationContext): GameMetrics {
  let restored = 0;
  let known = 0;
  let treeCount = 0;
  let matureTrees = 0;
  let naturalTrees = 0;
  let eligible = 0;
  for (const cell of this.cells) {
    if (cell.terrain === TerrainType.Rock) continue;
    eligible += 1;
    if (cell.known) known += 1;
    if (cell.cover > 0 || cell.tree) restored += 1;
    if (cell.tree) treeCount += 1;
    if (cell.treeStage >= 3) matureTrees += 1;
    if (cell.treeOrigin === 'natural') naturalTrees += 1;
  }
  return {
    restoredPercent: eligible ? (restored / eligible) * 100 : 0,
    knownSoilPercent: eligible ? (known / eligible) * 100 : 0,
    treeCount,
    matureTrees,
    naturalTrees,
    waterResource: this.waterResource,
    waterProduction: this.getWaterProduction(),
    waterConsumption: this.getWaterConsumption(),
    cisternWaterConsumption: this.getCisternWaterConsumption(),
    openOutlets: this.pipes.filter((pipe) => pipe.outlet && pipe.outletOpen).length,
    woodResource: this.woodResource,
    cisternWater: this.getCisternWaterStored(),
    cisternCapacity: this.getCisternCapacityTotal(),
    nurseryWater: this.getNurseryWaterStored(),
    nurseryCapacity: this.getNurseryCapacityTotal(),
  };
}

export function getCisternWaterStored(this: SimulationContext): number {
  return this.buildings.reduce((sum, building) => sum + (building.type === 'cistern' ? building.waterStored : 0), 0);
}

export function getCisternCapacityTotal(this: SimulationContext): number {
  return this.buildings.filter((building) => building.type === 'cistern').length * CISTERN_CAPACITY;
}

export function getNurseryWaterStored(this: SimulationContext): number {
  return this.buildings.reduce((sum, building) => sum + (building.type === 'nursery' ? building.waterStored : 0), 0);
}

export function getNurseryCapacityTotal(this: SimulationContext): number {
  return this.buildings.filter((building) => building.type === 'nursery').length * NURSERY_CAPACITY;
}

export const queriesMethods = {
  getSelectedBuilding,
  getSelectedPipe,
  getSelectedCell,
  getMetrics,
  getCisternWaterStored,
  getCisternCapacityTotal,
  getNurseryWaterStored,
  getNurseryCapacityTotal,
};
