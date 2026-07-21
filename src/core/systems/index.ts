import { buildingsMethods } from './buildings';
import { ecologyMethods } from './ecology';
import { nurseryMethods } from './nursery';
import { pipeNetworkMethods } from './pipeNetwork';
import { pipesMethods } from './pipes';
import { progressionMethods } from './progression';
import { queriesMethods } from './queries';
import { restorationMethods } from './restoration';
import { runtimeMethods } from './runtime';
import { seedRequestMethods } from './seedRequests';
import { tasksMethods } from './tasks';
import { workerTargetMethods } from './workerTargets';
import { workersMethods } from './workers';

export const installSimulationSystems = (prototype: object): void => {
  Object.assign(
    prototype,
    runtimeMethods,
    buildingsMethods,
    nurseryMethods,
    restorationMethods,
    seedRequestMethods,
    tasksMethods,
    workersMethods,
    workerTargetMethods,
    progressionMethods,
    pipesMethods,
    pipeNetworkMethods,
    ecologyMethods,
    queriesMethods,
  );
};
