'use client';

import type { Utility, UtilityDataset, FieldLocationsDataset } from '@/types/utility';
import { formatCustomers } from '@/lib/utilityData';

/**
 * Data-provenance panel for a selected utility: which official EIA entities
 * the client-list name mapped to, dataset vintage, and outbound links - so
 * every interpretive step from Jeff's list to the map is auditable.
 */
export default function UtilityDetailPanel({
  utility,
  dataset,
  fieldData,
}: {
  utility: Utility;
  dataset: UtilityDataset;
  fieldData?: FieldLocationsDataset | null;
}) {
  const valDates = utility.entities.map((e) => e.valDate).filter(Boolean) as string[];
  const newestVal = valDates.sort().at(-1) ?? null;
  const fieldEntry = fieldData?.byUtility[utility.id];

  return (
    <div className="utility-detail">
      {utility.parentCo && (
        <div className="utility-detail-row">
          <span className="utility-detail-label">Parent</span>
          <span>{utility.parentCo}</span>
        </div>
      )}
      <div className="utility-detail-row">
        <span className="utility-detail-label">From client list</span>
        <span>&ldquo;{utility.clientNames.join('&rdquo;, &ldquo;')}&rdquo;</span>
      </div>
      <div className="utility-detail-row">
        <span className="utility-detail-label">EIA legal entit{utility.entities.length === 1 ? 'y' : 'ies'}</span>
        <span>
          {utility.entities.map((e) => (
            <span key={String(e.eiaId)} style={{ display: 'block' }}>
              {e.name} <span style={{ color: '#9CA3AF' }}>(EIA ID {e.eiaId}{e.customers ? `, ${formatCustomers(e.customers)} customers` : ''})</span>
            </span>
          ))}
        </span>
      </div>
      {utility.areaSqMi && (
        <div className="utility-detail-row">
          <span className="utility-detail-label">Territory area</span>
          <span>{utility.areaSqMi.toLocaleString('en-US')} sq mi</span>
        </div>
      )}
      {newestVal && (
        <div className="utility-detail-row">
          <span className="utility-detail-label">Boundary validated</span>
          <span>{newestVal}</span>
        </div>
      )}
      {fieldEntry && (
        <>
          <div className="utility-detail-row">
            <span className="utility-detail-label">Substations</span>
            <span>
              {fieldEntry.substations.length.toLocaleString('en-US')} in territory{' '}
              <span style={{ color: '#9CA3AF' }}>
                (federal HIFLD data, matched by location — may include other owners&apos;
                transmission assets)
              </span>
            </span>
          </div>
          <div className="utility-detail-row">
            <span className="utility-detail-label">Power plants</span>
            <span>
              {fieldEntry.plants.length}{' '}
              <span style={{ color: '#9CA3AF' }}>
                (EIA Form 860, matched by federal utility ID — owned)
              </span>
            </span>
          </div>
        </>
      )}
      {utility.note && <p className="utility-detail-note">{utility.note}</p>}
      <div className="utility-detail-links">
        {utility.website && (
          <a href={utility.website} target="_blank" rel="noopener noreferrer">
            Utility website ↗
          </a>
        )}
        <a href={dataset.source.url} target="_blank" rel="noopener noreferrer">
          EIA source dataset ↗
        </a>
      </div>
    </div>
  );
}
