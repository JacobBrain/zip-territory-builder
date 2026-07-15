import type {
  UtilityDataset,
  Utility,
  UtilityStats,
  MegLocation,
  FieldLocationsDataset,
  SubstationEntry,
  PlantEntry,
} from '@/types/utility';
import megLocationsJson from './meg-locations.json';

export const megLocations = megLocationsJson as unknown as MegLocation[];

let cache: UtilityDataset | null = null;
let loadingPromise: Promise<UtilityDataset> | null = null;

/** Fetch and cache the precomputed utility territories dataset. */
export function loadUtilityDataset(): Promise<UtilityDataset> {
  if (cache) return Promise.resolve(cache);
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch('/utility-data/utility-territories.json')
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load utility data (HTTP ${res.status})`);
      return res.json();
    })
    .then((data: UtilityDataset) => {
      cache = data;
      return data;
    })
    .finally(() => {
      loadingPromise = null;
    });
  return loadingPromise;
}

let fieldCache: FieldLocationsDataset | null = null;
let fieldLoadingPromise: Promise<FieldLocationsDataset> | null = null;

/** Lazy fetch of substation/plant field locations (only needed once a utility is selected). */
export function loadFieldLocations(): Promise<FieldLocationsDataset> {
  if (fieldCache) return Promise.resolve(fieldCache);
  if (fieldLoadingPromise) return fieldLoadingPromise;
  fieldLoadingPromise = fetch('/utility-data/field-locations.json')
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load field locations (HTTP ${res.status})`);
      return res.json();
    })
    .then((data: FieldLocationsDataset) => {
      fieldCache = data;
      return data;
    })
    .finally(() => {
      fieldLoadingPromise = null;
    });
  return fieldLoadingPromise;
}

/**
 * Instant radius coverage for field locations: entries carry a precomputed
 * distance-to-nearest-MEG (index 2), so any radius is a simple count.
 */
export function fieldCoverage(
  entries: (SubstationEntry | PlantEntry)[],
  radiusMiles: number
): { within: number; total: number; pct: number | null } {
  const total = entries.length;
  if (!total) return { within: 0, total: 0, pct: null };
  const within = entries.reduce((n, e) => n + (e[2] <= radiusMiles ? 1 : 0), 0);
  return { within, total, pct: within / total };
}

/** Precomputed coverage percentage for a utility at a given radius, if available. */
export function getPrecomputedCoverage(stats: UtilityStats, radius: number): number | null {
  const entry = (stats as unknown as Record<string, unknown>)[String(radius)];
  if (entry && typeof entry === 'object' && 'coveredPct' in entry) {
    return (entry as { coveredPct: number | null }).coveredPct;
  }
  return null;
}

/**
 * Coverage percentage to display for a utility at a radius: exact precomputed
 * value if available, else a client-computed custom value, else null.
 */
export function getCoverage(
  utility: Utility,
  radius: number,
  customStats: Record<number, Record<string, number>>
): { pct: number | null; approximate: boolean } {
  const pre = getPrecomputedCoverage(utility.stats, radius);
  if (pre !== null) return { pct: pre, approximate: false };
  const custom = customStats[radius]?.[utility.id];
  if (custom !== undefined) return { pct: custom, approximate: false };
  return { pct: null, approximate: true };
}

export function formatCustomers(customers: number | null): string {
  if (!customers) return '—';
  if (customers >= 1_000_000) return `${(customers / 1_000_000).toFixed(1)}M`;
  if (customers >= 1_000) return `${Math.round(customers / 1_000)}K`;
  return String(customers);
}

export function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  return `${Math.round(pct * 100)}%`;
}
