import { BuildingDefinition, BuildingType, SeedDefinition, SeedType, TerrainType } from './types';

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

export const BUILDING_ORDER: BuildingType[] = ['pump', 'nursery', 'cistern'];

export const BUILDINGS: Record<BuildingType, BuildingDefinition> = {
  pump: {
    id: 'pump',
    name: 'Pompe solaire',
    icon: '💧',
    radiusCells: 2,
    cost: 0,
    description: 'Produit la réserve d’eau, sert de source au réseau et humidifie légèrement quelques tuiles autour d’elle.',
    unlock: 'Disponible au départ',
    effects: { resourceRate: 1.2 },
    localIrrigation: { radius: 2.35, amount: 34 },
    placementRules: ['not-rock', 'not-near-building', 'not-on-tree', 'not-on-pipe'],
    pipeSource: { maxLength: 14 },
  },
  scanner: {
    id: 'scanner',
    name: 'Scanner pédologique',
    icon: '📡',
    radiusCells: 5,
    cost: 6,
    description: 'Analyse les cellules proches. Une fois terminée, la carte des sols reste mémorisée après son retrait.',
    unlock: 'Disponible au départ',
    effects: {},
    reuseCooldownSeconds: 30,
    placementRules: ['not-rock', 'not-near-building', 'not-on-tree', 'not-on-pipe'],
  },
  nursery: {
    id: 'nursery',
    name: 'Pépinière',
    icon: '🏡',
    radiusCells: 0,
    cost: 10,
    capacity: 24,
    description: 'Multiplie les graines connues ou recherche une variété adaptée à un sol identifié. Elle fonctionne avec une petite réserve d’eau locale.',
    unlock: 'Disponible au départ',
    effects: {},
    storage: { resource: 'water', capacity: 24 },
    worker: { role: 'nursery', capacity: 5, speedCellsPerSecond: 4.6 },
    placementRules: ['not-rock', 'not-salt', 'not-near-building', 'not-on-tree', 'not-on-pipe'],
  },
  cistern: {
    id: 'cistern',
    name: 'Cuve relais',
    icon: '🛢️',
    radiusCells: 2,
    cost: 0,
    woodCost: 8,
    capacity: 60,
    description: 'Stocke l’eau transportée ou envoyée par un tuyau relié directement. Une cuve remplie devient une source de petit réseau.',
    unlock: 'Nécessite du bois récolté sur un arbre mature',
    effects: {},
    storage: { resource: 'water', capacity: 60, sourceThreshold: 10 },
    localIrrigation: { radius: 2.35, amount: 28 },
    placementRules: ['not-rock', 'not-near-building', 'not-on-tree', 'not-on-pipe'],
    pipeSource: { minWater: 10, maxLength: 9 },
  },
  carrier: {
    id: 'carrier',
    name: 'Atelier transporteur',
    icon: '🤖',
    radiusCells: 0,
    cost: 8,
    woodCost: 5,
    description: 'Construit un petit robot qui fait des allers-retours entre la pompe et les cuves à remplir.',
    unlock: 'Nécessite une pompe, une cuve et du bois',
    effects: {},
    worker: { role: 'carrier', capacity: 6, speedCellsPerSecond: 3.15 },
    placementRules: ['not-rock', 'requires-pump', 'requires-cistern', 'not-near-building', 'not-on-tree', 'not-on-pipe'],
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

export const PIPE_MAX_LENGTH = 14;
export const CISTERN_PIPE_MAX_LENGTH = 9;
export const SCAN_ZONE_RADIUS = 5;
export const PIPE_ICON = '〰️';
export const SCAN_ICON = '◫';
