import { WORLD_HEIGHT, WORLD_WIDTH } from '../core/types';
import { clamp } from '../utils/math';

export interface Point {
  x: number;
  y: number;
}

export class Camera {
  public x = 0;
  public y = 0;
  public zoom = 1;

  private viewportWidth = 1;
  private viewportHeight = 1;
  private readonly minZoom = 0.55;
  private readonly maxZoom = 2.8;

  public resize(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    if (this.zoom === 1 && this.x === 0 && this.y === 0) this.fit();
    this.constrain();
  }

  public fit(): void {
    const padding = 44;
    const zx = (this.viewportWidth - padding * 2) / WORLD_WIDTH;
    const zy = (this.viewportHeight - padding * 2) / WORLD_HEIGHT;
    this.zoom = clamp(Math.min(zx, zy), this.minZoom, 1.25);
    this.x = (this.viewportWidth - WORLD_WIDTH * this.zoom) / 2;
    this.y = (this.viewportHeight - WORLD_HEIGHT * this.zoom) / 2;
    this.constrain();
  }

  public screenToWorld(point: Point): Point {
    return {
      x: (point.x - this.x) / this.zoom,
      y: (point.y - this.y) / this.zoom,
    };
  }

  public worldToScreen(point: Point): Point {
    return {
      x: point.x * this.zoom + this.x,
      y: point.y * this.zoom + this.y,
    };
  }

  public panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.constrain();
  }

  public zoomAt(screenPoint: Point, factor: number): void {
    const before = this.screenToWorld(screenPoint);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    this.x = screenPoint.x - before.x * this.zoom;
    this.y = screenPoint.y - before.y * this.zoom;
    this.constrain();
  }

  public getZoomPercent(): number {
    return Math.round(this.zoom * 100);
  }

  private constrain(): void {
    const worldWidth = WORLD_WIDTH * this.zoom;
    const worldHeight = WORLD_HEIGHT * this.zoom;
    const margin = 120;

    if (worldWidth <= this.viewportWidth) {
      this.x = (this.viewportWidth - worldWidth) / 2;
    } else {
      this.x = clamp(this.x, this.viewportWidth - worldWidth - margin, margin);
    }

    if (worldHeight <= this.viewportHeight) {
      this.y = (this.viewportHeight - worldHeight) / 2;
    } else {
      this.y = clamp(this.y, this.viewportHeight - worldHeight - margin, margin);
    }
  }
}
