import { SCAN_ICON, SEEDS, TERRAIN_NAMES } from '../../core/config';
import { CULTIVATION_COST, RESEARCH_COST, SEED_SEARCH_DURATION } from '../../core/gameConfig';
import { TerrainType } from '../../core/types';
import type { SeedType } from '../../core/types';
import { element, type UIContext } from '../uiContext';

export function renderNursery(this: UIContext): void {
  const content = element<HTMLElement>('#nurseryContent');
  const job = this.simulation.nurseryJob;
  const worker = this.simulation.nurseryWorker;
  const summaries = this.simulation.getPlantingZoneSummaries();
  const waterSummary = this.buildNurseryWaterSummary();
  const seedSearchAction = this.buildSeedSearchAction();
  const workerSignature = `${worker?.state ?? 'none'}|${worker?.targetSeed ?? 'none'}|${worker?.targetIndex ?? 'none'}|${worker?.targetBuildingId ?? 'none'}|${worker?.message ?? ''}|${summaries.map((zone) => `${zone.id}:${zone.seed}:${zone.active}:${zone.totalCells}:${zone.readyCells}:${zone.plantedCells}:${zone.blockedCells}`).join(',')}`;
  if (job) {
    const signature = `job|${job.mode}|${job.seed}|${job.soil ?? 'none'}|${job.targetCount ?? 0}|${job.cycleStarted}|${job.pausedReason ?? ''}|${this.simulation.seedCount(job.seed)}|${workerSignature}|${waterSummary}`;
    if (signature !== this.nurseryRenderSignature) {
      this.nurseryRenderSignature = signature;
      const soilLabel = job.soil !== undefined ? ` + ${TERRAIN_NAMES[job.soil]}` : '';
      const quotaLabel = job.mode === 'cultivation' && job.targetCount !== undefined
        ? ` · stock ${this.simulation.seedCount(job.seed)}/${job.targetCount}`
        : '';
      content.innerHTML = `${waterSummary}${this.buildWorkerPanel()}<div class="nursery-job"><span class="nursery-job-icon">${job.mode === 'cultivation' ? '🌱' : '🧪'}</span><strong>${job.mode === 'cultivation' ? 'Culture jusqu’au quota' : 'Recherche'} ${job.pausedReason ? 'en pause' : 'en cours'}</strong><p>${SEEDS[job.seed].name}${soilLabel}${quotaLabel}</p><div class="job-track"><i id="nurseryJobBar"></i></div><small id="nurseryJobTime"></small><button class="nursery-action secondary" id="cancelNurseryJob" type="button">Annuler cette action</button></div>`;
      content.querySelector<HTMLButtonElement>('#cancelNurseryJob')?.addEventListener('click', () => {
        this.simulation.cancelNurseryJob();
        this.nurseryRenderSignature = '';
        this.update();
      });
      this.bindZoneButtons(content);
    }
    content.querySelector<HTMLElement>('#nurseryJobBar')!.style.width = `${job.progress * 100}%`;
    content.querySelector<HTMLElement>('#nurseryJobTime')!.textContent = job.pausedReason
      ? job.pausedReason
      : job.cycleStarted ? `${Math.ceil(job.duration * (1 - job.progress))} s restantes` : 'Prépare le prochain cycle';
    return;
  }

  const seeds = this.simulation.getUnlockedSeedTypes().filter((seed) => this.simulation.seedCount(seed) > 0);
  const soils = this.simulation.getResearchableSoils();
  const discoveredSoils = this.simulation.getDiscoveredSoils();
  const sandKnown = discoveredSoils.includes(TerrainType.Sand);
  const pioneerCount = this.simulation.seedCount('pioneer');
  const signature = `idle|${this.nurseryMode}|pioneer:${pioneerCount}|${seeds.map((seed) => `${seed}:${this.simulation.seedCount(seed)}`).join(',')}|discovered:${discoveredSoils.join(',')}|researchable:${soils.join(',')}|${workerSignature}|${waterSummary}|${seedSearchAction}`;
  if (signature === this.nurseryRenderSignature) return;
  this.nurseryRenderSignature = signature;

  if (this.nurseryMode === 'cultivation') {
    const defaultSeed = seeds[0];
    const defaultQuota = defaultSeed ? Math.max(10, this.simulation.seedCount(defaultSeed) + 1) : 10;
    content.innerHTML = `${waterSummary}${this.buildWorkerPanel()}${seedSearchAction}<div class="nursery-copy"><strong>Cultiver jusqu’à un quota</strong><p>Chaque cycle consomme 1 graine et ${CULTIVATION_COST} eau de la pépinière. Les cycles se répètent jusqu’au stock demandé.</p></div><div class="quota-row"><label class="field-label">Graine mère<select id="cultureSeed">${seeds.map((seed) => `<option value="${seed}">${SEEDS[seed].name} · ${this.simulation.seedCount(seed)} en stock</option>`).join('')}</select></label><label class="field-label">Quota<input id="cultureQuota" type="number" min="1" max="99" step="1" value="${defaultQuota}"></label></div><button class="nursery-action" id="startCulture" ${seeds.length ? '' : 'disabled'}>Cultiver jusqu’au quota</button>`;
    content.querySelector<HTMLButtonElement>('#startCulture')?.addEventListener('click', () => {
      const seed = (content.querySelector<HTMLSelectElement>('#cultureSeed')?.value ?? 'pioneer') as SeedType;
      const quota = Number(content.querySelector<HTMLInputElement>('#cultureQuota')?.value ?? 10);
      const result = this.simulation.startCultivation(seed, quota);
      if (!result.ok) this.showToast(result.message);
      this.update();
    });
    this.bindSeedSearchButton(content);
    this.bindZoneButtons(content);
    return;
  }

  const sandInfo = sandKnown
    ? `<div class="research-result"><strong>${TERRAIN_NAMES[TerrainType.Sand]}</strong><br>Déjà adapté : plantez directement ${SEEDS.pioneer.name} sur ce sol avec assez d’eau.</div>`
    : '';
  const soilSelect = soils.length
    ? `<label class="field-label">Sol étudié<select id="researchSoil">${soils.map((soil) => `<option value="${soil}">${TERRAIN_NAMES[soil]}</option>`).join('')}</select></label>`
    : '';
  const researchMessage = !soils.length
    ? sandKnown ? 'Aucun autre sol découvert ne donne une nouvelle variété pour le moment.' : 'Aucun sol spécial découvert ne donne une nouvelle variété pour le moment.'
    : pioneerCount <= 0
      ? 'Aucune graine pionnière disponible pour servir de base.'
      : 'Une variété adaptée sera révélée à la fin.';
  content.innerHTML = `${waterSummary}${this.buildWorkerPanel()}${seedSearchAction}<div class="nursery-copy"><strong>Adapter une graine au sol</strong><p>Consomme 1 graine pionnière et ${RESEARCH_COST} eau de la pépinière.</p></div>${sandInfo}<div class="research-result"><strong>Graine mère : ${SEEDS.pioneer.name}</strong><br>${pioneerCount} en stock</div>${soilSelect}<div class="research-result">${researchMessage}</div><button class="nursery-action" id="startResearch" ${pioneerCount > 0 && soils.length ? '' : 'disabled'}>Lancer la recherche</button>`;
  content.querySelector<HTMLButtonElement>('#startResearch')?.addEventListener('click', () => {
    const soil = Number(content.querySelector<HTMLSelectElement>('#researchSoil')?.value) as TerrainType;
    const result = this.simulation.startResearch('pioneer', soil);
    if (!result.ok) this.showToast(result.message);
    this.update();
  });
  this.bindSeedSearchButton(content);
  this.bindZoneButtons(content);
}

export function buildWorkerPanel(this: UIContext): string {
  const worker = this.simulation.nurseryWorker;
  const summaries = this.simulation.getPlantingZoneSummaries();
  const scanSummaries = this.simulation.getScanZoneSummaries();
  const workerText = worker ? this.workerStateLabel(worker.state, worker.message) : 'Aucun robot actif';
  const scanRows = scanSummaries.map((zone) => {
    const progress = Math.round(Math.min(1, zone.progress / zone.duration) * 100);
    const remaining = Math.max(0, Math.ceil(zone.duration - zone.progress));
    return `<div class="zone-row scan-zone-row"><span class="zone-icon">${SCAN_ICON}</span><p><strong>Scan robot #${zone.id}</strong><small>${progress}% · ${remaining} s · ${zone.totalCells} tuiles</small></p></div>`;
  }).join('');
  const rows = summaries.length
    ? summaries.map((zone) => `<div class="zone-row ${zone.active ? '' : 'is-paused'}"><span class="zone-icon">${SEEDS[zone.seed].icon}</span><p><strong>${SEEDS[zone.seed].name}</strong><small>${zone.readyCells} prêtes · ${zone.plantedCells} plantées · ${zone.blockedCells} bloquées</small></p><button type="button" data-zone-toggle="${zone.id}">${zone.active ? 'Pause' : 'Reprendre'}</button><button type="button" data-zone-clear="${zone.id}">Vider</button></div>`).join('')
    : '<div class="zone-empty">Sélectionnez une graine dans le dock puis peignez une zone sur la carte.</div>';
  return `<div class="worker-panel"><div class="worker-status"><span class="worker-dot"></span><span><strong>Robot pépiniériste</strong><small>${workerText}</small></span></div><div class="zone-list">${scanRows}${rows}</div></div>`;
}

export function buildNurseryWaterSummary(this: UIContext): string {
  const building = this.simulation.getSelectedBuilding();
  const water = building?.type === 'nursery' ? this.simulation.getBuildingWaterStatus(building) : null;
  if (!water) return '';
  return `<div class="research-result"><strong>${water.label} : ${Math.floor(water.current)}/${water.capacity}</strong><br>${water.detail}</div>`;
}

export function buildSeedSearchAction(this: UIContext): string {
  if (!this.simulation.hasNursery() || this.simulation.seedCount('pioneer') > 0) return '';
  const worker = this.simulation.nurseryWorker;
  const busy = Boolean(worker && worker.state !== 'idle' && worker.state !== 'blocked');
  return `<div class="research-result"><strong>Stock de graines basiques vide</strong><br>Le robot peut chercher une graine proche et la rapporter après ${SEED_SEARCH_DURATION} s de fouille.</div><button class="nursery-action secondary" id="startSeedSearch" type="button" ${busy ? 'disabled' : ''}>Envoyer le robot chercher une graine</button>`;
}

export function bindSeedSearchButton(this: UIContext, root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>('#startSeedSearch')?.addEventListener('click', () => {
    const result = this.simulation.startSeedSearch();
    if (!result.ok) this.showToast(result.message);
    this.nurseryRenderSignature = '';
    this.update();
  });
}

export function workerStateLabel(this: UIContext, state: string, message: string): string {
  if (state === 'to-target') return message || 'En route vers une zone';
  if (state === 'planting') return message || 'Plantation en cours';
  if (state === 'to-scan') return message || 'En route vers une zone à scanner';
  if (state === 'scanning') return message || 'Analyse globale du sol en cours';
  if (state === 'to-seed-search') return message || 'Va chercher une graine';
  if (state === 'searching-seed') return message || 'Recherche une graine';
  if (state === 'returning-seed') return message || 'Rapporte une graine';
  if (state === 'to-pump') return message || 'Va chercher de l’eau';
  if (state === 'loading-water') return message || 'Charge de l’eau';
  if (state === 'to-nursery') return message || 'Rapporte de l’eau';
  if (state === 'unloading-water') return message || 'Dépose de l’eau';
  if (state === 'returning') return message || 'Retour à la pépinière';
  if (state === 'blocked') return message || 'En attente';
  return message || 'Disponible';
}

export function bindZoneButtons(this: UIContext, root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-zone-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      this.simulation.togglePlantingZone(Number(button.dataset.zoneToggle));
      this.nurseryRenderSignature = '';
      this.update();
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-zone-clear]').forEach((button) => {
    button.addEventListener('click', () => {
      this.simulation.clearPlantingZone(Number(button.dataset.zoneClear));
      this.nurseryRenderSignature = '';
      this.update();
    });
  });
}

export const nurseryUiMethods = {
  renderNursery,
  buildWorkerPanel,
  buildNurseryWaterSummary,
  buildSeedSearchAction,
  bindSeedSearchButton,
  workerStateLabel,
  bindZoneButtons,
};
