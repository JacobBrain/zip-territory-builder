import type { TerritoryState, ExportData, Location, ZipToCityLookup, LocationIdMapping } from '@/types';
import locationIdMapping from './location-ids.json';

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

export interface CityLookupExport {
  json: string;
  unmappedNames: string[];
}

export function exportToCityLookup(
  state: TerritoryState,
  zipToCityLookup: ZipToCityLookup
): CityLookupExport {
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

  // Build by_city: lowercase_city → lowercase_state → array of export IDs
  const byCity: Record<string, Record<string, Array<number | string>>> = {};
  for (const [zipCode, locationId] of Object.entries(state.zipAssignments)) {
    const exportId = idMap.get(locationId);
    if (exportId == null) continue;
    const cityState = zipToCityLookup[zipCode];
    if (!cityState) continue;

    const lastComma = cityState.lastIndexOf(', ');
    const cityRaw = lastComma !== -1 ? cityState.slice(0, lastComma) : cityState;
    const stateRaw = lastComma !== -1 ? cityState.slice(lastComma + 2) : '';

    const cityKey = cityRaw.toLowerCase().replace(/\s+/g, '_');
    const stateKey = stateRaw.toLowerCase();

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

  // Sort by_city keys alphabetically
  const sortedByCity: Record<string, Record<string, Array<number | string>>> = {};
  for (const cityKey of Object.keys(byCity).sort()) {
    sortedByCity[cityKey] = byCity[cityKey];
  }

  const json = JSON.stringify({ locations, by_zip: byZip, by_city: sortedByCity }, null, 2);
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
