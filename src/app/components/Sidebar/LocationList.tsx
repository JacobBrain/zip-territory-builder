'use client';

import { useState } from 'react';
import { useTerritory } from '@/lib/territoryState';
import { useToast } from '@/app/components/UI/Toast';
import { getZipsWithinRadius } from '@/lib/radiusSelect';

export default function LocationList() {
  const { state, dispatch } = useTerritory();
  const { addToast } = useToast();
  const [radiusOpenId, setRadiusOpenId] = useState<string | null>(null);
  const [radiusMiles, setRadiusMiles] = useState(90);
  const [isApplying, setIsApplying] = useState(false);

  if (state.locations.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">&#x1F4CD;</div>
        <div className="empty-state-title">No locations yet</div>
        <div className="empty-state-text">
          Upload a CSV or add locations manually to get started
        </div>
      </div>
    );
  }

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete "${name}"? All assigned zip codes will be unassigned.`)) {
      dispatch({ type: 'DELETE_LOCATION', payload: id });
    }
  };

  const handleRadiusToggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const closing = radiusOpenId === id;
    setRadiusOpenId(closing ? null : id);

    if (closing) {
      dispatch({ type: 'SET_RADIUS_PREVIEW', payload: null });
    } else {
      const loc = state.locations.find(l => l.id === id);
      if (loc) {
        dispatch({
          type: 'SET_RADIUS_PREVIEW',
          payload: { lat: loc.lat, lng: loc.lng, radiusMiles },
        });
      }
    }
  };

  const handleApplyRadius = async (locationId: string, fillGapsOnly: boolean) => {
    const location = state.locations.find(l => l.id === locationId);
    if (!location) return;

    setIsApplying(true);
    try {
      const zips = await getZipsWithinRadius(location.lat, location.lng, radiusMiles);
      if (zips.length === 0) {
        addToast(`No zip codes found within ${radiusMiles} miles of ${location.name}`, 'info');
      } else if (fillGapsOnly) {
        const unassigned = zips.filter(z => !state.zipAssignments[z]);
        if (unassigned.length === 0) {
          addToast(`All ${zips.length} zips within ${radiusMiles} mi are already assigned`, 'info');
        } else {
          dispatch({
            type: 'BULK_ASSIGN_UNASSIGNED_ZIPS',
            payload: { zipCodes: zips, locationId },
          });
          addToast(
            `Filled ${unassigned.length} unassigned zips within ${radiusMiles} mi of ${location.name}`,
            'success',
          );
        }
      } else {
        dispatch({
          type: 'BULK_ASSIGN_ZIPS',
          payload: { zipCodes: zips, locationId },
        });
        addToast(
          `Assigned ${zips.length} zip codes within ${radiusMiles} mi of ${location.name}`,
          'success',
        );
      }
    } catch {
      addToast('Failed to load zip code data. Try again.', 'error');
    } finally {
      setIsApplying(false);
      setRadiusOpenId(null);
      dispatch({ type: 'SET_RADIUS_PREVIEW', payload: null });
    }
  };

  return (
    <div>
      {state.locations.map(location => (
        <div key={location.id}>
          <div
            className={`location-item ${location.id === state.activeLocationId ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_LOCATION', payload: location.id })}
          >
            <div
              className="location-color-dot"
              style={{ backgroundColor: location.color }}
            />
            <div className="location-item-info">
              <div className="location-item-name">{location.name}</div>
              <div className="location-item-meta">
                {location.zipCodes.length} zip codes
              </div>
            </div>
            <div className="location-item-actions">
              <button
                className="location-action-btn"
                title="Auto-assign by radius"
                onClick={(e) => handleRadiusToggle(location.id, e)}
              >
                &#x25CE;
              </button>
              <button
                className="location-action-btn"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(location.id, location.name);
                }}
              >
                &#x2715;
              </button>
            </div>
          </div>

          {radiusOpenId === location.id && (
            <div className="radius-panel" onClick={(e) => e.stopPropagation()}>
              <div className="radius-panel-label">Auto-assign zips within radius</div>
              <div className="radius-panel-row">
                <input
                  type="number"
                  className="radius-input"
                  value={radiusMiles}
                  onChange={(e) => {
                    const val = Math.max(1, Number(e.target.value));
                    setRadiusMiles(val);
                    dispatch({
                      type: 'SET_RADIUS_PREVIEW',
                      payload: { lat: location.lat, lng: location.lng, radiusMiles: val },
                    });
                  }}
                  min={1}
                  max={500}
                />
                <span className="radius-unit">miles</span>
              </div>
              <div className="radius-panel-buttons">
                <button
                  className="btn-sm btn-sm-primary"
                  disabled={isApplying}
                  onClick={() => handleApplyRadius(location.id, false)}
                >
                  {isApplying ? 'Loading...' : 'Apply'}
                </button>
                <button
                  className="btn-sm btn-sm-ghost"
                  disabled={isApplying}
                  onClick={() => handleApplyRadius(location.id, true)}
                  title="Only assign zips not already claimed by another location"
                >
                  Fill gaps
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
