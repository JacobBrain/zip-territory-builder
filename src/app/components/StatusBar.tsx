'use client';

import { useTerritory } from '@/lib/territoryState';

export default function StatusBar() {
  const { state, dispatch } = useTerritory();

  const activeLocation = state.locations.find(l => l.id === state.activeLocationId);
  const totalAssigned = Object.keys(state.zipAssignments).length;

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        {state.eraserMode ? (
          <span className="status-indicator status-indicator-eraser">
            Eraser Mode: Click zips to unassign
          </span>
        ) : activeLocation ? (
          <span className="status-indicator status-indicator-active">
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: activeLocation.color,
              }}
            />
            Assigning to: {activeLocation.name}
          </span>
        ) : (
          <span>Select a location to begin assigning zip codes</span>
        )}
      </div>
      <div className="status-bar-center">
        <span>{totalAssigned} assigned</span>
      </div>
      <div className="status-bar-right">
        <button
          className="btn-sm btn-sm-ghost"
          onClick={() => dispatch({ type: 'TOGGLE_ERASER_MODE' })}
          style={{
            padding: '0.125rem 0.5rem',
            fontSize: '0.6875rem',
            background: state.eraserMode ? 'rgba(236, 123, 87, 0.15)' : undefined,
            color: state.eraserMode ? 'var(--aw-burnt-sienna)' : undefined,
          }}
        >
          {state.eraserMode ? 'Eraser ON (E)' : 'Eraser (E)'}
        </button>
        <span style={{ fontSize: '0.6875rem', color: 'var(--aw-french-gray)' }}>
          Shift+Drag to paint
        </span>
      </div>
    </div>
  );
}
