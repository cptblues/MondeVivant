import type { ViewMode } from '../../core/types';
import { clamp } from '../../utils/math';
import { element, type UIContext } from '../uiContext';

export function update(this: UIContext): void {
  this.updateHud();
  this.updateDock();
  this.updateObjectives();
  this.updateInspector();
  this.updateTutorialHint();
  this.updateViewHelp();
  element<HTMLElement>('#zoomValue').textContent = `${this.camera.getZoomPercent()}%`;
}

export function showToast(this: UIContext, message: string): void {
  this.toastElement.textContent = message;
  this.toastElement.classList.add('is-visible');
  if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
  this.toastTimer = window.setTimeout(() => this.toastElement.classList.remove('is-visible'), 2300);
}

export function showPlacementHint(this: UIContext, message: string, x: number, y: number, valid: boolean): void {
  this.placementHint.textContent = message;
  this.placementHint.classList.toggle('is-invalid', !valid);
  this.placementHint.classList.add('is-visible');
  const rect = this.placementHint.getBoundingClientRect();
  const left = clamp(x + 18, 14, window.innerWidth - rect.width - 14);
  const top = clamp(y + 18, 14, window.innerHeight - rect.height - 14);
  this.placementHint.style.transform = `translate(${left}px, ${top}px)`;
}

export function hidePlacementHint(this: UIContext, ): void { this.placementHint.classList.remove('is-visible'); }

export function closeOverlays(this: UIContext): void {
  this.setObjectivesOpen(false);
  this.simulation.clearSelection();
  this.update();
}

export function bindControls(this: UIContext): void {
  element<HTMLButtonElement>('#objectivesButton').addEventListener('click', () => this.setObjectivesOpen(!this.objectiveOpen));
  element<HTMLButtonElement>('#closeObjectives').addEventListener('click', () => this.setObjectivesOpen(false));
  element<HTMLButtonElement>('#closeInspector').addEventListener('click', () => { this.simulation.clearSelection(); this.update(); });
  element<HTMLButtonElement>('#removeButton').addEventListener('click', () => { this.simulation.removeSelectedBuilding(); this.update(); });
  element<HTMLButtonElement>('#clearNetworkButton').addEventListener('click', () => {
    const building = this.simulation.getSelectedBuilding();
    if (building?.type === 'pump' || building?.type === 'cistern') this.simulation.clearPipeNetwork(building.type, building.id);
    this.update();
  });
  element<HTMLButtonElement>('#harvestWoodButton').addEventListener('click', () => { this.simulation.harvestSelectedTreeForWood(); this.update(); });
  element<HTMLButtonElement>('#createOutletButton').addEventListener('click', () => { this.simulation.createOutletAtSelectedPipe(); this.update(); });
  element<HTMLButtonElement>('#toggleOutletButton').addEventListener('click', () => { this.simulation.toggleSelectedOutlet(); this.update(); });
  element<HTMLButtonElement>('#removeOutletButton').addEventListener('click', () => { this.simulation.removeSelectedOutlet(); this.update(); });
  element<HTMLButtonElement>('#removePipeButton').addEventListener('click', () => { this.simulation.removeSelectedPipeSegment(); this.update(); });
  element<HTMLButtonElement>('#zoomIn').addEventListener('click', this.events.onZoomIn);
  element<HTMLButtonElement>('#zoomOut').addEventListener('click', this.events.onZoomOut);
  element<HTMLButtonElement>('#fitMap').addEventListener('click', this.events.onFitMap);
  element<HTMLButtonElement>('#resetButton').addEventListener('click', () => { this.simulation.reset(); this.setObjectivesOpen(false); this.update(); });
  element<HTMLButtonElement>('#demoButton').addEventListener('click', () => { this.simulation.loadDemo(); this.setObjectivesOpen(false); this.update(); });

  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      this.currentView = button.dataset.view as ViewMode;
      document.querySelectorAll('[data-view]').forEach((node) => node.classList.toggle('is-active', node === button));
      this.updateViewHelp();
      this.events.onViewChanged(this.currentView);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
    button.addEventListener('click', () => {
      const speed = Number(button.dataset.speed);
      this.simulation.setSpeed(speed);
      document.querySelectorAll('[data-speed]').forEach((node) => node.classList.toggle('is-active', node === button));
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-nursery-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      this.nurseryMode = button.dataset.nurseryMode as 'cultivation' | 'research';
      document.querySelectorAll('[data-nursery-mode]').forEach((node) => node.classList.toggle('is-active', node === button));
      this.nurseryRenderSignature = '';
      this.updateInspector();
    });
  });
}

export function setObjectivesOpen(this: UIContext, open: boolean): void {
  this.objectiveOpen = open;
  this.objectiveDrawer.classList.toggle('is-open', open);
  element<HTMLButtonElement>('#objectivesButton').classList.toggle('is-active', open);
}

export const controllerUiMethods = {
  update,
  showToast,
  showPlacementHint,
  hidePlacementHint,
  closeOverlays,
  bindControls,
  setObjectivesOpen,
};
