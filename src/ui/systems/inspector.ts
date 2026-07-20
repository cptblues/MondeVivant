import { BUILDINGS, SEEDS, TERRAIN_DESCRIPTIONS, TERRAIN_NAMES } from '../../core/config';
import type { BuildingType, PressureLevel } from '../../core/types';
import { element, type UIContext } from '../uiContext';

export function updateInspector(this: UIContext): void {
  const building = this.simulation.getSelectedBuilding();
  const pipe = this.simulation.getSelectedPipe();
  const selectedCell = this.simulation.getSelectedCell();
  const open = Boolean(building || pipe || selectedCell);
  this.inspector.classList.toggle('is-open', open);
  if (!open) return;

  const buildingSection = element<HTMLElement>('#buildingSection');
  const pipeSection = element<HTMLElement>('#pipeSection');
  const cellSection = element<HTMLElement>('#cellSection');
  const nurseryPanel = element<HTMLElement>('#nurseryPanel');
  const actions = element<HTMLElement>('#inspectorActions');
  const removeButton = element<HTMLButtonElement>('#removeButton');
  const clearNetworkButton = element<HTMLButtonElement>('#clearNetworkButton');
  const harvestWoodButton = element<HTMLButtonElement>('#harvestWoodButton');
  const createOutletButton = element<HTMLButtonElement>('#createOutletButton');
  const toggleOutletButton = element<HTMLButtonElement>('#toggleOutletButton');
  const removeOutletButton = element<HTMLButtonElement>('#removeOutletButton');
  const removePipeButton = element<HTMLButtonElement>('#removePipeButton');

  buildingSection.hidden = true;
  pipeSection.hidden = true;
  cellSection.hidden = true;
  nurseryPanel.hidden = true;
  actions.hidden = true;
  removeButton.hidden = true;
  clearNetworkButton.hidden = true;
  harvestWoodButton.hidden = true;
  createOutletButton.hidden = true;
  toggleOutletButton.hidden = true;
  removeOutletButton.hidden = true;
  removePipeButton.hidden = true;

  if (building) {
    const definition = BUILDINGS[building.type];
    element<HTMLElement>('#inspectorIcon').textContent = definition.icon;
    element<HTMLElement>('#inspectorTitle').textContent = definition.name;
    element<HTMLElement>('#inspectorSubtitle').textContent = this.buildingSubtitle(building.type);
    element<HTMLElement>('#buildingStatus').textContent = this.simulation.getBuildingStatus(building);
    element<HTMLElement>('#radiusValue').textContent = definition.radiusCells > 0 ? `${definition.radiusCells} cases` : 'Aucun rayon';
    buildingSection.hidden = false;
    actions.hidden = false;
    removeButton.hidden = false;
    nurseryPanel.hidden = building.type !== 'nursery';
    if (building.type !== 'nursery') this.nurseryRenderSignature = '';
    const waterWrap = element<HTMLElement>('#buildingWaterWrap');
    const waterStatus = this.simulation.getBuildingWaterStatus(building);
    waterWrap.hidden = !waterStatus;
    if (waterStatus) {
      element<HTMLElement>('#buildingWaterLabel').textContent = waterStatus.label;
      element<HTMLElement>('#buildingWaterValue').textContent = `${Math.floor(waterStatus.current)}/${waterStatus.capacity}`;
      element<HTMLElement>('#buildingWaterBar').style.width = `${waterStatus.fill * 100}%`;
      element<HTMLElement>('#buildingWaterDetail').textContent = waterStatus.detail;
    }
    const progressWrap = element<HTMLElement>('#buildingProgressWrap');
    const progress = building.type === 'scanner' && !building.scanComplete
      ? building.scanProgress
      : building.type === 'nursery' && this.simulation.nurseryJob
        ? this.simulation.nurseryJob.progress
        : null;
    progressWrap.hidden = progress === null;
    if (progress !== null) {
      element<HTMLElement>('#buildingProgressValue').textContent = `${Math.round(progress * 100)}%`;
      element<HTMLElement>('#buildingProgressBar').style.width = `${progress * 100}%`;
      element<HTMLElement>('#buildingProgressLabel').textContent = building.type === 'scanner'
        ? 'Analyse du sol'
        : this.simulation.nurseryJob?.pausedReason ? 'Travail en pause' : 'Travail en cours';
    }
    removeButton.disabled = building.type === 'nursery' && Boolean(this.simulation.nurseryJob);
    removeButton.textContent = building.type === 'scanner' ? 'Récupérer le scanner · 30 s' : 'Récupérer la construction';
    if ((building.type === 'pump' || building.type === 'cistern') && this.simulation.pipes.some((candidate) => candidate.sourceType === building.type && candidate.sourceId === building.id)) {
      clearNetworkButton.hidden = false;
      clearNetworkButton.textContent = building.type === 'cistern' ? 'Démonter le réseau secondaire' : 'Démonter le réseau';
    }
    if (building.type === 'nursery') this.renderNursery();
    return;
  }

  if (pipe) {
    const preview = this.simulation.getOutletPreview(pipe.gx, pipe.gy);
    const pressure = pipe.outlet && pipe.outletOpen ? this.simulation.getPressureLevelAt(pipe.gx, pipe.gy) : preview.level;
    element<HTMLElement>('#inspectorIcon').textContent = pipe.outlet ? (pipe.outletOpen ? '🚿' : '🚰') : '〰️';
    element<HTMLElement>('#inspectorTitle').textContent = pipe.outlet ? 'Sortie d’eau' : 'Tuyau';
    element<HTMLElement>('#inspectorSubtitle').textContent = `Tuile ${pipe.gx}, ${pipe.gy} · source ${pipe.sourceType === 'cistern' ? 'cuve relais' : 'pompe'}`;
    pipeSection.hidden = false;
    element<HTMLElement>('#pipePressure').textContent = pipe.outlet && pipe.outletOpen ? this.simulation.getPressureLabel(pressure) : `${this.simulation.getPressureLabel(pressure)} prévue`;
    element<HTMLElement>('#pipePressure').dataset.level = pressure;
    element<HTMLElement>('#pipeDistance').textContent = `${pipe.distance} case${pipe.distance > 1 ? 's' : ''}`;
    element<HTMLElement>('#pipeOutletStatus').textContent = pipe.outlet ? (pipe.outletOpen ? 'Ouverte' : 'Fermée') : 'Absente';
    element<HTMLElement>('#pipeConsumption').textContent = `${this.outletConsumption(pressure, pipe.outletOpen).toFixed(2)} 💧/s`;
    element<HTMLElement>('#pipeHelp').textContent = pipe.outlet
      ? pipe.outletOpen ? 'Cette vanne ouverte humidifie les tuiles vertes, consomme du débit et réduit la pression en aval.' : 'La vanne est fermée : aucune consommation ici, le débit continue vers la suite du tuyau.'
      : 'Ajoutez une sortie sur cette tuile. Elle est créée fermée afin de ne pas consommer immédiatement.';
    if (!pipe.outlet || !pipe.outletOpen) {
      const consumption = this.outletConsumption(pressure, true);
      element<HTMLElement>('#pipeHelp').textContent = preview.cells.length
        ? `Aperçu si ouverte : ${preview.cells.length} cellule${preview.cells.length > 1 ? 's' : ''} humidifiée${preview.cells.length > 1 ? 's' : ''}, ${consumption.toFixed(2)} 💧/s.`
        : 'Aucune pression disponible ici pour le moment : fermez une autre sortie ou rapprochez le réseau.';
    }
    createOutletButton.hidden = pipe.outlet;
    toggleOutletButton.hidden = !pipe.outlet;
    toggleOutletButton.textContent = pipe.outletOpen ? 'Fermer la sortie' : 'Ouvrir la sortie';
    removeOutletButton.hidden = !pipe.outlet;
    removePipeButton.hidden = false;
    return;
  }

  if (selectedCell) {
    const { cell } = selectedCell;
    const diagnostic = this.simulation.getCellGrowthDiagnostics(selectedCell.index);
    element<HTMLElement>('#inspectorIcon').textContent = cell.tree ? SEEDS[cell.tree].icon : cell.known ? '◫' : '❔';
    element<HTMLElement>('#inspectorTitle').textContent = cell.tree ? SEEDS[cell.tree].name : cell.known ? TERRAIN_NAMES[cell.terrain] : 'Sol non analysé';
    element<HTMLElement>('#inspectorSubtitle').textContent = cell.tree ? `Arbre stade ${cell.treeStage}/3 · ${cell.treeOrigin === 'natural' ? 'semis naturel' : 'planté par le joueur'}` : cell.known ? 'Analyse mémorisée définitivement' : 'Confiez une zone de scan au robot';
    cellSection.hidden = false;
    const soilCard = element<HTMLElement>('#soilCard');
    soilCard.innerHTML = cell.known ? `<strong>${TERRAIN_NAMES[cell.terrain]}</strong><span>${TERRAIN_DESCRIPTIONS[cell.terrain]}</span>` : '<strong>Information masquée</strong><span>Le robot de la pépinière révèle les sols après avoir parcouru toute une zone de scan.</span>';
    for (const id of ['water', 'shade', 'humus'] as const) {
      const row = element<HTMLElement>(`#${id}Bar`).closest<HTMLElement>('.condition-row');
      if (row) row.hidden = !cell.known;
    }
    if (cell.known) {
      this.setCondition('water', cell.water);
      this.setCondition('shade', cell.shade);
      this.setCondition('humus', cell.humus);
    }
    const note = element<HTMLElement>('#treeNote');
    note.hidden = !cell.tree;
    if (cell.tree) {
      note.innerHTML = cell.treeStage >= 3
        ? `<strong>Dispersion naturelle</strong><span>${cell.seedsProduced}/3 graines établies. Une nouvelle pousse ne peut apparaître que sur un sol compatible, humide et assez lumineux.</span>`
        : cell.treeStress > 8
          ? `<strong>Stress : ${diagnostic.primaryStressReason ?? 'conditions insuffisantes'}</strong><span>Le symbole ! signale cette cause. Corrigez les blocages listés ci-dessous pour relancer la croissance.</span>`
          : `<strong>Croissance ${Math.round(cell.treeProgress * 100)}%</strong><span>Une ombre trop forte peut empêcher les jeunes arbres de survivre.</span>`;
    }
    if (cell.tree && cell.treeStage >= 3) {
      actions.hidden = false;
      harvestWoodButton.hidden = false;
    }
    this.renderGrowthDiagnostic(selectedCell.index);
  }
}

export function buildingSubtitle(this: UIContext, type: BuildingType): string {
  if (type === 'pump') return 'Source de réserve, réseau et humidité locale';
  if (type === 'cistern') return 'Stockage d’eau, humidité locale et source secondaire';
  if (type === 'carrier') return 'Atelier de robot transporteur';
  if (type === 'nursery') return 'Atelier de graines et robot planteur';
  return BUILDINGS[type].radiusCells > 0 ? 'Construction sélectionnée · rayon affiché' : 'Atelier sans zone d’effet';
}

export function renderGrowthDiagnostic(this: UIContext, index: number): void {
  const diagnostic = this.simulation.getCellGrowthDiagnostics(index);
  const root = element<HTMLElement>('#growthDiagnostic');
  root.className = `growth-diagnostic is-${diagnostic.tone}`;
  const progress = diagnostic.progressLabel ? `<small>${diagnostic.progressLabel}</small>` : '';
  const details = diagnostic.details.map((detail) => `<em>${detail}</em>`).join('');
  const blockers = diagnostic.blockers.length
    ? `<ul>${diagnostic.blockers.map((blocker) => `<li>${blocker}</li>`).join('')}</ul>`
    : '<p>Conditions favorables.</p>';
  root.innerHTML = `<strong>${diagnostic.headline}</strong>${progress}<div>${details}</div>${blockers}`;
}

export function outletConsumption(this: UIContext, level: PressureLevel, open: boolean): number {
  if (!open) return 0;
  return level === 'strong' ? 1.15 : level === 'medium' ? 0.72 : level === 'weak' ? 0.32 : 0;
}

export const inspectorUiMethods = {
  updateInspector,
  buildingSubtitle,
  renderGrowthDiagnostic,
  outletConsumption,
};
