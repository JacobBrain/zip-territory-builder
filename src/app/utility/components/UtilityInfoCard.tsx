'use client';

import { useEffect, useState } from 'react';
import { useUtilityMap } from '@/lib/utilityState';
import {
  megLocations,
  getCoverage,
  formatCustomers,
  formatPct,
  loadFieldLocations,
  fieldCoverage,
} from '@/lib/utilityData';
import { computeCoverage } from '@/lib/coverage';
import UtilityDetailPanel from './UtilityDetailPanel';
import type { UtilityDataset, FieldLocationsDataset } from '@/types/utility';

/**
 * Floating info card: dataset overview when nothing is selected, full
 * coverage + provenance details for the selected utility otherwise.
 */
export default function UtilityInfoCard({
  dataset,
  loadError,
}: {
  dataset: UtilityDataset | null;
  loadError: string | null;
}) {
  const { state, dispatch } = useUtilityMap();
  const [fieldData, setFieldData] = useState<FieldLocationsDataset | null>(null);

  const radiusIsPrecomputed = dataset?.radiiPrecomputed.includes(state.radiusMiles) ?? false;

  // Custom-radius area coverage (turf, async) - powers overview avg + selected %
  useEffect(() => {
    if (!dataset || radiusIsPrecomputed) return;
    if (state.customStats[state.radiusMiles]) return;
    const radius = state.radiusMiles;
    let cancelled = false;
    dispatch({ type: 'SET_STATS_COMPUTING', payload: true });
    computeCoverage(dataset.utilities, megLocations, radius)
      .then((stats) => {
        if (!cancelled) dispatch({ type: 'SET_CUSTOM_STATS', payload: { radius, stats } });
      })
      .finally(() => {
        if (!cancelled) dispatch({ type: 'SET_STATS_COMPUTING', payload: false });
      });
    return () => {
      cancelled = true;
    };
  }, [dataset, state.radiusMiles, radiusIsPrecomputed, state.customStats, dispatch]);

  // Lazy-load field locations once a utility is selected
  useEffect(() => {
    if (!state.selectedUtilityId || fieldData) return;
    let cancelled = false;
    loadFieldLocations()
      .then((data) => {
        if (!cancelled) setFieldData(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [state.selectedUtilityId, fieldData]);

  if (loadError) {
    return (
      <div className="map-panel utility-info-card">
        <p style={{ color: 'var(--aw-claret)', fontSize: 13, margin: 0 }}>
          Failed to load utility data: {loadError}
        </p>
      </div>
    );
  }
  if (!dataset) {
    return (
      <div className="map-panel utility-info-card">
        <p style={{ color: '#6B7280', fontSize: 13, margin: 0 }}>Loading utilities…</p>
      </div>
    );
  }

  const selected = dataset.utilities.find((u) => u.id === state.selectedUtilityId) ?? null;

  // ---- Overview (no selection) ----
  if (!selected) {
    const coverages = dataset.utilities.map((u) => getCoverage(u, state.radiusMiles, state.customStats));
    const covered90 = coverages.filter((c) => c.pct !== null && c.pct >= 0.9).length;
    const known = coverages.filter((c) => c.pct !== null) as { pct: number }[];
    const avg = known.length ? known.reduce((s, c) => s + c.pct, 0) / known.length : null;

    return (
      <div className="map-panel utility-info-card">
        <div className="stats-grid" style={{ marginBottom: 6 }}>
          <div className="stat-item">
            <div className="stat-value">{dataset.utilities.length}</div>
            <div className="stat-label">Utilities</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{covered90}</div>
            <div className="stat-label">&ge;90% within {state.radiusMiles} mi</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{avg !== null ? formatPct(avg) : '—'}</div>
            <div className="stat-label">Avg coverage</div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>
          Search above or click a territory on the map to see MEG&apos;s coverage of that
          utility&apos;s service area and field locations.
        </p>
      </div>
    );
  }

  // ---- Selected utility ----
  const territory = getCoverage(selected, state.radiusMiles, state.customStats);
  const fieldEntry = fieldData?.byUtility[selected.id];
  const subs = fieldEntry ? fieldCoverage(fieldEntry.substations, state.radiusMiles) : null;
  const plants = fieldEntry ? fieldCoverage(fieldEntry.plants, state.radiusMiles) : null;

  return (
    <div className="map-panel utility-info-card">
      <div className="utility-info-header">
        <div>
          <div className="utility-info-name">{selected.name}</div>
          <div className="utility-info-meta">
            {selected.parentCo ? `${selected.parentCo} · ` : ''}
            {selected.states.join(', ')} · {formatCustomers(selected.customers)} customers
          </div>
        </div>
        <button
          className="utility-info-close"
          title="Close (Esc)"
          onClick={() => dispatch({ type: 'SELECT_UTILITY', payload: null })}
        >
          &times;
        </button>
      </div>

      <div className="field-stats" style={{ margin: '8px 0' }}>
        <div>
          <strong>{territory.pct !== null ? formatPct(territory.pct) : state.statsComputing ? 'computing…' : '—'}</strong>{' '}
          of service territory within {state.radiusMiles} mi of a MEG location
        </div>
        {!fieldEntry && <div style={{ color: '#9CA3AF' }}>Loading field locations…</div>}
        {subs && subs.total > 0 && (
          <div>
            <strong>{subs.within.toLocaleString('en-US')}</strong> of{' '}
            <strong>{subs.total.toLocaleString('en-US')}</strong> substations in territory within{' '}
            {state.radiusMiles} mi{subs.pct !== null && <> ({formatPct(subs.pct)})</>}
          </div>
        )}
        {plants &&
          (plants.total > 0 ? (
            <div>
              <strong>{plants.within}</strong> of <strong>{plants.total}</strong> owned power plants
              within {state.radiusMiles} mi{plants.pct !== null && <> ({formatPct(plants.pct)})</>}
            </div>
          ) : (
            <div style={{ color: '#9CA3AF' }}>No generation plants owned (distribution-only utility)</div>
          ))}
      </div>

      <div className="utility-info-scroll">
        <UtilityDetailPanel utility={selected} dataset={dataset} fieldData={fieldData} />
      </div>
    </div>
  );
}
