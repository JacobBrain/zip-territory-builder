'use client';

import { useTerritory } from '@/lib/territoryState';

export default function TerritoryStats() {
  const { state } = useTerritory();

  const totalZips = Object.keys(state.zipAssignments).length;

  return (
    <div>
      <div className="sidebar-section-header">
        <span className="sidebar-section-title">Summary</span>
      </div>
      <div className="stats-grid">
        <div className="stat-item">
          <span className="stat-value">{state.locations.length}</span>
          <span className="stat-label">Locations</span>
        </div>
        <div className="stat-item">
          <span className="stat-value">{totalZips}</span>
          <span className="stat-label">Assigned Zips</span>
        </div>
      </div>
    </div>
  );
}
