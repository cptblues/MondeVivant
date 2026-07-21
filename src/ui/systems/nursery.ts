import { SCAN_ICON, SEED_ORDER, SEEDS, TERRAIN_NAMES } from '../../core/config';
import { CULTIVATION_COST, RESEARCH_COST, SEED_SEARCH_DURATION } from '../../core/gameConfig';
import { TerrainType } from '../../core/types';
import type { SeedRequestStatus, SeedType } from '../../core/types';
import { element, type UIContext } from '../uiContext';

const REQUEST_LABELS: Record<SeedRequestStatus, string> = {
  pending: 'en attente',
  reserved: 'réservée',
  in_delivery: 'en livraison',
  partially_delivered: 'partielle',
  completed: 'terminée',
  blocked: 'bloquée',
  canceled: 'annulée',
};

interface NurseryFormState {
  activeId: string | null;
  cultureSeed: string | null;
  cultureQuota: string | null;
  researchSoil: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
}

function readNurseryFormState(root: HTMLElement): NurseryFormState {
  const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement)
    ? document.activeElement
    : null;
  const quota = root.querySelector<HTMLInputElement>('#cultureQuota');
  const quotaActive = quota !== null && active === quota;
  return {
    activeId: active?.id || null,
    cultureSeed: root.querySelector<HTMLSelectElement>('#cultureSeed')?.value ?? null,
    cultureQuota: quota?.value ?? null,
    researchSoil: root.querySelector<HTMLSelectElement>('#researchSoil')?.value ?? null,
    selectionStart: quotaActive ? quota.selectionStart : null,
    selectionEnd: quotaActive ? quota.selectionEnd : null,
  };
}

function restoreNurseryFormState(root: HTMLElement, state: NurseryFormState): void {
  const cultureSeed = root.querySelector<HTMLSelectElement>('#cultureSeed');
  if (cultureSeed && state.cultureSeed && [...cultureSeed.options].some((option) => option.value === state.cultureSeed)) cultureSeed.value = state.cultureSeed;
  const cultureQuota = root.querySelector<HTMLInputElement>('#cultureQuota');
  if (cultureQuota && state.cultureQuota !== null) cultureQuota.value = state.cultureQuota;
  const researchSoil = root.querySelector<HTMLSelectElement>('#researchSoil');
  if (researchSoil && state.researchSoil && [...researchSoil.options].some((option) => option.value === state.researchSoil)) researchSoil.value = state.researchSoil;
  const active = state.activeId ? root.querySelector<HTMLElement>(`#${state.activeId}`) : null;
  if (active) {
    active.focus();
    if (active === cultureQuota && state.selectionStart !== null && state.selectionEnd !== null) {
      try {
        cultureQuota.setSelectionRange(state.selectionStart, state.selectionEnd);
      } catch {
        // Number inputs do not expose text selection in every browser.
      }
    }
  }
}

function updateSlot(root: HTMLElement, id: string, html: string): boolean {
  const slot = root.querySelector<HTMLElement>(`#${id}`);
  if (!slot || slot.dataset.signature === html) return false;
  slot.dataset.signature = html;
  slot.innerHTML = html;
  return true;
}

function refreshNurseryFormAvailability(ui: UIContext, root: HTMLElement): void {
  const cultureSeed = root.querySelector<HTMLSelectElement>('#cultureSeed');
  if (cultureSeed) {
    for (const option of cultureSeed.options) {
      const seed = option.value as SeedType;
      const free = ui.simulation.getFreeNurserySeedCount(seed);
      option.disabled = free <= 0;
      option.textContent = `${SEEDS[seed].name} · ${free} libres`;
    }
    const selected = cultureSeed.value as SeedType;
    const start = root.querySelector<HTMLButtonElement>('#startCulture');
    if (start) start.disabled = !selected || ui.simulation.getFreeNurserySeedCount(selected) <= 0;
  }
  const researchSoil = root.querySelector<HTMLSelectElement>('#researchSoil');
  const startResearch = root.querySelector<HTMLButtonElement>('#startResearch');
  if (startResearch) startResearch.disabled = ui.simulation.getFreeNurserySeedCount('pioneer') <= 0 || !researchSoil;
}

export function renderNursery(this: UIContext): void {
  const content = element<HTMLElement>('#nurseryContent');
  const job = this.simulation.nurseryJob;
  const worker = this.simulation.nurseryWorker;
  const summaries = this.simulation.getPlantingZoneSummaries();
  const taskSignature = this.simulation.tasks.map((task) => `${task.id}:${task.state}:${task.reservedByWorkerId ?? ''}:${task.blockedReason ?? ''}`).join(',');
  const waterSummary = this.buildNurseryWaterSummary();
  const seedSupplySummary = this.buildNurserySeedSupplySummary();
  const seedSearchAction = this.buildSeedSearchAction();
  const seedRequestSignature = this.simulation.seedRequests.map((request) => `${request.id}:${request.status}:${request.quantityRequested}:${request.quantityReserved}:${request.quantityDelivered}:${request.assignedNurseryId ?? 'none'}:${request.blockedReason ?? ''}`).join(',');
  const seedLoadSignature = SEED_ORDER.map((seed) => `${seed}:${worker?.seedLoad[seed] ?? 0}`).join(',');
  const workerSignature = `${worker?.state ?? 'none'}|${worker?.currentTaskId ?? 'none'}|${worker?.targetSeed ?? 'none'}|${worker?.targetIndex ?? 'none'}|${worker?.targetBuildingId ?? 'none'}|${worker?.message ?? ''}|cargo:${seedLoadSignature}|requests:${seedRequestSignature}|tasks:${taskSignature}|${summaries.map((zone) => `${zone.id}:${zone.seed}:${zone.active}:${zone.totalCells}:${zone.readyCells}:${zone.plantedCells}:${zone.blockedCells}:${zone.blockedReason ?? ''}`).join(',')}`;
  if (job) {
    const signature = `job|${job.mode}|${job.seed}|${job.soil ?? 'none'}|${job.targetCount ?? 0}|${job.cycleStarted}|${job.pausedReason ?? ''}|${this.simulation.seedCount(job.seed)}|${workerSignature}|${waterSummary}|${seedSupplySummary}`;
    if (signature !== this.nurseryRenderSignature) {
      this.nurseryRenderSignature = signature;
      const soilLabel = job.soil !== undefined ? ` + ${TERRAIN_NAMES[job.soil]}` : '';
      const quotaLabel = job.mode === 'cultivation' && job.targetCount !== undefined
        ? ` · stock ${this.simulation.seedCount(job.seed)}/${job.targetCount}`
        : '';
      content.innerHTML = `${waterSummary}${seedSupplySummary}${this.buildWorkerPanel()}<div class="nursery-job"><span class="nursery-job-icon">${job.mode === 'cultivation' ? '🌱' : '🧪'}</span><strong>${job.mode === 'cultivation' ? 'Culture jusqu’au quota' : 'Recherche'} ${job.pausedReason ? 'en pause' : 'en cours'}</strong><p>${SEEDS[job.seed].name}${soilLabel}${quotaLabel}</p><div class="job-track"><i id="nurseryJobBar"></i></div><small id="nurseryJobTime"></small><button class="nursery-action secondary" id="cancelNurseryJob" type="button">Annuler cette action</button></div>`;
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

  const seeds = this.simulation.getUnlockedSeedTypes();
  const soils = this.simulation.getResearchableSoils();
  const discoveredSoils = this.simulation.getDiscoveredSoils();
  const sandKnown = discoveredSoils.includes(TerrainType.Sand);
  const freePioneerCount = this.simulation.getFreeNurserySeedCount('pioneer');
  const formSignature = `idle-form|${this.nurseryMode}|seeds:${seeds.join(',')}|discovered:${discoveredSoils.join(',')}|researchable:${soils.join(',')}|sand:${sandKnown}`;
  const formState = readNurseryFormState(content);

  if (formSignature !== this.nurseryRenderSignature) {
    this.nurseryRenderSignature = formSignature;
    if (this.nurseryMode === 'cultivation') {
      const defaultSeed = seeds.find((seed) => this.simulation.getFreeNurserySeedCount(seed) > 0) ?? seeds[0];
      const defaultQuota = defaultSeed ? Math.max(10, this.simulation.seedCount(defaultSeed) + 1) : 10;
      const options = seeds.map((seed) => {
        const free = this.simulation.getFreeNurserySeedCount(seed);
        return `<option value="${seed}" ${seed === defaultSeed ? 'selected' : ''} ${free <= 0 ? 'disabled' : ''}>${SEEDS[seed].name} · ${free} libres</option>`;
      }).join('');
      content.innerHTML = `<div id="nurseryWaterSlot"></div><div id="nurserySeedSupplySlot"></div><div id="nurseryWorkerSlot"></div><div id="nurserySeedSearchSlot"></div><div id="nurseryFormSlot"><div class="nursery-copy"><strong>Cultiver jusqu’à un quota</strong><p>Chaque cycle consomme 1 graine et ${CULTIVATION_COST} eau de la pépinière. Les cycles se répètent jusqu’au stock demandé.</p></div><div class="quota-row"><label class="field-label">Graine mère<select id="cultureSeed">${options}</select></label><label class="field-label">Quota<input id="cultureQuota" type="number" min="1" max="99" step="1" value="${defaultQuota}"></label></div><button class="nursery-action" id="startCulture" ${seeds.some((seed) => this.simulation.getFreeNurserySeedCount(seed) > 0) ? '' : 'disabled'}>Cultiver jusqu’au quota</button></div>`;
      content.querySelector<HTMLSelectElement>('#cultureSeed')?.addEventListener('change', () => refreshNurseryFormAvailability(this, content));
      content.querySelector<HTMLButtonElement>('#startCulture')?.addEventListener('click', () => {
        const seed = (content.querySelector<HTMLSelectElement>('#cultureSeed')?.value ?? 'pioneer') as SeedType;
        const quota = Number(content.querySelector<HTMLInputElement>('#cultureQuota')?.value ?? 10);
        const result = this.simulation.startCultivation(seed, quota);
        if (!result.ok) this.showToast(result.message);
        this.update();
      });
    } else {
      const sandInfo = sandKnown
        ? `<div class="research-result"><strong>${TERRAIN_NAMES[TerrainType.Sand]}</strong><br>Déjà adapté : plantez directement ${SEEDS.pioneer.name} sur ce sol avec assez d’eau.</div>`
        : '';
      const soilSelect = soils.length
        ? `<label class="field-label">Sol étudié<select id="researchSoil">${soils.map((soil) => `<option value="${soil}">${TERRAIN_NAMES[soil]}</option>`).join('')}</select></label>`
        : '';
      content.innerHTML = `<div id="nurseryWaterSlot"></div><div id="nurserySeedSupplySlot"></div><div id="nurseryWorkerSlot"></div><div id="nurserySeedSearchSlot"></div><div id="nurseryFormSlot"><div class="nursery-copy"><strong>Adapter une graine au sol</strong><p>Consomme 1 graine pionnière et ${RESEARCH_COST} eau de la pépinière.</p></div>${sandInfo}<div class="research-result"><strong>Graine mère : ${SEEDS.pioneer.name}</strong><br><span id="researchPioneerStock">${freePioneerCount}</span> libres</div>${soilSelect}<div class="research-result" id="researchMessage"></div><button class="nursery-action" id="startResearch" type="button">Lancer la recherche</button></div>`;
      content.querySelector<HTMLButtonElement>('#startResearch')?.addEventListener('click', () => {
        const soil = Number(content.querySelector<HTMLSelectElement>('#researchSoil')?.value) as TerrainType;
        const result = this.simulation.startResearch('pioneer', soil);
        if (!result.ok) this.showToast(result.message);
        this.update();
      });
    }
    restoreNurseryFormState(content, formState);
  }

  updateSlot(content, 'nurseryWaterSlot', waterSummary);
  updateSlot(content, 'nurserySeedSupplySlot', seedSupplySummary);
  const workerChanged = updateSlot(content, 'nurseryWorkerSlot', this.buildWorkerPanel());
  const seedSearchChanged = updateSlot(content, 'nurserySeedSearchSlot', seedSearchAction);
  if (workerChanged) this.bindZoneButtons(content);
  if (seedSearchChanged) this.bindSeedSearchButton(content);
  refreshNurseryFormAvailability(this, content);

  if (this.nurseryMode === 'research') {
    const message = !soils.length
      ? sandKnown ? 'Aucun autre sol découvert ne donne une nouvelle variété pour le moment.' : 'Aucun sol spécial découvert ne donne une nouvelle variété pour le moment.'
      : freePioneerCount <= 0
        ? 'Aucune graine pionnière disponible pour servir de base.'
        : 'Une variété adaptée sera révélée à la fin.';
    const stock = content.querySelector<HTMLElement>('#researchPioneerStock');
    if (stock) stock.textContent = String(freePioneerCount);
    const messageNode = content.querySelector<HTMLElement>('#researchMessage');
    if (messageNode) messageNode.textContent = message;
  }
}

export function buildWorkerPanel(this: UIContext): string {
  const worker = this.simulation.nurseryWorker;
  const summaries = this.simulation.getPlantingZoneSummaries();
  const scanSummaries = this.simulation.getScanZoneSummaries();
  const workerText = worker ? this.workerStateLabel(worker.state, worker.message) : 'Aucun robot actif';
  const cargo = worker
    ? SEED_ORDER.filter((seed) => (worker.seedLoad[seed] ?? 0) > 0).map((seed) => `${SEEDS[seed].icon} ${worker.seedLoad[seed]} ${SEEDS[seed].name}`).join(' · ')
    : '';
  const cargoRow = cargo ? `<div class="research-result"><strong>Cargaison</strong><br>${cargo}</div>` : '';
  const scanRows = scanSummaries.map((zone) => {
    const progress = Math.round(Math.min(1, zone.progress / zone.duration) * 100);
    const remaining = Math.max(0, Math.ceil(zone.duration - zone.progress));
    const blocked = zone.blockedReason ? ` · bloqué: ${zone.blockedReason}` : '';
    return `<div class="zone-row scan-zone-row"><span class="zone-icon">${SCAN_ICON}</span><p><strong>Scan robot #${zone.id}</strong><small>${progress}% · ${remaining} s · ${zone.totalCells} tuiles${blocked}</small></p></div>`;
  }).join('');
  const rows = summaries.length
    ? summaries.map((zone) => {
      const blocked = zone.blockedReason ? ` · ${zone.blockedReason}` : '';
      return `<div class="zone-row ${zone.active ? '' : 'is-paused'}"><span class="zone-icon">${SEEDS[zone.seed].icon}</span><p><strong>${SEEDS[zone.seed].name}</strong><small>${zone.readyCells} prêtes · ${zone.plantedCells} plantées · ${zone.blockedCells} bloquées${blocked}</small></p><button type="button" data-zone-toggle="${zone.id}">${zone.active ? 'Pause' : 'Reprendre'}</button><button type="button" data-zone-clear="${zone.id}">Vider</button></div>`;
    }).join('')
    : '<div class="zone-empty">Sélectionnez une graine dans le dock puis peignez une zone sur la carte.</div>';
  return `<div class="worker-panel"><div class="worker-status"><span class="worker-dot"></span><span><strong>Robot pépiniériste</strong><small>${workerText}</small></span></div>${cargoRow}<div class="zone-list">${scanRows}${rows}</div></div>`;
}

export function buildNurserySeedSupplySummary(this: UIContext): string {
  const nursery = this.simulation.getSelectedBuilding();
  if (!nursery || nursery.type !== 'nursery') return '';
  const stockRows = SEED_ORDER
    .filter((seed) => this.simulation.seedCount(seed) > 0 || this.simulation.getReservedSeedCount(seed, nursery.id) > 0)
    .map((seed) => `<div class="zone-row"><span class="zone-icon">${SEEDS[seed].icon}</span><p><strong>${SEEDS[seed].name}</strong><small>${this.simulation.getFreeNurserySeedCount(seed, nursery.id)} libres · ${this.simulation.getReservedSeedCount(seed, nursery.id)} réservées · ${this.simulation.seedCount(seed)} total</small></p></div>`)
    .join('');
  const requests = this.simulation.getSeedRequestsForNursery(nursery.id).filter((request) => ['pending', 'reserved', 'in_delivery', 'partially_delivered', 'blocked'].includes(request.status));
  const requestRows = requests.map((request) => {
    const house = this.simulation.getRobotHouseBuilding(request.homeBuildingId);
    const task = this.simulation.tasks.find((candidate) => candidate.type === 'deliver_seeds' && candidate.seedRequestId === request.id && ['available', 'reserved', 'in-progress', 'blocked'].includes(candidate.state));
    const distance = house ? Math.round(Math.hypot(nursery.gx - house.gx, nursery.gy - house.gy)) : null;
    const target = house ? `maison #${house.id}${distance !== null ? ` · ${distance} cases` : ''}` : 'maison introuvable';
    const taskLabel = task ? ` · tâche ${task.state === 'in-progress' ? 'en cours' : task.state === 'reserved' ? 'réservée' : task.state === 'blocked' ? 'bloquée' : 'prête'}` : request.status === 'reserved' ? ' · tâche à recréer' : '';
    const blocked = request.blockedReason ? ` · ${request.blockedReason}` : task?.blockedReason ? ` · ${task.blockedReason}` : '';
    return `<div class="zone-row"><span class="zone-icon">${SEEDS[request.seed].icon}</span><p><strong>${REQUEST_LABELS[request.status]} · ${target}</strong><small>${SEEDS[request.seed].name} · demandées ${request.quantityRequested} · réservées ${request.quantityReserved} · livrées ${request.quantityDelivered}${taskLabel}${blocked}</small></p></div>`;
  }).join('');
  const stockBlock = stockRows ? `<div class="worker-panel"><strong>Stock de graines</strong><div class="zone-list">${stockRows}</div></div>` : '';
  const requestBlock = requestRows ? `<div class="worker-panel"><strong>Demandes de maisons</strong><div class="zone-list">${requestRows}</div></div>` : '';
  return `${stockBlock}${requestBlock}`;
}

export function buildNurseryWaterSummary(this: UIContext): string {
  const building = this.simulation.getSelectedBuilding();
  const water = building?.type === 'nursery' ? this.simulation.getBuildingWaterStatus(building) : null;
  if (!water) return '';
  return `<div class="research-result"><strong>${water.label} : ${Math.floor(water.current)}/${water.capacity}</strong><br>${water.detail}</div>`;
}

export function buildSeedSearchAction(this: UIContext): string {
  if (!this.simulation.hasNursery() || this.simulation.getFreeNurserySeedCount('pioneer') > 0) return '';
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
  if (state === 'to-seed-load') return message || 'Va charger des graines';
  if (state === 'loading-seeds') return message || 'Charge des graines';
  if (state === 'to-seed-delivery') return message || 'Livre des graines';
  if (state === 'unloading-seeds') return message || 'Dépose des graines';
  if (state === 'returning-seeds') return message || 'Rapporte les graines';
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
  buildNurserySeedSupplySummary,
  buildNurseryWaterSummary,
  buildSeedSearchAction,
  bindSeedSearchButton,
  workerStateLabel,
  bindZoneButtons,
};
