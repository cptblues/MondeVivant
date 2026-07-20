import { controllerUiMethods } from './controller';
import { dockUiMethods } from './dock';
import { hudUiMethods } from './hud';
import { inspectorUiMethods } from './inspector';
import { nurseryUiMethods } from './nursery';
import { objectivesUiMethods } from './objectives';
import { robotHouseUiMethods } from './robotHouse';

export const installUISystems = (prototype: object): void => {
  Object.assign(
    prototype,
    controllerUiMethods,
    hudUiMethods,
    dockUiMethods,
    objectivesUiMethods,
    inspectorUiMethods,
    nurseryUiMethods,
    robotHouseUiMethods,
  );
};
