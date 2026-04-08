import type { TerritoryState, ExportData, Location, ZipToCityLookup } from '@/types';

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

export function exportToCityLookup(
  state: TerritoryState,
  zipToCityLookup: ZipToCityLookup
): string {
  // Build location ID → info map for fast lookup
  const locationMap = new Map<string, { name: string; address: string }>();
  for (const loc of state.locations) {
    locationMap.set(loc.id, { name: loc.name, address: loc.address });
  }

  // Build city+state → Set<locationId> (deduplicates naturally)
  const cityToLocationIds = new Map<string, Set<string>>();

  for (const [zipCode, locationId] of Object.entries(state.zipAssignments)) {
    const cityState = zipToCityLookup[zipCode];
    if (!cityState) continue;

    if (!cityToLocationIds.has(cityState)) {
      cityToLocationIds.set(cityState, new Set());
    }
    cityToLocationIds.get(cityState)!.add(locationId);
  }

  // Build sorted output
  const sortedCities = [...cityToLocationIds.keys()].sort();
  const result: Record<string, { locations: { name: string; address: string }[] }> = {};

  for (const city of sortedCities) {
    const locationIds = cityToLocationIds.get(city)!;
    const locations = [...locationIds]
      .map(id => locationMap.get(id))
      .filter((loc): loc is { name: string; address: string } => loc != null)
      .sort((a, b) => a.name.localeCompare(b.name));

    result[city] = { locations };
  }

  return JSON.stringify(result, null, 2);
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
