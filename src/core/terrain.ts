import { Cell, GRID_HEIGHT, GRID_WIDTH, TerrainType } from './types';
import { distance, hash, indexOf } from '../utils/math';

const ellipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean => {
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  return nx * nx + ny * ny <= 1;
};

export const createTerrain = (): Cell[] => {
  const cells: Cell[] = Array.from({ length: GRID_WIDTH * GRID_HEIGHT }, () => ({
    terrain: TerrainType.Sand,
    revealed: false,
    known: false,
    water: 0,
    shade: 0,
    humus: 0,
    cover: 0,
    coverProgress: 0,
    coverStress: 0,
    preparedByRobotHouseId: null,
    tree: null,
    treeStage: 0,
    treeProgress: 0,
    treeStress: 0,
    treeOrigin: null,
    nextSeedAt: Number.POSITIVE_INFINITY,
    seedsProduced: 0,
  }));

  for (let y = 0; y < GRID_HEIGHT; y += 1) {
    for (let x = 0; x < GRID_WIDTH; x += 1) {
      const i = indexOf(x, y, GRID_WIDTH);
      let terrain = TerrainType.Sand;

      const basinA = ellipse(x, y, 23, 25, 13.5, 10.5);
      const basinB = ellipse(x, y, 47, 35, 9, 5.8);
      const duneA = ellipse(x, y, 13, 8, 13, 7.4);
      const duneB = ellipse(x, y, 61, 24, 11.5, 10);
      const duneC = ellipse(x, y, 27, 39, 15, 5.2);
      const salt = ellipse(x, y, 52, 12.5, 10.8, 6.3);

      if (basinA || basinB) terrain = TerrainType.Basin;
      if (duneA || duneB || duneC) terrain = TerrainType.Dune;
      if (salt) terrain = TerrainType.Salt;

      const rockClusters = [
        { x: 37, y: 8, r: 4.2 },
        { x: 60, y: 34, r: 3.5 },
        { x: 8.5, y: 34, r: 3 },
        { x: 34, y: 13, r: 1.8 },
      ];
      if (rockClusters.some(({ x: rx, y: ry, r }) => distance(x, y, rx, ry) < r * (0.86 + hash(x, y, 27) * 0.26))) {
        terrain = TerrainType.Rock;
      }

      cells[i].terrain = terrain;
      if (terrain === TerrainType.Basin) {
        cells[i].water = 5 + hash(x, y, 11) * 4;
        cells[i].humus = 2;
      } else if (terrain === TerrainType.Salt) {
        cells[i].water = 1;
        cells[i].humus = 0;
      }

      // Les roches restent visibles : elles sont des obstacles physiques, pas un type de sol à découvrir.
      if (terrain === TerrainType.Rock) {
        cells[i].revealed = true;
        cells[i].known = true;
      }
    }
  }

  return cells;
};
