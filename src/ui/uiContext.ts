import type { GameSimulation } from '../core/GameSimulation';
import type { BuildingType, PressureLevel, SeedType, ViewMode } from '../core/types';
import type { Camera } from '../rendering/Camera';

export interface UIEvents {
  onViewChanged: (view: ViewMode) => void;
  onFitMap: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
}

export const element = <T extends HTMLElement>(selector: string): T => {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Élément introuvable : ${selector}`);
  return node;
};

export interface UIContext {
  readonly simulation: GameSimulation;
  readonly camera: Camera;
  readonly events: UIEvents;
  readonly toolDock: HTMLDivElement;
  readonly objectiveDrawer: HTMLDivElement;
  readonly inspector: HTMLDivElement;
  readonly toastElement: HTMLDivElement;
  readonly placementHint: HTMLDivElement;
  readonly tutorialCard: HTMLElement;
  objectiveOpen: boolean;
  currentView: ViewMode;
  nurseryMode: 'cultivation' | 'research';
  dockSignature: string;
  nurseryRenderSignature: string;
  robotHouseRenderSignature: string;
  toastTimer: number | null;

  update(): void;
  showToast(message: string): void;
  showPlacementHint(message: string, x: number, y: number, valid: boolean): void;
  hidePlacementHint(): void;
  closeOverlays(): void;
  bindControls(): void;
  updateHud(): void;
  updateViewHelp(): void;
  updateDock(): void;
  buildBuildingButton(type: BuildingType): string;
  setGauge(id: string, value: number): void;
  shortUnavailableLabel(reason: string): string;
  buildCostLabel(type: BuildingType): string;
  buildPipeButton(): string;
  buildScanButton(): string;
  buildSeedButton(type: SeedType): string;
  buildZoneEraseButton(): string;
  updateObjectives(): void;
  updateInspector(): void;
  updateTutorialHint(): void;
  buildingSubtitle(type: BuildingType): string;
  renderGrowthDiagnostic(index: number): void;
  renderNursery(): void;
  renderRobotHouse(): void;
  buildWorkerPanel(): string;
  buildNurserySeedSupplySummary(): string;
  buildNurseryWaterSummary(): string;
  buildSeedSearchAction(): string;
  bindSeedSearchButton(root: HTMLElement): void;
  workerStateLabel(state: string, message: string): string;
  bindZoneButtons(root: HTMLElement): void;
  outletConsumption(level: PressureLevel, open: boolean): number;
  setCondition(id: 'water' | 'shade' | 'humus', value: number): void;
  setObjectivesOpen(open: boolean): void;
}
