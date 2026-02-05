'use client';

import React, { createContext, useContext, useReducer, type ReactNode } from 'react';
import type { TerritoryState, TerritoryAction } from '@/types';

const initialState: TerritoryState = {
  locations: [],
  activeLocationId: null,
  zipAssignments: {},
  viewMode: 'edit',
  paintMode: false,
  eraserMode: false,
  showUnassignedOnly: false,
  isGeocoding: false,
  geocodingProgress: { current: 0, total: 0 },
  loadedStates: [],
  radiusPreview: null,
};

function territoryReducer(state: TerritoryState, action: TerritoryAction): TerritoryState {
  switch (action.type) {
    case 'ADD_LOCATION':
      return {
        ...state,
        locations: [...state.locations, action.payload],
      };

    case 'ADD_LOCATIONS':
      return {
        ...state,
        locations: [...state.locations, ...action.payload],
      };

    case 'UPDATE_LOCATION':
      return {
        ...state,
        locations: state.locations.map(loc =>
          loc.id === action.payload.id ? { ...loc, ...action.payload } : loc
        ),
      };

    case 'DELETE_LOCATION': {
      // Also remove all zip assignments for this location
      const newAssignments = { ...state.zipAssignments };
      for (const [zip, locId] of Object.entries(newAssignments)) {
        if (locId === action.payload) {
          delete newAssignments[zip];
        }
      }
      return {
        ...state,
        locations: state.locations.filter(loc => loc.id !== action.payload),
        zipAssignments: newAssignments,
        activeLocationId: state.activeLocationId === action.payload ? null : state.activeLocationId,
      };
    }

    case 'SET_ACTIVE_LOCATION':
      return {
        ...state,
        activeLocationId: action.payload,
        eraserMode: false,
      };

    case 'ASSIGN_ZIP': {
      const newAssignments = { ...state.zipAssignments };
      // Remove from old location's zipCodes array
      const oldLocationId = newAssignments[action.payload.zipCode];
      let locations = state.locations;
      if (oldLocationId && oldLocationId !== action.payload.locationId) {
        locations = locations.map(loc =>
          loc.id === oldLocationId
            ? { ...loc, zipCodes: loc.zipCodes.filter(z => z !== action.payload.zipCode) }
            : loc
        );
      }
      // Add to new location's zipCodes array
      newAssignments[action.payload.zipCode] = action.payload.locationId;
      locations = locations.map(loc =>
        loc.id === action.payload.locationId && !loc.zipCodes.includes(action.payload.zipCode)
          ? { ...loc, zipCodes: [...loc.zipCodes, action.payload.zipCode] }
          : loc
      );
      return { ...state, zipAssignments: newAssignments, locations };
    }

    case 'UNASSIGN_ZIP': {
      const newAssignments = { ...state.zipAssignments };
      const locId = newAssignments[action.payload];
      delete newAssignments[action.payload];
      return {
        ...state,
        zipAssignments: newAssignments,
        locations: state.locations.map(loc =>
          loc.id === locId
            ? { ...loc, zipCodes: loc.zipCodes.filter(z => z !== action.payload) }
            : loc
        ),
      };
    }

    case 'BULK_ASSIGN_ZIPS': {
      const newAssignments = { ...state.zipAssignments };
      let locations = [...state.locations];

      for (const zip of action.payload.zipCodes) {
        const oldLocId = newAssignments[zip];
        if (oldLocId && oldLocId !== action.payload.locationId) {
          const idx = locations.findIndex(l => l.id === oldLocId);
          if (idx !== -1) {
            locations[idx] = {
              ...locations[idx],
              zipCodes: locations[idx].zipCodes.filter(z => z !== zip),
            };
          }
        }
        newAssignments[zip] = action.payload.locationId;
      }

      // Add all to new location
      const targetIdx = locations.findIndex(l => l.id === action.payload.locationId);
      if (targetIdx !== -1) {
        const existing = new Set(locations[targetIdx].zipCodes);
        const newZips = action.payload.zipCodes.filter(z => !existing.has(z));
        locations[targetIdx] = {
          ...locations[targetIdx],
          zipCodes: [...locations[targetIdx].zipCodes, ...newZips],
        };
      }

      return { ...state, zipAssignments: newAssignments, locations };
    }

    case 'BULK_ASSIGN_UNASSIGNED_ZIPS': {
      // Only assign zips that are not already assigned to any location
      const newAssignments = { ...state.zipAssignments };
      const unassignedZips: string[] = [];

      for (const zip of action.payload.zipCodes) {
        if (!newAssignments[zip]) {
          newAssignments[zip] = action.payload.locationId;
          unassignedZips.push(zip);
        }
      }

      if (unassignedZips.length === 0) {
        return state;
      }

      const locations = state.locations.map(loc => {
        if (loc.id !== action.payload.locationId) return loc;
        const existing = new Set(loc.zipCodes);
        const newZips = unassignedZips.filter(z => !existing.has(z));
        return { ...loc, zipCodes: [...loc.zipCodes, ...newZips] };
      });

      return { ...state, zipAssignments: newAssignments, locations };
    }

    case 'IMPORT_STATE':
      return {
        ...initialState,
        ...action.payload,
      };

    case 'TOGGLE_ERASER_MODE':
      return { ...state, eraserMode: !state.eraserMode };

    case 'SET_GEOCODING':
      return { ...state, isGeocoding: action.payload };

    case 'SET_GEOCODING_PROGRESS':
      return { ...state, geocodingProgress: action.payload };

    case 'MARK_STATE_LOADED':
      return {
        ...state,
        loadedStates: state.loadedStates.includes(action.payload)
          ? state.loadedStates
          : [...state.loadedStates, action.payload],
      };

    case 'TOGGLE_SHOW_UNASSIGNED':
      return { ...state, showUnassignedOnly: !state.showUnassignedOnly };

    case 'SET_RADIUS_PREVIEW':
      return { ...state, radiusPreview: action.payload };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

interface TerritoryContextType {
  state: TerritoryState;
  dispatch: React.Dispatch<TerritoryAction>;
}

const TerritoryContext = createContext<TerritoryContextType | undefined>(undefined);

export function TerritoryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(territoryReducer, initialState);

  return (
    <TerritoryContext.Provider value={{ state, dispatch }}>
      {children}
    </TerritoryContext.Provider>
  );
}

export function useTerritory() {
  const context = useContext(TerritoryContext);
  if (!context) {
    throw new Error('useTerritory must be used within a TerritoryProvider');
  }
  return context;
}
