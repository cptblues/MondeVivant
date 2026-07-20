import './styles.css';
import { GameSimulation } from './core/GameSimulation';
import { SIMULATION_STEP } from './core/gameConfig';
import { CELL_SIZE, ViewMode } from './core/types';
import { HoverState, Renderer } from './rendering/Renderer';
import { UIController } from './ui/UIController';

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas');
if (!canvas) throw new Error('Canvas principal introuvable');

let ui: UIController | null = null;
const simulation = new GameSimulation({
  onToast: (message) => ui?.showToast(message),
  onStateChanged: () => ui?.update(),
});
const renderer = new Renderer(canvas);
let viewMode: ViewMode = 'world';

const zoomAroundCenter = (factor: number): void => {
  renderer.camera.zoomAt({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 }, factor);
  ui?.update();
};

ui = new UIController(simulation, renderer.camera, {
  onViewChanged: (view) => { viewMode = view; },
  onFitMap: () => { renderer.camera.fit(); ui?.update(); },
  onZoomIn: () => zoomAroundCenter(1.22),
  onZoomOut: () => zoomAroundCenter(1 / 1.22),
});

const hover: HoverState = { inside: false, screenX: 0, screenY: 0, worldX: 0, worldY: 0 };
let spacePressed = false;
let dragState: {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  canPan: boolean;
  canPaintZone: boolean;
  lastPaintKey: string | null;
} | null = null;

const updateHover = (event: PointerEvent | WheelEvent): void => {
  const rect = canvas.getBoundingClientRect();
  hover.screenX = event.clientX - rect.left;
  hover.screenY = event.clientY - rect.top;
  const world = renderer.screenToWorld(hover.screenX, hover.screenY);
  hover.worldX = world.x;
  hover.worldY = world.y;
  hover.inside = true;

  if (simulation.selectedTool) {
    const cell = renderer.cellAtWorld(world.x, world.y);
    const validation = cell ? simulation.validateSelected(cell.x, cell.y) : { ok: false, message: 'Hors de la carte' };
    ui?.showPlacementHint(validation.message, event.clientX, event.clientY, validation.ok);
  } else {
    const cell = renderer.cellAtWorld(world.x, world.y);
    const terrainCell = cell ? simulation.cells[cell.index] : null;
    if (cell && terrainCell?.tree && terrainCell.treeStress > 8) {
      const diagnostic = simulation.getCellGrowthDiagnostics(cell.index);
      ui?.showPlacementHint(`Stress : ${diagnostic.primaryStressReason ?? diagnostic.blockers[0] ?? 'conditions insuffisantes'}`, event.clientX, event.clientY, false);
    } else {
      ui?.hidePlacementHint();
    }
  }
};

const paintZoneAtHover = (): void => {
  const cell = renderer.cellAtWorld(hover.worldX, hover.worldY);
  if (!cell || simulation.selectedTool?.kind !== 'planting-zone') return;
  const key = `${cell.x},${cell.y}`;
  if (dragState?.lastPaintKey === key) return;
  simulation.placeSelected(cell.x, cell.y);
  if (dragState) dragState.lastPaintKey = key;
  ui?.update();
};

canvas.addEventListener('pointerdown', (event) => {
  updateHover(event);
  const canPaintZone = event.button === 0 && simulation.selectedTool?.kind === 'planting-zone';
  const canPan = !canPaintZone && (event.button === 1 || event.button === 2 || spacePressed || simulation.selectedTool === null);
  dragState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    lastY: event.clientY,
    moved: false,
    canPan,
    canPaintZone,
    lastPaintKey: null,
  };
  canvas.setPointerCapture(event.pointerId);
  if (canPan) canvas.classList.add('is-panning');
  if (canPaintZone) paintZoneAtHover();
});

canvas.addEventListener('pointermove', (event) => {
  updateHover(event);
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const dx = event.clientX - dragState.lastX;
  const dy = event.clientY - dragState.lastY;
  if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 4) dragState.moved = true;
  if (dragState.canPaintZone) {
    paintZoneAtHover();
    dragState.lastX = event.clientX;
    dragState.lastY = event.clientY;
    return;
  }
  if (dragState.canPan && dragState.moved) renderer.camera.panBy(dx, dy);
  dragState.lastX = event.clientX;
  dragState.lastY = event.clientY;
});

const completePointer = (event: PointerEvent): void => {
  if (!dragState || dragState.pointerId !== event.pointerId) return;
  const wasClick = !dragState.moved;
  canvas.classList.remove('is-panning');
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  const wasPaintingZone = dragState.canPaintZone;
  dragState = null;
  if (wasPaintingZone) return;
  if (!wasClick || event.button !== 0) return;

  updateHover(event);
  const cell = renderer.cellAtWorld(hover.worldX, hover.worldY);
  if (!cell) return;
  if (simulation.selectedTool) {
    simulation.placeSelected(cell.x, cell.y);
    ui?.hidePlacementHint();
    ui?.update();
    return;
  }
  const building = renderer.buildingAtWorld(simulation, hover.worldX, hover.worldY);
  if (building) simulation.selectBuilding(building.id);
  else {
    const pipe = renderer.pipeAtWorld(simulation, hover.worldX, hover.worldY);
    if (pipe) simulation.selectPipe(pipe.gx, pipe.gy);
    else simulation.selectCell(cell.index);
  }
  ui?.update();
};

canvas.addEventListener('pointerup', completePointer);
canvas.addEventListener('pointercancel', completePointer);
canvas.addEventListener('pointerleave', () => { hover.inside = false; if (!dragState) ui?.hidePlacementHint(); });
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  updateHover(event);
  renderer.camera.zoomAt({ x: hover.screenX, y: hover.screenY }, event.deltaY < 0 ? 1.12 : 1 / 1.12);
  ui?.update();
}, { passive: false });

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    spacePressed = true;
    canvas.classList.add('can-pan');
    event.preventDefault();
  }
  if (event.key === 'Escape') {
    simulation.selectTool(null);
    ui?.closeOverlays();
  }
  if (event.key === '+' || event.key === '=') zoomAroundCenter(1.22);
  if (event.key === '-') zoomAroundCenter(1 / 1.22);
  if (event.key.toLowerCase() === 'f') { renderer.camera.fit(); ui?.update(); }
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') { spacePressed = false; canvas.classList.remove('can-pan'); }
});

const resizeObserver = new ResizeObserver(() => renderer.resize());
resizeObserver.observe(canvas);
renderer.resize();

let previousTime = performance.now();
let simulationAccumulator = 0;
let uiAccumulator = 0;
const frame = (now: number): void => {
  const realDelta = Math.min(0.1, (now - previousTime) / 1000);
  previousTime = now;
  simulationAccumulator += realDelta * simulation.speed;
  uiAccumulator += realDelta;
  while (simulationAccumulator >= SIMULATION_STEP) {
    simulation.update(SIMULATION_STEP);
    simulationAccumulator -= SIMULATION_STEP;
  }
  renderer.render(simulation, viewMode, hover);
  if (uiAccumulator >= 0.25) { ui?.update(); uiAccumulator = 0; }
  requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

(window as Window & { gameDebug?: unknown }).gameDebug = { simulation, renderer, cellSize: CELL_SIZE };
