import { BUILDINGS } from '../../core/config';
import { CELL_SIZE, GRID_HEIGHT, GRID_WIDTH } from '../../core/types';
import type { BuildingInstance, PipeCell, ViewMode } from '../../core/types';
import type { GameSimulation } from '../../core/GameSimulation';
import type { Point } from '../Camera';
import type { HoverState, RendererContext } from '../renderContext';
import { indexOf } from '../../utils/math';

export function resize(this: RendererContext): void {
  const rect = this.canvas.getBoundingClientRect();
  this.dpr = Math.min(2, window.devicePixelRatio || 1);
  this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
  this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
  this.camera.resize(rect.width, rect.height);
}

export function render(this: RendererContext, simulation: GameSimulation, view: ViewMode, hover: HoverState): void {
  const ctx = this.context;
  const width = this.canvas.clientWidth;
  const height = this.canvas.clientHeight;
  ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#d9d0bd');
  sky.addColorStop(1, '#c9bea7');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(this.camera.x, this.camera.y);
  ctx.scale(this.camera.zoom, this.camera.zoom);
  this.drawMapBase();
  this.drawTerrain(simulation, view);
  if (view !== 'soil') this.drawMoistureOverlay(simulation);
  this.drawGroundCover(simulation);
  this.drawScanZones(simulation);
  this.drawPlantingZones(simulation);
  if (view === 'ecology') this.drawEcologyOverlay(simulation);

  const selectedBuilding = simulation.getSelectedBuilding();
  const selectedPipe = simulation.getSelectedPipe();
  const buildingTool = simulation.selectedTool?.kind === 'building' ? simulation.selectedTool : null;
  const scanTool = simulation.selectedTool?.kind === 'scan-zone';
  const pipeTool = simulation.selectedTool?.kind === 'pipe';

  if (selectedBuilding && BUILDINGS[selectedBuilding.type].radiusCells > 0) {
    const cells = selectedBuilding.type === 'pump'
      ? simulation.getPumpIrrigatedCells(selectedBuilding.gx, selectedBuilding.gy)
      : simulation.getAffectedCells(selectedBuilding.type, selectedBuilding.gx, selectedBuilding.gy);
    this.drawActionCells(cells, true);
  }
  if (selectedPipe) {
    const cells = selectedPipe.outlet && selectedPipe.outletOpen
      ? simulation.getIrrigatedCells(selectedPipe)
      : simulation.getOutletPreview(selectedPipe.gx, selectedPipe.gy).cells;
    if (cells.length) this.drawActionCells(cells, true);
  } else if (!simulation.selectedTool && hover.inside) {
    const hoveredPipe = this.pipeAtWorld(simulation, hover.worldX, hover.worldY);
    if (hoveredPipe) {
      const preview = simulation.getOutletPreview(hoveredPipe.gx, hoveredPipe.gy);
      if (preview.cells.length) this.drawActionCells(preview.cells, preview.level !== 'none');
    }
  }
  if (buildingTool && hover.inside) {
    const cell = this.cellAtWorld(hover.worldX, hover.worldY);
    if (cell && BUILDINGS[buildingTool.type].radiusCells > 0) {
      const cells = buildingTool.type === 'pump'
        ? simulation.getPumpIrrigatedCells(cell.x, cell.y)
        : simulation.getAffectedCells(buildingTool.type, cell.x, cell.y);
      this.drawActionCells(cells, simulation.validateBuildingPlacement(buildingTool.type, cell.x, cell.y).ok);
    }
  }
  if (scanTool && hover.inside) {
    const cell = this.cellAtWorld(hover.worldX, hover.worldY);
    if (cell) this.drawActionCells(simulation.getScanZoneCells(cell.x, cell.y), simulation.validateScanZone(cell.x, cell.y).ok);
  }
  if (pipeTool && simulation.pipeSource) this.drawPipeReach(simulation);

  this.drawPipes(simulation);
  this.drawTrees(simulation);
  this.drawTreeStatus(simulation);
  this.drawBuildings(simulation);
  this.drawNurseryWorker(simulation);
  this.drawCarrierWorker(simulation);
  this.drawPlacementPreview(simulation, hover);

  if (simulation.selectedTool || selectedBuilding || selectedPipe) this.drawGrid();
  this.drawMapBorder();
  ctx.restore();
}

export function screenToWorld(this: RendererContext, x: number, y: number): Point { return this.camera.screenToWorld({ x, y }); }

export function cellAtWorld(this: RendererContext, worldX: number, worldY: number): { x: number; y: number; index: number } | null {
  const x = Math.floor(worldX / CELL_SIZE);
  const y = Math.floor(worldY / CELL_SIZE);
  if (x < 0 || y < 0 || x >= GRID_WIDTH || y >= GRID_HEIGHT) return null;
  return { x, y, index: indexOf(x, y, GRID_WIDTH) };
}

export function buildingAtWorld(this: RendererContext, simulation: GameSimulation, worldX: number, worldY: number): BuildingInstance | null {
  const cell = this.cellAtWorld(worldX, worldY);
  if (!cell) return null;
  for (let i = simulation.buildings.length - 1; i >= 0; i -= 1) {
    const building = simulation.buildings[i];
    if (building.gx !== cell.x || building.gy !== cell.y) continue;
    const px = (building.gx + 0.5) * CELL_SIZE;
    const py = (building.gy + 0.5) * CELL_SIZE;
    if (Math.hypot(worldX - px, worldY - py) <= 12) return building;
  }
  return null;
}

export function pipeAtWorld(this: RendererContext, simulation: GameSimulation, worldX: number, worldY: number): PipeCell | null {
  const cell = this.cellAtWorld(worldX, worldY);
  return cell ? simulation.getPipeCell(cell.x, cell.y) : null;
}

export const runtimeRenderMethods = {
  resize,
  render,
  screenToWorld,
  cellAtWorld,
  buildingAtWorld,
  pipeAtWorld,
};
