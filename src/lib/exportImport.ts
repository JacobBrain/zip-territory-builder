import type { Polygon, MultiPolygon } from 'geojson';
import type { TerritoryState, ExportData, Location, ZipToCityLookup, LocationIdMapping, USPlaces } from '@/types';
import { loadStateGeoJSON, STATE_BOUNDS } from './zipBoundaries';
import type { ZipFeature } from './zipBoundaries';
import locationIdMapping from './location-ids.json';

// Ray-casting algorithm: returns true when [lng, lat] is inside the ring.
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// True when [lng, lat] falls inside the geometry (handles holes and MultiPolygon).
function pointInGeometry(lng: number, lat: number, geometry: Polygon | MultiPolygon): boolean {
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.coordinates;
  for (const rings of polygons) {
    if (!pointInRing(lng, lat, rings[0])) continue;
    let inHole = false;
    for (let h = 1; h < rings.length; h++) {
      if (pointInRing(lng, lat, rings[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

// Load every state's GeoJSON features in parallel.
async function loadAllStateFeatures(): Promise<ZipFeature[]> {
  const codes = Object.keys(STATE_BOUNDS);
  const results = await Promise.all(codes.map(c => loadStateGeoJSON(c)));
  return results.flat();
}

export function exportToJSON(state: TerritoryState): string {
  const totalAssignedZips = Object.keys(state.zipAssignments).length;

  const exportData: ExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    locations: state.locations.map(loc => ({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      lat: loc.lat,
      lng: loc.lng,
      color: loc.color,
      zipCodes: loc.zipCodes,
    })),
    metadata: {
      totalLocations: state.locations.length,
      totalAssignedZips,
      unassignedZips: 0, // Will be calculated when we have boundary data
    },
  };

  return JSON.stringify(exportData, null, 2);
}

export function exportToCSV(state: TerritoryState): string {
  const rows: string[] = ['zip_code,location_name,location_address'];

  const sortedLocations = [...state.locations].sort((a, b) => a.name.localeCompare(b.name));

  for (const loc of sortedLocations) {
    const sortedZips = [...loc.zipCodes].sort();
    for (const zip of sortedZips) {
      const escapedName = loc.name.includes(',') ? `"${loc.name}"` : loc.name;
      const escapedAddress = loc.address.includes(',') ? `"${loc.address}"` : loc.address;
      rows.push(`${zip},${escapedName},${escapedAddress}`);
    }
  }

  return rows.join('\n');
}

export function importFromJSON(jsonString: string): { success: boolean; state?: Partial<TerritoryState>; error?: string } {
  try {
    const data = JSON.parse(jsonString) as ExportData;

    if (!data.version || !data.locations || !Array.isArray(data.locations)) {
      return { success: false, error: 'Invalid file format: missing required fields' };
    }

    // Rebuild state from export data
    const locations: Location[] = data.locations.map(loc => ({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      formattedAddress: loc.address,
      lat: loc.lat,
      lng: loc.lng,
      color: loc.color,
      zipCodes: loc.zipCodes || [],
      createdAt: new Date().toISOString(),
    }));

    // Rebuild zipAssignments from locations
    const zipAssignments: Record<string, string> = {};
    for (const loc of locations) {
      for (const zip of loc.zipCodes) {
        zipAssignments[zip] = loc.id;
      }
    }

    return {
      success: true,
      state: {
        locations,
        zipAssignments,
        activeLocationId: null,
      },
    };
  } catch {
    return { success: false, error: 'Invalid JSON file' };
  }
}

export async function loadZipToCityLookup(): Promise<ZipToCityLookup> {
  const response = await fetch('/data/zip-to-city.json');
  if (!response.ok) {
    throw new Error('Failed to load ZIP-to-city data. Run npm run prebuild first.');
  }
  return response.json();
}

// US municipalities used to enrich by_city with names USPS folds into a larger
// preferred city (Doraville -> "Atlanta"). Optional: returns [] when the file
// is absent so an older build still exports (without the extra city names).
export async function loadUSPlaces(): Promise<USPlaces> {
  try {
    const response = await fetch('/data/us-places.json');
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

// Full US state name → USPS abbreviation. Used so "Tampa, Florida" matches "Tampa, FL".
const US_STATE_ABBREV: Record<string, string> = {
  alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca',
  colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga',
  hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia',
  kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md',
  massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo',
  montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj',
  'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd',
  ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri',
  'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut',
  vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv',
  wisconsin: 'wi', wyoming: 'wy', 'district of columbia': 'dc',
};

// Normalize a territory name so trailing "*", casing, whitespace, and full state names
// don't prevent a match against location-ids.json keys.
function normalizeLocationName(name: string): string {
  const base = name.trim().toLowerCase().replace(/\*+$/, '').trim();
  const lastComma = base.lastIndexOf(',');
  if (lastComma === -1) return base;
  const city = base.slice(0, lastComma).trim();
  const state = base.slice(lastComma + 1).trim().replace(/\*+$/, '').trim();
  const abbrev = US_STATE_ABBREV[state] ?? state;
  return `${city}, ${abbrev}`;
}

// Manual owner for cities whose ZIPs split evenly across two territories, where a
// majority-ZIP tiebreak can't decide. Keyed "city_key|state" → WordPress location
// ID. Also usable to override the automatic dominant-branch pick if MEG disagrees.
const CITY_TIEBREAK: Record<string, number> = {
  'somerset|pa': 2322,       // Ohio Valley, OH — Somerset is SW PA, ~40mi from Pittsburgh
  'bowling_green|oh': 3934,  // Columbus — NW Ohio, closer to Columbus than Youngstown
};

export interface CityLookupExport {
  json: string;
  unmappedNames: string[];
}

export async function exportToCityLookup(
  state: TerritoryState,
  zipToCityLookup: ZipToCityLookup,
  usPlaces: USPlaces = []
): Promise<CityLookupExport> {
  // Build normalized-name → numeric ID lookup so minor naming drift (trailing *,
  // "Florida" vs "FL", casing, whitespace) doesn't cause a territory to be dropped.
  const idLookup = new Map<string, number>();
  for (const [key, numId] of Object.entries(locationIdMapping as LocationIdMapping)) {
    idLookup.set(normalizeLocationName(key), numId);
  }

  // Map each territory's internal ID to either a numeric export ID or a string
  // placeholder "unknown:<name>" so unmapped territories are visible in the export
  // instead of silently dropped.
  const idMap = new Map<string, number | string>();
  const unmappedNames: string[] = [];
  for (const loc of state.locations) {
    const numId = idLookup.get(normalizeLocationName(loc.name));
    if (numId != null) {
      idMap.set(loc.id, numId);
    } else {
      idMap.set(loc.id, `unknown:${loc.name}`);
      unmappedNames.push(loc.name);
    }
  }

  // Build locations list sorted by name
  const sortedLocations = [...state.locations].sort((a, b) => a.name.localeCompare(b.name));
  const locations = sortedLocations.map(loc => ({ id: idMap.get(loc.id)!, name: loc.name }));

  // Build by_zip: zip code → array of export IDs (number, or "unknown:<name>" string)
  const byZip: Record<string, Array<number | string>> = {};
  for (const [zipCode, locationId] of Object.entries(state.zipAssignments)) {
    const exportId = idMap.get(locationId);
    if (exportId == null) continue;
    if (!byZip[zipCode]) {
      byZip[zipCode] = [exportId];
    } else if (!byZip[zipCode].includes(exportId)) {
      byZip[zipCode].push(exportId);
    }
  }

  // Derive the "City, ST" for a ZIP into normalized (cityKey, stateKey), matching
  // the by_city key style. Returns null when the ZIP has no city entry.
  const cityStateKeyForZip = (zipCode: string): [string, string] | null => {
    const entry = zipToCityLookup[zipCode];
    if (!entry) return null;
    const cityState = entry.city;
    const lastComma = cityState.lastIndexOf(', ');
    const cityRaw = lastComma !== -1 ? cityState.slice(0, lastComma) : cityState;
    const stateRaw = lastComma !== -1 ? cityState.slice(lastComma + 2) : '';
    return [cityRaw.toLowerCase().replace(/\s+/g, '_'), stateRaw.toLowerCase()];
  };

  // Build by_city: lowercase_city → lowercase_state → array of export IDs.
  const byCity: Record<string, Record<string, Array<number | string>>> = {};
  for (const [zipCode, locationId] of Object.entries(state.zipAssignments)) {
    const exportId = idMap.get(locationId);
    if (exportId == null) continue;
    const ck = cityStateKeyForZip(zipCode);
    if (!ck) continue;
    const [cityKey, stateKey] = ck;

    if (!byCity[cityKey]) {
      byCity[cityKey] = {};
    }
    if (!byCity[cityKey][stateKey]) {
      byCity[cityKey][stateKey] = [];
    }
    if (!byCity[cityKey][stateKey].includes(exportId)) {
      byCity[cityKey][stateKey].push(exportId);
    }
  }

  // Backfill by_zip: ZIPs without Census boundaries (PO Box / unique ZIPs) won't
  // appear on the map and can't be painted, but they're valid addresses. For each
  // such ZIP we check whether its coordinates fall inside an assigned ZIP's polygon
  // and, if so, assign it to the same territory.
  const allFeatures = await loadAllStateFeatures();

  // Build a quick lookup: zipCode → territoryExportId for assigned zips
  const assignedZipExportId = new Map<string, Array<number | string>>();
  for (const [zipCode, ids] of Object.entries(byZip)) {
    assignedZipExportId.set(zipCode, ids);
  }

  // Index features that belong to an assigned territory, with their bounds for fast rejection
  const assignedFeatures: { feature: ZipFeature; exportIds: Array<number | string> }[] = [];
  for (const feat of allFeatures) {
    const ids = assignedZipExportId.get(feat.zipCode);
    if (ids) {
      assignedFeatures.push({ feature: feat, exportIds: ids });
    }
  }

  // Check each unassigned ZIP's coordinates against assigned polygons
  for (const [zipCode, entry] of Object.entries(zipToCityLookup)) {
    if (byZip[zipCode]) continue; // already assigned
    const { lat, lng } = entry;
    if (!lat && !lng) continue;

    for (const { feature, exportIds } of assignedFeatures) {
      // Fast bounding-box rejection
      const b = feature.bounds;
      if (lat < b.south || lat > b.north || lng < b.west || lng > b.east) continue;

      if (pointInGeometry(lng, lat, feature.geometry)) {
        byZip[zipCode] = [...exportIds];
        break;
      }
    }
  }

  // Enrich by_city with municipalities USPS folds into a larger "preferred" city.
  // The ZIP-derived pass above keys by_city on each ZIP's single USPS city name
  // (e.g. 30340/30362 -> "Atlanta"), so sub-municipalities like Doraville,
  // Chamblee and Dunwoody never get a key and a city search falls through to the
  // National Solutions catch-all. Here we place each real municipality inside its
  // containing assigned ZIP and map its name to that ZIP's territory.
  //
  // Conservative on purpose: we never modify a city/state entry the ZIP pass
  // already produced, and we only add a NEW one when every place of that name in
  // the state resolves to a single territory. Same-named places that span
  // multiple territories (there are several "Centerville"s in PA) stay out rather
  // than becoming ambiguous multi-territory entries that also hit the fallback.
  if (usPlaces.length > 0) {
    const cityKeyFromName = (name: string) =>
      name.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '_');

    // candidate (cityKey|state) → set of territory export IDs (JSON-encoded for
    // number|string equality)
    const candidates = new Map<string, Set<string>>();
    for (const [name, stateAbbr, lat, lng] of usPlaces) {
      if (!lat && !lng) continue;
      const cityKey = cityKeyFromName(name);
      const stateKey = stateAbbr.toLowerCase();
      if (!cityKey) continue;
      if (byCity[cityKey]?.[stateKey]) continue; // never touch the ZIP-derived entry

      let containing: Array<number | string> | null = null;
      for (const { feature, exportIds } of assignedFeatures) {
        const b = feature.bounds;
        if (lat < b.south || lat > b.north || lng < b.west || lng > b.east) continue;
        if (pointInGeometry(lng, lat, feature.geometry)) {
          containing = exportIds;
          break;
        }
      }
      if (!containing) continue;

      const mapKey = `${cityKey}|${stateKey}`;
      let set = candidates.get(mapKey);
      if (!set) { set = new Set(); candidates.set(mapKey, set); }
      for (const id of containing) set.add(JSON.stringify(id));
    }

    for (const [mapKey, idSet] of candidates) {
      if (idSet.size !== 1) continue; // ambiguous → leave out
      const [cityKey, stateKey] = mapKey.split('|');
      const id = JSON.parse([...idSet][0]) as number | string;
      if (!byCity[cityKey]) byCity[cityKey] = {};
      byCity[cityKey][stateKey] = [id];
    }
  }

  // Tally how many ZIPs of each city/state fall in each territory, using the FINAL
  // by_zip (after backfill) so the dominant-branch pick reflects every ZIP the site
  // will resolve, not just the pre-backfill assignments.
  const cityZipCounts = new Map<string, Map<string, number>>(); // "city|state" → (exportId JSON → count)
  for (const [zipCode, ids] of Object.entries(byZip)) {
    const ck = cityStateKeyForZip(zipCode);
    if (!ck) continue;
    const countKey = `${ck[0]}|${ck[1]}`;
    let counts = cityZipCounts.get(countKey);
    if (!counts) { counts = new Map(); cityZipCounts.set(countKey, counts); }
    for (const id of ids) {
      const idJson = JSON.stringify(id);
      counts.set(idJson, (counts.get(idJson) ?? 0) + 1);
    }
  }

  // Collapse straddle cities to a single territory. A city whose ZIPs span two
  // territories (e.g. Pittsburgh across Ohio Valley + Youngstown) otherwise leaves
  // a multi-ID by_city entry, and a city-only search can't pick one → the site
  // falls back to National Solutions. Resolve each to the territory holding the
  // most of that city's ZIPs; on an even split use CITY_TIEBREAK, else the lowest
  // ID (deterministic). ZIP lookups keep full precision via by_zip.
  for (const [cityKey, states] of Object.entries(byCity)) {
    for (const [stateKey, ids] of Object.entries(states)) {
      if (ids.length <= 1) continue;
      const counts = cityZipCounts.get(`${cityKey}|${stateKey}`);
      let max = -1;
      let tied: Array<number | string> = [];
      for (const id of ids) {
        const c = counts?.get(JSON.stringify(id)) ?? 0;
        if (c > max) { max = c; tied = [id]; }
        else if (c === max) { tied.push(id); }
      }
      let winner: number | string;
      const override = CITY_TIEBREAK[`${cityKey}|${stateKey}`];
      if (tied.length > 1 && override != null && ids.includes(override)) {
        winner = override;
      } else {
        // stable pick among the top-count ids: lowest numeric id, else first
        winner = [...tied].sort((a, b) =>
          typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
        )[0];
      }
      states[stateKey] = [winner];
    }
  }

  // Sort by_city keys alphabetically
  const sortedByCity: Record<string, Record<string, Array<number | string>>> = {};
  for (const cityKey of Object.keys(byCity).sort()) {
    sortedByCity[cityKey] = byCity[cityKey];
  }

  // Include an `_unmapped` top-level array only when there are territories without
  // a WordPress ID mapping. Travels with the file so anyone who opens it (dev, client)
  // sees the same list that was shown in the UI at export time.
  const payload: Record<string, unknown> = { locations, by_zip: byZip, by_city: sortedByCity };
  if (unmappedNames.length > 0) {
    payload._unmapped = unmappedNames;
  }

  const json = JSON.stringify(payload, null, 2);
  return { json, unmappedNames };
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getExportFilename(extension: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `territories_${date}_${time}.${extension}`;
}
