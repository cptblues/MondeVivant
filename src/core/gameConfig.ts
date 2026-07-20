import type { PipeSourceType, PressureLevel } from './types';

export const SIMULATION_STEP = 0.05;

export const PUMP_COST = 0;
export const PUMP_WATER_RATE = 1.2;
export const PUMP_IRRIGATION_RADIUS = 2.35;
export const PUMP_IRRIGATION_AMOUNT = 34;
export const PUMP_LOCAL_IRRIGATION_CONSUMPTION = 0.18;

export const NURSERY_COST = 10;
export const NURSERY_CAPACITY = 24;

export const ROBOT_HOUSE_COST = 12;
export const ROBOT_HOUSE_CAPACITY = 36;
export const ROBOT_HOUSE_WATER_TRANSFER_AMOUNT = 8;
export const ROBOT_HOUSE_SEED_TRANSFER_AMOUNT = 1;
export const ROBOT_HOUSE_SCAN_TILE_DURATION = 0.75;
export const ROBOT_HOUSE_PREPARE_DURATION = 1.05;
export const ROBOT_HOUSE_PLANT_DURATION = 1.2;
export const ROBOT_HOUSE_WATER_DURATION = 0.9;
export const ROBOT_HOUSE_WATER_PER_TASK = 2.5;
export const ROBOT_HOUSE_WATERING_AMOUNT = 32;
export const ROBOT_HOUSE_WATER_BUFFER = 5;
export const ROBOT_HOUSE_MAX_PARCEL_WIDTH = 12;
export const ROBOT_HOUSE_MAX_PARCEL_HEIGHT = 10;
export const ROBOT_HOUSE_MAX_PARCEL_TILES = 96;
export const ROBOT_HOUSE_PIPE_FILL_RATE: Record<PressureLevel, number> = {
  strong: 2.4,
  medium: 1.45,
  weak: 0.65,
  none: 0,
};
export const RESTORATION_AUTONOMY = {
  requiredContinuousDuration: 45,
  vegetationCoverage: 0.62,
  minDevelopedTrees: 2,
  developedTreeStage: 2,
  minSpeciesIfCompatible: 2,
  stressRatioMax: 0.24,
  healthyStressLimit: 8,
  waterStressRatio: 0.86,
} as const;

export const CISTERN_COST = 0;
export const CISTERN_WOOD_COST = 8;
export const CISTERN_CAPACITY = 60;
export const CISTERN_SOURCE_MIN_WATER = 10;
export const CISTERN_IRRIGATION_RADIUS = 2.35;
export const CISTERN_IRRIGATION_AMOUNT = 28;
export const CISTERN_LOCAL_IRRIGATION_CONSUMPTION = 0.12;

export const SCAN_ZONE_RADIUS = 5;
export const SCAN_ZONE_BASE_DURATION = 4;
export const SCAN_ZONE_TILE_DURATION = 0.35;
export const SCAN_ZONE_MIN_DURATION = 8;
export const SCAN_ZONE_MAX_DURATION = 45;

export const CULTIVATION_DURATION = 14;
export const CULTIVATION_COST = 7;
export const CULTIVATION_YIELD = 4;
export const RESEARCH_DURATION = 22;
export const RESEARCH_COST = 15;

export const PIPE_MAX_LENGTH = 14;
export const CISTERN_PIPE_MAX_LENGTH = 9;
export const PIPE_NEIGHBORS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
] as const;

export const PRESSURE_THRESHOLDS = {
  strong: 65,
  medium: 38,
  weak: 12,
} as const;
export const PRESSURE_HYSTERESIS_MARGIN = 5;
export const PRESSURE_DISTANCE_PENALTY: Record<PipeSourceType, number> = {
  pump: 5,
  cistern: 6,
};
export const PRESSURE_UPSTREAM_OUTLET_PENALTY: Record<PipeSourceType, number> = {
  pump: 32,
  cistern: 36,
};
export const PRESSURE_SHARED_OUTLET_PENALTY: Record<PipeSourceType, number> = {
  pump: 8,
  cistern: 10,
};
export const PRESSURE_BRANCH_PENALTY = 3;
export const PUMP_PRESSURE_WATER_NORMALIZER = 8;

export const OUTLET_IRRIGATION: Record<PressureLevel, { radius: number; amount: number; boost: number }> = {
  strong: { radius: 4.2, amount: 86, boost: 1.5 },
  medium: { radius: 3.05, amount: 62, boost: 1.32 },
  weak: { radius: 1.8, amount: 38, boost: 1.12 },
  none: { radius: 0, amount: 0, boost: 1 },
};
export const OUTLET_CONSUMPTION: Record<PressureLevel, number> = {
  strong: 0.82,
  medium: 0.5,
  weak: 0.22,
  none: 0,
};
export const CISTERN_PIPE_FILL_RATE: Record<PressureLevel, number> = {
  strong: 4,
  medium: 2.35,
  weak: 1.05,
  none: 0,
};
export const NURSERY_PIPE_FILL_RATE: Record<PressureLevel, number> = {
  strong: 2.8,
  medium: 1.65,
  weak: 0.75,
  none: 0,
};

export const GROUND_COVER = {
  mossWater: 15,
  grassWater: 21,
  grassHumus: 4.5,
  stableGrassWater: 13,
  stableGrassHumus: 3,
} as const;

export const MAX_SEEDS_PER_TREE = 3;
export const WOOD_PER_MATURE_TREE = 10;
export const HARVEST_SEED_REWARD = 1;
export const WORKER_SPEED_CELLS_PER_SECOND = 4.6;
export const WORKER_PLANT_DURATION = 1.2;
export const WORKER_TRANSFER_DURATION = 1.1;
export const NURSERY_WORKER_CAPACITY = 5;
export const NURSERY_WATER_FETCH_THRESHOLD = 7;
export const NURSERY_ROBOT_WATER_RADIUS = 12;
export const SEED_SEARCH_DURATION = 15;
export const SEED_SEARCH_RADIUS = 7;
export const ROBOT_TASK_PRIORITIES = {
  waterDelivery: 90,
  restorationWater: 82,
  restorationScan: 72,
  scan: 60,
  prepareSoil: 50,
  restorationPlant: 46,
  plant: 40,
} as const;

export const GAME_CONFIG = {
  simulation: { step: SIMULATION_STEP },
  scan: { radius: SCAN_ZONE_RADIUS, baseDuration: SCAN_ZONE_BASE_DURATION, tileDuration: SCAN_ZONE_TILE_DURATION, minDuration: SCAN_ZONE_MIN_DURATION, maxDuration: SCAN_ZONE_MAX_DURATION },
  nursery: { cost: NURSERY_COST, capacity: NURSERY_CAPACITY, cultivationDuration: CULTIVATION_DURATION, cultivationCost: CULTIVATION_COST, cultivationYield: CULTIVATION_YIELD, researchDuration: RESEARCH_DURATION, researchCost: RESEARCH_COST },
  robotHouse: {
    cost: ROBOT_HOUSE_COST,
    capacity: ROBOT_HOUSE_CAPACITY,
    waterTransferAmount: ROBOT_HOUSE_WATER_TRANSFER_AMOUNT,
    seedTransferAmount: ROBOT_HOUSE_SEED_TRANSFER_AMOUNT,
    scanTileDuration: ROBOT_HOUSE_SCAN_TILE_DURATION,
    prepareDuration: ROBOT_HOUSE_PREPARE_DURATION,
    plantDuration: ROBOT_HOUSE_PLANT_DURATION,
    waterDuration: ROBOT_HOUSE_WATER_DURATION,
    waterPerTask: ROBOT_HOUSE_WATER_PER_TASK,
    wateringAmount: ROBOT_HOUSE_WATERING_AMOUNT,
    waterBuffer: ROBOT_HOUSE_WATER_BUFFER,
    maxParcelWidth: ROBOT_HOUSE_MAX_PARCEL_WIDTH,
    maxParcelHeight: ROBOT_HOUSE_MAX_PARCEL_HEIGHT,
    maxParcelTiles: ROBOT_HOUSE_MAX_PARCEL_TILES,
    pipeFillRate: ROBOT_HOUSE_PIPE_FILL_RATE,
    autonomy: RESTORATION_AUTONOMY,
  },
  pipes: { maxLength: PIPE_MAX_LENGTH, cisternMaxLength: CISTERN_PIPE_MAX_LENGTH, neighbors: PIPE_NEIGHBORS, outletIrrigation: OUTLET_IRRIGATION, outletConsumption: OUTLET_CONSUMPTION, cisternFillRate: CISTERN_PIPE_FILL_RATE, nurseryFillRate: NURSERY_PIPE_FILL_RATE, pressureThresholds: PRESSURE_THRESHOLDS },
  irrigation: { pumpRadius: PUMP_IRRIGATION_RADIUS, pumpAmount: PUMP_IRRIGATION_AMOUNT, pumpConsumption: PUMP_LOCAL_IRRIGATION_CONSUMPTION, cisternRadius: CISTERN_IRRIGATION_RADIUS, cisternAmount: CISTERN_IRRIGATION_AMOUNT, cisternConsumption: CISTERN_LOCAL_IRRIGATION_CONSUMPTION },
  workers: { nurserySpeed: WORKER_SPEED_CELLS_PER_SECOND, nurseryCapacity: NURSERY_WORKER_CAPACITY, nurseryWaterRadius: NURSERY_ROBOT_WATER_RADIUS, transferDuration: WORKER_TRANSFER_DURATION, taskPriorities: ROBOT_TASK_PRIORITIES },
  ecology: { groundCover: GROUND_COVER, maxSeedsPerTree: MAX_SEEDS_PER_TREE, woodPerMatureTree: WOOD_PER_MATURE_TREE },
} as const;
