import { buildingsMethods } from './buildings';
import { ecologyMethods } from './ecology';
import { nurseryMethods } from './nursery';
import { pipeNetworkMethods } from './pipeNetwork';
import { pipesMethods } from './pipes';
import { progressionMethods } from './progression';
import { queriesMethods } from './queries';
import { runtimeMethods } from './runtime';
import { workerTargetMethods } from './workerTargets';
import { workersMethods } from './workers';

export const installSimulationSystems = (prototype: object): void => {
  Object.assign(
    prototype,
    runtimeMethods,
    buildingsMethods,
    nurseryMethods,
    workersMethods,
    workerTargetMethods,
    progressionMethods,
    pipesMethods,
    pipeNetworkMethods,
    ecologyMethods,
    queriesMethods,
  );
};
