'use client';

import { useEffect } from 'react';
import { useUtilityMap } from '@/lib/utilityState';
import { megLocations } from '@/lib/utilityData';
import type { UtilityDataset } from '@/types/utility';

const DISMISS_KEY = 'meg-utility-help-dismissed';

/**
 * Combined "how to use" + "where the data comes from" modal.
 * Auto-opens on first visit (localStorage), afterwards via the header button.
 */
export default function HelpModal({ dataset }: { dataset: UtilityDataset | null }) {
  const { state, dispatch } = useUtilityMap();

  // First-visit auto-open (same pattern as the Zip Builder welcome modal)
  useEffect(() => {
    if (!localStorage.getItem(DISMISS_KEY)) {
      dispatch({ type: 'SET_SHOW_HELP', payload: true });
    }
  }, [dispatch]);

  if (!state.showHelp) return null;

  const close = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    dispatch({ type: 'SET_SHOW_HELP', payload: false });
  };
  const generated = dataset
    ? new Date(dataset.generatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;
  const tsdfCount = megLocations.filter((l) => l.tsdf).length;

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>MEG Utility Territory Map</h2>
          <button className="modal-close" onClick={close}>
            &times;
          </button>
        </div>
        <div className="modal-body" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 6px' }}>How to use</h3>
          <ol style={{ margin: '0 0 14px', paddingLeft: 20, color: '#374151' }}>
            <li>
              <strong>Find a utility</strong> — search in the box at top-left, or hover the map and
              click a territory outline.
            </li>
            <li>
              <strong>See MEG&apos;s coverage</strong> — selecting a utility zooms in and reveals its
              territory, its substations and power plants (green = within reach, gray = beyond), and
              the radius rings around MEG locations.
            </li>
            <li>
              <strong>Adjust the radius</strong> — use the controls at top-right (default 50 miles);
              every number updates as you change it.
            </li>
            <li>
              <strong>Check the sources</strong> — the info card links to the utility&apos;s website
              and the federal dataset behind every shape on this map.
            </li>
          </ol>

          <h3 style={{ fontSize: 14, margin: '0 0 4px' }}>Where the data comes from</h3>
          <p style={{ margin: '0 0 10px', color: '#374151' }}>
            <strong>Service territories</strong> come from the{' '}
            <a href={dataset?.source.url} target="_blank" rel="noopener noreferrer">
              Electric Retail Service Territories
            </a>{' '}
            dataset maintained from federal Form EIA-861 filings — every electric utility is required
            by law to report its service area to the U.S. Energy Information Administration each
            year. These boundaries are drawn from the utilities&apos; own filings, not estimated.
            {generated && <> Snapshot generated {generated}.</>}
          </p>
          <p style={{ margin: '0 0 10px', color: '#374151' }}>
            <strong>Substations</strong> come from the federal HIFLD infrastructure dataset
            (in-service sites only). Federal data deliberately omits ownership, so substations are
            matched to a utility by falling inside its service territory — a small share may belong
            to transmission companies or municipal utilities. <strong>Power plants</strong> come
            from the EIA plant inventory (Form EIA-860) and are matched by each utility&apos;s
            federal ID — true ownership matches.
          </p>
          <p style={{ margin: '0 0 10px', color: '#374151' }}>
            <strong>MEG locations</strong> ({megLocations.length}) are operation centers, affiliated
            companies, and facilities from millerenvironmentalgroup.com, geocoded to street
            addresses. Green circles are branches; blue squares are the {tsdfCount} Transfer,
            Storage &amp; Disposal Facilities (TSDFs).
          </p>
          <p style={{ margin: 0, color: '#374151' }}>
            All distances and coverage percentages are <strong>straight-line</strong> calculations,
            not drive times — suitable for sales and planning conversations, not operational
            dispatch.
          </p>
        </div>
        <div className="modal-footer">
          <button className="header-btn header-btn-primary" style={{ color: 'white' }} onClick={close}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
