import type { FeatureCollection, Feature, Polygon, MultiPolygon } from 'geojson';

export interface ZipFeature {
  zipCode: string;
  geometry: Polygon | MultiPolygon;
  bounds: { north: number; south: number; east: number; west: number };
  centroid: [number, number]; // [lat, lng]
}

export interface StateBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// State bounding boxes for viewport-based loading
export const STATE_BOUNDS: Record<string, StateBounds> = {
  me: { north: 47.46, south: 43.06, east: -66.95, west: -71.08 },
  nh: { north: 45.31, south: 42.70, east: -70.70, west: -72.56 },
  vt: { north: 45.02, south: 42.73, east: -71.47, west: -73.44 },
  ma: { north: 42.89, south: 41.24, east: -69.93, west: -73.51 },
  ri: { north: 42.02, south: 41.15, east: -71.12, west: -71.86 },
  ct: { north: 42.05, south: 40.95, east: -71.79, west: -73.73 },
  ny: { north: 45.02, south: 40.50, east: -71.86, west: -79.76 },
  nj: { north: 41.36, south: 38.93, east: -73.89, west: -75.56 },
  pa: { north: 42.27, south: 39.72, east: -74.69, west: -80.52 },
  de: { north: 39.84, south: 38.45, east: -75.05, west: -75.79 },
  md: { north: 39.72, south: 37.91, east: -75.05, west: -79.49 },
  va: { north: 39.47, south: 36.54, east: -75.24, west: -83.68 },
  nc: { north: 36.59, south: 33.84, east: -75.46, west: -84.32 },
  sc: { north: 35.22, south: 32.03, east: -78.54, west: -83.35 },
  ga: { north: 35.00, south: 30.36, east: -80.84, west: -85.61 },
  fl: { north: 31.00, south: 24.52, east: -80.03, west: -87.63 },
  oh: { north: 42.32, south: 38.40, east: -80.52, west: -84.82 },
  wv: { north: 40.64, south: 37.20, east: -77.72, west: -82.64 },
  al: { north: 35.01, south: 30.22, east: -84.89, west: -88.47 },
};

const STATE_FILES: Record<string, string> = {
  me: '/geojson/me.json',
  nh: '/geojson/nh.json',
  vt: '/geojson/vt.json',
  ma: '/geojson/ma.json',
  ri: '/geojson/ri.json',
  ct: '/geojson/ct.json',
  ny: '/geojson/ny.json',
  nj: '/geojson/nj.json',
  pa: '/geojson/pa.json',
  de: '/geojson/de.json',
  md: '/geojson/md.json',
  va: '/geojson/va.json',
  nc: '/geojson/nc.json',
  sc: '/geojson/sc.json',
  ga: '/geojson/ga.json',
  fl: '/geojson/fl.json',
  oh: '/geojson/oh.json',
  wv: '/geojson/wv.json',
  al: '/geojson/al.json',
};

// In-memory cache of loaded state data
const stateCache: Record<string, ZipFeature[]> = {};
const loadingPromises: Record<string, Promise<ZipFeature[]>> = {};

function computeBounds(geometry: Polygon | MultiPolygon): { north: number; south: number; east: number; west: number } {
  let north = -90, south = 90, east = -180, west = 180;

  const rings = geometry.type === 'Polygon'
    ? geometry.coordinates
    : geometry.coordinates.flat();

  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lat > north) north = lat;
      if (lat < south) south = lat;
      if (lng > east) east = lng;
      if (lng < west) west = lng;
    }
  }

  return { north, south, east, west };
}

function computeCentroid(bounds: { north: number; south: number; east: number; west: number }): [number, number] {
  return [(bounds.north + bounds.south) / 2, (bounds.east + bounds.west) / 2];
}

export async function loadStateGeoJSON(stateCode: string): Promise<ZipFeature[]> {
  if (stateCache[stateCode]) {
    return stateCache[stateCode];
  }

  if (stateCode in loadingPromises) {
    return loadingPromises[stateCode];
  }

  const filePath = STATE_FILES[stateCode];
  if (!filePath) return [];

  const promise = fetch(filePath)
    .then(res => res.json())
    .then((data: FeatureCollection) => {
      const features: ZipFeature[] = [];
      for (const feature of data.features) {
        const zipCode = feature.properties?.ZCTA5CE10;
        if (!zipCode) continue;

        const geometry = feature.geometry as Polygon | MultiPolygon;
        const bounds = computeBounds(geometry);
        const centroid = computeCentroid(bounds);

        features.push({ zipCode, geometry, bounds, centroid });
      }
      stateCache[stateCode] = features;
      delete loadingPromises[stateCode];
      return features;
    })
    .catch(() => {
      delete loadingPromises[stateCode];
      return [] as ZipFeature[];
    });

  loadingPromises[stateCode] = promise;
  return promise;
}

export function getStatesInViewport(viewBounds: {
  north: number;
  south: number;
  east: number;
  west: number;
}): string[] {
  return Object.entries(STATE_BOUNDS)
    .filter(([, sb]) => {
      // Check if state bounding box intersects viewport
      return !(
        sb.south > viewBounds.north ||
        sb.north < viewBounds.south ||
        sb.west > viewBounds.east ||
        sb.east < viewBounds.west
      );
    })
    .map(([code]) => code);
}

export function isFeatureInViewport(
  feature: ZipFeature,
  viewBounds: { north: number; south: number; east: number; west: number }
): boolean {
  return !(
    feature.bounds.south > viewBounds.north ||
    feature.bounds.north < viewBounds.south ||
    feature.bounds.west > viewBounds.east ||
    feature.bounds.east < viewBounds.west
  );
}

export function isStateLoaded(stateCode: string): boolean {
  return stateCode in stateCache;
}

export function getLoadedFeatures(): ZipFeature[] {
  return Object.values(stateCache).flat();
}
