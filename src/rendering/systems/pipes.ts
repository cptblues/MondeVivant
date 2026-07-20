import { CELL_SIZE } from '../../core/types';
import { PIPE_NEIGHBORS } from '../../core/gameConfig';
import type { GameSimulation } from '../../core/GameSimulation';
import type { PipeCell, PressureLevel } from '../../core/types';
import type { RendererContext } from '../renderContext';

export function drawPipes(this: RendererContext, simulation: GameSimulation): void {
  const ctx = this.context;
  const selected = simulation.getSelectedPipe();
  const pipeEdges: Array<{ fromX: number; fromY: number; pipe: PipeCell }> = [];
  const sourceKeys = new Set(simulation.pipes.map((pipe) => `${pipe.sourceType}:${pipe.sourceId}`));
  for (const sourceKey of sourceKeys) {
    const [sourceType, sourceIdText] = sourceKey.split(':');
    const sourceId = Number(sourceIdText);
    const source = simulation.buildings.find((building) => building.type === sourceType && building.id === sourceId);
    if (!source) continue;
    const network = new Map(simulation.pipes
      .filter((pipe) => pipe.sourceType === sourceType && pipe.sourceId === sourceId)
      .map((pipe) => [`${pipe.gx},${pipe.gy}`, pipe]));
    const queue: Array<{ x: number; y: number }> = [{ x: source.gx, y: source.gy }];
    const visited = new Set<string>([`${source.gx},${source.gy}`]);
    while (queue.length) {
      const current = queue.shift()!;
      for (const [dx, dy] of PIPE_NEIGHBORS) {
        const x = current.x + dx;
        const y = current.y + dy;
        const key = `${x},${y}`;
        const pipe = network.get(key);
        if (!pipe || visited.has(key)) continue;
        visited.add(key);
        pipeEdges.push({ fromX: current.x, fromY: current.y, pipe });
        queue.push({ x, y });
      }
    }
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const edge of pipeEdges) {
    const cx = (edge.pipe.gx + 0.5) * CELL_SIZE;
    const cy = (edge.pipe.gy + 0.5) * CELL_SIZE;
    const level = simulation.getPressureLevelAt(edge.pipe.gx, edge.pipe.gy);
    ctx.strokeStyle = this.pressureColor(level);
    ctx.lineWidth = 5.4;
    ctx.shadowColor = level === 'none' ? 'transparent' : 'rgba(43, 128, 192, .22)';
    ctx.shadowBlur = level === 'strong' ? 5 : 2;
    ctx.beginPath();
    ctx.moveTo((edge.fromX + 0.5) * CELL_SIZE, (edge.fromY + 0.5) * CELL_SIZE);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (const pipe of simulation.pipes) {
    const cx = (pipe.gx + 0.5) * CELL_SIZE;
    const cy = (pipe.gy + 0.5) * CELL_SIZE;
    const level = simulation.getPressureLevelAt(pipe.gx, pipe.gy);
    ctx.fillStyle = this.pressureColor(level);
    ctx.beginPath(); ctx.arc(cx, cy, 3.8, 0, Math.PI * 2); ctx.fill();
    if (selected && selected.gx === pipe.gx && selected.gy === pipe.gy) {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 7.2, 0, Math.PI * 2); ctx.stroke();
    }
    if (simulation.pipeSource?.anchorX === pipe.gx && simulation.pipeSource.anchorY === pipe.gy) {
      ctx.strokeStyle = '#f8fff5';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (pipe.outlet) this.drawOutlet(cx, cy, pipe.outletOpen, level);
  }
  ctx.restore();
}

export function drawOutlet(this: RendererContext, cx: number, cy: number, open: boolean, level: PressureLevel): void {
  const ctx = this.context;
  ctx.save();
  ctx.fillStyle = open ? '#f6fbff' : '#f8e9e2';
  ctx.strokeStyle = open ? this.pressureColor(level) : '#a75648';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  if (open) {
    const pulse = 0.5 + Math.sin(performance.now() / 260 + cx * 0.03 + cy * 0.02) * 0.5;
    ctx.globalAlpha = 0.28 + pulse * 0.18;
    ctx.strokeStyle = this.pressureColor(level);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 12 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = this.pressureColor(level);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy - 2, 11, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    ctx.fillStyle = '#62a9d4';
    ctx.beginPath(); ctx.arc(cx - 7, cy - 9, 1.5, 0, Math.PI * 2); ctx.arc(cx + 7, cy - 9, 1.5, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(cx - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4); ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx - 4, cy + 4); ctx.stroke();
  }
  ctx.restore();
}

export function pressureColor(this: RendererContext, level: PressureLevel): string {
  if (level === 'strong') return '#2476c9';
  if (level === 'medium') return '#57a1d5';
  if (level === 'weak') return '#a3c9dc';
  return '#8e9695';
}

export const pipesRenderMethods = {
  drawPipes,
  drawOutlet,
  pressureColor,
};
