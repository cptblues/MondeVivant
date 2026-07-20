import type { ViewMode } from '../../core/types';
import { clamp } from '../../utils/math';
import { element, type UIContext } from '../uiContext';

export function updateHud(this: UIContext): void {
  const metrics = this.simulation.getMetrics();
  element<HTMLElement>('#woodValue').textContent = String(Math.floor(metrics.woodResource));
  element<HTMLElement>('#scannedValue').textContent = `${Math.round(metrics.knownSoilPercent)}%`;
  element<HTMLElement>('#restoredValue').textContent = `${Math.round(metrics.restoredPercent)}%`;
  element<HTMLElement>('#matureValue').textContent = String(metrics.matureTrees);
  element<HTMLElement>('#treeValue').textContent = String(metrics.treeCount);
  this.setGauge('scannedGauge', metrics.knownSoilPercent);
  this.setGauge('restoredGauge', metrics.restoredPercent);
  this.setGauge('matureGauge', Math.min(100, (metrics.matureTrees / 3) * 100));
  this.setGauge('treeGauge', Math.min(100, (metrics.treeCount / 30) * 100));
  const goals = this.simulation.getMissionGoals();
  element<HTMLElement>('#objectiveBadge').textContent = `${goals.filter((goal) => goal.done).length}/${goals.length}`;
}

export function updateViewHelp(this: UIContext): void {
  const copy: Record<ViewMode, string> = {
    world: 'Paysage, eau visible et bâtiments',
    soil: 'Sols analysés et mémorisés',
    ecology: 'Humidité, humus et ombre',
  };
  element<HTMLElement>('#viewHelp').textContent = copy[this.currentView];
}

export function setGauge(this: UIContext, id: string, value: number): void {
  element<HTMLElement>(`#${id}`).style.setProperty('--value', `${Math.round(clamp(value, 0, 100))}%`);
}

export function setCondition(this: UIContext, id: 'water' | 'shade' | 'humus', value: number): void {
  element<HTMLElement>(`#${id}Bar`).style.width = `${clamp(value)}%`;
  element<HTMLElement>(`#cell${id[0].toUpperCase()}${id.slice(1)}Value`).textContent = String(Math.round(value));
}

export const hudUiMethods = {
  updateHud,
  updateViewHelp,
  setGauge,
  setCondition,
};
