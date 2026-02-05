'use client';

import { useTerritory } from '@/lib/territoryState';
import LocationList from './LocationList';
import AddLocationForm from './AddLocationForm';
import TerritoryStats from './TerritoryStats';

export default function Sidebar() {
  const { state } = useTerritory();

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">
            Locations ({state.locations.length})
          </span>
        </div>
        <AddLocationForm />
      </div>

      <div className="sidebar-scroll">
        <LocationList />
      </div>

      <div className="sidebar-section">
        <TerritoryStats />
      </div>
    </div>
  );
}
