'use client';

import { useUtilityMap } from '@/lib/utilityState';

const PRESET_RADII = [25, 50, 100];

/** Floating layers/settings toolbar (top-right). */
export default function LayersToolbar() {
  const { state, dispatch } = useUtilityMap();

  return (
    <div className="map-panel layers-toolbar">
      <div className="layers-toolbar-row">
        <input
          type="number"
          className="radius-input"
          min={5}
          max={500}
          value={state.radiusMiles}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v) && v > 0) dispatch({ type: 'SET_RADIUS', payload: v });
          }}
        />
        <span className="radius-unit">mi</span>
        {PRESET_RADII.map((r) => (
          <button
            key={r}
            className={`btn-sm ${state.radiusMiles === r ? 'btn-sm-primary' : 'btn-sm-ghost'}`}
            onClick={() => dispatch({ type: 'SET_RADIUS', payload: r })}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="layers-toolbar-row layers-toolbar-checks">
        <label>
          <input
            type="checkbox"
            checked={state.showRings}
            onChange={() => dispatch({ type: 'TOGGLE_RINGS' })}
          />
          Radius rings
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.showSubstations}
            onChange={() => dispatch({ type: 'TOGGLE_SUBSTATIONS' })}
          />
          Substations
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.showPlants}
            onChange={() => dispatch({ type: 'TOGGLE_PLANTS' })}
          />
          Power plants
        </label>
      </div>
      {state.statsComputing && (
        <div style={{ fontSize: 11, color: '#6B7280' }}>computing coverage…</div>
      )}
      {!state.selectedUtilityId && (
        <div style={{ fontSize: 11, color: '#9CA3AF' }}>Layers appear when a utility is selected</div>
      )}
    </div>
  );
}
