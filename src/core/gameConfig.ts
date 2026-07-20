import { BUILDINGS, SEEDS, TERRAIN_NAMES } from './config';
import type { PressureLevel } from './types';

export const SCAN_DURATION = 9;
export const SIMULATION_STEP = 0.1;
export const SCAN_ZONE_BASE_DURATION = 4;
export const SCAN_ZONE_TILE_DURATION = 0.35;
export const SCAN_ZONE_MIN_DURATION = 8;
export const SCAN_ZONE_MAX_DURATION = 45;
export const CULTIVATION_DURATION = 14;
export const CULTIVATION_COST = 7;
export const CULTIVATION_YIELD = 4;
export const RESEARCH_DURATION = 22;
export const RESEARCH_COST = 15;
export const SCANNER_REUSE_COOLDOWN = BUILDINGS.scanner.reuseCooldownSeconds ?? 30;
export const PIPE_MAX_LENGTH = 14;
export const CISTERN_PIPE_MAX_LENGTH = 9;
export const SCAN_ZONE_RADIUS = 5;
export const MAX_SEEDS_PER_TREE = 3;
export const PUMP_IRRIGATION_RADIUS = 2.35;
export const PUMP_IRRIGATION_AMOUNT = 34;
export const WORKER_SPEED_CELLS_PER_SECOND = 4.6;
export const WORKER_PLANT_DURATION = 1.2;
export const CISTERN_CAPACITY = BUILDINGS.cistern.capacity ?? 60;
export const CISTERN_SOURCE_MIN_WATER = 10;
export const CISTERN_IRRIGATION_RADIUS = 2.35;
export const CISTERN_IRRIGATION_AMOUNT = 28;
export const NURSERY_CAPACITY = BUILDINGS.nursery.capacity ?? 24;
export const NURSERY_WORKER_CAPACITY = 5;
export const NURSERY_WATER_FETCH_THRESHOLD = 7;
export const NURSERY_ROBOT_WATER_RADIUS = 12;
export const WOOD_PER_MATURE_TREE = 10;
export const HARVEST_SEED_REWARD = 1;
export const SEED_SEARCH_DURATION = 15;
export const SEED_SEARCH_RADIUS = 7;
export const PRESSURE_HYSTERESIS_MARGIN = 5;
export const CARRIER_CAPACITY = 6;
export const CARRIER_SPEED_CELLS_PER_SECOND = 3.15;
export const CARRIER_TRANSFER_DURATION = 1.1;
export const OUTLET_IRRIGATION: Record<PressureLevel, { radius: number; amount: number; boost: number }> = {
  strong: { radius: 4.2, amount: 86, boost: 1.5 },
  medium: { radius: 3.05, amount: 62, boost: 1.32 },
  weak: { radius: 1.8, amount: 38, boost: 1.12 },
  none: { radius: 0, amount: 0, boost: 1 },
};

export const PIPE_NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
] as const;

export const GAME_CONFIG = {
  simulation: { step: SIMULATION_STEP },
  terrain: { names: TERRAIN_NAMES },
  buildings: BUILDINGS,
  seeds: SEEDS,
  scan: { duration: SCAN_DURATION, baseDuration: SCAN_ZONE_BASE_DURATION, tileDuration: SCAN_ZONE_TILE_DURATION, minDuration: SCAN_ZONE_MIN_DURATION, maxDuration: SCAN_ZONE_MAX_DURATION },
  nursery: { cultivationDuration: CULTIVATION_DURATION, cultivationCost: CULTIVATION_COST, cultivationYield: CULTIVATION_YIELD, researchDuration: RESEARCH_DURATION, researchCost: RESEARCH_COST, capacity: NURSERY_CAPACITY },
  pipes: { maxLength: PIPE_MAX_LENGTH, cisternMaxLength: CISTERN_PIPE_MAX_LENGTH, neighbors: PIPE_NEIGHBORS, outletIrrigation: OUTLET_IRRIGATION },
  irrigation: { pumpRadius: PUMP_IRRIGATION_RADIUS, pumpAmount: PUMP_IRRIGATION_AMOUNT, cisternRadius: CISTERN_IRRIGATION_RADIUS, cisternAmount: CISTERN_IRRIGATION_AMOUNT },
  workers: { nurserySpeed: WORKER_SPEED_CELLS_PER_SECOND, nurseryWaterRadius: NURSERY_ROBOT_WATER_RADIUS, carrierSpeed: CARRIER_SPEED_CELLS_PER_SECOND, carrierCapacity: CARRIER_CAPACITY },
  ecology: { maxSeedsPerTree: MAX_SEEDS_PER_TREE, woodPerMatureTree: WOOD_PER_MATURE_TREE },
} as const;
