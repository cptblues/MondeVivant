import { BUILDINGS, SEEDS } from '../../core/config';
import { CELL_SIZE, GRID_HEIGHT, GRID_WIDTH } from '../../core/types';
import type { BuildingInstance } from '../../core/types';
import type { GameSimulation } from '../../core/GameSimulation';
import type { RendererContext } from '../renderContext';
import { clamp, hash, indexOf } from '../../utils/math';

export function drawTrees(this: RendererContext, simulation: GameSimulation): void {
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const cell = simulation.cells[indexOf(x, y, GRID_WIDTH)];
      if (cell.tree) this.drawTree((x + 0.5) * CELL_SIZE, (y + 0.65) * CELL_SIZE, cell.tree, cell.treeStage, x, y, cell.treeOrigin === 'natural');
    }
  }
}

export function drawTreeStatus(this: RendererContext, simulation: GameSimulation): void {
  const ctx = this.context;
  ctx.save();
  ctx.lineCap = 'round';
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const cell = simulation.cells[indexOf(x, y, GRID_WIDTH)];
      if (!cell.tree || cell.treeStage >= 3) continue;
      const cx = (x + 0.5) * CELL_SIZE;
      const cy = (y + 0.28) * CELL_SIZE;
      ctx.strokeStyle = cell.treeStress > 4 ? 'rgba(172, 85, 55, .82)' : 'rgba(244, 250, 232, .9)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 8.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(cell.treeProgress, 0, 1));
      ctx.stroke();
      if (cell.treeStress > 8) {
        ctx.fillStyle = '#fff6ea';
        ctx.strokeStyle = 'rgba(164, 77, 61, .92)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(cx + 10, cy - 5, 5.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(164, 77, 61, .95)';
        ctx.font = '800 8px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', cx + 10, cy - 5.3);
      }
    }
  }
  ctx.restore();
}

export function drawTree(this: RendererContext, px: number, py: number, seed: keyof typeof SEEDS, stage: number, x: number, y: number, natural: boolean): void {
  const ctx = this.context;
  const scale = [0.45, 0.65, 0.85, 1.15][stage];
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = 'rgba(46, 40, 27, .2)';
  ctx.beginPath();
  ctx.ellipse(2, 7, 12 * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  if (stage === 0) {
    ctx.strokeStyle = '#58733d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.quadraticCurveTo(-1, 0, 1, -7);
    ctx.stroke();
    ctx.fillStyle = natural ? '#a5c96c' : '#73a351';
    ctx.beginPath();
    ctx.ellipse(5, -5, 5, 2.5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    if (natural) {
      ctx.fillStyle = '#f2e4a0';
      ctx.beginPath(); ctx.arc(-3, -2, 1.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#6e5135';
  const trunkW = 4.5 * scale;
  const trunkH = 19 * scale;
  ctx.beginPath();
  ctx.moveTo(-trunkW, 5); ctx.lineTo(-trunkW * 0.55, -trunkH); ctx.lineTo(trunkW * 0.55, -trunkH); ctx.lineTo(trunkW, 5); ctx.closePath(); ctx.fill();
  const palettes: Record<string, string[]> = {
    pioneer: ['#477d48', '#5c9552', '#70a85d'], willow: ['#4e8755', '#6aa568', '#80b576'],
    juniper: ['#3f7654', '#4f8960', '#68996d'], tamarisk: ['#4d805d', '#6d9c6d', '#87ac78'],
  };
  const colors = palettes[seed];
  const crownY = -trunkH - 3 * scale;
  const crownW = (seed === 'willow' ? 17 : seed === 'juniper' ? 14 : 16) * scale;
  const crownH = (seed === 'willow' ? 18 : seed === 'juniper' ? 11 : 14) * scale;
  for (let j = 0; j < 7; j += 1) {
    const angle = (j / 7) * Math.PI * 2;
    const ox = Math.cos(angle) * crownW * 0.5 + (hash(x, y, 100 + j) - 0.5) * 4;
    const oy = Math.sin(angle) * crownH * 0.35 + (hash(y, x, 110 + j) - 0.5) * 3;
    ctx.fillStyle = colors[j % colors.length];
    ctx.beginPath();
    ctx.ellipse(ox, crownY + oy, crownW * 0.48, crownH * 0.45, hash(j, x, y) * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (stage < 3) {
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    ctx.font = '700 8px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(stage === 1 ? 'I' : 'II', 0, -trunkH - crownH - 5);
  }
  ctx.restore();
}

export function drawBuildings(this: RendererContext, simulation: GameSimulation): void {
  for (const building of simulation.buildings) this.drawBuilding(simulation, building);
}

export function drawBuilding(this: RendererContext, simulation: GameSimulation, building: BuildingInstance): void {
  const ctx = this.context;
  const definition = BUILDINGS[building.type];
  const px = (building.gx + 0.5) * CELL_SIZE;
  const py = (building.gy + 0.58) * CELL_SIZE;
  const selected = simulation.selectedTarget?.kind === 'building' && simulation.selectedTarget.id === building.id;
  const pipeSource = simulation.pipeSource?.id === building.id && simulation.pipeSource.type === building.type;
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = 'rgba(47, 38, 25, .22)';
  ctx.beginPath(); ctx.ellipse(0, 8, 15, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = selected || pipeSource ? '#2f7951' : '#fffaf0';
  ctx.strokeStyle = pipeSource ? '#3e9ee0' : selected ? '#1f5f3d' : 'rgba(77, 63, 39, .22)';
  ctx.lineWidth = selected || pipeSource ? 2.4 : 1.2;
  this.roundedRect(-14, -16, 28, 28, 8); ctx.fill(); ctx.stroke();
  ctx.font = '18px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(definition.icon, 0, -1);
  if (building.type === 'scanner' && !building.scanComplete) {
    ctx.strokeStyle = 'rgba(73, 154, 122, .72)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -1, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * building.scanProgress); ctx.stroke();
  }
  if (building.type === 'nursery' && simulation.nurseryJob) {
    ctx.fillStyle = '#2d6f4a'; ctx.fillRect(-13, 17, 26, 3.5);
    ctx.fillStyle = '#8dc16c'; ctx.fillRect(-13, 17, 26 * simulation.nurseryJob.progress, 3.5);
  }
  const waterStatus = simulation.getBuildingWaterStatus(building);
  if (waterStatus) this.drawBuildingWaterGauge(waterStatus.fill);
  if (building.type === 'cistern') {
    const capacity = BUILDINGS.cistern.capacity ?? 1;
    const fill = clamp(building.waterStored / capacity, 0, 1);
    const directPipe = simulation.getPipeCell(building.gx, building.gy)?.sourceType === 'pump';
    ctx.fillStyle = '#283f4a';
    this.roundedRect(-13, 17, 26, 3.5, 2);
    ctx.fill();
    if (fill > 0.01) {
      ctx.fillStyle = fill >= 0.17 ? '#57a1d5' : '#9ec2d2';
      this.roundedRect(-13, 17, 26 * fill, 3.5, 2);
      ctx.fill();
    }
    if (directPipe) this.drawPipeConnectorDot();
  }
  if (building.type === 'nursery' && simulation.getPipeCell(building.gx, building.gy)) {
    this.drawPipeConnectorDot();
  }
  ctx.restore();
}

export function drawBuildingWaterGauge(this: RendererContext, fill: number): void {
  const ctx = this.context;
  const clamped = clamp(fill, 0, 1);
  ctx.save();
  ctx.fillStyle = '#243f4b';
  this.roundedRect(16, -14, 4.5, 27, 2.5);
  ctx.fill();
  ctx.fillStyle = clamped > 0.18 ? '#57a1d5' : '#9ec2d2';
  const filledHeight = 23 * clamped;
  this.roundedRect(17, 11 - filledHeight, 2.5, filledHeight, 2);
  ctx.fill();
  ctx.restore();
}

export function drawPipeConnectorDot(this: RendererContext): void {
  const ctx = this.context;
  ctx.fillStyle = '#f6fbff';
  ctx.strokeStyle = '#2476c9';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(10, 10, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2476c9';
  ctx.beginPath();
  ctx.arc(10, 10, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

export function drawNurseryWorker(this: RendererContext, simulation: GameSimulation): void {
  const worker = simulation.nurseryWorker;
  if (!worker) return;
  const ctx = this.context;
  const px = worker.x * CELL_SIZE;
  const py = worker.y * CELL_SIZE;
  const targetSeed = worker.targetSeed;
  const nursery = simulation.buildings.find((building) => building.type === 'nursery');
  const pump = simulation.buildings.find((building) => building.type === 'pump');
  const waterBuilding = worker.targetBuildingId !== null
    ? simulation.buildings.find((building) => building.id === worker.targetBuildingId)
    : null;
  const waterTarget = worker.state === 'to-pump' || worker.state === 'loading-water'
    ? pump
    : worker.state === 'to-nursery' || worker.state === 'unloading-water'
      ? waterBuilding ?? nursery
      : null;
  if (waterTarget) {
    const tx = (waterTarget.gx + 0.5) * CELL_SIZE;
    const ty = (waterTarget.gy + 0.5) * CELL_SIZE;
    ctx.save();
    ctx.strokeStyle = 'rgba(54, 119, 168, .42)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
  }
  if (worker.targetIndex !== null) {
    const tx = ((worker.targetIndex % GRID_WIDTH) + 0.5) * CELL_SIZE;
    const ty = (Math.floor(worker.targetIndex / GRID_WIDTH) + 0.5) * CELL_SIZE;
    ctx.save();
    ctx.strokeStyle = targetSeed ? `rgba(${this.seedZoneColor(targetSeed)}, .42)` : 'rgba(55, 92, 75, .3)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
  }
  const accent = worker.waterLoad > 0.1 || worker.state.includes('water') || worker.state === 'to-pump' || worker.state === 'to-nursery'
    ? '#3177a8'
    : targetSeed ? `rgb(${this.seedZoneColor(targetSeed)})` : '#34724f';
  const progress = worker.state === 'planting' || worker.state === 'scanning' || worker.state === 'searching-seed' || worker.state === 'loading-water' || worker.state === 'unloading-water' ? worker.progress : null;
  this.drawRobot(px, py, accent, worker.state === 'blocked', progress, worker.waterLoad > 0.1);
}

export function drawCarrierWorker(this: RendererContext, simulation: GameSimulation): void {
  const worker = simulation.carrierWorker;
  if (!worker) return;
  const ctx = this.context;
  const px = worker.x * CELL_SIZE;
  const py = worker.y * CELL_SIZE;
  const pump = simulation.buildings.find((building) => building.type === 'pump');
  const cistern = worker.targetCisternId ? simulation.buildings.find((building) => building.id === worker.targetCisternId && building.type === 'cistern') : null;
  const target = worker.state === 'to-pump' || worker.state === 'loading' ? pump : cistern;
  if (target) {
    const tx = (target.gx + 0.5) * CELL_SIZE;
    const ty = (target.gy + 0.5) * CELL_SIZE;
    ctx.save();
    ctx.strokeStyle = 'rgba(54, 119, 168, .42)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.restore();
  }
  const progress = worker.state === 'loading' || worker.state === 'unloading' ? worker.progress : null;
  this.drawRobot(px, py, '#3177a8', worker.state === 'blocked', progress, worker.waterLoad > 0.1);
}

export function drawRobot(this: RendererContext, px: number, py: number, accent: string, blocked: boolean, progress: number | null, carryingWater: boolean): void {
  const ctx = this.context;
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(0.76, 0.76);
  ctx.fillStyle = 'rgba(43, 34, 22, .22)';
  ctx.beginPath();
  ctx.ellipse(1, 7, 6.5, 2.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = blocked ? '#a86643' : accent;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.fillStyle = blocked ? '#ead0b7' : '#fff7df';
  this.roundedRect(-4.8, -7.6, 9.6, 6.6, 2.2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, -7.6);
  ctx.lineTo(0, -10.2);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, -10.8, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#263f3a';
  ctx.beginPath();
  ctx.arc(-1.9, -4.7, 0.8, 0, Math.PI * 2);
  ctx.arc(1.9, -4.7, 0.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = blocked ? '#d39b67' : '#e9f0e4';
  this.roundedRect(-5.8, -1.3, 11.6, 7.5, 2.2);
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.18;
  this.roundedRect(-2.8, 1, 5.6, 2.9, 1.2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = accent;
  ctx.beginPath();
  ctx.moveTo(-5.8, 1.5);
  ctx.lineTo(-8, 3.6);
  ctx.moveTo(5.8, 1.5);
  ctx.lineTo(8, 3.6);
  ctx.stroke();

  ctx.fillStyle = '#2f403d';
  ctx.beginPath();
  ctx.arc(-3.5, 6.8, 1.6, 0, Math.PI * 2);
  ctx.arc(3.5, 6.8, 1.6, 0, Math.PI * 2);
  ctx.fill();

  if (carryingWater) {
    ctx.fillStyle = '#5aa8d0';
    ctx.strokeStyle = '#236b9c';
    this.roundedRect(6.2, -2.5, 4.8, 6.5, 1.5);
    ctx.fill();
    ctx.stroke();
  }

  if (progress !== null) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, -0.8, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }
  ctx.restore();
}

export const entitiesRenderMethods = {
  drawTrees,
  drawTreeStatus,
  drawTree,
  drawBuildings,
  drawBuilding,
  drawBuildingWaterGauge,
  drawPipeConnectorDot,
  drawNurseryWorker,
  drawCarrierWorker,
  drawRobot,
};
