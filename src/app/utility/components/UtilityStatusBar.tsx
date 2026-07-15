'use client';

import { useEffect, useState } from 'react';
import { useUtilityMap } from '@/lib/utilityState';
import { megLocations, loadFieldLocations, fieldCoverage, formatPct } from '@/lib/utilityData';
import type { UtilityDataset, FieldLocationsDataset } from '@/types/utility';

export default function UtilityStatusBar({ dataset }: { dataset: UtilityDataset | null }) {
  const { state } = useUtilityMap();
  const [fieldData, setFieldData] = useState<FieldLocationsDataset | null>(null);

  useEffect(() => {
    if (!state.selectedUtilityId || fieldData) return;
    let cancelled = false;
    loadFieldLocations()
      .then((d) => {
        if (!cancelled) setFieldData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.selectedUtilityId, fieldData]);

  const selected = dataset?.utilities.find((u) => u.id === state.selectedUtilityId);
  const fieldEntry = selected && fieldData ? fieldData.byUtility[selected.id] : null;
  const subs = fieldEntry ? fieldCoverage(fieldEntry.substations, state.radiusMiles) : null;

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <span className="status-indicator">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2E7D32', display: 'inline-block' }} />
          {megLocations.filter((l) => !l.tsdf).length} MEG branches
        </span>
        <span className="status-indicator">
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#1E88E5', display: 'inline-block' }} />
          {megLocations.filter((l) => l.tsdf).length} TSDFs
        </span>
        <span className="status-indicator">
          <span style={{ width: 8, height: 8, background: '#0C1B32', display: 'inline-block', transform: 'rotate(45deg)' }} />
          {dataset?.utilities.length ?? '…'} utilities
        </span>
      </div>
      <div className="status-bar-center">
        {selected && subs && subs.total > 0 ? (
          <span className="status-indicator">
            {selected.name}: {subs.within.toLocaleString('en-US')}/{subs.total.toLocaleString('en-US')} substations
            within {state.radiusMiles} mi ({formatPct(subs.pct)})
          </span>
        ) : null}
      </div>
      <div className="status-bar-right">
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>
          Territories: EIA Form 861 federal filings · distances straight-line
        </span>
      </div>
    </div>
  );
}
