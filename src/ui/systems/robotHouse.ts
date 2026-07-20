import { SEEDS } from '../../core/config';
import { ROBOT_HOUSE_CAPACITY, ROBOT_HOUSE_WATER_TRANSFER_AMOUNT } from '../../core/gameConfig';
import type { RestorationParcel, RestorationParcelState, SeedType } from '../../core/types';
import { element, type UIContext } from '../uiContext';

const PHASE_LABELS: Record<RestorationParcelState, string> = {
  unassigned: 'Non attribuée',
  scanning: 'Analyse',
  waiting_resources: 'Ressources',
  preparing: 'Préparation',
  planting: 'Plantation',
  maintaining: 'Entretien',
  autonomous: 'Autonome',
};

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function progressRow(label: string, value: number, detail: string): string {
  return `<div class="parcel-progress-row"><div><span>${label}</span><strong>${percent(value)}</strong></div><span class="track"><i style="width:${percent(value)}"></i></span><small>${detail}</small></div>`;
}

function resourceList(title: string, values: string[]): string {
  return `<div class="parcel-message"><strong>${title}</strong><ul>${values.map((value) => `<li>${value}</li>`).join('')}</ul></div>`;
}

function parcelProgress(parcel: RestorationParcel): string {
  return `<div class="parcel-progress-list">
    ${progressRow('Analyse', parcel.progress.analysis, `${parcel.analyzedTiles}/${parcel.totalTiles} tuiles`)}
    ${progressRow('Préparation', parcel.progress.preparation, `${parcel.preparedTiles}/${parcel.plantableTiles} emplacements`)}
    ${progressRow('Plantation', parcel.progress.planting, `${parcel.plantedCount}/${parcel.plantableTiles} plantations`)}
    ${progressRow('Entretien', parcel.progress.maintenance, `${Math.round(parcel.healthyPlantRatio * 100)}% plantes saines`)}
    ${progressRow('Biodiversité', parcel.progress.biodiversity, `${parcel.speciesPresent} espèce${parcel.speciesPresent > 1 ? 's' : ''}`)}
    ${progressRow('Autonomie', parcel.progress.autonomy, `${parcel.developedTrees} arbre${parcel.developedTrees > 1 ? 's' : ''} développé${parcel.developedTrees > 1 ? 's' : ''}`)}
  </div>`;
}

export function renderRobotHouse(this: UIContext): void {
  const content = element<HTMLElement>('#robotHouseContent');
  const building = this.simulation.getSelectedBuilding();
  if (!building || building.type !== 'robot-house') return;

  const parcel = this.simulation.getRestorationParcelForHouse(building.id);
  const worker = this.simulation.robotHouseWorkers.find((candidate) => candidate.homeBuildingId === building.id);
  const inventory = building.seedInventory;
  const taskSignature = this.simulation.tasks
    .filter((task) => task.homeBuildingId === building.id)
    .map((task) => `${task.id}:${task.type}:${task.state}:${task.blockedReason ?? ''}`)
    .join(',');
  const inventorySignature = this.simulation.getUnlockedSeedTypes().map((seed) => `${seed}:${inventory?.[seed] ?? 0}:${this.simulation.seedCount(seed)}`).join(',');
  const parcelSignature = parcel
    ? `${parcel.state}:${parcel.totalTiles}:${parcel.analyzedTiles}:${parcel.preparedTiles}:${parcel.plantedCount}:${parcel.vegetationCoverage}:${parcel.speciesPresent}:${parcel.healthyPlantRatio}:${parcel.developedTrees}:${parcel.needs.join('|')}:${parcel.blockers.join('|')}:${parcel.progress.analysis}:${parcel.progress.preparation}:${parcel.progress.planting}:${parcel.progress.maintenance}:${parcel.progress.biodiversity}:${parcel.progress.autonomy}`
    : 'none';
  const signature = `${building.id}:${Math.floor(building.waterStored * 10) / 10}:${inventorySignature}:${worker?.state ?? 'none'}:${worker?.message ?? ''}:${worker?.progress ?? 0}:${parcelSignature}:${taskSignature}`;
  if (signature === this.robotHouseRenderSignature) return;
  this.robotHouseRenderSignature = signature;

  const waterFill = percent(building.waterStored / ROBOT_HOUSE_CAPACITY);
  const seedButtons = this.simulation.getUnlockedSeedTypes().map((seed) => {
    const local = inventory?.[seed] ?? 0;
    const global = this.simulation.seedCount(seed);
    return `<button class="seed-transfer-button" type="button" data-house-seed="${seed}" ${global <= 0 ? 'disabled' : ''}><span>${SEEDS[seed].icon}</span><strong>${local}</strong><small>Stock ${global}</small></button>`;
  }).join('');
  const workerText = worker ? this.workerStateLabel(worker.state, worker.message) : 'Robot non initialisé';
  const parcelAction = `<button class="nursery-action secondary" id="robotHouseParcelButton" type="button">${parcel?.bounds ? 'Redessiner la parcelle' : 'Définir la parcelle'}</button>`;
  const blockers = parcel?.blockers.length ? resourceList('Blocages', parcel.blockers) : '';
  const needs = parcel?.needs.length ? resourceList('Besoins', parcel.needs) : '';
  const parcelBlock = parcel?.bounds
    ? `<div class="parcel-state" data-state="${parcel.state}"><strong>${PHASE_LABELS[parcel.state]}</strong><small>${Math.round(parcel.vegetationCoverage * 100)}% couvert · ${parcel.speciesPresent} espèce${parcel.speciesPresent > 1 ? 's' : ''}</small></div>${parcelProgress(parcel)}${blockers}${needs}`
    : `<div class="zone-empty">Dessinez un rectangle autour de la maison pour attribuer un territoire au robot.</div>`;

  content.innerHTML = `
    <div class="robot-house-resources">
      <div class="water-progress"><div><span>Réserve locale</span><strong>${Math.floor(building.waterStored)}/${ROBOT_HOUSE_CAPACITY}</strong></div><span class="track"><i style="width:${waterFill}"></i></span><small>Les arrosages consomment cette eau. Un tuyau direct la remplit selon la pression réelle.</small></div>
      <button class="nursery-action" id="robotHouseWaterButton" type="button">Transférer ${ROBOT_HOUSE_WATER_TRANSFER_AMOUNT} eau</button>
      <div class="seed-transfer-grid">${seedButtons}</div>
    </div>
    ${parcelAction}
    <div class="worker-status"><span class="worker-dot"></span><span><strong>Robot restaurateur</strong><small>${workerText}</small></span></div>
    ${parcelBlock}`;

  content.querySelector<HTMLButtonElement>('#robotHouseParcelButton')?.addEventListener('click', () => {
    const result = this.simulation.selectRestorationParcelTool(building.id);
    if (!result.ok) this.showToast(result.message);
    this.robotHouseRenderSignature = '';
    this.update();
  });
  content.querySelector<HTMLButtonElement>('#robotHouseWaterButton')?.addEventListener('click', () => {
    const result = this.simulation.transferWaterToRobotHouse(building.id);
    if (!result.ok) this.showToast(result.message);
    this.robotHouseRenderSignature = '';
    this.update();
  });
  content.querySelectorAll<HTMLButtonElement>('[data-house-seed]').forEach((button) => {
    button.addEventListener('click', () => {
      const result = this.simulation.transferSeedToRobotHouse(building.id, button.dataset.houseSeed as SeedType);
      if (!result.ok) this.showToast(result.message);
      this.robotHouseRenderSignature = '';
      this.update();
    });
  });
}

export const robotHouseUiMethods = {
  renderRobotHouse,
};
