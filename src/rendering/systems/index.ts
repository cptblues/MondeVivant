import { entitiesRenderMethods } from './entities';
import { pipesRenderMethods } from './pipes';
import { runtimeRenderMethods } from './runtime';
import { terrainRenderMethods } from './terrain';
import { utilsRenderMethods } from './utils';
import { zonesRenderMethods } from './zones';

export const installRendererSystems = (prototype: object): void => {
  Object.assign(
    prototype,
    runtimeRenderMethods,
    terrainRenderMethods,
    zonesRenderMethods,
    entitiesRenderMethods,
    pipesRenderMethods,
    utilsRenderMethods,
  );
};
