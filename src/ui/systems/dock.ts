import { BUILDINGS, CISTERN_PIPE_MAX_LENGTH, PIPE_ICON, PIPE_MAX_LENGTH, SCAN_ICON, SCAN_ZONE_RADIUS, SEEDS, TERRAIN_NAMES } from '../../core/config';
import { SCAN_ZONE_MAX_DURATION, SCAN_ZONE_MIN_DURATION } from '../../core/gameConfig';
import type { BuildingType, SeedType } from '../../core/types';
import type { UIContext } from '../uiContext';

export function updateDock(this: UIContext): void {
  const buildings = this.simulation.getUnlockedBuildingTypes();
  const seeds = this.simulation.getUnlockedSeedTypes();
  const pipeUnlocked = this.simulation.isPipeUnlocked();
  const hasNursery = this.simulation.hasNursery();
  const signature = `${buildings.join(',')}|pipe:${pipeUnlocked}|nursery:${hasNursery}|scan:${this.simulation.getScanZoneSummaries().length}|${seeds.join(',')}`;
  if (signature !== this.dockSignature) {
    this.dockSignature = signature;
    const buildingButtons = buildings.map((type) => this.buildBuildingButton(type)).join('');
    const pipeButton = pipeUnlocked ? this.buildPipeButton() : '';
    const scanButton = hasNursery ? this.buildScanButton() : '';
    const seedButtons = seeds.map((type) => this.buildSeedButton(type)).join('');
    const eraseButton = hasNursery ? this.buildZoneEraseButton() : '';
    const scanGroup = hasNursery ? `<span class="dock-separator"></span><span class="dock-label">SCAN</span>${scanButton}` : '';
    this.toolDock.innerHTML = `<span class="dock-label">INFRA</span>${buildingButtons}${pipeButton}${scanGroup}<span class="dock-separator"></span><span class="dock-label">${hasNursery ? 'ZONES' : 'GRAINES'}</span>${seedButtons}${eraseButton}`;
    this.toolDock.querySelectorAll<HTMLButtonElement>('[data-building]').forEach((button) => {
      button.addEventListener('click', () => { this.simulation.selectTool({ kind: 'building', type: button.dataset.building as BuildingType }); this.update(); });
    });
    this.toolDock.querySelector<HTMLButtonElement>('[data-pipe]')?.addEventListener('click', () => { this.simulation.selectTool({ kind: 'pipe' }); this.update(); });
    this.toolDock.querySelector<HTMLButtonElement>('[data-scan-zone]')?.addEventListener('click', () => { this.simulation.selectTool({ kind: 'scan-zone' }); this.update(); });
    this.toolDock.querySelectorAll<HTMLButtonElement>('[data-seed]').forEach((button) => {
      button.addEventListener('click', () => {
        const seed = button.dataset.seed as SeedType;
        if (!this.simulation.hasNursery()) this.showToast('Placez d’abord la pépinière');
        else this.simulation.selectTool({ kind: 'planting-zone', mode: 'paint', seed });
        this.update();
      });
    });
    this.toolDock.querySelector<HTMLButtonElement>('[data-zone-erase]')?.addEventListener('click', () => {
      this.simulation.selectTool({ kind: 'planting-zone', mode: 'erase' });
      this.update();
    });
  }

  this.toolDock.querySelectorAll<HTMLButtonElement>('[data-building]').forEach((button) => {
    const type = button.dataset.building as BuildingType;
    const available = this.simulation.availableBuilding(type);
    const cooldown = this.simulation.getBuildingCooldown(type);
    const unavailableReason = this.simulation.getBuildingUnavailableReason(type);
    const selected = this.simulation.selectedTool?.kind === 'building' && this.simulation.selectedTool.type === type;
    button.disabled = Boolean(unavailableReason);
    button.classList.toggle('is-selected', selected);
    button.classList.toggle('is-empty', Boolean(unavailableReason));
    button.classList.toggle('is-cooldown', cooldown > 0);
    button.title = unavailableReason ?? BUILDINGS[type].name;
    const count = button.querySelector<HTMLElement>('[data-count]');
    if (count) count.textContent = cooldown > 0 ? `${Math.ceil(cooldown)}s` : unavailableReason ? this.shortUnavailableLabel(unavailableReason) : `${available}/${this.simulation.totalBuilding(type)}`;
  });
  const pipeButton = this.toolDock.querySelector<HTMLButtonElement>('[data-pipe]');
  if (pipeButton) {
    pipeButton.classList.toggle('is-selected', this.simulation.selectedTool?.kind === 'pipe');
    const count = pipeButton.querySelector<HTMLElement>('[data-count]');
    if (count) count.textContent = this.simulation.pipeSource ? '→' : '∞';
  }
  const scanButton = this.toolDock.querySelector<HTMLButtonElement>('[data-scan-zone]');
  if (scanButton) {
    scanButton.classList.toggle('is-selected', this.simulation.selectedTool?.kind === 'scan-zone');
    const count = scanButton.querySelector<HTMLElement>('[data-count]');
    if (count) count.textContent = String(this.simulation.getScanZoneSummaries().length);
  }
  this.toolDock.querySelectorAll<HTMLButtonElement>('[data-seed]').forEach((button) => {
    const type = button.dataset.seed as SeedType;
    const countValue = this.simulation.seedCount(type);
    const selected = this.simulation.selectedTool?.kind === 'planting-zone' && this.simulation.selectedTool.mode === 'paint' && this.simulation.selectedTool.seed === type;
    button.disabled = !this.simulation.hasNursery();
    button.classList.toggle('is-selected', selected);
    button.classList.toggle('is-empty', countValue <= 0);
    const count = button.querySelector<HTMLElement>('[data-count]');
    if (count) count.textContent = String(countValue);
  });
  const eraseButton = this.toolDock.querySelector<HTMLButtonElement>('[data-zone-erase]');
  if (eraseButton) eraseButton.classList.toggle('is-selected', this.simulation.selectedTool?.kind === 'planting-zone' && this.simulation.selectedTool.mode === 'erase');
}

export function buildBuildingButton(this: UIContext, type: BuildingType): string {
  const definition = BUILDINGS[type];
  const effects = [
    definition.effects.resourceRate ? `+${definition.effects.resourceRate.toFixed(1)} 💧/s` : '',
    definition.radiusCells > 0 ? `Rayon ${definition.radiusCells} cases` : 'Aucun rayon écologique',
  ].filter(Boolean);
  const cost = this.buildCostLabel(type);
  return `<button class="tool-button" type="button" data-building="${type}"><span class="tool-icon">${definition.icon}</span><span class="tool-count" data-count>0</span><span class="tool-tooltip"><span class="tooltip-head"><i>${definition.icon}</i><span><strong>${definition.name}</strong><small>Coût ${cost}</small></span></span><span class="tooltip-copy">${definition.description}</span><span class="tooltip-tags">${effects.map((effect) => `<em>${effect}</em>`).join('')}</span></span></button>`;
}

export function shortUnavailableLabel(this: UIContext, reason: string): string {
  if (reason.includes('bois')) return 'bois';
  if (reason.includes('💧')) return 'eau';
  if (reason.includes('Verrouillé')) return 'lock';
  return '0';
}

export function buildCostLabel(this: UIContext, type: BuildingType): string {
  const definition = BUILDINGS[type];
  const parts: string[] = [];
  if (definition.cost > 0) parts.push(`${definition.cost} 💧`);
  if ((definition.woodCost ?? 0) > 0) parts.push(`${definition.woodCost} bois`);
  return parts.length ? parts.join(' + ') : 'gratuit';
}

export function buildPipeButton(this: UIContext): string {
  return `<button class="tool-button pipe-button" type="button" data-pipe><span class="tool-icon">${PIPE_ICON}</span><span class="tool-count" data-count>∞</span><span class="tool-tooltip"><span class="tooltip-head"><i>${PIPE_ICON}</i><span><strong>Tuyau automatique</strong><small>Source ou segment</small></span></span><span class="tooltip-copy">Cliquez sur une pompe, une cuve remplie ou un tuyau existant, puis choisissez une destination. Les cuves et pépinières doivent être reliées directement sur leur bâtiment. Portée par segment : pompe ${PIPE_MAX_LENGTH} cases, cuve ${CISTERN_PIPE_MAX_LENGTH} cases.</span><span class="tooltip-tags"><em>Prolonge le réseau</em><em>Pression selon distance</em><em>Sorties sur chaque tuile</em></span></span></button>`;
}

export function buildScanButton(this: UIContext): string {
  return `<button class="tool-button scan-button" type="button" data-scan-zone><span class="tool-icon">${SCAN_ICON}</span><span class="tool-count" data-count>0</span><span class="tool-tooltip"><span class="tooltip-head"><i>${SCAN_ICON}</i><span><strong>Zone de scan</strong><small>Robot pépiniériste</small></span></span><span class="tooltip-copy">Cliquez une zone : le robot rejoint le centre, analyse selon le nombre de tuiles à découvrir, puis mémorise la zone dans la vue Sols.</span><span class="tooltip-tags"><em>Rayon ${SCAN_ZONE_RADIUS} cases</em><em>${SCAN_ZONE_MIN_DURATION}-${SCAN_ZONE_MAX_DURATION} s</em></span></span></button>`;
}

export function buildSeedButton(this: UIContext, type: SeedType): string {
  const definition = SEEDS[type];
  return `<button class="tool-button seed-button" type="button" data-seed="${type}"><span class="tool-icon">${definition.icon}</span><span class="tool-count" data-count>0</span><span class="tool-tooltip"><span class="tooltip-head"><i>${definition.icon}</i><span><strong>${definition.name}</strong><small>Pinceau de zone</small></span></span><span class="tooltip-copy">${definition.description} Sélectionnez cette graine puis peignez une zone : le robot de la pépinière ira planter les graines en stock.</span><span class="tooltip-tags"><em>${definition.compatibleTerrains.map((soil) => TERRAIN_NAMES[soil]).join(' · ')}</em><em>Eau ${definition.waterNeed}</em></span></span></button>`;
}

export function buildZoneEraseButton(this: UIContext): string {
  return `<button class="tool-button zone-erase-button" type="button" data-zone-erase><span class="tool-icon">⌫</span><span class="tool-count" data-count>zone</span><span class="tool-tooltip"><span class="tooltip-head"><i>⌫</i><span><strong>Gomme de zone</strong><small>Retirer des cases</small></span></span><span class="tooltip-copy">Peignez sur une zone existante pour retirer les cases confiées au robot.</span><span class="tooltip-tags"><em>Ne retire pas les arbres</em><em>Zones uniquement</em></span></span></button>`;
}

export const dockUiMethods = {
  updateDock,
  buildBuildingButton,
  shortUnavailableLabel,
  buildCostLabel,
  buildPipeButton,
  buildScanButton,
  buildSeedButton,
  buildZoneEraseButton,
};
