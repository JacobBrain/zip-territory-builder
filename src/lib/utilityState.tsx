'use client';

import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';
import type { UtilityMapState, UtilityAction } from '@/types/utility';

export const DEFAULT_RADIUS_MILES = 50;

const initialState: UtilityMapState = {
  radiusMiles: DEFAULT_RADIUS_MILES,
  showRings: true,
  showSubstations: true,
  showPlants: true,
  selectedUtilityId: null,
  hoveredUtilityId: null,
  customStats: {},
  statsComputing: false,
  showHelp: false,
};

function reducer(state: UtilityMapState, action: UtilityAction): UtilityMapState {
  switch (action.type) {
    case 'SET_RADIUS':
      return { ...state, radiusMiles: action.payload };
    case 'TOGGLE_RINGS':
      return { ...state, showRings: !state.showRings };
    case 'TOGGLE_SUBSTATIONS':
      return { ...state, showSubstations: !state.showSubstations };
    case 'TOGGLE_PLANTS':
      return { ...state, showPlants: !state.showPlants };
    case 'SELECT_UTILITY':
      return { ...state, selectedUtilityId: action.payload };
    case 'HOVER_UTILITY':
      return { ...state, hoveredUtilityId: action.payload };
    case 'SET_CUSTOM_STATS':
      return {
        ...state,
        customStats: { ...state.customStats, [action.payload.radius]: action.payload.stats },
      };
    case 'SET_STATS_COMPUTING':
      return { ...state, statsComputing: action.payload };
    case 'SET_SHOW_HELP':
      return { ...state, showHelp: action.payload };
    default:
      return state;
  }
}

const UtilityContext = createContext<{
  state: UtilityMapState;
  dispatch: Dispatch<UtilityAction>;
} | null>(null);

export function UtilityProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <UtilityContext.Provider value={{ state, dispatch }}>{children}</UtilityContext.Provider>;
}

export function useUtilityMap() {
  const ctx = useContext(UtilityContext);
  if (!ctx) throw new Error('useUtilityMap must be used within UtilityProvider');
  return ctx;
}
