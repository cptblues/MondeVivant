import { SEEDS } from '../core/config';
import type { BuildingInstance, PipeCell, PressureLevel, TerrainType, ViewMode } from '../core/types';
import type { GameSimulation } from '../core/GameSimulation';
import type { Camera, Point } from './Camera';

export interface HoverState {
  inside: boolean;
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
}

export interface RendererContext {
  readonly canvas: HTMLCanvasElement;
  readonly camera: Camera;
  readonly context: CanvasRenderingContext2D;
  dpr: number;

  resize(): void;
  render(simulation: GameSimulation, view: ViewMode, hover: HoverState): void;
  screenToWorld(x: number, y: number): Point;
  cellAtWorld(worldX: number, worldY: number): { x: number; y: number; index: number } | null;
  buildingAtWorld(simulation: GameSimulation, worldX: number, worldY: number): BuildingInstance | null;
  pipeAtWorld(simulation: GameSimulation, worldX: number, worldY: number): PipeCell | null;
  drawMapBase(): void;
  drawTerrain(simulation: GameSimulation, view: ViewMode): void;
  drawSoilLabels(simulation: GameSimulation): void;
  drawRockDetails(simulation: GameSimulation): void;
  drawGroundCover(simulation: GameSimulation): void;
  drawMoistureOverlay(simulation: GameSimulation): void;
  drawMoss(x: number, y: number, progress: number): void;
  drawScanZones(simulation: GameSimulation): void;
  drawPlantingZones(simulation: GameSimulation): void;
  drawPlantingQueueBadge(px: number, py: number, ready: boolean): void;
  drawGrassTile(x: number, y: number, progress: number): void;
  drawTrees(simulation: GameSimulation): void;
  drawTreeStatus(simulation: GameSimulation): void;
  drawTree(px: number, py: number, seed: keyof typeof SEEDS, stage: number, x: number, y: number, natural: boolean): void;
  drawPipes(simulation: GameSimulation): void;
  drawOutlet(cx: number, cy: number, open: boolean, level: PressureLevel): void;
  drawPipeReach(simulation: GameSimulation): void;
  drawActionCells(indices: number[], valid: boolean): void;
  drawGrid(): void;
  drawBuildings(simulation: GameSimulation): void;
  drawBuilding(simulation: GameSimulation, building: BuildingInstance): void;
  drawBuildingWaterGauge(fill: number): void;
  drawPipeConnectorDot(): void;
  drawNurseryWorker(simulation: GameSimulation): void;
  drawRobot(px: number, py: number, accent: string, blocked: boolean, progress: number | null, carryingWater: boolean): void;
  drawPlacementPreview(simulation: GameSimulation, hover: HoverState): void;
  drawEcologyOverlay(simulation: GameSimulation): void;
  drawMapBorder(): void;
  pressureColor(level: PressureLevel): string;
  seedZoneColor(seed: keyof typeof SEEDS): string;
  soilPatternColor(terrain: TerrainType): string;
  roundedRect(x: number, y: number, width: number, height: number, radius: number): void;
}
