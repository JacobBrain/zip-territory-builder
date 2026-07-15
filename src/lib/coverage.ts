import * as turf from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { Utility, MegLocation } from '@/types/utility';

/**
 * Client-side coverage computation for radii that were not precomputed at
 * build time. Same math as scripts/download-utility-territories.mjs, run
 * against the simplified geometry shipped to the browser.
 */

const bufferUnionCache = new Map<number, Feature<Polygon | MultiPolygon>>();
const coverageCache = new Map<number, Record<string, number>>();

function getBufferUnion(
  megLocations: MegLocation[],
  radiusMiles: number
): Feature<Polygon | MultiPolygon> {
  const cached = bufferUnionCache.get(radiusMiles);
  if (cached) return cached;
  const buffers = megLocations.map(
    (l) =>
      turf.buffer(turf.point([l.lng, l.lat]), radiusMiles, {
        units: 'miles',
        steps: 24,
      }) as Feature<Polygon>
  );
  let acc: Feature<Polygon | MultiPolygon> = buffers[0];
  for (let i = 1; i < buffers.length; i++) {
    const merged = turf.union(turf.featureCollection([acc, buffers[i]]));
    if (merged) acc = merged;
  }
  bufferUnionCache.set(radiusMiles, acc);
  return acc;
}

/**
 * Compute coveredPct for every utility at the given radius. Yields to the
 * event loop between utilities to keep the UI responsive.
 */
export async function computeCoverage(
  utilities: Utility[],
  megLocations: MegLocation[],
  radiusMiles: number
): Promise<Record<string, number>> {
  const cached = coverageCache.get(radiusMiles);
  if (cached) return cached;

  const bufferUnion = getBufferUnion(megLocations, radiusMiles);
  const result: Record<string, number> = {};

  for (const utility of utilities) {
    try {
      const territory = turf.feature(utility.geometry);
      const territoryArea = turf.area(territory);
      if (!territoryArea) {
        result[utility.id] = 0;
        continue;
      }
      const intersection = turf.intersect(turf.featureCollection([territory, bufferUnion]));
      result[utility.id] = intersection
        ? Math.min(1, turf.area(intersection) / territoryArea)
        : 0;
    } catch {
      // Geometry edge case - skip rather than crash; UI shows an em dash.
    }
    // Yield so the map stays interactive during the sweep
    await new Promise((r) => setTimeout(r, 0));
  }

  coverageCache.set(radiusMiles, result);
  return result;
}
