// Types for the /utility page (MEG Utility Territory Map)

export interface MegLocation {
  id: string;
  name: string;
  address: string;
  kind: 'operation' | 'affiliate' | 'facility';
  precision: 'address' | 'city';
  lat: number;
  lng: number;
  /** Transfer, Storage & Disposal Facility (per millerenvironmentalgroup.com/all-locations) */
  tsdf?: boolean;
}

/** One legal entity (EIA-861 filer) inside a utility's footprint. */
export interface UtilityEntity {
  eiaId: string | number;
  name: string;
  state: string | null;
  type: string | null;
  customers: number | null;
  holdingCo: string | null;
  address: string | null;
  website: string | null;
  sourceDate: string | null;
  valDate: string | null;
  dataYear: number | null;
}

export interface UtilityHq {
  lat: number;
  lng: number;
  address: string | null;
  precision: 'address' | 'territory-center';
}

export interface UtilityStats {
  nearestMegFromEdgeMiles: number | null;
  nearestMegFromHqMiles: number | null;
  nearestMegLocation?: string | null;
  /** Keyed by radius in miles (as string after JSON round-trip). */
  [radius: number]: { coveredPct: number | null } | number | string | null | undefined;
}

export interface Utility {
  id: string;
  name: string;
  clientNames: string[];
  parentCo: string | null;
  statesListed: string;
  states: string[];
  customers: number | null;
  areaSqMi: number | null;
  website: string | null;
  note: string | null;
  hq: UtilityHq;
  entities: UtilityEntity[];
  stats: UtilityStats;
  geometry: GeoJSON.MultiPolygon;
}

export interface UtilityDataset {
  generatedAt: string;
  source: { name: string; url: string; serviceUrl: string };
  radiiPrecomputed: number[];
  utilities: Utility[];
}

// ---------------------------------------------------------------------------
// Field locations (substations + power plants)

/** [lng, lat, nearestMegMiles, name, maxVoltKv] */
export type SubstationEntry = [number, number, number, string | null, number | null];
/** [lng, lat, nearestMegMiles, name, totalMW, primarySource] */
export type PlantEntry = [number, number, number, string | null, number | null, string | null];

export interface FieldLocationSource {
  name: string;
  serviceUrl: string;
  attribution: 'territory-based' | 'owner-based';
  note: string;
}

export interface FieldLocationsDataset {
  generatedAt: string;
  sources: { substations: FieldLocationSource; plants: FieldLocationSource };
  byUtility: Record<string, { substations: SubstationEntry[]; plants: PlantEntry[] }>;
}

// ---------------------------------------------------------------------------

export interface UtilityMapState {
  radiusMiles: number;
  showRings: boolean;
  showSubstations: boolean;
  showPlants: boolean;
  selectedUtilityId: string | null;
  hoveredUtilityId: string | null;
  /** Client-computed coverage for non-precomputed radii: radius -> utilityId -> pct */
  customStats: Record<number, Record<string, number>>;
  statsComputing: boolean;
  showHelp: boolean;
}

export type UtilityAction =
  | { type: 'SET_RADIUS'; payload: number }
  | { type: 'TOGGLE_RINGS' }
  | { type: 'TOGGLE_SUBSTATIONS' }
  | { type: 'TOGGLE_PLANTS' }
  | { type: 'SELECT_UTILITY'; payload: string | null }
  | { type: 'HOVER_UTILITY'; payload: string | null }
  | { type: 'SET_CUSTOM_STATS'; payload: { radius: number; stats: Record<string, number> } }
  | { type: 'SET_STATS_COMPUTING'; payload: boolean }
  | { type: 'SET_SHOW_HELP'; payload: boolean };
