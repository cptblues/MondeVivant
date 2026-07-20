import { SEEDS } from '../../core/config';
import { TerrainType } from '../../core/types';
import type { RendererContext } from '../renderContext';

export function seedZoneColor(this: RendererContext, seed: keyof typeof SEEDS): string {
  if (seed === 'willow') return '71, 139, 103';
  if (seed === 'juniper') return '70, 126, 108';
  if (seed === 'tamarisk') return '139, 135, 86';
  return '92, 142, 82';
}

export function soilPatternColor(this: RendererContext, terrain: TerrainType): string {
  if (terrain === TerrainType.Basin) return 'rgba(54, 86, 70, .28)';
  if (terrain === TerrainType.Dune) return 'rgba(126, 92, 38, .24)';
  if (terrain === TerrainType.Salt) return 'rgba(125, 109, 72, .3)';
  return 'rgba(104, 77, 38, .2)';
}

export function roundedRect(this: RendererContext, x: number, y: number, width: number, height: number, radius: number): void {
  const ctx = this.context;
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export const utilsRenderMethods = {
  seedZoneColor,
  soilPatternColor,
  roundedRect,
};
