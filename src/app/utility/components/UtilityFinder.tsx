'use client';

import { useMemo, useRef, useState } from 'react';
import { useUtilityMap } from '@/lib/utilityState';
import { getUtilityColor } from '@/lib/colors';
import { formatCustomers } from '@/lib/utilityData';
import type { UtilityDataset, Utility } from '@/types/utility';

function matches(utility: Utility, q: string): boolean {
  const hay = [utility.name, utility.parentCo, utility.statesListed, ...utility.clientNames, ...utility.states]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

/** Floating search box: find a utility by name/parent/state, select to reveal. */
export default function UtilityFinder({ dataset }: { dataset: UtilityDataset | null }) {
  const { state, dispatch } = useUtilityMap();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const utilities = useMemo(() => dataset?.utilities ?? [], [dataset]);
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? utilities.filter((u) => matches(u, q)) : utilities;
    return list.slice(0, 12);
  }, [utilities, query]);

  const select = (utility: Utility) => {
    dispatch({ type: 'SELECT_UTILITY', payload: utility.id });
    dispatch({ type: 'HOVER_UTILITY', payload: null });
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="map-panel utility-finder">
      <input
        ref={inputRef}
        type="text"
        className="utility-finder-input"
        placeholder={`Find a utility… (${utilities.length})`}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlightIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIdx((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && results[highlightIdx]) {
            select(results[highlightIdx]);
          } else if (e.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      {open && results.length > 0 && (
        <div className="utility-finder-results">
          {results.map((utility) => {
            const i = utilities.indexOf(utility);
            return (
              <div
                key={utility.id}
                className={`utility-finder-row${results[highlightIdx] === utility ? ' highlighted' : ''}${state.selectedUtilityId === utility.id ? ' selected' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault(); // beat the input blur
                  select(utility);
                }}
                onMouseEnter={() => dispatch({ type: 'HOVER_UTILITY', payload: utility.id })}
                onMouseLeave={() => dispatch({ type: 'HOVER_UTILITY', payload: null })}
              >
                <span className="location-color-dot" style={{ backgroundColor: getUtilityColor(i) }} />
                <div style={{ minWidth: 0 }}>
                  <div className="utility-finder-name">{utility.name}</div>
                  <div className="utility-finder-meta">
                    {utility.states.join(', ')} · {formatCustomers(utility.customers)} customers
                    {utility.parentCo ? ` · ${utility.parentCo}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
