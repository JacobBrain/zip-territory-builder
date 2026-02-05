import { haversineDistance, boundingBox } from './distance';
import {
  loadStateGeoJSON,
  getStatesInViewport,
  type ZipFeature,
} from './zipBoundaries';

/**
 * Load all state GeoJSON files whose bounding boxes overlap the
 * circle defined by (lat, lng) + radiusMiles, then return every
 * ZipFeature from those states.
 */
export async function loadStatesNearLocation(
  lat: number,
  lng: number,
  radiusMiles: number,
): Promise<ZipFeature[]> {
  const bbox = boundingBox(lat, lng, radiusMiles);
  const stateCodes = getStatesInViewport(bbox);

  const results = await Promise.all(
    stateCodes.map(code => loadStateGeoJSON(code)),
  );

  return results.flat();
}

/**
 * Given a center point + radius, return all zip codes whose centroids
 * fall within that radius.  Loads the necessary state GeoJSON first.
 */
export async function getZipsWithinRadius(
  centerLat: number,
  centerLng: number,
  radiusMiles: number,
): Promise<string[]> {
  const features = await loadStatesNearLocation(centerLat, centerLng, radiusMiles);

  const zips: string[] = [];
  for (const f of features) {
    const [lat, lng] = f.centroid;
    if (haversineDistance(centerLat, centerLng, lat, lng) <= radiusMiles) {
      zips.push(f.zipCode);
    }
  }
  return zips;
}
