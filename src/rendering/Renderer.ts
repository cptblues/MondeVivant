import { installRendererSystems } from './systems';
import { Camera } from './Camera';
import type { RendererContext } from './renderContext';

export type { HoverState } from './renderContext';

export class Renderer {
  public readonly camera = new Camera();
  public readonly context: CanvasRenderingContext2D;
  public dpr = 1;

  constructor(public readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D indisponible');
    this.context = context;
  }
}

export interface Renderer extends RendererContext {}

installRendererSystems(Renderer.prototype);
