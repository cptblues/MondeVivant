import { TERRAIN_COLORS } from '../../core/config';
import { CELL_SIZE, GRID_HEIGHT, GRID_WIDTH, TerrainType, WORLD_HEIGHT, WORLD_WIDTH } from '../../core/types';
import type { ViewMode } from '../../core/types';
import type { GameSimulation } from '../../core/GameSimulation';
import type { RendererContext } from '../renderContext';
import { clamp, hash, indexOf } from '../../utils/math';

export function drawMapBase(this: RendererContext): void {
  const ctx = this.context;
  ctx.save();
  ctx.shadowColor = 'rgba(58, 44, 20, .28)';
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#d9b76f';
  this.roundedRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 34);
  ctx.fill();
  ctx.restore();
}

export function drawTerrain(this: RendererContext, simulation: GameSimulation, view: ViewMode): void {
  const ctx = this.context;
  ctx.save();
  this.roundedRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 34);
  ctx.clip();
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const cell = simulation.cells[indexOf(x, y, GRID_WIDTH)];
      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;
      if (cell.terrain === TerrainType.Rock) {
        ctx.fillStyle = '#7b7366';
        ctx.fillRect(px, py, CELL_SIZE + 1, CELL_SIZE + 1);
        continue;
      }
      if (!cell.revealed || view !== 'soil') {
        const noise = hash(x, y, 3);
        ctx.fillStyle = noise > 0.52 ? '#dbba72' : '#d7b46b';
        ctx.fillRect(px, py, CELL_SIZE + 1, CELL_SIZE + 1);
        if (view === 'soil' && !cell.revealed) {
          ctx.fillStyle = 'rgba(75, 61, 38, .2)';
          ctx.fillRect(px, py, CELL_SIZE + 1, CELL_SIZE + 1);
        }
        continue;
      }
      ctx.fillStyle = TERRAIN_COLORS[cell.terrain];
      ctx.fillRect(px, py, CELL_SIZE + 1, CELL_SIZE + 1);
      ctx.fillStyle = this.soilPatternColor(cell.terrain);
      if (hash(x, y, 17) > 0.72) {
        ctx.beginPath();
        ctx.arc(px + 5 + hash(x, y, 18) * 10, py + 5 + hash(y, x, 19) * 10, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  if (view === 'soil') this.drawSoilLabels(simulation);
  this.drawRockDetails(simulation);
  ctx.restore();
}

export function drawSoilLabels(this: RendererContext, simulation: GameSimulation): void {
  const labels: Array<[number, number, string]> = [[22, 25, 'CUVETTE'], [12, 8, 'DUNE'], [52, 13, 'SALIN'], [61, 25, 'DUNE']];
  const ctx = this.context;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 12px system-ui';
  for (const [x, y, label] of labels) {
    if (!simulation.cells[indexOf(x, y, GRID_WIDTH)].revealed) continue;
    ctx.fillStyle = 'rgba(255, 252, 240, .82)';
    this.roundedRect(x * CELL_SIZE - 36, y * CELL_SIZE - 12, 72, 24, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(48, 57, 47, .72)';
    ctx.fillText(label, x * CELL_SIZE, y * CELL_SIZE);
  }
  ctx.restore();
}

export function drawRockDetails(this: RendererContext, simulation: GameSimulation): void {
  const ctx = this.context;
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      if (simulation.cells[indexOf(x, y, GRID_WIDTH)].terrain !== TerrainType.Rock || hash(x, y, 35) < 0.79) continue;
      const px = (x + 0.5) * CELL_SIZE;
      const py = (y + 0.55) * CELL_SIZE;
      const size = 8 + hash(x, y, 37) * 9;
      ctx.fillStyle = '#5f594f';
      ctx.beginPath();
      ctx.ellipse(px, py + 3, size * 0.75, size * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#999184';
      ctx.beginPath();
      ctx.moveTo(px - size * 0.6, py + 1);
      ctx.lineTo(px - size * 0.25, py - size * 0.55);
      ctx.lineTo(px + size * 0.38, py - size * 0.42);
      ctx.lineTo(px + size * 0.62, py + size * 0.2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export function drawGroundCover(this: RendererContext, simulation: GameSimulation): void {
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const cell = simulation.cells[indexOf(x, y, GRID_WIDTH)];
      if (cell.cover === 1) this.drawMoss(x, y, cell.coverProgress);
      else if (cell.cover === 2) this.drawGrassTile(x, y, cell.coverProgress);
    }
  }
}

export function drawMoistureOverlay(this: RendererContext, simulation: GameSimulation): void {
  const ctx = this.context;
  ctx.save();
  this.roundedRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 34);
  ctx.clip();
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const index = indexOf(x, y, GRID_WIDTH);
      const cell = simulation.cells[index];
      if (cell.terrain === TerrainType.Rock) continue;
      const irrigation = clamp(simulation.currentFields.irrigationWater[index], 0, 90) / 90;
      const moisture = clamp(cell.water, 0, 45) / 45;
      const alpha = Math.max(irrigation * 0.32, moisture * 0.16);
      if (alpha < 0.025) continue;
      const px = x * CELL_SIZE;
      const py = y * CELL_SIZE;
      ctx.fillStyle = `rgba(83, 157, 168, ${alpha})`;
      ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      if (irrigation > 0.2 && hash(x, y, 121) > 0.45) {
        ctx.fillStyle = `rgba(225, 247, 238, ${0.16 + irrigation * 0.14})`;
        ctx.beginPath();
        ctx.ellipse(px + 5 + hash(x, y, 122) * 10, py + 5 + hash(y, x, 123) * 10, 2.8, 1.2, hash(x, y, 124) * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function drawMoss(this: RendererContext, x: number, y: number, progress: number): void {
  const ctx = this.context;
  const px = x * CELL_SIZE;
  const py = y * CELL_SIZE;
  ctx.save();
  ctx.fillStyle = `rgba(91, 130, 72, ${0.12 + progress * 0.08})`;
  ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
  ctx.globalAlpha = 0.58 + progress * 0.25;
  for (let j = 0; j < 4; j += 1) {
    const ox = px + CELL_SIZE / 2 + (hash(x, y, 20 + j) - 0.5) * 15;
    const oy = py + CELL_SIZE / 2 + (hash(y, x, 30 + j) - 0.5) * 11;
    ctx.fillStyle = j % 2 ? '#789c57' : '#5f8954';
    ctx.beginPath();
    ctx.ellipse(ox, oy, 4 + hash(j, x, y) * 3, 2.5 + hash(y, j, x) * 2, hash(x, j) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawGrassTile(this: RendererContext, x: number, y: number, progress: number): void {
  const ctx = this.context;
  const px = x * CELL_SIZE;
  const py = y * CELL_SIZE;
  const variation = hash(x, y, 42);
  const colors = ['#719a54', '#78a05a', '#68914f', '#83a85d'];
  ctx.save();
  ctx.globalAlpha = 0.78 + progress * 0.18;
  ctx.fillStyle = colors[Math.floor(variation * colors.length) % colors.length];
  ctx.fillRect(px + 0.5, py + 0.5, CELL_SIZE, CELL_SIZE);
  ctx.globalAlpha = 0.55;
  if (hash(x, y, 53) > 0.44) {
    ctx.strokeStyle = '#477b3f';
    ctx.lineWidth = 0.8;
    const blades = 2 + Math.floor(hash(x, y, 54) * 4);
    for (let j = 0; j < blades; j += 1) {
      const bx = px + 3 + hash(x, y, 60 + j) * 14;
      const by = py + 16 + hash(y, x, 70 + j) * 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + (hash(j, x, y) - 0.5) * 4, by - 5 - hash(y, j, x) * 5);
      ctx.stroke();
    }
  }
  if (hash(x, y, 81) > 0.84) {
    ctx.fillStyle = hash(x, y, 82) > 0.5 ? '#eadc72' : '#dba0ae';
    ctx.beginPath();
    ctx.arc(px + 5 + hash(x, y, 83) * 10, py + 5 + hash(y, x, 84) * 10, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (hash(x, y, 90) > 0.72) {
    ctx.fillStyle = 'rgba(57, 98, 47, .24)';
    ctx.beginPath();
    ctx.ellipse(px + 5 + hash(x, y, 91) * 10, py + 6 + hash(y, x, 92) * 8, 3.5, 1.5, hash(x, y, 93) * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawEcologyOverlay(this: RendererContext, simulation: GameSimulation): void {
  const ctx = this.context;
  ctx.save();
  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const cell = simulation.cells[indexOf(x, y, GRID_WIDTH)];
      if (cell.terrain === TerrainType.Rock) continue;
      const water = clamp(cell.water) / 100;
      const humus = clamp(cell.humus) / 100;
      const shade = clamp(cell.shade) / 100;
      const intensity = Math.max(water, humus, shade);
      ctx.fillStyle = `rgba(${Math.round(88 + humus * 25)}, ${Math.round(135 + humus * 65)}, ${Math.round(115 + water * 95)}, ${0.06 + intensity * 0.24})`;
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE + 1, CELL_SIZE + 1);
    }
  }
  ctx.restore();
}

export const terrainRenderMethods = {
  drawMapBase,
  drawTerrain,
  drawSoilLabels,
  drawRockDetails,
  drawGroundCover,
  drawMoistureOverlay,
  drawMoss,
  drawGrassTile,
  drawEcologyOverlay,
};
