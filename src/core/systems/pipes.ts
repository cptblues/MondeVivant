import { BUILDINGS } from '../config';
import { CISTERN_CAPACITY, CISTERN_SOURCE_MIN_WATER, NURSERY_CAPACITY, OUTLET_IRRIGATION, PRESSURE_HYSTERESIS_MARGIN, PUMP_IRRIGATION_RADIUS } from '../gameConfig';
import type { PipeCell, PipeSource, PipeSourceType, PlacementResult, PressureLevel } from '../types';
import type { SimulationContext } from '../simulationContext';
import { clamp } from '../../utils/math';

export function validatePipeClick(this: SimulationContext, gx: number, gy: number): PlacementResult {
  if (!this.isPipeUnlocked()) return { ok: false, message: 'Installez d’abord une pompe' };
  if (!this.pipeSource) {
    const source = this.getPipeSourceAt(gx, gy);
    const building = this.buildings.find((candidate) => candidate.gx === gx && candidate.gy === gy);
    if (!source && building?.type === 'cistern') return { ok: false, message: `Cette cuve doit contenir au moins ${CISTERN_SOURCE_MIN_WATER} 💧` };
    if (!source) return { ok: false, message: 'Cliquez sur une pompe, une cuve remplie ou un tuyau existant' };
    if (source.anchorLabel === 'segment') return { ok: true, message: 'Continuer ce tuyau' };
    return { ok: true, message: source.type === 'pump' ? 'Utiliser cette pompe comme source' : 'Utiliser cette cuve comme source' };
  }
  const preview = this.findPipePath(this.pipeSource, gx, gy);
  if (!preview.ok) return { ok: false, message: preview.message };
  return { ok: true, message: `Tracer automatiquement ${preview.path.length - 1} cases de tuyau` };
}

export function handlePipeToolClick(this: SimulationContext, gx: number, gy: number): PlacementResult {
  const validation = this.validatePipeClick(gx, gy);
  if (!validation.ok) { this.toast(validation.message); return validation; }
  if (!this.pipeSource) {
    const source = this.getPipeSourceAt(gx, gy);
    if (!source) return { ok: false, message: 'Source introuvable' };
    this.pipeSource = source;
    this.completedTutorialSteps.add('choose-pump');
    const sourceLabel = source.anchorLabel === 'segment' ? 'Segment de tuyau' : source.type === 'pump' ? 'Pompe' : 'Cuve';
    this.addLog(`${sourceLabel} sélectionné : choisissez maintenant la destination du tuyau.`);
    this.toast(source.anchorLabel === 'segment' ? 'Tuyau sélectionné' : source.type === 'pump' ? 'Pompe sélectionnée' : 'Cuve sélectionnée');
    this.notify();
    return validation;
  }
  this.addPipeRoute(this.pipeSource, gx, gy);
  this.completedTutorialSteps.add('trace-pipe');
  this.addLog('Une nouvelle conduite a été tracée automatiquement jusqu’à la destination.');
  this.toast('Tuyau installé');
  this.notify();
  return validation;
}

export function getPipePreview(this: SimulationContext, gx: number, gy: number): { ok: boolean; message: string; path: Array<{ x: number; y: number }> } {
  if (!this.pipeSource) return { ok: false, message: 'Sélectionnez une source ou un tuyau', path: [] };
  return this.findPipePath(this.pipeSource, gx, gy);
}

export function createOutletAtSelectedPipe(this: SimulationContext): boolean {
  const pipe = this.getSelectedPipe();
  if (!pipe) return false;
  if (pipe.outlet) return true;
  pipe.outlet = true;
  pipe.outletOpen = false;
  this.completedTutorialSteps.add('create-outlet');
  this.addLog('Une sortie d’eau fermée a été ajoutée sur le tuyau.');
  this.toast('Sortie créée — elle est fermée');
  this.currentFields = this.computeFields();
  this.notify();
  return true;
}

export function toggleSelectedOutlet(this: SimulationContext): boolean {
  const pipe = this.getSelectedPipe();
  if (!pipe?.outlet) return false;
  pipe.outletOpen = !pipe.outletOpen;
  if (pipe.outletOpen) this.completedTutorialSteps.add('open-outlet');
  this.addLog(`La sortie d’eau a été <b>${pipe.outletOpen ? 'ouverte' : 'fermée'}</b>.`);
  this.toast(pipe.outletOpen ? 'Sortie ouverte' : 'Sortie fermée');
  this.currentFields = this.computeFields();
  this.notify();
  return true;
}

export function removeSelectedOutlet(this: SimulationContext): boolean {
  const pipe = this.getSelectedPipe();
  if (!pipe?.outlet) return false;
  pipe.outlet = false;
  pipe.outletOpen = false;
  this.addLog('La sortie d’eau a été retirée, le tuyau reste en place.');
  this.toast('Sortie retirée');
  this.currentFields = this.computeFields();
  this.notify();
  return true;
}

export function removeSelectedPipeSegment(this: SimulationContext): boolean {
  const pipe = this.getSelectedPipe();
  if (!pipe) return false;
  const source: PipeSource = { type: pipe.sourceType, id: pipe.sourceId };
  const removedKey = this.pipeKey(pipe.gx, pipe.gy);
  const before = this.pipes.length;
  this.pipes = this.pipes.filter((candidate) => this.pipeKey(candidate.gx, candidate.gy) !== removedKey);
  const reachable = this.getReachablePipeKeys(source);
  this.pipes = this.pipes.filter((candidate) => !this.isPipeFromSource(candidate, source) || reachable.has(this.pipeKey(candidate.gx, candidate.gy)));
  this.recomputePipeDistances(source);
  const removed = before - this.pipes.length;
  this.selectedTarget = null;
  this.pipeSource = null;
  this.addLog(`${removed} segment${removed > 1 ? 's' : ''} de tuyau retiré${removed > 1 ? 's' : ''}.`);
  this.toast('Tuyau retiré');
  this.currentFields = this.computeFields();
  this.notify();
  return true;
}

export function clearPipeNetwork(this: SimulationContext, sourceType: PipeSourceType, sourceId: number): boolean {
  const before = this.pipes.length;
  this.pipes = this.pipes.filter((pipe) => pipe.sourceType !== sourceType || pipe.sourceId !== sourceId);
  if (before === this.pipes.length) return false;
  this.selectedTarget = null;
  this.addLog(sourceType === 'pump' ? 'Le réseau de tuyaux de la pompe a été démonté.' : 'Le réseau secondaire de la cuve a été démonté.');
  this.toast('Réseau démonté');
  this.currentFields = this.computeFields();
  this.notify();
  return true;
}

export function getPressureLevelAt(this: SimulationContext, gx: number, gy: number): PressureLevel {
  const pipe = this.getPipeCell(gx, gy);
  if (!pipe) return 'none';
  const score = this.getPressureScore(pipe);
  const previousLevel = pipe.pressureLevel === 'none' && score >= 12 ? undefined : pipe.pressureLevel;
  pipe.pressureLevel = this.pressureLevelFromScore(score, previousLevel);
  return pipe.pressureLevel;
}

export function getPressureLabel(this: SimulationContext, level: PressureLevel): string {
  return level === 'strong' ? 'Forte' : level === 'medium' ? 'Moyenne' : level === 'weak' ? 'Faible' : 'Aucune';
}

export function getIrrigatedCells(this: SimulationContext, pipe: PipeCell): number[] {
  if (!pipe.outlet || !pipe.outletOpen) return [];
  const level = this.getPressureLevelAt(pipe.gx, pipe.gy);
  return this.getIrrigatedCellsForLevel(pipe.gx, pipe.gy, level);
}

export function getPumpIrrigatedCells(this: SimulationContext, gx: number, gy: number): number[] {
  return this.getCellsInRadius(gx, gy, PUMP_IRRIGATION_RADIUS);
}

export function getOutletPreview(this: SimulationContext, gx: number, gy: number): { level: PressureLevel; cells: number[] } {
  const pipe = this.getPipeCell(gx, gy);
  if (!pipe) return { level: 'none', cells: [] };
  const extraOpenOutlet = pipe.outlet && pipe.outletOpen ? 0 : 1;
  const score = this.getPressureScore(pipe, extraOpenOutlet);
  const previousLevel = pipe.pressureLevel === 'none' && score >= 12 ? undefined : pipe.pressureLevel;
  const level = this.pressureLevelFromScore(score, previousLevel);
  return { level, cells: this.getIrrigatedCellsForLevel(gx, gy, level) };
}

export function getIrrigatedCellsForLevel(this: SimulationContext, gx: number, gy: number, level: PressureLevel): number[] {
  return this.getCellsInRadius(gx, gy, OUTLET_IRRIGATION[level].radius);
}

export function drainCisternOutlets(this: SimulationContext, dt: number): void {
  for (const pipe of this.pipes) {
    if (pipe.sourceType !== 'cistern' || !pipe.outlet || !pipe.outletOpen) continue;
    const cistern = this.getPipeSourceBuilding(pipe);
    if (!cistern || cistern.type !== 'cistern') continue;
    cistern.waterStored = Math.max(0, cistern.waterStored - this.getOutletConsumptionRate(pipe) * dt);
  }
}

export function updateBuildingsFromPipes(this: SimulationContext, dt: number): void {
  let becameReady = false;
  for (const cistern of this.buildings) {
    if (cistern.type !== 'cistern' || cistern.waterStored >= CISTERN_CAPACITY || this.waterResource <= 0.05) continue;
    const pipe = this.getPipeCell(cistern.gx, cistern.gy);
    if (!pipe || pipe.sourceType !== 'pump') continue;
    const bestLevel = this.getPressureLevelAt(pipe.gx, pipe.gy);
    const fillRate = this.getCisternPipeFillRate(bestLevel);
    if (fillRate <= 0) continue;
    const before = cistern.waterStored;
    const amount = Math.min(fillRate * dt, CISTERN_CAPACITY - cistern.waterStored, this.waterResource);
    cistern.waterStored += amount;
    this.waterResource -= amount;
    if (before < CISTERN_SOURCE_MIN_WATER && cistern.waterStored >= CISTERN_SOURCE_MIN_WATER) becameReady = true;
  }
  let nurseryFilled = false;
  for (const nursery of this.buildings) {
    if (nursery.type !== 'nursery' || nursery.waterStored >= NURSERY_CAPACITY) continue;
    const pipe = this.getPipeCell(nursery.gx, nursery.gy);
    if (!pipe) continue;
    const bestLevel = this.getPressureLevelAt(pipe.gx, pipe.gy);
    const fillRate = this.getNurseryPipeFillRate(bestLevel);
    if (fillRate <= 0) continue;
    const available = this.getSourceWater(pipe);
    if (available <= 0.05) continue;
    const amount = Math.min(fillRate * dt, NURSERY_CAPACITY - nursery.waterStored, available);
    if (amount <= 0) continue;
    nursery.waterStored += amount;
    this.consumeSourceWater(pipe, amount);
    nurseryFilled = true;
  }
  if (becameReady && !this.milestones.has('cistern-ready')) {
    this.milestones.add('cistern-ready');
    this.completedTutorialSteps.add('fill-cistern');
    this.addLog('Une <b>cuve relais</b> contient assez d’eau pour alimenter un réseau secondaire.');
    this.toast('Cuve prête comme source');
    this.notify();
  }
  if (nurseryFilled) this.wakeNurseryWorker();
}

export function getCisternPipeFillRate(this: SimulationContext, level: PressureLevel): number {
  if (level === 'strong') return 4;
  if (level === 'medium') return 2.35;
  if (level === 'weak') return 1.05;
  return 0;
}

export function getNurseryPipeFillRate(this: SimulationContext, level: PressureLevel): number {
  if (level === 'strong') return 2.8;
  if (level === 'medium') return 1.65;
  if (level === 'weak') return 0.75;
  return 0;
}

export function consumeSourceWater(this: SimulationContext, source: PipeSource | PipeCell, amount: number): void {
  const sourceType = 'sourceType' in source ? source.sourceType : source.type;
  if (sourceType === 'pump') {
    this.waterResource = Math.max(0, this.waterResource - amount);
    return;
  }
  const sourceBuilding = this.getPipeSourceBuilding(source);
  if (sourceBuilding?.type === 'cistern') sourceBuilding.waterStored = Math.max(0, sourceBuilding.waterStored - amount);
}

export function getWaterProduction(this: SimulationContext): number {
  return this.buildings.filter((building) => building.type === 'pump').length * (BUILDINGS.pump.effects.resourceRate ?? 0);
}

export function getWaterConsumption(this: SimulationContext): number {
  let total = 0;
  for (const pipe of this.pipes) {
    if (!pipe.outlet || !pipe.outletOpen) continue;
    if (pipe.sourceType !== 'pump') continue;
    total += this.getOutletConsumptionRate(pipe);
  }
  return total;
}

export function getPressureScore(this: SimulationContext, pipe: PipeCell, extraOpenOutlets = 0): number {
  const sourceBuilding = this.getPipeSourceBuilding(pipe);
  const sourceWater = this.getSourceWater(pipe);
  if (!sourceBuilding || sourceWater <= 0.25) return 0;
  const path = this.getPipePathFromSource(pipe);
  if (!path.length) return 0;
  const upstreamOpenOutlets = path.slice(0, -1).filter((candidate) => candidate.outlet && candidate.outletOpen).length;
  const networkOpenOutlets = this.pipes.filter((candidate) => this.isPipeFromSource(candidate, pipe) && candidate.outlet && candidate.outletOpen).length + extraOpenOutlets;
  const branchPenalty = this.countBranches(pipe.sourceType, pipe.sourceId) * 3;
  const resourceFactor = pipe.sourceType === 'cistern'
    ? clamp(sourceWater / CISTERN_SOURCE_MIN_WATER, 0.2, 1)
    : clamp(sourceWater / 8, 0.25, 1);
  const distancePenalty = pipe.sourceType === 'cistern' ? 6 : 5;
  const upstreamOutletPenalty = pipe.sourceType === 'cistern' ? 36 : 32;
  const sharedOutletPenalty = pipe.sourceType === 'cistern' ? 10 : 8;
  return Math.max(0, (100
    - pipe.distance * distancePenalty
    - upstreamOpenOutlets * upstreamOutletPenalty
    - Math.max(0, networkOpenOutlets - 1) * sharedOutletPenalty
    - branchPenalty) * resourceFactor);
}

export function pressureLevelFromScore(this: SimulationContext, score: number, previousLevel?: PressureLevel): PressureLevel {
  if (previousLevel === 'strong') {
    if (score >= 65 - PRESSURE_HYSTERESIS_MARGIN) return 'strong';
    if (score >= 38 - PRESSURE_HYSTERESIS_MARGIN) return 'medium';
    if (score >= 12 - PRESSURE_HYSTERESIS_MARGIN) return 'weak';
    return 'none';
  }
  if (previousLevel === 'medium') {
    if (score >= 65 + PRESSURE_HYSTERESIS_MARGIN) return 'strong';
    if (score >= 38 - PRESSURE_HYSTERESIS_MARGIN) return 'medium';
    if (score >= 12 - PRESSURE_HYSTERESIS_MARGIN) return 'weak';
    return 'none';
  }
  if (previousLevel === 'weak') {
    if (score >= 65 + PRESSURE_HYSTERESIS_MARGIN) return 'strong';
    if (score >= 38 + PRESSURE_HYSTERESIS_MARGIN) return 'medium';
    if (score >= 12 - PRESSURE_HYSTERESIS_MARGIN) return 'weak';
    return 'none';
  }
  if (previousLevel === 'none') {
    if (score >= 65 + PRESSURE_HYSTERESIS_MARGIN) return 'strong';
    if (score >= 38 + PRESSURE_HYSTERESIS_MARGIN) return 'medium';
    if (score >= 12 + PRESSURE_HYSTERESIS_MARGIN) return 'weak';
    return 'none';
  }
  if (score >= 65) return 'strong';
  if (score >= 38) return 'medium';
  if (score >= 12) return 'weak';
  return 'none';
}

export function getOutletConsumptionRate(this: SimulationContext, pipe: PipeCell): number {
  const level = this.getPressureLevelAt(pipe.gx, pipe.gy);
  return level === 'strong' ? 0.82 : level === 'medium' ? 0.5 : level === 'weak' ? 0.22 : 0;
}

export function getSourceWater(this: SimulationContext, source: PipeSource | PipeCell): number {
  const sourceType = 'sourceType' in source ? source.sourceType : source.type;
  if (sourceType === 'pump') return this.waterResource;
  const cistern = this.getPipeSourceBuilding(source);
  return cistern?.type === 'cistern' ? cistern.waterStored : 0;
}

export const pipesMethods = {
  validatePipeClick,
  handlePipeToolClick,
  getPipePreview,
  createOutletAtSelectedPipe,
  toggleSelectedOutlet,
  removeSelectedOutlet,
  removeSelectedPipeSegment,
  clearPipeNetwork,
  getPressureLevelAt,
  getPressureLabel,
  getIrrigatedCells,
  getPumpIrrigatedCells,
  getOutletPreview,
  getIrrigatedCellsForLevel,
  drainCisternOutlets,
  updateBuildingsFromPipes,
  getCisternPipeFillRate,
  getNurseryPipeFillRate,
  consumeSourceWater,
  getWaterProduction,
  getWaterConsumption,
  getPressureScore,
  pressureLevelFromScore,
  getOutletConsumptionRate,
  getSourceWater,
};
