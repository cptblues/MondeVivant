import { Camera } from '../rendering/Camera';
import { GameSimulation } from '../core/GameSimulation';
import { installUISystems } from './systems';
import { element } from './uiContext';
import type { UIContext, UIEvents } from './uiContext';

export class UIController {
  public readonly toolDock = element<HTMLDivElement>('#toolDock');
  public readonly objectiveDrawer = element<HTMLDivElement>('#objectiveDrawer');
  public readonly inspector = element<HTMLDivElement>('#inspector');
  public readonly toastElement = element<HTMLDivElement>('#toast');
  public readonly placementHint = element<HTMLDivElement>('#placementHint');
  public readonly tutorialCard = element<HTMLElement>('#tutorialCard');
  public objectiveOpen = false;
  public currentView = 'world' as const;
  public nurseryMode: 'cultivation' | 'research' = 'cultivation';
  public dockSignature = '';
  public nurseryRenderSignature = '';
  public robotHouseRenderSignature = '';
  public toastTimer: number | null = null;

  constructor(
    public readonly simulation: GameSimulation,
    public readonly camera: Camera,
    public readonly events: UIEvents,
  ) {
    this.bindControls();
    this.update();
  }
}

export interface UIController extends UIContext {}

installUISystems(UIController.prototype);
