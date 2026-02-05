export interface Location {
  id: string;
  name: string;
  address: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  color: string;
  zipCodes: string[];
  createdAt: string;
}

export interface TerritoryState {
  locations: Location[];
  activeLocationId: string | null;
  zipAssignments: Record<string, string>; // zipCode -> locationId
  viewMode: 'edit' | 'view';
  paintMode: boolean;
  eraserMode: boolean;
  showUnassignedOnly: boolean;
  isGeocoding: boolean;
  geocodingProgress: { current: number; total: number };
  loadedStates: string[];
  radiusPreview: { lat: number; lng: number; radiusMiles: number } | null;
}

export type TerritoryAction =
  | { type: 'ADD_LOCATION'; payload: Location }
  | { type: 'ADD_LOCATIONS'; payload: Location[] }
  | { type: 'UPDATE_LOCATION'; payload: Partial<Location> & { id: string } }
  | { type: 'DELETE_LOCATION'; payload: string }
  | { type: 'SET_ACTIVE_LOCATION'; payload: string | null }
  | { type: 'ASSIGN_ZIP'; payload: { zipCode: string; locationId: string } }
  | { type: 'UNASSIGN_ZIP'; payload: string }
  | { type: 'BULK_ASSIGN_ZIPS'; payload: { zipCodes: string[]; locationId: string } }
  | { type: 'BULK_ASSIGN_UNASSIGNED_ZIPS'; payload: { zipCodes: string[]; locationId: string } }
  | { type: 'IMPORT_STATE'; payload: Partial<TerritoryState> }
  | { type: 'TOGGLE_ERASER_MODE' }
  | { type: 'SET_GEOCODING'; payload: boolean }
  | { type: 'SET_GEOCODING_PROGRESS'; payload: { current: number; total: number } }
  | { type: 'MARK_STATE_LOADED'; payload: string }
  | { type: 'TOGGLE_SHOW_UNASSIGNED' }
  | { type: 'SET_RADIUS_PREVIEW'; payload: { lat: number; lng: number; radiusMiles: number } | null }
  | { type: 'RESET' };

export interface GeocodeResult {
  success: boolean;
  lat?: number;
  lng?: number;
  formattedAddress?: string;
  error?: string;
}

export interface ExportData {
  version: string;
  exportedAt: string;
  locations: {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    color: string;
    zipCodes: string[];
  }[];
  metadata: {
    totalLocations: number;
    totalAssignedZips: number;
    unassignedZips: number;
  };
}

export interface CSVRow {
  name: string;
  address: string;
  lat?: string;
  lng?: string;
  color?: string;
}
