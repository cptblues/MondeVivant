import { BUILDINGS, SEEDS } from '../../core/config';
import { CELL_SIZE, GRID_HEIGHT, GRID_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '../../core/types';
import type { GameSimulation } from '../../core/GameSimulation';
import type { HoverState, RendererContext } from '../renderContext';

export function drawScanZones(this: RendererContext, simulation: GameSimulation): void {
  const ctx = this.context;
  if (!simulation.scanZones.length) return;
  ctx.save();
  this.roundedRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 34);
  ctx.clip();
  for (const zone of simulation.scanZones) {
    const progress = Math.min(1, zone.progress / zone.duration);
    for (const index of zone.cells) {
      const x = index % GRID_WIDTH;
      const y = Math.floor(index / GRID_WIDTH);
      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;
      ctx.fillStyle = progress > 0 ? `rgba(82, 146, 170, ${0.12 + progress * 0.14})` : 'rgba(72, 164, 92, .16)';
      ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      ctx.strokeStyle = progress > 0 ? 'rgba(71, 126, 155, .48)' : 'rgba(50, 139, 74, .44)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 3, py + 3, CELL_SIZE - 6, CELL_SIZE - 6);
      ctx.fillStyle = '#fffdf7';
      ctx.beginPath();
      ctx.arc(px + CELL_SIZE - 5, py + 5, 3.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = progress > 0 ? '#397599' : '#2d7450';
      ctx.font = '800 6px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(progress > 0 ? '◦' : '?', px + CELL_SIZE - 5, py + 4.8);
    }
  }
  ctx.restore();
}

export function drawPlantingZones(this: RendererContext, simulation: GameSimulation): void {
  const ctx = this.context;
  ctx.save();
  this.roundedRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 34);
  ctx.clip();
  for (const zone of simulation.plantingZones) {
    const zoneActive = zone.active && simulation.hasNursery();
    const color = this.seedZoneColor(zone.seed);
    const alpha = zoneActive ? 0.2 : 0.08;
    for (const index of zone.cells) {
      const x = index % GRID_WIDTH;
      const y = Math.floor(index / GRID_WIDTH);
      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;
      const state = simulation.getPlantingZoneCellState(zone, index);
      if (state === 'planted') {
        ctx.fillStyle = `rgba(${color}, ${zoneActive ? 0.12 : 0.06})`;
        ctx.fillRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4);
        continue;
      }
      if (state === 'ready') {
        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      } else {
        ctx.fillStyle = zoneActive ? 'rgba(170, 77, 59, .18)' : 'rgba(96, 83, 71, .08)';
        ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
        ctx.strokeStyle = zoneActive ? 'rgba(154, 68, 54, .46)' : 'rgba(86, 76, 66, .22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 3, py + CELL_SIZE - 3);
        ctx.lineTo(px + CELL_SIZE - 3, py + 3);
        ctx.stroke();
      }
      if (zoneActive) this.drawPlantingQueueBadge(px, py, state === 'ready');
    }
  }
  ctx.restore();
}

export function drawPlantingQueueBadge(this: RendererContext, px: number, py: number, ready: boolean): void {
  const ctx = this.context;
  ctx.save();
  ctx.fillStyle = '#fffdf7';
  ctx.strokeStyle = ready ? '#3c8f58' : '#a75648';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(px + CELL_SIZE - 5, py + 5, 4.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ready ? '#2f704a' : '#9b4d40';
  ctx.font = '800 7px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('•', px + CELL_SIZE - 5, py + 4.6);
  ctx.restore();
}

export function drawPipeReach(this: RendererContext, simulation: GameSimulation): void {
  const anchor = simulation.getPipeAnchorPoint();
  if (!anchor) return;
  const maxLength = simulation.getPipeSourceMaxLength();
  const ctx = this.context;
  ctx.save();
  ctx.fillStyle = 'rgba(50, 139, 74, .055)';
  ctx.strokeStyle = 'rgba(50, 139, 74, .23)';
  ctx.lineWidth = 1;
  for (let y = Math.max(0, anchor.y - maxLength); y <= Math.min(GRID_HEIGHT - 1, anchor.y + maxLength); y += 1) {
    for (let x = Math.max(0, anchor.x - maxLength); x <= Math.min(GRID_WIDTH - 1, anchor.x + maxLength); x += 1) {
      if (Math.abs(x - anchor.x) + Math.abs(y - anchor.y) > maxLength) continue;
      ctx.fillRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }
  }
  ctx.strokeStyle = 'rgba(50, 139, 74, .7)';
  ctx.beginPath();
  ctx.arc((anchor.x + 0.5) * CELL_SIZE, (anchor.y + 0.5) * CELL_SIZE, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function drawActionCells(this: RendererContext, indices: number[], valid: boolean): void {
  const ctx = this.context;
  const fill = valid ? 'rgba(72, 164, 92, .2)' : 'rgba(191, 73, 62, .18)';
  const stroke = valid ? 'rgba(50, 139, 74, .62)' : 'rgba(174, 58, 51, .66)';
  const set = new Set(indices.map((index) => `${index % GRID_WIDTH},${Math.floor(index / GRID_WIDTH)}`));
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.1;
  for (const index of indices) {
    const x = index % GRID_WIDTH;
    const y = Math.floor(index / GRID_WIDTH);
    ctx.fillRect(x * CELL_SIZE + 1, y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
  }
  for (const index of indices) {
    const x = index % GRID_WIDTH;
    const y = Math.floor(index / GRID_WIDTH);
    const px = x * CELL_SIZE;
    const py = y * CELL_SIZE;
    if (!set.has(`${x - 1},${y}`)) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + CELL_SIZE); ctx.stroke(); }
    if (!set.has(`${x + 1},${y}`)) { ctx.beginPath(); ctx.moveTo(px + CELL_SIZE, py); ctx.lineTo(px + CELL_SIZE, py + CELL_SIZE); ctx.stroke(); }
    if (!set.has(`${x},${y - 1}`)) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + CELL_SIZE, py); ctx.stroke(); }
    if (!set.has(`${x},${y + 1}`)) { ctx.beginPath(); ctx.moveTo(px, py + CELL_SIZE); ctx.lineTo(px + CELL_SIZE, py + CELL_SIZE); ctx.stroke(); }
  }
  ctx.restore();
}

export function drawGrid(this: RendererContext): void {
  const ctx = this.context;
  ctx.save();
  ctx.strokeStyle = 'rgba(56, 74, 58, .15)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let x = 0; x <= GRID_WIDTH; x += 1) { ctx.moveTo(x * CELL_SIZE, 0); ctx.lineTo(x * CELL_SIZE, WORLD_HEIGHT); }
  for (let y = 0; y <= GRID_HEIGHT; y += 1) { ctx.moveTo(0, y * CELL_SIZE); ctx.lineTo(WORLD_WIDTH, y * CELL_SIZE); }
  ctx.stroke();
  ctx.restore();
}

export function drawPlacementPreview(this: RendererContext, simulation: GameSimulation, hover: HoverState): void {
  if (!simulation.selectedTool || !hover.inside) return;
  const cell = this.cellAtWorld(hover.worldX, hover.worldY);
  if (!cell) return;
  const validation = simulation.validateSelected(cell.x, cell.y);
  const ctx = this.context;
  const px = (cell.x + 0.5) * CELL_SIZE;
  const py = (cell.y + 0.5) * CELL_SIZE;
  if (simulation.selectedTool.kind === 'pipe') {
    if (simulation.pipeSource) {
      const preview = simulation.getPipePreview(cell.x, cell.y);
      if (preview.path.length) {
        ctx.save();
        ctx.strokeStyle = preview.ok ? '#3b965b' : '#b84f43';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        preview.path.forEach((point, index) => {
          const x = (point.x + 0.5) * CELL_SIZE;
          const y = (point.y + 0.5) * CELL_SIZE;
          if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.save();
    ctx.strokeStyle = validation.ok ? '#3b965b' : '#b84f43';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cell.x * CELL_SIZE + 2, cell.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    ctx.restore();
    return;
  }
  if (simulation.selectedTool.kind === 'planting-zone') {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = validation.ok ? '#3b965b' : '#b84f43';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cell.x * CELL_SIZE + 2, cell.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = simulation.selectedTool.mode === 'paint' ? '15px "Apple Color Emoji", "Segoe UI Emoji"' : '15px system-ui';
    ctx.fillText(simulation.selectedTool.mode === 'paint' ? SEEDS[simulation.selectedTool.seed].icon : '⌫', px, py);
    ctx.restore();
    return;
  }
  if (simulation.selectedTool.kind === 'scan-zone') {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = validation.ok ? '#3b965b' : '#b84f43';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cell.x * CELL_SIZE + 2, cell.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    ctx.fillStyle = validation.ok ? '#2f704a' : '#9b4d40';
    ctx.font = '800 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', px, py);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.strokeStyle = validation.ok ? '#3b965b' : '#b84f43';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(cell.x * CELL_SIZE + 2, cell.y * CELL_SIZE + 2, CELL_SIZE - 4, CELL_SIZE - 4);
  ctx.font = '22px "Apple Color Emoji", "Segoe UI Emoji"';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(BUILDINGS[simulation.selectedTool.type].icon, px, py);
  ctx.restore();
}

export function drawMapBorder(this: RendererContext): void {
  const ctx = this.context;
  ctx.save();
  ctx.strokeStyle = 'rgba(81, 63, 34, .28)';
  ctx.lineWidth = 3;
  this.roundedRect(1.5, 1.5, WORLD_WIDTH - 3, WORLD_HEIGHT - 3, 32);
  ctx.stroke();
  ctx.restore();
}

export const zonesRenderMethods = {
  drawScanZones,
  drawPlantingZones,
  drawPlantingQueueBadge,
  drawPipeReach,
  drawActionCells,
  drawGrid,
  drawPlacementPreview,
  drawMapBorder,
};
