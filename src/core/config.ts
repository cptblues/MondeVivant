import { BuildingDefinition, BuildingType, SeedDefinition, SeedType, TerrainType } from './types';
import {
  CISTERN_CAPACITY,
  CISTERN_COST,
  CISTERN_IRRIGATION_AMOUNT,
  CISTERN_IRRIGATION_RADIUS,
  CISTERN_LOCAL_IRRIGATION_CONSUMPTION,
  CISTERN_PIPE_MAX_LENGTH,
  CISTERN_SOURCE_MIN_WATER,
  CISTERN_WOOD_COST,
  PIPE_MAX_LENGTH,
  PUMP_COST,
  PUMP_IRRIGATION_AMOUNT,
  PUMP_IRRIGATION_RADIUS,
  PUMP_LOCAL_IRRIGATION_CONSUMPTION,
  PUMP_WATER_RATE,
  NURSERY_CAPACITY,
  NURSERY_COST,
  NURSERY_WORKER_CAPACITY,
  ROBOT_HOUSE_CAPACITY,
  ROBOT_HOUSE_COST,
  SCAN_ZONE_RADIUS,
  WORKER_SPEED_CELLS_PER_SECOND,
} from './gameConfig';

export const TERRAIN_NAMES: Record<TerrainType, string> = {
  [TerrainType.Sand]: 'Sable sec',
  [TerrainType.Basin]: 'Sol de cuvette',
  [TerrainType.Dune]: 'Sable dunaire',
  [TerrainType.Salt]: 'Sol salin',
  [TerrainType.Rock]: 'Roche affleurante',
};

export const TERRAIN_DESCRIPTIONS: Record<TerrainType, string> = {
  [TerrainType.Sand]: 'Sol neutre mais pauvre. Il accepte les espèces pionnières si une irrigation est disponible.',
  [TerrainType.Basin]: 'Le relief retient mieux l’eau. Une faible pression peut suffire plus longtemps.',
  [TerrainType.Dune]: 'Sol mobile et drainant. Il demande une irrigation soutenue et une espèce adaptée.',
  [TerrainType.Salt]: 'Le sel bloque les graines ordinaires. Une variété spécialisée est nécessaire.',
  [TerrainType.Rock]: 'Impossible à cultiver ou à construire. Les tuyaux doivent la contourner.',
};

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  [TerrainType.Sand]: '#d8b46b',
  [TerrainType.Basin]: '#a99c69',
  [TerrainType.Dune]: '#e0bd70',
  [TerrainType.Salt]: '#e9d7a5',
  [TerrainType.Rock]: '#766f64',
};

export const BUILDING_ORDER: BuildingType[] = ['pump', 'nursery', 'robot-house', 'cistern'];

export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  pump: {
    id: 'pump',
    name: 'Pompe solaire',
    icon: '💧',
    radiusCells: 2,
    cost: PUMP_COST,
    description: 'Produit la réserve d’eau, sert de source au réseau et humidifie localement quelques tuiles en consommant une petite part de la réserve.',
    unlock: 'Disponible au départ',
    effects: { resourceRate: PUMP_WATER_RATE },
    localIrrigation: { radius: PUMP_IRRIGATION_RADIUS, amount: PUMP_IRRIGATION_AMOUNT, consumptionRate: PUMP_LOCAL_IRRIGATION_CONSUMPTION },
    placementRules: ['not-rock', 'not-near-building', 'not-on-tree', 'not-on-pipe'],
    pipeSource: { maxLength: PIPE_MAX_LENGTH },
  },
  nursery: {
    id: 'nursery',
    name: 'Pépinière',
    icon: '🏡',
    radiusCells: 0,
    cost: NURSERY_COST,
    capacity: NURSERY_CAPACITY,
    description: 'Multiplie les graines connues ou recherche une variété adaptée à un sol identifié. Elle fonctionne avec une petite réserve d’eau locale.',
    unlock: 'Disponible au départ',
    effects: {},
    storage: { resource: 'water', capacity: NURSERY_CAPACITY },
    worker: { role: 'nursery', capacity: NURSERY_WORKER_CAPACITY, speedCellsPerSecond: WORKER_SPEED_CELLS_PER_SECOND },
    placementRules: ['not-rock', 'not-salt', 'not-near-building', 'not-on-tree', 'not-on-pipe'],
  },
  'robot-house': {
    id: 'robot-house',
    name: 'Maison de robot',
    icon: '🤖',
    radiusCells: 0,
    cost: ROBOT_HOUSE_COST,
    capacity: ROBOT_HOUSE_CAPACITY,
    description: 'Abrite un robot restaurateur, stocke eau et graines locales, puis restaure une parcelle rectangulaire définie par le joueur.',
    unlock: 'Disponible après la pompe',
    effects: {},
    storage: { resource: 'water', capacity: ROBOT_HOUSE_CAPACITY },
    worker: { role: 'restoration', capacity: 1, speedCellsPerSecond: WORKER_SPEED_CELLS_PER_SECOND },
    placementRules: ['not-rock', 'not-near-building', 'not-on-tree', 'not-on-pipe'],
  },
  cistern: {
    id: 'cistern',
    name: 'Cuve relais',
    icon: '🛢️',
    radiusCells: 2,
    cost: CISTERN_COST,
    woodCost: CISTERN_WOOD_COST,
    capacity: CISTERN_CAPACITY,
    description: 'Stocke l’eau transportée ou envoyée par un tuyau relié directement. Une cuve remplie devient une source de petit réseau et irrigue localement en consommant son stock.',
    unlock: 'Nécessite du bois récolté sur un arbre mature',
    effects: {},
    storage: { resource: 'water', capacity: CISTERN_CAPACITY, sourceThreshold: CISTERN_SOURCE_MIN_WATER },
    localIrrigation: { radius: CISTERN_IRRIGATION_RADIUS, amount: CISTERN_IRRIGATION_AMOUNT, consumptionRate: CISTERN_LOCAL_IRRIGATION_CONSUMPTION },
    placementRules: ['not-rock', 'not-near-building', 'not-on-tree', 'not-on-pipe'],
    pipeSource: { minWater: CISTERN_SOURCE_MIN_WATER, maxLength: CISTERN_PIPE_MAX_LENGTH },
  },
};

export const SEED_ORDER: SeedType[] = ['pioneer', 'willow', 'juniper', 'tamarisk'];

export const SEEDS: Record<SeedType, SeedDefinition> = {
  pioneer: {
    id: 'pioneer',
    name: 'Acacia pionnier',
    icon: '🌰',
    description: 'Arbre de départ robuste sur sable et en cuvette. À maturité, il peut se ressemer autour de lui.',
    compatibleTerrains: [TerrainType.Sand, TerrainType.Basin],
    waterNeed: 24,
    shadeNeed: 0,
    humusNeed: 5,
    growRate: 0.014,
    influenceRadius: 5,
  },
  willow: {
    id: 'willow',
    name: 'Saule de cuvette',
    icon: '🫘',
    description: 'Variété adaptée aux sols de cuvette. Elle renforce fortement l’humidité locale.',
    compatibleTerrains: [TerrainType.Basin],
    waterNeed: 30,
    shadeNeed: 0,
    humusNeed: 8,
    growRate: 0.016,
    influenceRadius: 6,
    researchSoil: TerrainType.Basin,
  },
  juniper: {
    id: 'juniper',
    name: 'Genévrier des dunes',
    icon: '🟤',
    description: 'Variété basse qui fixe les dunes et tolère leur drainage rapide.',
    compatibleTerrains: [TerrainType.Dune],
    waterNeed: 20,
    shadeNeed: 0,
    humusNeed: 5,
    growRate: 0.012,
    influenceRadius: 5,
    researchSoil: TerrainType.Dune,
  },
  tamarisk: {
    id: 'tamarisk',
    name: 'Tamaris salin',
    icon: '🥜',
    description: 'Espèce spécialisée capable de pousser sur les sols salins analysés.',
    compatibleTerrains: [TerrainType.Salt],
    waterNeed: 23,
    shadeNeed: 0,
    humusNeed: 4,
    growRate: 0.011,
    influenceRadius: 5,
    researchSoil: TerrainType.Salt,
  },
};

export const RESEARCH_SEED_FOR_SOIL: Partial<Record<TerrainType, SeedType>> = {
  [TerrainType.Basin]: 'willow',
  [TerrainType.Dune]: 'juniper',
  [TerrainType.Salt]: 'tamarisk',
};

export const PIPE_ICON = '〰️';
export const SCAN_ICON = '◫';
export { CISTERN_PIPE_MAX_LENGTH, PIPE_MAX_LENGTH, SCAN_ZONE_RADIUS };
